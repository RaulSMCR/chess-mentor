# CM-415 - Generacion explicita de Prisma en build

Estado inicial: `in_progress`

## Objetivo

Evitar que el build remoto dependa de scripts de instalacion de Prisma que
pnpm 10 puede ignorar en Vercel.

## Resultado observable

El script `build` genera el cliente Prisma desde `prisma/schema.prisma` antes
de ejecutar `next build`. Una instalacion limpia que informa scripts Prisma
ignorados puede completar el typecheck y el build porque la generacion es
explicita.

## Prerrequisitos

- `CM-414` en `complete`.
- Prisma y `@prisma/client` ya estan fijados en las versiones del lockfile.

## Decisiones congeladas

- D-024: no cambiar dependencias ni decisiones congeladas sin una tarjeta que
  lo autorice.
- La allowlist de `pnpm.onlyBuiltDependencies` permanece limitada a
  `unrs-resolver`; no se habilitan scripts de terceros como atajo.

## Contrato congelado

- `pnpm.cmd run build` ejecuta `prisma generate` y despues `next build`.
- La solucion no necesita red, una base de datos activa ni migraciones.
- No se modifica el schema Prisma ni se ejecutan migraciones durante el build.

## Archivos permitidos

- `package.json`.
- `tasks/PHASE-5-PRISMA-BUILD.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `pnpm-lock.yaml`, `prisma/schema.prisma`, migraciones, bases de datos y
  credenciales.
- `pnpm approve-builds`, cambios de allowlist, Docker y servicios externos.

## Fuera de alcance

- Reejecucion del deploy de Vercel y gates humanos de cloud.
- Cambios de modelo, migraciones o runtime de Prisma.

## Pasos exactos

1. Ejecutar la generacion Prisma existente como parte del build.
2. Probar generacion y build local con el cliente generado.
3. Ejecutar la verificacion global y documentar el deploy remoto como pendiente
   hasta contar con un nuevo log de Vercel.

## Verificacion focal

```powershell
pnpm.cmd run db:generate
pnpm.cmd run build
```

Resultado esperado:

- El cliente exporta `PrismaClient`, `Prisma` y `JobStatus` antes del
  typecheck de Next.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: requiere un nuevo deploy de Vercel y su log; no se infiere PASS
  desde el build local.

## Commit local de cierre

- Mensaje: `CM-415: generate Prisma client before build`.
- Stage permitido: `package.json tasks/PHASE-5-PRISMA-BUILD.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se requiere aprobar scripts Prisma, modificar dependencias o tocar una base
  de datos.
- El build necesita una `DATABASE_URL` activa para generar tipos.

## Rollback

Revertir unicamente el commit de CM-415 y restaurar el script `build` a
`next build`; no eliminar el schema ni las migraciones.

## Handoff

Usar `docs/HANDOFF.md`.
