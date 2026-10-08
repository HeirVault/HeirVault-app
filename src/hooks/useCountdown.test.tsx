import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Countdown } from "@/lib/vault/calculations";

import { formatCountdown, useCountdown } from "./useCountdown";

function countdown(overrides: Partial<Countdown>): Countdown {
  return { totalMs: 1, days: 0, hours: 0, minutes: 0, seconds: 0, expired: false, ...overrides };
}

describe("formatCountdown", () => {
  it("handles null and expired states", () => {
    expect(formatCountdown(null)).toBe("—");
    expect(formatCountdown(countdown({ expired: true }))).toBe("Deadline passed");
  });

  it("prefers the largest non-zero unit", () => {
    expect(formatCountdown(countdown({ days: 2, hours: 4, minutes: 12 }))).toBe("2d 4h 12m");
    expect(formatCountdown(countdown({ hours: 4, minutes: 12, seconds: 30 }))).toBe("4h 12m");
    expect(formatCountdown(countdown({ minutes: 12, seconds: 30 }))).toBe("12m 30s");
    expect(formatCountdown(countdown({ seconds: 30 }))).toBe("30s");
  });
});

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null until a client target is available", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toBeNull();
  });

  it("returns null for an unparseable target", () => {
    const { result } = renderHook(() => useCountdown("not-a-date"));
    expect(result.current).toBeNull();
  });

  it("counts down and ticks", () => {
    const target = new Date("2026-01-01T00:00:05.000Z");
    const { result } = renderHook(() => useCountdown(target, { intervalMs: 1000 }));

    expect(result.current?.seconds).toBe(5);
    expect(result.current?.expired).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current?.seconds).toBe(3);
  });

  it("reports an already-passed deadline as expired", () => {
    const { result } = renderHook(() => useCountdown(new Date("2025-12-31T23:59:00.000Z")));
    expect(result.current?.expired).toBe(true);
    expect(result.current?.totalMs).toBe(0);
  });
});
