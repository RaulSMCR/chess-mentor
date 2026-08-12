import positions from "../../fixtures/phase1/positions.json";

export type PositionFixture = Readonly<{
  fen: string;
  expected: string;
}>;

export function loadPositionsFixture(): Readonly<
  Record<string, PositionFixture>
> {
  return positions;
}
