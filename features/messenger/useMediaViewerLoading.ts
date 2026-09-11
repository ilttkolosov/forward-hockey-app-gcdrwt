import { useEffect, useRef } from "react";
import type { MessengerMedia } from "./types";

/** One automatic attempt per visit. Never retry in a render loop on network error. */
export function useMediaViewerLoading(
  items: readonly MessengerMedia[],
  index: number | null,
  session: number,
  ensureLocal: (item: MessengerMedia) => Promise<string>,
): void {
  const ensureRef = useRef(ensureLocal);
  ensureRef.current = ensureLocal;
  const visit = useRef<{ key: string; requested: Set<string> }>({
    key: "",
    requested: new Set(),
  });
  const inFlight = useRef(new Map<string, Promise<string>>());
  useEffect(() => {
    const current = index === null ? undefined : items[index];
    const key = current ? `${session}:${index}:${current.id}` : "";
    if (visit.current.key !== key)
      visit.current = { key, requested: new Set() };
    if (!current || index === null) return;
    // Visible item first; only adjacent photos are prefetched, not all videos.
    const candidates = [current, items[index - 1], items[index + 1]];
    for (const item of candidates) {
      if (!item || (item !== current && item.type !== "image")) continue;
      if (visit.current.requested.has(item.id)) continue;
      visit.current.requested.add(item.id);
      if (inFlight.current.has(item.id)) continue;
      const pending = inFlight.current;
      const request = Promise.resolve().then(() => ensureRef.current(item));
      pending.set(item.id, request);
      void request
        .catch(() => undefined)
        .finally(() => {
          if (pending.get(item.id) === request) pending.delete(item.id);
        });
    }
  }, [items, index, session]);
}
