"use client";

import { useEffect, useRef } from "react";

const LABELS: Record<string, string> = {
  q: "Dama",
  r: "Torre",
  b: "Alfil",
  n: "Caballo",
};

type PromotionDialogProps = Readonly<{
  options: readonly string[];
  onSelect: (promotion: string) => void;
  onCancel: () => void;
}>;

export function PromotionDialog({
  options,
  onSelect,
  onCancel,
}: PromotionDialogProps) {
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="promotion-backdrop">
      <section
        aria-labelledby="promotion-title"
        aria-modal="true"
        className="promotion-dialog"
        role="dialog"
      >
        <h2 id="promotion-title">Elegir promoción</h2>
        <div className="promotion-options">
          {options.map((option, index) => (
            <button
              key={option}
              ref={index === 0 ? firstButtonRef : undefined}
              type="button"
              onClick={() => onSelect(option)}
            >
              {LABELS[option] ?? option.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </section>
    </div>
  );
}
