import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const annotatedFixture = path.join(
  process.cwd(),
  "fixtures",
  "phase1",
  "annotated-variations.pgn",
);

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Chess Mentor" }),
  ).toBeVisible();
  await expect(page.getByText("Partida sin título")).toBeVisible();
}

async function clearAndReady(page: Page): Promise<void> {
  page.on("dialog", (dialog) => void dialog.accept());
  await ready(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Partida sin título")).toBeVisible();
}

async function dragMove(page: Page, from: string, to: string): Promise<void> {
  const source = page.locator(`[data-square="${from}"]`).first();
  const target = page.locator(`[data-square="${to}"]`).first();
  await expect(source).toBeVisible();
  await source.click();
  await target.click();
}

async function fenContains(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId("current-fen")).toContainText(text);
}

function toolbar(page: Page) {
  return page.locator(".game-toolbar");
}

test("renders the Chess Mentor heading in Microsoft Edge", async ({ page }) => {
  await ready(page);
  await expect(
    page.getByText("Modo LAN sin autenticación: usa solo datos ficticios."),
  ).toBeVisible();
});

test("flujo 1: mover, guardar, recargar y abrir conserva posición", async ({
  page,
}) => {
  await clearAndReady(page);
  await dragMove(page, "e2", "e4");
  await fenContains(page, "4P3");
  await toolbar(page)
    .getByRole("button", { name: /^Guardar/ })
    .click();
  await expect(toolbar(page).getByRole("status")).toHaveText("Guardado");
  await page.reload();
  await page.getByRole("button", { name: "Abrir" }).click();
  await fenContains(page, "4P3");
});

test("flujo 2: una variante comparte padre y conserva la principal", async ({
  page,
}) => {
  await clearAndReady(page);
  await dragMove(page, "e2", "e4");
  await fenContains(page, "4P3");
  await dragMove(page, "e7", "e5");
  await fenContains(page, "4p3");
  await dragMove(page, "g1", "f3");
  await fenContains(page, "5N2");
  await page.getByRole("button", { name: "e4", exact: true }).click();
  await dragMove(page, "c7", "c5");
  await expect(
    page.getByRole("button", { name: "e5", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /c5/ })).toBeVisible();
});

test("flujo 3: importar RAV, navegar y exportar/reimportar", async ({
  page,
}) => {
  await clearAndReady(page);
  await page.getByLabel("Archivo PGN").setInputFiles(annotatedFixture);
  await expect(
    page.getByRole("button", { name: "e4", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /c5/ }).click();
  await fenContains(page, "2p5");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PGN" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  if (exportedPath === null) throw new Error("No se obtuvo descarga PGN");
  await page.getByLabel("Archivo PGN").setInputFiles(exportedPath);
  await expect(
    page.getByRole("button", { name: "e4", exact: true }),
  ).toBeVisible();
});

test("flujo 4: nueva FEN y exportación conserva SetUp/FEN", async ({
  page,
}) => {
  await clearAndReady(page);
  const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
  await page.getByLabel("FEN inicial").fill(fen);
  await page.getByRole("button", { name: "Nueva desde FEN" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PGN" }).click();
  const download = await downloadPromise;
  const content = readFileSync((await download.path()) as string, "utf8");
  expect(content).toContain('[SetUp "1"]');
  expect(content).toContain(`[FEN "${fen}"]`);
});

test("flujo 5: promoción permite elegir caballo", async ({ page }) => {
  await clearAndReady(page);
  await page.getByLabel("FEN inicial").fill("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
  await page.getByRole("button", { name: "Nueva desde FEN" }).click();
  await dragMove(page, "a7", "a8");
  await expect(
    page.getByRole("dialog", { name: "Elegir promoción" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Caballo" }).click();
  await fenContains(page, "N3k3");
});

test("flujo 6: comentario/NAG, undo/redo, guardar y abrir", async ({
  page,
}) => {
  await clearAndReady(page);
  await page.getByLabel("Archivo PGN").setInputFiles(annotatedFixture);
  await page.getByRole("button", { name: "e4", exact: true }).click();
  await page.getByLabel("Comentario").fill("Plan central");
  await page.getByRole("button", { name: "Guardar comentario" }).click();
  await page.getByLabel("NAG").fill("1, 5");
  await page.getByRole("button", { name: "Guardar NAG" }).click();
  await toolbar(page).getByRole("button", { name: "Deshacer" }).click();
  await toolbar(page).getByRole("button", { name: "Rehacer" }).click();
  await toolbar(page)
    .getByRole("button", { name: /^Guardar/ })
    .click();
  await expect(toolbar(page).getByRole("status")).toHaveText("Guardado");
  await page.reload();
  await page.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("button", { name: "e4", exact: true }).click();
  await expect(page.getByLabel("Comentario")).toHaveValue("Plan central");
});

test("flujo 7: viewport móvil sin overflow y controles visibles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await expect(
    page.getByRole("button", { name: "Voltear tablero" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Importar PGN" }),
  ).toBeVisible();
});

test("flujo 8: PGN largo no deforma el tablero ni oculta navegación", async ({
  page,
}) => {
  await clearAndReady(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const longEvent = "Partida de estudio ".padEnd(240, "larga ");
  const pgn = readFileSync(annotatedFixture, "utf8").replace(
    '[Event "Chess Mentor Phase 1 Fixture"]',
    `[Event "${longEvent}"]`,
  );
  await page.getByLabel("Archivo PGN").setInputFiles({
    name: "partida-larga.pgn",
    mimeType: "application/x-chess-pgn",
    buffer: Buffer.from(pgn, "utf8"),
  });
  const dimensions = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>(".board-frame");
    return {
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      boardWidth: board?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  expect(dimensions.boardWidth).toBeLessThanOrEqual(dimensions.client);
  await expect(page.getByRole("button", { name: "Atrás" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adelante" })).toBeVisible();
});
