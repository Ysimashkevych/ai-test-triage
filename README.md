# ai-test-triage

A TypeScript CLI/library that reads **Playwright JSON reporter output** and triages each failed test into one of:

`product-bug` | `flaky-test` | `environment` | `test-bug`

Each result carries a confidence, a root-cause hypothesis and a suggested next step, and is written as Markdown and JSON. A cheap **heuristic pre-classifier** handles obvious cases (`net::ERR_*`, strict-mode violations, browser launch errors) without any LLM call; ambiguous failures go to an LLM (Anthropic Claude via `@anthropic-ai/sdk`) with a strictly validated JSON answer.

Built as a portfolio project by Yurii Simashkevych (Senior/Lead SDET) to show how I use LLMs for failure triage with proper engineering around them: testable seams, validation, redaction, retries.

## Architecture

```mermaid
flowchart LR
  R[Playwright JSON report] --> P[Parser]
  P -->|FailureRecord[]| H[Heuristic pre-classifier]
  H -->|confidence >= threshold| OUT
  H -->|ambiguous + hint| B[Prompt builder<br/>versioned prompt files]
  B --> X[Redaction + truncation]
  X --> L{{LLMClient interface}}
  L --> A[AnthropicClient]
  L --> M[MockLLM - tests]
  A --> V[zod validation<br/>retry / timeout]
  M --> V
  V -->|valid verdict| OUT[TriageResult]
  V -->|exhausted retries| F[Heuristic fallback / unclassified]
  F --> OUT
  OUT --> REP[Markdown + JSON report]
```

| Module | Responsibility |
|---|---|
| `src/parser/playwright.ts` | Walks nested suites, keeps `unexpected` and `flaky` tests, strips ANSI, collects attempts, stdout/stderr, trace/screenshot paths |
| `src/heuristics.ts` | Ordered regex rules -> category + confidence. Baseline and short-circuit (default threshold 0.85) |
| `src/prompts/v1/*.md` | System and user prompt templates, one directory per version (`--prompt-version`) |
| `src/prompt.ts`, `src/redact.ts` | Fills the template; redacts then truncates every log field |
| `src/llm/types.ts` | `LLMClient` interface (`complete()`), the only thing the engine depends on |
| `src/llm/anthropic.ts`, `src/llm/mock.ts` | Real client; deterministic offline `MockLLM` that records requests |
| `src/parseVerdict.ts` | Extracts JSON from model text and validates with zod |
| `src/retry.ts` | Timeout (with `AbortSignal`) and exponential-backoff retry; SDK retries are disabled so policy lives in one place |
| `src/triage.ts`, `src/report.ts` | Orchestration and Markdown/JSON output |

Retry policy: timeouts, HTTP 408/409/429/5xx, connection errors and schema-invalid output are retried (default 2 retries). 4xx auth/validation errors are not. If the LLM is unavailable, the result falls back to the heuristic verdict (`source: heuristic-fallback`) or `unclassified`; the run never aborts for one bad failure.

## Usage

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY; never commit it

# heuristics only (the default): no key, no network calls
npx tsx src/cli.ts fixtures/checkout-report.json

# opt in to the LLM for failures the heuristics are unsure of
node --env-file=.env --import tsx src/cli.ts path/to/results.json --llm --out-dir triage-out
```

Produce the input with `npx playwright test --reporter=json > results.json` (or `PLAYWRIGHT_JSON_OUTPUT_NAME=results.json` with `--reporter=json`).

Options: `--llm`, `--out-dir`, `--prompt-version`, `--threshold`, `--max-failures`, `--timeout-ms`, `--retries`. Model: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

Library use:

```ts
import { triageReportFile, AnthropicClient, toMarkdown } from "ai-test-triage";
const report = await triageReportFile("results.json", { llm: new AnthropicClient() });
console.log(toMarkdown(report));
```

## Tests

```bash
npm test            # vitest, fully offline, MockLLM only
npx tsc --noEmit
```

`fixtures/` holds hand-written, realistic Playwright JSON reports (`checkout-report.json`, `auth-report.json`) with `expected.json` describing the expected category and which path (heuristic vs LLM) should decide it. Tests cover the parser, redaction, heuristics, prompt building, schema validation, retry/timeout/fallback behaviour and the end-to-end fixture runs.

Honest caveat: for LLM-routed fixture cases the MockLLM replays canned answers. These tests prove routing, parsing, validation and reporting. **They do not measure how accurate a real model is**, and no accuracy figures are claimed here.

## Privacy and redaction

Test logs often contain tokens and personal data. Before anything is placed in a prompt, every text field (title, error, stack, stdout, stderr) is ANSI-stripped, **redacted**, and only then truncated. Redacted patterns: Authorization/Cookie headers, Bearer tokens, JWTs, Anthropic/OpenAI-style keys, AWS access keys, GitHub and Slack tokens, private-key blocks, credentials in URLs, `password`/`secret`/`token`/`api_key`-style key-value pairs and email addresses. Screenshots and traces are **never** uploaded; only their paths are mentioned.

Limits: redaction is pattern based. It will miss secrets with no recognisable shape or key name, and it can over-redact. Review what you send, and leave `--llm` off for sensitive suites. The LLM is opt-in, so an `ANTHROPIC_API_KEY` that happens to be set in your shell is never used unless you pass `--llm`. Numeric options are validated, and bad values exit with code 2. Log content is also treated as untrusted (prompt-injection): the system prompt tells the model to ignore instructions in it, and output is schema-validated, but that is mitigation, not a guarantee.

## Adding a provider

1. Implement `LLMClient` from `src/llm/types.ts`:

   ```ts
   export class MyClient implements LLMClient {
     readonly name = "my-model";
     async complete({ system, user, maxTokens, signal }: LlmRequest): Promise<string> {
       // call your API, honour `signal`, return the raw text.
       // Throw LlmError(message, retryable, status) so retry logic classifies it.
     }
   }
   ```
2. Pass it as `triageReportFile(path, { llm: new MyClient() })` (or wire a flag in `src/cli.ts`).
3. Nothing else changes: prompts, validation, retry and redaction are provider-independent. Test it by pointing `MockLLM` at the same flow.

New prompt versions: add `src/prompts/v2/{system,user}.md` and run with `--prompt-version v2`; the version is recorded in each result.

## Limitations

- **LLM classification is probabilistic.** The same failure can get different labels across runs or model versions, and `confidence` is the model's self-report, not a calibrated probability. Treat output as a triage aid for a human, not a verdict.
- The model sees text only: no trace viewer, DOM or screenshot content. Many real failures need those.
- Heuristics are regexes over English Playwright messages; custom reporters or localized messages may bypass them. A confident heuristic (e.g. `net::ERR_*`) can be wrong, for example when a product misconfiguration causes the refusal.
- Only the JSON reporter format is supported; failures are processed sequentially; no cross-run flakiness history is used (the strongest flakiness signal).
- Not verified against live API output in this repo (developed without an API key). The `AnthropicClient` is a thin wrapper, but real-model behaviour, cost and latency are untested here.

## License

MIT

## Related projects

- [qa-claude-skills](https://github.com/Ysimashkevych/qa-claude-skills): the `flaky-test-triage` skill uses the same four categories (`product-bug`, `test-bug`, `environment`, `flaky-test`) for interactive triage.
- [playwright-ts-framework](https://github.com/Ysimashkevych/playwright-ts-framework): a Playwright suite whose JSON report this tool can read.
- [graphql-api-tests-go](https://github.com/Ysimashkevych/graphql-api-tests-go): GraphQL API testing in Go.

## License

MIT, see [LICENSE](LICENSE).
