import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotationEditor } from "./AnnotationEditor";

const move = {
  kind: "move" as const,
  id: "e4",
  parentId: "root",
  childIds: [],
  move: { from: "e2", to: "e4" },
  uci: "e2e4",
  san: "e4",
  fen: "8/8/8/8/8/8/4P3/4K2k b - - 0 1",
  comment: null,
  nags: [],
};

describe("AnnotationEditor", () => {
  it("edita comentario y deduplica NAG antes de llamar al dominio", () => {
    const onComment = vi.fn(() => true);
    const onNags = vi.fn(() => true);
    render(
      <AnnotationEditor node={move} onComment={onComment} onNags={onNags} />,
    );

    fireEvent.change(screen.getByLabelText("Comentario"), {
      target: { value: "  Idea  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));
    expect(onComment).toHaveBeenCalledWith("e4", "  Idea  ");
    fireEvent.change(screen.getByLabelText("NAG"), {
      target: { value: "1, 1, 5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar NAG" }));
    expect(onNags).toHaveBeenCalledWith("e4", [1, 5]);
  });

  it("muestra error y no muta ante NAG fuera de rango", () => {
    const onNags = vi.fn(() => true);
    render(
      <AnnotationEditor node={move} onComment={vi.fn()} onNags={onNags} />,
    );
    fireEvent.change(screen.getByLabelText("NAG"), {
      target: { value: "256" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar NAG" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1 y 255");
    expect(onNags).not.toHaveBeenCalled();
  });

  it("deja el root deshabilitado", () => {
    render(
      <AnnotationEditor
        node={{
          kind: "root",
          id: "root",
          parentId: null,
          childIds: [],
          fen: FEN,
        }}
        onComment={vi.fn()}
        onNags={vi.fn(() => true)}
      />,
    );
    expect(screen.getByLabelText("Comentario")).toBeDisabled();
  });
});

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
