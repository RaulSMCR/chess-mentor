# CM-408 - Integracion de catalogo e indice de biblioteca

Estado inicial: `in_progress`

## Objetivo

Conectar el catalogo derivado de biblioteca con el indice textual y la
busqueda, manteniendo el catalogo como fuente de los derivados y sin cachear
una copia obsoleta.

## Resultado observable

Un repositorio de catalogo puede convertirse en un indice buscable y una
consulta devuelve el texto, el hash, el titulo y el localizador de los chunks
registrados. Cada operacion lee el catalogo una sola vez y los errores del
repositorio no se convierten en resultados vacios.

## Prerrequisitos

- `CM-407` en `complete`.
- La cola reanudable y el runner ya estan cubiertos por `CM-353` y `CM-354`;
  no se duplican en Fase 4.

## Decisiones congeladas

- D-018: el indice usa derivados textuales y no originales.
- D-019: los resultados conservan hash y localizadores.
- D-021: el catalogo es derivado de la fuente y el indice es derivado del
  catalogo.

## Contrato congelado

- `buildLibraryIndexFromCatalog(catalog)` llama exactamente una vez a
  `catalog.list()` y construye un indice nuevo.
- `searchLibraryCatalog(catalog, query, options?)` lee el catalogo una vez,
  construye el indice y delega en la busqueda textual existente.
- El puente no modifica entradas, no guarda originales y no mantiene cache.
- Errores del catalogo se propagan; errores de consulta/indice conservan los
  codigos de `LibraryIndex`.

## Archivos permitidos

- `src/infrastructure/library/index/LibraryCatalogIndex.ts`.
- `src/infrastructure/library/index/LibraryCatalogIndex.test.ts`.
- `tasks/PHASE-4-GATE.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Extractores, catalogo, `src/domain/**`, componentes React, Route Handlers,
  Prisma, Supabase, Drive y worker.
- Fixtures nuevas, libros, notas, originales binarios y secretos.

## Fuera de alcance

- Cola batch, jobs reanudables, watcher de carpetas y sincronizacion Drive.
- OCR, embeddings, citas bibliograficas y UI de revision.

## Pasos exactos

1. Adaptar entradas del catalogo al contrato del indice sin copiar campos no
   necesarios ni mutar valores.
2. Exponer construccion y consulta sobre el repositorio con lectura unica.
3. Probar catalogo memoria, busqueda, localizadores, copias aisladas y errores
   propagados.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/index/LibraryCatalogIndex.test.ts
```

Resultado esperado:

- La busqueda devuelve los chunks del catalogo y cada llamada lee una vez.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-408: connect library catalog to search`.
- Stage permitido: `src/infrastructure/library/index/LibraryCatalogIndex.ts src/infrastructure/library/index/LibraryCatalogIndex.test.ts tasks/PHASE-4-GATE.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- El puente necesita modificar el schema del catalogo o del indice.
- Se intenta cachear datos sin versionado o leer una fuente original.

## Rollback

Revertir unicamente el commit de CM-408 y sus dos archivos de indice; no
eliminar catalogo, extractores ni datos externos.

## Handoff

Usar `docs/HANDOFF.md`.
