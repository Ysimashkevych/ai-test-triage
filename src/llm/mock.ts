import type { LLMClient, LlmRequest } from "./types.js";

export type MockResponder = (req: LlmRequest, callIndex: number) => string | Error | Promise<string | Error>;

/**
 * Deterministic, offline LLM stand-in. Records every request so tests can assert
 * on what would have been sent (e.g. that secrets were redacted).
 */
export class MockLLM implements LLMClient {
  readonly name = "mock-llm";
  readonly calls: LlmRequest[] = [];

  constructor(private readonly responder: MockResponder) {}

  /** Answer from a map keyed by the `Failure ID:` line in the prompt. */
  static byFailureId(answers: Record<string, unknown>): MockLLM {
    return new MockLLM((req) => {
      const id = /^Failure ID: (.+)$/m.exec(req.user)?.[1];
      const answer = id ? answers[id] : undefined;
      if (answer === undefined) return new Error(`MockLLM: no canned answer for "${id}"`);
      return typeof answer === "string" ? answer : JSON.stringify(answer);
    });
  }

  /** Return the given responses in order (last one repeats). */
  static sequence(...items: (string | Error)[]): MockLLM {
    return new MockLLM((_r, i) => items[Math.min(i, items.length - 1)] as string | Error);
  }

  async complete(req: LlmRequest): Promise<string> {
    const idx = this.calls.length;
    this.calls.push(req);
    const out = await this.responder(req, idx);
    if (out instanceof Error) throw out;
    return out;
  }
}
