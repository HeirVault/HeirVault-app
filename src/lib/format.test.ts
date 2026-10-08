/**
 * Formatting helper tests.
 *
 * Locale-dependent output is compared against the same `toLocaleString` call
 * the implementation makes, so the assertions pin the branch logic (fallbacks,
 * precision, suffixes) without assuming a specific locale.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  copyToClipboard,
  formatAssetAmount,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  pluralise,
  truncateMiddle,
} from "./format";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatAssetAmount", () => {
  it("appends the asset symbol to a finite amount", () => {
    const expected = Number("1234.5").toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 7,
    });
    expect(formatAssetAmount("1234.5", "USDC")).toBe(`${expected} USDC`);
  });

  it("honours the maximum fraction digits", () => {
    const expected = Number("1.12345678").toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    expect(formatAssetAmount("1.12345678", "USDC", 2)).toBe(`${expected} USDC`);
  });

  it("falls back to the raw value for non-numeric input", () => {
    expect(formatAssetAmount("not-a-number", "USDC")).toBe("not-a-number USDC");
  });
});

describe("formatNumber", () => {
  it("formats with the requested precision", () => {
    const expected = (1234.567).toLocaleString(undefined, { maximumFractionDigits: 2 });
    expect(formatNumber(1234.567, 2)).toBe(expected);
  });
});

describe("formatPercent", () => {
  it("leaves integers untouched", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(50)).toBe("50%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("pins fractionals to two decimals", () => {
    expect(formatPercent(33.333)).toBe("33.33%");
    expect(formatPercent(33.5)).toBe("33.50%");
  });
});

describe("formatDate / formatDateTime", () => {
  it("returns an em dash for missing or invalid values", () => {
    expect(formatDate()).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDateTime()).toBe("—");
    expect(formatDateTime("nope")).toBe("—");
  });

  it("formats valid dates with the year", () => {
    expect(formatDate("2026-01-15T00:00:00.000Z")).toContain("2026");
    expect(formatDate(new Date("2026-01-15T00:00:00.000Z"))).toContain("2026");
    expect(formatDateTime("2026-01-15T13:45:00.000Z")).toContain("2026");
  });
});

describe("truncateMiddle", () => {
  it("returns short values unchanged", () => {
    expect(truncateMiddle("GABC")).toBe("GABC");
    expect(truncateMiddle("")).toBe("");
  });

  it("shortens long values from the middle", () => {
    expect(truncateMiddle("GABCDEFGHIJK", 4)).toBe("GABC…HIJK");
  });

  it("uses the requested visible length", () => {
    expect(truncateMiddle("0123456789", 2)).toBe("01…89");
  });
});

describe("pluralise", () => {
  it("uses the singular form for exactly one", () => {
    expect(pluralise(1, "day")).toBe("day");
  });

  it("uses the default plural otherwise", () => {
    expect(pluralise(0, "day")).toBe("days");
    expect(pluralise(2, "day")).toBe("days");
  });

  it("uses a custom plural when supplied", () => {
    expect(pluralise(1, "entry", "entries")).toBe("entry");
    expect(pluralise(3, "entry", "entries")).toBe("entries");
  });
});

describe("copyToClipboard", () => {
  function setClipboard(value: unknown) {
    Object.defineProperty(navigator, "clipboard", { value, configurable: true });
  }

  it("returns false when the clipboard API is unavailable", async () => {
    setClipboard(undefined);
    expect(await copyToClipboard("x")).toBe(false);
  });

  it("returns true when the write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    expect(await copyToClipboard("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("swallows a rejected write and reports failure", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard({ writeText });
    expect(await copyToClipboard("hello")).toBe(false);
  });
});
