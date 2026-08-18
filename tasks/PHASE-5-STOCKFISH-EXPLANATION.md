# CM-416 - Explicacion pedagogica de Stockfish etiquetada

Estado inicial: `in_progress`

## Objetivo

Convertir una linea tipada de Stockfish en una explicacion pedagogica
determinista, separada de las afirmaciones bibliograficas y marcada como
`engine`.

## Resultado observable

Una linea de engine valida produce claims sobre evaluacion, propuesta y
profundidad, todos con tipo `engine` y sin citas bibliograficas. Una linea sin
PV utilizable devuelve una respuesta explicita `unsupported` en vez de
inventar una explicacion.

## Prerrequisitos

- `CM-415` en `complete`.
- Se usan solo `EngineLine` y fixtures/fakes existentes; no requiere Stockfish
  real ni Ollama.

## Decisiones congeladas

- D-016: Stockfish es la fuente de evaluacion del motor y corre como capacidad
  separada.
- D-017: las explicaciones deterministas preceden a la IA generativa.
- D-019: una evaluacion de motor se etiqueta `engine` y no se atribuye a un
  autor ni a una cita bibliografica.
- D-022: las pruebas usan datos ficticios.

## Contrato congelado

- `createStockfishExplanation` recibe `responseId`, bando al turno y un
  `EngineLine`; no realiza IO ni instancia un engine.
- El score se interpreta desde perspectiva blanca y se expresa de forma
  legible para blancas/negras. La PV se presenta como secuencia UCI
  formateada, sin llamarla SAN.
- Los claims de score, propuesta y profundidad usan exactamente `type:
"engine"` y `citationIds: []`.
- `bestmove: "0000"` o una PV vacia produce un claim `unsupported` con
  negativa explicita y sin citas.
- La entrada no se muta y el resultado es serializable y determinista.

## Archivos permitidos

- `src/infrastructure/ai/StockfishExplanation.ts`.
- `src/infrastructure/ai/StockfishExplanation.test.ts`.
- `tasks/PHASE-5-STOCKFISH-EXPLANATION.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Stockfish real, red, Ollama, credenciales, libros reales y bases de datos.
- `src/engine/**`, componentes React, Route Handlers, `package.json` y
  lockfile.

## Fuera de alcance

- Cambiar el score del engine, legalidad de la PV, SAN, UI o analisis live.
- Atribucion de autores, claims bibliograficos y generacion LLM.

## Pasos exactos

1. Definir formato de score, PV y errores de entrada.
2. Construir respuesta estructurada con claims `engine` o `unsupported`.
3. Probar cp/mate, perspectiva negra, PV, determinismo y ausencia de linea.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/StockfishExplanation.test.ts
```

Resultado esperado:

- Ninguna explicacion de Stockfish se presenta como cita o postura
  bibliografica.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni motor real.

## Commit local de cierre

- Mensaje: `CM-416: label Stockfish pedagogical explanations`.
- Stage permitido: `src/infrastructure/ai/StockfishExplanation.ts src/infrastructure/ai/StockfishExplanation.test.ts tasks/PHASE-5-STOCKFISH-EXPLANATION.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se requiere cambiar el contrato del engine, ejecutar un motor real o
  atribuir la evaluacion a una fuente bibliografica.

## Rollback

Revertir unicamente el commit de CM-416 y sus dos archivos de explicacion; no
modificar el adaptador de Stockfish ni los claims bibliograficos.

## Handoff

Usar `docs/HANDOFF.md`.
