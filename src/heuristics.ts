import type { FailureRecord, HeuristicVerdict } from "./types.js";

interface Rule {
  name: string;
  test: (f: FailureRecord, text: string) => boolean;
  verdict: Omit<HeuristicVerdict, "rule">;
}

const passedOnRetry = (f: FailureRecord) => f.outcome === "flaky";

/** Ordered: first match wins. Confidence >= threshold short-circuits the LLM. */
const RULES: Rule[] = [
  {
    name: "net-err",
    test: (_f, t) => /net::ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_RESET|CERT_)|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(t),
    verdict: {
      category: "environment",
      confidence: 0.9,
      reason: "Network-level failure (connection refused / DNS / TLS) before the app could respond; points at the environment or its availability, not the assertion logic.",
    },
  },
  {
    name: "browser-launch",
    test: (_f, t) => /browserType\.launch|Executable doesn't exist|Target (page, context or browser )?has been closed|browser has disconnected|Failed to launch|ENOSPC|out of memory/i.test(t),
    verdict: {
      category: "environment",
      confidence: 0.85,
      reason: "Browser launch/crash or runner resource error; typical of CI image, disk or memory problems.",
    },
  },
  {
    name: "strict-mode-violation",
    test: (_f, t) => /strict mode violation/i.test(t),
    verdict: {
      category: "test-bug",
      confidence: 0.9,
      reason: "Locator resolved to multiple elements (strict mode violation); the locator is too broad.",
    },
  },
  {
    name: "gateway-5xx",
    test: (_f, t) => /\b(502|503|504)\b.{0,40}(Bad Gateway|Service Unavailable|Gateway Time-?out)/i.test(t),
    verdict: {
      category: "environment",
      confidence: 0.8,
      reason: "Upstream gateway error (5xx) suggests an unavailable or overloaded backend/environment.",
    },
  },
  {
    name: "flaky-timeout",
    test: (f, t) => passedOnRetry(f) && /Timeout \d+ms exceeded|waiting for/i.test(t),
    verdict: {
      category: "flaky-test",
      confidence: 0.75,
      reason: "Timed out on an earlier attempt but passed on retry; consistent with a race or slow dependency.",
    },
  },
  {
    name: "locator-timeout",
    test: (_f, t) => /waiting for (locator|getBy)|locator resolved to 0 elements|element\(s\) not found/i.test(t),
    verdict: {
      category: "test-bug",
      confidence: 0.55,
      reason: "Selector never matched. Could be a stale selector (test-bug) or a missing/broken UI (product-bug); needs context.",
    },
  },
  {
    name: "generic-timeout",
    test: (_f, t) => /Timeout \d+ms exceeded/.test(t),
    verdict: {
      category: "flaky-test",
      confidence: 0.4,
      reason: "Generic timeout; ambiguous between slow environment, race condition and real hang.",
    },
  },
  {
    name: "assertion-mismatch",
    test: (_f, t) => /expect\(received\)|Expected:|Received:/.test(t),
    verdict: {
      category: "product-bug",
      confidence: 0.45,
      reason: "Deterministic assertion value mismatch; may be a product regression or an outdated expectation.",
    },
  },
  {
    name: "flaky-any",
    test: (f) => passedOnRetry(f),
    verdict: {
      category: "flaky-test",
      confidence: 0.6,
      reason: "Failed then passed on retry with no stronger signal.",
    },
  },
];

export function classifyHeuristic(f: FailureRecord): HeuristicVerdict | null {
  const text = [f.errorMessage, f.stack ?? "", ...f.attempts.map((a) => a.errorMessage ?? "")].join("\n");
  for (const r of RULES) {
    if (r.test(f, text)) return { ...r.verdict, rule: r.name };
  }
  return null;
}
