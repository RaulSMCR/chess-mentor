import { expect, test } from "@playwright/test";

test("entrenador: crear, pedir pistas y evaluar sin Stockfish", async ({
  page,
}) => {
  await page.goto("/");
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

  await trainer.getByLabel("Jugada UCI").fill("e2e4");
  await trainer.getByRole("button", { name: "Evaluar jugada" }).click();
  await expect(trainer.getByText(/Puntuación: 4\/5 · calidad 4/)).toBeVisible();
  await expect(
    trainer.getByText(
      "Stockfish opcional no disponible: puedes responder manualmente.",
    ),
  ).toBeVisible();
});
