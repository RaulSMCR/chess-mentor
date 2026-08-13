import {
  type AnalysisRequest,
  type EngineAdapter,
  type EngineLine,
  validateAnalysisRequest,
} from "./EngineAdapter";
import { createUciCommands, parseUciLine, toEngineLine } from "./uci";

export const STOCKFISH_ENGINE_URL =
  "/stockfish/stockfish-18-lite-single.js" as const;

export type StockfishWorkerMessage =
  | Readonly<{ type: "init" }>
  | Readonly<{ type: "analyze"; request: AnalysisRequest }>
  | Readonly<{ type: "cancel"; requestId: string }>
  | Readonly<{ type: "dispose" }>;

export type StockfishWorkerResponse =
  | Readonly<{ type: "ready" }>
  | Readonly<{ type: "line"; requestId: string; line: EngineLine }>
  | Readonly<{ type: "done"; requestId: string }>
  | Readonly<{ type: "error"; requestId?: string; message: string }>;

export interface StockfishWorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: string): void;
  terminate(): void;
}

export type StockfishWorkerFactory = (url: string) => StockfishWorkerLike;

type QueueResult<T> = IteratorResult<T>;

class AsyncLineQueue<T> {
  private readonly values: T[] = [];

  private readonly waiters: Array<{
    resolve: (result: QueueResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];

  private ended = false;

  private failure: unknown = undefined;

  push(value: T): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
      return;
    }
    this.values.push(value);
  }

  end(error?: unknown): void {
    if (this.ended) return;
    this.ended = true;
    this.failure = error;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) continue;
      if (error === undefined) waiter.resolve({ done: true, value: undefined });
      else waiter.reject(error);
    }
  }

  next(): Promise<QueueResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.ended) {
      return this.failure === undefined
        ? Promise.resolve({ done: true, value: undefined })
        : Promise.reject(this.failure);
    }
    return new Promise<QueueResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
}

type ActiveRequest = {
  request: AnalysisRequest;
  queue: AsyncLineQueue<EngineLine>;
  cancelled: boolean;
  lastLines: Map<number, EngineLine>;
};

type MarkerWaiter = {
  resolve: () => void;
  reject: (error: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const INITIALIZATION_TIMEOUT_MS = 15_000;

function defaultWorkerFactory(url: string): StockfishWorkerLike {
  if (typeof Worker === "undefined") {
    throw new Error("Web Worker no está disponible en este entorno");
  }
  return new Worker(url, { type: "classic" }) as unknown as StockfishWorkerLike;
}

function isWorkerLine(data: unknown): data is string {
  return typeof data === "string";
}

export class StockfishWorkerAdapter implements EngineAdapter {
  private readonly engineUrl: string;

  private readonly workerFactory: StockfishWorkerFactory;

  private worker: StockfishWorkerLike | null = null;

  private initialized = false;

  private initialization: Promise<void> | null = null;

  private disposed = false;

  private active: ActiveRequest | null = null;

  private readonly markerWaiters = new Map<string, MarkerWaiter[]>();

  constructor(
    options: {
      engineUrl?: string;
      workerFactory?: StockfishWorkerFactory;
    } = {},
  ) {
    this.engineUrl = options.engineUrl ?? STOCKFISH_ENGINE_URL;
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
  }

  analyze(request: AnalysisRequest): AsyncIterable<EngineLine> {
    if (this.disposed) {
      throw new Error("el adaptador Stockfish ya fue liberado");
    }
    validateAnalysisRequest(request);
    if (this.active !== null) {
      throw new Error("solo se permite un análisis Stockfish activo");
    }

    const active: ActiveRequest = {
      request,
      queue: new AsyncLineQueue<EngineLine>(),
      cancelled: false,
      lastLines: new Map(),
    };
    this.active = active;
    return this.stream(active);
  }

  async cancel(requestId: string): Promise<void> {
    const active = this.active;
    if (!active || active.request.requestId !== requestId) return;
    active.cancelled = true;
    this.worker?.postMessage("stop");
    active.queue.end();
    this.active = null;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error("adaptador Stockfish liberado");
    this.rejectMarkerWaiters(error);
    if (this.active) {
      this.active.cancelled = true;
      this.active.queue.end();
      this.active = null;
    }
    const worker = this.worker;
    this.worker = null;
    this.initialized = false;
    this.initialization = null;
    worker?.postMessage("stop");
    worker?.postMessage("quit");
    worker?.terminate();
  }

  private async *stream(active: ActiveRequest): AsyncGenerator<EngineLine> {
    try {
      await this.startAnalysis(active);
      while (!active.cancelled) {
        const result = await active.queue.next();
        if (result.done) return;
        yield result.value;
      }
    } finally {
      if (this.active === active && !active.cancelled) {
        await this.cancel(active.request.requestId);
      }
    }
  }

  private async startAnalysis(active: ActiveRequest): Promise<void> {
    await this.ensureInitialized();
    if (active.cancelled || this.disposed) return;
    const commands = createUciCommands(active.request).slice(2);
    for (const command of commands) {
      this.worker?.postMessage(command);
    }
  }

  private ensureWorker(): StockfishWorkerLike {
    if (this.worker) return this.worker;
    const worker = this.workerFactory(this.engineUrl);
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => this.handleWorkerError(event);
    this.worker = worker;
    return worker;
  }

  private ensureInitialized(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initialization) return this.initialization;
    this.ensureWorker();
    this.initialization = (async () => {
      await this.sendAndWait("uci", "uciok");
      await this.sendAndWait("isready", "readyok");
      this.initialized = true;
    })().catch((error: unknown) => {
      this.initialization = null;
      throw error;
    });
    return this.initialization;
  }

  private sendAndWait(command: string, marker: string): Promise<void> {
    const ready = this.waitForMarker(marker);
    this.worker?.postMessage(command);
    return ready;
  }

  private waitForMarker(marker: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.markerWaiters.get(marker) ?? [];
        this.markerWaiters.set(
          marker,
          waiters.filter((waiter) => waiter.resolve !== resolve),
        );
        reject(new Error(`Stockfish no respondió ${marker}`));
      }, INITIALIZATION_TIMEOUT_MS);
      const waiters = this.markerWaiters.get(marker) ?? [];
      waiters.push({ resolve, reject, timeout });
      this.markerWaiters.set(marker, waiters);
    });
  }

  private resolveMarker(marker: string): void {
    const waiters = this.markerWaiters.get(marker);
    const waiter = waiters?.shift();
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    waiter.resolve();
    if (waiters?.length === 0) this.markerWaiters.delete(marker);
  }

  private rejectMarkerWaiters(error: unknown): void {
    for (const waiters of this.markerWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
    }
    this.markerWaiters.clear();
  }

  private handleMessage(data: unknown): void {
    if (!isWorkerLine(data)) return;
    const line = data.trim();
    if (line === "uciok") {
      this.resolveMarker("uciok");
      return;
    }
    if (line === "readyok") {
      this.resolveMarker("readyok");
      return;
    }

    const active = this.active;
    if (!active || active.cancelled) return;
    const parsed = parseUciLine(line);
    if (!parsed) return;
    if (parsed.kind === "info") {
      const engineLine = toEngineLine(parsed);
      active.lastLines.set(engineLine.multipv, engineLine);
      active.queue.push(engineLine);
      return;
    }

    for (const [multipv, engineLine] of active.lastLines) {
      active.queue.push({ ...engineLine, bestmove: parsed.bestmove });
      active.lastLines.set(multipv, {
        ...engineLine,
        bestmove: parsed.bestmove,
      });
    }
    active.queue.end();
    this.active = null;
  }

  private handleWorkerError(event: unknown): void {
    const error = new Error(
      event instanceof Error
        ? event.message
        : "Stockfish Worker informó un error",
    );
    this.rejectMarkerWaiters(error);
    this.active?.queue.end(error);
    this.active = null;
    this.initialization = null;
    this.initialized = false;
  }
}
