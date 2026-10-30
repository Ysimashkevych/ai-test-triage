#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HELP, parseCliArgs, UsageError } from "./args.js";
import { AnthropicClient } from "./llm/anthropic.js";
import { triageReportFile } from "./pipeline.js";
import { loadPrompt } from "./prompts/loader.js";
import { toMarkdown } from "./report.js";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args) {
    console.log(HELP);
    return;
  }
  try {
    loadPrompt(args.promptVersion); // fail fast even without --llm, since the version is recorded in the report
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const report = await triageReportFile(args.input, {
    ...(args.llm ? { llm: new AnthropicClient() } : {}),
    promptVersion: args.promptVersion,
    shortCircuitThreshold: args.threshold,
    timeoutMs: args.timeoutMs,
    maxRetries: args.retries,
    maxTokens: args.maxTokens,
    ...(args.maxFailures !== undefined ? { maxFailures: args.maxFailures } : {}),
  });
  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, "triage-report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(args.outDir, "triage-report.md"), toMarkdown(report));
  console.log(`Triaged ${report.summary.failures} failure(s) -> ${args.outDir}/triage-report.{md,json}`);
}

main().catch((e: unknown) => {
  if (e instanceof UsageError) {
    console.error(`Error: ${e.message}\n\n${HELP}`);
    process.exit(2);
  }
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
