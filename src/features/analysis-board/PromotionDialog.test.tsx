import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PromotionDialog } from "./PromotionDialog";

describe("PromotionDialog", () => {
  it("muestra las cuatro opciones, enfoca la primera y confirma", () => {
    const onSelect = vi.fn();
    render(
      <PromotionDialog
        options={["q", "r", "b", "n"]}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Elegir promoción" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dama" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Caballo" }));
    expect(onSelect).toHaveBeenCalledWith("n");
  });

  it("cancela con Escape", () => {
    const onCancel = vi.fn();
    render(
      <PromotionDialog
        options={["q"]}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
