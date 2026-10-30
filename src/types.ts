import { z } from "zod";

export const CATEGORIES = ["product-bug", "flaky-test", "environment", "test-bug"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Strict schema every LLM answer must satisfy. */
export const LlmVerdictSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence: z.number().min(0).max(1),
  rootCauseHypothesis: z.string().min(1).max(2000),
  suggestedNextStep: z.string().min(1).max(1000),
  evidence: z.array(z.string().max(500)).max(10).optional(),
});
export type LlmVerdict = z.infer<typeof LlmVerdictSchema>;

export interface Attempt {
  retry: number;
  status: string;
  durationMs: number;
  errorMessage?: string;
  stack?: string;
}

export interface FailureRecord {
  /** Stable id: `<file>:<line> [<project>]` */
  id: string;
  title: string;
  file: string;
  line?: number;
  project: string;
  /** Playwright test status: unexpected (failed) | flaky (failed then passed) */
  outcome: "unexpected" | "flaky";
  attempts: Attempt[];
  /** Error of the last failed attempt (ANSI stripped, NOT redacted). */
  errorMessage: string;
  stack?: string;
  stdout: string[];
  stderr: string[];
  attachments: { name: string; path: string; contentType?: string }[];
  tracePath?: string;
  screenshotPath?: string;
}

export type Source = "heuristic" | "llm" | "heuristic-fallback" | "none";

export interface HeuristicVerdict {
  category: Category;
  confidence: number;
  rule: string;
  reason: string;
}

export interface TriageResult {
  failureId: string;
  title: string;
  file: string;
  category: Category | "unclassified";
  confidence: number;
  rootCauseHypothesis: string;
  suggestedNextStep: string;
  source: Source;
  heuristic?: HeuristicVerdict;
  promptVersion?: string;
  llmAttempts?: number;
  error?: string;
  tracePath?: string;
  screenshotPath?: string;
}
