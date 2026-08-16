# CM-401 — Ingestión Markdown saneada

Estado inicial: `pending`

## Objetivo

Extender la ingestión textual al formato Markdown con una vista derivada de
texto plano saneada, sin renderizar HTML no confiable y manteniendo
localizadores byte-UTF-8 sobre el original inmutable.

## Resultado observable

Un Markdown UTF-8 válido produce una clave hash estable, texto derivado seguro,
chunks por línea y offsets que siguen apuntando al archivo original. Scripts,
styles, comentarios HTML, tags crudos y URLs de enlaces Markdown no aparecen
como contenido ejecutable ni como enlaces en la vista derivada.

## Prerrequisitos

- `CM-400` en `complete`.
- Solo fixture ficticia versionada; no usar libros ni notas reales.

## Decisiones congeladas

- D-018: Markdown se implementa después de TXT y antes de PGN/EPUB/PDF.
- D-019: la procedencia apunta al original mediante localizadores tipados.
- Privacidad: Markdown/HTML extraído se trata como no confiable y se sanea antes
  de renderizar.

## Contrato congelado

- Entrada UTF-8 fatal con `MAX_MARKDOWN_INPUT_BYTES = 16 * 1024 * 1024`.
- `source.sha256` cubre todos los bytes originales; `importKey` es
  `markdown:v1:<source.sha256>` y no depende del nombre de archivo.
- La vista derivada es `plain-text-v1`: no produce HTML ni enlaces clicables.
  Quita sintaxis Markdown básica (headings, listas, énfasis, backticks),
  conserva el texto visible de links/images y elimina sus destinos.
- Se eliminan bloques `<script>`/`<style>`, comentarios HTML y tags crudos,
  incluidos atributos `onerror`, `javascript:` y similares. No se intenta
  interpretar Markdown anidado de forma completa.
- Cada línea derivada no vacía conserva un chunk con `sourceLocator` en bytes
  UTF-8 del rango de la línea original. Los saltos/espacios de la vista pueden
  normalizarse a un espacio simple, pero nunca se cambia el original.
- Persistencia, búsqueda full-text, render seguro enriquecido y deduplicación
  física quedan fuera de esta tarjeta.

## Archivos permitidos

- `src/infrastructure/library/markdown/MarkdownDocumentExtractor.ts`.
- `src/infrastructure/library/markdown/MarkdownDocumentExtractor.test.ts`.
- `fixtures/phase4/markdown/golden.md`.
- `fixtures/phase4/markdown/golden.expected.json`.
- `tasks/PHASE-4-MARKDOWN.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`, componentes React, Route Handlers, Prisma y Supabase.
- Libros/notas reales, `.env`, HTML generado ejecutable y binarios grandes.

## Fuera de alcance

- Renderizar Markdown/HTML en React.
- Parser CommonMark completo, tablas avanzadas, plugins, imágenes o enlaces
  navegables.
- PGN, EPUB, PDF, OCR, embeddings y persistencia SQL.

## Pasos exactos

1. Definir tipos, hash, límite y errores de decodificación.
2. Implementar saneamiento de texto plano y chunks con offsets del original.
3. Cubrir fixture dorada, scripts/styles/comentarios, enlaces peligrosos,
   Unicode/CRLF, BOM, límite, exceso, bytes inválidos e idempotencia.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/markdown/MarkdownDocumentExtractor.test.ts
```

Resultado esperado:

- La vista derivada no contiene tags, scripts ni destinos de links.
- Todos los localizadores coinciden con los rangos byte-UTF-8 de la fixture.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-401: add sanitized Markdown extractor`.
- Stage permitido: `src/infrastructure/library/markdown/MarkdownDocumentExtractor.ts src/infrastructure/library/markdown/MarkdownDocumentExtractor.test.ts fixtures/phase4/markdown/golden.md fixtures/phase4/markdown/golden.expected.json tasks/PHASE-4-MARKDOWN.md tasks/STATUS.md`.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El saneamiento requiere agregar una dependencia no aprobada.
- La salida incluye HTML ejecutable, un destino `javascript:` o pierde el
  localizador del original.
- Se intenta almacenar contenido real en Git.

## Rollback

Revertir únicamente el commit de CM-401; no modificar fixtures ni extractores
anteriores.

## Handoff

Usar `docs/HANDOFF.md`.
