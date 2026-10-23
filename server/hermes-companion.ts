/**
 * Optional Hermes companion (L-508).
 *
 * A weekly local digest only. Default off. Cutroom never spawns Hermes,
 * and the digest is not product truth — Research must be re-run first.
 */

export interface HermesDigestInput {
  enabled: boolean;
  topic: string;
  snapshotId: string;
  observedSignals: readonly string[];
  generatedAt: string;
}

export interface HermesCronDigest {
  kind: "hermes-companion-cron-digest";
  productTruth: false;
  spawnedHermes: false;
  topic: string;
  snapshotId: string;
  lines: string[];
  generatedAt: string;
}

/** No process, argv, or cwd. Hermes stays outside the production sidecar. */
export function hermesProcessSpec(): null {
  return null;
}

/** Monday 09:00 local, only when the companion flag is on. */
export function hermesCronSchedule(enabled: boolean): "0 9 * * 1" | null {
  return enabled ? "0 9 * * 1" : null;
}

export function buildHermesCronDigest(input: HermesDigestInput): HermesCronDigest | null {
  if (!input.enabled) return null;
  if (hermesProcessSpec() !== null) {
    throw new Error("Hermes companion must not spawn a process.");
  }
  const signals = input.observedSignals
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    kind: "hermes-companion-cron-digest",
    productTruth: false,
    spawnedHermes: false,
    topic: input.topic.trim(),
    snapshotId: input.snapshotId,
    generatedAt: input.generatedAt,
    lines: [
      `Weekly companion digest for ${input.topic.trim()}.`,
      `Snapshot ${input.snapshotId}.`,
      ...signals.map((line) => `Observed signal: ${line}`),
      "Not product truth. Re-run Research before using this as evidence.",
    ],
  };
}
