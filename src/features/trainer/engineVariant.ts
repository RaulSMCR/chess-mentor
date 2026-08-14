import {
  EngineAdapterError,
  type EngineAdapter,
  type EngineLine,
  type EngineScore,
} from "@/engine/EngineAdapter";
import {
  EngineSession,
  type EngineSessionOptions,
} from "@/engine/EngineSession";

export const MAX_VARIANT_PLIES = 4 as const;
export const DEFAULT_VARIANT_DEPTH = 8 as const;
export const DEFAULT_VARIANT_MOVETIME_MS = 1_500 as const;

export type EngineVariantRequest = Readonly<{
  fen: string;
  depth?: number;
  movetimeMs?: number;
}>;

export type EngineVariantLine = Readonly<{
  multipv: number;
  depth: number;
  score: EngineScore;
  pv: readonly string[];
  bestmove: string;
}>;

export type EngineVariantDiagnosticCode =
  "INVALID_FEN" | "ENGINE_UNAVAILABLE" | "NO_VARIATION";

export type EngineVariantDiagnostic = Readonly<{
  code: EngineVariantDiagnosticCode;
  message: string;
  engineCode?: EngineAdapterError["code"];
}>;

export type EngineVariantResult =
  | Readonly<{ ok: true; variant: EngineVariantLine }>
  | Readonly<{ ok: false; diagnostic: EngineVariantDiagnostic }>;

function invalidFen(): EngineVariantResult {
  return {
    ok: false,
    diagnostic: {
      code: "INVALID_FEN",
      message: "El FEN del ejercicio es obligatorio.",
    },
  };
}

function unavailable(error: unknown): EngineVariantResult {
  if (error instanceof EngineAdapterError && error.code === "INVALID_FEN") {
    return {
      ok: false,
      diagnostic: {
        code: "INVALID_FEN",
        message: error.message,
        engineCode: error.code,
      },
    };
  }

  return {
    ok: false,
    diagnostic: {
      code: "ENGINE_UNAVAILABLE",
      message:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "El motor no está disponible para generar la variante.",
      ...(error instanceof EngineAdapterError
        ? { engineCode: error.code }
        : {}),
    },
  };
}

function noVariation(): EngineVariantResult {
  return {
    ok: false,
    diagnostic: {
      code: "NO_VARIATION",
      message: "El motor no devolvió una variante para esta posición.",
    },
  };
}

/**
 * Solicita una única línea y devuelve como máximo cuatro plies.
 * EngineSession cancela la solicitud anterior cuando llega una nueva, por lo
 * que una posición obsoleta no puede actualizar el resultado vigente.
 */
export async function generateEngineVariant(
  session: EngineSession,
  request: EngineVariantRequest,
): Promise<EngineVariantResult> {
  if (request.fen.trim().length === 0) return invalidFen();

  let latest: EngineLine | null = null;
  try {
    const stream = await session.analyze({
      fen: request.fen,
      depth: request.depth ?? DEFAULT_VARIANT_DEPTH,
      movetimeMs: request.movetimeMs ?? DEFAULT_VARIANT_MOVETIME_MS,
      multiPv: 1,
    });
    for await (const item of stream) {
      latest = item.line;
    }
  } catch (error) {
    return unavailable(error);
  }

  if (latest === null || latest.pv.length === 0) return noVariation();

  return {
    ok: true,
    variant: {
      multipv: latest.multipv,
      depth: latest.depth,
      score: latest.score,
      pv: latest.pv.slice(0, MAX_VARIANT_PLIES),
      bestmove: latest.bestmove,
    },
  };
}

/** Agrupa una sesión reutilizable para que las solicitudes nuevas cancelen las obsoletas. */
export class TrainerEngineVariantRunner {
  private readonly session: EngineSession;

  constructor(adapter: EngineAdapter, options?: EngineSessionOptions) {
    this.session = new EngineSession(adapter, options);
  }

  generate(request: EngineVariantRequest): Promise<EngineVariantResult> {
    return generateEngineVariant(this.session, request);
  }

  cancel(): Promise<void> {
    return this.session.cancel();
  }

  dispose(): Promise<void> {
    return this.session.dispose();
  }
}
