import type {
  AudienceAvatar,
  AudiencePersona,
  ChannelIntelligence,
} from "@shared/creator-modules";

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
