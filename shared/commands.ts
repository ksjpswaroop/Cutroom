import { z } from "zod";

/**
 * Command registry v1 (Cutroom Pro M0).
 *
 * One registry, typed parameters, an enabled-state check, and an append-only
 * audit log entry per dispatch. This is the pattern FilmCraft uses (one
 * command registry dispatched by UI / CLI / JSON / MCP); M0 wires only the
 * Pro actions through it. No agent, UI handler, or route touches a Pro
 * action except by dispatching its command id here.
 *
 * The registry is deliberately pure: no I/O, no imports from server/ or
 * client/. Callers register handlers that do the real work (a preferences
 * write, a fetch, a navigation) and the registry validates params, checks
 * `enabled`, runs the handler, and records the audit entry.
 */

export interface CommandAuditEntry {
  /** 1-based sequence number within this registry instance. */
  seq: number;
  command: string;
  /** JSON-safe copy of the validated params. */
  params: unknown;
  timestamp: string;
  ok: boolean;
  /** Present only when the dispatch failed (validation, disabled, handler). */
  error?: string;
}

export interface CommandDefinition<P = unknown, R = unknown> {
  /** Human-readable description, shown in docs / audit tooling. */
  description: string;
  /** Zod schema the params must satisfy before the handler runs. */
  paramsSchema: z.ZodType<P>;
  /**
   * When present and returning false, dispatch fails without running the
   * handler. Used for gates such as "Cutroom Pro is off".
   */
  enabled?: (params: P) => boolean | Promise<boolean>;
  handler: (params: P) => R | Promise<R>;
}

function toJsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return String(value);
  }
}

export class CommandRegistry {
  private readonly definitions = new Map<string, CommandDefinition<unknown, unknown>>();
  private readonly audit: CommandAuditEntry[] = [];
  private seq = 0;

  register<P, R>(id: string, definition: CommandDefinition<P, R>): void {
    if (!id.trim()) throw new Error("Command id must not be empty.");
    if (this.definitions.has(id)) throw new Error(`Command already registered: ${id}`);
    this.definitions.set(id, definition as CommandDefinition<unknown, unknown>);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  ids(): string[] {
    return [...this.definitions.keys()].sort();
  }

  /** Append-only audit log, oldest first. The array is a copy; entries are not mutable via it. */
  auditLog(): CommandAuditEntry[] {
    return this.audit.map((entry) => ({ ...entry }));
  }

  async dispatch<R>(id: string, rawParams: unknown): Promise<R> {
    const definition = this.definitions.get(id);
    if (!definition) {
      return this.record<R>(id, rawParams, false, `Unknown command: ${id}`, () => {
        throw new Error(`Unknown command: ${id}`);
      });
    }
    const parsed = definition.paramsSchema.safeParse(rawParams);
    if (!parsed.success) {
      const message = `Invalid params for ${id}: ${parsed.error.message}`;
      return this.record<R>(id, rawParams, false, message, () => {
        throw new Error(message);
      });
    }
    const params = parsed.data;
    if (definition.enabled) {
      let allowed: boolean;
      try {
        allowed = await definition.enabled(params);
      } catch (error: any) {
        const message = `Enabled check failed for ${id}: ${error?.message || error}`;
        return this.record<R>(id, params, false, message, () => {
          throw new Error(message);
        });
      }
      if (!allowed) {
        const message = `Command disabled: ${id}`;
        return this.record<R>(id, params, false, message, () => {
          throw new Error(message);
        });
      }
    }
    try {
      const result = (await definition.handler(params)) as R;
      this.append(id, params, true);
      return result;
    } catch (error: any) {
      const message = error?.message || String(error);
      this.append(id, params, false, message);
      throw error;
    }
  }

  private record<R>(
    id: string,
    params: unknown,
    ok: boolean,
    error: string,
    thrower: () => never,
  ): R {
    this.append(id, params, ok, error);
    return thrower();
  }

  private append(id: string, params: unknown, ok: boolean, error?: string): void {
    this.seq += 1;
    this.audit.push({
      seq: this.seq,
      command: id,
      params: toJsonSafe(params),
      timestamp: new Date().toISOString(),
      ok,
      ...(error ? { error } : {}),
    });
  }
}

/** Create a fresh registry (tests and per-layer instances use this). */
export function createCommandRegistry(): CommandRegistry {
  return new CommandRegistry();
}
