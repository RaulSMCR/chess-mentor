import { describe, expect, it } from "vitest";

import { AIProviderError } from "./AIProvider";
import { FakeAIProvider } from "./FakeAIProvider";

describe("FakeAIProvider", () => {
  it("informa disponibilidad y produce generacion y embeddings reproducibles", async () => {
    const provider = new FakeAIProvider({
      providerId: "fixture-provider",
      model: "fixture-model",
      generationPrefix: "fixture: ",
      embeddingDimensions: 3,
    });
    const request = {
      system: "Responde breve.",
      prompt: "Explica la clavada.",
      maxTokens: 32,
    } as const;
    const firstGeneration = await provider.generate(request);
    const secondGeneration = await provider.generate(request);
    const firstEmbedding = await provider.embed({
      texts: ["clavada", "amenaza"],
    });
    const secondEmbedding = await provider.embed({
      texts: ["clavada", "amenaza"],
    });

    await expect(provider.availability()).resolves.toEqual({
      providerId: "fixture-provider",
      model: "fixture-model",
      available: true,
      reason: null,
    });
    expect(firstGeneration).toEqual(secondGeneration);
    expect(firstGeneration).toEqual({
      providerId: "fixture-provider",
      model: "fixture-model",
      text: "fixture: Responde breve.\nExplica la clavada.",
      finishReason: "stop",
    });
    expect(firstEmbedding).toEqual(secondEmbedding);
    expect(firstEmbedding.dimensions).toBe(3);
    expect(firstEmbedding.vectors).toHaveLength(2);
    expect(firstEmbedding.vectors[0]).toHaveLength(3);
    expect(firstEmbedding.vectors[0]).not.toEqual(firstEmbedding.vectors[1]);
  });

  it("conserva el orden de entradas y no muta las solicitudes", async () => {
    const provider = new FakeAIProvider();
    const texts = ["primero", "segundo"];
    const before = [...texts];
    const response = await provider.embed({ texts });
    texts[0] = "mutado";

    expect(texts).toEqual(["mutado", "segundo"]);
    expect(before).toEqual(["primero", "segundo"]);
    expect(response.vectors).toHaveLength(2);
    expect(
      await provider.generate({ prompt: "hola", model: "override-model" }),
    ).toMatchObject({ model: "override-model", text: "hola" });
  });

  it("expone indisponibilidad sin convertirla en exito", async () => {
    const provider = new FakeAIProvider({
      available: false,
      unavailableReason: "modelo no instalado",
    });

    await expect(provider.availability()).resolves.toMatchObject({
      available: false,
      reason: "modelo no instalado",
    });
    await expect(provider.generate({ prompt: "hola" })).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
    await expect(provider.embed({ texts: ["hola"] })).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
  });

  it("rechaza solicitudes y opciones invalidas con errores tipados", async () => {
    const provider = new FakeAIProvider();

    await expect(provider.generate({ prompt: "" })).rejects.toBeInstanceOf(
      AIProviderError,
    );
    await expect(
      provider.generate({ prompt: "hola", maxTokens: 0 }),
    ).rejects.toMatchObject({ code: "AI_INVALID_REQUEST" });
    await expect(provider.embed({ texts: [] })).rejects.toMatchObject({
      code: "AI_INVALID_REQUEST",
    });
    await expect(
      provider.embed({ texts: ["hola", " "] }),
    ).rejects.toMatchObject({ code: "AI_INVALID_REQUEST" });
    expect(() => new FakeAIProvider({ embeddingDimensions: 0 })).toThrowError(
      expect.objectContaining({ code: "AI_INVALID_REQUEST" }),
    );
  });
});
