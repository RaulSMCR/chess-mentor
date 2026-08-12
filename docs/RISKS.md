# Registro de riesgos y recuperación

Escala: impacto `H/M/L`, probabilidad `H/M/L`. El responsable de una tarjeta debe revisar los riesgos vinculados antes de editar.

| ID    | Riesgo                                                       | I/P | Prevención                                                | Recuperación dirigida                                                          |
| ----- | ------------------------------------------------------------ | --- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| R-01  | `create-next-app .` falla o pisa documentos                  | H/H | Bootstrap manual; nombre npm `chess-mentor`               | No reintentar generador; comparar archivos y revertir solo los creados         |
| R-02  | PowerShell bloquea `pnpm.ps1`/`npm.ps1`                      | M/H | Usar `pnpm.cmd`/`npm.cmd`                                 | Repetir con `.cmd`; no cambiar ExecutionPolicy                                 |
| R-03  | Drift de versiones/peer conflicts                            | H/H | Versiones exactas + lockfile + strict peers               | Volver al manifest de D-003; no probar combinaciones al azar                   |
| R-04  | TypeScript 7 incompatible con parser ESLint                  | H/H | TS `6.0.3`                                                | Restaurar TS/lockfile juntos y registrar el peer conflict                      |
| R-05  | OneDrive/antivirus causa EPERM o watchers inestables         | M/M | Artefactos ignorados, cache temporal solo si hace falta   | Detener procesos propios; reproducción mínima; ADR para mover repo si persiste |
| R-06  | Copiar API vieja de `react-chessboard`                       | H/H | Usar v5 `options` y tipos instalados                      | Leer `.d.ts` de la versión fijada; corregir solo adaptador UI                  |
| R-07  | Guardar `Chess` mutable en React                             | H/M | Documento JSON canónico + replay puro                     | Eliminar instancia del estado; reconstruir desde camino; añadir regresión      |
| R-08  | `chess.js` aplana variantes/comentarios                      | H/H | Árbol propio + adaptador `@echecs/pgn`                    | Detener; no “parchear” PGN con regex; corregir adapter/fixtures                |
| R-09  | RAV se cuelga del nodo equivocado                            | H/H | Variante comienza desde padre del movimiento alternado    | Test de estructura y paths UCI del fixture anidado                             |
| R-10  | Repetición calculada desde FEN aislado                       | H/H | Replay desde raíz                                         | Reemplazar consulta por replay; test del ciclo de caballos                     |
| R-11  | Movimiento desde pasado trunca línea                         | H/M | `childIds[0]` inmutable; nuevos hermanos al final         | Test de no destrucción; revertir comando, no reconstruir UI                    |
| R-12  | Undo y navegación se mezclan                                 | M/H | Session `past/present/future`; navegación fuera del stack | Tests de stack; corregir reducer antes de UI                                   |
| R-13  | Promoción automática a dama                                  | M/H | Modal previo, cuatro opciones                             | Drop retorna sin mutación; test q/r/b/n y cancel                               |
| R-14  | localStorage rompe SSR/private mode/quota                    | M/M | Adapter solo cliente, errors tipados                      | Fallback memoria + mensaje; preservar payload corrupto                         |
| R-15  | PGN parse error queda silencioso                             | H/M | Siempre `onError`; input no vacío + 0 games es error      | Mostrar localización; no aceptar árbol parcial                                 |
| R-16  | Tests comparan PGN por whitespace                            | M/H | Comparación semántica reimportada                         | Sustituir snapshot textual por normalizador                                    |
| R-16A | Ejemplo desactualizado usa default export de `@echecs/pgn@5` | M/H | Import nombrado `parse`/`stringify`; leer `.d.ts`         | Corregir solo adapter; no envolver con `any`                                   |
| R-16B | Parser PGN ignora FEN para slot/color/número                 | H/H | Turno/fullmove derivados del replay; fixture negras       | No confiar en `NotationPair`; corregir adapter, no fixture                     |
| R-16C | Tipo `Meta.Result` excluye `*` que existe en runtime         | H/H | Wrapper runtime localizado + test `[Result "*"]`          | Cast vía `unknown` en una línea; nunca `any`/`@ts-ignore`                      |
| R-16D | Directivas PGN no modeladas se pierden                       | H/M | Rechazo `UNSUPPORTED_PGN_FEATURE`                         | Conservar input; ampliar dominio solo mediante decisión aprobada               |
| R-17  | E2E intenta descargar navegador grande                       | M/M | Canal `msedge` instalado                                  | Reportar falta de Edge; pedir decisión, no descargar automáticamente           |
| R-17A | pnpm pide aprobar build transitivo interactivamente          | M/M | Allowlist `unrs-resolver` en manifest                     | No usar approve-builds; revisar antes de ampliar allowlist                     |
| R-17B | Sandbox bloquea `taskkill` durante teardown de Playwright    | M/M | E2E en 3100, listener comprobado, ejecución aprobada      | No aceptar output parcial; no matar procesos ajenos                            |
| R-18  | Android no alcanza PC                                        | M/H | `dev:lan`, IPv4 activa, misma Wi-Fi, perfil de red        | Diagnóstico por capas; Firewall solo con aprobación                            |
| R-18A | LocalStorage parece perdido al cambiar hostname/dispositivo  | M/H | URL consistente; documentar partición por origen          | Volver al mismo origen; no intentar sincronizar en Fase 1                      |
| R-18B | Next queda expuesto en LAN sin intención                     | H/H | `dev/start` fijan 127.0.0.1; solo `dev:lan` usa 0.0.0.0   | Detener proceso propio y corregir script/bind                                  |
| R-19  | Agente afirma prueba física no ejecutada                     | H/M | Campo `NOT RUN` obligatorio                               | Corregir status/handoff; solicitar evidencia humana                            |
| R-20  | LAN expone libros/notas sin auth                             | H/M | Fase 1 solo fixtures; auth en 1.5                         | Detener servidor LAN; no importar datos reales                                 |
| R-21  | Worker se implementa demasiado tarde                         | H/H | Fase 1.5 antes de integraciones                           | No iniciar Fase 4/5/7 sin gate worker                                          |
| R-22  | Worker/Ollama/DB se publican en LAN                          | H/M | Bind loopback; Next mismo origen                          | Detener servicio y corregir bind; inspeccionar puertos                         |
| R-23  | Vercel intenta llamar a loopback                             | H/H | Perfiles/capability matrix                                | Deshabilitar adapter local en cloud; no túneles improvisados                   |
| R-24  | Stockfish devuelve respuesta vieja                           | H/H | requestId + cancel + dispose                              | Ignorar ID viejo y recrear worker si no confirma stop                          |
| R-25  | Stockfish bloquea UI o requiere COOP/COEP                    | H/M | Lite single-thread en Web Worker                          | Volver a fake/worker; no habilitar threads ad hoc                              |
| R-26  | Licencia Stockfish/otros assets incumplida                   | H/M | Inventario, licencia, fuente y revisión antes de publicar | No distribuir release; conservar uso local hasta revisión                      |
| R-27  | Docker ausente bloquea fases tempranas                       | M/H | DB diferida a 3.5                                         | Seguir gates locales; checkpoint humano antes de 3.5                           |
| R-28  | Se toca PostgreSQL existente en 5432                         | H/M | DB Chess Mentor en 5433, credenciales/schema propios      | Detener; no migrar ni borrar; auditar conexión exacta                          |
| R-29  | Volumen PostgreSQL dentro de OneDrive                        | H/M | Named volume                                              | Migración planificada con backup; nunca mover volumen en caliente              |
| R-30  | PDF escaneado se trata como texto vacío                      | M/H | Detectar capa de texto; OCR fuera MVP                     | Estado `needs_ocr`, no inventar contenido                                      |
| R-31  | EPUB recibe página inventada                                 | H/M | Locator capítulo/CFI/offset                               | Reindexar locator; retirar cita inválida                                       |
| R-32  | Cambio de embeddings rompe pgvector                          | H/M | Modelo+dimensión versionados                              | Nuevo índice/reembedding; no mezclar vectores                                  |
| R-33  | IA genera cita/postura no respaldada                         | H/H | Claims estructurados + verificador                        | Convertir a `unsupported`, no mostrar como cita                                |
| R-34  | Obsidian sobrescribe nota fuente                             | H/M | Carpeta exclusiva + write atómico + hash                  | Detener sync, preservar temporales y restaurar desde backup                    |
| R-35  | Drive duplica/borrar original                                | H/M | Dry-run, hash, política de rename/delete                  | Desactivar writes; originales nunca se borran desde primer sync                |
| R-36  | Micrófono Android falla sobre HTTP                           | M/H | Tailscale/HTTPS antes de voz                              | No depurar STT hasta confirmar secure context                                  |
| R-37  | Conflicto sync se resuelve con last-write silencioso         | H/M | base revision + conflict record                           | Conservar ambas versiones; revisión humana                                     |
| R-38  | Cambios de dos tarjetas quedan mezclados sin commit          | H/H | Commit local y worktree limpio por tarjeta                | No seguir; separar por rutas conocidas o pedir intervención                    |

## Protocolo general de diagnóstico

1. Capturar comando, exit code y primer error accionable.
2. Determinar capa: entorno, dependencia, tipos, dominio, UI, persistencia, red o manual.
3. Ejecutar una reproducción mínima de esa capa.
4. Hacer un cambio dirigido y repetir solo la prueba focal.
5. Si falla por la misma causa, intentar una alternativa basada en nueva evidencia.
6. Si persiste, detenerse tras dos remediaciones distintas y entregar handoff `blocked`.

No se considera alternativa distinta reiniciar el mismo comando, borrar caches o variar flags sin hipótesis.

## Playbooks breves

### Instalación/peer dependency

- Comparar Node/pnpm con D-001.
- Comparar manifest exacto con D-003.
- Leer el peer conflict completo.
- No usar `--force` ni `--legacy-peer-deps`.

### Typecheck después de dependencia

- Leer tipos de la versión instalada.
- Corregir el adaptador, no crear un wrapper `any`.
- Si documentación online difiere, manda el `.d.ts` del lockfile.

### Árbol corrupto

- Conservar documento de entrada.
- Ejecutar invariant checker para obtener nodo/ruta.
- No reparar silenciosamente en producción durante Fase 1.
- Corregir el comando que generó corrupción y añadir regresión.

### Persistencia corrupta

- Conservar string original bajo la misma clave o exportarlo para recuperación.
- Mostrar error y ofrecer nueva sesión en memoria.
- No sobrescribir hasta acción explícita del usuario.

### LAN

Orden: proceso escucha → localhost responde → IPv4 correcta → misma red → perfil Windows → Firewall → aislamiento Wi-Fi. No abrir otros puertos ni desactivar Firewall.

### Test flaky

- Ejecutar el test focal tres veces solo para confirmar variabilidad.
- Sustituir reloj/ID/delay por inyección y estado visible.
- No aumentar timeouts como primera corrección.
