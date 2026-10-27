"use client";

import { useEffect } from "react";
import { logout } from "@/domains/admin/auth-actions";

const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Logs out after `minutes` without interaction. The server enforces the same
 * timeout on the session token; this just returns a shared device to the PIN
 * pad without waiting for the next click.
 */
export function IdleLogout({ minutes }: { minutes: number }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void logout(), minutes * 60_000);
    };
    reset();
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return null;
}
