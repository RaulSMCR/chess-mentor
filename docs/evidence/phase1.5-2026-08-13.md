# Evidencia Fase 1.5 — 2026-08-13

## Snapshot

- `IMPLEMENTATION_SHA`: `1836aed55fafa4f9dae5ac9f1ba9a0c9a49ad4d3`
- Fecha UTC: `2026-08-13T20:00:40Z`
- Datos reales, libros, tokens y credenciales: no usados.

## Verificación automatizada

| Comando                                                         | Resultado                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm.cmd run verify`                                           | PASS — formato, lint, typecheck, build y 26 suites/106 tests |
| `pnpm.cmd exec vitest run worker src/app/api src/server/worker` | PASS — 5 archivos/19 tests                                   |
| `pnpm.cmd run worker:build`                                     | PASS — compilación TypeScript del worker                     |

## Gate operativo loopback

- Puerto 3000 estaba libre antes de iniciar.
- Puerto 3210 estaba libre antes de iniciar.
- Worker propio: listener `127.0.0.1:3210`.
- Next propio: listener `127.0.0.1:3000`.
- Worker `GET /health`: HTTP `200` sin token.
- Worker `GET /diagnostics` sin token: HTTP `401`.
- Worker `GET /diagnostics` con token: HTTP `200`.
- Next `GET /api/health` con worker activo: HTTP `200`.
- Next `GET /api/diagnostics` con worker activo: HTTP `200`.
- Las respuestas Next no contenían el token ni rutas absolutas.

## Degradación

- Se detuvo únicamente el worker propio.
- Next `/api/health` sin worker: HTTP `503`.
- Next `/api/diagnostics` sin worker: HTTP `503`.
- La interfaz y el servidor Next permanecieron disponibles durante esa prueba.

## Teardown

- Se detuvieron únicamente los procesos propios del worker y Next.
- `127.0.0.1:3000` quedó libre.
- `127.0.0.1:3210` quedó libre.
- No se cambió Firewall ni se abrió ningún servicio interno a LAN.

## Pruebas manuales

- Firewall: `NOT RUN` — no fue necesario solicitar una regla.
- Android: `NOT RUN` — el gate de esta tarjeta es local; la validación pública
  Android ya está registrada en `docs/evidence/phase1-2026-08-13.md`.
