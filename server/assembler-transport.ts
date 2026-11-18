import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AssemblyStep } from "@shared/assembler";

const execFileAsync = promisify(execFile);

/**
 * Cutroom Pro M1 — FilmCraft transport.
 *
 * The assembler plan is transport-agnostic; this layer is the only place
 * that talks to filmcraft-cli. Two transports:
 *
 * - LocalCliTransport: the real filmcraft-cli v0.20.1 binary. Project
 *   creation happens once in begin() (a `run` script with --save-as writes
 *   the .fcproj), then every plan step runs as one
 *   `filmcraft-cli --project <proj> --save exec <id> '<json>'` so each
 *   step's returned ids (imported items, placed clips) feed the next
 *   step. Demo mode (--demo) saves the demo project the same way, so the
 *   demo media items (5, 6, 7, 11) are real clips in a real project.
 * - DryRunTransport: no subprocess, no file written. Every step returns
 *   ok with synthetic ids and dryRun: true. Used when no CLI binary is
 *   found, and in tests.
 *
 * Loudness: filmcraft-cli v0.20.1 has no loudness-meter command. The
 * export step applies loudnessLufs at export; nothing here measures or
 * reports a LUFS value.
 */

export interface StepExecution {
  ok: boolean;
  dryRun: boolean;
  /** Parsed JSON result from the CLI (or the synthetic dry-run result). */
  result?: unknown;
  error?: string;
  note?: string;
}

export interface TransportContext {
  runId: string;
  workDir: string;
  demo: boolean;
  projectPath: string;
  /** Imported item ids, keyed by "shot-<n>" / "music". */
  items: Map<string, number>;
  /** Placed clip ids, keyed by "shot-<n>" / "music". */
  clips: Map<string, number[]>;
  /** Caption track id/name returned by captions.newTrack. */
  captionTrack: string | number | null;
  /** Music clip ids, for ducking. */
  musicClipIds: number[];
  /** Keyframes the CLI's generateDucking actually returned (0 if none). */
  duckingKeyframesReturned: number;
  exportPath: string;
}

export interface FilmCraftTransport {
  readonly kind: "local-cli" | "dry-run";
  readonly label: string;
  version(): Promise<string | null>;
  begin(ctx: TransportContext, sequence: { name: string; width: number; height: number; fps: number }): Promise<StepExecution>;
  executeStep(step: AssemblyStep, ctx: TransportContext): Promise<StepExecution>;
  finish(ctx: TransportContext): Promise<void>;
}

export class DryRunTransport implements FilmCraftTransport {
  readonly kind = "dry-run" as const;
  readonly label = "Dry run — no filmcraft-cli executed";
  private counter = 900000;

  async version(): Promise<string | null> {
    return null;
  }

  async begin(ctx: TransportContext): Promise<StepExecution> {
    return { ok: true, dryRun: true, result: { project: ctx.projectPath, demo: ctx.demo }, note: "Dry run: no project file created." };
  }

  async executeStep(step: AssemblyStep, ctx: TransportContext): Promise<StepExecution> {
    const id = this.counter;
    this.counter += 1;
    // Simulate what the real CLI returns, so the runner's bookkeeping
    // (placed-clip counts, item resolution) behaves the same in dry runs.
    if (step.command === "assembler.import-media") {
      const ref = typeof step.params.shotIndex === "number" && step.params.shotIndex >= 0 ? `shot-${step.params.shotIndex}` : "music";
      ctx.items.set(ref, id);
    }
    if (step.command === "assembler.place-clip" || step.command === "assembler.place-music") {
      const ref = step.command === "assembler.place-music" ? "music" : `shot-${step.params.shotIndex as number}`;
      ctx.clips.set(ref, [id]);
      if (step.command === "assembler.place-music") ctx.musicClipIds = [id];
    }
    return {
      ok: true,
      dryRun: true,
      result: { dryRun: true, step: step.seq, command: step.command, syntheticId: id },
      note: "Dry run: planned command recorded, not executed.",
    };
  }

  async finish(): Promise<void> {
    return undefined;
  }
}

interface CliLineResult {
  id?: string;
  line?: number;
  ok?: boolean;
  result?: unknown;
  error?: string;
}

function parseCliJson(stdout: string): unknown {
  const text = stdout.trim();
  if (!text) return null;
  // `exec` prints one JSON value (often pretty-printed over many lines).
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class LocalCliTransport implements FilmCraftTransport {
  readonly kind = "local-cli" as const;
  readonly label: string;
  private readonly cliPath: string;
  private readonly execTimeoutMs: number;
  private readonly exportTimeoutMs: number;

  constructor(opts: { cliPath: string; execTimeoutMs?: number; exportTimeoutMs?: number }) {
    this.cliPath = opts.cliPath;
    this.label = `filmcraft-cli at ${opts.cliPath}`;
    this.execTimeoutMs = opts.execTimeoutMs ?? 120_000;
    this.exportTimeoutMs = opts.exportTimeoutMs ?? 600_000;
  }

  async version(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(this.cliPath, ["--version"], { timeout: 30_000 });
      const match = /filmcraft-cli\s+(\S+)/.exec(stdout);
      return match ? match[1] : stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async runCli(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(this.cliPath, args, {
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      });
      return { stdout, stderr };
    } catch (error: any) {
      const stdout = typeof error?.stdout === "string" ? error.stdout : "";
      const stderr = typeof error?.stderr === "string" ? error.stderr : "";
      throw new Error(`filmcraft-cli ${args.slice(0, 2).join(" ")} failed: ${(error?.message || error || "").toString().split("\n")[0]}${stderr ? ` — ${stderr.slice(0, 300)}` : ""}${stdout ? ` — ${stdout.slice(0, 300)}` : ""}`);
    }
  }

  /** Create the project file (+ sequence) once, so later steps can chain with --project/--save. */
  async begin(ctx: TransportContext, sequence: { name: string; width: number; height: number; fps: number }): Promise<StepExecution> {
    await mkdir(ctx.workDir, { recursive: true });
    const scriptPath = path.join(ctx.workDir, "create-project.jsonl");
    const lines = ctx.demo
      ? [{ id: "file.newSequence", params: { name: sequence.name, width: sequence.width, height: sequence.height, fps: sequence.fps, video: 3, audio: 3 } }]
      : [
        { id: "file.newProject", params: { name: sequence.name } },
        { id: "file.newSequence", params: { name: sequence.name, width: sequence.width, height: sequence.height, fps: sequence.fps, video: 3, audio: 3 } },
      ];
    await writeFile(scriptPath, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
    const args = ctx.demo ? ["--demo", "--save-as", ctx.projectPath, "run", scriptPath] : ["--save-as", ctx.projectPath, "run", scriptPath];
    const { stdout } = await this.runCli(args, this.execTimeoutMs);
    const results = stdout.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line) as CliLineResult;
      } catch {
        return { ok: false, error: line } as CliLineResult;
      }
    });
    const failed = results.find((r) => r.ok === false);
    if (failed) return { ok: false, dryRun: false, result: results, error: failed.error || "Project creation failed." };
    return { ok: true, dryRun: false, result: results, note: ctx.demo ? "Demo project saved to .fcproj; sequence created." : "New project saved to .fcproj; sequence created." };
  }

  private async execCommand(ctx: TransportContext, commandId: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    const { stdout } = await this.runCli(
      ["--project", ctx.projectPath, "--save", "exec", commandId, JSON.stringify(params)],
      timeoutMs ?? this.execTimeoutMs,
    );
    const parsed = parseCliJson(stdout);
    if (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)) {
      throw new Error(String((parsed as Record<string, unknown>).error));
    }
    return parsed;
  }

  /** Resolve "$item:shot-N" / "$item:music" / "$exportPath" markers from the run context. */
  private resolveParams(params: Record<string, unknown>, ctx: TransportContext): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.startsWith("$item:")) {
        const ref = value.slice("$item:".length);
        const item = ctx.items.get(ref);
        if (item === undefined) throw new Error(`No imported item for ${ref} — the import step did not run or failed.`);
        out[key] = item;
      } else if (value === "$exportPath") {
        out[key] = ctx.exportPath;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  async executeStep(step: AssemblyStep, ctx: TransportContext): Promise<StepExecution> {
    try {
      switch (step.command) {
        case "assembler.new-sequence":
          return { ok: true, dryRun: false, result: { sequence: "created in begin()" }, note: "Sequence was created when the project file was written (begin). Not re-created." };
        case "assembler.import-media": {
          const params = this.resolveParams(step.filmcraftParams || {}, ctx);
          const result = (await this.execCommand(ctx, "file.import", params)) as { items?: number[] };
          const items = Array.isArray(result?.items) ? result.items : [];
          if (items.length === 0) return { ok: false, dryRun: false, result, error: "file.import returned no items." };
          const ref = typeof step.params.shotIndex === "number" && step.params.shotIndex >= 0 ? `shot-${step.params.shotIndex}` : "music";
          ctx.items.set(ref, items[0]);
          return { ok: true, dryRun: false, result };
        }
        case "assembler.place-clip":
        case "assembler.place-music": {
          const params = this.resolveParams(step.filmcraftParams || {}, ctx);
          const result = (await this.execCommand(ctx, "timeline.place", params)) as { clips?: number[] };
          const clips = Array.isArray(result?.clips) ? result.clips : [];
          if (clips.length === 0) return { ok: false, dryRun: false, result, error: "timeline.place returned no clips." };
          const ref = step.command === "assembler.place-music"
            ? "music"
            : `shot-${step.params.shotIndex as number}`;
          ctx.clips.set(ref, clips);
          if (step.command === "assembler.place-music") ctx.musicClipIds = clips;
          return { ok: true, dryRun: false, result };
        }
        case "assembler.duck-music": {
          if (ctx.musicClipIds.length === 0) {
            return { ok: false, dryRun: false, error: "No music clip placed — cannot duck." };
          }
          const clips = ctx.musicClipIds;
          await this.execCommand(ctx, "essentialSound.setType", { clips, type: "music" });
          await this.execCommand(ctx, "essentialSound.set", { clips, key: "ducking.reduceDb", value: -12 });
          const ducking = (await this.execCommand(ctx, "essentialSound.generateDucking", { clips })) as { clips?: Array<{ keyframes?: unknown[] }> };
          const returned = Array.isArray(ducking?.clips) && ducking.clips[0] && Array.isArray((ducking.clips[0] as { keyframes?: unknown[] }).keyframes)
            ? ((ducking.clips[0] as { keyframes?: unknown[] }).keyframes as unknown[]).length
            : 0;
          ctx.duckingKeyframesReturned = returned;
          return {
            ok: true,
            dryRun: false,
            result: ducking,
            note: `Ducking set to -12 dB on ${clips.length} music clip(s); generateDucking returned ${returned} keyframe(s). (With no separate dialogue clip on the timeline, FilmCraft generates no ducking keyframes — the -12 dB reduction is set, the triggers come from narration audio when present.)`,
          };
        }
        case "assembler.add-captions": {
          const cues = Array.isArray(step.params.cues) ? step.params.cues as Array<{ startSeconds: number; endSeconds: number; text: string }> : [];
          if (cues.length === 0) return { ok: true, dryRun: false, result: { cues: 0 }, note: "No caption cues — nothing to add." };
          const trackResult = (await this.execCommand(ctx, "captions.newTrack", { format: "Subtitle", name: "Captions", language: "en" })) as { track?: string | number };
          const track = trackResult?.track ?? "C1";
          ctx.captionTrack = track;
          const added: unknown[] = [];
          for (const cue of cues) {
            const result = await this.execCommand(ctx, "captions.add", {
              track,
              text: cue.text,
              seconds: cue.startSeconds,
              durationSeconds: Math.max(0.1, cue.endSeconds - cue.startSeconds),
            });
            added.push(result);
          }
          return { ok: true, dryRun: false, result: { track, added } };
        }
        case "assembler.check-loudness":
          return { ok: true, dryRun: false, result: { measured: false }, note: "No loudness-meter command in filmcraft-cli v0.20.1; loudness is applied at export via loudnessLufs and is not measured." };
        case "assembler.export": {
          const params = this.resolveParams(step.filmcraftParams || {}, ctx);
          const result = await this.execCommand(ctx, "file.exportMedia", params, this.exportTimeoutMs);
          return { ok: true, dryRun: false, result };
        }
        default:
          return { ok: false, dryRun: false, error: `Transport does not know assembler step ${step.command}.` };
      }
    } catch (error: any) {
      return { ok: false, dryRun: false, error: error?.message || String(error) };
    }
  }

  async finish(): Promise<void> {
    return undefined;
  }
}

/** Where the CLI binary lives, if anywhere. Checked in this order. */
export async function findCliPath(): Promise<string | null> {
  const fromEnv = process.env.FILMCRAFT_CLI_PATH?.trim();
  if (fromEnv) {
    try {
      await access(fromEnv);
      return fromEnv;
    } catch {
      return null;
    }
  }
  const candidates = [
    path.join(process.cwd(), "tools", "filmcraft-cli"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "..", "tools", "filmcraft-cli"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

/** The transport for a run: the real CLI when a binary is found, otherwise an explicit dry run. */
export async function resolveTransport(): Promise<{ transport: FilmCraftTransport; cliPath: string | null; version: string | null; dryRunReason: string | null }> {
  const cliPath = await findCliPath();
  if (!cliPath) {
    return {
      transport: new DryRunTransport(),
      cliPath: null,
      version: null,
      dryRunReason: "No filmcraft-cli found (checked FILMCRAFT_CLI_PATH and tools/filmcraft-cli). Dry run: the plan, registry wiring, captions, ducking math, and receipt are real; no render happened.",
    };
  }
  const transport = new LocalCliTransport({ cliPath });
  const version = await transport.version();
  return { transport, cliPath, version, dryRunReason: null };
}
