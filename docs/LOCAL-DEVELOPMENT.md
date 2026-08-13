# Desarrollo local en Windows

## 1. Estado auditado el 12 de agosto de 2026

| Componente        | Estado                                               | Acción                                      |
| ----------------- | ---------------------------------------------------- | ------------------------------------------- |
| Workspace         | Solo `debug.log` al iniciar; OneDrive/ReparsePoint   | Preservarlo; evitar datos pesados/locks     |
| Git               | `2.55.0.windows.3`                                   | Disponible                                  |
| Node              | `24.15.0`                                            | Versión fijada                              |
| npm               | `11.12.1` vía `npm.cmd`                              | No usar shim `.ps1`                         |
| pnpm              | `10.33.0` vía `pnpm.cmd`                             | Gestor fijado                               |
| PowerShell        | ExecutionPolicy bloquea scripts npm/pnpm `.ps1`      | Usar comandos `.cmd`                        |
| Docker            | No encontrado                                        | No bloquea Fase 0/1; prerequisito futuro    |
| PostgreSQL nativo | Servicio 16 activo en 5432                           | No tocar/reutilizar; futuro Docker usa 5433 |
| pgvector          | No detectado                                         | Diferido                                    |
| Ollama            | `0.32.9`, API disponible en loopback                 | No bloquea Fase 1                           |
| Modelos Ollama    | `mistral-nemo:12b`, `deepseek-r1:32b`                | Ninguno estaba cargado; no descargar otros  |
| Stockfish         | No encontrado                                        | Fase 2 usará WASM empaquetado               |
| Obsidian          | `1.12.7` en `C:\Program Files\Obsidian\Obsidian.exe` | Vault no verificado; diferido               |
| Edge              | `151.0.4129.78`                                      | Canal Playwright local                      |
| IPv4 observada    | `192.168.1.64`                                       | Es dinámica; redescubrir antes de LAN       |

El plan original pedía Node 20.x, ya EOL. La referencia oficial es [Node.js Releases](https://nodejs.org/en/about/previous-releases). Next.js exige Node 20.9 como mínimo, no obliga a usar una rama EOL: [Next.js Installation](https://nextjs.org/docs/app/getting-started/installation).

La auditoría observó que el PostgreSQL preexistente escucha en `0.0.0.0:5432`. Su Firewall, datos y configuración pertenecen al entorno previo y quedan estrictamente fuera de alcance: no detenerlo, migrarlo, abrirlo ni reutilizarlo. Antes de Fase 3.5, Chess Mentor debe crear una instancia aislada en loopback/puerto 5433.

## 2. Comandos permitidos

Después de `CM-001`:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run dev
pnpm.cmd run dev:lan
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test:unit
pnpm.cmd run test:e2e
pnpm.cmd run build
pnpm.cmd run verify
pnpm.cmd run verify:phase1
```

`dev`/`start` fijan `127.0.0.1`; únicamente `dev:lan` fija `0.0.0.0`. `test:e2e` usa un build ya existente y levanta Next production en loopback/puerto 3100 con Edge; ejecutar `pnpm.cmd run build` antes si no se acaba de hacer. `verify:phase1` crea ese build con `verify` y luego corre E2E una vez. No ejecutar `playwright install` en estas fases.

`next-env.d.ts` es generado e ignorado: `next dev`, `next typegen` y `next build` pueden cambiar sus referencias entre `.next/dev/types` y `.next/types`. Nunca se stagea ni se reescribe a mano. `typecheck` ejecuta primero `next typegen`.

Dentro de una tarjeta no ejecutar `pnpm.cmd run format`, porque escribe globalmente. Usar `pnpm.cmd exec prettier --write <rutas permitidas explícitas>` y luego el `format:check` global.

Primer bootstrap solamente:

```powershell
pnpm.cmd install
```

No usar `pnpm install --frozen-lockfile` antes de que exista el primer `pnpm-lock.yaml`.

## 3. Diagnóstico de versiones

```powershell
git --version
node --version
pnpm.cmd --version
npm.cmd --version
```

El implementador debe fallar temprano si Node/pnpm no coinciden, en vez de actualizar paquetes silenciosamente.

## 4. Recuperación de EPERM/EACCES

OneDrive, antivirus y el sandbox pueden bloquear caches. El comando que revela el error es diagnóstico; después hay como máximo dos remediaciones distintas:

1. Si el error menciona el cache global npm, usar caches temporales solo para esa ejecución:

```powershell
$env:npm_config_cache = Join-Path $env:TEMP 'chess-mentor-npm-cache'
$env:COREPACK_HOME = Join-Path $env:TEMP 'chess-mentor-corepack'
pnpm.cmd install --store-dir (Join-Path $env:TEMP 'chess-mentor-pnpm-store') --cache-dir (Join-Path $env:TEMP 'chess-mentor-pnpm-cache')
```

2. Solo si hay evidencia de un lock, detener el servidor/proceso propio identificado y repetir el comando focal una vez.
3. Si ambas remediaciones aplicables fallan, reportar ruta exacta y pedir aprobación; no cambiar ACL, antivirus, ExecutionPolicy ni borrar caches globales.

No mover el repositorio ni desactivar OneDrive dentro de una tarjeta. Si los watchers se vuelven inestables, crear una ADR para migrar el repo a una ruta local no sincronizada.

## 5. Desarrollo LAN

El script debe ser exactamente equivalente a:

```json
"dev:lan": "next dev --hostname 0.0.0.0 --port 3000"
```

Antes de iniciar, confirmar que 3000 está libre. Si hay listener, identificarlo y detenerse; no matar un proceso ajeno. Ejecutar el servidor en una segunda terminal visible y supervisada, conservarla abierta durante el smoke y finalizar con `Ctrl+C`. Un agente puede usar su mecanismo de proceso supervisado solo si conserva el PID y puede terminar todo el árbol propio; no usar `Start-Process` sin plan de teardown.

Terminal 1:

```powershell
pnpm.cmd run dev:lan
```

Terminal 2:

```powershell
$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) { throw 'Chess Mentor no escucha en 3000' }
if (-not (Test-NetConnection 127.0.0.1 -Port 3000 -InformationLevel Quiet)) { throw 'Puerto 3000 no accesible' }
$response = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000
if ($response.Content -notmatch '<h1[^>]*>Chess Mentor</h1>') { throw 'Respuesta HTTP no es Chess Mentor' }
```

Registrar el PID del listener y comprobar que pertenece al proceso Next iniciado en Terminal 1. Next no puede elegir silenciosamente 3001: el script fija 3000 y debe fallar si está ocupado.

Descubrir IPv4 activa:

```powershell
Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -ne $null } |
  Select-Object -ExpandProperty IPv4Address |
  Select-Object IPAddress
```

En Android se abre `http://<IPv4-del-PC>:3000`. `localhost` en Android es el teléfono; `0.0.0.0` no es una URL.

LocalStorage está particionado por origen/perfil. `http://localhost:3000`, `http://127.0.0.1:3000` y `http://<IPv4>:3000` tienen colecciones distintas; usar una URL consistente dentro de cada smoke y no interpretar el cambio de origen como pérdida de datos.

### Firewall

Primero inspeccionar:

```powershell
Get-NetConnectionProfile
```

El agente no crea reglas automáticamente. Si Windows bloquea y el usuario aprueba, un administrador puede crear una regla temporal limitada al perfil Private y al puerto 3000. Debe registrar nombre exacto y procedimiento de eliminación. Nunca abrir Ollama, PostgreSQL o el worker.

El worker de Fase 1.5 se inicia en una terminal separada con
`pnpm.cmd run worker:start`. Escucha únicamente en `127.0.0.1:3210`; el
navegador no debe llamarlo directamente. Next expone sus comprobaciones por
`http://127.0.0.1:3000/api/health` y `/api/diagnostics`.

## 6. Puertos reservados

| Puerto | Servicio                       | Bind permitido                                     |
| -----: | ------------------------------ | -------------------------------------------------- |
|   3000 | Next local                     | `127.0.0.1` normalmente; `0.0.0.0` solo prueba LAN |
|   3210 | Worker Fase 1.5                | `127.0.0.1` únicamente                             |
|   5432 | PostgreSQL preexistente        | Fuera de alcance; no tocar                         |
|   5433 | PostgreSQL futuro Chess Mentor | `127.0.0.1`                                        |
|  11434 | Ollama                         | `127.0.0.1`                                        |

## 7. Convenciones Git/archivos

- `.gitattributes` fuerza LF en código/config y CRLF solo para PowerShell.
- No crear symlinks.
- Evitar rutas profundas.
- `data`, `cache`, `models`, originals y outputs quedan fuera de Git.
- Antes y después de cada tarjeta: `git status --short` y `git diff --check`.
