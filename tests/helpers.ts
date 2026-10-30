import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FailureRecord } from "../src/types.js";

export const fixturePath = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));
export const fixtureText = (n: string) => readFileSync(fixturePath(n), "utf8");
export const expected = JSON.parse(fixtureText("expected.json")) as Record<
  string,
  Record<string, { category: string; source: string; mockResponse?: unknown }>
>;

export function makeFailure(over: Partial<FailureRecord> = {}): FailureRecord {
  return {
    id: "x.spec.ts:1 [chromium]",
    title: "t",
    file: "x.spec.ts",
    line: 1,
    project: "chromium",
    outcome: "unexpected",
    attempts: [{ retry: 0, status: "failed", durationMs: 10 }],
    errorMessage: "boom",
    stdout: [],
    stderr: [],
    attachments: [],
    ...over,
  };
}
