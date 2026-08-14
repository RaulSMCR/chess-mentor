import type {
  AnalysisRequest,
  EngineAdapter,
  EngineLine,
} from "./EngineAdapter";

export type SessionAnalysisRequest = Omit<AnalysisRequest, "requestId">;

export type EngineSessionLine = Readonly<{
  requestId: string;
  line: EngineLine;
}>;

export type RequestIdFactory = (sequence: number) => string;

export type EngineSessionOptions = Readonly<{
  requestIdFactory?: RequestIdFactory;
  cancellationTimeoutMs?: number;
}>;

type ActiveAnalysis = Readonly<{
  request: AnalysisRequest;
  source: AsyncIterable<EngineLine>;
  cancelled: { value: boolean };
}>;

const DEFAULT_CANCELLATION_TIMEOUT_MS = 1_000;

function defaultRequestIdFactory(sequence: number): string {
  return `analysis-${sequence}`;
}

function positiveTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CANCELLATION_TIMEOUT_MS;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("cancellationTimeoutMs debe ser un número no negativo");
  }
  return value;
}

async function settleWithin(
  operation: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  const guarded = Promise.resolve()
    .then(operation)
    .catch(() => undefined);
  if (timeoutMs === 0) return;
  await Promise.race([
    guarded,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

export class EngineSession {
  private readonly requestIdFactory: RequestIdFactory;

  private readonly cancellationTimeoutMs: number;

  private sequence = 0;

  private active: ActiveAnalysis | null = null;

  private disposed = false;

  constructor(
    private readonly adapter: EngineAdapter,
    options: EngineSessionOptions = {},
  ) {
    this.requestIdFactory = options.requestIdFactory ?? defaultRequestIdFactory;
    this.cancellationTimeoutMs = positiveTimeout(options.cancellationTimeoutMs);
  }

  async analyze(
    request: SessionAnalysisRequest,
  ): Promise<AsyncIterable<EngineSessionLine>> {
    if (this.disposed) {
      throw new Error("la sesión de engine ya fue liberada");
    }

    await this.cancelActive();
    if (this.disposed) {
      throw new Error("la sesión de engine ya fue liberada");
    }

    this.sequence += 1;
    const requestId = this.requestIdFactory(this.sequence);
    if (requestId.trim().length === 0) {
      throw new Error("requestIdFactory debe devolver un ID no vacío");
    }

    const analysisRequest: AnalysisRequest = { ...request, requestId };
    const active: ActiveAnalysis = {
      request: analysisRequest,
      source: this.adapter.analyze(analysisRequest),
      cancelled: { value: false },
    };
    this.active = active;
    return this.createStream(active);
  }

  async cancel(): Promise<void> {
    await this.cancelActive();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    const active = this.active;
    this.active = null;
    if (active) {
      active.cancelled.value = true;
      await settleWithin(
        () => this.adapter.cancel(active.request.requestId),
        this.cancellationTimeoutMs,
      );
    }

    await settleWithin(
      () => this.adapter.dispose(),
      this.cancellationTimeoutMs,
    );
  }

  private async cancelActive(): Promise<void> {
    const active = this.active;
    if (!active) return;

    this.active = null;
    active.cancelled.value = true;
    await settleWithin(
      () => this.adapter.cancel(active.request.requestId),
      this.cancellationTimeoutMs,
    );
  }

  private createStream(
    active: ActiveAnalysis,
  ): AsyncIterable<EngineSessionLine> {
    return this.stream(active);
  }

  private async *stream(
    active: ActiveAnalysis,
  ): AsyncGenerator<EngineSessionLine> {
    for await (const line of active.source) {
      if (active.cancelled.value || this.disposed || this.active !== active) {
        continue;
      }
      yield { requestId: active.request.requestId, line };
    }
  }
}
