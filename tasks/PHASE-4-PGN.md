# CM-402 - Ingestion PGN bibliografico y procedencia

Estado inicial: pending

## Objetivo

Agregar un extractor de PGN para biblioteca que conserve el original por hash,
exponga procedencia por partida y valide cada partida con el adaptador PGN de
dominio ya existente.

## Resultado observable

Un archivo PGN UTF-8 valido produce un documento bibliografico inmutable con
una entrada por partida, todos sus headers, un citationId estable, un
localizador por indice de partida, warnings del adaptador y un
`GameDocumentV1` completamente validado. Una coleccion no descarta partidas
silenciosamente y ningun documento parcial se devuelve ante un error.

## Prerrequisitos

- `CM-401` en `complete`.
- Solo fixtures ficticios versionados; no usar libros ni partidas reales.

## Decisiones congeladas

- D-007: `importPgn` es la autoridad de parseo, legalidad y validacion del
  documento de partida.
- D-018: PGN es un formato de biblioteca del MVP.
- D-019: cada afirmacion bibliografica conserva identificador, obra/edicion,
  localizador, fragmento y hash del original cuando corresponda.
- D-024: no agregar dependencias ni cambiar decisiones congeladas.

## Contrato congelado

- La entrada es `Uint8Array` y se decodifica como UTF-8 fatal. El limite es
  `MAX_PGN_INPUT_BYTES` del adaptador de dominio, medido sobre los bytes
  recibidos. El hash cubre exactamente todos los bytes originales.
- `importKey` es `pgn-bibliographic-v1:<source.sha256>` y no depende de
  `fileName`. El media type es `application/x-chess-pgn`.
- `extractPgnDocument(input, dependencies, options?)` recibe `idFactory` y
  `clock` inyectados para que cada `GameDocumentV1` sea determinista y no lea
  el reloj del sistema.
- `derived.games` conserva el orden de `inspectPgn`. Cada entrada contiene:
  `citationId`, `gameIndex`, `locator: { kind: "pgn-game", gameIndex }`,
  `sourceSha256`, `work`, `edition`, `fragment`, todos los `headers`, el
  `document` importado y sus warnings.
- `work` usa `headers.Source` y, si no existe, `headers.Event`. `edition` usa
  `headers.SourceVersion` cuando existe. `fragment` usa `headers.Round` cuando
  existe. Los valores ausentes son `null`; no se infieren autores, libros ni
  citas textuales.
- `citationId` es `${importKey}:citation:${gameIndex}`. El hash y el
  localizador permiten volver al original; FEN, movimientos y resultado se
  conservan en `GameDocumentV1`.
- La coleccion se enumera con `inspectPgn` y cada partida se importa con
  `importPgn(input, dependencies, gameIndex)`. Los errores de parseo,
  directivas no soportadas, legalidad, invariantes o colisiones se propagan
  como `PgnExtractionError`; no se entrega resultado parcial.
- La salida y sus colecciones son copias serializables. La entrada y los
  documentos intermedios no se mutan.

## Archivos permitidos

- `src/infrastructure/library/pgn/PgnDocumentExtractor.ts`.
- `src/infrastructure/library/pgn/PgnDocumentExtractor.test.ts`.
- `fixtures/phase4/pgn/golden.pgn`.
- `fixtures/phase4/pgn/golden.expected.json`.
- `tasks/PHASE-4-PGN.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`, componentes React, Route Handlers, Prisma y Supabase.
- Libros o partidas reales, `.env`, secretos y binarios grandes.
- Cambios de dependencias, lockfile o decisiones congeladas.

## Fuera de alcance

- Edicion de PGN, exportacion, UI, persistencia y busqueda.
- Citas textuales, autoria inferida, OCR, EPUB, PDF y analisis de motor.
- Localizadores de pagina o offsets inventados: el localizador de PGN es el
  indice de partida ligado al hash del original.

## Pasos exactos

1. Definir tipos, hash, limite, decodificacion fatal y errores tipados.
2. Enumerar partidas con el adaptador existente e importar cada documento con
   dependencias inyectadas.
3. Construir procedencia conservadora desde headers y probar una coleccion de
   dos partidas, warnings, input inmutable, identidad por bytes, limites,
   encoding invalido, PGN invalido y directivas no soportadas.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/pgn/PgnDocumentExtractor.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-402: add bibliographic PGN extractor`.
- Stage permitido: `src/infrastructure/library/pgn/PgnDocumentExtractor.ts src/infrastructure/library/pgn/PgnDocumentExtractor.test.ts fixtures/phase4/pgn/golden.pgn fixtures/phase4/pgn/golden.expected.json tasks/PHASE-4-PGN.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- La procedencia exige interpretar una afirmacion no presente en headers.
- La validacion requiere cambiar el adaptador o el modelo de dominio.
- Se necesita una dependencia, dato real o localizador no verificable.

## Rollback

Revertir unicamente el commit de CM-402; no modificar fixtures ni extractores
anteriores.

## Handoff

Usar `docs/HANDOFF.md`.
