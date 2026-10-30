import { parseArgs } from "node:util";

export const HELP = `Usage: ai-test-triage <playwright-report.json> [options]

  --llm                 Ask the LLM about failures the heuristics are unsure of
                        (off by default: no network calls unless you opt in)
  --out-dir <dir>       Output directory (default: triage-out)
  --prompt-version <v>  Prompt version directory (default: v1)
  --threshold <0..1>    Heuristic confidence that skips the LLM (default: 0.85)
  --max-failures <n>    Triage at most n failures
  --timeout-ms <n>      Per-call LLM timeout (default: 60000)
  --retries <n>         LLM retries (default: 2)
  --max-tokens <n>      LLM output token limit (default: 4096)

Env (with --llm): ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (default claude-sonnet-5-5)`;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface CliArgs {
  input: string;
  llm: boolean;
  outDir: string;
  promptVersion: string;
  threshold: number;
  timeoutMs: number;
  retries: number;
  maxTokens: number;
  maxFailures?: number;
}

function num(flag: string, raw: string, ok: (n: number) => boolean, expected: string): number {
  const n = Number(raw);
  if (raw.trim() === "" || !ok(n)) throw new UsageError(`--${flag} must be ${expected}, got "${raw}"`);
  return n;
}
const intAtLeast = (min: number) => (n: number) => Number.isInteger(n) && n >= min;

/** Parses argv; returns null when help was requested. Throws UsageError on bad input. */
export function parseCliArgs(argv: string[]): CliArgs | null {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        llm: { type: "boolean", default: false },
        "out-dir": { type: "string", default: "triage-out" },
        "prompt-version": { type: "string", default: "v1" },
        threshold: { type: "string", default: "0.85" },
        "max-failures": { type: "string" },
        "timeout-ms": { type: "string", default: "60000" },
        retries: { type: "string", default: "2" },
        "max-tokens": { type: "string", default: "4096" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values: v, positionals } = parsed;
  if (v.help) return null;
  const input = positionals[0];
  if (!input) throw new UsageError("missing <playwright-report.json>");
  return {
    input,
    llm: v.llm,
    outDir: v["out-dir"],
    promptVersion: v["prompt-version"],
    threshold: num("threshold", v.threshold, (n) => n >= 0 && n <= 1, "a number between 0 and 1"),
    timeoutMs: num("timeout-ms", v["timeout-ms"], intAtLeast(1), "a positive integer"),
    retries: num("retries", v.retries, intAtLeast(0), "a non-negative integer"),
    maxTokens: num("max-tokens", v["max-tokens"], intAtLeast(1), "a positive integer"),
    ...(v["max-failures"] !== undefined
      ? { maxFailures: num("max-failures", v["max-failures"], intAtLeast(1), "a positive integer") }
      : {}),
  };
}
