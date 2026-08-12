# Arquitectura

## 1. Contexto y topología

```text
Desktop / Android
       |
       | mismo origen HTTP (Fase 1) o HTTPS privado (Fase 7B)
       v
Next.js local :3000 --------------> almacenamiento navegador (Fase 1)
       |
       | servidor a servidor + token
       v
Worker local 127.0.0.1:3210 ------> Stockfish UCI opcional
       |                           Ollama 127.0.0.1:11434
       |                           archivos/Obsidian/Drive/voz
       v
PostgreSQL aislado 127.0.0.1:5433
       |
       | sincronización saliente
       v
Supabase <------ Vercel <------ navegador remoto con PC apagada
       |
       +------ metadatos/resultados; originales siguen en Drive
```

Reglas:

- Android nunca recibe la URL del worker, Ollama o PostgreSQL.
- Vercel nunca llama al loopback del PC.
- Con el PC apagado solo están disponibles funciones sincronizadas y ligeras.
- Stockfish WASM de Fase 2 corre en el navegador y no bloquea el hilo de UI.

## 2. Matriz de capacidades prevista

| Capacidad                         |         Local PC |                           Android por LAN/Tailscale |          Cloud con PC apagada |
| --------------------------------- | ---------------: | --------------------------------------------------: | ----------------------------: |
| Tablero/reglas/PGN                |               Sí |                                                  Sí |           Sí, tras despliegue |
| Partidas locales no sincronizadas |               Sí | Sí, propias de ese navegador; no compartidas con PC |                            No |
| Stockfish WASM                    |               Sí |                        Sí, limitado por dispositivo |              Sí, en navegador |
| Stockfish UCI profundo            |               Sí |                                      Vía Next local |                            No |
| Ollama                            |               Sí |                                      Vía Next local |                            No |
| Biblioteca sincronizada           |               Sí |                                                  Sí |                            Sí |
| Procesar nuevos libros            |           Worker |                                          Vía worker |                            No |
| Obsidian/Drive sync               |           Worker |                                    Estado solamente |                            No |
| Voz local                         | Worker/navegador |                                     HTTPS requerido | Solo proveedor cloud opcional |

## 3. Estructura objetivo de Fase 1

```text
src/
  app/
    layout.tsx
    page.tsx
    globals.css
  domain/
    game-tree/
      model.ts
      invariants.ts
      replay.ts
      commands.ts
      history.ts
      selectors.ts
    pgn/
      adapter.ts
      semantic.ts
  features/
    analysis-board/
      AnalysisBoard.tsx
      ChessBoardPanel.tsx
      MoveTree.tsx
      AnnotationEditor.tsx
      GameToolbar.tsx
      GameImportExport.tsx
      SavedGames.tsx
      PromotionDialog.tsx
      useGameSession.ts
  infrastructure/
    games/
      GameRepository.ts
      MemoryGameRepository.ts
      LocalStorageGameRepository.ts
      schema.ts
  test/
    factories.ts
    load-fixture.ts
    setup.ts
tests/
  e2e/
fixtures/
  phase1/
```

No se introduce un barrel global que oculte dependencias circulares. El dominio no importa desde `features`, `infrastructure`, React o Next.

## 4. Contrato del documento de partida

Usar exactamente estas propiedades y nombres públicos; helpers internos pueden añadir tipos equivalentes sin cambiar el schema persistido:

```ts
type NodeId = string;
type Color = "w" | "b";
type Promotion = "q" | "r" | "b" | "n";
type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

type MoveInput = {
  from: string;
  to: string;
  promotion?: Promotion;
};

type RootNode = {
  kind: "root";
  id: NodeId;
  parentId: null;
  childIds: NodeId[];
  fen: string;
};

type MoveNode = {
  kind: "move";
  id: NodeId;
  parentId: NodeId;
  childIds: NodeId[];
  move: MoveInput;
  uci: string;
  san: string;
  fen: string;
  comment: string | null;
  nags: number[];
};

type GameDocumentV1 = {
  schemaVersion: 1;
  id: string;
  title: string;
  headers: Record<string, string>;
  rootNodeId: NodeId;
  nodesById: Record<NodeId, RootNode | MoveNode>;
  cursorNodeId: NodeId;
  result: GameResult;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
```

Los tipos reales deben restringir squares a `Square` de `chess.js` cuando sea práctico, pero el schema persistido debe rechazar strings inválidos.

### Invariantes obligatorias

1. `rootNodeId` existe y apunta a un único `RootNode`.
2. El root tiene `parentId: null`; todos los demás tienen un padre existente.
3. No hay ciclos, nodos huérfanos ni IDs duplicados lógicos. Para cada `[key, node]`, `key === node.id`; dos keys distintas no pueden contener el mismo `node.id`. Claves JSON literalmente duplicadas no son detectables después de `JSON.parse` y no se prometen.
4. Cada hijo menciona al padre correcto y aparece una sola vez en `childIds`.
5. `cursorNodeId` existe.
6. Todo `MoveNode` es legal al reproducir el camino desde el root.
7. `uci`, `san` y `fen` coinciden con el resultado normalizado de `chess.js`.
8. NAG es un entero entre 1 y 255, sin duplicados.
9. IDs/título no son strings vacíos; comments se almacenan trimmeados (`""` → `null`); headers tienen keys no vacías y valores string; `revision` es entero no negativo.
10. `revision` aumenta exactamente una vez por mutación de contenido. Mover solo el cursor puede persistirse, pero no cambia la revisión semántica ni `updatedAt`.
11. Timestamps son ISO-8601 UTC válidos.
12. `headers.Result === result` y `Result` existe como propia key; el tipo simple permanece serializable y el validador estrecha ese header.
13. El ID del documento es distinto de todo ID de nodo.
14. `root.fen` es la salida normalizada por `chess.js` al validar el inicio; cada move `fen` coincide byte a byte con `chess.fen()` de su replay.

API de validación única:

- `validateGameStructure()` (CM-101) acumula fallos puramente estructurales, sin `chess.js`;
- `validateGameDocument()` (CM-102) ejecuta estructura y luego replay/legalidad/FEN cacheado sobre **todos** los nodos alcanzables de todas las ramas, no solo el camino al cursor;
- `assertGameDocument()` envuelve `validateGameDocument()` y se usa en fronteras de importación/persistencia; no se llama en cada render.

La factory estructural de CM-101 se llama `createGameDocumentDraft` y acepta un FEN opaco para no introducir `chess.js` prematuramente. CM-102 expone la factory pública validada `createGameDocument`. Defaults exactos: título `Partida sin título`, `headers: { Result: "*" }`, `result: "*"`, `revision: 0`, root y cursor iguales, un único root, y `createdAt === updatedAt` obtenido con una sola llamada al reloj. `idFactory` se llama una vez para el game y una para el root; una colisión devuelve `ID_COLLISION` sin documento parcial. Una jugada nueva pide exactamente un ID después de validar legalidad; si ya existe, falla sin reintentar, tocar Clock ni sobrescribir.

## 5. Reproducción y estados de juego

Para llegar al cursor:

1. Recorrer `parentId` hasta la raíz.
2. Invertir el camino.
3. Crear `new Chess(root.fen)`.
4. Aplicar cada `move` en orden.
5. Comparar opcionalmente el FEN calculado con el cacheado del nodo.

No crear `new Chess(currentNode.fen)` para evaluar repetición: un FEN aislado no contiene el historial de posiciones.

`getPromotionOptions(document, nodeId, from, to)` es una API pura de replay que devuelve un subconjunto ordenado de `['q','r','b','n']`; devuelve `[]` si esa ruta from/to no es una promoción legal y un error tipado si documento/nodo están corruptos o ausentes. `playMove` exige `promotion` cuando from/to requiere promoción; ausente o fuera de las opciones devuelve `ILLEGAL_MOVE`, nunca default queen. La UI consume la API y nunca instancia/importa `Chess`.

El estado terminal se normaliza con precedencia: `checkmate`; `stalemate`; `threefold`; `fiftyMove` si el halfmove clock del FEN es ≥100; `insufficientMaterial`; de lo contrario `ongoing`. `turn`, `inCheck` y `gameOver` se exponen por separado. Esto evita que un booleano genérico de draw o varias condiciones simultáneas cambien el resultado según orden accidental.

Ese estado describe la posición/ruta consultada. No muta `GameDocumentV1.result`: el resultado global es metadata declarada, porque una RAV puede terminar sin terminar la línea principal y existen resignaciones/acuerdos no inferibles. Nueva partida usa `*`; import conserva el outcome del PGN.

## 6. Semántica de comandos

Contrato compartido para input esperado:

```ts
type ErrorContext = Readonly<Record<string, string | number | boolean | null>>;

type DomainError = {
  code:
    | "INVALID_FEN"
    | "ILLEGAL_MOVE"
    | "NODE_NOT_FOUND"
    | "CORRUPT_TREE"
    | "ID_COLLISION"
    | "INVALID_NAG"
    | "PGN_PARSE_ERROR"
    | "UNSUPPORTED_PGN_FEATURE"
    | "INVALID_DOCUMENT";
  message: string;
  context?: ErrorContext;
};

type Result<T, E = DomainError> =
  { ok: true; value: T } | { ok: false; error: E };
```

Factories públicas, replay, comandos e import PGN usan `Result`; no lanzan por input esperado. `assertGameDocument()` puede lanzar únicamente para una frontera que pidió assert. Repositorios usan el rechazo de Promise tipado definido en persistencia.

Los comandos puros devuelven un documento nuevo o un error tipado; no mutan el argumento. Para una mutación real llaman al reloj exactamente una vez, fijan `updatedAt` a ese valor e incrementan `revision` en 1. Un no-op semántico conserva `revision/updatedAt`; `setComment` trimmea y convierte vacío en `null`, `setNags` deduplica preservando orden y un valor final idéntico es no-op.

| Comando                                | Mutación |                 Cursor | Undo |
| -------------------------------------- | -------: | ---------------------: | ---: |
| `navigateTo(nodeId)`                   |       No |                 Cambia |   No |
| `navigateBack()`                       |       No |                  Padre |   No |
| `navigateForward(childId?)`            |       No | Hijo elegido/principal |   No |
| `playMove(input)` sobre hijo existente |       No |         Hijo existente |   No |
| `playMove(input)` nuevo                |       Sí |             Nodo nuevo |   Sí |
| `setComment(nodeId, ...)`              |       Sí |             No forzado |   Sí |
| `setNags(nodeId, ...)`                 |       Sí |             No forzado |   Sí |

Los errores de storage extienden el catálogo en su frontera con `STORAGE_UNAVAILABLE`, `STORAGE_CORRUPT` y `STORAGE_QUOTA`.

## 7. Undo/redo

El estado de sesión envuelve el documento:

```ts
type GameSession = {
  present: GameDocumentV1;
  past: GameDocumentV1[];
  future: GameDocumentV1[];
  savedSnapshot: GameDocumentV1 | null;
};
```

Para Fase 1 se permite snapshot completo porque los fixtures/partidas son pequeños. Se limita a 100 snapshots. Persistir solo `present`; `savedSnapshot` es el baseline efímero del repositorio, no parte del documento ni de los snapshots undo. `samePersistableContent(a,b)` hace comparación profunda por valor de todo el documento salvo `cursorNodeId`, ordenando keys de `headers` y `nodesById`; no usa solo `revision`, porque una edición alternativa después de undo puede reutilizar un número. Una optimización con patches queda fuera de alcance.

## 8. Importación PGN

Contrato público:

```ts
export const MAX_PGN_INPUT_BYTES = 1_048_576;

type PgnWarning = {
  code: "CUSTOM_START_MOVE_NUMBER_REVALIDATED";
  message: string;
  line: number;
  column: number;
  offset: number;
};

type ImportPgnSuccess = {
  document: GameDocumentV1;
  warnings: PgnWarning[];
};

type ImportPgnResult = Result<ImportPgnSuccess>;
```

El tamaño se mide como UTF-8 mediante `new TextEncoder().encode(input).byteLength`; probar exactamente el límite y límite + 1. La UI importa esta constante, no duplica el número.

Algoritmo obligatorio:

1. Rechazar input vacío o mayor a `MAX_PGN_INPUT_BYTES`.
2. Parsear una sola partida con callbacks `onError` y `onWarning`. Ambos reciben `{line,column,message,offset}` (line/column 1-based, offset 0-based); `onError` **no lanza** y el parser puede devolver `[]`. Recolectar primero todos los errors y, si hay alguno, devolver `PGN_PARSE_ERROR` antes de interpretar games. Si no hay errors pero games es 0 o >1, mostrar error de cantidad; >1 usa “Fase 1 admite una partida por importación”.
3. Política cerrada de warnings: cualquier parser warning es `PGN_PARSE_ERROR`, salvo warnings cuyo mensaje coincide exactamente con `Move number mismatch: expected <entero>, got <entero>` **y** solo cuando existe `SetUp="1"` + FEN que después se revalida completamente con `chess.js`. Los allowlisted se mapean con ubicación a `CUSTOM_START_MOVE_NUMBER_REVALIDATED`, se conservan en orden y requieren confirmación UI. No allowlistar por substring genérico ni idioma aproximado. Duplicados son fatales porque el AST aplica last-wins y pierde valores. Escapes PGN válidos de quote/backslash sí se soportan mediante parser/stringifier, sin lexer propio.
4. Elegir root FEN con esta tabla cerrada:

   | `SetUp`             | `FEN`             | Resultado         |
   | ------------------- | ----------------- | ----------------- |
   | ausente             | ausente           | posición estándar |
   | `"1"`               | presente y válido | posición custom   |
   | cualquier otro caso | cualquiera        | `PGN_PARSE_ERROR` |

   Esto rechaza FEN sin `SetUp="1"`, `SetUp="1"` sin FEN, `SetUp="0"` y cualquier otro valor.

5. Crear root.
6. Shape fijado de librería: `NotationPair = [number, Notation | undefined, Notation?]`; `Notation.variants?: Variation`, donde `Variation = NotationList[]`. `annotations?: string[]` y `comment?: string`; campos ausentes no son arrays/null vacíos. Iterar **solo índices 1 y 2** de cada par, saltando `undefined`; no usar `pair.filter(Boolean)` porque incluiría el número. JSON convierte engañosamente un slot `undefined` a `null`.
7. Recorrer cada línea en orden textual ignorando color/número de los pares. El parser conserva ese orden incluso cuando coloca la primera negra en el slot izquierdo. Derivar color/fullmove exclusivamente del `Chess` inicializado con el FEN de esa línea.
8. Traversal preorder determinista para `walk(line,parentId,path)`:
   - resolver/crear el movimiento actual bajo `parentId` y guardar copias de padre/path **anteriores** al movimiento;
   - recorrer inmediatamente cada `notation.variants ?? []` en orden mediante `walk(variant,parentBeforeCurrent,pathBeforeCurrent)`; cada variante sustituye el movimiento actual, por lo que su primera jugada es hermana, no hija;
   - solo después avanzar parent/path al nodo actual y continuar la línea.
     Reconstruir `Chess` desde root + path por rama evita estado compartido. Así la principal se crea antes que variantes, y cada array `variants` conserva orden/IDs inyectados.
9. Normalizar NAG numéricos/simbólicos, comentario post-movimiento y resultado. `$0`, `$256` o cualquier NAG fuera de 1–255 es `PGN_PARSE_ERROR` contextual; duplicados se eliminan preservando el primer orden.
10. Rechazar `arrows`, `squares`, `clock`, `eval` u otra directiva del AST no representada como `UNSUPPORTED_PGN_FEATURE`; no descartarla silenciosamente. El fixture dedicado parsea sin warning y deja en `e4` `arrows=[{color:"G",from:"e2",to:"e4"}]` y `clock=300`, por lo que la detección se hace sobre esos campos, no con regex del PGN raw.
11. Mapear resultado y comprobar `meta.Result` como `unknown` contra el enum de dominio. `Result` es obligatorio; el terminador del AST manda y debe coincidir con el header. Ausente o mismatch es fatal aunque el parser solo haya avisado. El documento queda con `headers.Result === result`.
12. Construir el documento importado como una carga inicial, no como una serie de ediciones: `revision: 0`, una sola lectura del reloj para ambos timestamps y cursor en root. El título es `Event` trimmeado si es no vacío y distinto de `?`; si no, `Partida importada`. IDs vienen de dependencias inyectadas.
13. Validar invariantes completas antes de devolver `{ document, warnings }`.

Un SAN sintácticamente parseable pero ilegal en la posición produce error con número de movimiento/ruta, no un árbol parcial silencioso.

Mapeo literal de resultado; no usar truthiness porque `0` es un resultado válido:

| Dominio/header | `PGN.result` |
| -------------- | ------------ |
| `"1-0"`        | `1`          |
| `"0-1"`        | `0`          |
| `"1/2-1/2"`    | `0.5`        |
| `"*"`          | `"?"`        |

`@echecs/pgn@5` tipa incorrectamente `Meta.Result`: runtime entrega/acepta `"*"`, aunque el `.d.ts` lo excluye. Encapsular el workaround solo en `adapter.ts`, sin `any` ni `@ts-ignore`:

```ts
type RuntimeMeta = Omit<Meta, "Result"> & { Result?: GameResult };
type RuntimePgn = Omit<PGN, "meta"> & { meta: RuntimeMeta };
const stringifyRuntime = stringify as unknown as (game: RuntimePgn) => string;
```

La firma fijada y validada es `stringify(PGN | PGN[]): string`; el wrapper anterior recibe un `RuntimePgn` y llama `stringifyRuntime(game)`. No ampliar el cast ni “adaptarlo” sin una ADR, y conservar el test `[Result "*"]`.

### Conversión `Notation` → SAN

`@echecs/pgn@5` devuelve campos SAN estructurados y no conserva una propiedad de texto SAN crudo. El adaptador implementa un formatter puro y exhaustivamente probado, equivalente a este contrato:

1. Enroque: `O-O` u `O-O-O`.
2. Peón sin captura: `to`; con captura: `from + "x" + to` (`from` es el archivo).
3. Pieza: inicial `K/Q/R/B/N` + desambiguación `from` opcional + `x` si captura + `to`.
4. Promoción: `=Q/R/B/N`.
5. Sufijo: `#` si mate; en otro caso `+` si jaque.

La salida se entrega a `chess.js`, que resuelve origen/destino y legalidad. No se usa regex para adivinar el origen.

### Normalización deliberada de comentarios

Fase 1 conserva un comentario post-movimiento por nodo. El parser elegido fusiona bloques consecutivos y comentarios `;` en un solo string y normaliza whitespace; el documento usa `comment: string | null` con esa misma normalización. Esta fusión es equivalencia semántica admitida y no puede detectarse desde el AST. Comentarios raíz o entre número y SAN hacen fallar el parser y son `PGN_PARSE_ERROR`; no se promete un warning imposible.

## 9. Exportación PGN

- El primer hijo se emite como línea principal.
- Los hijos desde índice 1 se emiten como RAV en ese orden.
- Se preservan tags conocidos y desconocidos desde `headers`; el stringifier de la versión fijada realiza escaping de valores. No ordenar, concatenar ni escapar tags con código propio.
- Para root distinto del inicial se fuerzan `SetUp "1"` y `FEN` correctos.
- `headers.Result` y el terminador se emiten siempre iguales mediante el mapeo literal anterior.
- Los `NotationPair` se agrupan desde el turno/fullmove de la posición **padre del movimiento sustituido** al inicio de cada RAV: si empiezan negras, el primer par es `[fullmove, undefined, blackNotation]`; el número aumenta después de cada jugada negra. Aplicar lo mismo recursivamente.
- Se emiten el comentario normalizado y los NAG sin convertir una paráfrasis en cita ni mezclar datos futuros del motor.
- La validación final reimporta la salida en tests.

## 10. Persistencia

Interfaz mínima:

```ts
interface GameRepository {
  list(): Promise<GameSummary[]>;
  get(id: string): Promise<GameDocumentV1 | null>;
  save(game: GameDocumentV1): Promise<void>;
  remove(id: string): Promise<void>;
}

type GameSummary = Pick<
  GameDocumentV1,
  "id" | "title" | "result" | "revision" | "updatedAt"
>;

type StoredGamesV1 = {
  schemaVersion: 1;
  games: Record<string, GameDocumentV1>;
};

type GameRepositoryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_CORRUPT"
  | "STORAGE_QUOTA"
  | "INVALID_DOCUMENT";

class GameRepositoryError extends Error {
  readonly name = "GameRepositoryError";
  constructor(
    readonly code: GameRepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
```

Clave única: `chess-mentor.games.v1`. Ausencia de esa key equivale a envelope vacío: `list() → []`, `get() → null`, `remove() → no-op`, y el primer `save()` crea schemaVersion 1. Para cada `[key, game]` del envelope, `key === game.id`. `list()` ordena por `updatedAt` descendente y luego `id` ascendente ordinal. Todos los demás fallos rechazan la Promise con `GameRepositoryError` y código tipado.

`LocalStorageGameRepository` recibe `storageProvider: () => KeyValueStorage`; no lee `window` al importar el módulo. El composition root cliente pasa el provider después de mount. La UI no llama `localStorage` directamente. El adaptador:

- comprueba disponibilidad (SSR/private mode);
- valida schema e invariantes completas al leer y antes de guardar;
- diferencia “sin dato” de “dato corrupto”;
- transforma `QuotaExceededError` en `STORAGE_QUOTA`;
- transforma accesos no disponibles en `STORAGE_UNAVAILABLE`;
- no elimina ni sobrescribe el payload corrupto;
- en `save()`, lee/valida el envelope existente, compone el nuevo string en memoria y hace exactamente un `setItem`; un fallo deja storage byte a byte igual.

No hay autosave ni restauración automática. Dirty usa `savedSnapshot`/`samePersistableContent` como se definió en la sesión. Nueva/importada queda dirty; abrir/guardar con éxito fija un snapshot inmutable del documento presente; un fallo conserva el baseline anterior. Eliminar la partida guardada activa limpia el snapshot. Tras reload el usuario abre explícitamente desde la lista. LocalStorage pertenece al origen y perfil: PC por `127.0.0.1`, PC por `localhost` y Android por IPv4 no comparten partidas.

El botón Guardar está disponible siempre que no haya una operación pendiente. Si solo cambió el cursor, el guardado explícito persiste ese cursor y actualiza `savedSnapshot`, pero no incrementa revision/updatedAt ni activa confirmación dirty.

## 11. Fronteras futuras

- `EngineAdapter`: start/cancel/dispose y eventos tipados.
- `AIProvider`: disponibilidad, generación y embeddings; proveedor no decide procedencia.
- `DocumentExtractor`: original → texto/localizadores/diagnósticos.
- `SyncAdapter`: cambios versionados e idempotentes.
- `VoiceProvider`: STT/TTS con artefactos separados.

Ninguna de estas fronteras se implementa durante Fase 1 salvo el punto de extensión documentado.
