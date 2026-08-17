# CM-413 - Contrato de claims estructurados y citas

Estado inicial: `in_progress`

## Objetivo

Definir una respuesta serializable con claims tipados y citas bibliograficas
enlazadas a resultados de biblioteca, conservando hash, localizador y
fragmento sin inventar autoria o postura.

## Resultado observable

Un resultado de recuperacion puede convertirse en una cita estable y una
respuesta puede contener claims con referencias a citas existentes. La
respuesta rechaza IDs duplicados, citas inexistentes, citas huerfanas y
procedencia mal formada antes de ser entregada al consumidor.

## Prerrequisitos

- `CM-412` en `complete`.
- Solo fixtures ficticios; no requiere proveedor, Ollama ni libros reales.

## Decisiones congeladas

- D-019: la procedencia conserva tipo de afirmacion, citationId, obra/edicion,
  localizador, fragmento permitido y hash del original.
- D-022: las pruebas usan datos ficticios.
- R-33: una cita o postura no respaldada no puede presentarse como fuente.

## Contrato congelado

- Los tipos de claim son exactamente `direct_quote`, `paraphrase`, `inference`,
  `engine`, `ai_synthesis`, `user_hypothesis` y `unsupported`.
- `StructuredCitationV1` conserva `citationId`, importacion, hash SHA-256,
  tipo MIME, obra, edicion, titulo, localizador y fragmento; FEN y movimiento
  son opcionales y solo se conservan cuando el llamador los aporta.
- `createCitationFromSearchResult` deriva una cita determinista de un
  `LibrarySearchResultV1` y permite metadata explicita sin inferir autores.
- `createStructuredResponse` valida schema, IDs, tipos, referencias y
  procedencia. No realiza parsing de texto generado ni decide todavia si un
  tipo de claim exige una fuente; esa politica pertenece al verificador de la
  siguiente tarjeta.
- Una respuesta es serializable e inmutable para el consumidor: la entrada y
  sus colecciones no se mutan y el resultado se devuelve clonado.

## Archivos permitidos

- `src/infrastructure/ai/StructuredClaims.ts`.
- `src/infrastructure/ai/StructuredClaims.test.ts`.
- `tasks/PHASE-5-CLAIMS.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Proveedores reales, red, Ollama, credenciales, corpus real y generacion
  automatica de texto.
- `package.json`, lockfile, `src/domain/**`, componentes React y Route
  Handlers.

## Fuera de alcance

- Verificador de claims, suficiencia del corpus y negativa `unsupported`.
- Comparacion de autores, atribucion de posturas, UI, persistencia y API.

## Pasos exactos

1. Definir tipos, errores y cita derivada de resultados de biblioteca.
2. Validar estructura, procedencia, unicidad y enlaces claim-citation.
3. Probar serializacion, procedencia, metadata FEN/movimiento y entradas
   invalidas sin usar datos reales.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/StructuredClaims.test.ts
```

Resultado esperado:

- Solo se aceptan respuestas estructuradas con citas existentes y procedencia
  verificable por forma.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-413: define structured claims and citations`.
- Stage permitido: `src/infrastructure/ai/StructuredClaims.ts src/infrastructure/ai/StructuredClaims.test.ts tasks/PHASE-5-CLAIMS.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se necesita interpretar una postura de autor, validar suficiencia semantica o
  cambiar D-019/R-33.
- Se intenta rellenar obra, edicion, localizador, hash o fragmento por
  inferencia no conservada.

## Rollback

Revertir unicamente el commit de CM-413 y sus dos archivos de claims; no
eliminar la recuperacion ni los extractores de biblioteca.

## Handoff

Usar `docs/HANDOFF.md`.
