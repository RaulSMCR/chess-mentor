"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";

import {
  evaluateAttempt,
  type TrainerQuality,
} from "@/domain/trainer/evaluateAttempt";
import {
  HINT_LEVELS,
  requestHint,
  type HintLevel,
} from "@/domain/trainer/hints";
import { createExercise, type ExerciseV1 } from "@/domain/trainer/model";
import {
  createInitialSchedule,
  scheduleReview,
  type SchedulerClock,
} from "@/domain/trainer/scheduler";
import { LocalStorageTrainerRepository } from "@/infrastructure/trainer/LocalStorageTrainerRepository";
import { MemoryTrainerRepository } from "@/infrastructure/trainer/MemoryTrainerRepository";
import type {
  TrainerExerciseRecordV1,
  TrainerRepository,
} from "@/infrastructure/trainer/TrainerRepository";
import type { EngineAdapter } from "@/engine/EngineAdapter";
import {
  TrainerEngineVariantRunner,
  type EngineVariantResult,
} from "./engineVariant";

const STANDARD_TRAINER_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type TrainerForm = Readonly<{
  title: string;
  fen: string;
  acceptedMoves: string;
  concept: string;
  destination: string;
  difficulty: string;
  timeLimitMs: string;
}>;

type HintMessage = Readonly<{
  level: HintLevel;
  text: string;
}>;

type AttemptResult = Readonly<{
  score: number;
  quality: TrainerQuality;
  correct: boolean;
  timedOut: boolean;
  legal: boolean;
  nextDueAt: string;
}>;

export type TrainerPanelProps = Readonly<{
  repository?: TrainerRepository;
  engineAdapter?: EngineAdapter;
  clock?: SchedulerClock;
  idFactory?: () => string;
}>;

const INITIAL_FORM: TrainerForm = {
  title: "Centro y desarrollo",
  fen: STANDARD_TRAINER_FEN,
  acceptedMoves: "e2e4, d2d4",
  concept: "Controla el centro y desarrolla una pieza.",
  destination: "Busca una casilla central segura para el peón.",
  difficulty: "3",
  timeLimitMs: "60000",
};

function defaultClock(): string {
  return new Date().toISOString();
}

function defaultIdFactory(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `exercise-${Date.now()}`;
}

function defaultRepository(): TrainerRepository {
  return typeof window === "undefined"
    ? new MemoryTrainerRepository()
    : new LocalStorageTrainerRepository(() => window.localStorage);
}

function repositoryError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "No se pudo acceder al repositorio de ejercicios.";
}

function formFromExercise(exercise: ExerciseV1): TrainerForm {
  return {
    title: exercise.title,
    fen: exercise.fen,
    acceptedMoves: exercise.acceptedMoves.join(", "),
    concept: exercise.hints.concept,
    destination: exercise.hints.destination,
    difficulty: String(exercise.difficulty),
    timeLimitMs:
      exercise.timeLimitMs === null ? "" : String(exercise.timeLimitMs),
  };
}

function formatDueDate(value: string): string {
  return value.replace("T", " ").replace(".000Z", " UTC");
}

function formatResult(result: EngineVariantResult): string {
  if (!result.ok) return result.diagnostic.message;
  return `Variante: ${result.variant.pv.join(" ")}`;
}

function parseDifficulty(value: string): 1 | 2 | 3 | 4 | 5 | null {
  const parsed = Number(value);
  return parsed === 1 ||
    parsed === 2 ||
    parsed === 3 ||
    parsed === 4 ||
    parsed === 5
    ? parsed
    : null;
}

export function TrainerPanel({
  repository,
  engineAdapter,
  clock = defaultClock,
  idFactory = defaultIdFactory,
}: TrainerPanelProps) {
  const repositoryRef = useRef<TrainerRepository>(
    repository ?? defaultRepository(),
  );
  const initializedRef = useRef(false);
  const runnerRef = useRef<TrainerEngineVariantRunner | null>(null);
  const attemptStartedAtRef = useRef<string | null>(null);
  const [records, setRecords] = useState<readonly TrainerExerciseRecordV1[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TrainerForm>(INITIAL_FORM);
  const [move, setMove] = useState("");
  const [hintsUsed, setHintsUsed] = useState<readonly HintLevel[]>([]);
  const [hintMessages, setHintMessages] = useState<readonly HintMessage[]>([]);
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(
    null,
  );
  const [status, setStatus] = useState("Preparado para crear un ejercicio.");
  const [busy, setBusy] = useState(false);
  const [attemptActive, setAttemptActive] = useState(false);

  const selected = useMemo(
    () => records.find((record) => record.exercise.id === selectedId) ?? null,
    [records, selectedId],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void repositoryRef.current
      .list()
      .then((loaded) => {
        setRecords(loaded);
        const first = loaded[0];
        if (first === undefined) return;
        setSelectedId(first.exercise.id);
        setForm(formFromExercise(first.exercise));
        setStatus("Ejercicio guardado listo para practicar.");
      })
      .catch((error: unknown) => setStatus(repositoryError(error)));
  }, []);

  useEffect(() => {
    return () => {
      void runnerRef.current?.dispose();
    };
  }, []);

  const updateForm = useCallback((field: keyof TrainerForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  const selectRecord = useCallback((record: TrainerExerciseRecordV1) => {
    setSelectedId(record.exercise.id);
    setForm(formFromExercise(record.exercise));
    setMove("");
    setHintsUsed([]);
    setHintMessages([]);
    setAttemptResult(null);
    attemptStartedAtRef.current = null;
    setAttemptActive(false);
    setStatus("Ejercicio abierto. Pulsa Iniciar intento cuando estés listo.");
  }, []);

  const createNewExercise = useCallback(async () => {
    const difficulty = parseDifficulty(form.difficulty);
    if (difficulty === null) {
      setStatus("La dificultad debe ser un entero entre 1 y 5.");
      return;
    }
    const parsedTime =
      form.timeLimitMs.trim() === "" ? null : Number(form.timeLimitMs);
    const exerciseResult = createExercise({
      id: idFactory(),
      title: form.title,
      fen: form.fen,
      acceptedMoves: form.acceptedMoves
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      hints: { concept: form.concept, destination: form.destination },
      difficulty,
      timeLimitMs: parsedTime,
    });
    if (!exerciseResult.ok) {
      setStatus(
        `${exerciseResult.error.code}: ${exerciseResult.error.message}`,
      );
      return;
    }
    const schedule = createInitialSchedule(clock);
    if (!schedule.ok) {
      setStatus(`${schedule.error.code}: ${schedule.error.message}`);
      return;
    }
    const record: TrainerExerciseRecordV1 = {
      exercise: exerciseResult.value,
      schedule: schedule.value,
      attempts: [],
    };
    setBusy(true);
    try {
      await repositoryRef.current.save(record);
      setRecords((current) =>
        [
          ...current.filter((item) => item.exercise.id !== record.exercise.id),
          record,
        ].sort((left, right) =>
          left.exercise.id.localeCompare(right.exercise.id),
        ),
      );
      selectRecord(record);
      setStatus("Ejercicio creado y guardado localmente.");
    } catch (error) {
      setStatus(repositoryError(error));
    } finally {
      setBusy(false);
    }
  }, [clock, form, idFactory, selectRecord]);

  const beginAttempt = useCallback(() => {
    if (selected === null) {
      setStatus("Crea o abre un ejercicio antes de comenzar.");
      return;
    }
    attemptStartedAtRef.current = clock();
    setAttemptActive(true);
    setAttemptResult(null);
    setMove("");
    setHintsUsed([]);
    setHintMessages([]);
    setStatus("Intento activo. Responde con una jugada UCI.");
  }, [clock, selected]);

  const submitAttempt = useCallback(async () => {
    if (selected === null) {
      setStatus("Crea o abre un ejercicio antes de responder.");
      return;
    }
    const startedAt = attemptStartedAtRef.current ?? clock();
    const elapsedMs = Math.max(0, Date.parse(clock()) - Date.parse(startedAt));
    const evaluation = evaluateAttempt({
      exercise: selected.exercise,
      move,
      elapsedMs,
      hintsUsed,
    });
    if (!evaluation.ok) {
      setStatus(`${evaluation.error.code}: ${evaluation.error.message}`);
      return;
    }
    const nextSchedule = scheduleReview(
      selected.schedule,
      evaluation.value.quality,
      clock,
    );
    if (!nextSchedule.ok) {
      setStatus(`${nextSchedule.error.code}: ${nextSchedule.error.message}`);
      return;
    }
    const attempt = {
      id: idFactory(),
      ...evaluation.value,
      reviewedAt: clock(),
    };
    const nextRecord: TrainerExerciseRecordV1 = {
      ...selected,
      schedule: nextSchedule.value,
      attempts: [...selected.attempts, attempt],
    };
    setBusy(true);
    try {
      await repositoryRef.current.save(nextRecord);
      setRecords((current) =>
        current.map((record) =>
          record.exercise.id === nextRecord.exercise.id ? nextRecord : record,
        ),
      );
      setAttemptResult({
        score: evaluation.value.score,
        quality: evaluation.value.quality,
        correct: evaluation.value.correct,
        timedOut: evaluation.value.timedOut,
        legal: evaluation.value.legal,
        nextDueAt: nextSchedule.value.nextDueAt,
      });
      attemptStartedAtRef.current = null;
      setAttemptActive(false);
      setStatus("Intento guardado localmente.");
    } catch (error) {
      setStatus(repositoryError(error));
    } finally {
      setBusy(false);
    }
  }, [clock, hintsUsed, idFactory, move, selected]);

  const askHint = useCallback(
    (level: HintLevel) => {
      if (selected === null) return;
      const result = requestHint(selected.exercise, level, hintsUsed);
      if (!result.ok) {
        setStatus(`${result.error.code}: ${result.error.message}`);
        return;
      }
      setHintsUsed(result.value.hintsUsed);
      setHintMessages((current) => [
        ...current,
        { level: result.value.level, text: result.value.text },
      ]);
      setStatus(
        `Pista usada. Penalización acumulada: ${result.value.totalPenalty}.`,
      );
    },
    [hintsUsed, selected],
  );

  const generateVariant = useCallback(async () => {
    if (selected === null || engineAdapter === undefined) {
      setStatus(
        "Stockfish opcional no disponible; el ejercicio sigue utilizable.",
      );
      return;
    }
    if (runnerRef.current === null) {
      runnerRef.current = new TrainerEngineVariantRunner(engineAdapter);
    }
    const result = await runnerRef.current.generate({
      fen: selected.exercise.fen,
    });
    setStatus(formatResult(result));
  }, [engineAdapter, selected]);

  const nextHint = HINT_LEVELS[hintsUsed.length];

  return (
    <section className="trainer-panel" aria-label="Entrenador de ejercicios">
      <header className="trainer-header">
        <div>
          <p className="eyebrow">Práctica determinista</p>
          <h2>Entrenador</h2>
        </div>
        <span role="status" aria-live="polite">
          {status}
        </span>
      </header>

      <div className="trainer-create">
        <h3>Crear ejercicio</h3>
        <label>
          Título
          <input
            aria-label="Título del ejercicio"
            value={form.title}
            onChange={(event) => updateForm("title", event.target.value)}
          />
        </label>
        <label>
          FEN del ejercicio
          <input
            aria-label="FEN del ejercicio"
            value={form.fen}
            onChange={(event) => updateForm("fen", event.target.value)}
          />
        </label>
        <label>
          Jugadas aceptadas (UCI, separadas por coma)
          <input
            aria-label="Jugadas aceptadas"
            autoComplete="off"
            type="password"
            value={form.acceptedMoves}
            onChange={(event) =>
              updateForm("acceptedMoves", event.target.value)
            }
          />
        </label>
        <div className="trainer-form-grid">
          <label>
            Concepto
            <input
              aria-label="Pista de concepto"
              value={form.concept}
              onChange={(event) => updateForm("concept", event.target.value)}
            />
          </label>
          <label>
            Destino
            <input
              aria-label="Pista de destino"
              value={form.destination}
              onChange={(event) =>
                updateForm("destination", event.target.value)
              }
            />
          </label>
          <label>
            Dificultad (1–5)
            <input
              aria-label="Dificultad"
              inputMode="numeric"
              value={form.difficulty}
              onChange={(event) => updateForm("difficulty", event.target.value)}
            />
          </label>
          <label>
            Tiempo límite (ms; vacío = sin límite)
            <input
              aria-label="Tiempo límite"
              inputMode="numeric"
              value={form.timeLimitMs}
              onChange={(event) =>
                updateForm("timeLimitMs", event.target.value)
              }
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void createNewExercise()}
          disabled={busy}
        >
          Crear ejercicio
        </button>
      </div>

      <div className="trainer-library">
        <h3>Ejercicios guardados</h3>
        {records.length === 0 ? (
          <p className="trainer-empty">Todavía no hay ejercicios guardados.</p>
        ) : (
          <ul>
            {records.map((record) => (
              <li key={record.exercise.id}>
                <span>
                  <strong>{record.exercise.title}</strong> · dificultad{" "}
                  {record.exercise.difficulty}
                </span>
                <button
                  type="button"
                  onClick={() => selectRecord(record)}
                  aria-pressed={record.exercise.id === selectedId}
                >
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="trainer-practice">
        <h3>Intento</h3>
        {selected === null ? (
          <p className="trainer-empty">Crea un ejercicio para comenzar.</p>
        ) : (
          <>
            <p className="trainer-exercise-title">{selected.exercise.title}</p>
            <div
              className="trainer-board-frame"
              aria-label="Tablero temporal del ejercicio"
            >
              <Chessboard
                options={{
                  position: selected.exercise.fen,
                  allowDragging: false,
                }}
              />
            </div>
            <p className="trainer-fen">FEN: {selected.exercise.fen}</p>
            <div className="trainer-actions">
              <button type="button" onClick={beginAttempt} disabled={busy}>
                Iniciar intento
              </button>
              <button
                type="button"
                onClick={() => void generateVariant()}
                disabled={busy || engineAdapter === undefined}
              >
                Variante corta del motor
              </button>
            </div>
            <p className="trainer-engine-note">
              {engineAdapter === undefined
                ? "Stockfish opcional no disponible: puedes responder manualmente."
                : "La variante del motor es opcional y no modifica la partida."}
            </p>
            <div className="trainer-hints">
              <h4>Pistas</h4>
              <div className="trainer-hint-actions">
                {HINT_LEVELS.map((level) => (
                  <button
                    type="button"
                    key={level}
                    onClick={() => askHint(level)}
                    disabled={busy || level !== nextHint}
                  >
                    Pista: {level}
                  </button>
                ))}
              </div>
              {hintMessages.length === 0 ? null : (
                <ol>
                  {hintMessages.map((hint) => (
                    <li key={hint.level}>{hint.text}</li>
                  ))}
                </ol>
              )}
              <p>Penalización acumulada: {hintsUsed.length}</p>
            </div>
            <form
              className="trainer-attempt-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitAttempt();
              }}
            >
              <label>
                Jugada UCI
                <input
                  aria-label="Jugada UCI"
                  value={move}
                  onChange={(event) => setMove(event.target.value)}
                  placeholder="e2e4"
                />
              </label>
              <button type="submit" disabled={busy || !attemptActive}>
                Evaluar jugada
              </button>
            </form>
            {!attemptActive && attemptResult === null ? (
              <p className="trainer-empty">
                Inicia el intento para habilitar la respuesta.
              </p>
            ) : null}
            {attemptResult === null ? null : (
              <div className="trainer-result" role="status">
                <strong>
                  {attemptResult.correct
                    ? "Respuesta correcta"
                    : "Respuesta no válida"}
                </strong>
                <span>
                  Puntuación: {attemptResult.score}/5 · calidad{" "}
                  {attemptResult.quality}
                </span>
                <span>
                  Legal: {attemptResult.legal ? "sí" : "no"} · timeout:{" "}
                  {attemptResult.timedOut ? "sí" : "no"}
                </span>
                <span>
                  Próxima repetición: {formatDueDate(attemptResult.nextDueAt)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {selected === null ? null : (
        <p className="trainer-schedule">
          Repeticiones: {selected.schedule.repetitions} · próxima:{" "}
          {formatDueDate(selected.schedule.nextDueAt)} · intentos:{" "}
          {selected.attempts.length}
        </p>
      )}
    </section>
  );
}
