# CM-350 — Base PostgreSQL aislada y Prisma

Estado inicial: `pending`

## Objetivo

Crear la base local aislada de Chess Mentor mediante Docker Compose y Prisma,
sin tocar el PostgreSQL existente del host.

## Resultado observable

`docker compose config` valida, el servicio PostgreSQL escucha únicamente en
`127.0.0.1:5433`, usa un volumen nombrado fuera de OneDrive y Prisma puede
aplicar una migración desde cero contra esa base.

## Prerrequisitos

- Tarjetas `CM-000` a `CM-306` en `complete`.
- Docker Desktop disponible; comprobado el 2026-08-15.
- Solo credenciales ficticias locales; no usar datos reales.

## Decisiones congeladas

- D-003: versiones exactas, sin `latest` ni rangos.
- D-005: el documento canónico sigue siendo JSON serializable e inmutable.
- D-010: la persistencia SQL queda detrás de la misma interfaz conceptual.
- D-014: PostgreSQL permanece en loopback y Android no lo contacta.
- D-021: la autoridad local/cloud y la sincronización se implementan después.

Versiones fijadas por esta tarjeta: imagen oficial `postgres:16.14`,
`prisma@6.19.3` y `@prisma/client@6.19.3`.

## Archivos permitidos

- `docker-compose.yml`.
- `.env.example`.
- `package.json`.
- `pnpm-lock.yaml`.
- `prisma/schema.prisma`.
- `prisma/migrations/20260815125032_init/migration.sql`.
- `prisma/migrations/migration_lock.toml`.
- `tasks/PHASE-3.5.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `.env`, `.env.local` y cualquier secreto.
- El servicio PostgreSQL existente en `5432`.
- `src/**`, `worker/**`, Supabase y archivos fuera del repositorio.
- Volúmenes Docker existentes que no pertenezcan a esta tarjeta.

## Fuera de alcance

- Repositorios SQL de partidas o ejercicios.
- Ejecución/reanudación de jobs.
- Route Handlers, autenticación, Supabase, pgvector y datos reales.
- Borrar volúmenes o reiniciar el PostgreSQL existente.

## Pasos exactos

1. Añadir Prisma con versiones exactas y scripts explícitos para generar y
   aplicar migraciones.
2. Crear Compose con PostgreSQL `16.14`, puerto host `5433`, bind loopback,
   healthcheck y volumen nombrado `chess_mentor_pgdata`.
3. Crear el esquema mínimo para partidas, ejercicios y jobs, conservando los
   payloads canónicos como JSON y los estados de job definidos en la hoja de
   ruta.
4. Generar la migración inicial con Prisma, levantar la base y aplicarla desde
   cero usando únicamente la URL local ficticia.

## Verificación focal

```powershell
docker compose config
docker compose up -d postgres
$env:DATABASE_URL = "postgresql://chess_mentor:change_me@127.0.0.1:5433/chess_mentor?schema=public"
pnpm.cmd exec prisma validate
pnpm.cmd exec prisma migrate deploy
pnpm.cmd exec prisma generate
docker compose exec -T postgres pg_isready -U chess_mentor -d chess_mentor
```

Resultado esperado:

- Todos los comandos terminan con exit code 0.
- El contenedor queda `healthy`.
- La migración figura aplicada y no se crea ninguna conexión a `5432`.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `PASS`: Docker Desktop/daemon responde y el contenedor local se verifica con
  `pg_isready`.
- No usar partidas, ejercicios, credenciales ni servicios cloud reales.

## Commit local de cierre

- Mensaje: `CM-350: bootstrap isolated PostgreSQL and Prisma`.
- Stage permitido: `docker-compose.yml .env.example package.json pnpm-lock.yaml prisma/schema.prisma prisma/migrations/20260815125032_init/migration.sql prisma/migrations/migration_lock.toml tasks/PHASE-3.5.md tasks/STATUS.md`.
- `git diff --cached --check` esperado: exit 0.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El puerto `5433` no está disponible.
- Docker intenta reutilizar o tocar el servicio de `5432`.
- Prisma no puede validar o aplicar la migración desde cero.
- La instalación necesita una dependencia no enumerada o una versión no fijada.

## Rollback

Detener el servicio con `docker compose stop postgres`, conservar el volumen
nombrado y revertir solo los archivos creados por esta tarjeta si el commit aún
no existe. No usar `down -v` ni borrar datos.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-351 — Repositorio Prisma de partidas

Estado inicial: `pending`

## Objetivo

Implementar el adaptador PostgreSQL de `GameRepository` detrás del contrato
existente, conservando las invariantes y la semántica de persistencia local.

## Resultado observable

Una partida válida se puede guardar, listar, leer y eliminar mediante Prisma;
los payloads inválidos o corruptos producen errores tipados y las operaciones
no mutan valores entregados por el repositorio.

## Prerrequisitos

- `CM-350` en `complete`.
- PostgreSQL local disponible en `127.0.0.1:5433` para el smoke manual.

## Decisiones congeladas

- D-005: `GameDocumentV1` sigue siendo la autoridad canónica.
- D-010: el adaptador SQL implementa la misma interfaz conceptual.
- D-014: el cliente Prisma solo se usa del lado servidor y PostgreSQL queda en
  loopback.

## Archivos permitidos

- `src/infrastructure/db/prisma.ts`.
- `src/infrastructure/games/PrismaGameRepository.ts`.
- `src/infrastructure/games/PrismaGameRepository.test.ts`.
- `tasks/PHASE-3.5.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`.
- Componentes React, Route Handlers, worker, Supabase y esquema Prisma.
- `.env`, `.env.local` y datos reales.

## Fuera de alcance

- Cambiar `GameRepository` o los adaptadores de navegador.
- Repositorios de ejercicios y jobs.
- Migraciones nuevas, sincronización cloud y autenticación.

## Pasos exactos

1. Crear un singleton de `PrismaClient` para el runtime servidor.
2. Adaptar `GameRecord` a `GameRepository`, validando con el mismo esquema e
   invariantes antes de guardar y después de leer.
3. Mapear fallos de conexión a `STORAGE_UNAVAILABLE` y payloads corruptos a
   `STORAGE_CORRUPT`; `remove()` de un ID ausente debe ser no-op.
4. Probar el contrato completo con un store falso inyectado y dejar el smoke
   real separado del suite unitario.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/games/PrismaGameRepository.test.ts
$env:DATABASE_URL = "postgresql://chess_mentor:change_me@127.0.0.1:5433/chess_mentor?schema=public"
pnpm.cmd exec prisma migrate deploy
docker compose exec -T postgres pg_isready -U chess_mentor -d chess_mentor
```

Resultado esperado:

- El contrato y las fronteras de error pasan.
- No hay migraciones pendientes.
- PostgreSQL acepta conexiones en `5433`.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `PASS`: smoke contra la base local con migración aplicada y `pg_isready`.
- No usar partidas reales ni Supabase.

## Commit local de cierre

- Mensaje: `CM-351: add Prisma game repository`.
- Stage permitido: `src/infrastructure/db/prisma.ts src/infrastructure/games/PrismaGameRepository.ts src/infrastructure/games/PrismaGameRepository.test.ts tasks/PHASE-3.5.md tasks/STATUS.md`.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El adaptador requiere cambiar el contrato público.
- Una lectura inválida se acepta o una escritura inválida llega a Prisma.
- El cliente Prisma se importa desde componentes de navegador.

## Rollback

Revertir solo los archivos de esta tarjeta si el commit aún no existe. No
eliminar la migración, el volumen ni el contenedor de `CM-350`.

## Handoff

Usar `docs/HANDOFF.md`.
