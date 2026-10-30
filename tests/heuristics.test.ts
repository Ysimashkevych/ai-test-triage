import { describe, expect, it } from "vitest";
import { classifyHeuristic } from "../src/heuristics.js";
import { makeFailure } from "./helpers.js";

const h = (errorMessage: string, over = {}) => classifyHeuristic(makeFailure({ errorMessage, ...over }));

describe("heuristic pre-classifier", () => {
  it("net::ERR -> environment (high)", () => {
    const v = h("page.goto: net::ERR_NAME_NOT_RESOLVED at https://x");
    expect(v).toMatchObject({ category: "environment", rule: "net-err" });
    expect(v!.confidence).toBeGreaterThanOrEqual(0.85);
  });
  it("ECONNREFUSED -> environment", () => {
    expect(h("connect ECONNREFUSED 127.0.0.1:3000")?.category).toBe("environment");
  });
  it("strict mode violation -> test-bug (high)", () => {
    expect(h("locator.click: strict mode violation: getByRole('button') resolved to 2 elements")).toMatchObject({ category: "test-bug", rule: "strict-mode-violation" });
  });
  it("browser launch failure -> environment", () => {
    expect(h("browserType.launch: Executable doesn't exist")?.category).toBe("environment");
  });
  it("timeout that passed on retry -> flaky-test but below short-circuit", () => {
    const v = h("Timeout 30000ms exceeded", { outcome: "flaky" });
    expect(v).toMatchObject({ category: "flaky-test", rule: "flaky-timeout" });
    expect(v!.confidence).toBeLessThan(0.85);
  });
  it("selector-not-found timeout is low-confidence test-bug", () => {
    const v = h("waiting for locator('#x')\nTimeout 5000ms exceeded");
    expect(v).toMatchObject({ category: "test-bug", rule: "locator-timeout" });
    expect(v!.confidence).toBeLessThan(0.85);
  });
  it("assertion mismatch is weak product-bug", () => {
    const v = h("expect(received).toBe(expected)\nExpected: 1\nReceived: 2");
    expect(v).toMatchObject({ category: "product-bug" });
    expect(v!.confidence).toBeLessThan(0.5);
  });
  it("returns null with no signal", () => {
    expect(h("something odd")).toBeNull();
  });
});
