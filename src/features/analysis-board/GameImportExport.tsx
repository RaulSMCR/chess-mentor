"use client";

import { useRef, useState } from "react";

import { MAX_PGN_INPUT_BYTES } from "@/domain/pgn/adapter";

import type { GameSessionController } from "./useGameSession";

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

  const chooseImport = async (file: File) => {
    const text = await file.text();
    const result = controller.importText(text);
    if (!result.ok) return;
    if (result.warnings.length > 0) {
      setPendingText(text);
      setWarnings(result.warnings.map((warning) => warning.message));
      return;
    }
    replaceIfConfirmed(() => controller.importText(text, true));
  };

  const acceptWarnings = () => {
    if (pendingText === null) return;
    replaceIfConfirmed(() => {
      controller.importText(pendingText, true);
      setPendingText(null);
      setWarnings([]);
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
          accept=".pgn,application/x-chess-pgn,text/plain"
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
      {message === null ? null : <p role="status">{message}</p>}
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
              setPendingText(null);
              setWarnings([]);
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
