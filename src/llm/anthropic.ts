import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type LLMClient, type LlmRequest } from "./types.js";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export class AnthropicClient implements LLMClient {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (omit --llm for heuristics only)");
    // SDK-level retries disabled: retry/timeout policy lives in one place (src/retry.ts)
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
    this.name = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async complete(req: LlmRequest): Promise<string> {
    try {
      const res = await this.client.messages.create(
        {
          model: this.name,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        },
        req.signal ? { signal: req.signal } : undefined,
      );
      const stop = res.stop_reason as string | null;
      // Re-sending the same prompt would hit the same wall, so neither is retryable.
      if (stop === "refusal") throw new LlmError("Model refused to answer", false);
      if (stop === "max_tokens") throw new LlmError(`Output hit max_tokens (${req.maxTokens}); raise --max-tokens`, false);
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof Anthropic.APIError && e.status !== undefined) {
        const retryable = e.status === 408 || e.status === 409 || e.status === 429 || e.status >= 500;
        throw new LlmError(`Anthropic API ${e.status}: ${e.message}`, retryable, e.status);
      }
      if (e instanceof Anthropic.APIConnectionError) throw new LlmError(`Anthropic connection error: ${e.message}`, true);
      throw e;
    }
  }
}
