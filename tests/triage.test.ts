import { describe, expect, it } from "vitest";
import { LlmError } from "../src/llm/types.js";
import { MockLLM } from "../src/llm/mock.js";
import { parseVerdict } from "../src/parseVerdict.js";
import { triageFailure } from "../src/triage.js";
import { makeFailure } from "./helpers.js";

const good = { category: "test-bug", confidence: 0.7, rootCauseHypothesis: "stale selector", suggestedNextStep: "fix locator" };
const ambiguous = makeFailure({ errorMessage: "expect(received).toBe(expected)\nExpected: 1\nReceived: 2" });
const noSleep = { sleep: async () => {}, retryBaseDelayMs: 1 };

describe("structured output validation", () => {
  it("accepts fenced and prose-wrapped JSON", () => {
    expect(parseVerdict("Sure!\n```json\n" + JSON.stringify(good) + "\n```").category).toBe("test-bug");
  });
  it.each([
    ["no json", "I think it is flaky"],
    ["bad category", JSON.stringify({ ...good, category: "network" })],
    ["confidence out of range", JSON.stringify({ ...good, confidence: 1.4 })],
    ["missing field", JSON.stringify({ category: "test-bug", confidence: 0.5 })],
  ])("rejects %s", (_n, text) => {
    expect(() => parseVerdict(text)).toThrow();
  });
});

describe("triageFailure", () => {
  it("short-circuits on high-confidence heuristics without calling the LLM", async () => {
    const llm = MockLLM.sequence(JSON.stringify(good));
    const r = await triageFailure(makeFailure({ errorMessage: "net::ERR_CONNECTION_REFUSED" }), { llm });
    expect(r).toMatchObject({ source: "heuristic", category: "environment" });
    expect(llm.calls).toHaveLength(0);
  });

  it("calls the LLM for ambiguous failures and records provenance", async () => {
    const llm = MockLLM.sequence(JSON.stringify(good));
    const r = await triageFailure(ambiguous, { llm, ...noSleep });
    expect(r).toMatchObject({ source: "llm", category: "test-bug", promptVersion: "v1", llmAttempts: 1 });
    expect(r.heuristic?.category).toBe("product-bug");
    expect(llm.calls[0]!.user).toContain("Heuristic baseline hint: product-bug");
  });

  it("retries transient errors then succeeds", async () => {
    const llm = MockLLM.sequence(new LlmError("429", true, 429), new LlmError("503", true, 503), JSON.stringify(good));
    const r = await triageFailure(ambiguous, { llm, ...noSleep });
    expect(r).toMatchObject({ source: "llm", llmAttempts: 3 });
  });

  it("retries schema-invalid output", async () => {
    const llm = MockLLM.sequence("not json", JSON.stringify(good));
    const r = await triageFailure(ambiguous, { llm, ...noSleep });
    expect(r).toMatchObject({ source: "llm", llmAttempts: 2 });
  });

  it("does not retry non-retryable errors and falls back to the heuristic", async () => {
    const llm = MockLLM.sequence(new LlmError("401 unauthorized", false, 401));
    const r = await triageFailure(ambiguous, { llm, ...noSleep });
    expect(llm.calls).toHaveLength(1);
    expect(r).toMatchObject({ source: "heuristic-fallback", category: "product-bug" });
    expect(r.error).toContain("401");
  });

  it("gives up after maxRetries and marks unclassified when no heuristic exists", async () => {
    const llm = MockLLM.sequence(new LlmError("500", true, 500));
    const r = await triageFailure(makeFailure({ errorMessage: "weird" }), { llm, maxRetries: 2, ...noSleep });
    expect(llm.calls).toHaveLength(3);
    expect(r).toMatchObject({ source: "none", category: "unclassified", confidence: 0 });
  });

  it("times out a hung LLM call and aborts the signal", async () => {
    let aborted = false;
    const llm = new MockLLM((req) => new Promise<string>(() => { req.signal?.addEventListener("abort", () => (aborted = true)); }));
    const r = await triageFailure(ambiguous, { llm, timeoutMs: 20, maxRetries: 0, ...noSleep });
    expect(aborted).toBe(true);
    expect(r.source).toBe("heuristic-fallback");
    expect(r.error).toMatch(/timed out/);
  });

  it("never sends secrets to the LLM", async () => {
    const llm = MockLLM.sequence(JSON.stringify(good));
    await triageFailure(makeFailure({ errorMessage: "Expected: 1 Received: 2 Authorization: Bearer abcdefghijklmnop", stdout: ["password=hunter2"] }), { llm, ...noSleep });
    const sent = llm.calls[0]!.system + llm.calls[0]!.user;
    expect(sent).not.toMatch(/abcdefghijklmnop|hunter2/);
  });

  it("heuristics-only mode makes no LLM use", async () => {
    const r = await triageFailure(ambiguous);
    expect(r).toMatchObject({ source: "heuristic", category: "product-bug" });
  });
});
