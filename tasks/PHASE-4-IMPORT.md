# CM-407 - Adaptador de importacion fisica de biblioteca

Estado inicial: `in_progress`

## Objetivo

Crear el adaptador server/worker-side que recibe una ruta, lee el archivo a
traves de una dependencia inyectada, detecta TXT, Markdown, PGN, EPUB o PDF,
ejecuta el extractor correspondiente y registra el derivado en el catalogo.

## Resultado observable

Una fuente ficticia leida por un `LibrarySourceReader` produce una entrada de
catalogo con `importKey`, hash, chunks y localizadores. Reimportar la misma
fuente devuelve `unchanged`; una extension desconocida, una fuente inaccesible
o una dependencia PGN ausente fallan de forma tipada. El adaptador no lee
Drive, `window` ni el sistema de archivos directamente.

## Prerrequisitos

- `CM-406` en `complete`.
- Solo fuentes ficticias creadas en tests; no usar libros, notas ni binarios reales.

## Decisiones congeladas

- D-018: se usan solo formatos textuales; OCR y PDF escaneado quedan fuera.
- D-019: el resultado conserva hash y localizadores del extractor.
- D-021: el lector externo es autoridad de la fuente; el catalogo solo recibe derivados.
- D-022: no se importan datos reales por LAN.

## Contrato congelado

- `importLibrarySource(sourcePath, dependencies)` valida una ruta no vacia y
  llama exactamente una vez al lector externo.
- El lector devuelve `{ fileName, bytes }`; los bytes no se mutan ni se guardan
  en el catalogo. El formato se detecta por extension sin distinguir mayusculas.
- Extensiones: `.txt`, `.md`, `.markdown`, `.pgn`, `.epub`, `.pdf`.
- TXT/Markdown/EPUB/PGN textual validado quedan `confidence: high` y
  `reviewStatus: not_required`. PDF textual queda `confidence: medium`,
  `reviewStatus: pending` y razon de revision explicita.
- PGN requiere `pgnDependencies` con `idFactory` y `clock`; los chunks son un
  resumen bibliografico por partida con locator `pgn-game`.
- EPUB aplana chunks de capitulos y PDF aplana chunks de paginas; no inventa
  paginas para EPUB ni altera localizadores.
- El catalogo decide `created`/`unchanged`/conflicto. El adaptador propaga
  conflictos y envuelve lectura/extraccion con errores tipados sin ocultarlos.

## Archivos permitidos

- `src/infrastructure/library/import/LibraryImportAdapter.ts`.
- `src/infrastructure/library/import/LibraryImportAdapter.test.ts`.
- `fixtures/phase4/import/golden.sources.json`.
- `fixtures/phase4/import/golden.expected.json`.
- `tasks/PHASE-4-IMPORT.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Extractores, catalogo, indice, `src/domain/**`, componentes React, Route
  Handlers, Prisma y Supabase.
- Libros/notas reales, originales binarios, `.env`, secretos y datos de Drive.
- Lectura directa de `fs`, `window`, Drive o red dentro del adaptador.

## Fuera de alcance

- Batch queue, jobs reanudables, watcher de carpetas y sincronizacion Drive.
- OCR, embeddings, persistencia SQL y UI de importacion/revision.

## Pasos exactos

1. Definir lector, formatos, errores y conversion de cada extractor a catalogo.
2. Implementar deteccion, lectura unica, propagacion de estados y metadatos de
   revision sin conservar bytes originales.
3. Cubrir los cinco formatos, mayusculas, idempotencia, fuente inaccesible,
   extension desconocida, PGN sin dependencias y no mutacion.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/import/LibraryImportAdapter.test.ts
```

Resultado esperado:

- Los cinco formatos generan entradas validas y solo el PDF queda pendiente de revision.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-407: add library import adapter`.
- Stage permitido: `src/infrastructure/library/import/LibraryImportAdapter.ts src/infrastructure/library/import/LibraryImportAdapter.test.ts fixtures/phase4/import/golden.sources.json fixtures/phase4/import/golden.expected.json tasks/PHASE-4-IMPORT.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se requiere acceso real a Drive, filesystem, red o una nueva dependencia.
- El adaptador guarda bytes originales, pierde localizadores o suprime errores.
- Se intenta convertir OCR/PDF escaneado o resolver conflictos en lugar del catalogo.

## Rollback

Revertir unicamente el commit de CM-407; no borrar extractores, catalogo ni indice.

## Handoff

Usar `docs/HANDOFF.md`.
