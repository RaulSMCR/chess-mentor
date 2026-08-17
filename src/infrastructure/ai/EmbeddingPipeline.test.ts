import { describe, expect, it } from "vitest";

import type { AIProvider, AIEmbeddingResponse } from "./AIProvider";
import {
  assertEmbeddingProfileCompatible,
  embedLibraryDocument,
  EmbeddingPipelineError,
  type EmbeddingDocumentInputV1,
  type EmbeddingProfileV1,
} from "./EmbeddingPipeline";
import { FakeAIProvider } from "./FakeAIProvider";

const profile: EmbeddingProfileV1 = {
  embeddingVersion: "fixture-embedding-v1",
  model: "fixture-model",
  dimensions: 3,
};

const input: EmbeddingDocumentInputV1 = {
  importKey:
    "txt-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  title: "Fixture positional",
  source: {
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sizeBytes: 128,
    mediaType: "text/plain",
    fileName: "fixture.txt",
  },
  chunks: [
    {
      id: "chunk-0",
      ordinal: 0,
      text: "La evaluacion posicional requiere espacio.",
      locator: { kind: "offset", unit: "utf8-byte", startByte: 0, endByte: 45 },
    },
    {
      id: "chunk-1",
      ordinal: 1,
      text: "La clavada gana tiempo.",
      locator: {
        kind: "offset",
        unit: "utf8-byte",
        startByte: 46,
        endByte: 70,
      },
    },
  ],
};

function countingProvider(provider: AIProvider): {
  provider: AIProvider;
  calls: () => number;
} {
  let calls = 0;
  return {
    provider: {
      availability: (...args) => provider.availability(...args),
      generate: (...args) => provider.generate(...args),
      embed: async (request) => {
        calls += 1;
        return provider.embed(request);
      },
    },
    calls: () => calls,
  };
}

function fixedProvider(model: string, dimensions: number): AIProvider {
  return {
    availability: async () => ({
      providerId: "fixture",
      model,
      available: true,
      reason: null,
    }),
    generate: async () => ({
      providerId: "fixture",
      model,
      text: "unused",
      finishReason: "stop",
    }),
    embed: async ({ texts }) => ({
      providerId: "fixture",
      model,
      dimensions,
      vectors: texts.map(() => Array.from({ length: dimensions }, () => 0)),
    }),
  };
}

describe("EmbeddingPipeline", () => {
  it("vectoriza un lote, conserva procedencia y mantiene el perfil", async () => {
    const counted = countingProvider(
      new FakeAIProvider({ model: profile.model, embeddingDimensions: 3 }),
    );
    const document = await embedLibraryDocument(
      input,
      profile,
      counted.provider,
    );
    const repeated = await embedLibraryDocument(
      input,
      profile,
      counted.provider,
    );

    expect(counted.calls()).toBe(2);
    expect(document).toEqual(repeated);
    expect(document).toMatchObject({
      schemaVersion: 1,
      embeddingVersion: profile.embeddingVersion,
      importKey: input.importKey,
      title: input.title,
      source: input.source,
      model: profile.model,
      dimensions: 3,
    });
    expect(document.chunks.map((chunk) => chunk.id)).toEqual([
      "chunk-0",
      "chunk-1",
    ]);
    expect(document.chunks.map((chunk) => chunk.locator)).toEqual(
      input.chunks.map((chunk) => chunk.locator),
    );
    expect(document.chunks.every((chunk) => chunk.vector)).toBe(true);
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  it("valida compatibilidad y no llama al proveedor para un documento vacio", async () => {
    const counted = countingProvider(
      new FakeAIProvider({ model: profile.model, embeddingDimensions: 3 }),
    );
    const empty = await embedLibraryDocument(
      { ...input, chunks: [] },
      profile,
      counted.provider,
    );

    expect(empty.chunks).toEqual([]);
    expect(counted.calls()).toBe(0);
    expect(() =>
      assertEmbeddingProfileCompatible(empty, profile),
    ).not.toThrow();
    expect(() =>
      assertEmbeddingProfileCompatible(empty, {
        ...profile,
        dimensions: 4,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_MISMATCH" }),
    );
  });

  it("rechaza modelo o dimension incompatibles y respuestas parciales", async () => {
    await expect(
      embedLibraryDocument(input, profile, fixedProvider("other-model", 3)),
    ).rejects.toMatchObject({ code: "EMBEDDING_PROFILE_MISMATCH" });
    await expect(
      embedLibraryDocument(input, profile, fixedProvider(profile.model, 2)),
    ).rejects.toMatchObject({ code: "EMBEDDING_PROFILE_MISMATCH" });

    const malformed: AIProvider = {
      availability: async () => ({
        providerId: "fixture",
        model: profile.model,
        available: true,
        reason: null,
      }),
      generate: async () => ({
        providerId: "fixture",
        model: profile.model,
        text: "unused",
        finishReason: "stop",
      }),
      embed: async (): Promise<AIEmbeddingResponse> => ({
        providerId: "fixture",
        model: profile.model,
        dimensions: profile.dimensions,
        vectors: [[0, 0, 0]],
      }),
    };
    await expect(
      embedLibraryDocument(input, profile, malformed),
    ).rejects.toMatchObject({ code: "EMBEDDING_PROVIDER_FAILED" });
  });

  it("rechaza documentos y perfiles invalidos antes de producir salida", async () => {
    await expect(
      embedLibraryDocument(
        {
          ...input,
          chunks: [
            { ...input.chunks[0]!, ordinal: 1 },
            { ...input.chunks[1]!, ordinal: 1 },
          ],
        },
        profile,
        new FakeAIProvider({ model: profile.model, embeddingDimensions: 3 }),
      ),
    ).rejects.toBeInstanceOf(EmbeddingPipelineError);
    await expect(
      embedLibraryDocument(
        input,
        { ...profile, dimensions: 0 },
        new FakeAIProvider({ model: profile.model, embeddingDimensions: 3 }),
      ),
    ).rejects.toMatchObject({ code: "EMBEDDING_INVALID_INPUT" });
  });
});
