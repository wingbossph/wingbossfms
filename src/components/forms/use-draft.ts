"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps an unsaved form in localStorage so a refresh or dropped connection
 * doesn't lose it. Offers to restore only when the local copy is newer than
 * the server's version.
 */
export function useDraft<T>(key: string, value: T, serverUpdatedAt: string, enabled = true) {
  const [restorable, setRestorable] = useState<T | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw) as { savedAt: string; value: T };
      if (saved.savedAt > serverUpdatedAt) setRestorable(saved.value);
      else localStorage.removeItem(key);
    } catch {
      // Storage unavailable (private mode): drafts just aren't kept.
    }
  }, [key, serverUpdatedAt, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), value }));
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(t);
  }, [key, value, enabled]);

  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setRestorable(null);
  };

  return { restorable, dismiss: clear, clear };
}
