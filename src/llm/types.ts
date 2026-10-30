export interface LlmRequest {
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
}

/** The only surface the triage engine knows about. Implement this to add a provider. */
export interface LLMClient {
  readonly name: string;
  complete(req: LlmRequest): Promise<string>;
}

export class LlmError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly status?: number) {
    super(message);
    this.name = "LlmError";
  }
}
