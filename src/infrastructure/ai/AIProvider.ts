export const AI_PROVIDER_CONTRACT_VERSION = "ai-provider-v1" as const;

export type AIProviderErrorCode =
  "AI_INVALID_REQUEST" | "AI_UNAVAILABLE" | "AI_PROVIDER_FAILED";

export class AIProviderError extends Error {
  readonly name = "AIProviderError";

  constructor(
    readonly code: AIProviderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type AIAvailability = Readonly<{
  providerId: string;
  model: string | null;
  available: boolean;
  reason: string | null;
}>;

export type AIGenerationRequest = Readonly<{
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
}>;

export type AIGenerationResponse = Readonly<{
  providerId: string;
  model: string;
  text: string;
  finishReason: "stop" | "length";
}>;

export type AIEmbeddingRequest = Readonly<{
  texts: readonly string[];
  model?: string;
}>;

export type AIEmbeddingResponse = Readonly<{
  providerId: string;
  model: string;
  dimensions: number;
  vectors: readonly (readonly number[])[];
}>;

export interface AIProvider {
  availability(): Promise<AIAvailability>;
  generate(request: AIGenerationRequest): Promise<AIGenerationResponse>;
  embed(request: AIEmbeddingRequest): Promise<AIEmbeddingResponse>;
}
