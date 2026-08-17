import { describe, expect, it } from "vitest";

import {
  createOllamaHttpClient,
  OllamaHealthError,
  type OllamaFetch,
  type OllamaHttpClient,
  probeOllamaHealth,
} from "./OllamaHealth";

function response(status: number, value: unknown) {
  return {
    status,
    json: async () => value,
  };
}

function clientFor(
  values: Readonly<Record<string, { status: number; value: unknown }>>,
  calls: string[] = [],
): OllamaHttpClient {
  return {
    async get(path) {
      calls.push(path);
      const value = values[path];
      if (value === undefined) throw new Error("missing fixture endpoint");
      return response(value.status, value.value);
    },
  };
}

describe("OllamaHealth", () => {
  it("consulta tags y ps una vez y distingue modelos instalados y cargados", async () => {
    const calls: string[] = [];
    const health = await probeOllamaHealth(
      clientFor(
        {
          "/api/tags": {
            status: 200,
            value: {
              models: [
                { name: "deepseek-r1:32b" },
                { name: "mistral-nemo:12b" },
                { name: "deepseek-r1:32b" },
              ],
            },
          },
          "/api/ps": {
            status: 200,
            value: { models: [{ name: "deepseek-r1:32b" }] },
          },
        },
        calls,
      ),
    );

    expect(health).toEqual({
      providerId: "ollama",
      service: "available",
      modelState: "running",
      installedModels: ["deepseek-r1:32b", "mistral-nemo:12b"],
      runningModels: ["deepseek-r1:32b"],
      reason: null,
    });
    expect(calls).toEqual(["/api/tags", "/api/ps"]);
  });

  it("distingue servicio disponible sin modelos cargados o instalados", async () => {
    const installed = await probeOllamaHealth(
      clientFor({
        "/api/tags": { status: 200, value: { models: [{ name: "mistral" }] } },
        "/api/ps": { status: 200, value: { models: [] } },
      }),
    );
    const empty = await probeOllamaHealth(
      clientFor({
        "/api/tags": { status: 200, value: { models: [] } },
        "/api/ps": { status: 200, value: { models: [] } },
      }),
    );

    expect(installed.modelState).toBe("installed_not_running");
    expect(empty.modelState).toBe("none_installed");
    expect(empty.service).toBe("available");
  });

  it("degrada ante HTTP o transporte ausente sin inventar modelos", async () => {
    const httpFailure = await probeOllamaHealth(
      clientFor({
        "/api/tags": { status: 503, value: { error: "offline" } },
        "/api/ps": { status: 200, value: { models: [] } },
      }),
    );
    const transportFailure: OllamaHttpClient = {
      async get() {
        throw new Error("offline");
      },
    };
    const unavailable = await probeOllamaHealth(transportFailure);

    expect(httpFailure).toMatchObject({
      service: "unavailable",
      modelState: "none_installed",
      installedModels: [],
      runningModels: [],
      reason: "tags:http_503",
    });
    expect(unavailable.reason).toBe("tags:request_failed");
  });

  it("rechaza JSON malformado y URLs que no sean loopback", async () => {
    const malformed = clientFor({
      "/api/tags": {
        status: 200,
        value: { models: [{ model: "missing-name" }] },
      },
      "/api/ps": { status: 200, value: { models: [] } },
    });
    await expect(probeOllamaHealth(malformed)).rejects.toMatchObject({
      code: "OLLAMA_INVALID_RESPONSE",
    });
    expect(() =>
      createOllamaHttpClient({ baseUrl: "http://192.168.1.64:11434" }),
    ).toThrowError(expect.objectContaining({ code: "OLLAMA_INVALID_REQUEST" }));
    expect(() =>
      createOllamaHttpClient({ baseUrl: "https://127.0.0.1:11434" }),
    ).toThrowError(expect.objectContaining({ code: "OLLAMA_INVALID_REQUEST" }));
  });

  it("construye el cliente sin hacer IO hasta invocar get", async () => {
    const calls: Array<{ input: string; method: string }> = [];
    const fetchImpl: OllamaFetch = async (input, init) => {
      calls.push({ input, method: init.method });
      return response(200, { models: [] });
    };
    const client = createOllamaHttpClient({ fetchImpl });

    expect(calls).toEqual([]);
    await client.get("/api/tags");
    expect(calls).toEqual([
      { input: "http://127.0.0.1:11434/api/tags", method: "GET" },
    ]);
  });

  it("rechaza un cliente HTTP invalido", async () => {
    await expect(
      probeOllamaHealth(null as unknown as OllamaHttpClient),
    ).rejects.toBeInstanceOf(OllamaHealthError);
  });
});
