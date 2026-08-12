# Tarjetas Fase 1 — núcleo de ajedrez

Reglas comunes:

- Una tarjeta por turno.
- Cada archivo de test vive junto al módulo (`*.test.ts[x]`) salvo E2E.
- Se pueden añadir helpers bajo `src/test/` solo cuando la tarjeta lo indica.
- Tras la prueba focal ejecutar `pnpm.cmd run verify`.
- No modificar dependencias; todas están fijadas desde CM-001.

---

# CM-101 — Modelo e invariantes del árbol

## Objetivo

Definir el documento canónico serializable y detectar cualquier corrupción estructural antes de agregar reglas.

## Resultado observable

Se puede crear un draft `GameDocumentV1` determinista; el validador acepta el documento sano y devuelve errores localizados para ciclo, huérfano, padre inconsistente, cursor inexistente, NAG inválido, key/id incoherente e ID duplicado lógico.

## Prerrequisitos

- `CM-004` complete.

## Decisiones

D-005, D-008 y contratos de `docs/ARCHITECTURE.md`.

## Archivos permitidos

- `src/domain/game-tree/model.ts`
- `src/domain/game-tree/invariants.ts`
- `src/domain/game-tree/model.test.ts`
- `src/domain/game-tree/invariants.test.ts`
- `src/test/factories.ts`
- `tasks/STATUS.md`

## Fuera de alcance

- `chess.js`, PGN, React, almacenamiento, undo/redo.

## Pasos exactos

1. Definir tipos discriminados root/move, result, errors y dependencias `IdFactory`/`Clock`.
   Firmas exactas: `type IdFactory = () => string` y `type Clock = () => string`, donde Clock devuelve ISO-8601 UTC; valores vacíos son inválidos.
2. Implementar `createGameDocumentDraft({rootFen,idFactory,clock,title?})` sin llamadas directas a tiempo/random global. Esta factory estructural no valida FEN; CM-102 añadirá la factory pública validada.
3. Aplicar defaults exactos de arquitectura: título, header/result, revision, root/cursor y timestamps. El reloj se llama una vez; `idFactory`, exactamente dos veces (game y root).
4. Implementar `validateGameStructure` que acumula errores tipados. No exponer un assert incompleto en fronteras; CM-102 añadirá `validateGameDocument`/`assertGameDocument` completos.
5. Validar alcance/rango de NAG y unicidad; exigir `key === node.id`, unicidad de valores `node.id`, `headers.Result === result` y game ID distinto de IDs de nodos.
6. No validar todavía legalidad o FEN cacheado; se añadirá en CM-102.
7. Tests construyen documentos explícitos y no dependen del orden de objetos JSON. Game/root con el mismo ID devuelve `ID_COLLISION`, no documento parcial.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/game-tree/model.test.ts src/domain/game-tree/invariants.test.ts
```

Esperado: casos sanos/corruptos PASS, sin React/jsdom necesario.

## Condiciones de parada

- El tipo necesita guardar una instancia `Chess`.
- Se propone una estructura distinta a D-008.
- Una colisión se resuelve con loop/reintento silencioso o sobrescribe un record.

## Rollback

Revertir solo archivos de esta tarjeta; fixtures/documentos no cambian.

---

# CM-102 — Replay y reglas con chess.js

## Objetivo

Reproducir cualquier ruta desde el root y normalizar movimientos legales sin usar el FEN final como historial.

## Resultado observable

El servicio lleva root→cursor, devuelve posición/estado legal, y rechaza FEN/movimientos/rutas corruptas sin mutar documentos.

## Prerrequisitos

- `CM-101` complete.

## Decisiones

D-006 y D-013.

## Archivos permitidos

- `src/domain/game-tree/replay.ts`
- `src/domain/game-tree/replay.test.ts`
- Extensión focal de `model.ts/.test.ts` para la factory pública validada.
- Extensión focal de `invariants.ts/.test.ts` para legalidad/FEN cacheado.
- `src/test/factories.ts`
- `src/test/load-fixture.ts`
- `tasks/STATUS.md`

## Pasos exactos

1. Implementar `createGameDocument` pública: validar FEN mediante API pública instalada de `chess.js`, obtener `new Chess(input).fen()` como root normalizado y solo entonces delegar al draft.
2. Implementar path root→node con protección de ciclo.
3. Reproducir objetos `{from,to,promotion}` y capturar errores de librería en errores propios.
4. Normalizar salida a `move`, UCI (promoción incluida), SAN y FEN.
5. Exponer estado con precedencia cerrada: `checkmate`; `stalemate`; `threefold`; `fiftyMove` cuando halfmove clock ≥100; `insufficientMaterial`; en otro caso `ongoing`. Además devolver `turn`, `inCheck` y `gameOver`. No depender de que una única API de librería distinga la causa del draw.
6. La repetición usa la instancia que reprodujo toda la ruta.
7. Exponer `getPromotionOptions(document,nodeId,from,to)` que devuelve opciones legales ordenadas `q,r,b,n` sin filtrar una instancia `Chess` fuera del módulo.
8. Implementar `validateGameDocument`/`assertGameDocument` como API única completa: estructura más SAN/UCI/FEN cacheado de **todas** las ramas alcanzables, no solo cursor.
9. Probar todas las entradas de `fixtures/phase1/positions.json`, ciclo `Nf3 Nf6 Ng1 Ng8` dos veces, cuatro promociones y una variante corrupta fuera del camino al cursor.
10. Mantener typecheck Node-safe: no acceder a `window`, `localStorage`, React o APIs DOM salvo tipos globales inevitables del proyecto.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/game-tree/replay.test.ts src/domain/game-tree/invariants.test.ts
```

## Condiciones de parada

- Se requiere `new Chess(node.fen)` para repetición.
- Un movimiento ilegal deja un `Chess` o documento parcialmente mutado observable.
- `invalidMissingKing` no produce `INVALID_FEN` con `chess.js@1.4.0` (el fixture ya fue validado contra esa versión); no cambiarlo para ocultar el fallo.
- UI futura necesitaría importar/instanciar `Chess` para descubrir promoción.

## Rollback

Revertir replay y la extensión focal de invariantes.

---

# CM-103 — Comandos y navegación no destructiva

## Objetivo

Implementar jugar/navegar con árbol inmutable y línea principal estable.

## Resultado observable

Una jugada nueva crea un nodo; una jugada desde el pasado crea un hermano secundario; una jugada ya existente solo navega. Back/forward/clic nunca cambian `revision`.

## Prerrequisitos

- `CM-102` complete.

## Decisiones

D-005, D-008 y D-009.

## Archivos permitidos

- `src/domain/game-tree/commands.ts`
- `src/domain/game-tree/selectors.ts`
- `src/domain/game-tree/commands.test.ts`
- `src/domain/game-tree/selectors.test.ts`
- `src/test/factories.ts`.
- `tasks/STATUS.md`

## Pasos exactos

1. Definir resultados discriminados `{ok:true,value}` / `{ok:false,error}`; no usar exceptions para input esperado.
2. `playMove` reconstruye cursor, valida y busca UCI equivalente entre hijos.
3. Si existe, retorna contenido idéntico en una copia con cursor cambiado, como navegación, sin revision/updatedAt nuevos.
4. Si no existe, crea nodo con ID/reloj inyectados, incrementa revision exactamente una vez y lo agrega al final.
5. Si era primer hijo se vuelve principal; si ya había hijo 0, no reordenar.
6. `navigateBack`, `navigateForward(childId?)`, `navigateTo` no incrementan revision/updatedAt.
7. Selectors: current node/FEN, path, children, canBack/canForward y flatten para render sin perder jerarquía.
8. Test clave: `e4 e5 Nf3`; volver a `e4`; jugar `c5`; verificar `e5` índice 0 y `c5` índice 1.
9. Validar legalidad/existencia primero; una jugada realmente nueva llama IdFactory una vez. Si el ID ya existe, devolver `ID_COLLISION` sin mutar, Clock ni pedir otro ID. Jugada existente/no-op no llama IdFactory/Clock.
10. Toda mutación real incrementa revision una vez y llama Clock una vez; navegación/no-op conserva revision y updatedAt.
11. `playMove` no infiere/cambia el resultado global desde el estado terminal de una rama.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/game-tree/commands.test.ts src/domain/game-tree/selectors.test.ts
```

## Condiciones de parada

- Un comando usa mutación in-place de arrays/records.
- Se elimina/reordena un hijo existente.
- Navegar cambia revision/timestamp.

## Rollback

Revertir comandos/selectors; no tocar modelo para acomodar UI futura.

---

# CM-104 — Undo/redo de ediciones

## Objetivo

Diferenciar historial de edición de navegación mediante una sesión con snapshots acotados.

## Resultado observable

Agregar movimiento/comentario futuro podrá deshacerse/rehacerse; navegar no agrega snapshot; editar después de undo vacía redo.

## Prerrequisitos

- `CM-103` complete.

## Decisiones

D-009.

## Archivos permitidos

- `src/domain/game-tree/history.ts`
- `src/domain/game-tree/history.test.ts`
- `tasks/STATUS.md`

## Pasos exactos

1. Definir `GameSession` con `past/present/future`, `savedSnapshot` y máximo 100 snapshots. El snapshot guardado empieza `null` y queda fuera de snapshots undo.
2. Separar `applyMutation` de `applyNavigation`.
3. Mutation solo crea snapshot cuando el documento realmente cambia.
4. Navigation cambia present cursor sin tocar past/future.
5. Undo/redo conserva IDs/timestamps del snapshot exacto.
6. Nueva mutación tras undo vacía future.
7. `startSession` para new/import limpia ambos stacks.
8. Implementar `samePersistableContent` profundo por valor, ignorando solo cursor y ordenando keys de records. No decidir dirty solo por revision; probar save rev 1 → undo rev 0 → edición alternativa rev 1 sigue dirty.
9. Persistencia futura solo recibe `present`.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/game-tree/history.test.ts
```

## Condiciones de parada

- Undo llama `chess.undo()` como fuente canónica.
- Navegación aparece en past.
- Redo crea IDs nuevos.

## Rollback

Revertir módulo/tests; comandos previos deben seguir verdes.

---

# CM-105 — Adaptador PGN con round-trip semántico

## Objetivo

Importar/exportar una partida anotada completa sin confiar en `chess.js` para RAV.

## Resultado observable

Los fixtures anotado/custom/blacks-to-move hacen round-trip semántico; los fixtures ilegal/no soportado devuelven error contextual y ningún árbol parcial.

## Prerrequisitos

- `CM-104` complete.

## Decisiones

D-007, D-008 y algoritmo de `docs/ARCHITECTURE.md`.

## Archivos permitidos

- `src/domain/pgn/adapter.ts`
- `src/domain/pgn/semantic.ts`
- `src/domain/pgn/adapter.test.ts`
- `src/domain/pgn/semantic.test.ts`
- `src/test/load-fixture.ts`
- `src/test/factories.ts`
- `tasks/STATUS.md`

Fixtures bajo `fixtures/phase1/` son entradas read-only de esta tarjeta; no modificarlos para acomodar el adaptador.

## Pasos exactos

1. Encapsular todos los imports de `@echecs/pgn` en `adapter.ts`. Usar exports nombrados reales de v5: `parse as parsePgn` y `stringify`; no default import.
2. Exportar `MAX_PGN_INPUT_BYTES = 1_048_576`, medir UTF-8 con `TextEncoder` y rechazar vacío/exceso antes del parser. Recolectar callbacks planos `{line,column,message,offset}`: `onError` no lanza, así que cualquier error gana precedencia sobre games `[]`; cero/múltiples sin parse errors es error de cantidad.
3. Todo warning es fatal salvo mensaje exacto `Move number mismatch: expected <int>, got <int>` con SetUp/FEN revalidado; mapear esos como `CUSTOM_START_MOVE_NUMBER_REVALIDATED`. Probar Result ausente, mismatch, tags duplicados y escaped quote/backslash.
4. Resolver root estándar o `SetUp/FEN` con la tabla cerrada de arquitectura; probar cada combinación inválida.
5. Usar shape real `notation.variants: NotationList[]`; iterar solo slots 1/2 de `NotationPair`, saltando undefined y nunca `filter(Boolean)`. Aplicar exactamente el preorder de arquitectura: crear movimiento, recorrer inmediatamente variants desde parent/path previos, después avanzar main. Derivar turno/fullmove solo del replay. En negras al turno exigir `b:Kf2,w:Kh2,b:Kf1` y FEN final documentado; preservar warnings falsos como visibles.
6. Reproducir SAN con `chess.js`, no inferir `from` con regex.
7. Normalizar NAG a enteros 1–255 sin duplicados y el comentario post-movimiento a `string | null`. Mapear `!/?/!!/??/!?/?!` a `$1..$6`, aceptar `$1..$255` y rechazar `$0`/`$256` contextualmente.
8. Preservar tags conocidos/desconocidos. Mapear outcome exactamente `1-0↔1`, `0-1↔0`, `1/2-1/2↔0.5`, `*↔?`; validar `meta.Result` desde `unknown` y rechazar ausencia/mismatch con terminador. Siempre dejar `headers.Result === result`.
9. Rechazar directivas `arrows/squares/clock/eval` como `UNSUPPORTED_PGN_FEATURE`. El fixture deja `e4.arrows` y `e4.clock=300` sin warning del parser: inspeccionar campos AST, no regex raw. Retornar `{document,warnings}`; diagnósticos tolerables quedan tipados y no sustituyen errores.
10. Exportar child 0 como main y restantes como RAV en orden. Cada RAV parte de la posición padre del movimiento que sustituye; construir `NotationPair` desde su turno/fullmove. Para negras usar `[fullmove, undefined, blackNotation]` e incrementar número tras negra.
11. Para FEN custom emitir `SetUp/FEN` correctos.
12. Implementar formatter puro `Notation -> SAN` según `docs/ARCHITECTURE.md`; probar enroque, captura de peón, promoción, desambiguación, jaque y mate antes de usarlo en el recorrido.
13. Encapsular el bug de tipos `Meta.Result="*"` con los tipos runtime/cast localizado de arquitectura; testear `[Result "*"]` sin `any`/`@ts-ignore`.
14. Construir import como carga inicial: revision 0, clock una vez, cursor root y título derivado de `Event` o fallback exacto `Partida importada`; IDs/reloj son inyectados.
15. Implementar normalizador semántico que excluye IDs/reloj/revision. Comparar exactamente `A=import(original)` contra `B=import(export(A))` normalizados.
16. Probar los cinco PGN, límites exacto/+1 y paths UCI exactos de la RAV anidada documentados en `docs/TESTING.md`. La fusión de comentarios post-movimiento consecutivos es equivalencia admitida; root/pre-move es parse error, no warning inventado.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/pgn/adapter.test.ts src/domain/pgn/semantic.test.ts
```

## Condiciones de parada

- Se propone serializador PGN por concatenación/regex sin árbol.
- `@echecs/pgn` pierde una semántica del fixture y no se puede adaptar tras dos remediaciones; entregar reproducción antes de cambiar librería.
- Error ilegal no incluye game/move/path.
- Color/número se infiere del slot del AST en vez del FEN/replay.
- Se descarta una directiva o NAG fuera de rango para “seguir importando”.

## Rollback

Revertir `src/domain/pgn`; no modificar fixtures para ocultar un fallo.

---

# CM-106 — Repositorios en memoria y localStorage

## Objetivo

Guardar varias partidas con schema versionado y errores recuperables.

## Resultado observable

Memory y localStorage satisfacen el mismo contract test; reload simulado conserva documento; corrupción/quota no borran datos.

## Prerrequisitos

- `CM-105` complete.

## Decisiones

D-010 y D-011.

## Archivos permitidos

- `src/infrastructure/games/GameRepository.ts`
- `src/infrastructure/games/MemoryGameRepository.ts`
- `src/infrastructure/games/LocalStorageGameRepository.ts`
- `src/infrastructure/games/schema.ts`
- `src/infrastructure/games/GameRepository.test.ts`
- `src/infrastructure/games/MemoryGameRepository.test.ts`
- `src/infrastructure/games/LocalStorageGameRepository.test.ts`
- `src/infrastructure/games/contract.ts`
- `src/test/factories.ts`
- `tasks/STATUS.md`

## Pasos exactos

1. Definir la interfaz async, `GameSummary` exacto y `GameRepositoryError` con códigos de arquitectura. `get` ausente → `null`; remove ausente → no-op; métodos fallidos rechazan la Promise.
2. Crear Zod schema explícito de `GameDocumentV1`; no aceptar unknown passthrough donde afecte invariantes.
3. Memory repository clona valores para evitar mutación externa.
4. LocalStorage usa clave exacta `chess-mentor.games.v1`, envelope `{schemaVersion:1,games:Record<id,doc>}` con `key === game.id` y acceso inyectable, no `window` al importar módulo.
5. Leer → JSON parse → schema → `validateGameDocument` completo; mapear no encontrado/corrupt/quota/unavailable/invalid-document.
6. `save()` valida primero el documento, lee y valida el envelope previo, compone el payload completo y solo entonces hace un `setItem`. Nunca sobrescribe storage corrupto.
7. `list()` devuelve campos exactos y orden `updatedAt desc`, empate `id asc` ordinal.
8. Contract tests cubren list/get/save/remove para ambos, clones y orden estable.
9. Documento inválido, envelope corrupto y quota dejan payload byte a byte igual; versión desconocida no se migra.
10. Key raíz ausente se comporta como repositorio vacío y el primer save crea el envelope v1.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/games
```

## Condiciones de parada

- Un componente/UI se importa aquí.
- Se borra o sobreescribe corrupción automáticamente.
- Se usa localStorage en SSR durante import.
- `save()` valida solo schema/estructura y acepta una rama ilegal o FEN cacheado corrupto.

## Rollback

Revertir carpeta infrastructure/games; no tocar dominio.

---

# CM-107 — Sesión React y shell de análisis

## Objetivo

Conectar dominio/repositorio mediante un hook cliente sin tablero todavía.

## Resultado observable

La página muestra título de partida, FEN/cursor en texto y botones de nueva/guardar con estados loading/error; el estado fluye por `useGameSession`.

## Prerrequisitos

- `CM-106` complete.

## Decisiones

D-002, D-004, D-005 y D-010.

## Archivos permitidos

- `src/features/analysis-board/AnalysisBoard.tsx`
- `src/features/analysis-board/useGameSession.ts`
- `src/features/analysis-board/GameToolbar.tsx`
- `src/features/analysis-board/AnalysisBoard.test.tsx`
- `src/features/analysis-board/useGameSession.test.tsx`
- `src/features/analysis-board/GameToolbar.test.tsx`
- `src/app/page.tsx`
- `src/app/page.test.tsx`
- `src/app/globals.css`
- `tasks/STATUS.md`

## Pasos exactos

1. Marcar la frontera cliente en feature, no convertir layout en client.
2. Hook mantiene `GameSession`, repositorio inyectable y estados async discriminados.
3. Inicializar una partida solo después de montar; no leer localStorage en render servidor. La inicialización es idempotente bajo `React.StrictMode` y no consume dos secuencias de IDs ni duplica operaciones del repositorio.
4. Exponer actions tipadas que llaman dominio; componentes no manipulan tree directamente.
5. Mostrar errores recuperables con rol alert y conservar sesión presente.
6. Mantener baseline `savedSnapshot` y derivar dirty con `samePersistableContent`: nueva sesión queda dirty; guardar exitoso queda clean; error no; navegación no cambia dirty.
7. Conservar el heading estable exacto `Chess Mentor`; actualizar el smoke unitario de página solo para la nueva composición, no su contrato de heading.
8. Tests con MemoryGameRepository y reloj/IDs fijos, incluido wrapper `StrictMode` que observa una sola inicialización.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/features/analysis-board/useGameSession.test.tsx src/features/analysis-board/AnalysisBoard.test.tsx
```

## Condiciones de parada

- Hydration mismatch.
- `Chess` o localStorage en component state directo.
- Estado global nuevo/dependencia no aprobada.

## Rollback

Revertir feature y restaurar página baseline; dominio permanece.

---

# CM-108 — Tablero, drop, promoción y flip

## Objetivo

Añadir el tablero controlado por FEN con interacción legal y promoción accesible.

## Resultado observable

Drop legal actualiza una vez; ilegal rebota; promoción espera selección q/r/b/n; flip solo cambia orientación.

## Prerrequisitos

- `CM-107` complete.

## Decisiones

D-004, D-006 y D-013.

## Archivos permitidos

- `src/features/analysis-board/ChessBoardPanel.tsx`
- `src/features/analysis-board/PromotionDialog.tsx`
- `src/features/analysis-board/ChessBoardPanel.test.tsx`
- `src/features/analysis-board/PromotionDialog.test.tsx`
- `src/features/analysis-board/AnalysisBoard.tsx`
- `src/features/analysis-board/AnalysisBoard.test.tsx`
- `src/features/analysis-board/useGameSession.ts`
- `src/features/analysis-board/useGameSession.test.tsx`
- `src/app/globals.css`
- `tasks/STATUS.md`

## Pasos exactos

1. Leer tipos instalados de react-chessboard v5; usar `<Chessboard options={...}>`.
2. Controlar `position` por FEN del cursor y `boardOrientation` por estado UI.
3. `onPieceDrop({sourceSquare,targetSquare})` rechaza target null/ilegal.
4. Antes de jugar, llamar `getPromotionOptions` de CM-102. Abrir modal sin mutar cuando hay candidatos y devolver señal de drop fallido/controlado; la UI no importa `Chess`.
5. Diálogo con title/labels, focus inicial, Escape/cancel y botones q/r/b/n.
6. Confirmación ejecuta una única action; cancel no toca stacks.
7. Flip no incrementa revision, no cambia dirty y no se persiste como partida.
8. Testear callbacks con mock del componente solo en test de integración; los tests de dominio legal siguen reales.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/features/analysis-board/ChessBoardPanel.test.tsx src/features/analysis-board/PromotionDialog.test.tsx
```

## Condiciones de parada

- Ejemplo/API de react-chessboard no coincide con `.d.ts` fijado.
- Promoción default a reina.
- Drop ilegal modifica documento/cursor/history.

## Rollback

Revertir componentes e integración focal; no cambiar librería/versiones.

---

# CM-109 — Árbol visible, comentarios y NAG

## Objetivo

Renderizar líneas/variantes y editar anotaciones del nodo seleccionado.

## Resultado observable

Usuario navega main/RAV, ve cursor, edita comentarios y NAG 1–255, y puede undo/redo esas ediciones.

## Prerrequisitos

- `CM-108` complete.

## Decisiones

D-008 y D-009.

## Archivos permitidos

- `src/features/analysis-board/MoveTree.tsx`
- `src/features/analysis-board/AnnotationEditor.tsx`
- `src/features/analysis-board/MoveTree.test.tsx`
- `src/features/analysis-board/AnnotationEditor.test.tsx`
- `src/domain/game-tree/commands.ts`
- `src/domain/game-tree/commands.test.ts`
- `src/features/analysis-board/useGameSession.ts`
- `src/features/analysis-board/useGameSession.test.tsx`
- `src/features/analysis-board/GameToolbar.tsx`
- `src/features/analysis-board/GameToolbar.test.tsx`
- `src/features/analysis-board/AnalysisBoard.tsx`
- `src/features/analysis-board/AnalysisBoard.test.tsx`
- `src/app/globals.css`
- `tasks/STATUS.md`

## Pasos exactos

1. Añadir comandos puros `setComment`/`setNags`: comment trim (`""→null`), NAG deduplicado preservando orden, revision/Clock una vez solo si cambia el valor; valor normalizado idéntico es no-op.
2. MoveTree preserva jerarquía, orden e identidad; no aplana perdiendo parentesco.
3. Movimiento seleccionado usa estado accesible (`aria-current` o equivalente).
4. Cada movimiento es botón; variantes tienen estructura/label distinguible.
5. Editor trabaja sobre el movimiento seleccionado; en root queda deshabilitado porque el comentario pre-partida está fuera de Fase 1.
6. NAG acepta enteros 1–255, elimina duplicados y muestra error antes de mutar.
7. Back/forward/undo/redo con disabled correcto.
8. Undo/redo recalcula dirty contra `savedSnapshot` por contenido; una edición alternativa con la misma revision numérica sigue dirty y navegación no lo cambia.
9. Tests verifican que editar un nodo no altera hermano.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/domain/game-tree/commands.test.ts src/features/analysis-board/MoveTree.test.tsx src/features/analysis-board/AnnotationEditor.test.tsx
```

## Condiciones de parada

- Variantes se renderizan como lista plana indistinguible.
- Editar cambia nodo incorrecto.
- Input inválido llega al documento.

## Rollback

Revertir componentes y comandos de anotación; movimientos previos deben permanecer verdes.

---

# CM-110 — Nueva/FEN, PGN y partidas guardadas

## Objetivo

Completar los flujos de entrada/salida y persistencia de Fase 1.

## Resultado observable

Usuario crea estándar/FEN, importa PGN, exporta/descarga PGN y guarda/lista/abre/elimina partidas locales con confirmación.

## Prerrequisitos

- `CM-109` complete.

## Decisiones

D-007, D-010 y D-011.

## Archivos permitidos

- `src/features/analysis-board/GameImportExport.tsx`
- `src/features/analysis-board/SavedGames.tsx`
- `src/features/analysis-board/GameImportExport.test.tsx`
- `src/features/analysis-board/SavedGames.test.tsx`
- `src/features/analysis-board/useGameSession.ts`
- `src/features/analysis-board/useGameSession.test.tsx`
- `src/features/analysis-board/GameToolbar.tsx`
- `src/features/analysis-board/GameToolbar.test.tsx`
- `src/features/analysis-board/AnalysisBoard.tsx`
- `src/features/analysis-board/AnalysisBoard.test.tsx`
- `src/app/globals.css`
- `tasks/STATUS.md`

## Pasos exactos

1. Nueva estándar/FEN usa diálogo/form, valida antes de reemplazar y pide confirmación si `samePersistableContent` marca cambios no guardados. Nueva queda dirty.
2. Import usa `MAX_PGN_INPUT_BYTES` del dominio (UTF-8), una partida y muestra errores con contexto. Éxito sin warnings inicia sesión dirty; con warnings muestra lista/confirmación antes de reemplazar. Cancelar conserva sesión.
3. Export genera PGN desde dominio, crea Blob UTF-8 `application/x-chess-pgn;charset=utf-8`, descarga y revoca object URL en `finally`. Nombre: title trim → normalizar NFKD → reemplazar fuera de `[A-Za-z0-9._-]` por `-` → colapsar/trim `-` → máximo 80 chars; fallback `chess-mentor-game`; añadir `.pgn` exactamente una vez.
4. Guardar usa la revision actual y no modifica documento, árbol, revision ni timestamps. En éxito fija `savedSnapshot`; en fallo deja el baseline anterior. Son las ediciones previas las que incrementan la revision de contenido.
   Guardar sigue disponible con dirty false y puede persistir un cursor navegado sin ensuciar ni crear undo.
5. Lista summary en orden del repositorio; abrir reemplaza sesión con confirmación y queda clean. Eliminar requiere confirmación; si elimina la guardada activa, conserva el documento pero limpia `savedSnapshot` y queda dirty.
6. Errores de storage/PGN dejan sesión actual intacta.
7. Tests usan memory/fake URL APIs; nunca escriben filesystem.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/features/analysis-board/GameImportExport.test.tsx src/features/analysis-board/SavedGames.test.tsx
```

## Condiciones de parada

- Se introduce API/DB.
- Import fallido reemplaza sesión.
- Export pierde RAV/NAG/comments según semantic test.
- Se agrega autosave o restauración automática al recargar.

## Rollback

Revertir UI/hook focal; repositorio y adapter permanecen.

---

# CM-111 — Responsive, touch y accesibilidad

## Objetivo

Hacer usable el vertical slice en escritorio y viewport móvil sin hover esencial.

## Resultado observable

Layouts 390×844 y escritorio no tienen scroll horizontal de página; controles son táctiles, focus visible y diálogos/navegación accesibles.

## Prerrequisitos

- `CM-110` complete.

## Decisiones

D-004, D-022 y D-023.

## Archivos permitidos

- `src/app/globals.css`
- `src/app/page.tsx`, `src/app/page.test.tsx`
- `src/features/analysis-board/AnalysisBoard.tsx`, `AnalysisBoard.test.tsx`
- `src/features/analysis-board/ChessBoardPanel.tsx`, `ChessBoardPanel.test.tsx`
- `src/features/analysis-board/PromotionDialog.tsx`, `PromotionDialog.test.tsx`
- `src/features/analysis-board/MoveTree.tsx`, `MoveTree.test.tsx`
- `src/features/analysis-board/AnnotationEditor.tsx`, `AnnotationEditor.test.tsx`
- `src/features/analysis-board/GameToolbar.tsx`, `GameToolbar.test.tsx`
- `src/features/analysis-board/GameImportExport.tsx`, `GameImportExport.test.tsx`
- `src/features/analysis-board/SavedGames.tsx`, `SavedGames.test.tsx`
- Tests funcionales en esas rutas; no añadir dependencia axe.
- `tasks/STATUS.md`

## Pasos exactos

1. Desktop: board + panel adaptable; mobile: stack claro con board primero.
2. Board ancho máximo del contenedor, sin usar ancho fijo mayor al viewport.
3. Botones/inputs esenciales mínimo 44×44 CSS px o altura equivalente.
4. Focus visible, orden lógico, headings y labels.
5. Ninguna función requiere hover/right-click; tooltips no contienen información exclusiva.
6. Error/success anunciable sin mover foco arbitrariamente.
7. Mostrar siempre en Fase 1, cerca de import/persistencia, el texto exacto y testeable: `Modo LAN sin autenticación: usa solo datos ficticios.` No intentar inferir el bind/hostname desde el navegador.
8. Tests de viewport real quedan para CM-112; aquí tests de DOM/roles.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/features/analysis-board
pnpm.cmd run build
```

## Condiciones de parada

- Se oculta funcionalidad esencial en mobile.
- Solución depende de CSS vendor hacks no explicados.

## Rollback

Revertir cambios CSS/semánticos de esta tarjeta; no alterar dominio.

---

# CM-112 — E2E integral y gate automatizado

## Objetivo

Automatizar los siete flujos E2E definidos en `docs/TESTING.md` y ejecutar el gate completo.

## Resultado observable

`pnpm.cmd run verify:phase1` termina 0 en un worktree controlado.

## Prerrequisitos

- `CM-111` complete.

## Decisiones

D-012 y D-023.

## Archivos permitidos

- `tests/e2e/**`
- `playwright.config.ts`
- `tasks/STATUS.md`

Esta tarjeta es un gate y no edita código de producto. Un bug reabre su tarjeta responsable mediante la transición de `AGENTS.md`.

## Pasos exactos

1. Implementar exactamente los siete flujos listados en testing, incluidos Guardar → recargar → Abrir donde se especifica.
2. Aislar localStorage por test/context; no depender del orden.
3. Copiar fixtures por file chooser o textarea según UI, sin rutas absolutas de usuario.
4. No usar sleeps; esperar roles/text/URL/estado.
5. Viewport 390×844 verifica ancho de `documentElement.scrollWidth <= clientWidth` y controles esenciales visibles.
6. Ejecutar suite focal, luego gate completo una vez.
7. Inspeccionar reports solo al fallar; no commitearlos.
8. Si un E2E demuestra bug de producto, cambiar atómicamente `CM-112 → failed` y la causante → `in_progress`, registrar reproducción y detenerse. No corregirlo aquí.

## Verificación focal/global

```powershell
pnpm.cmd run verify:phase1
git diff --check
git status --short
```

## Condiciones de parada

- Test flaky tras eliminar tiempo/random no controlado.
- Necesidad de saltar un flujo obligatorio.
- Proceso/puerto ajeno impide webServer.

## Rollback

Revertir solo tests/config/helper de esta tarjeta; no borrar reports globales o procesos sin identificar PID/origen.

---

# CM-113 — Gate manual Windows y Android

## Objetivo

Validar el mismo snapshot de implementación en Windows y teléfono Android real por LAN.

## Resultado observable

Dos registros `PASS` completos en el handoff usando las plantillas de `docs/TESTING.md`.

## Prerrequisitos

- `CM-112` complete.
- Android en la misma Wi-Fi y usuario disponible son necesarios para PASS; si faltan, la tarjeta puede ejecutar su preparación automática y cerrar `ready_for_manual`.
- Permiso explícito si hace falta cambiar Firewall; sin permiso se conserva `NOT RUN`.

## Archivos permitidos

- `tasks/STATUS.md`.
- Documento de evidencia bajo `docs/evidence/phase1-<date>.md` sin IP/token/datos sensibles permanentes; capturas opcionales saneadas.
- Correcciones de producto no están permitidas dentro de esta tarjeta: un fallo reabre la tarjeta responsable.

## Pasos exactos

1. Registrar como `IMPLEMENTATION_SHA` el SHA final de CM-112. Solo evidencia/status pueden diferir después; cualquier cambio de producto invalida el gate.
2. Ejecutar `verify:phase1` y checklist Windows sobre ese snapshot de producto.
3. Antes de LAN, comprobar que no existe listener en 3000. Si existe, identificar PID/origen y detenerse; no matar un proceso ajeno ni permitir que Next elija 3001.
4. Iniciar `pnpm.cmd run dev:lan` en una segunda terminal supervisada (o proceso propio con PID/teardown conocidos) y redescubrir IPv4. No usar `Start-Process` sin plan de terminar el árbol.
5. Verificar en PC condición booleana del puerto, PID propio y respuesta HTTP con heading exacto `Chess Mentor`; un `Test-NetConnection` con exit code 0 pero resultado falso no es PASS.
6. Ejecutar checklist Android portrait y landscape con fixtures ficticios y una URL consistente. Recordar que su LocalStorage no se comparte con el PC.
7. Si Firewall bloquea, detenerse y pedir autorización; registrar regla/reversión si el usuario la aplica.
8. Detener servidor con `Ctrl+C`/teardown del PID propio y confirmar que el listener desapareció.
9. En evidencia versionada redactar IPv4 como `http://<IPv4-redactada>:3000`; la URL exacta solo se comunica en el handoff efímero.
10. Marcar `complete` solo con ambos PASS. Si falta usuario/dispositivo: `ready_for_manual`, no `complete`. Si hay bug, `CM-113 → failed` y causante → `in_progress` antes de detenerse.

## Verificación

Automática:

```powershell
pnpm.cmd run verify:phase1
$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) { throw 'Chess Mentor no escucha en 3000' }
if (-not (Test-NetConnection 127.0.0.1 -Port 3000 -InformationLevel Quiet)) { throw 'Puerto 3000 no accesible' }
$response = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000
if ($response.Content -notmatch '<h1[^>]*>Chess Mentor</h1>') { throw 'Respuesta HTTP inesperada' }
```

Manual: plantillas completas de secciones 8 y 9 de `docs/TESTING.md`.

## Condiciones de parada

- Red pública sin autorización.
- Se requieren datos reales.
- Cambio de producto después de `IMPLEMENTATION_SHA`.
- No hay evidencia humana.

## Rollback

Detener proceso propio. Eliminar cualquier regla temporal del Firewall mediante el nombre exacto y acción humana documentada. Un fallo funcional vuelve la tarjeta causante a `in_progress`.
