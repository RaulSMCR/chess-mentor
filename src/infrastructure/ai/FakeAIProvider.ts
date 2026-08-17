import {
  AIProviderError,
  type AIAvailability,
  type AIEmbeddingRequest,
  type AIEmbeddingResponse,
  type AIProvider,
  type AIGenerationRequest,
  type AIGenerationResponse,
} from "./AIProvider";

export type FakeAIProviderOptions = Readonly<{
  providerId?: string;
  model?: string;
  available?: boolean;
  unavailableReason?: string;
  generationPrefix?: string;
  embeddingDimensions?: number;
}>;

type NormalizedGenerationRequest = Readonly<{
  prompt: string;
  system: string | null;
  model: string | null;
  maxTokens: number | null;
}>;

type NormalizedEmbeddingRequest = Readonly<{
  texts: readonly string[];
  model: string | null;
}>;

function invalid(message: string): never {
  throw new AIProviderError("AI_INVALID_REQUEST", message);
}

function unavailable(providerId: string, reason: string): never {
  throw new AIProviderError(
    "AI_UNAVAILABLE",
    `El proveedor ${providerId} no esta disponible: ${reason}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    invalid(`${field} debe ser un texto no vacio.`);
  }
  return value.trim();
}

function optionalModel(value: unknown): string | null {
  if (value === undefined) return null;
  return requiredText(value, "model");
}

function normalizeGenerationRequest(
  value: unknown,
): NormalizedGenerationRequest {
  if (!isRecord(value)) invalid("La solicitud de generacion es invalida.");
  const prompt = requiredText(value.prompt, "prompt");
  const system =
    value.system === undefined ? null : requiredText(value.system, "system");
  const model = optionalModel(value.model);
  let maxTokens: number | null = null;
  if (value.maxTokens !== undefined) {
    if (
      typeof value.maxTokens !== "number" ||
      !Number.isInteger(value.maxTokens) ||
      value.maxTokens < 1 ||
      value.maxTokens > 16_384
    ) {
      invalid("maxTokens debe ser un entero entre 1 y 16384.");
    }
    maxTokens = value.maxTokens;
  }
  return { prompt, system, model, maxTokens };
}

function normalizeEmbeddingRequest(value: unknown): NormalizedEmbeddingRequest {
  if (!isRecord(value) || !Array.isArray(value.texts)) {
    invalid("La solicitud de embeddings es invalida.");
  }
  if (value.texts.length === 0) {
    invalid("texts debe contener al menos un texto.");
  }
  const texts = value.texts.map((text, index) =>
    requiredText(text, `texts[${index}]`),
  );
  return { texts, model: optionalModel(value.model) };
}

function validateOptionText(value: string | undefined, field: string): string {
  if (value !== undefined && value.trim() === "")
    invalid(`${field} no puede estar vacio.`);
  return value ?? "";
}

function validateDimensions(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 4096) {
    invalid("embeddingDimensions debe ser un entero entre 1 y 4096.");
  }
  return value;
}

function vectorFor(text: string, dimensions: number): readonly number[] {
  const values = Array.from({ length: dimensions }, () => 0);
  let codeUnits = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    values[codeUnits % dimensions] += codePoint;
    codeUnits += 1;
  }
  const divisor = Math.max(1, codeUnits);
  return values.map((value) => Number((value / divisor).toFixed(6)));
}

export class FakeAIProvider implements AIProvider {
  private readonly providerId: string;
  private readonly model: string;
  private readonly available: boolean;
  private readonly unavailableReason: string;
  private readonly generationPrefix: string;
  private readonly embeddingDimensions: number;

  constructor(options: FakeAIProviderOptions = {}) {
    this.providerId = requiredText(
      options.providerId ?? "fake-ai",
      "providerId",
    );
    this.model = requiredText(options.model ?? "fixture-model-v1", "model");
    this.available = options.available ?? true;
    this.unavailableReason = validateOptionText(
      options.unavailableReason,
      "unavailableReason",
    );
    this.generationPrefix = validateOptionText(
      options.generationPrefix,
      "generationPrefix",
    );
    this.embeddingDimensions = validateDimensions(
      options.embeddingDimensions ?? 4,
    );
  }

  async availability(): Promise<AIAvailability> {
    return {
      providerId: this.providerId,
      model: this.model,
      available: this.available,
      reason: this.available
        ? null
        : this.unavailableReason || "fixture offline",
    };
  }

  async generate(request: AIGenerationRequest): Promise<AIGenerationResponse> {
    const normalized = normalizeGenerationRequest(request);
    if (!this.available)
      unavailable(this.providerId, this.unavailableReason || "fixture offline");
    const context =
      normalized.system === null
        ? normalized.prompt
        : `${normalized.system}\n${normalized.prompt}`;
    return {
      providerId: this.providerId,
      model: normalized.model ?? this.model,
      text: `${this.generationPrefix}${context}`,
      finishReason: "stop",
    };
  }

  async embed(request: AIEmbeddingRequest): Promise<AIEmbeddingResponse> {
    const normalized = normalizeEmbeddingRequest(request);
    if (!this.available)
      unavailable(this.providerId, this.unavailableReason || "fixture offline");
    return {
      providerId: this.providerId,
      model: normalized.model ?? this.model,
      dimensions: this.embeddingDimensions,
      vectors: normalized.texts.map((text) =>
        vectorFor(text, this.embeddingDimensions),
      ),
    };
  }
}
