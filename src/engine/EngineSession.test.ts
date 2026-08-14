import { describe, expect, it } from "vitest";

import type {
  AnalysisRequest,
  EngineAdapter,
  EngineLine,
} from "./EngineAdapter";
import { EngineSession, type SessionAnalysisRequest } from "./EngineSession";

const REQUEST: SessionAnalysisRequest = {
  fen: "8/8/8/8/8/8/4k3/7K w - - 0 1",
  depth: 4,
  multiPv: 1,
};

const line = (bestmove: string): EngineLine => ({
  multipv: 1,
  depth: 4,
  score: { kind: "cp", value: 12 },
  pv: [bestmove],
  bestmove,
});

type PendingNext = {
  resolve: (result: IteratorResult<EngineLine>) => void;
};

class ManualStream
  implements AsyncIterable<EngineLine>, AsyncIterator<EngineLine>
{
  private readonly values: EngineLine[] = [];

  private readonly pending: PendingNext[] = [];

  private ended = false;

  [Symbol.asyncIterator](): AsyncIterator<EngineLine> {
    return this;
  }

  next(): Promise<IteratorResult<EngineLine>> {
    const value = this.values.shift();
    if (value) return Promise.resolve({ done: false, value });
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.pending.push({ resolve }));
  }

  push(value: EngineLine): void {
    const waiter = this.pending.shift();
    if (waiter) waiter.resolve({ done: false, value });
    else this.values.push(value);
  }

  end(): void {
    this.ended = true;
    while (this.pending.length > 0) {
      this.pending.shift()?.resolve({ done: true, value: undefined });
    }
  }
}

class ControlledAdapter implements EngineAdapter {
  readonly requests: AnalysisRequest[] = [];

  readonly cancelCalls: string[] = [];

  readonly streams = new Map<string, ManualStream>();

  disposeCalls = 0;

  hangCancellation = false;

  analyze(request: AnalysisRequest): AsyncIterable<EngineLine> {
    const stream = new ManualStream();
    this.requests.push(request);
    this.streams.set(request.requestId, stream);
    return stream;
  }

  async cancel(requestId: string): Promise<void> {
    this.cancelCalls.push(requestId);
    if (this.hangCancellation) return new Promise<void>(() => undefined);
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
  }

  emit(requestId: string, value: EngineLine): void {
    this.streams.get(requestId)?.push(value);
  }

  end(requestId: string): void {
    this.streams.get(requestId)?.end();
  }
}

describe("EngineSession", () => {
  it("genera requestId monotónico y cancela antes de iniciar la siguiente", async () => {
    const adapter = new ControlledAdapter();
    const session = new EngineSession(adapter);

    await session.analyze(REQUEST);
    const second = await session.analyze(REQUEST);

    expect(adapter.requests.map((request) => request.requestId)).toEqual([
      "analysis-1",
      "analysis-2",
    ]);
    expect(adapter.cancelCalls).toEqual(["analysis-1"]);
    expect(second).toBeDefined();
  });

  it("descarta una respuesta de la solicitud anterior", async () => {
    const adapter = new ControlledAdapter();
    const session = new EngineSession(adapter);
    const first = await session.analyze(REQUEST);
    const firstIterator = first[Symbol.asyncIterator]();
    const staleNext = firstIterator.next();
    await session.analyze(REQUEST);

    adapter.emit("analysis-1", line("e2e4"));
    adapter.end("analysis-1");
    expect(await staleNext).toEqual({ done: true, value: undefined });

    const current = await session.analyze(REQUEST);
    const currentIterator = current[Symbol.asyncIterator]();
    const currentNext = currentIterator.next();
    adapter.emit("analysis-3", line("d2d4"));
    expect(await currentNext).toEqual({
      done: false,
      value: { requestId: "analysis-3", line: line("d2d4") },
    });
  });

  it("dispose resuelve aunque cancel quede esperando confirmación", async () => {
    const adapter = new ControlledAdapter();
    adapter.hangCancellation = true;
    const session = new EngineSession(adapter, { cancellationTimeoutMs: 10 });
    await session.analyze(REQUEST);

    const started = Date.now();
    await session.dispose();

    expect(Date.now() - started).toBeLessThan(100);
    expect(adapter.cancelCalls).toEqual(["analysis-1"]);
    expect(adapter.disposeCalls).toBe(1);
    await expect(session.analyze(REQUEST)).rejects.toThrow("liberada");
  });

  it("permite cancelar sin resultados y hace dispose idempotente", async () => {
    const adapter = new ControlledAdapter();
    const session = new EngineSession(adapter, {
      requestIdFactory: (sequence) => `test-${sequence}`,
    });
    await session.analyze(REQUEST);

    await session.cancel();
    await session.cancel();
    await session.dispose();
    await session.dispose();

    expect(adapter.cancelCalls).toEqual(["test-1"]);
    expect(adapter.disposeCalls).toBe(1);
  });
});
