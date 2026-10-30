import { classifyHeuristic } from "./heuristics.js";
import { LlmError, type LLMClient } from "./llm/types.js";
import { OutputValidationError, parseVerdict } from "./parseVerdict.js";
import { buildPrompt } from "./prompt.js";
import { TimeoutError, withRetry, withTimeout } from "./retry.js";
import type { FailureRecord, TriageResult } from "./types.js";

export interface TriageOptions {
  /** Omit for heuristics-only mode. */
  llm?: LLMClient;
  promptVersion?: string;
  /** Heuristic confidence at/above which the LLM is skipped. Default 0.85. */
  shortCircuitThreshold?: number;
  /** Retries after the first LLM attempt. Default 2. */
  maxRetries?: number;
  timeoutMs?: number;
  maxTokens?: number;
  retryBaseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const isRetryable = (e: unknown) =>
  e instanceof TimeoutError || e instanceof OutputValidationError || (e instanceof LlmError && e.retryable);

export async function triageFailure(f: FailureRecord, o: TriageOptions = {}): Promise<TriageResult> {
  const threshold = o.shortCircuitThreshold ?? 0.85;
  const h = classifyHeuristic(f);
  const base = {
    failureId: f.id,
    title: f.title,
    file: f.file,
    ...(f.tracePath ? { tracePath: f.tracePath } : {}),
    ...(f.screenshotPath ? { screenshotPath: f.screenshotPath } : {}),
    ...(h ? { heuristic: h } : {}),
  };

  if (h && h.confidence >= threshold) {
    return {
      ...base,
      category: h.category,
      confidence: h.confidence,
      rootCauseHypothesis: h.reason,
      suggestedNextStep: nextStepFor(h.category),
      source: "heuristic",
    };
  }

  const fallback = (error?: string): TriageResult =>
    h
      ? {
          ...base,
          category: h.category,
          confidence: h.confidence,
          rootCauseHypothesis: h.reason,
          suggestedNextStep: nextStepFor(h.category),
          source: o.llm ? "heuristic-fallback" : "heuristic",
          ...(error ? { error } : {}),
        }
      : {
          ...base,
          category: "unclassified",
          confidence: 0,
          rootCauseHypothesis: "No heuristic matched and no LLM verdict is available.",
          suggestedNextStep: "Inspect the trace/screenshot manually.",
          source: "none",
          ...(error ? { error } : {}),
        };

  if (!o.llm) return fallback();

  const llm = o.llm;
  const prompt = buildPrompt(f, h, o.promptVersion);
  try {
    const { value, attempts } = await withRetry(
      () =>
        withTimeout(
          (signal) => llm.complete({ system: prompt.system, user: prompt.user, maxTokens: o.maxTokens ?? 4096, signal }),
          o.timeoutMs ?? 60_000,
        ).then(parseVerdict),
      {
        retries: o.maxRetries ?? 2,
        baseDelayMs: o.retryBaseDelayMs ?? 500,
        isRetryable,
        ...(o.sleep ? { sleep: o.sleep } : {}),
      },
    );
    return {
      ...base,
      category: value.category,
      confidence: value.confidence,
      rootCauseHypothesis: value.rootCauseHypothesis,
      suggestedNextStep: value.suggestedNextStep,
      source: "llm",
      promptVersion: prompt.version,
      llmAttempts: attempts,
    };
  } catch (e) {
    return { ...fallback(`LLM triage failed: ${(e as Error).message}`), promptVersion: prompt.version };
  }
}

export async function triageAll(failures: FailureRecord[], o: TriageOptions = {}): Promise<TriageResult[]> {
  const out: TriageResult[] = [];
  for (const f of failures) out.push(await triageFailure(f, o)); // sequential: simple, rate-limit friendly
  return out;
}

function nextStepFor(c: string): string {
  switch (c) {
    case "environment":
      return "Check service/runner health and re-run; confirm the target environment is reachable from CI.";
    case "test-bug":
      return "Fix the locator or expectation in the test; prefer role/test-id based locators.";
    case "flaky-test":
      return "Reproduce with --repeat-each, inspect the trace for races, and replace fixed waits with web-first assertions.";
    default:
      return "Reproduce locally with the trace and compare against expected product behaviour.";
  }
}
