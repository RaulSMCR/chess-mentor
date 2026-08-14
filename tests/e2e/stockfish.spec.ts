import { Chess } from "chess.js";
import { expect, test } from "@playwright/test";

const STANDARD_FEN = new Chess().fen();

test("ejecuta Stockfish aprobado y muestra una PV legal", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Análisis del motor" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("heading", { level: 2, name: "Análisis Stockfish" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", { level: 3, name: "Línea 1" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(panel.getByLabel("Flechas de PV línea 1")).toBeVisible();
  await expect(panel.getByText(/Profundidad:/)).toBeVisible();
  await expect(panel.getByText(/MultiPV: 2\/2/)).toBeVisible();
  await expect(panel.getByText("Motor no disponible")).toHaveCount(0);

  const metadata = await panel
    .locator(".analysis-line-meta")
    .first()
    .textContent();
  const bestmove = metadata?.match(
    /Mejor jugada ([a-h][1-8][a-h][1-8][qrbn]?)/u,
  )?.[1];
  expect(bestmove).toBeDefined();
  if (bestmove === undefined) return;
  const chess = new Chess(STANDARD_FEN);
  expect(() =>
    chess.move({
      from: bestmove.slice(0, 2),
      to: bestmove.slice(2, 4),
      ...(bestmove.length === 5 ? { promotion: bestmove.slice(4) } : {}),
    }),
  ).not.toThrow();
});
