#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { AnthropicClient } from "./llm/anthropic.js";
import { triageReportFile } from "./pipeline.js";
import { toMarkdown } from "./report.js";

const HELP = `Usage: ai-test-triage <playwright-report.json> [options]

  --out-dir <dir>       Output directory (default: triage-out)
  --no-llm              Heuristics only; no network calls
  --prompt-version <v>  Prompt version directory (default: v1)
  --threshold <0..1>    Heuristic confidence that skips the LLM (default: 0.85)
  --max-failures <n>    Triage at most n failures
  --timeout-ms <n>      Per-call LLM timeout (default: 60000)
  --retries <n>         LLM retries (default: 2)

Env: ANTHROPIC_API_KEY (required unless --no-llm), ANTHROPIC_MODEL (default claude-sonnet-5-5)`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "out-dir": { type: "string", default: "triage-out" },
      "no-llm": { type: "boolean", default: false },
      "prompt-version": { type: "string", default: "v1" },
      threshold: { type: "string", default: "0.85" },
      "max-failures": { type: "string" },
      "timeout-ms": { type: "string", default: "60000" },
      retries: { type: "string", default: "2" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const input = positionals[0];
  if (values.help || !input) {
    console.log(HELP);
    process.exit(values.help ? 0 : 2);
  }
  const report = await triageReportFile(input, {
    ...(values["no-llm"] ? {} : { llm: new AnthropicClient() }),
    promptVersion: values["prompt-version"] as string,
    shortCircuitThreshold: Number(values.threshold),
    timeoutMs: Number(values["timeout-ms"]),
    maxRetries: Number(values.retries),
    ...(values["max-failures"] ? { maxFailures: Number(values["max-failures"]) } : {}),
  });
  const out = values["out-dir"] as string;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "triage-report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(out, "triage-report.md"), toMarkdown(report));
  console.log(`Triaged ${report.summary.failures} failure(s) -> ${out}/triage-report.{md,json}`);
}

main().catch((e: unknown) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
