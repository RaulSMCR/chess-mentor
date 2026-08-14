import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MemoryTrainerRepository } from "@/infrastructure/trainer/MemoryTrainerRepository";

import { TrainerPanel } from "./TrainerPanel";

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: {
      position?: string;
      onPieceDrop?: (input: {
        sourceSquare: string;
        targetSquare: string | null;
      }) => boolean;
    };
  }) => (
    <div data-testid="trainer-board" data-position={options.position}>
      tablero temporal
      <button
        type="button"
        onClick={() =>
          options.onPieceDrop?.({
            sourceSquare: "e2",
            targetSquare: "e4",
          })
        }
      >
        mover e2-e4
      </button>
    </div>
  ),
}));

function renderPanel() {
  const repository = new MemoryTrainerRepository();
  let id = 0;
  render(
    <TrainerPanel
      repository={repository}
      clock={() => "2026-01-01T00:00:00.000Z"}
      idFactory={() => `trainer-${++id}`}
    />,
  );
  return repository;
}

async function createExercise(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Crear ejercicio" }));
  await screen.findByText("Ejercicio creado y guardado localmente.");
}

describe("TrainerPanel", () => {
  it("crea y abre un ejercicio con un tablero temporal", async () => {
    renderPanel();

    expect(
      screen.getByRole("heading", { name: "Entrenador" }),
    ).toBeInTheDocument();
    await createExercise();
    expect(screen.getByTestId("trainer-board")).toBeInTheDocument();
    expect(screen.getAllByText("Centro y desarrollo").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(/Stockfish opcional no disponible/),
    ).toBeInTheDocument();
  });

  it("mantiene el orden de pistas y no revela engine antes de tiempo", async () => {
    renderPanel();
    await createExercise();

    const concept = screen.getByRole("button", { name: "Pista: concept" });
    const destination = screen.getByRole("button", {
      name: "Pista: destination",
    });
    const engine = screen.getByRole("button", { name: "Pista: engine" });
    expect(destination).toBeDisabled();
    expect(engine).toBeDisabled();

    fireEvent.click(concept);
    expect(screen.getByText(/Controla el centro/)).toBeInTheDocument();
    fireEvent.click(destination);
    expect(screen.queryByText(/Mejor jugada aceptada/)).not.toBeInTheDocument();
    fireEvent.click(engine);
    expect(screen.getByText(/Mejor jugada aceptada/)).toBeInTheDocument();
    expect(screen.getByText("Penalización acumulada: 3")).toBeInTheDocument();
  });

  it("evalúa, agenda y persiste un intento correcto sin motor", async () => {
    const repository = renderPanel();
    await createExercise();

    fireEvent.click(screen.getByRole("button", { name: "Iniciar intento" }));
    fireEvent.change(screen.getByLabelText("Jugada UCI"), {
      target: { value: "e2e4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Evaluar jugada" }));

    expect(
      await screen.findByText("Puntuación: 5/5 · calidad 5"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Próxima repetición:/)).toBeInTheDocument();
    await waitFor(async () => {
      const saved = await repository.list();
      expect(saved[0]?.attempts).toHaveLength(1);
      expect(saved[0]?.attempts[0]?.quality).toBe(5);
    });
  });

  it("permite cambiar de pestaña y seleccionar una jugada desde el tablero", async () => {
    renderPanel();
    await createExercise();

    fireEvent.click(screen.getByRole("tab", { name: "Ejercicios" }));
    expect(
      screen.getByRole("heading", { name: "Crear ejercicio" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Resolver ejercicio" }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar intento" }));
    fireEvent.click(screen.getByRole("button", { name: "mover e2-e4" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Jugada UCI")).toHaveValue("e2e4"),
    );
    expect(screen.getByTestId("trainer-board")).toHaveAttribute(
      "data-position",
      expect.stringContaining("4P3"),
    );
  });
});
