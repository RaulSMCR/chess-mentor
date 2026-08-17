# CM-403 - Ingestion EPUB con localizadores de capitulo

Estado inicial: pending

## Objetivo

Extender la biblioteca textual a EPUB con original inmutable, hash estable,
capitulos ordenados por spine y texto derivado con localizadores de capitulo y
offset. Reparar el estado obsoleto de `PLAN-EJECUTABLE.md` para que refleje el
progreso real del repositorio.

## Resultado observable

Un EPUB valido produce un documento serializable con metadata, una entrada por
capitulo del spine, texto visible saneado, chunks y localizadores ligados al
hash del archivo original. Scripts, styles, comentarios y tags no se ejecutan
ni aparecen en el texto derivado. Un EPUB corrupto o con estructura requerida
ausente falla sin devolver documento parcial.

## Prerrequisitos

- `CM-402` en `complete`.
- Solo fixture ficticia versionada; no usar libros reales.

## Decisiones congeladas

- D-018: EPUB forma parte de la biblioteca MVP y usa localizador de capitulo,
  CFI u offset; nunca se inventa un numero de pagina.
- D-019: el original conserva SHA-256 y los derivados apuntan al original con
  localizadores tipados.
- D-024: no agregar dependencias ni cambiar decisiones congeladas.

## Contrato congelado

- Entrada `Uint8Array`, UTF-8 fatal para `mimetype`, `container.xml`, OPF y
  XHTML. Limite `MAX_EPUB_INPUT_BYTES = 64 * 1024 * 1024` sobre el ZIP.
- El ZIP debe contener `mimetype` con valor exacto
  `application/epub+zip`, `META-INF/container.xml`, un rootfile OPF y un OPF
  con manifest y spine validos. Solo se procesan items de spine cuyo media
  type sea `application/xhtml+xml` o `text/html`.
- `importKey` es `epub-v1:<source.sha256>` y no depende del nombre de archivo.
  `source.mediaType` es `application/epub+zip`.
- Cada capitulo conserva `ordinal`, `id`, `href`, `spineId`, titulo derivado,
  texto, hash del texto, chunks y un localizador `{ kind: "epub-offset",
chapterIndex, href, unit: "utf8-byte", startByte, endByte }` sobre el texto
  derivado. El indice del capitulo y el href estan ligados al hash del ZIP.
- El texto visible elimina comentarios, `script`, `style` y tags. Decodifica
  entidades XML/HTML basicas y normaliza espacios; no renderiza HTML ni
  promete un parser CommonMark.
- Se usa `fflate` ya declarada. El parser de package XML es deliberadamente
  cerrado al contrato necesario de container/OPF/manifest/spine; namespaces
  desconocidos no se convierten en metadata inventada.
- La fixture de prueba es un manifiesto JSON de entradas ZIP que el test
  convierte a bytes EPUB con `zipSync`; no se commitea un binario generado.

## Reparacion documental

- Actualizar la seccion de estado de `PLAN-EJECUTABLE.md`: la aplicacion
  existe, CM-000..CM-402 estan cerradas y CM-403 es el siguiente entregable.
- No cambiar el requisito original Android LAN ni marcarlo como ejecutado; la
  evidencia existente conserva esa prueba como fuera de alcance.

## Archivos permitidos

- `src/infrastructure/library/epub/EpubDocumentExtractor.ts`.
- `src/infrastructure/library/epub/EpubDocumentExtractor.test.ts`.
- `fixtures/phase4/epub/golden.source.json`.
- `fixtures/phase4/epub/golden.expected.json`.
- `tasks/PHASE-4-EPUB.md`.
- `tasks/STATUS.md`.
- `PLAN-EJECUTABLE.md`.

## Archivos prohibidos

- `src/domain/**`, componentes React, Route Handlers, Prisma y Supabase.
- Libros o EPUB reales, `.env`, secretos y binarios generados.
- Cambios de dependencias, lockfile, decisiones o gates manuales.

## Fuera de alcance

- PDF, OCR, CFI completo, busqueda, persistencia SQL, UI de biblioteca y
  sincronizacion.
- CSS, JavaScript, imagenes, audio y fuentes como contenido derivado.
- Correccion editorial, inferencia bibliografica o citas no presentes en OPF.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/library/epub/EpubDocumentExtractor.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-403: add EPUB document extractor`.
- Stage permitido: `src/infrastructure/library/epub/EpubDocumentExtractor.ts src/infrastructure/library/epub/EpubDocumentExtractor.test.ts fixtures/phase4/epub/golden.source.json fixtures/phase4/epub/golden.expected.json tasks/PHASE-4-EPUB.md tasks/STATUS.md PLAN-EJECUTABLE.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- El EPUB requiere una dependencia XML no aprobada para cumplir el contrato.
- La estructura no permite localizar el capitulo sin inventar una pagina.
- La sanitizacion deja contenido ejecutable o se necesita un dato real.

## Rollback

Revertir unicamente el commit de CM-403; no modificar extractores anteriores ni
el historial de evidencia humana.

## Handoff

Usar `docs/HANDOFF.md`.
