# Instrucciones para agentes — Chess Mentor

## 1. Orden de autoridad

Aplicar, en este orden:

1. La petición actual del usuario.
2. Este `AGENTS.md`.
3. `docs/DECISIONS.md`.
4. La tarjeta activa en `tasks/`.
5. `PLAN-EJECUTABLE.md` y el resto de `docs/`.
6. El plan original, solo como referencia de producto.

Una tarjeta no autoriza a cambiar una decisión congelada. Si una decisión impide la tarea, detenerse y proponer una ADR; no modificarla silenciosamente.

## 2. Límite del proyecto

- Trabajar únicamente dentro del repositorio Chess Mentor.
- No leer ni modificar el CRM, la aplicación académica ni otros proyectos del usuario.
- No reutilizar bases, tablas, secretos, rutas o datos de otros proyectos.
- No usar libros, notas ni credenciales reales durante Fase 0 o Fase 1. Usar solo fixtures ficticios.
- Preservar cualquier cambio preexistente del usuario.

## 3. Protocolo de una tarjeta

Antes de editar:

1. Leer la tarjeta completa, sus dependencias y decisiones vinculadas.
2. Ejecutar `git status --short` y registrar el SHA inicial con `git rev-parse HEAD`.
3. Confirmar que `git config --get user.name` y `git config --get user.email` devuelven valores. Si falta identidad, detenerse antes de editar; nunca cambiar la configuración global.
4. Si un archivo permitido por la tarjeta ya tiene cambios ajenos, detenerse y reportarlo.
5. Cambiar la tarjeta a `in_progress` en `tasks/STATUS.md`.

Precedencia de selección/reanudación:

1. Si exactamente una tarjeta figura `in_progress`, solo se reanuda esa misma. Su parche documentado y limitado a rutas permitidas no es “ajeno”; si no puede atribuirse mediante el handoff, detenerse.
2. Si existe `ready_for_manual`, solo se reanuda esa tarjeta cuando el usuario aporta evidencia o pide ejecutar el gate físico.
3. Una `blocked` solo se reanuda cuando cambió explícitamente el bloqueo; una `failed` sin tarjeta causante `in_progress` requiere diagnóstico/intervención, no elegir otra.
4. Únicamente si no aplica lo anterior se elige la primera `pending` elegible.

Al reanudar un parche propio documentado no exigir worktree limpio ni volver a cambiar el status.

Excepción única de bootstrap: `CM-001` parte de una carpeta aún no inicializada, por lo que reemplaza los pasos 2 y 5 iniciales hasta crear Git: el fallo esperado de `git status`/`rev-parse` no es un bloqueo; primero inventaria con `Get-ChildItem -Force`, sigue `docs/BASELINE-INVENTORY.md`, ejecuta `git init`, marca CM-001 `in_progress`, crea el commit del paquete de preparación como indica su tarjeta y usa ese SHA como inicial antes de crear la app. Si una ejecución anterior dejó `.git` pero todavía no existe `HEAD`, se reanuda después de verificar que no hay remotos, hooks personalizados ni cambios de configuración inesperados; nunca se borra `.git` para reiniciar.

Durante la tarea:

- Implementar solo el resultado observable de esa tarjeta.
- Editar solo los archivos permitidos por la tarjeta, más `tasks/STATUS.md`.
- No instalar ni actualizar dependencias no enumeradas.
- No mezclar refactors, formato masivo o mejoras adyacentes.
- Mantener el dominio de ajedrez independiente de React, Next.js, almacenamiento y red.
- Añadir primero o junto al cambio la prueba focal indicada.

Al terminar:

1. Ejecutar la verificación focal.
2. Formatear solo los archivos permitidos que la tarjeta modificó: `pnpm.cmd exec prettier --write <rutas explícitas>`. Nunca ejecutar un write global de formato dentro de una tarjeta.
3. Ejecutar la verificación global disponible para esa etapa.
4. Ejecutar `git diff --check` y `git status --short`.
5. Marcar la tarjeta `complete` solo cuando pasan todos los gates que esa tarjeta exige. Si falta exclusivamente una prueba manual obligatoria, usar `ready_for_manual`.
6. Mantener cualquier prueba física no realizada como `NOT RUN`; nunca convertirla en PASS por inferencia.
7. Preparar un commit local de la tarjeta: `git add -- <rutas permitidas explícitas>`, revisar `git diff --cached --name-only`, ejecutar `git diff --cached --check` y crear `CM-xxx: <título breve>`. La autorización para ejecutar una tarjeta incluye este commit local, pero nunca un push. Si aparece una ruta no permitida, ejecutar `git restore --staged -- <ruta>` (solo índice, no contenido) y detenerse a investigar.
8. Verificar que el worktree quedó limpio salvo archivos ignorados inventariados y registrar el SHA final.
9. Entregar exactamente el handoff de `docs/HANDOFF.md`.
10. No comenzar otra tarjeta en el mismo turno.

Si el commit falla, devolver el estado de la tarjeta a `in_progress`, conservar el parche sin ampliar el alcance y pedir la intervención concreta. No declarar `complete` con cambios sin commit.

## 4. Protocolo ante errores

- Leer el primer error accionable completo; no reaccionar a toda la cascada.
- Reproducir con el comando más pequeño posible.
- El primer comando que revela el fallo es diagnóstico y no cuenta como remediación. Después se permiten como máximo dos remediaciones **materialmente distintas** sobre la misma causa; no repetir un comando idéntico sin que haya cambiado el estado relevante.
- Después de dos remediaciones fallidas, detenerse con: comando, exit code, primer error, archivos tocados e hipótesis comprobadas.
- No desactivar TypeScript estricto, ESLint, tests, validación de datos o controles de seguridad para obtener verde.
- No usar `any`, `@ts-ignore`, mocks globales indiscriminados o capturas vacías como atajo.
- No borrar lockfiles, `node_modules`, volúmenes, bases o caches ajenos para “probar suerte”.
- Un problema de red o permisos que bloquee una instalación requiere aprobación o intervención del usuario; no se esquiva con descargas alternativas no auditadas.

## 5. Windows y comandos

- Shell objetivo: PowerShell.
- Usar `pnpm.cmd`, no `pnpm`; la ExecutionPolicy bloquea el shim `pnpm.ps1`.
- Usar `npm.cmd` por la misma razón cuando sea imprescindible.
- No ejecutar `create-next-app .`: el directorio tiene espacio, mayúsculas y documentos preexistentes.
- Usar scripts de `package.json`; no improvisar flags distintos en cada ejecución.
- Para LAN usar `pnpm.cmd run dev:lan`, que debe ejecutar `next dev --hostname 0.0.0.0 --port 3000`; `dev` y `start` fijan `127.0.0.1`.
- `0.0.0.0` es una dirección de escucha, no una URL para el teléfono.
- No cambiar la ExecutionPolicy, el Firewall, servicios de Windows o instalaciones globales sin autorización explícita.

## 6. Dependencias y archivos generados

- Las versiones exactas están en `docs/DECISIONS.md`; no usar `latest` ni rangos.
- `package.json` y `pnpm-lock.yaml` se cambian juntos.
- En pnpm 10, no ejecutar `pnpm approve-builds` de forma interactiva. La allowlist aceptada es `pnpm.onlyBuiltDependencies: ["unrs-resolver"]`; cualquier script adicional requiere revisar el paquete y actualizar una decisión.
- No descargar modelos de Ollama, embeddings, Whisper o TTS automáticamente.
- No instalar Docker, WSL, PostgreSQL, Stockfish nativo ni extensiones de PostgreSQL automáticamente.
- No commitear `.env.local`, tokens, vault paths privados, libros, audios, modelos, bases ni artefactos generados.
- No guardar datos pesados o volúmenes PostgreSQL dentro de OneDrive.

Si una decisión congelada bloquea una tarjeta, no crear una ADR dentro de esa tarjeta. Entregar la propuesta en el handoff y detenerse. Tras aprobación del usuario se crea una tarjeta específica que autorice `docs/adr/NNNN-*.md` y los documentos/configs afectados.

## 7. Reglas de dominio de Fase 1

- `chess.js` valida y reproduce movimientos; no es el árbol canónico.
- `@echecs/pgn@5` se importa con exports nombrados (`parse`, `stringify`), no con default import.
- El documento canónico es serializable e inmutable y está definido en `docs/ARCHITECTURE.md`.
- Navegar atrás/adelante mueve el cursor; no modifica la partida.
- Undo/redo revierte ediciones; no es un alias de navegación.
- Jugar desde un nodo anterior crea una variante y nunca trunca la línea existente.
- El primer hijo es la línea principal. Fase 1 no reordena ni elimina variantes.
- La repetición triple se calcula reproduciendo el camino desde la raíz, no cargando solo el FEN final.
- Una promoción siempre requiere elegir dama, torre, alfil o caballo.
- La equivalencia de PGN es semántica, no textual.
- `@echecs/position` y `@echecs/san` están declarados por compatibilidad de peers; el adaptador no mantiene un segundo tablero ni los usa para validar FEN/movimientos.

## 8. Seguridad y afirmaciones

- La Fase 1 en LAN no tiene autenticación: usar datos ficticios y mostrar/documentar esa limitación.
- El navegador solo llama a Next.js por el mismo origen. Android nunca llama directamente a Ollama, PostgreSQL, Obsidian ni al worker.
- Servicios locales futuros escuchan en `127.0.0.1`, salvo Next.js cuando el usuario habilita LAN.
- Nunca afirmar que una prueba Android, HTTPS, micrófono, Tailscale o dispositivo físico pasó sin evidencia del usuario.
- Nunca afirmar que una cita o postura pertenece a un autor sin una fuente conservada y visible.

## 9. Git y recuperación

- No usar `git reset --hard`, `git clean -fd`, `git checkout --` ni borrar recursivamente como mecanismo de recuperación.
- Revertir un commit confirmado con `git revert`.
- Antes de commit, revertir únicamente el parche creado por la tarjeta y solo si se conoce exactamente.
- Cada tarjeta verde termina en un commit local propio; nunca acumular cambios de dos tarjetas en un mismo commit.
- Las migraciones futuras son forward-only. Nunca borrar datos reales para corregir una migración.
- No ejecutar `docker compose down -v` salvo sobre un entorno de prueba desechable, explícitamente aprobado.

Cuando una tarjeta de gate detecta un bug de una tarjeta anterior, la transición es atómica en `tasks/STATUS.md`: gate actual → `failed`, tarjeta causante → `in_progress`. No dejar dos tarjetas `in_progress`. Tras la corrección, causante → `complete` y gate → `pending`; el gate se ejecuta otra vez en un turno separado.

La transición administrativa de un gate fallido se commitea localmente solo con `tasks/STATUS.md` (`CM-xxx: record failed gate`) para que la tarjeta causante se reanude sobre un worktree limpio. No se commitean tests/código fallidos. Una tarjeta `ready_for_manual` es reanudable cuando el usuario aporta la evidencia o pide ejecutar el gate físico; se cambia a `in_progress` y no se salta por buscar otra `pending`.

## 10. Condición global de parada

No avanzar a Fase 2 hasta que todas las tarjetas de Fase 1 estén completas y el gate Android figure como `PASS` con evidencia humana. Un gate manual pendiente es un estado esperado, no autorización para omitirlo.
