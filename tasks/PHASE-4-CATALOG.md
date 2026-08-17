# CM-406 - Catalogo persistente de importaciones de biblioteca

Estado inicial: `in_progress`

## Objetivo

Persistir el catalogo derivado de biblioteca detras de una interfaz estable,
con adaptadores memoria y `localStorage`, idempotencia por `importKey`, hash de
fuente y estado de confianza/revision. El original binario continua fuera del
catalogo y bajo la autoridad de Drive o la carpeta elegida.

## Resultado observable

Una entrada derivada valida puede registrarse, listarse y recuperarse. Repetir
la misma importacion devuelve `unchanged` sin duplicar ni reescribir; un mismo
`importKey` con contenido diferente produce conflicto. Un payload corrupto o
una cuota agotada se reporta sin borrar el valor anterior.

## Prerrequisitos

- `CM-405` en `complete`.
- Solo fixture sintetica de derivados; no usar libros, notas ni binarios reales.

## Decisiones congeladas

- D-018: original inmutable y derivados separados.
- D-019: cada entrada conserva hash, extractor, chunks y localizadores.
- D-021: Drive/carpeta es autoridad del original; el catalogo local es derivado.
- D-022: no se usan datos reales por LAN ni en fixtures.

## Contrato congelado

- Clave de `localStorage`: `chess-mentor.library.catalog.v1`.
- Envelope exacto: `{ schemaVersion: 1, entries: Record<string, LibraryCatalogEntryV1> }`.
- La entrada contiene `importKey`, `extractorVersion`, `source`, `title`,
  `confidence`, `reviewStatus` y chunks derivados con locator tipado.
- `source.sha256` es SHA-256 hexadecimal de 64 caracteres. No se persiste el
  `Uint8Array` original ni una copia base64 del binario.
- `reviewStatus` es `not_required`, `pending`, `approved` o `rejected`.
  `pending` y `rejected` requieren `reviewReason` no vacio.
- `upsert()` valida entrada y envelope antes de escribir. La misma entrada por
  `importKey` devuelve `unchanged`; una diferencia devuelve
  `LIBRARY_IMPORT_CONFLICT`; nunca se usa last-write-wins.
- `list()` ordena por `importKey` ascendente. `get()` devuelve `null` si no hay
  entrada. Todas las salidas son copias aisladas.
- `localStorage` se recibe como `storageProvider`; el modulo no lee `window`.
  Los errores son `STORAGE_UNAVAILABLE`, `STORAGE_CORRUPT`, `STORAGE_QUOTA` o
  `INVALID_ENTRY`.

## Archivos permitidos

- `src/infrastructure/library/catalog/LibraryCatalogRepository.ts`.
- `src/infrastructure/library/catalog/LibraryCatalogRepository.test.ts`.
- `fixtures/phase4/catalog/golden.entries.json`.
- `fixtures/phase4/catalog/golden.expected.json`.
- `tasks/PHASE-4-CATALOG.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Extractores, indice, `src/domain/**`, componentes React, Route Handlers,
  Prisma y Supabase.
- Libros/notas reales, originales binarios, `.env`, secretos y base64 pesado.
- Drive real, sincronizacion, borrado de originales y UI de revision.

## Fuera de alcance

- Lectura fisica de carpetas/Drive y jobs de importacion.
- Indexacion automatica, OCR, embeddings y cola remota.
- Persistencia SQL, sincronizacion multi-tab y migraciones de datos reales.

## Pasos exactos

1. Definir schemas, tipos, errores, envelope y estados de revision.
2. Implementar repositorio memoria y localStorage con validacion, clones,
   idempotencia, conflictos, corrupcion y cuota.
3. Cubrir fixture dorada, orden, get/list, reimportacion, mutacion aislada,
   revision pendiente/rechazada, payload corrupto y fallos del proveedor.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/catalog/LibraryCatalogRepository.test.ts
```

Resultado esperado:

- Todas las entradas y estados coinciden con la fixture y no se conserva ningun original binario.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-406: add library catalog repository`.
- Stage permitido: `src/infrastructure/library/catalog/LibraryCatalogRepository.ts src/infrastructure/library/catalog/LibraryCatalogRepository.test.ts fixtures/phase4/catalog/golden.entries.json fixtures/phase4/catalog/golden.expected.json tasks/PHASE-4-CATALOG.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- El catalogo requiere guardar originales, modificar el indice o tocar SQL.
- Un payload corrupto se borra o un conflicto se resuelve silenciosamente.
- Se intenta conectar Drive real o introducir datos reales en Git.

## Rollback

Revertir unicamente el commit de CM-406; no borrar extractores, indice ni datos externos.

## Handoff

Usar `docs/HANDOFF.md`.
