"use client";

import { useEffect, useRef, useState } from "react";

import type {
  EngineAdapter,
  EngineLine,
  EngineScore,
} from "@/engine/EngineAdapter";
import { EngineSession, type EngineSessionLine } from "@/engine/EngineSession";
import { StockfishWorkerAdapter } from "@/engine/StockfishWorker";

const DEFAULT_DEPTH = 12;
const DEFAULT_MULTI_PV = 2;
const DEFAULT_MOVETIME_MS = 2_500;

type AnalysisStatus = "idle" | "analysing" | "ready" | "unavailable";

type AnalysisState = Readonly<{
  status: AnalysisStatus;
  lines: readonly EngineLine[];
  elapsedMs: number;
  error: string | null;
  selectedMultipv: number;
  previewPly: number;
}>;

export type AnalysisPanelProps = Readonly<{
  fen: string | null;
  cursorNodeId: string | null;
  engineAdapter?: EngineAdapter;
  depth?: number;
  multiPv?: number;
  movetimeMs?: number;
}>;

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Stockfish no está disponible en este navegador.";
}

function formatScore(score: EngineScore): string {
  if (score.kind === "mate") {
    return `Mate ${score.value > 0 ? "+" : ""}${score.value}`;
  }
  const sign = score.value > 0 ? "+" : "";
  const pawns = (score.value / 100).toFixed(2);
  return `CP ${sign}${score.value} (${sign}${pawns})`;
}

function formatMove(move: string): string {
  if (move.length < 4) return move;
  const promotion = move.length > 4 ? `=${move.slice(4).toUpperCase()}` : "";
  return `${move.slice(0, 2)} → ${move.slice(2, 4)}${promotion}`;
}

function updateLine(
  previous: readonly EngineLine[],
  nextLine: EngineLine,
): readonly EngineLine[] {
  const byMultipv = new Map(previous.map((line) => [line.multipv, line]));
  byMultipv.set(nextLine.multipv, nextLine);
  return [...byMultipv.values()].sort(
    (left, right) => left.multipv - right.multipv,
  );
}

function initialState(): AnalysisState {
  return {
    status: "idle",
    lines: [],
    elapsedMs: 0,
    error: null,
    selectedMultipv: 1,
    previewPly: 0,
  };
}

export function AnalysisPanel({
  fen,
  cursorNodeId,
  engineAdapter,
  depth = DEFAULT_DEPTH,
  multiPv = DEFAULT_MULTI_PV,
  movetimeMs = DEFAULT_MOVETIME_MS,
}: AnalysisPanelProps) {
  const sessionRef = useRef<EngineSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = new EngineSession(
      engineAdapter ?? new StockfishWorkerAdapter(),
    );
  }
  const session = sessionRef.current;
  const runRef = useRef(0);
  const [state, setState] = useState<AnalysisState>(initialState);

  useEffect(() => {
    return () => {
      void session.dispose();
    };
  }, [session]);

  useEffect(() => {
    const runId = runRef.current + 1;
    runRef.current = runId;
    let stopped = false;
    const startedAt = now();

    setState({
      ...initialState(),
      status: fen === null ? "idle" : "analysing",
    });

    if (fen === null || cursorNodeId === null) {
      void session.cancel();
      return () => {
        stopped = true;
      };
    }

    const timer = setInterval(() => {
      if (stopped || runRef.current !== runId) return;
      setState((current) => ({
        ...current,
        elapsedMs: Math.round(now() - startedAt),
      }));
    }, 100);

    const consume = async () => {
      try {
        const stream = await session.analyze({
          fen,
          depth,
          multiPv,
          movetimeMs,
        });
        for await (const item of stream) {
          if (stopped || runRef.current !== runId) return;
          const line = (item as EngineSessionLine).line;
          setState((current) => ({
            ...current,
            status: "analysing",
            lines: updateLine(current.lines, line),
            elapsedMs: Math.round(now() - startedAt),
          }));
        }
        if (stopped || runRef.current !== runId) return;
        setState((current) => ({
          ...current,
          status: "ready",
          elapsedMs: Math.round(now() - startedAt),
        }));
      } catch (error) {
        if (stopped || runRef.current !== runId) return;
        setState((current) => ({
          ...current,
          status: "unavailable",
          error: errorMessage(error),
        }));
      }
    };

    void consume();
    return () => {
      stopped = true;
      clearInterval(timer);
      void session.cancel();
    };
  }, [cursorNodeId, depth, fen, movetimeMs, multiPv, session]);

  const selectedLine =
    state.lines.find((line) => line.multipv === state.selectedMultipv) ??
    state.lines[0] ??
    null;
  const previewPly = selectedLine
    ? Math.min(state.previewPly, selectedLine.pv.length)
    : 0;
  const previewMoves = selectedLine?.pv.slice(0, previewPly) ?? [];
  const latestDepth = state.lines.reduce(
    (current, line) => Math.max(current, line.depth),
    0,
  );

  return (
    <section className="analysis-panel" aria-label="Análisis del motor">
      <header className="analysis-panel-header">
        <div>
          <p className="eyebrow">Motor</p>
          <h2>Análisis Stockfish</h2>
        </div>
        <span role="status" aria-live="polite">
          {state.status === "analysing"
            ? "Analizando…"
            : state.status === "ready"
              ? "Listo"
              : state.status === "unavailable"
                ? "No disponible"
                : "En espera"}
        </span>
      </header>

      {state.error === null ? null : (
        <div className="analysis-unavailable" role="alert">
          <strong>Motor no disponible</strong>
          <p>{state.error}</p>
          <p>El tablero, el PGN y el guardado siguen disponibles.</p>
        </div>
      )}

      {fen === null ? (
        <p className="analysis-empty">Esperando una posición del cursor.</p>
      ) : state.error !== null ? null : (
        <>
          <ul className="analysis-metadata" aria-label="Datos del análisis">
            <li>Profundidad: {latestDepth || depth}</li>
            <li>Tiempo: {state.elapsedMs} ms</li>
            <li>
              MultiPV: {state.lines.length}/{multiPv}
            </li>
          </ul>

          {state.lines.length === 0 ? (
            <p className="analysis-empty">
              Esperando la primera línea del motor…
            </p>
          ) : (
            <div className="analysis-lines">
              {state.lines.map((line) => (
                <article
                  className={`analysis-line${selectedLine?.multipv === line.multipv ? " is-selected" : ""}`}
                  key={line.multipv}
                >
                  <header>
                    <h3>Línea {line.multipv}</h3>
                    <span
                      className={`analysis-score analysis-score-${line.score.kind}`}
                    >
                      {formatScore(line.score)}
                    </span>
                  </header>
                  <p className="analysis-line-meta">
                    Profundidad {line.depth} · Mejor jugada {line.bestmove}
                  </p>
                  <div
                    className="analysis-pv"
                    aria-label={`Flechas de PV línea ${line.multipv}`}
                  >
                    {line.pv.map((move, index) => (
                      <button
                        type="button"
                        key={`${line.multipv}-${index}-${move}`}
                        aria-label={`Mostrar PV hasta ${formatMove(move)}`}
                        aria-pressed={
                          selectedLine?.multipv === line.multipv &&
                          previewPly === index + 1
                        }
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            selectedMultipv: line.multipv,
                            previewPly: index + 1,
                          }))
                        }
                      >
                        {formatMove(move)}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}

          {selectedLine === null ? null : (
            <section
              className="analysis-preview"
              aria-label="Vista temporal de PV"
            >
              <h3>Vista PV (sin guardar)</h3>
              <p>
                Línea {selectedLine.multipv} · Paso {previewPly}/
                {selectedLine.pv.length}
              </p>
              <p className="analysis-preview-moves">
                {previewMoves.length === 0
                  ? "Posición del cursor"
                  : previewMoves.map(formatMove).join(" · ")}
              </p>
              <div className="analysis-preview-controls">
                <button
                  type="button"
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      previewPly: Math.max(0, previewPly - 1),
                    }))
                  }
                  disabled={previewPly === 0}
                >
                  Anterior PV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      previewPly: Math.min(
                        selectedLine.pv.length,
                        previewPly + 1,
                      ),
                    }))
                  }
                  disabled={previewPly >= selectedLine.pv.length}
                >
                  Siguiente PV
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
