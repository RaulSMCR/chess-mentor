# CM-400 — Ingestión TXT y procedencia básica

Estado inicial: `pending`

## Objetivo

Crear el primer extractor de biblioteca textual para TXT, conservando la
referencia inmutable al original y produciendo texto/chunks/localizadores
deterministas sin depender de React, Prisma ni proveedores externos.

## Resultado observable

Un archivo UTF-8 válido produce un documento derivado con SHA-256 del original,
SHA-256 del texto decodificado, chunks por línea con offsets de bytes UTF-8 y
una clave de importación estable. Reimportar los mismos bytes devuelve la misma
clave; bytes distintos no colisionan.

## Prerrequisitos

- `CM-355` en `complete`.
- Solo fixture ficticia versionada; no usar libros ni notas reales.

## Decisiones congeladas

- D-018: originales inmutables y derivados separados; TXT es el primer formato.
- D-019: los localizadores son obligatorios para procedencia futura.
- D-021: la fuente/original es autoridad; el índice derivado no la sobrescribe.

## Contrato congelado

- Entrada: `Readonly<Uint8Array>` codificada en UTF-8; límite
  `MAX_TXT_INPUT_BYTES = 16 * 1024 * 1024`.
- UTF-8 inválido produce `TXT_INVALID_ENCODING`; superar el límite produce
  `TXT_INPUT_TOO_LARGE`; no se reemplazan bytes silenciosamente.
- El hash del original usa todos los bytes recibidos, incluido BOM si existe.
  El decoder elimina el BOM de la vista textual, pero no del hash.
- Los offsets son rangos `[startByte, endByte)` sobre la representación UTF-8
  del texto decodificado. Se preservan saltos de línea y no se normaliza NFC.
- Cada línea no vacía es un chunk; el orden es textual y el id es
  `${importKey}:chunk:${ordinal}`. Una entrada vacía sigue siendo válida y
  produce cero chunks.
- `importKey = "txt:v1:${sourceSha256}"`; el mismo hash y versión son
  idempotentes. La persistencia/deduplicación física queda para otra tarjeta.
- `source.fileName` es solo metadata display; nunca participa en el hash ni en
  la identidad.

## Archivos permitidos

- `src/infrastructure/library/txt/TxtDocumentExtractor.ts`.
- `src/infrastructure/library/txt/TxtDocumentExtractor.test.ts`.
- `fixtures/phase4/txt/golden.txt`.
- `fixtures/phase4/txt/golden.expected.json`.
- `tasks/PHASE-4.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`, componentes React, Route Handlers, Prisma y Supabase.
- Libros/notas reales, `.env`, binarios grandes y originales fuera de la
  fixture dorada.

## Fuera de alcance

- Markdown, PGN, EPUB, PDF, OCR y detección semántica de capítulos.
- Persistencia SQL, búsqueda full-text, embeddings y UI de biblioteca.
- Corrección automática de texto, normalización Unicode o inferencia de citas.

## Pasos exactos

1. Definir tipos serializables, errores tipados, límite y hash del original.
2. Decodificar UTF-8 de forma fatal, producir chunks por línea y offsets de
   bytes, y devolver copias inmutables.
3. Cubrir fixture dorada, Unicode, CRLF, BOM, entrada vacía, límite exacto,
   exceso, bytes inválidos e idempotencia.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/txt/TxtDocumentExtractor.test.ts
```

Resultado esperado:

- Todos los casos pasan sin mutar los bytes de entrada.
- Los hashes y localizadores coinciden byte a byte con la fixture esperada.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-400: add TXT document extractor`.
- Stage permitido: `src/infrastructure/library/txt/TxtDocumentExtractor.ts src/infrastructure/library/txt/TxtDocumentExtractor.test.ts fixtures/phase4/txt/golden.txt fixtures/phase4/txt/golden.expected.json tasks/PHASE-4.md tasks/STATUS.md`.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El extractor necesita modificar contratos de dominio existentes.
- UTF-8 inválido se reemplaza silenciosamente o los offsets no son byte-UTF-8.
- Se intenta guardar el original o datos reales en Git.

## Rollback

Revertir únicamente el commit de CM-400; no borrar fixtures de fases
anteriores ni datos externos.

## Handoff

Usar `docs/HANDOFF.md`.
