import { Chess } from "chess.js";

import { validateGameDocument } from "@/domain/game-tree/invariants";
import type { LibraryLocatorV1 } from "@/infrastructure/library/index/LibraryIndex";
import type { LibraryCatalogEntryV1 } from "@/infrastructure/library/catalog/LibraryCatalogRepository";
import type {
  PgnBibliographicDocumentV1,
  PgnBibliographicGameV1,
} from "@/infrastructure/library/pgn/PgnDocumentExtractor";
import {
  validateTrainerRecord,
  type TrainerExerciseRecordV1,
} from "@/infrastructure/trainer/TrainerRepository";
import type { ExerciseV1 } from "@/domain/trainer/model";

export const EXERCISE_SOURCE_CANDIDATE_SCHEMA_VERSION = 1 as const;
export const EXERCISE_SOURCE_CANDIDATE_VERSION =
  "exercise-source-candidate-v1" as const;

export type ExerciseSourceKindV1 =
  "library" | "pgn_repository" | "trainer_repository";

export type ExerciseCandidateLocatorV1 =
  | Readonly<{
      kind: "library-entry";
      importKey: string;
      locator: LibraryLocatorV1;
    }>
  | Readonly<{
      kind: "pgn-game-position";
      importKey: string;
      citationId: string;
      gameIndex: number;
      nodeId: string;
      ply: number;
    }>
  | Readonly<{
      kind: "trainer-exercise";
      exerciseId: string;
    }>;

type ExerciseCandidateSourceBaseV1 = Readonly<{
  kind: ExerciseSourceKindV1;
  id: string;
  version: string;
  schemaVersion: number;
  sha256: string | null;
}>;

export type ExerciseCandidateSourceV1 =
  | (ExerciseCandidateSourceBaseV1 &
      Readonly<{
        kind: "library";
        importKey: string;
      }>)
  | (ExerciseCandidateSourceBaseV1 &
      Readonly<{
        kind: "pgn_repository";
        importKey: string;
        citationId: string;
        gameIndex: number;
      }>)
  | (ExerciseCandidateSourceBaseV1 &
      Readonly<{
        kind: "trainer_repository";
        exercise: ExerciseV1;
      }>);

export type ExerciseSourceCandidateV1 = Readonly<{
  schemaVersion: typeof EXERCISE_SOURCE_CANDIDATE_SCHEMA_VERSION;
  candidateVersion: typeof EXERCISE_SOURCE_CANDIDATE_VERSION;
  id: string;
  title: string;
  fen: string;
  line: readonly string[];
  locator: ExerciseCandidateLocatorV1;
  source: ExerciseCandidateSourceV1;
  status: "draft";
}>;

export type LibraryExerciseSourceInput = Readonly<{
  entry: LibraryCatalogEntryV1;
  candidateId: string;
  rootFen: string;
  fen: string;
  line: readonly string[];
  locator: LibraryLocatorV1;
  title?: string;
}>;

export type ExerciseSourceAdapterResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ExerciseSourceAdapterError }>;

export type ExerciseSourceAdapterErrorCode =
  | "EXERCISE_SOURCE_INVALID_INPUT"
  | "EXERCISE_SOURCE_INVALID_LIBRARY"
  | "EXERCISE_SOURCE_INVALID_PGN"
  | "EXERCISE_SOURCE_INVALID_TRAINER"
  | "EXERCISE_SOURCE_INVALID_POSITION"
  | "EXERCISE_SOURCE_INVALID_LINE";

export type ExerciseSourceAdapterError = Readonly<{
  code: ExerciseSourceAdapterErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type ExerciseSourceInput =
  | Readonly<{
      kind: "library";
      input: LibraryExerciseSourceInput;
    }>
  | Readonly<{
      kind: "pgn_repository";
      document: PgnBibliographicDocumentV1;
    }>
  | Readonly<{
      kind: "trainer_repository";
      record: TrainerExerciseRecordV1;
    }>;

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{64}$/iu.test(value);
}

function failure<T>(
  code: ExerciseSourceAdapterErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): ExerciseSourceAdapterResult<T> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  const object = value as RecordLike;
  for (const child of Object.values(object)) freezeDeep(child);
  return Object.freeze(value as object) as T;
}

function cloneAndFreeze<T>(value: T): T {
  return freezeDeep(clone(value));
}

function normalizeLocator(
  value: unknown,
): ExerciseSourceAdapterResult<LibraryLocatorV1> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return failure(
      "EXERCISE_SOURCE_INVALID_LIBRARY",
      "El localizador bibliografico debe ser un objeto no vacio.",
    );
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      (typeof entry !== "string" || entry.length === 0) &&
      (typeof entry !== "number" || !Number.isFinite(entry))
    ) {
      return failure(
        "EXERCISE_SOURCE_INVALID_LIBRARY",
        "El localizador bibliografico contiene un valor invalido.",
        { key },
      );
    }
  }
  return { ok: true, value: clone(value) as LibraryLocatorV1 };
}

function normalizePosition(
  rootFen: unknown,
  fen: unknown,
  line: unknown,
): ExerciseSourceAdapterResult<
  Readonly<{ fen: string; line: readonly string[] }>
> {
  if (!isNonEmptyString(rootFen) || !isNonEmptyString(fen)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_POSITION",
      "rootFen y fen deben ser FEN no vacios.",
    );
  }
  if (!Array.isArray(line)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_LINE",
      "line debe ser un array de UCI.",
    );
  }

  let chess: Chess;
  let expectedFen: string;
  try {
    chess = new Chess(rootFen);
    expectedFen = new Chess(fen).fen();
  } catch {
    return failure(
      "EXERCISE_SOURCE_INVALID_POSITION",
      "rootFen o fen no son posiciones validas.",
    );
  }

  const normalizedLine: string[] = [];
  for (const [index, rawMove] of line.entries()) {
    if (typeof rawMove !== "string") {
      return failure(
        "EXERCISE_SOURCE_INVALID_LINE",
        "line contiene un movimiento no textual.",
        { index },
      );
    }
    const move = rawMove.trim().toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/u.test(move)) {
      return failure(
        "EXERCISE_SOURCE_INVALID_LINE",
        "line contiene UCI invalido.",
        { index, move: rawMove },
      );
    }
    try {
      const promotion = move.slice(4) || undefined;
      chess.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        ...(promotion === undefined ? {} : { promotion }),
      });
    } catch {
      return failure(
        "EXERCISE_SOURCE_INVALID_LINE",
        "line contiene una jugada ilegal.",
        { index, move },
      );
    }
    normalizedLine.push(move);
  }

  if (chess.fen() !== expectedFen) {
    return failure(
      "EXERCISE_SOURCE_INVALID_LINE",
      "line no reproduce el FEN declarado.",
    );
  }
  return { ok: true, value: { fen: expectedFen, line: normalizedLine } };
}

function normalizeCandidate(
  value: Readonly<{
    id: unknown;
    title: unknown;
    rootFen: unknown;
    fen: unknown;
    line: unknown;
    locator: ExerciseCandidateLocatorV1;
    source: ExerciseCandidateSourceV1;
  }>,
): ExerciseSourceAdapterResult<ExerciseSourceCandidateV1> {
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.title)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_INPUT",
      "El candidato debe tener id y title no vacios.",
    );
  }
  const position = normalizePosition(value.rootFen, value.fen, value.line);
  if (!position.ok) return position;
  return {
    ok: true,
    value: cloneAndFreeze({
      schemaVersion: EXERCISE_SOURCE_CANDIDATE_SCHEMA_VERSION,
      candidateVersion: EXERCISE_SOURCE_CANDIDATE_VERSION,
      id: value.id.trim(),
      title: value.title.trim(),
      fen: position.value.fen,
      line: position.value.line,
      locator: value.locator,
      source: value.source,
      status: "draft",
    }),
  };
}

function validateLibraryEntry(
  entry: unknown,
): ExerciseSourceAdapterResult<LibraryCatalogEntryV1> {
  if (!isRecord(entry) || !isNonEmptyString(entry.importKey)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_LIBRARY",
      "La entrada de biblioteca no tiene importKey valido.",
    );
  }
  if (
    !isNonEmptyString(entry.extractorVersion) ||
    !isNonEmptyString(entry.title)
  ) {
    return failure(
      "EXERCISE_SOURCE_INVALID_LIBRARY",
      "La entrada de biblioteca no tiene version o titulo valido.",
    );
  }
  const source = isRecord(entry.source) ? entry.source : null;
  if (!source || !isSha256(source.sha256)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_LIBRARY",
      "La entrada de biblioteca no conserva un SHA-256 valido.",
    );
  }
  if (
    typeof source.sizeBytes !== "number" ||
    !Number.isSafeInteger(source.sizeBytes) ||
    source.sizeBytes < 0 ||
    !isNonEmptyString(source.mediaType)
  ) {
    return failure(
      "EXERCISE_SOURCE_INVALID_LIBRARY",
      "La metadata binaria de biblioteca no es valida.",
    );
  }
  return { ok: true, value: entry as unknown as LibraryCatalogEntryV1 };
}

export function adaptLibraryEntry(
  input: LibraryExerciseSourceInput,
): ExerciseSourceAdapterResult<readonly ExerciseSourceCandidateV1[]> {
  if (!isRecord(input)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_INPUT",
      "La entrada bibliografica debe ser un objeto.",
    );
  }
  const entry = validateLibraryEntry(input.entry);
  if (!entry.ok) return entry;
  const locator = normalizeLocator(input.locator);
  if (!locator.ok) return locator;
  const candidate = normalizeCandidate({
    id: input.candidateId,
    title: input.title ?? entry.value.title,
    rootFen: input.rootFen,
    fen: input.fen,
    line: input.line,
    locator: {
      kind: "library-entry",
      importKey: entry.value.importKey,
      locator: locator.value,
    },
    source: {
      kind: "library",
      id: entry.value.importKey,
      version: entry.value.extractorVersion,
      schemaVersion: 1,
      sha256: entry.value.source.sha256,
      importKey: entry.value.importKey,
    },
  });
  if (!candidate.ok) return candidate;
  return { ok: true, value: [candidate.value] };
}

function gameTitle(
  game: PgnBibliographicGameV1,
  document: PgnBibliographicDocumentV1,
): string {
  return (
    game.work ??
    game.headers.Event ??
    document.source.fileName ??
    game.citationId
  );
}

function validatePgnGame(
  game: unknown,
  document: PgnBibliographicDocumentV1,
): ExerciseSourceAdapterResult<PgnBibliographicGameV1> {
  if (!isRecord(game) || !isNonEmptyString(game.citationId)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_PGN",
      "La partida PGN no conserva citationId.",
    );
  }
  if (
    !isSha256(game.sourceSha256) ||
    game.sourceSha256 !== document.source.sha256
  ) {
    return failure(
      "EXERCISE_SOURCE_INVALID_PGN",
      "La partida PGN no coincide con el hash del documento.",
      { citationId: game.citationId },
    );
  }
  if (
    typeof game.gameIndex !== "number" ||
    !Number.isSafeInteger(game.gameIndex) ||
    game.gameIndex < 0
  ) {
    return failure(
      "EXERCISE_SOURCE_INVALID_PGN",
      "gameIndex PGN no es valido.",
      { citationId: game.citationId },
    );
  }
  const errors = validateGameDocument(game.document);
  if (errors.length > 0) {
    return failure(
      "EXERCISE_SOURCE_INVALID_PGN",
      "El documento PGN no cumple las invariantes del arbol.",
      { code: errors[0]?.code ?? "INVALID_DOCUMENT" },
    );
  }
  return { ok: true, value: game as unknown as PgnBibliographicGameV1 };
}

function validatePgnDocument(
  document: unknown,
): ExerciseSourceAdapterResult<PgnBibliographicDocumentV1> {
  if (!isRecord(document) || !isNonEmptyString(document.importKey)) {
    return failure(
      "EXERCISE_SOURCE_INVALID_PGN",
      "El documento PGN no tiene importKey valido.",
    );
  }
  if (
    !isNonEmptyString(document.extractorVersion) ||
    !Number.isSafeInteger(document.schemaVersion) ||
    !isRecord(document.source) ||
    !isSha256(document.source.sha256) ||
    !Array.isArray((document.derived as RecordLike | undefined)?.games)
  ) {
    return failure(
      "EXERCISE_SOURCE_INVALID_PGN",
      "El documento PGN no conserva version, hash o juegos validos.",
    );
  }
  return { ok: true, value: document as unknown as PgnBibliographicDocumentV1 };
}

export function adaptPgnDocument(
  document: PgnBibliographicDocumentV1,
): ExerciseSourceAdapterResult<readonly ExerciseSourceCandidateV1[]> {
  const validDocument = validatePgnDocument(document);
  if (!validDocument.ok) return validDocument;
  const sourceDocument = validDocument.value;
  const candidates: ExerciseSourceCandidateV1[] = [];

  for (const rawGame of sourceDocument.derived.games) {
    const game = validatePgnGame(rawGame, sourceDocument);
    if (!game.ok) return game;
    const root = game.value.document.nodesById[game.value.document.rootNodeId];
    if (root === undefined || root.kind !== "root") {
      return failure(
        "EXERCISE_SOURCE_INVALID_PGN",
        "La partida PGN no tiene root valido.",
        { citationId: game.value.citationId },
      );
    }

    const source: ExerciseCandidateSourceV1 = {
      kind: "pgn_repository",
      id: game.value.citationId,
      version: sourceDocument.extractorVersion,
      schemaVersion: sourceDocument.schemaVersion,
      sha256: game.value.sourceSha256,
      importKey: sourceDocument.importKey,
      citationId: game.value.citationId,
      gameIndex: game.value.gameIndex,
    };

    const visit = (
      nodeId: string,
      line: readonly string[],
    ): ExerciseSourceAdapterResult<null> => {
      const node = game.value.document.nodesById[nodeId];
      if (node === undefined) {
        return failure(
          "EXERCISE_SOURCE_INVALID_PGN",
          "La ruta PGN referencia un nodo ausente.",
          { nodeId },
        );
      }
      const position = normalizePosition(root.fen, node.fen, line);
      if (!position.ok) return position;
      const lineKey = line.length === 0 ? "root" : line.join("-");
      const candidate = normalizeCandidate({
        id: `${game.value.citationId}:position:${lineKey}`,
        title: gameTitle(game.value, sourceDocument),
        rootFen: root.fen,
        fen: position.value.fen,
        line: position.value.line,
        locator: {
          kind: "pgn-game-position",
          importKey: sourceDocument.importKey,
          citationId: game.value.citationId,
          gameIndex: game.value.gameIndex,
          nodeId: node.id,
          ply: line.length,
        },
        source,
      });
      if (!candidate.ok) return candidate;
      candidates.push(candidate.value);

      for (const childId of node.childIds) {
        const child = game.value.document.nodesById[childId];
        if (child === undefined || child.kind !== "move") {
          return failure(
            "EXERCISE_SOURCE_INVALID_PGN",
            "La variante PGN contiene un hijo invalido.",
            { nodeId: childId },
          );
        }
        const childResult = visit(childId, [...line, child.uci]);
        if (!childResult.ok) return childResult;
      }
      return { ok: true, value: null };
    };

    const visited = visit(root.id, []);
    if (!visited.ok) return visited;
  }
  return { ok: true, value: candidates };
}

export function adaptTrainerRecord(
  record: TrainerExerciseRecordV1,
): ExerciseSourceAdapterResult<readonly ExerciseSourceCandidateV1[]> {
  try {
    const validated = validateTrainerRecord(record);
    const exercise = validated.exercise;
    const source: ExerciseCandidateSourceV1 = {
      kind: "trainer_repository",
      id: exercise.id,
      version: "trainer-v1",
      schemaVersion: exercise.schemaVersion,
      sha256: null,
      exercise,
    };
    const candidate = cloneAndFreeze({
      schemaVersion: EXERCISE_SOURCE_CANDIDATE_SCHEMA_VERSION,
      candidateVersion: EXERCISE_SOURCE_CANDIDATE_VERSION,
      id: `trainer:${exercise.id}`,
      title: exercise.title,
      fen: exercise.fen,
      line: [],
      locator: {
        kind: "trainer-exercise" as const,
        exerciseId: exercise.id,
      },
      source,
      status: "draft" as const,
    });
    return { ok: true, value: [candidate] };
  } catch (cause) {
    return failure(
      "EXERCISE_SOURCE_INVALID_TRAINER",
      "El registro del repositorio de ejercicios no es valido.",
      { detail: cause instanceof Error ? cause.message : String(cause) },
    );
  }
}

export function adaptExerciseSource(
  input: ExerciseSourceInput,
): ExerciseSourceAdapterResult<readonly ExerciseSourceCandidateV1[]> {
  if (!isRecord(input) || typeof input.kind !== "string") {
    return failure(
      "EXERCISE_SOURCE_INVALID_INPUT",
      "La fuente de ejercicios debe declarar kind.",
    );
  }
  if (input.kind === "library") return adaptLibraryEntry(input.input);
  if (input.kind === "pgn_repository") return adaptPgnDocument(input.document);
  if (input.kind === "trainer_repository")
    return adaptTrainerRecord(input.record);
  return failure(
    "EXERCISE_SOURCE_INVALID_INPUT",
    "El kind de fuente no esta soportado.",
  );
}

export const adaptLibraryCatalogEntry = adaptLibraryEntry;
export const adaptPgnRepository = adaptPgnDocument;
export const adaptTrainerRepository = adaptTrainerRecord;
