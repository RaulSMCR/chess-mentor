import { describe, expect, it } from "vitest";

import type { AnalysisRequest, EngineLine } from "./EngineAdapter";
import {
  STOCKFISH_ENGINE_URL,
  StockfishWorkerAdapter,
  type StockfishWorkerLike,
} from "./StockfishWorker";

const REQUEST: AnalysisRequest = {
  requestId: "worker-request-1",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  depth: 6,
  multiPv: 2,
};

class FakeWorker implements StockfishWorkerLike {
  readonly commands: string[] = [];

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onerror: ((event: unknown) => void) | null = null;

  emitBestmove = true;

  postMessage(message: string): void {
    this.commands.push(message);
    if (message === "uci") this.emit("uciok");
    if (message === "isready") this.emit("readyok");
    if (message.startsWith("go ")) {
      this.emit("info depth 6 multipv 1 score cp 22 nodes 100 pv e2e4 e7e5");
      this.emit("info depth 6 multipv 2 score mate 3 pv d2d4 d7d5");
      if (this.emitBestmove) this.emit("bestmove e2e4 ponder e7e5");
    }
  }

  terminate(): void {
    this.commands.push("<terminate>");
  }

  private emit(data: string): void {
    this.onmessage?.({ data });
  }
}

async function collect(
  iterable: AsyncIterable<EngineLine>,
): Promise<EngineLine[]> {
  const lines: EngineLine[] = [];
  for await (const line of iterable) lines.push(line);
  return lines;
}

describe("StockfishWorkerAdapter", () => {
  it("inicializa el engine, envía UCI en orden y entrega líneas tipadas", async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishWorkerAdapter({
      workerFactory: () => worker,
    });

    const lines = await collect(adapter.analyze(REQUEST));

    expect(worker.commands.slice(0, 6)).toEqual([
      "uci",
      "isready",
      "ucinewgame",
      "setoption name MultiPV value 2",
      `position fen ${REQUEST.fen}`,
      "go depth 6",
    ]);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({
      multipv: 1,
      depth: 6,
      score: { kind: "cp", value: 22 },
      bestmove: "e2e4",
    });
    expect(lines[1]).toMatchObject({
      multipv: 2,
      score: { kind: "mate", value: 3 },
      bestmove: "d2d4",
    });
    expect(lines[2].bestmove).toBe("e2e4");
  });

  it("ignora eventos no UCI y cancela una búsqueda sin bestmove", async () => {
    const worker = new FakeWorker();
    worker.emitBestmove = false;
    const adapter = new StockfishWorkerAdapter({
      workerFactory: () => worker,
    });
    const iterator = adapter.analyze(REQUEST)[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    await adapter.cancel(REQUEST.requestId);
    expect((await iterator.next()).done).toBe(true);
    expect(worker.commands).not.toContain("uciok");
  });

  it("usa la URL aprobada por defecto y termina el worker en dispose", async () => {
    const worker = new FakeWorker();
    let createdUrl = "";
    const adapter = new StockfishWorkerAdapter({
      workerFactory: (url) => {
        createdUrl = url;
        return worker;
      },
    });

    await collect(adapter.analyze(REQUEST));
    await adapter.dispose();

    expect(createdUrl).toBe(STOCKFISH_ENGINE_URL);
    expect(worker.commands.at(-1)).toBe("<terminate>");
  });

  it("termina y recrea el Worker después de un error irrecuperable", async () => {
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    let created = 0;
    const adapter = new StockfishWorkerAdapter({
      workerFactory: () => {
        const worker = workers[created];
        created += 1;
        if (!worker) throw new Error("worker factory exhausted");
        return worker;
      },
    });

    await collect(adapter.analyze(REQUEST));
    firstWorker.onerror?.(new Error("worker crashed"));
    await collect(
      adapter.analyze({ ...REQUEST, requestId: "worker-request-2" }),
    );
    await adapter.dispose();

    expect(created).toBe(2);
    expect(firstWorker.commands).toContain("<terminate>");
    expect(secondWorker.commands).toContain("uci");
  });
});
