"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyMutation,
  applyNavigation,
  isDirty,
  markSaved,
  redo,
  startSession,
  undo,
  type GameSession,
} from "@/domain/game-tree/history";
import {
  navigateBack,
  navigateForward,
  navigateTo,
  playMove,
  setComment,
  setNags,
} from "@/domain/game-tree/commands";
import {
  createGameDocument,
  getPromotionOptions,
} from "@/domain/game-tree/replay";
import type {
  Clock,
  DomainError,
  GameDocumentV1,
  IdFactory,
  MoveInput,
  Result,
} from "@/domain/game-tree/model";
import {
  GameRepositoryError,
  type GameRepository,
} from "@/infrastructure/games/GameRepository";
import { LocalStorageGameRepository } from "@/infrastructure/games/LocalStorageGameRepository";
import { MemoryGameRepository } from "@/infrastructure/games/MemoryGameRepository";
import { exportPgn, importPgn, type PgnWarning } from "@/domain/pgn/adapter";
import type { GameSummary } from "@/infrastructure/games/GameRepository";

export const STANDARD_ROOT_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type GameSessionOptions = Readonly<{
  repository?: GameRepository;
  idFactory?: IdFactory;
  clock?: Clock;
  rootFen?: string;
}>;

export type GameSessionState = Readonly<{
  status: "loading" | "ready";
  session: GameSession | null;
  busy: boolean;
  error: string | null;
}>;

export type GameSessionController = Readonly<{
  state: GameSessionState;
  session: GameSession | null;
  document: GameDocumentV1 | null;
  dirty: boolean;
  error: string | null;
  savedGames: readonly GameSummary[];
  newGame: (rootFen?: string) => void;
  save: () => Promise<void>;
  play: (move: MoveInput) => boolean;
  promotionOptions: (from: string, to: string) => Result<readonly string[]>;
  reportError: (message: string) => void;
  setComment: (nodeId: string, comment: string) => boolean;
  setNags: (nodeId: string, nags: readonly number[]) => boolean;
  navigate: (nodeId: string) => void;
  back: () => void;
  forward: (childId?: string) => void;
  undo: () => void;
  redo: () => void;
  importText: (
    text: string,
    acceptWarnings?: boolean,
  ) => { ok: true; warnings: readonly PgnWarning[] } | { ok: false };
  exportText: () => string | null;
  refreshSavedGames: () => Promise<void>;
  openSaved: (id: string) => Promise<boolean>;
  deleteSaved: (id: string) => Promise<boolean>;
}>;

function defaultIdFactory(): IdFactory {
  return () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `game-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
}

function defaultClock(): Clock {
  return () => new Date().toISOString();
}

function errorMessage(error: unknown): string {
  if (error instanceof GameRepositoryError)
    return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function makeDocument(
  rootFen: string,
  idFactory: IdFactory,
  clock: Clock,
): GameDocumentV1 {
  const result = createGameDocument({ rootFen, idFactory, clock });
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

export function useGameSession(
  options: GameSessionOptions = {},
): GameSessionController {
  const idFactoryRef = useRef<IdFactory>(
    options.idFactory ?? defaultIdFactory(),
  );
  const clockRef = useRef<Clock>(options.clock ?? defaultClock());
  const repositoryRef = useRef<GameRepository | null>(
    options.repository ?? null,
  );
  const initializedRef = useRef(false);
  const [state, setState] = useState<GameSessionState>({
    status: "loading",
    session: null,
    busy: false,
    error: null,
  });
  const [savedGames, setSavedGames] = useState<readonly GameSummary[]>([]);
  const sessionRef = useRef<GameSession | null>(null);
  sessionRef.current = state.session;

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (repositoryRef.current === null) {
      repositoryRef.current =
        typeof window === "undefined"
          ? new MemoryGameRepository()
          : new LocalStorageGameRepository(() => window.localStorage);
    }
    try {
      const session = startSession(
        makeDocument(
          options.rootFen ?? STANDARD_ROOT_FEN,
          idFactoryRef.current,
          clockRef.current,
        ),
      );
      setState({ status: "ready", session, busy: false, error: null });
    } catch (error) {
      setState({
        status: "ready",
        session: null,
        busy: false,
        error: errorMessage(error),
      });
    }
  }, [options.rootFen]);

  const refreshSavedGames = useCallback(async () => {
    const repository = repositoryRef.current;
    if (repository === null) return;
    try {
      setSavedGames(await repository.list());
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
    }
  }, []);

  const play = useCallback((move: MoveInput): boolean => {
    const currentSession = sessionRef.current;
    if (currentSession === null) return false;
    const result = playMove(currentSession.present, move, {
      idFactory: idFactoryRef.current,
      clock: clockRef.current,
    });
    if (!result.ok) {
      setState((current) => ({
        ...current,
        error: `${result.error.code}: ${result.error.message}`,
      }));
      return false;
    }
    const next = applyMutation(currentSession, () => result.value);
    if (!next.ok) {
      setState((current) => ({
        ...current,
        error: `${next.error.code}: ${next.error.message}`,
      }));
      return false;
    }
    setState((current) => ({ ...current, session: next.value, error: null }));
    return true;
  }, []);

  const promotionOptions = useCallback(
    (from: string, to: string): Result<readonly string[]> => {
      const currentSession = sessionRef.current;
      if (currentSession === null) {
        return {
          ok: false,
          error: {
            code: "NODE_NOT_FOUND",
            message: "La sesión aún no está lista.",
          },
        };
      }
      return getPromotionOptions(
        currentSession.present,
        currentSession.present.cursorNodeId,
        from,
        to,
      );
    },
    [],
  );

  const reportError = useCallback((message: string) => {
    setState((current) => ({ ...current, error: message }));
  }, []);

  const setCommentAction = useCallback(
    (nodeId: string, comment: string): boolean => {
      const currentSession = sessionRef.current;
      if (currentSession === null) return false;
      const result = setComment(currentSession.present, nodeId, comment, {
        clock: clockRef.current,
      });
      if (!result.ok) {
        reportError(`${result.error.code}: ${result.error.message}`);
        return false;
      }
      const next = applyMutation(currentSession, () => result.value);
      if (!next.ok) {
        reportError(`${next.error.code}: ${next.error.message}`);
        return false;
      }
      setState((current) => ({ ...current, session: next.value, error: null }));
      return true;
    },
    [reportError],
  );

  const setNagsAction = useCallback(
    (nodeId: string, nags: readonly number[]): boolean => {
      const currentSession = sessionRef.current;
      if (currentSession === null) return false;
      const result = setNags(currentSession.present, nodeId, nags, {
        clock: clockRef.current,
      });
      if (!result.ok) {
        reportError(`${result.error.code}: ${result.error.message}`);
        return false;
      }
      const next = applyMutation(currentSession, () => result.value);
      if (!next.ok) {
        reportError(`${next.error.code}: ${next.error.message}`);
        return false;
      }
      setState((current) => ({ ...current, session: next.value, error: null }));
      return true;
    },
    [reportError],
  );

  const navigate = useCallback((nodeId: string) => {
    setState((current) => {
      if (current.session === null) return current;
      const result = navigateTo(current.session.present, nodeId);
      if (!result.ok)
        return {
          ...current,
          error: `${result.error.code}: ${result.error.message}`,
        };
      const next = applyNavigation(current.session, () => result.value);
      return next.ok
        ? { ...current, session: next.value, error: null }
        : { ...current, error: `${next.error.code}: ${next.error.message}` };
    });
  }, []);

  const back = useCallback(() => {
    setState((current) => {
      if (current.session === null) return current;
      const result = navigateBack(current.session.present);
      if (!result.ok)
        return {
          ...current,
          error: `${result.error.code}: ${result.error.message}`,
        };
      const next = applyNavigation(current.session, () => result.value);
      return next.ok
        ? { ...current, session: next.value, error: null }
        : current;
    });
  }, []);

  const forward = useCallback((childId?: string) => {
    setState((current) => {
      if (current.session === null) return current;
      const result = navigateForward(current.session.present, childId);
      if (!result.ok)
        return {
          ...current,
          error: `${result.error.code}: ${result.error.message}`,
        };
      const next = applyNavigation(current.session, () => result.value);
      return next.ok
        ? { ...current, session: next.value, error: null }
        : current;
    });
  }, []);

  const newGame = useCallback((rootFen = STANDARD_ROOT_FEN) => {
    setState((current) => {
      try {
        const session = startSession(
          makeDocument(rootFen, idFactoryRef.current, clockRef.current),
        );
        return { ...current, status: "ready", session, error: null };
      } catch (error) {
        return { ...current, error: errorMessage(error) };
      }
    });
  }, []);

  const save = useCallback(async () => {
    const session = state.session;
    const repository = repositoryRef.current;
    if (session === null || repository === null) return;
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      await repository.save(session.present);
      setState((current) =>
        current.session === null
          ? current
          : {
              ...current,
              session: markSaved(current.session),
              busy: false,
              error: null,
            },
      );
      void refreshSavedGames();
    } catch (error) {
      setState((current) => ({
        ...current,
        busy: false,
        error: errorMessage(error),
      }));
    }
  }, [refreshSavedGames, state.session]);

  const importText = useCallback(
    (
      text: string,
      acceptWarnings = false,
    ): { ok: true; warnings: readonly PgnWarning[] } | { ok: false } => {
      const result = importPgn(text, {
        idFactory: idFactoryRef.current,
        clock: clockRef.current,
      });
      if (!result.ok) {
        setState((current) => ({
          ...current,
          error: `${result.error.code}: ${result.error.message}`,
        }));
        return { ok: false };
      }
      if (!acceptWarnings) {
        return { ok: true, warnings: result.value.warnings };
      }
      setState((current) => ({
        ...current,
        session: startSession(result.value.document),
        error: null,
      }));
      return { ok: true, warnings: result.value.warnings };
    },
    [],
  );

  const exportText = useCallback(() => {
    const document = sessionRef.current?.present;
    if (document === undefined) return null;
    const result = exportPgn(document);
    if (!result.ok) {
      setState((current) => ({
        ...current,
        error: `${result.error.code}: ${result.error.message}`,
      }));
      return null;
    }
    return result.value;
  }, []);

  const openSaved = useCallback(async (id: string): Promise<boolean> => {
    const repository = repositoryRef.current;
    if (repository === null) return false;
    try {
      const document = await repository.get(id);
      if (document === null) {
        setState((current) => ({
          ...current,
          error: "La partida guardada ya no existe.",
        }));
        return false;
      }
      setState((current) => ({
        ...current,
        session: markSaved(startSession(document)),
        error: null,
      }));
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: errorMessage(error) }));
      return false;
    }
  }, []);

  const deleteSaved = useCallback(
    async (id: string): Promise<boolean> => {
      const repository = repositoryRef.current;
      if (repository === null) return false;
      try {
        await repository.remove(id);
        setState((current) => {
          if (current.session?.present.id !== id) return current;
          return {
            ...current,
            session:
              current.session === null
                ? null
                : { ...current.session, savedSnapshot: null },
          };
        });
        await refreshSavedGames();
        return true;
      } catch (error) {
        setState((current) => ({ ...current, error: errorMessage(error) }));
        return false;
      }
    },
    [refreshSavedGames],
  );

  const applySession = useCallback(
    (transform: (session: GameSession) => Result<GameSession>) => {
      setState((current) => {
        if (current.session === null) return current;
        const result = transform(current.session);
        return result.ok
          ? { ...current, session: result.value, error: null }
          : {
              ...current,
              error: `${result.error.code}: ${result.error.message}`,
            };
      });
    },
    [],
  );

  const undoAction = useCallback(() => applySession(undo), [applySession]);
  const redoAction = useCallback(() => applySession(redo), [applySession]);

  return {
    state,
    session: state.session,
    document: state.session?.present ?? null,
    dirty: state.session === null ? false : isDirty(state.session),
    error: state.error,
    savedGames,
    newGame,
    save,
    play,
    promotionOptions,
    reportError,
    setComment: setCommentAction,
    setNags: setNagsAction,
    navigate,
    back,
    forward,
    undo: undoAction,
    redo: redoAction,
    importText,
    exportText,
    refreshSavedGames,
    openSaved,
    deleteSaved,
  };
}

export function formatSessionError(error: DomainError): string {
  return `${error.code}: ${error.message}`;
}
