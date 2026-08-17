# CM-410 - Health local de Ollama

Estado inicial: `in_progress`

## Objetivo

Implementar la consulta tipada de `/api/tags` y `/api/ps` de Ollama mediante
un cliente HTTP inyectado, distinguiendo servicio disponible, modelos
instalados y modelos cargados.

## Resultado observable

Un fake HTTP produce un health reproducible sin red real. Ollama ausente,
errores HTTP o transporte degradan a un estado `unavailable`; respuestas
malformadas fallan con un error tipado. El cliente real solo acepta loopback y
no descarga ni carga modelos.

## Prerrequisitos

- `CM-409` en `complete`.
- Ollama real no es necesario; el smoke live queda separado.

## Decisiones congeladas

- D-014: Ollama permanece en loopback y Android no conoce su URL.
- D-017: Ollama enriquece capacidades posteriores sin romper el entrenador.
- D-022: las pruebas usan datos ficticios.

## Contrato congelado

- `createOllamaHttpClient()` solo acepta URLs `http://127.0.0.1` y expone GET
  para `/api/tags` y `/api/ps`.
- `probeOllamaHealth(client)` llama una vez a cada endpoint y no hace IO al
  importar el módulo.
- El resultado distingue `service: available|unavailable` y
  `modelState: none_installed|installed_not_running|running`.
- Los nombres de modelos se deduplican y ordenan; no se conservan respuestas
  completas ni prompts.
- El transporte ausente se reporta como degradación; JSON malformado produce
  `OLLAMA_INVALID_RESPONSE`.

## Archivos permitidos

- `src/infrastructure/ai/OllamaHealth.ts`.
- `src/infrastructure/ai/OllamaHealth.test.ts`.
- `tasks/PHASE-5-OLLAMA-HEALTH.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Descargas, instalación o carga de modelos; llamadas a servicios cloud.
- URLs LAN, `window`, componentes React, Route Handlers y credenciales.
- `package.json`, lockfile, `src/domain/**` y worker.

## Fuera de alcance

- Generación, embeddings, selección de modelo y health HTTP de Next.
- Chunking, recuperación, claims, citas y UI.

## Pasos exactos

1. Definir transporte, parser de respuestas y estados de health.
2. Implementar cliente loopback y probe con degradación explícita.
3. Probar éxito, modelos vacíos, HTTP/transporte ausente, JSON inválido y URL
   no loopback.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/OllamaHealth.test.ts
```

Resultado esperado:

- Los estados de servicio/modelo y errores coinciden con las respuestas fake.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: Ollama real no se consulta en la prueba automatizada.
- Evidencia requerida para live: usuario, fecha, `/api/tags` y `/api/ps` en
  `127.0.0.1`, sin exponer la URL a LAN.

## Commit local de cierre

- Mensaje: `CM-410: add Ollama health probe`.
- Stage permitido: `src/infrastructure/ai/OllamaHealth.ts src/infrastructure/ai/OllamaHealth.test.ts tasks/PHASE-5-OLLAMA-HEALTH.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- El health requiere acceder a una URL no loopback, instalar un modelo o usar
  credenciales.
- Se confunde servicio disponible con modelo cargado.

## Rollback

Revertir unicamente el commit de CM-410 y sus dos archivos de health; no borrar
el contrato AIProvider ni los fakes.

## Handoff

Usar `docs/HANDOFF.md`.
