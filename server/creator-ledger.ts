import type { EvidenceClass } from "@shared/evidence-contracts";
import type {
  AudienceAvatar,
  AudiencePersona,
  ChannelIntelligence,
} from "@shared/creator-modules";

/**
 * L-807: one evidence ledger across the creator modules. Every finding the
 * creator suite produces is synthesized strategy, so every ledger entry must be
 * `inferred` — the same honest class the Insights Evidence ledger uses for
 * non-observed claims. This aggregator is defense in depth: the contracts
 * already reject a non-`inferred` label at the source, and this refuses to
 * surface any entry that reaches it without one, so a mislabeled or hand-built
 * object can never appear in the ledger as fact.
 */
export interface CreatorLedgerEntry {
  module: "channel-intelligence" | "persona" | "avatar";
  title: string;
  evidenceClass: EvidenceClass;
  provider: string;
}

export interface CreatorLedgerInput {
  channelIntelligence?: ChannelIntelligence;
  personas?: AudiencePersona[];
  avatar?: AudienceAvatar;
}

function entry(
  module: CreatorLedgerEntry["module"],
  title: string,
  evidenceClass: unknown,
  provider: unknown,
): CreatorLedgerEntry {
  if (evidenceClass !== "inferred") {
    throw new Error(
      `Creator ledger entry for ${module} must be labeled "inferred" (synthesized, not observed); got ${JSON.stringify(evidenceClass)}.`,
    );
  }
  return {
    module,
    title,
    evidenceClass: "inferred",
    provider: typeof provider === "string" && provider ? provider : "unknown",
  };
}

export function buildCreatorLedger(input: CreatorLedgerInput): CreatorLedgerEntry[] {
  const entries: CreatorLedgerEntry[] = [];
  if (input.channelIntelligence) {
    entries.push(
      entry(
        "channel-intelligence",
        `Channel strategy — ${input.channelIntelligence.niche}`,
        input.channelIntelligence.evidenceClass,
        input.channelIntelligence.provider,
      ),
    );
  }
  for (const persona of input.personas ?? []) {
    entries.push(entry("persona", `Persona — ${persona.name}`, persona.evidenceClass, persona.provider));
  }
  if (input.avatar) {
    entries.push(entry("avatar", "Audience avatar", input.avatar.evidenceClass, input.avatar.provider));
  }
  return entries;
}
