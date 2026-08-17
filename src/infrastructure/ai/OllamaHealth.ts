export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434" as const;
export const OLLAMA_HEALTH_PATHS = ["/api/tags", "/api/ps"] as const;

export type OllamaHealthPath = (typeof OLLAMA_HEALTH_PATHS)[number];

export type OllamaHealthErrorCode =
  "OLLAMA_INVALID_REQUEST" | "OLLAMA_INVALID_RESPONSE";

export class OllamaHealthError extends Error {
  readonly name = "OllamaHealthError";

  constructor(
    readonly code: OllamaHealthErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type OllamaHttpResponse = Readonly<{
  status: number;
  json(): Promise<unknown>;
}>;

export interface OllamaHttpClient {
  get(path: OllamaHealthPath): Promise<OllamaHttpResponse>;
}

export type OllamaFetch = (
  input: string,
  init: Readonly<{ method: "GET" }>,
) => Promise<OllamaHttpResponse>;

export type OllamaModelState =
  "none_installed" | "installed_not_running" | "running";

export type OllamaHealth = Readonly<{
  providerId: "ollama";
  service: "available" | "unavailable";
  modelState: OllamaModelState;
  installedModels: readonly string[];
  runningModels: readonly string[];
  reason: string | null;
}>;

export type OllamaHttpClientOptions = Readonly<{
  baseUrl?: string;
  fetchImpl?: OllamaFetch;
}>;

type EndpointResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; reason: string }>;

function invalidRequest(message: string): never {
  throw new OllamaHealthError("OLLAMA_INVALID_REQUEST", message);
}

function invalidResponse(message: string, cause?: unknown): never {
  throw new OllamaHealthError("OLLAMA_INVALID_RESPONSE", message, { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    invalidRequest("baseUrl debe ser una URL no vacia.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    invalidRequest(`baseUrl no es una URL valida: ${String(cause)}`);
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    invalidRequest("Ollama solo puede configurarse en http://127.0.0.1.");
  }
  return url.toString().replace(/\/$/, "");
}

export function createOllamaHttpClient(
  options: OllamaHttpClientOptions = {},
): OllamaHttpClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL);
  const fetchImpl =
    options.fetchImpl ??
    (typeof globalThis.fetch === "function"
      ? (input, init) => globalThis.fetch(input, init)
      : undefined);
  if (fetchImpl === undefined) {
    invalidRequest("El runtime no expone fetch para consultar Ollama.");
  }
  return {
    get: (path) => fetchImpl(`${baseUrl}${path}`, { method: "GET" }),
  };
}

async function requestEndpoint(
  client: OllamaHttpClient,
  path: OllamaHealthPath,
): Promise<EndpointResult> {
  let response: OllamaHttpResponse;
  try {
    response = await client.get(path);
  } catch {
    return { ok: false, reason: "request_failed" };
  }
  if (
    !isRecord(response) ||
    typeof response.status !== "number" ||
    !Number.isInteger(response.status) ||
    typeof response.json !== "function"
  ) {
    invalidResponse(`La respuesta de ${path} no cumple el contrato.`);
  }
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: `http_${response.status}` };
  }
  try {
    return { ok: true, value: await response.json() };
  } catch (cause) {
    invalidResponse(`El JSON de ${path} no pudo leerse.`, cause);
  }
}

function modelNames(value: unknown, path: OllamaHealthPath): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    invalidResponse(`La respuesta de ${path} no contiene models.`);
  }
  const names = new Set<string>();
  for (const [index, model] of value.models.entries()) {
    if (!isRecord(model) || typeof model.name !== "string") {
      invalidResponse(`El modelo ${index} de ${path} no tiene name.`);
    }
    const name = model.name.trim();
    if (name === "")
      invalidResponse(`El modelo ${index} de ${path} esta vacio.`);
    names.add(name);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function modelState(
  installedModels: readonly string[],
  runningModels: readonly string[],
): OllamaModelState {
  if (runningModels.length > 0) return "running";
  if (installedModels.length > 0) return "installed_not_running";
  return "none_installed";
}

function unavailableReason(
  tags: EndpointResult,
  ps: EndpointResult,
): string | null {
  if (!tags.ok) return `tags:${tags.reason}`;
  if (!ps.ok) return `ps:${ps.reason}`;
  return null;
}

export async function probeOllamaHealth(
  client: OllamaHttpClient,
): Promise<OllamaHealth> {
  if (
    client === null ||
    typeof client !== "object" ||
    typeof client.get !== "function"
  ) {
    invalidRequest("El cliente HTTP de Ollama no cumple el contrato.");
  }
  const [tags, ps] = await Promise.all([
    requestEndpoint(client, "/api/tags"),
    requestEndpoint(client, "/api/ps"),
  ]);
  if (!tags.ok || !ps.ok) {
    return {
      providerId: "ollama",
      service: "unavailable",
      modelState: "none_installed",
      installedModels: [],
      runningModels: [],
      reason: unavailableReason(tags, ps),
    };
  }
  const installedModels = modelNames(tags.value, "/api/tags");
  const runningModels = modelNames(ps.value, "/api/ps");
  return {
    providerId: "ollama",
    service: "available",
    modelState: modelState(installedModels, runningModels),
    installedModels,
    runningModels,
    reason: null,
  };
}
