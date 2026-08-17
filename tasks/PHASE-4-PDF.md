# CM-404 - Ingestion PDF textual con localizadores

Estado inicial: `in_progress`

## Objetivo

Extender la biblioteca textual a PDF con capa de texto, conservando el
original por hash y produciendo paginas, texto/chunks y localizadores
deterministas sin depender de React, Prisma ni proveedores externos.

La seleccion externa para orientar esta tarjeta es el PDF de Google Drive
`El Proceso de Toma de Decision en Ajedrez` de Philip Ochman. No se descarga,
versiona ni usa como fixture.

## Resultado observable

Un PDF textual compatible produce un documento derivado serializable con hash
SHA-256 del original, paginas en el orden del arbol PDF, texto extraido de los
operadores de texto, chunks por linea con offsets UTF-8 y una clave de importacion
estable. Un PDF escaneado, cifrado o sin capa textual falla de forma explicita.

## Prerrequisitos

- `CM-403` en `complete`.
- Solo fixture PDF sintetica versionada; no usar libros ni notas reales.

## Decisiones congeladas

- D-018: el MVP admite PDF con capa de texto; OCR, escaneos, diagramas y
  reconstruccion incierta quedan fuera.
- D-019: los localizadores son obligatorios para procedencia futura.
- D-021: la fuente/original es autoridad; el derivado no la sobrescribe.

## Contrato congelado

- Entrada: `Readonly<Uint8Array>`; limite `MAX_PDF_INPUT_BYTES = 64 * 1024 * 1024`.
- La entrada debe declarar `%PDF-`, terminar en `%%EOF` y contener objetos
  indirectos, arbol de paginas y streams de contenido.
- Se soportan streams sin filtro y `FlateDecode`, operadores `Tj`, `TJ`, `'`,
  `"`, `T*`, `Td` y `TD`, cadenas literales, hexadecimales y UTF-16BE con BOM.
- PDF cifrado, object streams, filtros desconocidos, estructura invalida,
  bytes no validos en cadenas y documentos sin texto visible producen errores
  tipados; no se sustituyen bytes silenciosamente.
- El arbol `/Pages` determina el orden. Cada pagina conserva `pageIndex` y
  produce texto, hash y chunks; una pagina vacia puede existir, pero un
  documento sin ningun texto visible es `PDF_NO_TEXT`.
- Los chunks son lineas no vacias del texto de cada pagina. Sus offsets son
  `[startByte, endByte)` sobre UTF-8 del texto derivado de esa pagina y el
  localizador conserva `pageIndex`.
- `importKey = "pdf-text-v1:${sourceSha256}"`; el nombre no participa en la
  identidad. `sourceSha256` cubre todos los bytes originales.
- `derived.text` une paginas con una linea en blanco y su hash se calcula sobre
  UTF-8 sin normalizacion Unicode.

## Archivos permitidos

- `src/infrastructure/library/pdf/PdfTextDocumentExtractor.ts`.
- `src/infrastructure/library/pdf/PdfTextDocumentExtractor.test.ts`.
- `fixtures/phase4/pdf/golden.source.json`.
- `fixtures/phase4/pdf/golden.expected.json`.
- `tasks/PHASE-4-PDF.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`, componentes React, Route Handlers, Prisma y Supabase.
- Libros/notas reales, `.env`, secretos y binarios grandes.
- OCR, motores de ajedrez, indexacion SQL, embeddings y UI de biblioteca.

## Fuera de alcance

- PDF escaneado, OCR, imagenes, reconstruccion de diagramas y FEN.
- CMaps/font maps completos, formularios, anotaciones, cifrado y object streams.
- Persistencia, deduplicacion fisica, busqueda full-text y citas de autor.

## Pasos exactos

1. Definir tipos serializables, errores tipados, limite, hash y localizadores.
2. Leer el arbol de paginas y streams tradicionales, descomprimir FlateDecode y
   extraer texto de los operadores soportados sin mutar la entrada.
3. Cubrir fixture dorada, orden del arbol frente al orden de objetos, UTF-16BE,
   TJ, FlateDecode, pagina vacia, PDF sin texto, estructura invalida, filtros no
   soportados, limite e idempotencia.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/pdf/PdfTextDocumentExtractor.test.ts
```

Resultado esperado:

- Todos los casos pasan y la entrada original queda byte a byte intacta.
- Hashes, paginas, chunks y localizadores coinciden con la fixture esperada.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-404: add textual PDF extractor`.
- Stage permitido: `src/infrastructure/library/pdf/PdfTextDocumentExtractor.ts src/infrastructure/library/pdf/PdfTextDocumentExtractor.test.ts fixtures/phase4/pdf/golden.source.json fixtures/phase4/pdf/golden.expected.json tasks/PHASE-4-PDF.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- El extractor necesita modificar contratos de dominio existentes.
- Se intenta agregar una dependencia no aprobada o leer un libro real dentro
  del repositorio.
- Se acepta OCR, un filtro desconocido o texto reemplazado silenciosamente.

## Rollback

Revertir unicamente el commit de CM-404; no borrar fixtures ni extractores
anteriores ni datos externos.

## Handoff

Usar `docs/HANDOFF.md`.
