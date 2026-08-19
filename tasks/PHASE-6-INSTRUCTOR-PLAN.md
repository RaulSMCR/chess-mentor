# CM-502 - Plan ejecutable de modos e instructor

Estado inicial: `pending`

## Objetivo

Fijar la arquitectura y dividir en tarjetas verificables el acceso por shortcut,
los modos Practica e Instructor, la discusion situada en el tablero y la
creacion, carga o generacion de ejercicios con procedencia.

## Resultado observable

Existe una ADR aceptada y un backlog ordenado que define una entrada comun por
shortcut, separa las reglas de Practica e Instructor y conserva un camino
auditable desde una sesion de instructor hasta un ejercicio revisado.

## Prerrequisitos

- `CM-501` en `complete`.
- Aprobacion del usuario para adoptar la recomendacion de modos y acceso movil,
  recibida el 2026-08-19.

## Decisiones congeladas

- D-014: solo Next.js puede exponerse al dispositivo; servicios internos
  permanecen en loopback.
- D-017: la ausencia de IA no rompe la practica determinista.
- D-019: fuente, inferencia, motor y sintesis IA permanecen distinguidos.
- D-021: originales y registros sincronizables conservan autoridad explicita.
- D-023: Android, HTTPS y cuentas externas requieren evidencia humana.
- D-024: los cambios de alcance y topologia se documentan mediante ADR.
- D-025 a D-029: se preservan aceptacion, pistas, scheduler, dificultad y
  persistencia del entrenador existente.

## Archivos permitidos

- `docs/adr/0001-instructor-workspaces-and-mobile-entry.md`.
- `docs/ARCHITECTURE.md`.
- `docs/DECISIONS.md`.
- `docs/ROADMAP.md`.
- `PLAN-EJECUTABLE.md`.
- `tasks/PHASE-6-INSTRUCTOR-PLAN.md`.
- `tasks/PHASE-6-INSTRUCTOR.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/**`, `tests/**`, `fixtures/**`, `worker/**` y `prisma/**`.
- `package.json`, lockfile, variables de entorno, credenciales, libros o datos
  reales.

## Fuera de alcance

- Implementar componentes, rutas, persistencia o proveedores.
- Configurar Tailscale, Firewall, Vercel, Ollama o un dispositivo Android.
- Importar corpus o ejercicios reales.

## Pasos exactos

1. Registrar una ADR con opciones, decision, compatibilidad y gates de seguridad.
2. Definir los contratos objetivo sin modificar aun el codigo de dominio.
3. Crear tarjetas pequenas y ordenadas para dominio, fuentes, orquestacion, UI,
   persistencia y gates.
4. Actualizar decisiones, arquitectura, roadmap, plan y estado sin declarar
   funcionalidades no implementadas.

## Verificacion focal

```powershell
pnpm.cmd exec prettier --check docs/adr/0001-instructor-workspaces-and-mobile-entry.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/ROADMAP.md PLAN-EJECUTABLE.md tasks/PHASE-6-INSTRUCTOR-PLAN.md tasks/PHASE-6-INSTRUCTOR.md tasks/STATUS.md
```

Resultado esperado:

- Los documentos tienen formato valido y las dependencias de tarjetas forman
  una secuencia sin ciclos.

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: esta tarjeta solo fija plan y contratos; no modifica el producto.

## Commit local de cierre

- Mensaje: `CM-502: plan instructor workspaces`.
- Stage permitido: `docs/adr/0001-instructor-workspaces-and-mobile-entry.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/ROADMAP.md PLAN-EJECUTABLE.md tasks/PHASE-6-INSTRUCTOR-PLAN.md tasks/PHASE-6-INSTRUCTOR.md tasks/STATUS.md`.
- `git diff --cached --check` esperado: exit 0.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- La topologia exige exponer Ollama, PostgreSQL, worker u originales en LAN.
- Se necesita decidir por el usuario si el shortcut publico o privado sera la
  instalacion personal canonica.
- El plan atribuye una postura a un autor sin cita y revision.

## Rollback

Revertir unicamente el commit de CM-502 y retirar la ADR y las tarjetas nuevas;
no revertir contratos ni implementaciones de CM-500/CM-501.

## Handoff

Usar `docs/HANDOFF.md`.
