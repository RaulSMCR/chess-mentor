# CM-411 - Versionado y dimension de embeddings

Estado inicial: `in_progress`

## Objetivo

Crear el pipeline que asocia embeddings a los chunks canónicos de biblioteca
con un perfil explícito de versión, modelo y dimensión.

## Resultado observable

Un documento ficticio produce chunks vectorizados que conservan texto,
procedencia y localizador. Una respuesta del proveedor con modelo, versión o
dimensión incompatible falla antes de devolver un documento parcial.

## Prerrequisitos

- `CM-410` en `complete`.
- No requiere instalar ni descargar un modelo real.

## Decisiones congeladas

- D-018: el embedding deriva de texto y no reemplaza el original.
- D-019: hash y localizador permanecen junto al fragmento.
- R-32: modelo y dimensión se versionan; perfiles incompatibles no se mezclan.

## Contrato congelado

- `EmbeddingProfileV1` contiene `embeddingVersion`, `model` y `dimensions`.
- `embedLibraryDocument(input, profile, provider)` llama al proveedor en un
  lote ordenado y conserva el orden de chunks.
- Los chunks se reciben ya segmentados por la biblioteca; el pipeline no
  inventa offsets ni altera localizadores.
- Modelo, dimensión, cantidad de vectores, finitud y tamaño de cada vector se
  validan estrictamente.
- `assertEmbeddingProfileCompatible` rechaza documentos de otro perfil.

## Archivos permitidos

- `src/infrastructure/ai/EmbeddingPipeline.ts`.
- `src/infrastructure/ai/EmbeddingPipeline.test.ts`.
- `tasks/PHASE-5-EMBEDDINGS.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Modelos reales, Ollama live, red, pgvector, SQL, credenciales y binarios.
- Extractores, catalogo, `src/domain/**`, componentes React y Route Handlers.

## Fuera de alcance

- Recuperación semántica, fallback textual, claims, citas y UI.
- Re-chunking de documentos, overlap heurístico y migración de embeddings.

## Pasos exactos

1. Definir perfil, documento vectorizado y errores tipados.
2. Implementar lote, validación estricta y compatibilidad de perfiles.
3. Probar procedencia, orden, repetibilidad, dimensión, perfiles incompatibles
   y respuestas inválidas.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/EmbeddingPipeline.test.ts
```

Resultado esperado:

- Solo se aceptan vectores compatibles con el perfil declarado.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-411: version embedding pipeline`.
- Stage permitido: `src/infrastructure/ai/EmbeddingPipeline.ts src/infrastructure/ai/EmbeddingPipeline.test.ts tasks/PHASE-5-EMBEDDINGS.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se requiere un modelo real, una migración vectorial o cambiar la política de
  procedencia.
- Se intenta aceptar vectores de perfiles mezclados o perder localizadores.

## Rollback

Revertir unicamente el commit de CM-411 y sus dos archivos de pipeline; no
eliminar el contrato AIProvider ni la biblioteca.

## Handoff

Usar `docs/HANDOFF.md`.
