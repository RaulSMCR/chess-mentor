"use client";

import { useState } from "react";

import type { GameNode } from "@/domain/game-tree/model";

type AnnotationEditorProps = Readonly<{
  node: GameNode | null;
  onComment: (nodeId: string, comment: string) => boolean;
  onNags: (nodeId: string, nags: readonly number[]) => boolean;
}>;

export function AnnotationEditor({
  node,
  onComment,
  onNags,
}: AnnotationEditorProps) {
  const move = node?.kind === "move" ? node : null;
  const [comment, setComment] = useState(move?.comment ?? "");
  const [nagsText, setNagsText] = useState(move?.nags.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);

  if (move === null) {
    return (
      <section className="annotation-editor" aria-label="Anotaciones">
        <h2>Anotaciones</h2>
        <p>Selecciona un movimiento para editar comentarios y NAG.</p>
        <textarea aria-label="Comentario" disabled value="" readOnly />
      </section>
    );
  }

  const submitNags = () => {
    const raw = nagsText.trim();
    const parsed = raw === "" ? [] : raw.split(/[\s,]+/u).map(Number);
    if (
      parsed.some(
        (value) => !Number.isInteger(value) || value < 1 || value > 255,
      )
    ) {
      setError("Los NAG deben ser enteros entre 1 y 255.");
      return;
    }
    const normalized = [...new Set(parsed)];
    if (onNags(move.id, normalized)) setError(null);
  };

  return (
    <section className="annotation-editor" aria-label="Anotaciones">
      <h2>Anotaciones de {move.san}</h2>
      <label>
        Comentario
        <textarea
          aria-label="Comentario"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => onComment(move.id, comment)}>
        Guardar comentario
      </button>
      <label>
        NAG (1–255, separados por coma)
        <input
          aria-label="NAG"
          inputMode="numeric"
          value={nagsText}
          onChange={(event) => setNagsText(event.target.value)}
        />
      </label>
      <button type="button" onClick={submitNags}>
        Guardar NAG
      </button>
      {error === null ? null : <p role="alert">{error}</p>}
    </section>
  );
}
