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

# CM-352 — Repositorio Prisma de ejercicios

Estado inicial: `pending`

## Objetivo

Implementar el adaptador PostgreSQL de `TrainerRepository`, conservando la
validación, el clonado y los códigos de error de los repositorios locales.

## Resultado observable

Un ejercicio válido se puede guardar, listar, leer y eliminar mediante Prisma;
un payload inválido, una metadata SQL inconsistente o una base no disponible
produce un error tipado sin aceptar datos corruptos.

## Prerrequisitos

- `CM-351` en `complete`.
- PostgreSQL local en `127.0.0.1:5433` para el smoke manual.

## Decisiones congeladas

- D-005: `TrainerExerciseRecordV1` sigue siendo el payload canónico.
- D-010: el adaptador SQL implementa la misma interfaz conceptual.
- D-014: Prisma solo se usa del lado servidor y PostgreSQL queda en loopback.
- D-029: ejercicios usan repositorio separado de partidas.

## Archivos permitidos

- `src/infrastructure/trainer/PrismaTrainerRepository.ts`.
- `src/infrastructure/trainer/PrismaTrainerRepository.test.ts`.
- `tasks/PHASE-3.5.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`.
- Componentes React, Route Handlers, worker, Supabase y esquema Prisma.
- `.env`, `.env.local` y datos reales.

## Fuera de alcance

- Repositorios SQL de jobs.
- Migraciones nuevas y cambios del esquema Prisma.
- Sincronización cloud y autenticación.

## Reglas de persistencia

1. `save()` valida el registro antes de llamar al store y serializa una copia.
2. La fila debe conservar `id` y `schedule.nextDueAt` en columnas coincidentes
   con el payload JSON.
3. `list()` ordena por `nextDueAt` ascendente y luego `id` ascendente.
4. Lecturas con payload o metadata inconsistentes producen
   `STORAGE_CORRUPT`; fallos del store producen `STORAGE_UNAVAILABLE`.
5. `remove()` de un id inexistente es no-op y todas las lecturas devuelven
   copias independientes.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/trainer/PrismaTrainerRepository.test.ts
$env:DATABASE_URL = "postgresql://chess_mentor:change_me@127.0.0.1:5433/chess_mentor?schema=public"
pnpm.cmd exec prisma migrate deploy
docker compose exec -T postgres pg_isready -U chess_mentor -d chess_mentor
```

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `PASS`: smoke contra la base local con migración aplicada y `pg_isready`.
- Si Docker/Engine no responde, conservar `ready_for_manual` y no inventar PASS.
- No usar partidas, ejercicios, credenciales ni servicios cloud reales.

## Commit local de cierre

- Mensaje: `CM-352: add Prisma trainer repository`.
- Stage permitido: `src/infrastructure/trainer/PrismaTrainerRepository.ts src/infrastructure/trainer/PrismaTrainerRepository.test.ts tasks/PHASE-3.5.md tasks/STATUS.md`.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El adaptador requiere cambiar `TrainerRepository` o el esquema Prisma.
- Una lectura inválida se acepta o una escritura inválida llega a Prisma.
- El cliente Prisma se importa desde componentes de navegador.

## Rollback

Revertir únicamente los archivos de esta tarjeta si el commit aún no existe.
No eliminar migraciones, volúmenes ni el contenedor de CM-350.

---

# CM-353 — Cola reanudable y repositorio Prisma de jobs

Estado inicial: `pending`

## Objetivo

Implementar el contrato server-only de trabajos largos sobre el `JobRecord`
existente, con idempotencia, lease, checkpoint y transiciones terminales
condicionadas al intento que posee el trabajo.

## Resultado observable

Un job se encola una sola vez por `idempotencyKey`, puede ser reclamado de
forma determinista, recuperado cuando su lease expiró y finalizado sin que un
worker obsoleto sobrescriba el resultado de otro intento.

## Prerrequisitos

- `CM-352` en `complete`.
- PostgreSQL local disponible en `127.0.0.1:5433` para el smoke manual.

## Decisiones congeladas

- D-003: no introducir versiones abiertas ni migraciones implícitas.
- D-010: el adaptador SQL queda detrás de un contrato server-only.
- D-014: PostgreSQL permanece en loopback y el navegador no lo contacta.
- D-021: la autoridad local/cloud y la sincronización quedan fuera de esta
  tarjeta.

## Contrato congelado

- Estados de dominio: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- `attemptCount` empieza en cero y aumenta exactamente una vez al reclamar.
- `enqueue({kind, idempotencyKey, checkpoint?})` devuelve el job existente si
  la clave ya existe con el mismo `kind`; una clave usada por otro `kind` es
  `IDEMPOTENCY_CONFLICT` y no muta la base.
- `claim({now, leaseUntil, maxAttempts})` elige por `createdAt` ascendente e
  `id` ascendente un job `queued` o un `running` con lease vencido. Excluye
  `attemptCount >= maxAttempts`, cambia a `running`, asigna el nuevo lease y
  aumenta `attemptCount` dentro de una operación atómica.
- `checkpoint(id, attemptCount, value)`, `succeed(id, attemptCount, result)`
  y `fail(id, attemptCount, error)` solo aceptan el intento que posee un job
  `running`; un intento obsoleto devuelve `JOB_CONFLICT` sin escribir.
- `succeed` y `fail` limpian el lease. Repetir `succeed` con el mismo resultado
  ya persistido es idempotente; un resultado distinto es `JOB_CONFLICT`.
- `cancel(id)` es idempotente para un job ya cancelado y no puede reabrir un
  estado terminal.
- Las fechas se exponen como ISO UTC; `checkpoint`, `result` y `error` son
  JSON serializable o `null`. Los payloads/metadata corruptos producen
  `STORAGE_CORRUPT`; fallos del cliente Prisma producen
  `STORAGE_UNAVAILABLE`.

## Archivos permitidos

- `src/infrastructure/jobs/JobRepository.ts`.
- `src/infrastructure/jobs/PrismaJobRepository.ts`.
- `src/infrastructure/jobs/PrismaJobRepository.test.ts`.
- `tasks/PHASE-3.5.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`.
- Componentes React, Route Handlers, worker, Supabase y esquema Prisma.
- `.env`, `.env.local`, migraciones y datos reales.

## Fuera de alcance

- Ejecutar workers reales o añadir una cola externa.
- Reintentos automáticos fuera de `claim` y del límite recibido.
- Cambiar el modelo Prisma existente o crear migraciones.
- Sincronización cloud, autenticación y UI de administración.

## Pasos exactos

1. Definir el contrato, errores tipados, validación de estado y transiciones
   sin importar Prisma en consumidores de navegador.
2. Implementar el store Prisma con una reclamación condicional dentro de una
   transacción y adaptar sus filas a copias inmutables del contrato.
3. Probar idempotencia, orden de reclamación, recuperación de lease, límite de
   intentos, checkpoint, conflictos de workers obsoletos y corrupción.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/jobs/PrismaJobRepository.test.ts
$env:DATABASE_URL = "postgresql://chess_mentor:change_me@127.0.0.1:5433/chess_mentor?schema=public"
pnpm.cmd exec prisma migrate deploy
docker compose exec -T postgres pg_isready -U chess_mentor -d chess_mentor
```

Resultado esperado:

- El contrato fake pasa sin mutar entradas ni permitir carreras obsoletas.
- No hay migraciones pendientes y PostgreSQL acepta conexiones en `5433`.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `PASS`: smoke contra la base local con migración aplicada y `pg_isready`.
- Si Docker/Engine no responde, conservar `ready_for_manual` y no inventar
  PASS.

## Commit local de cierre

- Mensaje: `CM-353: add resumable job repository`.
- Stage permitido: `src/infrastructure/jobs/JobRepository.ts src/infrastructure/jobs/PrismaJobRepository.ts src/infrastructure/jobs/PrismaJobRepository.test.ts tasks/PHASE-3.5.md tasks/STATUS.md`.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El contrato requiere cambiar el esquema Prisma o introducir una migración.
- Una reclamación permite dos workers para el mismo intento.
- Un worker obsoleto puede sobrescribir checkpoint o resultado.

## Rollback

Revertir únicamente el commit de esta tarjeta y sus tres archivos de jobs;
no eliminar la migración, el volumen ni el contenedor de CM-350.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-354 — Runner server-only de jobs

Estado inicial: `pending`

## Objetivo

Implementar el runner reanudable que reclama un job, selecciona un handler por
`kind`, permite guardar checkpoints y finaliza con `succeeded` o `failed` sin
duplicar resultados ni aceptar excepciones de un worker obsoleto.

## Resultado observable

Una invocación de `runOnce()` procesa como máximo un job. Si no hay trabajo
elegible devuelve `idle`; si el handler termina, persiste el resultado; si
falla, persiste un error JSON tipado. Los checkpoints se escriben con el
`attemptCount` reclamado y un conflicto del repositorio no se transforma en un
éxito falso.

## Prerrequisitos

- `CM-353` en `complete`.
- El runner se invoca solo desde runtime server-only; no se importa desde
  componentes ni módulos de navegador.

## Decisiones congeladas

- D-010: el runner depende del contrato `JobRepository`, no de Prisma directo.
- D-014: ningún navegador contacta PostgreSQL ni ejecuta el runner.
- D-021: no se añade sincronización cloud en esta tarjeta.

## Contrato congelado

- `JobRunner` recibe un `JobRepository`, un mapa inmutable de handlers y
  opciones `clock`, `leaseDurationMs` y `maxAttempts`.
- Cada handler recibe el snapshot reclamado y
  `{ checkpoint(value) }`; devuelve un `JobJsonValue`.
- `runOnce()` calcula `leaseUntil` a partir del reloj inyectado, reclama un
  único job y devuelve `{status: "idle"}` o `{status: "succeeded"|"failed", job,
checkpoints}`.
- Un `JobRepositoryError` se propaga sin marcar el job como fallido. Una
  excepción ordinaria del handler se convierte en
  `{code: "HANDLER_FAILED", message}` y llama a `fail` con el intento activo.
- Un `kind` sin handler se marca como fallo con
  `{code: "HANDLER_NOT_FOUND", kind}`.
- `leaseDurationMs` y `maxAttempts` son enteros positivos; el reloj siempre
  produce fechas válidas y el lease queda estrictamente después de `now`.

## Archivos permitidos

- `src/infrastructure/jobs/JobRunner.ts`.
- `src/infrastructure/jobs/JobRunner.test.ts`.
- `tasks/PHASE-3.5.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/domain/**`, `PrismaJobRepository.ts` y el esquema Prisma.
- Componentes React, Route Handlers, worker del navegador, Supabase y `.env`.

## Fuera de alcance

- Polling permanente, cron, procesos Windows o despliegue cloud.
- Renovación de lease durante un handler.
- Backups y restauración de PostgreSQL (tarjeta posterior).

## Pasos exactos

1. Crear el runner puro de infraestructura sobre `JobRepository`, sin importar
   Prisma directamente.
2. Normalizar errores de handlers y contar checkpoints confirmados.
3. Probar éxito, fallo, handler ausente, idle, validación de opciones y
   propagación de conflictos/errores de almacenamiento.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/jobs/JobRunner.test.ts
```

Resultado esperado:

- Todos los escenarios pasan y nunca se escribe un resultado para un intento
  obsoleto.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no requiere dispositivo; el smoke de PostgreSQL pertenece a
  CM-353 y debe permanecer verde.

## Commit local de cierre

- Mensaje: `CM-354: add server-only job runner`.
- Stage permitido: `src/infrastructure/jobs/JobRunner.ts src/infrastructure/jobs/JobRunner.test.ts tasks/PHASE-3.5.md tasks/STATUS.md`.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El runner necesita cambiar la interfaz de `JobRepository`.
- Un error del handler puede dejar un job `running` sin que el caller lo
  observe como error.
- El runner importa módulos de navegador o Prisma directamente.

## Rollback

Revertir únicamente el commit de esta tarjeta y sus dos archivos de runner;
no eliminar migraciones, volúmenes ni el contenedor de CM-350.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-355 — Backup y restauración de prueba PostgreSQL

Estado inicial: `pending`

## Objetivo

Probar un backup lógico de la base aislada de Chess Mentor y restaurarlo en
una base desechable del mismo contenedor, sin escribir artefactos pesados en el
repositorio ni tocar el PostgreSQL existente en `5432`.

## Resultado observable

El script crea un dump custom fuera del repositorio, restaura el esquema en
`chess_mentor_restore_test`, verifica la tabla `JobRecord` y elimina únicamente
esa base de prueba. El dump se conserva solo si se solicita `--keep`.

## Prerrequisitos

- `CM-354` en `complete`.
- Docker Desktop/Engine operativo y `chessmentor-postgres` saludable.

## Decisiones congeladas

- D-003: usar la imagen y herramientas ya fijadas, sin instalar nada nuevo.
- D-014: operar exclusivamente contra `127.0.0.1:5433`.
- D-021: no introducir sincronización cloud ni datos reales.

## Contrato congelado

- Comando: `node scripts/db-backup-restore.mjs`.
- El ejecutable Docker se toma de `CHESS_MENTOR_DOCKER_EXE` o de la ruta local
  conocida de Docker Desktop; no depende de que `docker` esté en `PATH`.
- El archivo temporal se crea bajo `%TEMP%`; si una ruta indicada cae dentro
  del repositorio, el script la rechaza.
- La restauración usa exclusivamente la base fija
  `chess_mentor_restore_test`; no se permite parametrizar un nombre arbitrario
  que pueda apuntar a datos reales.
- La limpieza final solo elimina la base de prueba y los temporales creados por
  el script. El volumen `chess_mentor_pgdata` y la base fuente permanecen.

## Archivos permitidos

- `scripts/db-backup-restore.mjs`.
- `tasks/PHASE-3.5.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `.env`, `.env.local`, dumps dentro del repositorio y datos reales.
- El PostgreSQL del host en `5432`, volúmenes ajenos o bases distintas de la
  base de restauración fija.

## Fuera de alcance

- Backup físico del volumen Docker.
- Programación automática, almacenamiento cloud o cifrado de secretos.
- Migraciones nuevas y cambios del esquema Prisma.

## Pasos exactos

1. Obtener el contenedor del servicio `postgres` y comprobar `pg_isready`.
2. Ejecutar `pg_dump --format=custom`, copiar el dump a `%TEMP%`, crear la base
   desechable y restaurar con `pg_restore --exit-on-error`.
3. Verificar `public."JobRecord"`, limpiar la base de prueba y borrar el dump
   salvo que se haya pedido `--keep`.

## Verificación focal

```powershell
node scripts/db-backup-restore.mjs
```

Resultado esperado:

- El comando termina con exit code 0 y muestra `BACKUP_RESTORE_PASS`.
- La base fuente y el puerto `5432` no se modifican.

## Verificación global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `PASS`: ejecutar el script con Docker Desktop activo y registrar contenedor,
  puerto `5433`, base restaurada y limpieza confirmada.
- Si Docker no responde, conservar `ready_for_manual` y no inventar PASS.

## Commit local de cierre

- Mensaje: `CM-355: verify PostgreSQL backup restore`.
- Stage permitido: `scripts/db-backup-restore.mjs tasks/PHASE-3.5.md tasks/STATUS.md`.
- Push: prohibido salvo petición separada del usuario.

## Condiciones de parada

- El script resuelve una base o volumen fuera de Chess Mentor.
- El dump se crea dentro del repositorio o la restauración toca `5432`.
- La restauración no permite verificar `JobRecord`.

## Rollback

Revertir únicamente el commit de esta tarjeta; no borrar el volumen
`chess_mentor_pgdata` ni la base PostgreSQL fuente.

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
