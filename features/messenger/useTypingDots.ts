import { useEffect, useState } from "react";

// The short, deliberately uneven cadence feels closer to a person typing than
// a perfectly linear loader: one dot, two, three, a pause, then start again.
const PHASE_DELAYS_MS = [480, 330, 410, 650] as const;

export function useTypingDots(active: boolean): string {
  const [phase, setPhase] = useState(active ? 1 : 0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }

    let cancelled = false;
    let current = 1;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setPhase(current);

    const advance = () => {
      if (cancelled) return;
      const delay = PHASE_DELAYS_MS[current];
      timer = setTimeout(() => {
        current = current === 3 ? 0 : current + 1;
        setPhase(current);
        advance();
      }, delay);
    };

    advance();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active]);

  return ".".repeat(phase);
}
