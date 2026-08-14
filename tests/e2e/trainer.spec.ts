import { expect, test } from "@playwright/test";

test("entrenador: crear, pedir pistas y evaluar sin Stockfish", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Entrenador" }).click();
  const trainer = page.getByRole("region", {
    name: "Entrenador de ejercicios",
  });
  await expect(
    trainer.getByRole("heading", { name: "Entrenador" }),
  ).toBeVisible();

  await trainer.getByRole("button", { name: "Crear ejercicio" }).click();
  await expect(
    trainer.getByText("Ejercicio creado y guardado localmente."),
  ).toBeVisible();
  await expect(
    trainer.getByLabel("Tablero temporal del ejercicio"),
  ).toBeVisible();

  await trainer.getByRole("button", { name: "Iniciar intento" }).click();
  await trainer.getByRole("button", { name: "Pista: concept" }).click();
  await expect(trainer.getByText(/Controla el centro/)).toBeVisible();
  await expect(
    trainer.getByRole("button", { name: "Pista: engine" }),
  ).toBeDisabled();

  const exerciseBoard = trainer.locator(".trainer-board-frame");
  const sourceSquare = exerciseBoard.locator('[data-square="e2"]');
  const targetSquare = exerciseBoard.locator('[data-square="e4"]');
  const sourceBox = await sourceSquare.boundingBox();
  const targetBox = await targetSquare.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (sourceBox === null || targetBox === null) {
    throw new Error(
      "No se encontraron las casillas del tablero del ejercicio.",
    );
  }
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(trainer.getByLabel("Jugada UCI")).toHaveValue("e2e4");
  await expect(sourceSquare.locator("[data-piece]")).toHaveCount(0);
  await expect(targetSquare.locator("[data-piece]")).toHaveCount(1);
  await trainer.getByRole("button", { name: "Evaluar jugada" }).click();
  await expect(trainer.getByText(/Puntuación: 4\/5 · calidad 4/)).toBeVisible();
  await expect(
    trainer.getByText(
      "Stockfish opcional no disponible: puedes responder manualmente.",
    ),
  ).toBeVisible();
});
