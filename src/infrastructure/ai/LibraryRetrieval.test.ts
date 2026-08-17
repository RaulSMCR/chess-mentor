import { describe, expect, it } from "vitest";

import goldenEntries from "../../../fixtures/phase4/catalog/golden.entries.json";

import type { AIProvider } from "./AIProvider";
import { FakeAIProvider } from "./FakeAIProvider";
import {
  embedLibraryDocument,
  type EmbeddedDocumentV1,
  type EmbeddingProfileV1,
} from "./EmbeddingPipeline";
import { retrieveLibrary } from "./LibraryRetrieval";
import { buildLibraryIndexFromEntries } from "../library/index/LibraryCatalogIndex";
import type { LibraryCatalogEntryV1 } from "../library/catalog/LibraryCatalogRepository";

const entries = goldenEntries as unknown as readonly LibraryCatalogEntryV1[];
const profile: EmbeddingProfileV1 = {
  embeddingVersion: "fixture-embedding-v1",
  model: "fixture-model-v1",
  dimensions: 4,
};
const query = "evaluacion posicional";

function createIndex() {
  return buildLibraryIndexFromEntries(entries);
}

async function createDocuments(
  provider: FakeAIProvider = new FakeAIProvider({
    model: profile.model,
    embeddingDimensions: profile.dimensions,
  }),
): Promise<readonly EmbeddedDocumentV1[]> {
  return Promise.all(
    entries.map((entry) =>
      embedLibraryDocument(
        {
          importKey: entry.importKey,
          title: entry.title,
          source: entry.source,
          chunks: entry.chunks,
        },
        profile,
        provider,
      ),
    ),
  );
}

describe("retrieveLibrary", () => {
  it("usa embeddings compatibles y conserva la procedencia del chunk", async () => {
    const provider = new FakeAIProvider({
      model: profile.model,
      embeddingDimensions: profile.dimensions,
    });
    const response = await retrieveLibrary(
      createIndex(),
      await createDocuments(provider),
      query,
      profile,
      provider,
      { limit: 1 },
    );

    expect(response).toMatchObject({
      version: "library-retrieval-v1",
      mode: "semantic",
      reason: null,
    });
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      mode: "semantic",
      sourceSha256: expect.stringMatching(/^[a-f]{64}$/),
      mediaType: expect.any(String),
      text: expect.any(String),
      locator: expect.any(Object),
      matchedTerms: [],
    });
    expect(response.results[0]?.score).toEqual(expect.any(Number));
  });

  it("degrada a busqueda textual cuando no hay proveedor o embeddings", async () => {
    const index = createIndex();
    const documents = await createDocuments();
    const withoutProvider = await retrieveLibrary(
      index,
      documents,
      query,
      profile,
    );
    const withoutEmbeddings = await retrieveLibrary(
      index,
      [],
      query,
      profile,
      new FakeAIProvider({
        model: profile.model,
        embeddingDimensions: profile.dimensions,
      }),
    );

    expect(withoutProvider).toMatchObject({
      mode: "textual_fallback",
      reason: "no_provider",
    });
    expect(withoutProvider.results[0]).toMatchObject({
      mode: "textual_fallback",
      importKey: entries[1]?.importKey,
      chunkId: "chunk-pos-0",
    });
    expect(withoutEmbeddings).toMatchObject({
      mode: "textual_fallback",
      reason: "no_embeddings",
    });
    expect(withoutEmbeddings.results).toHaveLength(1);
  });

  it("degrada sin romper la consulta si el proveedor no esta disponible o falla", async () => {
    const index = createIndex();
    const documents = await createDocuments();
    const unavailable = new FakeAIProvider({
      model: profile.model,
      embeddingDimensions: profile.dimensions,
      available: false,
    });
    const failing: AIProvider = {
      availability: async () => ({
        providerId: "fixture-failing",
        model: profile.model,
        available: true,
        reason: null,
      }),
      generate: async () => {
        throw new Error("not used");
      },
      embed: async () => {
        throw new Error("fixture transport failure");
      },
    };

    const unavailableResponse = await retrieveLibrary(
      index,
      documents,
      query,
      profile,
      unavailable,
    );
    const failedResponse = await retrieveLibrary(
      index,
      documents,
      query,
      profile,
      failing,
    );

    expect(unavailableResponse).toMatchObject({
      mode: "textual_fallback",
      reason: "provider_unavailable",
    });
    expect(failedResponse).toMatchObject({
      mode: "textual_fallback",
      reason: "provider_failed",
    });
    expect(failedResponse.results).toHaveLength(1);
  });

  it("rechaza perfiles invalidos y degrada documentos incompatibles", async () => {
    const index = createIndex();
    const documents = await createDocuments();
    const incompatible = documents.map((document, index) =>
      index === 0
        ? { ...document, embeddingVersion: "other-embedding-v1" }
        : document,
    );
    const provider = new FakeAIProvider({
      model: profile.model,
      embeddingDimensions: profile.dimensions,
    });

    await expect(
      retrieveLibrary(index, documents, query, {
        ...profile,
        dimensions: 0,
      }),
    ).rejects.toMatchObject({ code: "LIBRARY_RETRIEVAL_INVALID_INPUT" });

    const response = await retrieveLibrary(
      index,
      incompatible,
      query,
      profile,
      provider,
    );
    expect(response).toMatchObject({
      mode: "textual_fallback",
      reason: "profile_mismatch",
    });
    expect(response.results[0]?.mode).toBe("textual_fallback");
  });

  it("mantiene la validacion textual de consultas vacias", async () => {
    await expect(
      retrieveLibrary(createIndex(), [], "   ", profile),
    ).rejects.toMatchObject({ code: "LIBRARY_SEARCH_INVALID_QUERY" });
  });
});
