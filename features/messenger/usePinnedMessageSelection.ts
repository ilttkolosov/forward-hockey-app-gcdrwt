import { useCallback, useEffect, useRef, useState } from "react";
import { currentMessengerPinId, nextMessengerPinId, type MessengerPin } from "./pins";

export function usePinnedMessageSelection(items: readonly MessengerPin[], key: string, active: boolean) {
  const revision = useRef(0);
  const current = useRef({ key, items });
  current.current = { key, items };
  const [selection, setSelection] = useState<{ key: string; selected: string | null; visited: string | null }>({ key: "", selected: null, visited: null });
  const resetToLatest = useCallback(() => {
    revision.current += 1;
    setSelection((previous) => previous.key === key && previous.selected === null && previous.visited === null ? previous : { key, selected: null, visited: null });
  }, [key]);
  // Refocusing the same mounted screen must reset as well as entering a new room.
  useEffect(() => { if (active) resetToLatest(); }, [active, resetToLatest]);
  const select = useCallback((id: string) => { revision.current += 1; setSelection({ key, selected: id, visited: null }); }, [key]);
  const visit = useCallback((id: string, expectedRevision = revision.current) => {
    if (current.current.key !== key || revision.current !== expectedRevision || !current.current.items.some((pin) => pin.message.id === id)) return;
    revision.current += 1;
    setSelection({ key, selected: nextMessengerPinId(current.current.items, id), visited: id });
  }, [key]);
  const getRevision = useCallback(() => revision.current, []);
  return {
    currentId: currentMessengerPinId(items, selection.key === key ? selection.selected : null),
    visitedId: selection.key === key && items.some((item) => item.message.id === selection.visited) ? selection.visited : null,
    resetToLatest, select, visit, getRevision,
  };
}
