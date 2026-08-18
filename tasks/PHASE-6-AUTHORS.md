# CM-500 - Contrato de autores, teorias y revision humana

Estado inicial: `pending`

## Objetivo

Definir un contrato de dominio serializable para representar una postura
atribuida a un autor sobre un concepto, con evidencia bibliografica separada y
un flujo auditable de revision humana.

## Resultado observable

Una fabrica de dominio acepta solo registros con autor, concepto, texto y tipo
de claim validos. Las posturas bibliograficas requieren referencias de cita;
`unsupported` conserva la negativa explicita; `engine` nunca puede atribuirse a
un autor. Las decisiones `pending`, `approved`, `rejected` y `corrected` dejan
un historial inmutable, y una correccion conserva el registro original.

## Prerrequisitos

- `CM-417` en `complete`.
- `CM-414` en `complete`.
- Solo fixtures ficticios; no requiere libros, notas, Ollama ni otro servicio.

## Decisiones congeladas

- D-019: los claims usan tipos cerrados y las afirmaciones bibliograficas
  conservan `citationId`, localizador, fragmento y hash cuando existen.
- D-022: las pruebas usan datos ficticios y no datos personales o corpus real.
- R-33: una postura sin respaldo se presenta como `unsupported`, nunca como
  atribucion confirmada.

## Contrato congelado

- `AuthorTheoryRecordV1` es inmutable y serializable. Contiene IDs y nombres
  explicitos de autor y concepto, el texto de la postura, un tipo de claim
  bibliografico y `citationIds` como referencias opacas.
- Los tipos permitidos para una postura de autor son `direct_quote`,
  `paraphrase`, `inference`, `ai_synthesis` y `unsupported`. `engine` y
  `user_hypothesis` no se convierten en atribuciones de autor.
- `direct_quote`, `paraphrase`, `inference` y `ai_synthesis` requieren al menos
  una referencia. `unsupported` conserva una negativa explicita y no cuenta
  como respaldo.
- Una revision tiene estado `pending`, `approved`, `rejected` o `corrected`.
  Los tres estados finales requieren `reviewerId`, timestamp UTC y motivo;
  `corrected` requiere tambien el texto corregido.
- Cada cambio de revision agrega un evento al historial y devuelve una copia;
  no muta el registro, sus referencias ni el historial anterior.
- La tarjeta no resuelve si una cita prueba semanticamente la postura. Esa
  verificacion y la comparacion de autores son tarjetas posteriores.

## Archivos permitidos

- `src/domain/author-theory/model.ts`.
- `src/domain/author-theory/model.test.ts`.
- `tasks/PHASE-6-AUTHORS.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Libros, notas, corpus real, credenciales, respuestas de proveedores y datos
  personales.
- `package.json`, lockfile, schema Prisma, infraestructura, Ollama, red,
  componentes React, Route Handlers y almacenamiento.

## Fuera de alcance

- Ingesta o perfilado automatico de autores.
- Comparacion entre autores, escuelas o teorias.
- Entailment semantico y decision automatica de verdad.
- UI, API, persistencia, sincronizacion y exportacion a Drive/Obsidian.
- Generacion de texto o atribucion desde texto libre.

## Pasos exactos

1. Definir los tipos serializables, errores tipados y fabricas del registro y
   de las decisiones de revision.
2. Validar IDs, textos, tipos, referencias, timestamps UTC y transiciones de
   revision sin mutar las entradas.
3. Probar claims respaldables, `unsupported`, rechazo de `engine`, correccion
   auditable, serializacion y fixtures invalidos.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/domain/author-theory/model.test.ts
```

Resultado esperado:

- Solo se aceptan atribuciones compatibles con el contrato y las correcciones
  conservan un historial verificable.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: el contrato no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-500: define author theory review contract`.
- Stage permitido: `src/domain/author-theory/model.ts src/domain/author-theory/model.test.ts tasks/PHASE-6-AUTHORS.md tasks/STATUS.md`.
- `git diff --cached --check` esperado: exit 0.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se necesita inventar una fuente, postura, autor o evidencia.
- Se intenta usar `engine` como atribucion de autor.
- La politica exige una nueva decision sobre identidad, autoridad o
  persistencia.

## Rollback

Revertir unicamente el commit de CM-500 y retirar el contrato, su prueba, la
tarjeta y su fila de `tasks/STATUS.md`; no modificar claims, verificador ni
recuperacion de Fase 5.

## Handoff

Usar `docs/HANDOFF.md`.
