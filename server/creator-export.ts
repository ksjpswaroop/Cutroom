import type {
  AudienceAvatar,
  AudiencePersona,
  ChannelIntelligence,
} from "@shared/creator-modules";
import type { AiTextProvider } from "./ai";
import { generateAvatarMarkdown, generateChannelIntelligence } from "./creator-ai";
import { channelMemory, listChannels, listPersonas } from "./creator-store";
import { readPreferences } from "./preferences";

/**
 * L-808: build the creator-suite artifacts for a project export pack. Each entry
 * is a path → file-contents pair the export writer drops under `creator/`. Every
 * artifact carries its `evidenceClass` (always `inferred` — these are
 * synthesized, never observed snapshot claims). Inclusion is opt-in: the caller
 * passes only what the user chose to export, and an empty input yields no files,
 * so the export pack is unchanged unless creator export is turned on.
 */
export interface CreatorExportInput {
  channelIntelligence?: ChannelIntelligence;
  persona?: AudiencePersona;
  avatar?: AudienceAvatar;
}

export function buildCreatorArtifacts(input: CreatorExportInput): Record<string, string> {
  const files: Record<string, string> = {};
  if (input.channelIntelligence) {
    files["creator/channel-intelligence.json"] = `${JSON.stringify(input.channelIntelligence, null, 2)}\n`;
  }
  if (input.persona) {
    files["creator/persona.json"] = `${JSON.stringify(input.persona, null, 2)}\n`;
  }
  if (input.avatar) {
    files["creator/avatar.md"] = input.avatar.markdown.endsWith("\n")
      ? input.avatar.markdown
      : `${input.avatar.markdown}\n`;
  }
  return files;
}

export interface CollectCreatorExportOptions {
  /** Data root for the preferences + creator store (test isolation via mkdtemp). */
  root?: string;
  /** Injected text provider for synthesis; omitted → deterministic fallback (no live call). */
  provider?: AiTextProvider;
}

/**
 * L-808: assemble the creator-suite export files for a channel, gated by the
 * `creatorExportEnabled` Settings preference. Returns `{}` (nothing to export)
 * when the toggle is off, no channel is in context, or the channel is unknown —
 * so the export pack is unchanged by default. Channel intelligence and the
 * avatar are synthesized on demand (deterministic unless a provider is
 * configured); the persona is the channel's most recent stored one. Every
 * artifact stays `inferred` because `buildCreatorArtifacts` is unchanged.
 */
export async function collectCreatorExport(
  channelId: string | undefined,
  opts: CollectCreatorExportOptions = {},
): Promise<Record<string, string>> {
  const prefs = await readPreferences(opts.root);
  if (!prefs.creatorExportEnabled || !channelId) return {};

  const channel = (await listChannels(opts.root)).find((c) => c.id === channelId);
  if (!channel) return {};

  const memory = await channelMemory(channelId, opts.root);
  const channelIntelligence = await generateChannelIntelligence(channel.niche, [], {
    memory,
    provider: opts.provider,
  });
  const persona = (await listPersonas(channelId, opts.root))[0];
  const avatar = await generateAvatarMarkdown(channel.name, channel.niche, { provider: opts.provider });

  return buildCreatorArtifacts({ channelIntelligence, persona, avatar });
}
