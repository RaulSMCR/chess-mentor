import { describe, expect, it, vi } from "vitest";

import {
  EngineAdapterError,
  type AnalysisRequest,
  type EngineAdapter,
  type EngineLine,
} from "@/engine/EngineAdapter";
import { EngineSession } from "@/engine/EngineSession";
import { FakeEngineAdapter } from "@/engine/FakeEngineAdapter";
import {
  generateEngineVariant,
  MAX_VARIANT_PLIES,
  TrainerEngineVariantRunner,
} from "./engineVariant";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("engineVariant", () => {
  it("genera una variante determinista de hasta cuatro plies", async () => {
    const runner = new TrainerEngineVariantRunner(new FakeEngineAdapter());

    const result = await runner.generate({ fen: STANDARD_FEN });
    await runner.dispose();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.variant.pv.length).toBeLessThanOrEqual(MAX_VARIANT_PLIES);
    expect(result.variant.pv.length).toBeGreaterThan(0);
    expect(result.variant.bestmove).toBe(result.variant.pv[0]);
  });

  it("devuelve un diagnóstico tipado si el FEN no es válido o el motor falla", async () => {
    const adapter: EngineAdapter = {
      analyze: () => {
        throw new EngineAdapterError("INVALID_FEN", "FEN inválido");
      },
      cancel: async () => undefined,
      dispose: async () => undefined,
    };
    const session = new EngineSession(adapter);

    await expect(generateEngineVariant(session, { fen: " " })).resolves.toEqual(
      {
        ok: false,
        diagnostic: {
          code: "INVALID_FEN",
          message: "El FEN del ejercicio es obligatorio.",
        },
      },
    );
    await expect(
      generateEngineVariant(session, { fen: STANDARD_FEN }),
    ).resolves.toMatchObject({
      ok: false,
      diagnostic: { code: "INVALID_FEN", engineCode: "INVALID_FEN" },
    });
    await session.dispose();
  });

  it("permite una posición sin variante sin convertirla en error de ejercicio", async () => {
    const adapter: EngineAdapter = {
      analyze: (): AsyncIterable<EngineLine> =>
        (async function* () {
          yield {
            multipv: 1,
            depth: 8,
            score: { kind: "cp", value: 0 },
            pv: [],
            bestmove: "0000",
          } satisfies EngineLine;
        })(),
      cancel: async () => undefined,
      dispose: async () => undefined,
    };
    const session = new EngineSession(adapter);

    await expect(
      generateEngineVariant(session, { fen: STANDARD_FEN }),
    ).resolves.toEqual({
      ok: false,
      diagnostic: {
        code: "NO_VARIATION",
        message: "El motor no devolvió una variante para esta posición.",
      },
    });
    await session.dispose();
  });

  it("cancela la solicitud obsoleta al iniciar otra", async () => {
    const requests: AnalysisRequest[] = [];
    const cancelled: string[] = [];
    const streams = new Map<string, { end: () => void }>();
    const adapter: EngineAdapter = {
      analyze: (request) => {
        requests.push(request);
        let finish: (() => void) | undefined;
        const stream = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const iterable = (async function* () {
          await stream;
          yield {
            multipv: 1,
            depth: 8,
            score: { kind: "cp", value: 1 },
            pv: ["e2e4"],
            bestmove: "e2e4",
          } satisfies EngineLine;
        })();
        streams.set(request.requestId, { end: () => finish?.() });
        return iterable;
      },
      cancel: async (requestId) => {
        cancelled.push(requestId);
        streams.get(requestId)?.end();
      },
      dispose: async () => undefined,
    };
    const runner = new TrainerEngineVariantRunner(adapter);

    const first = runner.generate({ fen: STANDARD_FEN });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const second = runner.generate({ fen: STANDARD_FEN });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    streams.get(requests[1]?.requestId ?? "")?.end();
    const firstResult = await first;
    const secondResult = await second;

    expect(firstResult).toMatchObject({
      ok: false,
      diagnostic: { code: "NO_VARIATION" },
    });
    expect(secondResult).toMatchObject({ ok: true });
    expect(requests).toHaveLength(2);
    expect(cancelled).toEqual([requests[0]?.requestId]);
    await runner.dispose();
  });
});
