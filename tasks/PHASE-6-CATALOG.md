# CM-501 - Catalogo de autores, escuelas y conceptos

Estado inicial: `pending`

## Objetivo

Definir un catalogo de dominio serializable para identificar autores, escuelas
y conceptos de teoria sin atribuir posturas ni inventar relaciones.

## Resultado observable

Una fabrica acepta un catalogo con IDs estables, nombres canonicos, alias y
relaciones explicitas. Rechaza IDs o nombres vacios, duplicados, alias
repetidos y referencias a escuelas o conceptos inexistentes. La salida no
muta las entradas y puede serializarse y validarse de nuevo.

## Prerrequisitos

- `CM-500` en `complete`.
- Solo fixtures ficticios; no requiere libros, notas, proveedores ni red.

## Decisiones congeladas

- D-019: una atribucion posterior usara tipos de claim y procedencia explicita.
- D-022: las pruebas usan datos ficticios y no corpus real.
- R-33: un catalogo de identidad no constituye evidencia de una postura.

## Contrato congelado

- `AuthorProfileV1` contiene `id`, `canonicalName`, `aliases`, `schoolIds` y
  `conceptIds`; no contiene posturas ni citas.
- `TheorySchoolV1` contiene `id` y `name`.
- `TheoryConceptV1` contiene `id` y `label`.
- `AuthorTheoryCatalogV1` contiene version, autores, escuelas y conceptos en
  colecciones serializables e inmutables.
- Los IDs son unicos dentro de cada coleccion. Alias y nombres canonicos se
  normalizan y no pueden repetirse dentro del mismo autor.
- Cada `schoolId` y `conceptId` de un autor debe referenciar una entidad del
  catalogo. La existencia en el catalogo no prueba una postura del autor.
- El contrato no permite cargar fuentes, inferir escuelas ni comparar autores.

## Archivos permitidos

- `src/domain/author-theory/catalog.ts`.
- `src/domain/author-theory/catalog.test.ts`.
- `tasks/PHASE-6-CATALOG.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Libros, notas, corpus real, credenciales, datos personales y respuestas de
  proveedores.
- `package.json`, lockfile, schema Prisma, infraestructura, Ollama, red,
  componentes React, Route Handlers y almacenamiento.

## Fuera de alcance

- Ingesta o perfilado automatico de autores.
- Atribucion de posturas, citas, comparacion o mesa redonda.
- Entailment, ranking, recomendaciones y generacion de texto.
- UI, API, persistencia, sincronizacion y exportacion.

## Pasos exactos

1. Definir los tipos versionados, errores y fabrica del catalogo.
2. Normalizar textos y validar unicidad y referencias entre colecciones.
3. Probar catalogos validos, duplicados, relaciones rotas, serializacion y
   entradas sin mutar.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/domain/author-theory/catalog.test.ts
```

Resultado esperado:

- Solo se aceptan catalogos con identidad y relaciones declaradas de forma
  consistente.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: el contrato no requiere dispositivo ni servicio externo.

## Commit local de cierre

- Mensaje: `CM-501: define author theory catalog`.
- Stage permitido: `src/domain/author-theory/catalog.ts src/domain/author-theory/catalog.test.ts tasks/PHASE-6-CATALOG.md tasks/STATUS.md`.
- `git diff --cached --check` esperado: exit 0.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se necesita inventar una identidad, escuela, concepto o evidencia.
- Se intenta usar el catalogo como prueba de una postura.
- La politica exige una decision nueva sobre identidad o autoridad de fuentes.

## Rollback

Revertir unicamente el commit de CM-501 y retirar el catalogo, su prueba, la
tarjeta y su fila de `tasks/STATUS.md`; no modificar el contrato de posturas.

## Handoff

Usar `docs/HANDOFF.md`.
