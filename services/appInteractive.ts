import { InteractionManager } from "react-native";

let interactive = false;
let resolveInteractive: (() => void) | null = null;
let interactivePromise = new Promise<void>((resolve) => {
  resolveInteractive = resolve;
});

/**
 * Resolves after the first application surface has been committed and native
 * navigation animations are allowed to finish. Optional network/cache work
 * should wait for this signal instead of competing with the cold-start UI.
 */
export function markAppInteractive(): void {
  if (interactive) return;
  InteractionManager.runAfterInteractions(() => {
    if (interactive) return;
    interactive = true;
    resolveInteractive?.();
    resolveInteractive = null;
  });
}

export function waitForAppInteractive(): Promise<void> {
  return interactive ? Promise.resolve() : interactivePromise;
}

export function isAppInteractive(): boolean {
  return interactive;
}

/** Test-only reset for isolated module tests and Fast Refresh. */
export function resetAppInteractiveForTests(): void {
  interactive = false;
  interactivePromise = new Promise<void>((resolve) => {
    resolveInteractive = resolve;
  });
}
