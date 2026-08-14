# Fase 3 — Entrenador determinista

Esta fase empieza después de CM-124. El entrenador funciona sin Ollama,
Supabase, PostgreSQL ni Internet. Stockfish es opcional: cuando falta, los
ejercicios creados manualmente siguen siendo utilizables.

## Decisiones congeladas

- D-017: las pistas y explicaciones son deterministas y las plantillas no son
  LLM.
- D-025: la aceptación usa conjuntos de UCI normalizados; MultiPV puede generar
  un conjunto dentro de 50 cp de la mejor línea.
- D-026: pistas `concept` → `destination` → `engine`, con un punto de penalidad
  por nivel y sin saltos.
- D-027: scheduler SM-2, calidad 0–5, reloj inyectable y fechas UTC.
- D-028: dificultad 1–5 y límite predeterminado de 60 segundos.
- D-029: repositorio local de ejercicios separado de partidas.

## Orden

`CM-300 → CM-301 → CM-302 → CM-303 → CM-304 → CM-305 → CM-306`

## Gate de fase

- El mismo ejercicio, intento, reloj y respuestas producen el mismo resultado
  y `nextDueAt`.
- Las jugadas equivalentes siguen D-025, incluida la promoción.
- Pedir pistas respeta el orden y no revela la solución antes del nivel engine.
- El scheduler no depende de la zona horaria local ni del reloj real.
- Stockfish ausente deja ejercicios manuales utilizables.
- Ningún intento crea, edita o reordena nodos de `GameDocumentV1`.

---

# CM-300 — Congelar políticas y tarjetas de Fase 3

Estado inicial: `in_progress`

## Objetivo

Registrar las decisiones aprobadas y dejar una secuencia de tarjetas que otro
modelo pueda ejecutar sin inventar contratos.

## Archivos permitidos

- `docs/DECISIONS.md`.
- `tasks/PHASE-3.md`.
- `tasks/STATUS.md`.

## Verificación focal

```powershell
pnpm.cmd exec prettier --check docs/DECISIONS.md tasks/PHASE-3.md tasks/STATUS.md
```

## Commit local de cierre

- Mensaje: `CM-300: define deterministic trainer phase`.
- Stage permitido: `docs/DECISIONS.md tasks/PHASE-3.md tasks/STATUS.md`.

---

# CM-301 — Contrato de ejercicios y aceptación de jugadas

Estado inicial: `pending`

## Objetivo

Crear el modelo serializable de ejercicio y evaluar una respuesta legal sin
mutar partidas ni depender de React o Stockfish real.

## Archivos permitidos

- `src/domain/trainer/model.ts`.
- `src/domain/trainer/evaluateAttempt.ts`.
- `src/domain/trainer/model.test.ts`.
- `src/domain/trainer/evaluateAttempt.test.ts`.
- `tasks/STATUS.md`.

## Reglas

- Validar FEN, dificultad, límite temporal y `acceptedMoves` con invariantes
  explícitas.
- Normalizar UCI en minúsculas y conservar promoción.
- Validar legalidad con `chess.js`; una respuesta ilegal nunca es correcta.
- No importar `GameRepository`, React, `EngineSession` ni guardar nodos.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/trainer/model.test.ts src/domain/trainer/evaluateAttempt.test.ts
```

## Commit local de cierre

- Mensaje: `CM-301: add trainer exercise contract`.
- Stage permitido: `src/domain/trainer/model.ts src/domain/trainer/evaluateAttempt.ts src/domain/trainer/model.test.ts src/domain/trainer/evaluateAttempt.test.ts tasks/STATUS.md`.

---

# CM-302 — Pistas y puntuación deterministas

Estado inicial: `pending`

## Objetivo

Aplicar D-026 con plantillas de pistas, penalización acumulada y resultado de
intento reproducible.

## Archivos permitidos

- `src/domain/trainer/hints.ts`.
- `src/domain/trainer/hints.test.ts`.
- `src/domain/trainer/evaluateAttempt.ts` y su test si la integración es focal.
- `tasks/STATUS.md`.

## Reglas

- `concept` no contiene casilla ni movimiento; `destination` no contiene la
  jugada completa; `engine` es el único nivel que puede mostrarla.
- Rechazar saltos de nivel y duplicados sin aumentar la penalización.
- Mantener `hintsUsed`, `penalty` y score sin usar aleatoriedad.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/trainer/hints.test.ts src/domain/trainer/evaluateAttempt.test.ts
```

## Commit local de cierre

- Mensaje: `CM-302: add deterministic trainer hints`.
- Stage permitido: `src/domain/trainer/hints.ts src/domain/trainer/hints.test.ts src/domain/trainer/evaluateAttempt.ts src/domain/trainer/evaluateAttempt.test.ts tasks/STATUS.md`.

---

# CM-303 — Scheduler SM-2 con reloj inyectable

Estado inicial: `pending`

## Objetivo

Calcular progreso y próxima fecha de repetición de forma pura, reproducible y
sin depender de la zona horaria del equipo.

## Archivos permitidos

- `src/domain/trainer/scheduler.ts`.
- `src/domain/trainer/scheduler.test.ts`.
- `tasks/STATUS.md`.

## Reglas

- Implementar D-027 sin paquete externo.
- Serializar siempre UTC y probar cambio de día/mes/año con reloj fijo.
- Repetir una misma entrada no debe mutar el resultado anterior.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/trainer/scheduler.test.ts
```

## Commit local de cierre

- Mensaje: `CM-303: add deterministic SM2 scheduler`.
- Stage permitido: `src/domain/trainer/scheduler.ts src/domain/trainer/scheduler.test.ts tasks/STATUS.md`.

---

# CM-304 — Repositorio local de ejercicios

Estado inicial: `pending`

## Objetivo

Persistir ejercicios e intentos detrás de una interfaz local, manteniendo
aislados los datos del entrenador de `chess-mentor.games.v1`.

## Archivos permitidos

- `src/infrastructure/trainer/TrainerRepository.ts`.
- `src/infrastructure/trainer/MemoryTrainerRepository.ts`.
- `src/infrastructure/trainer/LocalStorageTrainerRepository.ts`.
- `src/infrastructure/trainer/TrainerRepository.test.ts`.
- `tasks/STATUS.md`.

## Reglas

- Envelope exacto versionado por D-029.
- Validar esquema e invariantes antes de guardar y al leer.
- Un fallo de storage no borra ni sobrescribe el payload anterior.
- Tests normales usan `MemoryTrainerRepository` o un storage falso; no datos
  reales ni Supabase.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/trainer/TrainerRepository.test.ts
```

## Commit local de cierre

- Mensaje: `CM-304: persist trainer exercises locally`.
- Stage permitido: `src/infrastructure/trainer/TrainerRepository.ts src/infrastructure/trainer/MemoryTrainerRepository.ts src/infrastructure/trainer/LocalStorageTrainerRepository.ts src/infrastructure/trainer/TrainerRepository.test.ts tasks/STATUS.md`.

---

# CM-305 — Variante corta opcional del motor

Estado inicial: `pending`

## Objetivo

Generar una variante corta desde la respuesta del ejercicio usando
`EngineSession`, sin bloquear ni cambiar el árbol canónico.

## Archivos permitidos

- `src/features/trainer/engineVariant.ts`.
- `src/features/trainer/engineVariant.test.ts`.
- `tasks/STATUS.md`.

## Reglas

- Consumir solo `EngineAdapter`/`EngineSession` y un FEN de ejercicio.
- Cancelar solicitudes obsoletas y limitar la variante a 4 plies.
- Motor ausente devuelve diagnóstico tipado; no convierte el ejercicio en error.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/features/trainer/engineVariant.test.ts
```

## Commit local de cierre

- Mensaje: `CM-305: add optional trainer engine variant`.
- Stage permitido: `src/features/trainer/engineVariant.ts src/features/trainer/engineVariant.test.ts tasks/STATUS.md`.

---

# CM-306 — UI del entrenador y gate de Fase 3

Estado inicial: `pending`

## Objetivo

Exponer crear/abrir ejercicio, intento, pistas, resultado y próxima repetición
sin romper tablero, PGN, guardado ni uso sin motor.

## Archivos permitidos

- `src/features/trainer/TrainerPanel.tsx`.
- `src/features/trainer/TrainerPanel.test.tsx`.
- `src/features/analysis-board/AnalysisBoard.tsx` y tests de integración.
- `src/app/globals.css`.
- `tests/e2e/trainer.spec.ts`.
- `docs/evidence/phase3-<date>.md`.
- `tasks/STATUS.md`.

## Reglas

- Las respuestas se evalúan por el dominio; la UI no importa `Chess`.
- El tablero de intento es una vista temporal; nunca crea nodos de partida.
- Pistas se solicitan en orden y muestran la penalización acumulada.
- Sin Stockfish se puede responder manualmente y guardar el resultado.

## Gate automatizado

- Mismo fixture/reloj produce mismo score y `nextDueAt`.
- Jugada correcta, equivalente, ilegal y promoción siguen D-025.
- Pistas no revelan la solución antes de `engine`.
- Scheduler cambia fecha según calidad y UTC.
- Repositorio conserva payload ante corrupción/fallo de cuota.
- Motor ausente deja la UI del entrenador utilizable.

## Gate humano

- `NOT RUN` si no hay navegador/dispositivo disponible.
- No usar partidas reales, credenciales ni servicios cloud.

## Commit local de cierre

- Mensaje: `CM-306: close deterministic trainer phase`.
- Stage permitido: `src/features/trainer/TrainerPanel.tsx src/features/trainer/TrainerPanel.test.tsx src/features/analysis-board/AnalysisBoard.tsx src/app/globals.css tests/e2e/trainer.spec.ts docs/evidence/phase3-<date>.md tasks/STATUS.md`.

## Condiciones de parada

- Una pista revela la solución antes de tiempo.
- Scheduler depende de hora local o aleatoriedad.
- El intento modifica `GameDocumentV1`.
- La ausencia de Stockfish bloquea un ejercicio manual.
