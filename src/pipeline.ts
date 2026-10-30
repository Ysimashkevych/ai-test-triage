import { readFileSync } from "node:fs";
import { parseReportText } from "./parser/playwright.js";
import { buildReport, type TriageReport } from "./report.js";
import { triageAll, type TriageOptions } from "./triage.js";

export async function triageReportFile(path: string, o: TriageOptions & { now?: () => Date; maxFailures?: number } = {}): Promise<TriageReport> {
  let failures = parseReportText(readFileSync(path, "utf8"));
  if (o.maxFailures !== undefined) failures = failures.slice(0, o.maxFailures);
  const results = await triageAll(failures, o);
  return buildReport(results, {
    generatedAt: (o.now?.() ?? new Date()).toISOString(),
    model: o.llm?.name ?? "none (heuristics only)",
    promptVersion: o.promptVersion ?? "v1",
  });
}
