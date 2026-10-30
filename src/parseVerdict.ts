import { LlmVerdictSchema, type LlmVerdict } from "./types.js";

export class OutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputValidationError";
  }
}

/** Extract the first balanced JSON object from model text (tolerates fences/prose). */
export function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function parseVerdict(text: string): LlmVerdict {
  const raw = extractJson(text);
  if (!raw) throw new OutputValidationError("No JSON object found in model output");
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    throw new OutputValidationError(`Model output is not valid JSON: ${(e as Error).message}`);
  }
  const r = LlmVerdictSchema.safeParse(obj);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new OutputValidationError(`Schema validation failed: ${msg}`);
  }
  return r.data;
}
