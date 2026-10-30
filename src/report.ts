import { CATEGORIES, type TriageResult } from "./types.js";

export interface ReportMeta {
  generatedAt: string;
  model: string;
  promptVersion: string;
  totalTestsInReport?: number;
}

export interface TriageReport {
  meta: ReportMeta;
  summary: { failures: number; byCategory: Record<string, number>; bySource: Record<string, number> };
  results: TriageResult[];
}

export function buildReport(results: TriageResult[], meta: ReportMeta): TriageReport {
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const r of results) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }
  return { meta, summary: { failures: results.length, byCategory, bySource }, results };
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function toMarkdown(r: TriageReport): string {
  const L: string[] = [];
  L.push("# Test failure triage", "");
  L.push(`> Generated ${r.meta.generatedAt} | model: \`${r.meta.model}\` | prompt: \`${r.meta.promptVersion}\``);
  L.push("> Classifications are probabilistic suggestions, not verdicts. Verify before acting.", "");
  L.push("## Summary", "", `Failures triaged: **${r.summary.failures}**`, "");
  L.push("| Category | Count |", "|---|---|");
  for (const c of [...CATEGORIES, "unclassified"]) L.push(`| ${c} | ${r.summary.byCategory[c] ?? 0} |`);
  L.push("", "## Failures", "");
  L.push("| Test | Category | Confidence | Source |", "|---|---|---|---|");
  for (const x of r.results) L.push(`| ${esc(x.title)} | ${x.category} | ${x.confidence.toFixed(2)} | ${x.source} |`);
  for (const x of r.results) {
    L.push("", `### ${x.title}`, "");
    L.push(`- **File:** \`${x.file}\``);
    L.push(`- **Test id:** \`${x.failureId}\``);
    L.push(`- **Category:** ${x.category} (confidence ${x.confidence.toFixed(2)}, source: ${x.source})`);
    L.push(`- **Root-cause hypothesis:** ${x.rootCauseHypothesis}`);
    L.push(`- **Suggested next step:** ${x.suggestedNextStep}`);
    if (x.heuristic) L.push(`- **Heuristic baseline:** ${x.heuristic.category} (${x.heuristic.confidence}, rule \`${x.heuristic.rule}\`)`);
    if (x.tracePath) L.push(`- **Trace:** \`${x.tracePath}\``);
    if (x.screenshotPath) L.push(`- **Screenshot:** \`${x.screenshotPath}\``);
    if (x.error) L.push(`- **Note:** ${x.error}`);
  }
  return L.join("\n") + "\n";
}
