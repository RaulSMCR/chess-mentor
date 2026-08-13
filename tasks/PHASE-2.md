# Fase 2 — Stockfish en navegador

Esta fase empieza después de CM-117. La aplicación seguirá funcionando sin
motor: Stockfish es una capacidad opcional y nunca sustituye las reglas,
PGN, guardado ni navegación de Fase 1.

## Decisiones congeladas

- D-016: `EngineAdapter`, Stockfish 18 lite single-thread y Web Worker.
- No `SharedArrayBuffer`, COOP/COEP ni hilos múltiples en el primer vertical.
- Todo análisis tiene `requestId`; una posición/configuración nueva cancela el
  anterior y sus resultados obsoletos se descartan.
- Los binarios GPL y sus avisos solo se distribuyen después de inventario,
  licencia, fuente y checksum revisados.
- La nube/Vercel no intenta usar el worker local ni un binario nativo.

## Orden

`CM-118 → CM-119 → CM-120 → CM-121 → CM-122 → CM-123 → CM-124`

---

# CM-118 — Contrato EngineAdapter y fake determinista

Estado inicial: `pending`

## Objetivo

Definir la interfaz independiente de React para solicitar análisis y usar un
fake reproducible sin descargar Stockfish.

## Resultado observable

Un test puede analizar un FEN, recibir una o varias líneas ordenadas y cancelar
una solicitud mediante `requestId`, todo sin Web Worker real ni motor externo.

## Prerrequisitos

- CM-117 complete.

## Archivos permitidos

- `src/engine/EngineAdapter.ts`.
- `src/engine/FakeEngineAdapter.ts`.
- `src/engine/EngineAdapter.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `public/**` con binarios.
- `src/features/**`, `worker/**`, Supabase, Ollama o Stockfish real.

## Contrato mínimo

```ts
type EngineScore =
  { kind: "cp"; value: number } | { kind: "mate"; value: number };

type EngineLine = {
  multipv: number;
  depth: number;
  score: EngineScore;
  pv: readonly string[]; // UCI, legal y en orden
  bestmove: string;
};

type AnalysisRequest = {
  requestId: string;
  fen: string;
  depth: number;
  movetimeMs?: number;
  multiPv: number;
};

interface EngineAdapter {
  analyze(request: AnalysisRequest): AsyncIterable<EngineLine>;
  cancel(requestId: string): Promise<void>;
  dispose(): Promise<void>;
}
```

El fake debe producir siempre el mismo resultado para el mismo request,
rechazar profundidad/MultiPV fuera de límites y nunca mutar el árbol de juego.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/engine/EngineAdapter.test.ts
```

## Commit local de cierre

- Mensaje: `CM-118: define engine adapter contract`
- Stage permitido: `src/engine/EngineAdapter.ts src/engine/FakeEngineAdapter.ts src/engine/EngineAdapter.test.ts tasks/STATUS.md`

## Condiciones de parada

- El contrato obliga a importar React/chessboard o fija un motor concreto.
- El fake necesita tiempos aleatorios o red.

---

# CM-119 — Inventario, licencia y checksum de Stockfish

Estado inicial: `pending`

## Objetivo

Registrar el asset exacto de Stockfish 18 lite single-thread antes de
distribuirlo o importarlo en la aplicación.

## Resultado observable

`docs/STOCKFISH.md` identifica fuente oficial, versión, licencia, archivo,
SHA-256, tamaño, fecha de verificación y alcance de distribución; el gate
rechaza un asset ausente, ambiguo o sin licencia compatible.

## Prerrequisitos

- CM-118 complete.
- Usuario debe proporcionar o aprobar la descarga del asset; el agente no
  descarga modelos/binarios pesados automáticamente.

## Archivos permitidos

- `docs/STOCKFISH.md`.
- `tools/verify-stockfish.ps1`.
- `fixtures/phase2/stockfish-manifest.json`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `public/**` y `src/**` con el binario hasta cerrar la revisión de licencia.
- Binarios dentro de OneDrive, `node_modules` o Git.

## Pasos exactos

1. Registrar el enlace oficial aprobado, nombre exacto del archivo y versión.
2. Registrar licencia GPL y URL de texto legal/fuente correspondiente.
3. Calcular SHA-256 y tamaño del archivo local aprobado.
4. Hacer que el script falle ante checksum, tamaño o versión distintos.
5. Mantener el binario fuera de Git hasta una decisión explícita de
   distribución.

## Prueba manual

- `NOT RUN` hasta que el usuario proporcione/apruebe el asset y la licencia.

## Commit local de cierre

- Mensaje: `CM-119: record Stockfish asset provenance`
- Stage permitido: `docs/STOCKFISH.md tools/verify-stockfish.ps1 fixtures/phase2/stockfish-manifest.json tasks/STATUS.md`

## Condiciones de parada

- No existe fuente oficial verificable.
- El checksum no coincide.
- La licencia/distribución no está clara.

---

# CM-120 — Worker UCI del navegador

Estado inicial: `pending`

## Objetivo

Ejecutar el motor empaquetado en un Web Worker del navegador y traducir el
protocolo UCI a mensajes tipados, manteniendo la UI libre.

## Prerrequisitos

- CM-119 complete con asset aprobado.

## Archivos permitidos

- `src/engine/StockfishWorker.ts`.
- `src/engine/StockfishWorker.test.ts`.
- `src/engine/uci.ts`.
- `src/engine/uci.test.ts`.
- `public/stockfish/**` solo para el asset aprobado y su licencia.
- `docs/STOCKFISH.md` y `tasks/STATUS.md`.

## Pasos exactos

1. Crear mensajes `init`, `analyze`, `cancel`, `dispose` y sus respuestas.
2. Enviar `uci`, `isready`, `ucinewgame`, `position fen` y `go` en orden.
3. Parsear únicamente `info` y `bestmove` válidos; ignorar líneas
   desconocidas sin convertirlas en resultados.
4. Mantener single-thread y sin cabeceras COOP/COEP.
5. No importar el worker en Server Components ni enviar el token del worker
   local.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/engine/uci.test.ts src/engine/StockfishWorker.test.ts
```

## Commit local de cierre

- Mensaje: `CM-120: add browser UCI worker`
- Stage permitido: `src/engine/StockfishWorker.ts src/engine/StockfishWorker.test.ts src/engine/uci.ts src/engine/uci.test.ts public/stockfish docs/STOCKFISH.md tasks/STATUS.md`

## Condiciones de parada

- El binario requiere `SharedArrayBuffer` o rompe el build público.
- El worker bloquea el hilo principal o expone servicios locales.

---

# CM-121 — Parser de score, MultiPV y perspectiva

Estado inicial: `pending`

## Objetivo

Normalizar `info`/`bestmove`, centipawns, mate y líneas PV con perspectiva
blanca, sin mezclar tipos ni perder el orden MultiPV.

## Archivos permitidos

- `src/engine/uci.ts` y su test ya autorizados por CM-120.
- `fixtures/phase2/uci-lines.txt`.
- `tasks/STATUS.md`.

## Contratos

- `score cp N` se conserva como `{ kind: "cp", value: N }`.
- `score mate N` se conserva como `{ kind: "mate", value: N }`.
- `N` siempre es perspectiva blanca; no se invierte dos veces para negras.
- `multipv` faltante es 1; líneas duplicadas se reemplazan por la misma clave
  `(requestId,multipv,depth)`.
- `bestmove 0000` es `no_legal_move`, no una jugada UCI válida.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/engine/uci.test.ts
```

Debe cubrir cp/mate, blancas/negras, MultiPV 1/2, PV truncada, `0000`,
comentarios UCI y líneas desconocidas.

## Commit local de cierre

- Mensaje: `CM-121: normalize UCI analysis scores`
- Stage permitido: `src/engine/uci.ts fixtures/phase2/uci-lines.txt tasks/STATUS.md`

---

# CM-122 — Cancelación, dispose y descarte de respuestas obsoletas

Estado inicial: `pending`

## Objetivo

Garantizar que cambiar FEN/configuración cancela el análisis anterior y nunca
renderiza una respuesta vieja.

## Archivos permitidos

- `src/engine/EngineSession.ts`.
- `src/engine/EngineSession.test.ts`.
- `src/engine/StockfishWorker.ts` y tests si la corrección es focal.
- `tasks/STATUS.md`.

## Pasos exactos

1. Generar `requestId` monotónico o UUID inyectable.
2. Cancelar la solicitud anterior antes de iniciar otra.
3. Ignorar todo evento cuyo `requestId` no sea el activo.
4. Resolver `dispose()` incluso si el worker no confirma `stop`.
5. Terminar y recrear el Worker si queda en estado no recuperable.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/engine/EngineSession.test.ts
```

## Commit local de cierre

- Mensaje: `CM-122: cancel stale engine analysis`
- Stage permitido: `src/engine/EngineSession.ts src/engine/EngineSession.test.ts src/engine/StockfishWorker.ts tasks/STATUS.md`

## Condiciones de parada

- Un resultado viejo puede cambiar el estado visible.
- Queda un Worker vivo después de `dispose()`.

---

# CM-123 — UI de análisis y navegación de PV

Estado inicial: `pending`

## Objetivo

Mostrar profundidad, tiempo, MultiPV, score y flechas de análisis sin modificar
el árbol canónico ni bloquear el tablero.

## Archivos permitidos

- `src/features/analysis-board/AnalysisPanel.tsx`.
- `src/features/analysis-board/AnalysisPanel.test.tsx`.
- `src/features/analysis-board/AnalysisBoard.tsx` y tests de integración.
- `src/app/globals.css`.
- `tasks/STATUS.md`.

## Reglas

- El análisis se ejecuta sobre el FEN del cursor, pero no crea nodos.
- Navegar el árbol cancela el análisis visible anterior.
- PV temporal se navega en una vista aparte; no se guarda como variante.
- Stockfish ausente muestra diagnóstico y conserva tablero/PGN/guardado.
- `mate` y `cp` tienen presentación distinta y etiqueta “motor”.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/features/analysis-board/AnalysisPanel.test.tsx
```

## Commit local de cierre

- Mensaje: `CM-123: add analysis panel`
- Stage permitido: `src/features/analysis-board/AnalysisPanel.tsx src/features/analysis-board/AnalysisPanel.test.tsx src/features/analysis-board/AnalysisBoard.tsx src/app/globals.css tasks/STATUS.md`

## Condiciones de parada

- Se modifica el árbol al analizar.
- El motor ausente rompe la partida o PGN.
- Se necesita publicar un secreto o servicio local.

---

# CM-124 — Comparación de jugada y gate Stockfish

Estado inicial: `pending`

## Objetivo

Comparar la jugada humana con la línea del motor y cerrar el gate de Fase 2
con FENs dorados y evidencia de cancelación/degradación.

## Archivos permitidos

- `src/engine/compareMove.ts`.
- `src/engine/compareMove.test.ts`.
- `tests/e2e/stockfish.spec.ts`.
- `docs/evidence/phase2-<date>.md`.
- `tasks/STATUS.md`.

## Política congelada

- La comparación devuelve `bestmove`, `legal`, `sameAsBestmove` y score del
  motor; no asigna “error” pedagógico todavía.
- La jugada se compara en UCI normalizado, incluyendo promoción.
- No se crea ni edita ningún nodo de la partida.

## Gate automatizado

- FENs dorados producen bestmove legal con fake y motor aprobado.
- MultiPV conserva cantidad y orden.
- Mate/cp permanecen separados y con perspectiva blanca.
- Cambiar FEN cancela y descarta resultados viejos.
- Cerrar/reiniciar termina el Worker.
- Motor ausente deja Fase 1 utilizable.

## Gate humano

- `NOT RUN` si requiere navegador/dispositivo no disponible.
- La licencia y el checksum aparecen en evidencia sin secretos.

## Commit local de cierre

- Mensaje: `CM-124: close Stockfish phase gate`
- Stage permitido: `src/engine/compareMove.ts src/engine/compareMove.test.ts tests/e2e/stockfish.spec.ts docs/evidence/phase2-<date>.md tasks/STATUS.md`

## Condiciones de parada

- Bestmove ilegal, score invertido, respuesta vieja visible o Worker no
  terminado.
- Cualquier fallo de licencia o checksum.

---

## Regla de avance

No comenzar Fase 3 ni Supabase hasta que CM-124 esté `complete` y su gate de
licencia/engine tenga evidencia. La ausencia de Stockfish debe seguir siendo
compatible con el uso completo de Fase 1.
