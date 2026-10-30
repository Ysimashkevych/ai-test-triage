import { describe, expect, it } from "vitest";
import { parseCliArgs, UsageError } from "../src/args.js";

describe("parseCliArgs", () => {
  it("defaults to heuristics only (no LLM)", () => {
    expect(parseCliArgs(["r.json"])).toMatchObject({ input: "r.json", llm: false, threshold: 0.85, retries: 2, timeoutMs: 60000 });
  });
  it("enables the LLM only with --llm", () => {
    expect(parseCliArgs(["r.json", "--llm"])?.llm).toBe(true);
  });
  it("returns null for --help", () => {
    expect(parseCliArgs(["--help"])).toBeNull();
  });
  it.each([
    [["r.json", "--retries", "abc"], "--retries"],
    [["r.json", "--retries", "-1"], "--retries"],
    [["r.json", "--retries", "1.5"], "--retries"],
    [["r.json", "--threshold", "abc"], "--threshold"],
    [["r.json", "--threshold", "2"], "--threshold"],
    [["r.json", "--timeout-ms", "0"], "--timeout-ms"],
    [["r.json", "--max-failures", ""], "--max-failures"],
    [[], "missing"],
    [["r.json", "--unknown"], "Unknown option"],
  ])("rejects %j", (argv, msg) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
    expect(() => parseCliArgs(argv)).toThrow(msg);
  });
});

describe("withRetry guard", () => {
  it("rejects a non-integer retry count instead of looping forever", async () => {
    const { withRetry } = await import("../src/retry.js");
    await expect(withRetry(async () => 1, { retries: Number.NaN, baseDelayMs: 1, isRetryable: () => true })).rejects.toThrow(RangeError);
  });
});
