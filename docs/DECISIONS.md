# Decisiones congeladas

Estado de todas las decisiones de este archivo: **accepted**. No se modifican dentro de una tarjeta. Un cambio requiere una ADR nueva, pruebas de migración y aprobación explícita.

## D-001 — Runtime soportado

- Usar Node.js `24.15.0` durante Fase 0 y Fase 1.
- `package.json` declarará `>=24.15.0 <25` y `.nvmrc` contendrá `24.15.0`.
- El plan original decía Node 20.x, pero Node 20 terminó soporte el 24 de marzo de 2026. No se degradará un runtime LTS instalado a uno EOL.
- pnpm queda fijado en `10.33.0` mediante `packageManager`.

## D-002 — Estructura inicial

- Una sola aplicación Next.js en la raíz del repositorio.
- No monorepo y no generador interactivo en Fase 0/1.
- Código puro de dominio bajo `src/domain`; se podrá importar desde un worker posterior sin depender de React.
- El worker Node/TypeScript se añadirá en Fase 1.5 bajo `worker/`, dentro del mismo paquete al principio.

## D-003 — Versiones exactas de baseline

No usar rangos (`^`, `~`) ni `latest`.

### Runtime

| Paquete            |  Versión | Motivo                                           |
| ------------------ | -------: | ------------------------------------------------ |
| `next`             | `16.3.0` | App Router actual fijado                         |
| `react`            | `19.2.8` | Compatible con Next y tablero                    |
| `react-dom`        | `19.2.8` | Misma versión que React                          |
| `chess.js`         |  `1.4.0` | Legalidad y reproducción                         |
| `react-chessboard` | `5.12.0` | API `options`, React 19 y touch                  |
| `@echecs/pgn`      |  `5.0.0` | Parser/stringifier MIT con RAV/NAG               |
| `@echecs/san`      |  `3.2.0` | Peer compatible de `@echecs/pgn@5`               |
| `@echecs/position` |  `4.0.0` | Peer explícito requerido por `@echecs/san@3.2.0` |
| `zod`              |  `4.4.3` | Validación de documentos persistidos             |

### Desarrollo

| Paquete                       |   Versión |
| ----------------------------- | --------: |
| `typescript`                  |   `6.0.3` |
| `eslint`                      |  `9.39.5` |
| `eslint-config-next`          |  `16.3.0` |
| `prettier`                    |   `3.9.6` |
| `vitest`                      |  `4.1.10` |
| `jsdom`                       |  `30.0.1` |
| `@playwright/test`            |  `1.62.1` |
| `@testing-library/dom`        |  `10.4.1` |
| `@testing-library/jest-dom`   |   `7.0.1` |
| `@testing-library/react`      |  `16.3.2` |
| `@testing-library/user-event` |  `14.6.4` |
| `@types/node`                 | `24.13.3` |
| `@types/react`                | `19.2.18` |
| `@types/react-dom`            |  `19.2.4` |

TypeScript 7 no se usa todavía: el parser de TypeScript que trae el ecosistema ESLint actual declara soporte `<6.1.0`. La combinación anterior evita ese peer conflict.

La combinación fue validada en un directorio temporal con Node `24.15.0` y pnpm `10.33.0`: instalación frozen con strict peers, ESLint, TypeScript, Vitest/jsdom y `next build` terminaron en 0. `jsdom@30.0.1` requiere como mínimo Node `24.15.0` dentro de la rama 24; `24.14.x` no es equivalente.

## D-004 — Estilos y componentes

- CSS global y CSS Modules; no Tailwind, UI kits ni CSS-in-JS en Fase 1.
- Componentes pequeños con HTML semántico.
- El heading estable de la app es `<h1>Chess Mentor</h1>` desde el baseline; textos de etapa como “baseline” van separados para que los tests sobrevivan a la integración.
- Objetivos táctiles de al menos 44×44 CSS px.
- Ninguna acción esencial depende de hover, clic derecho o teclado.

## D-005 — Estado canónico

- El documento `GameDocumentV1` es JSON serializable, inmutable y la única fuente de verdad.
- Una instancia mutable de `Chess` nunca se guarda en React state ni en almacenamiento.
- El estado de sesión (`past`, `future`, modal de promoción, selección UI) no forma parte del documento persistido.

## D-006 — Responsabilidad de chess.js

`chess.js` se usa para:

- validar FEN y movimientos;
- convertir `{from,to,promotion}` en SAN/UCI;
- reproducir una ruta;
- consultar jaque, mate, ahogado, repetición y regla de cincuenta movimientos.

No se usa para representar variantes, undo/redo de edición, persistencia ni PGN anotado.

## D-007 — Adaptador PGN

- `@echecs/pgn` solo aparece dentro de `src/domain/pgn/adapter.ts`.
- Su API real en `5.0.0` usa export nombrado: `import { parse as parsePgn, stringify } from "@echecs/pgn"`. No usar el default export que aún aparece en algún ejemplo publicado.
- `@echecs/position` y `@echecs/san` se declaran explícitamente para satisfacer peers, pero no se usan para mantener otro tablero. La única autoridad de FEN/legalidad/replay es `chess.js`.
- Los tipos publicados no admiten el valor runtime `meta.Result="*"`. El único workaround permitido es un wrapper localizado en `adapter.ts`, pasando por `unknown` y con tipos `RuntimeMeta`/`RuntimePgn`; no usar `any`, `@ts-ignore` ni contaminar el modelo de dominio con el sentinel de la librería.
- Parseo siempre proporciona `onError`; un input no vacío que produce cero partidas es error visible.
- Cada SAN importado se reproduce con `chess.js` para obtener origen, destino, promoción, SAN normalizado y FEN.
- En posiciones custom, el parser ignora `SetUp/FEN` al asignar slots/color/número. El adaptador recorre cada `Notation` presente en orden textual y obtiene turno/fullmove solo de la instancia `Chess` que parte del FEN; nunca infiere color del slot del AST.
- Las RAV se convierten en hijos hermanos del movimiento principal desde la misma posición padre.
- Exportar significa convertir el árbol canónico a la estructura del adaptador, agrupar pares según turno/fullmove del FEN de inicio de cada línea y llamar al stringifier.
- Las pruebas comparan semántica después de reimportar, no espacios o orden textual de tags.
- Fase 1 normaliza a un único comentario post-movimiento por nodo. Bloques post-movimiento consecutivos y comentarios `;` se fusionan como equivalencia semántica admitida; comentarios raíz/pre-movimiento son error del parser. Directivas de reloj/evaluación/flechas/casillas son `UNSUPPORTED_PGN_FEATURE`, no se descartan.
- `MAX_PGN_INPUT_BYTES = 32 * 1_048_576`, medidos como UTF-8 con `TextEncoder`; dominio y UI importan la misma constante. El importador también acepta ZIP de PGN con un único `.pgn` interno y permite elegir una partida cuando el PGN contiene varias.
- El terminador del AST es autoritativo y se mapea literalmente: dominio `1-0/0-1/1/2-1/2/*` ↔ librería `1/0/0.5/?`. `headers.Result` debe coincidir; ausencia o mismatch es `PGN_PARSE_ERROR`.
- Un import exitoso devuelve `{ document, warnings }`. Se permiten warnings de STR opcionales ausentes y de numeración de un `SetUp/FEN` que `chess.js` revalida; se muestran antes de sustituir la sesión. Duplicados, resultado inconsistente y cualquier otro parser warning son `PGN_PARSE_ERROR`; el AST ya perdió información y no se importa con “last wins”. Nunca se entrega un árbol parcial.

## D-008 — Árbol y línea principal

- La raíz es un nodo de posición incluido en `nodesById`.
- Todo movimiento es un nodo con un único `parentId` y una lista ordenada `childIds`.
- `childIds[0]` es la continuación principal; los demás son variantes, en orden de creación/importación.
- Fase 1 no elimina, reordena ni promueve variantes.
- Si se juega una jugada UCI que ya existe entre los hijos, el contenido queda idéntico y solo se devuelve una copia con el cursor en ese hijo; no se duplica ni cambia revision/updatedAt.
- Si el padre ya tiene hijo principal, una jugada nueva se agrega al final y no altera la línea original.
- `result` es el resultado declarado de la partida/PGN, no el estado terminal del cursor. Fase 1 no lo cambia automáticamente al navegar o alcanzar mate/draw en una variante; partidas nuevas quedan `*` y las importadas conservan su resultado.
- `root.fen` conserva el FEN de inicio normalizado por `chess.js` al crear/importar. Los FEN cacheados de movimientos son la salida exacta de `chess.fen()` tras cada ply; no se canonicalizan luego por regex ni se comparan ignorando campos.

## D-009 — Navegación y undo/redo

- Atrás/adelante/clic en un movimiento solo cambia `cursorNodeId`.
- Adelante sin selección explícita sigue `childIds[0]`.
- Undo/redo opera sobre mutaciones: agregar movimiento, editar comentario/NAG, crear/nueva partida, importar o guardar no se mezclan de forma implícita.
- Guardar no es una mutación del documento ni crea snapshot de undo.
- Importar o crear una partida nueva inicia una sesión y limpia `past/future`.
- Navegar no crea entradas de undo.
- Una nueva mutación después de undo vacía `future`.

## D-010 — Persistencia de Fase 1

- Interfaz `GameRepository` con adaptadores `MemoryGameRepository` y `LocalStorageGameRepository`.
- Clave raíz: `chess-mentor.games.v1`.
- Envelope exacto: `{ schemaVersion: 1, games: Record<string, GameDocumentV1> }`.
- `GameSummary` contiene exactamente `id`, `title`, `result`, `revision`, `updatedAt`; `list()` ordena por `updatedAt` descendente y, en empate, `id` ascendente ordinal.
- Los métodos async rechazan con `GameRepositoryError` y código `STORAGE_UNAVAILABLE`, `STORAGE_CORRUPT`, `STORAGE_QUOTA` o `INVALID_DOCUMENT`; `get()` devuelve `null` si no existe y `remove()` de un ID inexistente es no-op.
- Los datos se validan con Zod y con invariantes completas al leer **y antes de guardar**. `save()` valida también el envelope previo antes de componerlo y hace un único `setItem`; un documento inválido o storage corrupto deja el string byte a byte igual.
- Un payload corrupto genera error recuperable y conserva el string original; nunca se borra silenciosamente.
- El guardado es explícito, sin autosave. La sesión conserva `savedSnapshot: GameDocumentV1 | null`; dirty es `savedSnapshot === null || !samePersistableContent(present, savedSnapshot)`. La comparación es por valores, ignora solo `cursorNodeId`, ordena keys de records y **no** confía únicamente en `revision` (undo + edición alternativa puede reutilizar el mismo número). Nueva/importada queda dirty, abrir/guardar exitoso actualiza el snapshot y un fallo no. Navegación/flip no ensucian.
- Guardar permanece disponible aunque dirty sea false: un guardado explícito puede actualizar el cursor persistido sin generar prompt/revision. Los prompts de reemplazo consideran solo contenido semántico.
- Tras recargar no se abre automáticamente una partida: el usuario la elige en la lista. `localhost`, `127.0.0.1` y la IPv4 LAN son orígenes distintos y no comparten LocalStorage.
- Sin sincronización multi-tab ni cuotas grandes en Fase 1.
- PostgreSQL/Prisma entran en Fase 3.5 detrás de la misma interfaz conceptual.

## D-011 — API de Fase 1

No se crean Route Handlers de partidas en Fase 1. El vertical slice funciona enteramente en navegador. `GET /api/health` entra con el worker/topología de Fase 1.5.

## D-012 — Pruebas

- Vitest para dominio, adaptadores y componentes.
- Testing Library para interacción sin depender de detalles internos.
- Playwright con el canal de Microsoft Edge ya instalado; no descargar Chromium en Fase 1.
- Tests normales usan repositorios y motores fake.
- Integraciones reales se etiquetan `live` y tienen scripts separados.

## D-013 — Promoción

- Un drop que llega a última fila no se ejecuta todavía.
- Se buscan candidatos legales desde la posición actual.
- Se abre un diálogo accesible con `q`, `r`, `b`, `n`.
- Cancelar deja documento y cursor intactos.
- Elegir una pieza ejecuta exactamente una mutación.

## D-014 — Topología final

- Navegadores locales/Android llaman a Next.js por mismo origen.
- Next.js local llama al worker por `http://127.0.0.1:3210` con token.
- Worker, Ollama, PostgreSQL y Obsidian nunca escuchan en LAN.
- Vercel no intenta alcanzar `127.0.0.1` del usuario.
- La app cloud usa Supabase y solo capacidades sincronizadas.
- Tailscale expone Next.js mediante HTTPS privado; no expone servicios internos.

## D-015 — Worker adelantado

El esqueleto del worker se crea en Fase 1.5, antes de biblioteca, Ollama, Drive o voz. Usa Node/TypeScript. Los helpers Python aparecen solo cuando una capacidad nativa los necesita.

## D-016 — Stockfish primario

- Fase 2 usa Stockfish 18 lite, single-threaded, en Web Worker del navegador.
- Evita `SharedArrayBuffer` y cabeceras COOP/COEP en el primer vertical.
- `EngineAdapter` impide acoplar UI al engine elegido.
- Cada análisis tiene `requestId`; cambiar posición o configuración cancela y descarta resultados anteriores.
- Un adaptador UCI nativo del worker es una mejora posterior, no requisito para abrir Fase 2.
- Antes de distribuir públicamente los binarios GPL se revisan obligaciones de licencia y se incluye licencia/fuente correspondiente.

## D-017 — Entrenador antes de IA

Fase 3 genera pistas y explicaciones deterministas desde conceptos registrados y datos de Stockfish. Ollama en Fase 5 podrá enriquecerlas, pero su ausencia no rompe ejercicios.

## D-018 — Biblioteca MVP

- PDF con capa de texto, EPUB, TXT, Markdown y PGN.
- PDF escaneado, OCR, diagramas y reconstrucción incierta de FEN son una subfase separada.
- EPUB usa localizador por capítulo/CFI u offset; nunca inventa un número de página.
- Original inmutable, SHA-256 del binario y derivados separados.

## D-019 — Procedencia

Toda afirmación futura usa uno de: `direct_quote`, `paraphrase`, `inference`, `engine`, `ai_synthesis`, `user_hypothesis`, `unsupported`.

Una afirmación bibliográfica conserva `citationId`, obra/edición, localizador, fragmento permitido, hash del original y, si aplica, FEN/movimiento. `unsupported` produce una negativa explícita, no una respuesta imaginada.

## D-020 — Orden de integraciones

Obsidian/Drive → Tailscale/HTTPS → voz. El micrófono Android no se prueba sobre HTTP LAN.

## D-021 — Autoridad y sincronización futura

- Originales: Drive o carpeta elegida son autoridad; el índice local es derivado.
- Notas Obsidian: el vault es autoridad; la app escribe solo en una carpeta de exportación.
- Registros de app: local es autoridad mientras offline; Supabase es réplica sincronizada/cloud.
- Cada registro sincronizable tendrá UUID estable, `version`, UTC timestamps, `deviceId` y `deletedAt`.
- Un conflicto de base revision no se resuelve silenciosamente: se conserva como conflicto para revisión.

## D-022 — LAN sin autenticación en Fase 1

Solo fixtures ficticios. Se documenta y muestra una advertencia. Antes de usar libros/notas reales por LAN se implementa autenticación local en Fase 1.5.

## D-023 — Gates humanos

Android, Firewall, Tailscale, HTTPS, micrófono, Obsidian real y cuentas cloud son gates humanos. El agente prepara comandos/checklists, pero conserva `NOT RUN` hasta recibir evidencia.

## D-024 — Política de cambio

Actualizar una versión o decisión requiere:

1. explicar el bloqueo concreto;
2. crear ADR con opciones y compatibilidad;
3. actualizar lockfile y documentación;
4. ejecutar la matriz global;
5. obtener aprobación si cambia alcance, licencia, seguridad o datos.

## D-025 — Aceptación de jugadas del entrenador

- Un ejercicio persiste `acceptedMoves` como un conjunto de UCI normalizado en
  minúsculas, incluida la promoción. Una jugada exacta es un conjunto de un
  solo elemento.
- Un ejercicio generado desde Stockfish puede incluir las líneas MultiPV cuyo
  score esté a como máximo 50 centipawns de la mejor línea, siempre desde la
  misma perspectiva blanca. La política se materializa al crear el ejercicio;
  intentar no recalcula la respuesta ni modifica el ejercicio.
- La legalidad se valida reproduciendo el FEN del ejercicio con `chess.js`.
  SAN, texto libre y similitud de piezas no cuentan como equivalencia.

## D-026 — Pistas y penalización

- Las pistas son tres niveles ordenados: `concept`, `destination` y `engine`.
- `concept` describe la idea sin indicar una casilla; `destination` indica la
  casilla destino sin indicar la jugada completa; `engine` muestra la primera
  jugada aceptada. Pedir una pista no revela inmediatamente la solución.
- Cada nivel añade una penalización fija de 1 punto al intento. El intento
  conserva los niveles solicitados en orden y no puede pedir un nivel posterior
  sin haber pedido los anteriores.

## D-027 — Scheduler determinista SM-2

- La repetición usa SM-2 sin dependencia externa, con calidad entera de 0 a 5,
  factor de facilidad inicial 2.5 y mínimo 1.3.
- Calidad menor que 3 reinicia repeticiones e intervalo; la primera respuesta
  correcta fija 1 día y la segunda 6 días. Las posteriores redondean el
  intervalo calculado al día entero más cercano.
- `nextDueAt` se serializa en ISO-8601 UTC. Toda función recibe un reloj
  inyectable; nunca lee directamente la hora del sistema durante los tests.

## D-028 — Dificultad y límite temporal

- Cada ejercicio declara `difficulty` entero de 1 a 5.
- `timeLimitMs` es `60000` por defecto; `null` significa sin límite.
- El tiempo transcurrido se registra, pero no cambia la legalidad. Un timeout
  produce calidad 2 y no puede marcar el intento como correcto.

## D-029 — Persistencia local de ejercicios

- Los ejercicios y sus intentos usan un repositorio separado de partidas, con
  clave `chess-mentor.trainer.v1` y envelope versionado propio.
- Fase 3 mantiene adaptadores `MemoryTrainerRepository` y
  `LocalStorageTrainerRepository`; no crea tablas, API ni sincronización.
