/** Whether the first-run banner should ask for keys or a library folder (L-204). */

export interface FirstRunInput {
  youtube: boolean;
  gemini: boolean;
  libraryPath: string | null;
  isDesktop: boolean;
  dismissedKeys: boolean;
  dismissedLibrary: boolean;
}

export function firstRunNeeds(input: FirstRunInput): { keys: boolean; library: boolean } {
  return {
    keys: !input.dismissedKeys && !(input.youtube && input.gemini),
    library: !input.dismissedLibrary && input.isDesktop && !input.libraryPath,
  };
}
