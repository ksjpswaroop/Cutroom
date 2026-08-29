/**
 * Cinematic Shorts (3.1): Board stills → FFmpeg concat + shared voice.
 * Veo-class clip generation is quoted when enabled; stills are used until a generator is wired.
 * Never uploads to YouTube.
 */
import { formatChapterTimestamp } from "@shared/pace-chapters";
import type { ProductionBoardOutput } from "@shared/board-contracts";

export const CINEMATIC_MAX_SHOTS = 5;

export function cinematicChaptersFromBoard(
  board: ProductionBoardOutput | undefined,
  maxShots = CINEMATIC_MAX_SHOTS,
): Array<{ timestamp: string; title: string }> | undefined {
  const shots = (board?.shots || []).slice(0, maxShots);
  if (shots.length === 0) return undefined;
  let elapsed = 0;
  return shots.map((shot) => {
    const durationSec = Math.min(12, Math.max(2, shot.durationHintSec || 4));
    const chapter = {
      timestamp: formatChapterTimestamp(elapsed),
      title: shot.shot.slice(0, 80),
    };
    elapsed += durationSec;
    return chapter;
  });
}
