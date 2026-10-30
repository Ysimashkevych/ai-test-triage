import { describe, expect, it } from "vitest";
import { MockLLM } from "../src/llm/mock.js";
import { triageReportFile } from "../src/pipeline.js";
import { toMarkdown } from "../src/report.js";
import { expected, fixturePath } from "./helpers.js";

/**
 * NOTE: for LLM-routed cases the MockLLM replays the canned `mockResponse` from
 * expected.json. These tests verify routing, parsing, validation and reporting,
 * NOT the accuracy of a real model. Heuristic cases are checked against the
 * real rule engine with zero LLM calls.
 */
describe.each(Object.keys(expected))("fixture %s", (file) => {
  const exp = expected[file]!;
  const answers = Object.fromEntries(
    Object.entries(exp).filter(([, v]) => v.mockResponse !== undefined).map(([k, v]) => [k, v.mockResponse]),
  );

  it("classifies every failure as expected via the right path", async () => {
    const llm = MockLLM.byFailureId(answers);
    const report = await triageReportFile(fixturePath(file), { llm, now: () => new Date("2026-01-01T00:00:00Z"), retryBaseDelayMs: 1, sleep: async () => {} });
    expect(report.results.map((r) => r.failureId).sort()).toEqual(Object.keys(exp).sort());
    for (const r of report.results) {
      expect({ id: r.failureId, category: r.category, source: r.source }).toEqual({ id: r.failureId, category: exp[r.failureId]!.category, source: exp[r.failureId]!.source });
    }
    expect(llm.calls).toHaveLength(Object.keys(answers).length); // heuristic cases never hit the LLM
  });

  it("produces consistent markdown and JSON", async () => {
    const report = await triageReportFile(fixturePath(file), { now: () => new Date("2026-01-01T00:00:00Z") });
    const md = toMarkdown(report);
    expect(md).toContain("# Test failure triage");
    expect(md).toContain("probabilistic");
    expect(JSON.parse(JSON.stringify(report)).summary.failures).toBe(report.results.length);
    for (const r of report.results) expect(md).toContain(r.title);
  });

  it("redacted secrets from fixture logs never reach the LLM", async () => {
    const llm = MockLLM.byFailureId(answers);
    await triageReportFile(fixturePath(file), { llm, sleep: async () => {} });
    const sent = llm.calls.map((c) => c.user + c.system).join("\n");
    for (const s of ["Sup3rS3cret!", "sk-ant-api03", "eyJhbGciOiJIUzI1NiJ9", "qa.user@corp.example.test"]) expect(sent).not.toContain(s);
  });
});
