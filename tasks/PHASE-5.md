# CM-409 - Contrato AIProvider y fake determinista

Estado inicial: `in_progress`

## Objetivo

Definir la frontera de IA contextual para disponibilidad, generación y
embeddings, junto con un fake determinista que permita probar consumidores sin
Ollama, red ni modelos instalados.

## Resultado observable

Un consumidor puede consultar disponibilidad, generar texto y obtener vectores
con un contrato tipado. El fake produce la misma salida para la misma entrada,
valida límites y representa indisponibilidad con un error explícito.

## Prerrequisitos

- `CM-408` en `complete`.
- No requiere modelo real; el prerrequisito humano de embeddings pertenece al
  gate posterior de Fase 5.

## Decisiones congeladas

- D-017: la IA generativa queda después del entrenador determinista.
- D-019: el proveedor no decide procedencia ni inventa citas.
- D-022: las pruebas usan únicamente datos ficticios.

## Contrato congelado

- `AIProvider.availability()` informa proveedor, modelo y disponibilidad sin
  lanzar por una ausencia normal.
- `generate({ prompt, system?, model?, maxTokens? })` devuelve texto y motivo
  de finalización.
- `embed({ texts, model? })` devuelve vectores con dimensión explícita y el
  mismo orden que las entradas.
- Los errores usan `AI_INVALID_REQUEST`, `AI_UNAVAILABLE` o
  `AI_PROVIDER_FAILED`.
- `FakeAIProvider` no realiza IO, conserva las entradas sin mutarlas y genera
  respuestas y vectores reproducibles.

## Archivos permitidos

- `src/infrastructure/ai/AIProvider.ts`.
- `src/infrastructure/ai/FakeAIProvider.ts`.
- `src/infrastructure/ai/FakeAIProvider.test.ts`.
- `tasks/PHASE-5.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Ollama, red, fetch, sockets, modelos, embeddings reales y credenciales.
- `package.json`, lockfile, `src/domain/**`, componentes React y Route
  Handlers.

## Fuera de alcance

- Health real de Ollama, selección de modelos y descarga de pesos.
- Chunking, recuperación, claims, citas, verificación y UI de IA.

## Pasos exactos

1. Definir tipos de disponibilidad, generación, embeddings y errores.
2. Implementar el fake determinista con validación y degradación explícita.
3. Probar repetibilidad, dimensión/orden de vectores, inputs inválidos y
   proveedor ausente.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/FakeAIProvider.test.ts
```

Resultado esperado:

- Todas las salidas del fake son deterministas y los errores conservan código.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-409: define AI provider contract`.
- Stage permitido: `src/infrastructure/ai/AIProvider.ts src/infrastructure/ai/FakeAIProvider.ts src/infrastructure/ai/FakeAIProvider.test.ts tasks/PHASE-5.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- El contrato requiere instalar un modelo, contactar Ollama o cambiar
  decisiones de procedencia.
- El fake depende de reloj, azar, red o estado global mutable.

## Rollback

Revertir unicamente el commit de CM-409 y sus tres archivos de IA; no borrar
la biblioteca ni los derivados existentes.

## Handoff

Usar `docs/HANDOFF.md`.
