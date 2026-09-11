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
    const currentVisit = visit.current;
    let cancelled = false;
    // Visible item first; only adjacent photos are prefetched, not all videos.
    const candidates = [current, items[index - 1], items[index + 1]];
    void Promise.resolve().then(() => {
      if (cancelled || visit.current !== currentVisit) return;
      for (const item of candidates) {
        if (!item || (item !== current && item.type !== "image")) continue;
        if (currentVisit.requested.has(item.id)) continue;
        // Mark at execution, not scheduling: StrictMode's cancelled first effect
        // must not consume the automatic attempt of its replacement effect.
        currentVisit.requested.add(item.id);
        const pending = inFlight.current;
        if (pending.has(item.id)) continue;
        let request: Promise<string>;
        try {
          request = Promise.resolve(ensureRef.current(item));
        } catch (error) {
          request = Promise.reject(error);
        }
        pending.set(item.id, request);
        void request
          .catch(() => undefined)
          .finally(() => {
            if (pending.get(item.id) === request) pending.delete(item.id);
          });
      }
    });
    return () => {
      // Let an already running cache request finish, but never start one for a
      // modal/page that has already closed or changed before this effect ran.
      cancelled = true;
    };
  }, [items, index, session]);
}
