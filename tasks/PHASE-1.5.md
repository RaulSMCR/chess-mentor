# Fase 1.5 — Worker local y seguridad

Esta fase empieza después de `CM-113`. No introduce Stockfish, Ollama,
PostgreSQL, Supabase ni datos reales. Cada tarjeta es independiente y termina
con su propio commit local.

El worker se escribe en TypeScript y se compila a `.worker-dist/` con
`worker/tsconfig.json`; no se añade un runtime TypeScript ni dependencias de
ejecución nuevas.

## Topología congelada

- Worker Node/TypeScript en `127.0.0.1:3210`.
- Next.js es el único cliente del worker.
- Android y otros navegadores nunca reciben la URL ni el token del worker.
- `GET /health` del worker devuelve solo salud mínima sin token.
- Todas las demás rutas requieren `x-chess-mentor-worker-token`.
- El diagnóstico nunca devuelve tokens, rutas absolutas, variables de entorno,
  argumentos de proceso ni contenido de usuario.
- Si el worker no está disponible, tablero y PGN siguen funcionando y la UI
  informa una capacidad degradada.

---

# CM-114 — Contrato del worker y fake determinista

Estado inicial: `pending`

## Objetivo

Definir el protocolo tipado que compartirán el worker y el servidor Next sin
abrir todavía un puerto real.

## Resultado observable

Los tests validan envelopes de éxito/error, rutas, estados HTTP, capacidades y
ausencia de campos sensibles sin usar red, procesos ni servicios externos.

## Prerrequisitos

- `CM-113` complete.
- Node 24.15.x y dependencias actuales.

## Decisiones congeladas

- D-014, D-015, D-022 y D-023.
- Host `127.0.0.1`, puerto `3210`.
- Header exacto `x-chess-mentor-worker-token`.
- Health mínimo sin token; diagnostics autenticado.

## Archivos permitidos

- `worker/protocol.ts`.
- `worker/protocol.test.ts`.
- `tsconfig.json` solo para incluir `worker/**/*.ts` en typecheck.
- `vitest.config.ts` solo para incluir `worker/**/*.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/app/**`, `src/features/**`, `src/domain/**`.
- `worker/server.ts`, scripts de arranque y configuración de red.
- Cualquier secreto, token persistente o archivo `.env*`.

## Contrato exacto

```ts
type WorkerHealth = {
  ok: true;
  service: "chess-mentor-worker";
  version: string;
};

type WorkerDiagnostics = WorkerHealth & {
  capabilities: readonly string[];
};

type WorkerError = {
  ok: false;
  error: {
    code:
      | "UNAUTHORIZED"
      | "NOT_FOUND"
      | "METHOD_NOT_ALLOWED"
      | "INVALID_REQUEST"
      | "WORKER_UNAVAILABLE"
      | "INTERNAL_ERROR";
    message: string;
  };
};
```

Los envelopes son JSON, no contienen `undefined`, stack traces ni datos
arbitrarios. Las capacidades son identificadores estables y no rutas.

## Verificación focal

```powershell
pnpm.cmd exec vitest run worker/protocol.test.ts
```

Debe probar health, diagnostics, error 401, error 404/405, parseo estricto y
rechazo de campos sensibles.

## Commit local de cierre

- Mensaje: `CM-114: define worker protocol`
- Stage permitido: `worker/protocol.ts worker/protocol.test.ts tsconfig.json vitest.config.ts tasks/STATUS.md`

## Condiciones de parada

- Si el protocolo exige una ruta pública o un secreto en el navegador.
- Si se necesita una dependencia nueva no prevista.

## Rollback

Revertir el commit de CM-114 y retirar únicamente sus dos archivos de `worker/`.

---

# CM-115 — Runtime loopback con token y capabilities

Estado inicial: `pending`

## Objetivo

Implementar el servidor HTTP mínimo del worker, enlazado exclusivamente a
loopback y con autenticación constante para rutas no públicas.

## Resultado observable

El worker responde health sin token, rechaza diagnostics sin token, acepta
diagnostics con token, rechaza rutas/métodos desconocidos y nunca escucha en
`0.0.0.0`.

## Prerrequisitos

- `CM-114` complete.
- No detener ni modificar ningún servicio existente en 5432 u otros puertos.

## Archivos permitidos

- `worker/server.ts`.
- `worker/server.test.ts`.
- `worker/token.ts`.
- `worker/tsconfig.json`.
- `package.json` solo para los scripts `worker:build` y `worker:start`.
- `.gitignore` únicamente para `.runtime/`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- `src/app/**` y componentes cliente.
- Bind a `0.0.0.0`, LAN, UPnP o reglas de Firewall.
- Stockfish, Ollama, PostgreSQL, Supabase o archivos de usuario.

## Pasos exactos

1. Crear `createWorkerServer({ host, port, token, version, capabilities })`
   con inyección de puerto para tests.
2. Fijar por defecto host `127.0.0.1` y puerto `3210`; fallar si se intenta
   iniciar con otro host.
3. Leer el token desde `CHESS_MENTOR_WORKER_TOKEN`; si falta, generar 32 bytes
   aleatorios, escribir únicamente el hex en `.runtime/worker-token` y nunca
   incluirlo en HTTP, logs, diagnostics o errores. Crear `.runtime` si falta.
4. Comparar tokens con longitud constante y no incluirlos en errores.
5. Exponer `GET /health` sin token y `GET /diagnostics` con token.
6. Responder envelopes CM-114 y cerrar correctamente el servidor en tests.
7. Añadir `worker/tsconfig.json` con `module: NodeNext`, `outDir:
.worker-dist`, y scripts `worker:build`/`worker:start` que ejecuten el JS
   compilado. No usar `Start-Process` en scripts ni dejar procesos huérfanos.

## Verificación focal

```powershell
pnpm.cmd exec vitest run worker/server.test.ts
```

El test debe comprobar respuesta HTTP real sobre un puerto efímero, listener
`127.0.0.1`, 401 sin token, 200 autenticado y teardown sin listener.

## Verificación global

```powershell
pnpm.cmd run verify
```

## Commit local de cierre

- Mensaje: `CM-115: add loopback worker runtime`
- Stage permitido: `worker/server.ts worker/server.test.ts worker/token.ts worker/tsconfig.json package.json .gitignore tasks/STATUS.md`

## Condiciones de parada

- Cualquier secreto aparece en una respuesta, log o diagnóstico.
- El proceso escucha fuera de `127.0.0.1`.
- El teardown deja un listener o requiere matar procesos no identificados.

## Rollback

Detener el PID propio, confirmar puerto 3210 libre y revertir el commit de
CM-115. No tocar otros procesos Node.

---

# CM-116 — Cliente server-only y endpoints Next

Estado inicial: `pending`

## Objetivo

Crear el puente servidor-a-servidor de Next al worker sin exponer token ni
importar código de red en Client Components.

## Resultado observable

`/api/health` y `/api/diagnostics` devuelven una respuesta segura cuando el
worker está activo y un error tipado `WORKER_UNAVAILABLE` con HTTP 503 cuando
está apagado; la pantalla del tablero no se rompe.

## Prerrequisitos

- `CM-115` complete.
- Worker ejecutable en loopback.

## Archivos permitidos

- `src/server/worker/client.ts`.
- `src/server/worker/client.test.ts`.
- `src/app/api/health/route.ts`.
- `src/app/api/diagnostics/route.ts`.
- `src/app/api/health/route.test.ts`.
- `src/app/api/diagnostics/route.test.ts`.
- `tasks/STATUS.md`.

El cliente server-only no puede importar React ni ser importado desde un archivo
con `"use client"`.

## Archivos prohibidos

- `src/features/**` y cualquier Client Component.
- Variables públicas `NEXT_PUBLIC_*` para tokens.
- Vercel, Supabase, middleware de autenticación de usuarios o persistencia.

## Pasos exactos

1. Leer host, puerto y token solo en el runtime servidor.
2. Usar timeout abortable y mapear timeout/conexión rechazada a
   `WORKER_UNAVAILABLE`.
3. Mantener `/api/health` sin secretos y `/api/diagnostics` sin rutas, tokens
   ni variables de entorno.
4. Mantener status HTTP 200 para salud disponible, 503 para worker ausente y
   500 solo para error interno no clasificable.
5. Añadir una prueba estática que confirme que ningún Client Component importa
   `src/server/worker/client.ts`.

## Verificación focal

```powershell
pnpm.cmd exec vitest run src/server/worker
```

## Verificación global

```powershell
pnpm.cmd run verify
pnpm.cmd run test:e2e:only
```

## Commit local de cierre

- Mensaje: `CM-116: bridge Next to local worker`
- Stage permitido: `src/server/worker/client.ts src/server/worker/client.test.ts src/app/api/health/route.ts src/app/api/health/route.test.ts src/app/api/diagnostics/route.ts src/app/api/diagnostics/route.test.ts tasks/STATUS.md`

## Condiciones de parada

- Token o URL del worker llega al HTML, navegador o Android.
- El worker ausente rompe tablero, PGN o guardado local.
- Se necesita modificar un Client Component para ocultar el fallo.

## Rollback

Revertir únicamente el commit de CM-116 y verificar que las rutas ya no
existan; conservar el runtime de CM-115.

---

# CM-117 — Gate de seguridad y degradación de Fase 1.5

Estado inicial: `pending`

## Objetivo

Validar el worker y el puente Next en el entorno real de desarrollo sin abrir
servicios internos a LAN.

## Resultado observable

Existe evidencia reproducible de health, autenticación, diagnostics seguro,
worker ausente y listener loopback; la UI local sigue utilizable sin worker.

## Prerrequisitos

- `CM-116` complete.
- Usuario disponible solo si se solicita una prueba manual de Firewall.

## Archivos permitidos

- `tasks/STATUS.md`.
- `docs/evidence/phase1.5-<date>.md`.
- `docs/LOCAL-DEVELOPMENT.md` y `docs/MOBILE-ACCESS.md` solo para actualizar
  comandos y topología observada.

## Pasos exactos

1. Registrar `IMPLEMENTATION_SHA` y ejecutar `pnpm.cmd run verify`.
2. Iniciar worker propio con PID conocido y Next local con host 127.0.0.1.
3. Comprobar health sin token, diagnostics sin token, diagnostics con token y
   respuesta 503 con worker detenido.
4. Confirmar que `Get-NetTCPConnection` muestra 127.0.0.1:3210 y no
   0.0.0.0:3210.
5. Detener procesos propios y confirmar ambos listeners libres.
6. Registrar cualquier prueba manual como `NOT RUN` si requiere Firewall o
   dispositivo; no inferir PASS.

## Verificación focal

```powershell
pnpm.cmd run verify
pnpm.cmd exec vitest run worker src/app/api src/server/worker
```

## Commit local de cierre

- Mensaje: `CM-117: verify worker security gate`
- Stage permitido: `tasks/STATUS.md docs/evidence/phase1.5-<date>.md docs/LOCAL-DEVELOPMENT.md docs/MOBILE-ACCESS.md`

## Condiciones de parada

- Listener fuera de loopback.
- Falta token o datos sensibles en diagnostics.
- Procesos no identificados ocupan el puerto 3210.
- Cualquier cambio de producto requerido para corregir un fallo.

## Rollback

Detener procesos propios y revertir solo la evidencia/documentación de CM-117.

---

## Orden de ejecución

`CM-114 → CM-115 → CM-116 → CM-117`

No iniciar Fase 2 ni Supabase hasta completar CM-117.
