import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  ENGINE_LIMITS,
  type AnalysisRequest,
  type EngineLine,
} from "./EngineAdapter";
import { FakeEngineAdapter } from "./FakeEngineAdapter";

const START_FEN = new Chess().fen();

const request = (
  overrides: Partial<AnalysisRequest> = {},
): AnalysisRequest => ({
  requestId: "request-1",
  fen: START_FEN,
  depth: 4,
  multiPv: 3,
  ...overrides,
});

async function collect(
  iterable: AsyncIterable<EngineLine>,
): Promise<EngineLine[]> {
  const lines: EngineLine[] = [];
  for await (const line of iterable) {
    lines.push(line);
  }
  return lines;
}

function replayUci(fen: string, pv: readonly string[]): void {
  const chess = new Chess(fen);
  for (const uci of pv) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.slice(4) || undefined;
    chess.move({ from, to, ...(promotion === undefined ? {} : { promotion }) });
  }
}

describe("FakeEngineAdapter", () => {
  it("produce líneas legales, ordenadas y deterministas", async () => {
    const adapter = new FakeEngineAdapter();
    const first = await collect(adapter.analyze(request()));
    const second = await collect(
      adapter.analyze(request({ requestId: "request-2" })),
    );

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.map((line) => line.multipv)).toEqual([1, 2, 3]);
    expect(first.every((line) => line.depth === 4)).toBe(true);
    expect(first.every((line) => line.score.kind === "cp")).toBe(true);
    for (const line of first) {
      expect(line.bestmove).toBe(line.pv[0]);
      replayUci(START_FEN, line.pv);
    }
  });

  it("rechaza límites y FEN inválido con errores tipados", () => {
    const adapter = new FakeEngineAdapter();
    const invalid = (overrides: Partial<AnalysisRequest>) =>
      adapter.analyze(request(overrides));

    expect(() => invalid({ depth: ENGINE_LIMITS.minDepth - 1 })).toThrowError(
      expect.objectContaining({ code: "INVALID_DEPTH" }),
    );
    expect(() =>
      invalid({ multiPv: ENGINE_LIMITS.maxMultiPv + 1 }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_MULTIPV" }));
    expect(() => invalid({ fen: "not-a-fen" })).toThrowError(
      expect.objectContaining({ code: "INVALID_FEN" }),
    );
  });

  it("cancela por requestId y no entrega líneas posteriores", async () => {
    const adapter = new FakeEngineAdapter();
    const iterator = adapter.analyze(request())[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    await adapter.cancel("request-1");

    const afterCancel = await iterator.next();
    expect(afterCancel.done).toBe(true);
  });

  it("libera las solicitudes y rechaza análisis nuevos después de dispose", async () => {
    const adapter = new FakeEngineAdapter();
    const iterator = adapter.analyze(request())[Symbol.asyncIterator]();
    await adapter.dispose();

    expect((await iterator.next()).done).toBe(true);
    await expect(
      Promise.resolve().then(() => adapter.analyze(request())),
    ).rejects.toEqual(expect.objectContaining({ code: "DISPOSED" }));
  });
});
