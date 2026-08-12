# Estrategia de pruebas

## 1. Capas

| Capa        | Herramienta                            | Qué prueba                                  | Qué no usa                      |
| ----------- | -------------------------------------- | ------------------------------------------- | ------------------------------- |
| Dominio     | Vitest / jsdom configurado globalmente | Árbol, reproducción, comandos, PGN, schemas | Imports de React, UI o red      |
| Componentes | Vitest + Testing Library + jsdom       | Acciones y accesibilidad                    | Servicios reales                |
| E2E         | Playwright + Edge                      | Flujos del usuario y persistencia           | Android físico, Ollama, cloud   |
| Live        | Scripts separados futuros              | Stockfish/Ollama/Drive/etc. reales          | No forma parte de test unitario |
| Manual      | Checklist y evidencia                  | Windows, Android, touch, HTTPS, voz         | No se automatiza/finge          |

## 2. Reglas de determinismo

- Inyectar `idFactory`; tests usan una secuencia conocida.
- Inyectar `clock`; tests usan timestamps fijos UTC.
- No usar `Math.random`, `Date.now` o `crypto.randomUUID` directamente en dominio.
- Repositorio unitario es memoria; localStorage se prueba con instancia aislada.
- No depender de orden de claves JSON/tags PGN salvo donde el contrato lo exige.
- Toda promesa se espera; no usar delays arbitrarios.
- Los E2E esperan estado visible, no `waitForTimeout`.
- El servidor E2E usa el build de producción en `127.0.0.1:3100` y el Edge instalado mediante `channel: "msedge"`; no descarga navegadores.
- Los E2E corren `workers: 1`/sin paralelismo para reducir puertos, descargas y flakiness en Windows/OneDrive; cada test sigue aislando su BrowserContext/localStorage y no depende del orden.

## 3. Fixtures canónicos

Archivos:

- `fixtures/phase1/annotated-variations.pgn`: línea principal, RAV, RAV anidada, comentarios y NAG.
- `fixtures/phase1/custom-start.pgn`: `SetUp/FEN` y posición no inicial.
- `fixtures/phase1/black-to-move.pgn`: `SetUp/FEN`, negras al turno y fullmove distinto de 1.
- `fixtures/phase1/invalid.pgn`: SAN ilegal con error reproducible.
- `fixtures/phase1/unsupported-directives.pgn`: directivas que Fase 1 debe rechazar sin pérdida.
- `fixtures/phase1/positions.json`: casos FEN.

No modificar un fixture para hacer pasar un test sin actualizar antes este documento y justificar qué requisito cambió.

## 4. Equivalencia semántica PGN

El gate define dos operandos; no compara strings ni un valor consigo mismo:

```text
A = importToGameDocument(PGN original).document
B = importToGameDocument(exportFromGameDocument(A)).document
deepEqual(normalizeForSemanticComparison(A), normalizeForSemanticComparison(B))
```

`normalizeForSemanticComparison` conserva y compara:

- tags y valores (ignorando orden textual), con `Result` ya sincronizado al resultado de dominio;
- resultado;
- root FEN;
- orden de hijos/línea principal;
- para cada nodo: path UCI, SAN normalizado, comentario post-movimiento normalizado, NAG;
- estructura y profundidad de variantes.

Ignora:

- espacios, saltos y wrap de 80 columnas;
- orden de tags cuando no altera significado;
- diferencias equivalentes en notación de NAG simbólico/numérico una vez normalizado.

No comparar IDs, timestamps ni `revision`, porque se regeneran al importar.

## 5. Matriz unitaria obligatoria de Fase 1

### FEN y reproducción

- FEN estándar válido.
- FEN inválido produce `INVALID_FEN`.
- Movimiento legal e ilegal sin mutación parcial.
- Jaque y mate.
- Ahogado.
- Enroque ambos lados desde fixture.
- Promoción a q/r/b/n.
- Captura al paso.
- Regla de cincuenta movimientos.
- Repetición triple reproduciendo el camino completo.
- Si coinciden condiciones de draw, el estado usa precedencia `stalemate → threefold → fiftyMove → insufficientMaterial` (checkmate siempre primero).

### Árbol

- Documento inicial cumple invariantes.
- Un movimiento crea nodo con SAN/UCI/FEN correctos.
- Jugar desde hoja extiende principal.
- Jugar desde pasado agrega variante sin borrar/cambiar hermano principal.
- Misma jugada existente navega, no duplica.
- Atrás en root es no-op tipado.
- Adelante elige hijo principal; elección explícita elige variante.
- Nodo inexistente falla sin cambiar estado.
- Detector encuentra ciclo, huérfano, padre inconsistente y FEN cacheado incorrecto.
- Cada key coincide con `node.id`; dos entries con el mismo `node.id` y una colisión de `idFactory` fallan sin overwrite.
- Una corrupción legal/FEN en una variante falla aunque el cursor esté en una línea principal sana.

### Undo/redo

- Navegar no toca stacks.
- Undo de jugada nueva recupera documento/cursor exactos.
- Redo usa el mismo ID y restituye.
- Editar tras undo vacía future.
- Límite de 100 snapshots descarta el más antiguo.
- Import/new game reinicia la sesión.
- Dirty compara contenido, no solo revision: tras guardar rev 1 → undo → edición alternativa rev 1 permanece dirty; navegación sola permanece clean.

### PGN

- Los tres fixtures válidos importan, incluido negras al turno.
- El fixture negras al turno reproduce exactamente `b:Kf2, w:Kh2, b:Kf1`, final `8/8/8/8/8/8/7K/5k2 w - - 3 4`; los dos warnings de numeración del parser quedan visibles pero no cambian color/fullmove.
- RAV anidada queda en el padre correcto. Paths UCI exactos del fixture anotado:
  - main: `e2e4 e7e5 g1f3 b8c6 f1b5 a7a6`;
  - Siciliana: `e2e4 c7c5 g1f3 d7d6`;
  - nested: `e2e4 c7c5 g1f3 b8c6`;
  - después de `e4`, hijos `[e7e5, c7c5]`; después de `e4/c5/Nf3`, hijos `[d7d6, b8c6]`.
- Shape AST probado: `e5.variants[0]` es Siciliana y `d6.variants[0]` la nested; pares negros tienen slot izquierdo `undefined`. No usar UCI aislada como identidad porque `g1f3`/`b8c6` aparecen en dos paths.
- Tags desconocidos se conservan.
- La tabla estricta `SetUp/FEN` se cumple en todas sus combinaciones; custom white-to-move y black-to-move preservan turno/fullmove.
- Outcome prueba las cuatro correspondencias `1↔1-0`, `0↔0-1`, `0.5↔1/2-1/2`, `?↔*`, incluido `[Result "*"]`; header/terminador ausente o distinto falla.
- NAG y el comentario post-movimiento normalizado se conservan.
- NAG simbólicos 1–6 se mapean; duplicados se normalizan; `$0` y `$256` fallan con contexto.
- Comentarios post-movimiento consecutivos se aceptan como fusión semántica; comentario raíz/pre-movimiento falla.
- `unsupported-directives.pgn` devuelve `UNSUPPORTED_PGN_FEATURE` y ningún árbol parcial al detectar `e4.arrows`/`e4.clock`, aunque el parser no emita warning.
- Input de exactamente `1_048_576` bytes UTF-8 alcanza el parser; `1_048_577` falla antes de parsear.
- El formatter de SAN cubre enroque, captura de peón, promoción, desambiguación de pieza, jaque y mate.
- SAN ilegal incluye ubicación contextual.
- Input vacío, varias partidas y parser sin resultado útil son errores visibles.
- Callback `onError` no-throw se recolecta con line/column/offset y gana precedencia sobre el error genérico de cero games; warnings preservan ubicación/orden.
- Result header ausente, header/terminador mismatch y tags duplicados fallan; solo move-number mismatch exacto de custom FEN revalidado queda warning. Values con `\"`/`\\` hacen round-trip mediante la librería.
- Round-trip semántico de fixtures.

### Persistencia

- Guardar/listar/obtener/eliminar varias partidas.
- Documento no válido no se guarda.
- Payload corrupto no se elimina.
- Documento inválido y save sobre envelope corrupto dejan el string byte a byte igual.
- localStorage ausente produce error recuperable.
- quota error se tipa.
- El schema versionado rechaza versión desconocida; no migra mágicamente.
- El envelope rechaza una key que no coincide con `game.id`.
- Summary tiene campos exactos y orden `updatedAt desc, id asc`; remove ausente es no-op.

## 6. Componentes obligatorios

- Drop legal llama una vez al comando.
- Drop ilegal devuelve `false` y no cambia el FEN mostrado.
- Promoción abre diálogo, tiene foco/labels, permite cuatro opciones y cancelación.
- Flip cambia orientación, no documento.
- Botones back/forward/undo/redo reflejan disponibilidad.
- Árbol permite navegar línea principal y variante con estado seleccionado accesible.
- Comentario y NAG actualizan el nodo elegido, no otro.
- Error de PGN y almacenamiento se muestra sin perder la partida actual.
- Warnings PGN requieren aceptación explícita antes de reemplazar la sesión.
- Inicialización bajo React `StrictMode` crea una sola sesión observable y no duplica IDs/operaciones del repositorio.
- La advertencia de LAN sin autenticación permanece visible en Fase 1.

`react-chessboard@5.12.0` se usa con la API v5:

```tsx
<Chessboard
  options={{
    position: fen,
    boardOrientation: orientation,
    onPieceDrop: ({ sourceSquare, targetSquare }) => true,
  }}
/>
```

No copiar ejemplos de versiones antiguas que pasan props directamente como `position`/`onPieceDrop`.

## 7. E2E obligatorios

1. Cargar app → mover `e2-e4` → Guardar → recargar → Abrir guardada → posición conservada.
2. Jugar `e4 e5 Nf3` → volver a `e4` → jugar `c5` → ambas respuestas aparecen y principal sigue `e5`.
3. Importar `annotated-variations.pgn` → navegar Siciliana y RAV anidada → exportar → reimportar sin error.
4. Nueva partida desde FEN → movimiento legal → export incluye `SetUp/FEN`.
5. Posición de promoción → drop → elegir caballo → pieza/fen correctos.
6. Editar comentario/NAG → undo → redo → Guardar → recargar → Abrir guardada → datos correctos.
7. Viewport móvil (`390x844`) sin scroll horizontal de página, tablero usable y controles visibles.

## 8. Gate manual Windows

Registrar:

```text
Fecha/hora UTC:
Commit:
Windows:
Navegador y versión:
URL:
Flujo ejecutado:
Resultado: PASS | FAIL
Captura/ruta de evidencia:
Observaciones:
```

Flujo: abrir → nueva partida → mover → retroceder → variante → comentario/NAG → exportar → recargar/abrir → verificar.

## 9. Gate manual Android LAN

Prerequisitos: misma Wi-Fi, red Windows Private si corresponde, servidor `dev:lan`, solo fixtures ficticios.

Registrar:

```text
Fecha/hora UTC:
Commit:
Dispositivo:
Versión Android:
Navegador y versión:
Adaptador de red usado:
URL versionada: http://<IPv4-redactada>:3000
Orientación portrait/landscape:
Drag táctil: PASS | FAIL
Promoción: PASS | FAIL
Navegación/variante: PASS | FAIL
Sin scroll horizontal: PASS | FAIL
Controles >=44px: PASS | FAIL
Reconexión/recarga: PASS | FAIL
Evidencia:
Observaciones:
```

La URL/IP exacta puede figurar solo en el handoff efímero al usuario; el archivo versionado conserva el placeholder anterior. Si no hay dispositivo o Firewall requiere intervención, estado `NOT RUN`; no se marca Phase 1 completa.

## 10. Comandos de gate

```powershell
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test:unit
pnpm.cmd run build
pnpm.cmd run test:e2e:only
git diff --check
git status --short
```

Ese bloque ejecuta build una vez. El comando público equivalente es `pnpm.cmd run verify:phase1`; `test:e2e`/`test:e2e:only` asumen que `.next` acaba de construirse.

Un exit code distinto de cero nunca permite `complete`: una tarjeta normal queda `in_progress`/`blocked`; un gate aplica la transición `failed → reabrir causante` de `AGENTS.md`.

Si un sandbox Windows bloquea únicamente el teardown de Playwright en `Terminating the WebServer`, la navegación/locator exitosos no bastan. Verificar que el puerto 3100 quedó libre y solicitar la ejecución aprobada fuera del sandbox; no usar `playwright install`, no matar procesos ajenos y no marcar PASS desde salida parcial.
