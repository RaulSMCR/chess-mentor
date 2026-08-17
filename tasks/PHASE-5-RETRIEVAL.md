# CM-412 - Recuperacion semantica con fallback textual

Estado inicial: `in_progress`

## Objetivo

Crear una ruta de recuperacion de biblioteca que use embeddings compatibles
cuando estan disponibles y conserve la busqueda textual existente como
fallback explicito.

## Resultado observable

Una consulta con proveedor y documentos vectorizados compatibles devuelve
resultados semanticos con procedencia y localizador. Sin proveedor, con
Ollama no disponible, con perfil incompatible, respuesta invalida o fallo de
transporte, la misma consulta devuelve resultados textuales y un motivo de
degradacion tipado.

## Prerrequisitos

- `CM-411` en `complete`.
- No requiere Ollama, red ni modelos reales.

## Decisiones congeladas

- D-018: el embedding deriva de texto y no reemplaza el original.
- D-019: hash y localizador permanecen junto al fragmento.
- R-32: modelo y dimension se versionan; perfiles incompatibles no se mezclan.
- D-022: las pruebas usan datos ficticios.

## Contrato congelado

- `retrieveLibrary(index, documents, query, profile, provider, options)` valida
  primero la consulta mediante `searchLibraryIndex` y conserva su contrato de
  limite y errores.
- El modo `semantic` usa solo una llamada de embedding para la consulta y
  compara por coseno contra documentos del mismo perfil.
- El modo `textual_fallback` conserva la salida de la busqueda textual y
  declara el motivo: proveedor ausente, no disponible, fallido, embeddings
  ausentes o incompatibles, o ausencia de resultados semanticos.
- Los resultados semanticos conservan `importKey`, hash, tipo MIME, nombre de
  archivo, titulo, chunk, texto y localizador del documento vectorizado.
- La recuperacion no hace IO, no envia el corpus al proveedor y no introduce
  claims, citas ni cambios en el indice canonico.

## Archivos permitidos

- `src/infrastructure/ai/LibraryRetrieval.ts`.
- `src/infrastructure/ai/LibraryRetrieval.test.ts`.
- `tasks/PHASE-5-RETRIEVAL.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Ollama live, red, credenciales, modelos reales, pgvector y SQL.
- `package.json`, lockfile, `src/domain/**`, componentes React y Route
  Handlers.

## Fuera de alcance

- Generacion de respuestas, claims estructurados, citas y UI.
- Re-chunking, reordenacion del indice, persistencia vectorial y migraciones.

## Pasos exactos

1. Definir resultado, motivos de fallback y calculo de similitud estable.
2. Implementar compatibilidad de perfiles y degradacion sin excepciones del
   proveedor hacia el usuario.
3. Probar modo semantico, limite, procedencia y fallos de disponibilidad,
   compatibilidad y transporte.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/LibraryRetrieval.test.ts
```

Resultado esperado:

- La recuperacion semantica funciona con el fake y la consulta textual nunca
  queda inutilizada por la ausencia del proveedor.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-412: add library retrieval fallback`.
- Stage permitido: `src/infrastructure/ai/LibraryRetrieval.ts src/infrastructure/ai/LibraryRetrieval.test.ts tasks/PHASE-5-RETRIEVAL.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se requiere una base vectorial, red, un modelo real o cambiar la politica de
  procedencia.
- Se intenta ocultar el motivo del fallback o mezclar perfiles incompatibles.

## Rollback

Revertir unicamente el commit de CM-412 y sus dos archivos de recuperacion; no
eliminar el pipeline de embeddings ni el indice textual.

## Handoff

Usar `docs/HANDOFF.md`.
