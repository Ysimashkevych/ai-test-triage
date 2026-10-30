import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface PromptTemplate {
  version: string;
  system: string;
  user: string;
}

const dir = (v: string, f: string) => new URL(`./${v}/${f}`, import.meta.url);

export function availableVersions(): string[] {
  return readdirSync(fileURLToPath(new URL("./", import.meta.url)), { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

export function loadPrompt(version = "v1"): PromptTemplate {
  if (!/^v\d+$/.test(version)) throw new Error(`Invalid prompt version "${version}"`);
  try {
    return {
      version,
      system: readFileSync(dir(version, "system.md"), "utf8").trim(),
      user: readFileSync(dir(version, "user.md"), "utf8").trim(),
    };
  } catch {
    throw new Error(`Prompt version "${version}" not found. Available: ${availableVersions().join(", ")}`);
  }
}

export function render(template: string, vars: Record<string, string>): string {
  // single pass: values are never re-scanned, so log content cannot inject placeholders
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? "");
}
