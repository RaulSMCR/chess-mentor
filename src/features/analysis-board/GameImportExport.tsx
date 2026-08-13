"use client";

import { useRef, useState } from "react";

import { MAX_PGN_INPUT_BYTES, type PgnGameSummary } from "@/domain/pgn/adapter";

import type { GameSessionController } from "./useGameSession";
import { readPgnFile } from "./pgn-file";

type GameImportExportProps = Readonly<{
  controller: GameSessionController;
}>;

export function sanitizePgnFilename(title: string): string {
  const normalized = title
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "");
  const safe = normalized
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80)
    .replace(/-$/u, "");
  return `${safe || "chess-mentor-game"}.pgn`;
}

function downloadPgn(text: string, title: string): void {
  const blob = new Blob([text], {
    type: "application/x-chess-pgn;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sanitizePgnFilename(title);
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function GameImportExport({ controller }: GameImportExportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fen, setFen] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [gameChoices, setGameChoices] = useState<readonly PgnGameSummary[]>([]);
  const [pendingGameIndex, setPendingGameIndex] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const replaceIfConfirmed = (action: () => void) => {
    if (
      !controller.dirty ||
      window.confirm("Hay cambios sin guardar. ¿Reemplazar la sesión?")
    ) {
      action();
    }
  };

  const clearPending = () => {
    setPendingText(null);
    setPendingGameIndex(null);
    setGameChoices([]);
    setWarnings([]);
  };

  const prepareImport = (text: string, gameIndex: number) => {
    const result = controller.importText(text, false, gameIndex);
    if (!result.ok) return;
    if (result.warnings.length > 0) {
      setPendingText(text);
      setPendingGameIndex(gameIndex);
      setWarnings(result.warnings.map((warning) => warning.message));
      return;
    }
    replaceIfConfirmed(() => {
      controller.importText(text, true, gameIndex);
      clearPending();
    });
  };

  const chooseImport = async (file: File) => {
    const read = await readPgnFile(file);
    if (!read.ok) {
      controller.reportError(`PGN_PARSE_ERROR: ${read.error}`);
      return;
    }
    const inspected = controller.inspectText(read.text);
    if (!inspected.ok) return;
    if (inspected.value.length > 1) {
      setPendingText(read.text);
      setPendingGameIndex(null);
      setGameChoices(inspected.value);
      setWarnings([]);
      return;
    }
    prepareImport(read.text, inspected.value[0]?.index ?? 0);
  };

  const acceptWarnings = () => {
    if (pendingText === null || pendingGameIndex === null) return;
    replaceIfConfirmed(() => {
      controller.importText(pendingText, true, pendingGameIndex);
      clearPending();
    });
  };

  const createFen = () => {
    replaceIfConfirmed(() => {
      controller.newGame(fen.trim() || undefined);
      setMessage(null);
    });
  };

  const exportCurrent = () => {
    const text = controller.exportText();
    if (text === null || controller.document === null) return;
    downloadPgn(text, controller.document.title);
    setMessage("PGN descargado.");
  };

  return (
    <section className="import-export" aria-label="Importar y exportar">
      <h2>Entrada y salida</h2>
      <div className="import-export-actions">
        <button
          type="button"
          onClick={() => replaceIfConfirmed(() => controller.newGame())}
        >
          Nueva estándar
        </button>
        <label>
          FEN inicial
          <input
            aria-label="FEN inicial"
            value={fen}
            onChange={(event) => setFen(event.target.value)}
          />
        </label>
        <button type="button" onClick={createFen}>
          Nueva desde FEN
        </button>
        <input
          ref={inputRef}
          accept=".pgn,.zip,application/x-chess-pgn,application/zip,text/plain"
          aria-label="Archivo PGN"
          hidden
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void chooseImport(file);
            event.target.value = "";
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()}>
          Importar PGN
        </button>
        <button type="button" onClick={exportCurrent}>
          Exportar PGN
        </button>
      </div>
      <p className="input-limit">
        Límite de importación: {MAX_PGN_INPUT_BYTES} bytes UTF-8.
      </p>
      <p className="pgn-help">
        Admite archivos .pgn y ZIP descargados de PGN Mentor; si contiene varias
        partidas podrás elegir una.
      </p>
      <p className="lan-warning">
        Modo LAN sin autenticación: usa solo datos ficticios.
      </p>
      {message === null ? null : <p role="status">{message}</p>}
      {gameChoices.length === 0 ? null : (
        <div
          className="game-choices"
          role="dialog"
          aria-label="Seleccionar partida"
        >
          <h3>El archivo contiene {gameChoices.length} partidas</h3>
          <p>Elige cual quieres abrir:</p>
          <ol>
            {gameChoices.map((game) => (
              <li key={game.index}>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingText !== null)
                      prepareImport(pendingText, game.index);
                  }}
                >
                  {game.index + 1}. {game.title} - {game.white} vs {game.black}{" "}
                  ({game.moveCount} jugadas)
                </button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={clearPending}>
            Cancelar
          </button>
        </div>
      )}
      {warnings.length === 0 ? null : (
        <div className="warning-box" role="alert">
          <p>El PGN contiene advertencias:</p>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <button type="button" onClick={acceptWarnings}>
            Aceptar importación
          </button>
          <button
            type="button"
            onClick={() => {
              clearPending();
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
