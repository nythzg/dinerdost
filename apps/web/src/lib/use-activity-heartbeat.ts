"use client";
import { useEffect, useRef } from "react";

// Refresh an active visit only for real input, never for polling or mere tab visibility.
export function useActivityHeartbeat(
  enabled: boolean,
  send: () => Promise<unknown>,
  onFailure?: () => void,
) {
  const lastSent = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    lastSent.current = 0;
    const touch = (event: Event) => {
      if (
        !event.isTrusted ||
        document.hidden ||
        Date.now() - lastSent.current < 60000
      )
        return;
      lastSent.current = Date.now();
      void send().catch(() => onFailure?.());
    };
    document.addEventListener("pointerdown", touch, { passive: true });
    document.addEventListener("keydown", touch);
    document.addEventListener("scroll", touch, {
      passive: true,
      capture: true,
    });
    return () => {
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("keydown", touch);
      document.removeEventListener("scroll", touch, true);
    };
  }, [enabled, send, onFailure]);
}
