import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/prompt.js";
import { availableVersions, loadPrompt, render } from "../src/prompts/loader.js";
import { makeFailure } from "./helpers.js";

describe("prompt builder", () => {
  it("loads versioned prompt files", () => {
    expect(availableVersions()).toContain("v1");
    expect(loadPrompt("v1").system).toContain("product-bug");
    expect(() => loadPrompt("v99")).toThrow(/not found/);
    expect(() => loadPrompt("../etc")).toThrow(/Invalid/);
  });

  it("redacts secrets in error, stack and logs before building the prompt", () => {
    const f = makeFailure({
      errorMessage: "failed with Authorization: Bearer supersecrettokenvalue",
      stack: "at login password=hunter22",
      stdout: ["key sk-ant-api03-ABCDEFGHIJKLMNOP", "mail bob@corp.example.com"],
    });
    const p = buildPrompt(f, null);
    for (const s of ["supersecrettokenvalue", "hunter22", "sk-ant-api03", "bob@corp.example.com"]) {
      expect(p.user).not.toContain(s);
      expect(p.system).not.toContain(s);
    }
    expect(p.user).toContain("[REDACTED");
  });

  it("does not expand placeholders found inside log content", () => {
    const p = buildPrompt(makeFailure({ errorMessage: "{{stack}} {{hint}}" }), null);
    expect(p.user).toContain("{{stack}} {{hint}}");
  });

  it("includes the heuristic hint and truncates huge logs", () => {
    const p = buildPrompt(
      makeFailure({ stdout: ["x".repeat(50_000)] }),
      { category: "environment", confidence: 0.5, rule: "r", reason: "because" },
    );
    expect(p.user).toContain("environment (confidence 0.5)");
    expect(p.user.length).toBeLessThan(15_000);
  });

  it("render is single-pass", () => {
    expect(render("{{a}}", { a: "{{b}}", b: "no" })).toBe("{{b}}");
  });
});
