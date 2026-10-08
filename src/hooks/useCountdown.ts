"use client";

/**
 * Live countdown to a deadline.
 *
 * Returns `null` until the component has mounted on the client so that the
 * server-rendered markup and the first client render agree (the current time is
 * not available during SSR).
 */

import { useEffect, useMemo, useState } from "react";

import { toCountdown, type Countdown } from "@/lib/vault/calculations";

export interface UseCountdownOptions {
  /** Tick interval in milliseconds. Defaults to 1000. */
  intervalMs?: number;
  /** Stop ticking once expired. Defaults to true. */
  stopWhenExpired?: boolean;
}

export function useCountdown(
  target: string | Date | null | undefined,
  options: UseCountdownOptions = {},
): Countdown | null {
  const { intervalMs = 1000, stopWhenExpired = true } = options;
  const [nowMs, setNowMs] = useState<number | null>(null);

  const targetMs = useMemo(() => {
    if (!target) return null;
    const value = target instanceof Date ? target.getTime() : new Date(target).getTime();
    return Number.isNaN(value) ? null : value;
  }, [target]);

  useEffect(() => {
    if (targetMs === null) {
      setNowMs(null);
      return;
    }
    setNowMs(Date.now());
    if (stopWhenExpired && Date.now() >= targetMs) return;

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      if (stopWhenExpired && Date.now() >= targetMs) {
        window.clearInterval(timer);
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, stopWhenExpired, targetMs]);

  return useMemo(() => {
    if (targetMs === null || nowMs === null) return null;
    return toCountdown(targetMs, nowMs);
  }, [nowMs, targetMs]);
}

/** Compact `2d 4h 12m` style label. */
export function formatCountdown(countdown: Countdown | null): string {
  if (!countdown) return "—";
  if (countdown.expired) return "Deadline passed";
  if (countdown.days > 0) return `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`;
  if (countdown.hours > 0) return `${countdown.hours}h ${countdown.minutes}m`;
  if (countdown.minutes > 0) return `${countdown.minutes}m ${countdown.seconds}s`;
  return `${countdown.seconds}s`;
}
