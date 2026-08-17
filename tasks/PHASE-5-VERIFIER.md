# CM-414 - Verificador de claims y suficiencia de fuentes

Estado inicial: `in_progress`

## Objetivo

Verificar respuestas estructuradas contra los resultados de biblioteca que
las respaldan y degradar a `unsupported` cualquier claim bibliografico sin
fuente valida o con procedencia que no coincide.

## Resultado observable

Una respuesta con citas cuyo importKey, hash, localizador y fragmento coinciden
con el corpus recuperado queda `verified`. Una respuesta sin evidencia, con
cita inexistente en el corpus o con una cita directa que no aparece en su
fragmento devuelve estado `unsupported`, issues tipados y no conserva citas
invalidas como respaldo.

## Prerrequisitos

- `CM-413` en `complete`.
- Solo fixtures ficticios; no requiere proveedor, Ollama ni libros reales.

## Decisiones congeladas

- D-019: la procedencia conserva hash, localizador, fragmento y citationId.
- D-022: las pruebas usan datos ficticios.
- R-33: una cita o postura no respaldada se convierte en `unsupported`.

## Contrato congelado

- `verifyStructuredResponse(response, evidence)` valida la respuesta
  estructural y compara cada `StructuredCitationV1` con resultados
  `LibrarySearchResultV1` del corpus recuperado.
- Una cita solo es valida si coinciden importKey, `sourceSha256`, mediaType,
  titulo, localizador y el fragmento aparece en el texto del resultado.
- `direct_quote`, `paraphrase`, `inference` y `ai_synthesis` requieren al
  menos una cita valida. `direct_quote` requiere que el texto del claim
  aparezca en el fragmento citado.
- Claims sin evidencia se conservan como texto, pero cambian a tipo
  `unsupported` y pierden sus referencias invalidas. La respuesta final usa
  una negativa explicita cuando existe algun issue.
- `engine` y `user_hypothesis` no se atribuyen a la biblioteca y no requieren
  evidencia bibliografica. Un claim ya marcado `unsupported` mantiene ese
  estado.
- La funcion no hace IO, no interpreta lenguaje natural y no muta respuesta,
  citas ni resultados de evidencia.

## Archivos permitidos

- `src/infrastructure/ai/StructuredClaimsVerifier.ts`.
- `src/infrastructure/ai/StructuredClaimsVerifier.test.ts`.
- `tasks/PHASE-5-VERIFIER.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Proveedores reales, red, Ollama, credenciales, corpus real y generacion de
  texto.
- `package.json`, lockfile, `src/domain/**`, componentes React y Route
  Handlers.

## Fuera de alcance

- Entailment semantico, comparacion de autores, extraccion de citas desde
  texto libre, UI, persistencia y API.

## Pasos exactos

1. Definir resultado de verificacion, issues y comparacion de procedencia.
2. Implementar degradacion explicita de claims sin evidencia.
3. Probar corpus suficiente, corpus vacio, hash/localizador incorrectos,
   direct quotes no encontrados y claims no bibliograficos.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/StructuredClaimsVerifier.test.ts
```

Resultado esperado:

- Ningun claim bibliografico sin evidencia permanece presentado como
  respaldado.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-414: verify structured claims against evidence`.
- Stage permitido: `src/infrastructure/ai/StructuredClaimsVerifier.ts src/infrastructure/ai/StructuredClaimsVerifier.test.ts tasks/PHASE-5-VERIFIER.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se necesita entailment con un modelo, datos reales o interpretar una
  atribucion de autor.
- Se intenta aceptar una cita cuyo hash o localizador no existe en la
  evidencia recuperada.

## Rollback

Revertir unicamente el commit de CM-414 y sus dos archivos de verificacion; no
eliminar el contrato de claims ni la recuperacion.

## Handoff

Usar `docs/HANDOFF.md`.
