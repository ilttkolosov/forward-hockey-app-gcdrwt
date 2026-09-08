/** Wait for rendered/viewable content, not just a scrollToIndex request. */
export async function waitForMessengerFocus({
  isCurrent,
  isVisible,
  timeoutMs = 8000,
  intervalMs = 60,
  stableMs = 120,
}: {
  isCurrent: () => boolean;
  isVisible: () => boolean;
  timeoutMs?: number;
  intervalMs?: number;
  stableMs?: number;
}): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let visibleSince: number | null = null;
  while (isCurrent() && Date.now() <= deadline) {
    if (isVisible()) {
      visibleSince ??= Date.now();
      if (Date.now() - visibleSince >= stableMs) return true;
    } else visibleSince = null;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
