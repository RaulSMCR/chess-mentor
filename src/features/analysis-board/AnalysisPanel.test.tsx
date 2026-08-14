import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  AnalysisRequest,
  EngineAdapter,
  EngineLine,
} from "@/engine/EngineAdapter";
import { FakeEngineAdapter } from "@/engine/FakeEngineAdapter";

import { AnalysisPanel } from "./AnalysisPanel";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function line(overrides: Partial<EngineLine> = {}): EngineLine {
  return {
    multipv: 1,
    depth: 8,
    score: { kind: "mate", value: 2 },
    pv: ["e2e4", "e7e5", "g1f3"],
    bestmove: "e2e4",
    ...overrides,
  };
}

class OneLineAdapter implements EngineAdapter {
  disposed = false;

  analyze(): AsyncIterable<EngineLine> {
    const nextLine = line();
    return (async function* () {
      yield nextLine;
    })();
  }

  async cancel(): Promise<void> {}

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

class TrackingAdapter implements EngineAdapter {
  readonly requests: string[] = [];

  readonly cancelled: string[] = [];

  analyze(request: AnalysisRequest): AsyncIterable<EngineLine> {
    this.requests.push(request.requestId);
    const requests = this.requests;
    return (async function* () {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      yield line({
        pv: request.fen.includes(" b ") ? ["e7e5"] : ["e2e4"],
        bestmove: request.fen.includes(" b ") ? "e7e5" : "e2e4",
      });
      expect(requests).toContain(request.requestId);
    })();
  }

  async cancel(requestId: string): Promise<void> {
    this.cancelled.push(requestId);
  }

  async dispose(): Promise<void> {}
}

describe("AnalysisPanel", () => {
  it("muestra MultiPV, score mate, flechas y recorre la PV sin mutar una partida", async () => {
    render(
      <AnalysisPanel
        fen={FEN}
        cursorNodeId="root"
        engineAdapter={new FakeEngineAdapter()}
        depth={3}
        multiPv={2}
        movetimeMs={100}
      />,
    );

    expect(await screen.findByText("Línea 1")).toBeInTheDocument();
    expect(screen.getByText("Línea 2")).toBeInTheDocument();
    expect(screen.getAllByText(/CP [+-]?\d+/)).toHaveLength(2);
    expect(screen.getByText("Vista PV (sin guardar)")).toBeInTheDocument();
    expect(screen.getByText(/Profundidad: 3/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Flechas de PV línea 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente PV" }));
    expect(screen.getByText(/Paso 1\//)).toBeInTheDocument();
    expect(screen.queryByText("Posición del cursor")).not.toBeInTheDocument();
  });

  it("distingue un score de mate del score centipeón", async () => {
    render(
      <AnalysisPanel
        fen={FEN}
        cursorNodeId="root"
        engineAdapter={new OneLineAdapter()}
      />,
    );

    expect(await screen.findByText("Mate +2")).toBeInTheDocument();
    expect(screen.getByText("Mate +2")).toHaveClass("analysis-score-mate");
  });

  it("cancela el análisis visible al cambiar el cursor", async () => {
    const adapter = new TrackingAdapter();
    const { rerender } = render(
      <AnalysisPanel fen={FEN} cursorNodeId="root" engineAdapter={adapter} />,
    );

    await waitFor(() => expect(adapter.requests).toContain("analysis-1"));

    rerender(
      <AnalysisPanel
        fen={FEN.replace(" w ", " b ")}
        cursorNodeId="after-e4"
        engineAdapter={adapter}
      />,
    );

    await waitFor(() => expect(adapter.cancelled).toContain("analysis-1"));
    expect(await screen.findByText("e7 → e5")).toBeInTheDocument();
    expect(screen.queryByText("e2 → e4")).not.toBeInTheDocument();
  });

  it("degrada si Stockfish no está disponible y deja un diagnóstico visible", async () => {
    const adapter: EngineAdapter = {
      analyze: () => {
        throw new Error("Web Worker no está disponible en este entorno");
      },
      cancel: async () => undefined,
      dispose: async () => undefined,
    };

    render(
      <AnalysisPanel fen={FEN} cursorNodeId="root" engineAdapter={adapter} />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Motor no disponible",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tablero, el PGN y el guardado siguen disponibles",
    );
  });
});
