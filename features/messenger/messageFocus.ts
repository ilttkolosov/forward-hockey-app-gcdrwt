export interface MessengerFocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Structural type: only native host views expose this measurement method. */
export interface MessengerFocusView {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void;
}

export interface MessengerFocusMeasurement {
  visible: boolean;
  relativeTop: number;
  targetHeight: number;
  viewportHeight: number;
}

export function messengerFocusGeometry(
  viewport: MessengerFocusRect,
  target: MessengerFocusRect,
): MessengerFocusMeasurement | null {
  if (
    ![...Object.values(viewport), ...Object.values(target)].every(
      Number.isFinite,
    ) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    target.width <= 0 ||
    target.height <= 0
  )
    return null;
  const relativeTop = target.y - viewport.y;
  const overlap = Math.max(
    0,
    Math.min(target.y + target.height, viewport.y + viewport.height) -
      Math.max(target.y, viewport.y),
  );
  const horizontalOverlap = Math.max(
    0,
    Math.min(target.x + target.width, viewport.x + viewport.width) -
      Math.max(target.x, viewport.x),
  );
  // Same intent as the navigation-only viewability rule: the entire short row,
  // or half a viewport of a tall row. Never accept a one-pixel intersection.
  const visible =
    horizontalOverlap >= Math.min(target.width, viewport.width) / 2 &&
    ((relativeTop >= -2 &&
      relativeTop + target.height <= viewport.height + 2) ||
      overlap >= viewport.height / 2);
  return {
    visible,
    relativeTop,
    targetHeight: target.height,
    viewportHeight: viewport.height,
  };
}

/** Missing Android callbacks must not turn a bounded focus wait into a hanging task. */
export function measureMessengerFocus(
  viewport: MessengerFocusView | null,
  target: MessengerFocusView | null,
  isCurrent: () => boolean,
  timeoutMs = 240,
): Promise<MessengerFocusMeasurement | null> {
  if (!viewport || !target || !isCurrent()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let viewportRect: MessengerFocusRect | null = null;
    let targetRect: MessengerFocusRect | null = null;
    const finish = (result: MessengerFocusMeasurement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(isCurrent() ? result : null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const measured = () => {
      if (viewportRect && targetRect)
        finish(messengerFocusGeometry(viewportRect, targetRect));
    };
    try {
      viewport.measureInWindow((x, y, width, height) => {
        viewportRect = { x, y, width, height };
        measured();
      });
      target.measureInWindow((x, y, width, height) => {
        targetRect = { x, y, width, height };
        measured();
      });
    } catch {
      finish(null);
    }
  });
}

/** Confirm visibility, retrying a render-window miss without relying on a new scroll event. */
export async function waitForMessengerFocus({
  isCurrent,
  isVisible,
  onRetry,
  timeoutMs = 8000,
  intervalMs = 60,
  stableMs = 120,
  retryMs = 240,
}: {
  isCurrent: () => boolean;
  isVisible: () => boolean | Promise<boolean>;
  onRetry?: () => void;
  timeoutMs?: number;
  intervalMs?: number;
  stableMs?: number;
  retryMs?: number;
}): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let visibleSince: number | null = null;
  let lastRetry = -Infinity;
  while (isCurrent() && Date.now() <= deadline) {
    const visible = await isVisible();
    // Measurement crosses the native bridge: room change/drag can happen while awaiting it.
    if (!isCurrent() || Date.now() > deadline) return false;
    if (visible) {
      visibleSince ??= Date.now();
      if (Date.now() - visibleSince >= stableMs) return true;
    } else {
      visibleSince = null;
      if (onRetry && Date.now() - lastRetry >= retryMs) {
        lastRetry = Date.now();
        onRetry();
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
