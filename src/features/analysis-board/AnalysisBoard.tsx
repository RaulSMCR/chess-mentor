"use client";

import {
  canBack,
  canForward,
  selectCurrentNode,
} from "@/domain/game-tree/selectors";
import type { GameRepository } from "@/infrastructure/games/GameRepository";

import { GameToolbar } from "./GameToolbar";
import { useGameSession } from "./useGameSession";

type AnalysisBoardProps = Readonly<{
  repository?: GameRepository;
}>;

export function AnalysisBoard({ repository }: AnalysisBoardProps) {
  const controller = useGameSession({ repository });
  const document = controller.document;
  const current = document === null ? null : selectCurrentNode(document);
  const node = current?.ok === true ? current.value : null;
  const backEnabled = document !== null && canBack(document);
  const forwardEnabled = document !== null && canForward(document);

  return (
    <main className="analysis-shell">
      <header className="analysis-header">
        <p className="eyebrow">Análisis local</p>
        <h1>Chess Mentor</h1>
        <p className="session-title">
          {document?.title ?? "Cargando partida…"}
        </p>
      </header>
      <GameToolbar
        busy={controller.state.busy || controller.state.status === "loading"}
        dirty={controller.dirty}
        canUndo={controller.session?.past.length !== 0}
        canRedo={controller.session?.future.length !== 0}
        onNew={() => controller.newGame()}
        onSave={() => void controller.save()}
        onUndo={controller.undo}
        onRedo={controller.redo}
      />
      <section className="position-card" aria-label="Posición actual">
        <h2>Posición actual</h2>
        <p data-testid="current-fen">{node?.fen ?? "—"}</p>
        <div className="navigation-controls">
          <button
            type="button"
            onClick={controller.back}
            disabled={!backEnabled}
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={() => controller.forward()}
            disabled={!forwardEnabled}
          >
            Adelante
          </button>
        </div>
      </section>
      {controller.error === null ? null : (
        <p role="alert" className="error-message">
          {controller.error}
        </p>
      )}
      <p className="storage-note">
        Las partidas se guardan localmente en este navegador.
      </p>
    </main>
  );
}
