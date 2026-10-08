import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names with a single space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn(false, null, undefined)).toBe("");
  });

  it("returns an empty string with no input", () => {
    expect(cn()).toBe("");
  });
});
