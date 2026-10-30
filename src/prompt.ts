import { redact, truncateMiddle } from "./redact.js";
import { loadPrompt, render } from "./prompts/loader.js";
import type { FailureRecord, HeuristicVerdict } from "./types.js";

export interface BuiltPrompt {
  system: string;
  user: string;
  version: string;
}

export interface PromptLimits {
  errorChars: number;
  stackChars: number;
  logChars: number;
}
export const DEFAULT_LIMITS: PromptLimits = { errorChars: 4000, stackChars: 2500, logChars: 3000 };

/**
 * Untrusted text must not be able to close the <failure> block and pose as
 * instructions, so any <failure / </failure tag in it is neutralised.
 */
export const neutraliseTags = (s: string): string => s.replace(/<(\/?)(failure)/gi, "&lt;$1$2");

/** Redact first, then truncate, so a secret split by truncation can never survive. */
const clean = (s: string, max: number) => neutraliseTags(truncateMiddle(redact(s), max)) || "(none)";
const short = (s: string) => neutraliseTags(redact(s));

export function buildPrompt(
  f: FailureRecord,
  hint: HeuristicVerdict | null,
  version = "v1",
  limits: PromptLimits = DEFAULT_LIMITS,
): BuiltPrompt {
  const tpl = loadPrompt(version);
  const attempts = f.attempts.map((a) => `#${a.retry}:${a.status}(${a.durationMs}ms)`).join(", ") || "n/a";
  const user = render(tpl.user, {
    id: short(f.id),
    title: short(f.title),
    file: short(f.file),
    line: f.line !== undefined ? `:${f.line}` : "",
    project: short(f.project),
    outcome: f.outcome === "flaky" ? "flaky (failed, then passed on retry)" : "failed",
    attempts,
    trace: f.tracePath ? "yes (contents not sent)" : "no",
    screenshot: f.screenshotPath ? "yes (contents not sent)" : "no",
    error: clean(f.errorMessage, limits.errorChars),
    stack: clean(f.stack ?? "", limits.stackChars),
    stdout: clean(f.stdout.join("\n"), limits.logChars),
    stderr: clean(f.stderr.join("\n"), limits.logChars),
    hint: hint ? `${hint.category} (confidence ${hint.confidence}) - ${hint.reason}` : "none",
  });
  return { system: tpl.system, user, version: tpl.version };
}
