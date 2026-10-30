import { stripAnsi } from "../ansi.js";
import type { Attempt, FailureRecord } from "../types.js";

/* Minimal structural types for Playwright's JSON reporter output. */
interface PwError { message?: string; stack?: string; value?: string }
interface PwResult {
  status?: string; duration?: number; retry?: number; error?: PwError; errors?: PwError[];
  stdout?: { text?: string; buffer?: string }[]; stderr?: { text?: string; buffer?: string }[];
  attachments?: { name?: string; path?: string; contentType?: string }[];
}
interface PwTest { projectName?: string; status?: string; results?: PwResult[] }
interface PwSpec { title?: string; file?: string; line?: number; tests?: PwTest[] }
interface PwSuite { title?: string; file?: string; specs?: PwSpec[]; suites?: PwSuite[] }
interface PwReport { suites?: PwSuite[] }

export class ReportParseError extends Error {}

export function parseReportText(text: string): FailureRecord[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ReportParseError(`Report is not valid JSON: ${(e as Error).message}`);
  }
  return parseReport(json);
}

export function parseReport(json: unknown): FailureRecord[] {
  if (!json || typeof json !== "object" || !Array.isArray((json as PwReport).suites)) {
    throw new ReportParseError("Not a Playwright JSON report: missing top-level `suites` array");
  }
  const out: FailureRecord[] = [];
  const walk = (suite: PwSuite, titlePath: string[]) => {
    const here = suite.title && suite.title !== suite.file ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const rec = toFailure(spec, test, suite.file ?? spec.file ?? "unknown", here);
        if (rec) out.push(rec);
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const s of (json as PwReport).suites ?? []) walk(s, []);
  // Parameterised tests share file, line and project; suffix repeats so ids stay unique.
  const seen = new Map<string, number>();
  for (const r of out) {
    const n = (seen.get(r.id) ?? 0) + 1;
    seen.set(r.id, n);
    if (n > 1) r.id = `${r.id} #${n}`;
  }
  return out;
}

function errText(e?: PwError): string {
  return stripAnsi(e?.message ?? e?.value ?? "").trim();
}

function toFailure(spec: PwSpec, test: PwTest, file: string, path: string[]): FailureRecord | null {
  if (test.status !== "unexpected" && test.status !== "flaky") return null;
  const results = test.results ?? [];
  const attempts: Attempt[] = results.map((r, i) => {
    const e = r.error ?? r.errors?.[0];
    const a: Attempt = { retry: r.retry ?? i, status: r.status ?? "unknown", durationMs: r.duration ?? 0 };
    if (e) {
      a.errorMessage = errText(e);
      if (e.stack) a.stack = stripAnsi(e.stack);
    }
    return a;
  });
  const failed = results.filter((r) => r.status && r.status !== "passed" && r.status !== "skipped");
  const last = failed[failed.length - 1] ?? results[results.length - 1];
  const lastErr = last?.error ?? last?.errors?.[0];
  const project = test.projectName ?? "default";
  const line = spec.line;
  const text = (xs?: { text?: string }[]) => (xs ?? []).map((x) => stripAnsi(x.text ?? "")).filter(Boolean);
  const attachments = (last?.attachments ?? [])
    .filter((a) => a.path)
    .map((a) => ({ name: a.name ?? "attachment", path: a.path as string, ...(a.contentType ? { contentType: a.contentType } : {}) }));
  const trace = attachments.find((a) => a.name === "trace" || a.path.endsWith("trace.zip"));
  const shot = attachments.find((a) => a.name === "screenshot");

  const rec: FailureRecord = {
    id: `${spec.file ?? file}:${line ?? 0} [${project}]`,
    title: [...path, spec.title ?? "(untitled)"].join(" > "),
    file: spec.file ?? file,
    project,
    outcome: test.status,
    attempts,
    errorMessage: errText(lastErr) || "(no error message in report)",
    stdout: text(last?.stdout),
    stderr: text(last?.stderr),
    attachments,
  };
  if (line !== undefined) rec.line = line;
  if (lastErr?.stack) rec.stack = stripAnsi(lastErr.stack);
  if (trace) rec.tracePath = trace.path;
  if (shot) rec.screenshotPath = shot.path;
  return rec;
}
