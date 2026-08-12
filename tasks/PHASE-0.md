# Tarjetas Fase 0B — baseline reproducible

Ejecutar una tarjeta por turno. Antes de cada una seguir `AGENTS.md` y actualizar `tasks/STATUS.md`.

---

# CM-001 — Inicializar Git y crear baseline manual de Next.js

## Objetivo

Crear una aplicación Next.js mínima y reproducible en la raíz, con manifest exacto y lockfile, sin implementar ajedrez.

## Resultado observable

`pnpm.cmd run dev` muestra heading `Chess Mentor` y texto de etapa `baseline`; `pnpm.cmd run build` termina en 0 sin exponer el servidor fuera de loopback.

## Prerrequisitos

- `CM-000` complete.
- El inventario coincide exactamente con `docs/BASELINE-INVENTORY.md`; `debug.log` es preexistente, se preserva y permanece ignorado.
- Node `24.15.0` y pnpm `10.33.0`.
- Autorización de red si el sandbox la solicita para `pnpm.cmd install`.

## Decisiones

D-001, D-002, D-003 y D-004.

## Archivos permitidos

- `.nvmrc`, `.npmrc`, `package.json`, `pnpm-lock.yaml`
- `.git/` solo mediante `git init` y commits no destructivos
- `next.config.ts`, `tsconfig.json`; `next-env.d.ts` es output generado/ignorado, nunca staged
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `tasks/STATUS.md`

## Archivos prohibidos

- Todos los demás, en especial documentos ya preparados y fixtures.

## Fuera de alcance

- Generadores interactivos, Tailwind, tablero, APIs, DB, PWA y tests.

## Pasos exactos

1. Confirmar versiones con `node --version` y `pnpm.cmd --version`; detener si difieren.
2. Ejecutar `Get-ChildItem -Force` y cotejar `docs/BASELINE-INVENTORY.md`. Confirmar identidad Git antes de editar. Resolver bootstrap sin repetir commits:
   - sin `.git`: `git init`, verificar ignores, cambiar CM-001 a `in_progress`, stagear inventario y crear `docs: prepare executable chess mentor plan`;
   - `.git` sin `HEAD`: verificar que no hay remotos/hooks/config inesperados, comprobar el índice y completar ese commit;
   - `HEAD` existente cuyo subject es exactamente `docs: prepare executable chess mentor plan` y cuyo árbol coincide con el inventario: reutilizarlo como SHA inicial y continuar, sin `git add`/recommit;
   - `HEAD` con otro árbol/subject o cambios no atribuibles: detenerse.
     Siempre verificar `git check-ignore debug.log next-env.d.ts` y que ninguno figure en `git diff --cached --name-only`. Si el commit falla, detenerse; no cambiar config global ni borrar `.git`. Exigir worktree limpio salvo outputs ignorados antes de crear la app.
3. No ejecutar `create-next-app .`.
4. Crear `.nvmrc` con `24.15.0`.
5. Crear `.npmrc` con `engine-strict=true`, `save-exact=true` y `strict-peer-dependencies=true`.
6. Crear `package.json` exactamente con estos nombres/versiones (JSON válido, sin comentarios):

```json
{
  "name": "chess-mentor",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=24.15.0 <25"
  },
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "next dev --hostname 127.0.0.1 --port 3000",
    "dev:lan": "next dev --hostname 0.0.0.0 --port 3000",
    "build": "next build",
    "start": "next start --hostname 127.0.0.1 --port 3000",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "pnpm run test:e2e:only",
    "test:e2e:only": "playwright test",
    "verify": "pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build",
    "verify:phase1": "pnpm run verify && pnpm run test:e2e"
  },
  "dependencies": {
    "@echecs/pgn": "5.0.0",
    "@echecs/position": "4.0.0",
    "@echecs/san": "3.2.0",
    "chess.js": "1.4.0",
    "next": "16.3.0",
    "react": "19.2.8",
    "react-chessboard": "5.12.0",
    "react-dom": "19.2.8",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@testing-library/dom": "10.4.1",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.4",
    "@types/node": "24.13.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "eslint": "9.39.5",
    "eslint-config-next": "16.3.0",
    "jsdom": "30.0.1",
    "prettier": "3.9.6",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["unrs-resolver"]
  }
}
```

7. Crear `tsconfig.json` con estos contratos exactos: `target: "ES2022"`; libs `dom`, `dom.iterable`, `esnext`; `strict: true`; `noEmit: true`; `skipLibCheck: true`; `esModuleInterop: true`; `isolatedModules: true`; `incremental: true`; `module: "esnext"`; `moduleResolution: "bundler"`; `jsx: "react-jsx"`; plugin Next; alias `@/* -> ./src/*`. Incluir configs TypeScript de raíz, `src/**/*.ts[x]`, `tests/**/*.ts[x]`, `.next/types/**/*.ts` y `.next/dev/types/**/*.ts`; excluir `node_modules`. No activar `allowJs`.
8. Crear `next.config.ts` vacío tipado. No crear/escribir/stagear `next-env.d.ts`: `next typegen`/build/dev lo generan y `.gitignore` lo excluye.
9. Crear layout, página y CSS mínimos, sin imágenes/font remotos. Heading estable exacto `<h1>Chess Mentor</h1>` y texto separado `baseline`.
10. Ejecutar `pnpm.cmd install` una sola vez para generar lockfile. La allowlist debe evitar el prompt `pnpm approve-builds`; no ampliarla si aparece otro paquete. Si informa que `unrs-resolver` fue ignorado pese a la allowlist, ejecutar una sola vez `pnpm.cmd rebuild unrs-resolver` y registrar el resultado; no aprobar otros scripts.
11. Revisar warnings de peer deps; con strict peers no debe quedar ninguno sin explicar.

`tsconfig.json` validado:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "*.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    "tests/**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

## Verificación focal

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run typecheck
pnpm.cmd run build
```

Esperado: todos exit 0; `pnpm-lock.yaml` existe; no se descargó navegador/modelo/engine.

## Condiciones de parada

- Peer conflict.
- Versiones de Node/pnpm distintas.
- Instalación quiere modificar globales o pide `--force`.
- EPERM persiste después del playbook de `docs/LOCAL-DEVELOPMENT.md`.

## Rollback

Revertir únicamente los archivos de app creados en esta tarjeta. `package.json` y lockfile se revierten juntos. El commit de preparación CM-000 no se elimina; no usar reset ni borrar `.git`.

## Commit local de cierre

Stage solo archivos permitidos y `tasks/STATUS.md`; crear `CM-001: initialize Next baseline`. El SHA del commit de preparación sigue siendo SHA inicial y este nuevo commit es SHA final.

---

# CM-002 — Calidad y unit test harness

## Objetivo

Configurar Prettier, ESLint flat config, Vitest/jsdom y un test smoke.

## Resultado observable

Format, lint, typecheck y test unitario pasan con scripts estables.

## Prerrequisitos

- `CM-001` complete.

## Decisiones

D-003, D-004 y D-012.

## Archivos permitidos

- `eslint.config.mjs`, `.prettierignore`, `vitest.config.ts`
- `src/test/setup.ts`, `src/app/page.test.tsx`
- Si una herramienta demuestra un error de CM-001: `.nvmrc`, `.npmrc`, `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/page.tsx` o `src/app/globals.css`, únicamente la ruta causante. `next-env.d.ts` sigue generado/ignorado.
- `tasks/STATUS.md`

## Fuera de alcance

- Playwright, ajedrez, snapshot visual o cambiar reglas para silenciar errores.

## Pasos exactos

1. Crear flat config mediante `defineConfig` y `globalIgnores` de `eslint/config`, extendiendo los arrays instalados de `eslint-config-next/core-web-vitals` y `eslint-config-next/typescript`. Ignorar `.next/**`, `out/**`, `build/**`, `coverage/**`, `playwright-report/**`, `test-results/**`, `next-env.d.ts` y caches locales listados en `.gitignore`; confirmar en `node_modules` si un ejemplo online difiere.
2. Ignorar solo outputs generados (`.next`, coverage, reports); no ignorar `src`, tests o configs.
3. Crear `.prettierignore` para outputs, `next-env.d.ts`, originales/datos y lockfile. No ignorar código/docs.
4. Configurar Vitest con `environment: "jsdom"`, setup de `@testing-library/jest-dom/vitest`, globals desactivados y alias `@`.
5. Crear un test que renderice la página y encuentre por rol el heading nivel 1 con nombre exacto `Chess Mentor`; el texto `baseline` se prueba aparte si aporta valor.
6. Corregir formato únicamente en archivos con parser Prettier: `pnpm.cmd exec prettier --write eslint.config.mjs vitest.config.ts src/test/setup.ts src/app/page.test.tsx`; revisar el diff y la `.prettierignore` manualmente. No ejecutar `pnpm.cmd run format`.

Configs validadas:

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".corepack/**",
    ".npm-cache/**",
    ".pnpm-cache/**",
    ".pnpm-store/**",
    "next-env.d.ts",
  ]),
]);
```

```ts
// vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

`src/test/setup.ts` incluye explícitamente, con globals de Vitest desactivados:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

## Verificación focal

```powershell
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test:unit
```

Esperado: exit 0, un test real aprobado, cero warnings ESLint.

## Condiciones de parada

- Necesidad de `eslint-disable`, `@ts-ignore` o bajar strictness.
- El test solo verifica `true === true` o detalles internos.

## Rollback

Revertir configs/tests de esta tarjeta; no cambiar versiones sin ADR.

## Commit local de cierre

Stage solo archivos permitidos modificados y `tasks/STATUS.md`; crear `CM-002: add quality harness`.

---

# CM-003 — Playwright con Edge local

## Objetivo

Configurar un smoke E2E sin descargar Chromium.

## Resultado observable

Playwright inicia Next en puerto de prueba, abre Microsoft Edge instalado y verifica el heading baseline.

## Prerrequisitos

- `CM-002` complete.
- Edge presente en las rutas auditadas.

## Decisiones

D-012 y D-023.

## Archivos permitidos

- `playwright.config.ts`
- `tests/e2e/smoke.spec.ts`
- `tasks/STATUS.md`

## Pasos exactos

1. Configurar `testDir: "./tests/e2e"`, `fullyParallel: false`, `workers: 1`, `forbidOnly` en CI, retries 2 solo en CI y reporter `line`. La serialización hace el gate más determinista en Windows/OneDrive; cada test aun usa context/localStorage aislados.
2. En `use`, fijar base URL `http://127.0.0.1:3100`, `channel: "msedge"`, `headless: true` y trace `retain-on-failure`.
3. Configurar `webServer` exactamente sobre producción: comando `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`, URL 127.0.0.1:3100, `reuseExistingServer: false` y timeout 120 segundos. `test:e2e` asume un build existente; CM-003/004 ejecutan build antes y `verify:phase1` lo crea mediante `verify`.
4. No ejecutar `playwright install`.
5. Test por rol `heading`, nivel 1 y nombre exacto `Chess Mentor`, sin sleep fijo.
6. Confirmar que al terminar no queda proceso Next iniciado por el test ni listener en 3100.

Config validada que debe copiarse salvo cambio demostrado de la API fijada:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
```

## Verificación focal

```powershell
pnpm.cmd run build
pnpm.cmd run test:e2e
```

Esperado: 1 test PASS en Edge; `Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue` no muestra un proceso huérfano iniciado por la prueba.

En un sandbox Windows gestionado, Playwright puede completar navegador/locator y quedarse esperando en `Terminating the WebServer` porque el sandbox bloquea `taskkill`. Un output parcial no cuenta como PASS: comprobar que no quedó listener y volver a ejecutar el gate fuera del sandbox únicamente mediante la aprobación normal del entorno. No matar procesos por nombre ni IDs no verificados.

## Condiciones de parada

- Edge no encontrado.
- Playwright solicita descarga.
- Puerto 3100 pertenece a un proceso ajeno.

## Rollback

Revertir únicamente config/test E2E; terminar solo el PID que se demuestre iniciado por esta tarjeta.

## Commit local de cierre

Stage solo archivos permitidos y `tasks/STATUS.md`; crear `CM-003: add Edge smoke test`.

---

# CM-004 — Gate del baseline

## Objetivo

Demostrar que el worktree comprometido con lockfile tiene un baseline verde antes del dominio.

## Resultado observable

Todos los checks globales pasan y el status queda listo para `CM-101`.

## Prerrequisitos

- `CM-003` complete.

## Archivos permitidos

- `tasks/STATUS.md` únicamente.

Esta tarjeta es solo un gate: no corrige código/configuración.

## Pasos exactos

1. Ejecutar instalación frozen.
2. Ejecutar `verify` (incluye build) y después E2E, sin rebuild duplicado.
3. Revisar que no haya secretos/artefactos tracked.
4. Registrar versiones, comandos y exit codes en handoff.
5. Marcar `CM-004 complete` solo con todo verde. Si un check falla por un bug de CM-001/2/3, cambiar atómicamente `CM-004 → failed` y la tarjeta causante → `in_progress`, entregar reproducción y detenerse. Tras la reparación, la causante deja `CM-004 → pending` para un turno nuevo.

## Verificación focal/global

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run verify
pnpm.cmd run test:e2e:only
git diff --check
git status --short
```

## Condiciones de parada

- Cualquier exit no cero.
- Lockfile cambia durante frozen install.
- Archivos `.env`, datos, reports o caches aparecen staged/tracked.

## Rollback

No hacer cambios amplios. Si un check revela un problema, volver la tarjeta responsable a `in_progress` y corregirla de forma focal.

## Commit local de cierre

Si todo pasa, stage solo `tasks/STATUS.md` y crear `CM-004: verify reproducible baseline`.
