"use client";

type GameToolbarProps = Readonly<{
  busy: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
}>;

export function GameToolbar({
  busy,
  dirty,
  canUndo,
  canRedo,
  onNew,
  onSave,
  onUndo,
  onRedo,
}: GameToolbarProps) {
  return (
    <div className="game-toolbar" aria-label="Acciones de partida">
      <button type="button" onClick={onNew} disabled={busy}>
        Nueva
      </button>
      <button type="button" onClick={onSave} disabled={busy}>
        Guardar{dirty ? " *" : ""}
      </button>
      <button type="button" onClick={onUndo} disabled={busy || !canUndo}>
        Deshacer
      </button>
      <button type="button" onClick={onRedo} disabled={busy || !canRedo}>
        Rehacer
      </button>
      <span role="status" aria-live="polite">
        {busy ? "Guardando…" : dirty ? "Cambios sin guardar" : "Guardado"}
      </span>
    </div>
  );
}
