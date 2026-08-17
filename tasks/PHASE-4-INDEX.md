# CM-405 - Indice y busqueda de biblioteca

Estado inicial: `in_progress`

## Objetivo

Crear el indice derivado en memoria de la biblioteca textual y una busqueda
full-text determinista sobre chunks producidos por TXT, Markdown, PGN, EPUB o
PDF, sin acoplar el indice a un extractor, React, Prisma ni un proveedor
externo.

## Resultado observable

Un conjunto de documentos normalizados produce un indice serializable que
deduplica reimportaciones por `importKey`. Una consulta devuelve resultados
ordenados de forma estable, conserva `sourceSha256`, `chunkId` y el localizador
original, y permite buscar texto con mayusculas o acentos diferentes.

## Prerrequisitos

- `CM-404` en `complete`.
- Solo fixture sintetica de documentos derivados; no usar libros ni notas reales.

## Decisiones congeladas

- D-019: todo resultado conserva hash, chunk y localizador para procedencia.
- D-021: el indice es derivado y nunca sustituye al original autoridad.
- D-022: no se incorporan datos reales durante esta etapa.

## Contrato congelado

- Entrada: documentos con `importKey`, metadata de fuente y chunks con `id`,
  `ordinal`, `text` y `locator` serializable de pares string/number.
- `importKey` y `source.sha256` son obligatorios. Dos entradas con el mismo
  `importKey` y contenido diferente producen `LIBRARY_INDEX_CONFLICT`; una
  reimportacion byte a byte equivalente conserva una sola entrada.
- El indice ordena documentos por `importKey` y conserva el orden textual de
  chunks. No modifica ni elimina el original.
- La tokenizacion usa grupos Unicode de letras/numeros, minusculas y plegado
  de acentos. No se normaliza ni se altera el texto devuelto.
- Una consulta no vacia se divide en terminos unicos. Un chunk coincide si
  contiene al menos un termino; `matchedTerms` conserva los terminos que
  coinciden y `score = matchedTermCount * 1000 + occurrenceCount`.
- Resultados: score descendente, luego `importKey`, ordinal de chunk e `id`.
  El limite por defecto es 20 y el maximo es 100.
- Consulta vacia, limite invalido, documento invalido o locator no serializable
  producen errores tipados; no se ignoran entradas silenciosamente.
- El indice y los resultados son copias serializables; mutar la entrada no
  muta el indice ya construido.

## Archivos permitidos

- `src/infrastructure/library/index/LibraryIndex.ts`.
- `src/infrastructure/library/index/LibraryIndex.test.ts`.
- `fixtures/phase4/index/golden.documents.json`.
- `fixtures/phase4/index/golden.expected.json`.
- `tasks/PHASE-4-INDEX.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Extractores anteriores, `src/domain/**`, componentes React, Route Handlers,
  Prisma y Supabase.
- Libros/notas reales, `.env`, secretos y binarios grandes.
- SQL, embeddings, ranking remoto, OCR y sincronizacion con Drive.

## Fuera de alcance

- Persistencia del indice, incrementalidad, stemming, sinonimos y busqueda por
  metadatos.
- UI de biblioteca, paginacion HTTP, citas generadas por IA y embeddings.

## Pasos exactos

1. Definir tipos, errores, tokenizer, deduplicacion y contrato serializable.
2. Construir el indice inmutable y buscar por terminos con ranking estable.
3. Cubrir acentos, repeticion de terminos, limite, orden, idempotencia,
   conflicto, entradas invalidas, localizadores y no mutacion.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/index/LibraryIndex.test.ts
```

Resultado esperado:

- Todos los casos pasan y los resultados coinciden byte a byte con la fixture.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-405: add library index and search`.
- Stage permitido: `src/infrastructure/library/index/LibraryIndex.ts src/infrastructure/library/index/LibraryIndex.test.ts fixtures/phase4/index/golden.documents.json fixtures/phase4/index/golden.expected.json tasks/PHASE-4-INDEX.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- El contrato necesita tocar extractores, dominio o persistencia.
- Se intenta indexar contenido real o resolver conflictos con last-write-wins.
- Se pierde el localizador o se modifica el texto fuente durante la indexacion.

## Rollback

Revertir unicamente el commit de CM-405; no borrar fixtures ni extractores
anteriores ni datos externos.

## Handoff

Usar `docs/HANDOFF.md`.
