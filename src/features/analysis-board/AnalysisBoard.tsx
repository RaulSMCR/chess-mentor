"use client";

import {
  canBack,
  canForward,
  selectCurrentNode,
} from "@/domain/game-tree/selectors";
import type { GameRepository } from "@/infrastructure/games/GameRepository";

import { GameToolbar } from "./GameToolbar";
import { ChessBoardPanel } from "./ChessBoardPanel";
import { AnnotationEditor } from "./AnnotationEditor";
import { MoveTree } from "./MoveTree";
import { GameImportExport } from "./GameImportExport";
import { SavedGames } from "./SavedGames";
import { useGameSession } from "./useGameSession";
import { useState } from "react";
import { AnalysisPanel } from "./AnalysisPanel";

type AnalysisBoardProps = Readonly<{
  repository?: GameRepository;
}>;

export function AnalysisBoard({ repository }: AnalysisBoardProps) {
  const controller = useGameSession({ repository });
  const [orientation, setOrientation] = useState<"white" | "black">("white");
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
      <GameImportExport controller={controller} />
      <SavedGames controller={controller} />
      <ChessBoardPanel
        document={document}
        orientation={orientation}
        onFlip={() =>
          setOrientation((current) => (current === "white" ? "black" : "white"))
        }
        onPlay={controller.play}
        getPromotionOptions={controller.promotionOptions}
        onError={controller.reportError}
      />
      <AnalysisPanel fen={node?.fen ?? null} cursorNodeId={node?.id ?? null} />
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
      {document === null ? null : (
        <>
          <MoveTree document={document} onNavigate={controller.navigate} />
          <AnnotationEditor
            key={node?.id ?? document.rootNodeId}
            node={node}
            onComment={controller.setComment}
            onNags={controller.setNags}
          />
        </>
      )}
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
