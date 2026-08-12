"use client";

import { useEffect } from "react";

import type { GameSessionController } from "./useGameSession";

type SavedGamesProps = Readonly<{
  controller: GameSessionController;
}>;

export function SavedGames({ controller }: SavedGamesProps) {
  const { refreshSavedGames } = controller;
  useEffect(() => {
    void refreshSavedGames();
  }, [refreshSavedGames]);

  return (
    <section className="saved-games" aria-label="Partidas guardadas">
      <h2>Partidas guardadas</h2>
      {controller.savedGames.length === 0 ? (
        <p>No hay partidas guardadas.</p>
      ) : (
        <ul>
          {controller.savedGames.map((game) => (
            <li key={game.id}>
              <span>{game.title}</span>
              <button
                type="button"
                onClick={() => {
                  if (
                    !controller.dirty ||
                    window.confirm("Hay cambios sin guardar. ¿Abrir partida?")
                  ) {
                    void controller.openSaved(game.id);
                  }
                }}
              >
                Abrir
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Eliminar esta partida guardada?")) {
                    void controller.deleteSaved(game.id);
                  }
                }}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
