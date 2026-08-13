# Roadmap corregido

## 1. Grafo de dependencias

```text
0A auditoría [complete]
  -> 0B baseline reproducible
      -> 1 núcleo + persistencia navegador + Android LAN
          -> gate humano Android
              -> 1.5 worker/seguridad/capabilities
                  -> 2 Stockfish
                      -> 3 entrenador determinista
                          -> 3.5 PostgreSQL/Prisma/jobs
                              -> 4 biblioteca textual
                                  -> 5 Ollama/RAG/procedencia
                                      -> 6 autores/teorías/revisión
                                          -> 7A Obsidian/Drive
                                              -> 7B Tailscale/HTTPS
                                                  -> 7C voz
                                                      -> 8 nube/sync/PWA/operaciones
```

Hasta que existan tarjetas detalladas para paralelismo, este grafo es un orden total: una fase solo comienza cuando su predecesora y sus gates están cerrados.

## 2. Fase 0A — Reconocimiento

Estado: **complete**.

Entregado:

- carpeta confirmada independiente y sin app; `debug.log` preexistente preservado;
- entorno auditado;
- problemas de Windows/OneDrive identificados;
- plan original leído completo;
- decisiones, arquitectura, riesgos, fixtures y tarjetas creados.

## 3. Fase 0B — Baseline reproducible

Tarjetas: `CM-001` a `CM-004` en `tasks/PHASE-0.md`.

### Definition of Done

- Git y baseline de documentos preservados.
- `package.json` con versiones exactas y lockfile.
- App Router mínimo sin funciones de ajedrez.
- ESLint, TypeScript estricto, Prettier, Vitest y Playwright configurados.
- Los scripts documentados ejecutan en PowerShell mediante `pnpm.cmd`.
- `format:check`, `lint`, `typecheck`, `test:unit`, `build` y `test:e2e` pasan.
- No se instaló ni modificó Docker, PostgreSQL, Ollama, Stockfish u Obsidian.

## 4. Fase 1 — Núcleo de ajedrez

Tarjetas: `CM-101` a `CM-113` en `tasks/PHASE-1.md`.

### Entregable

Vertical slice offline con árbol, PGN anotado, persistencia local y UI responsive.

### Definition of Done

- Contrato e invariantes del árbol probados.
- Legalidad y estados especiales probados.
- Navegación no destructiva y undo/redo diferenciados.
- PGN con RAV anidadas, NAG, comentarios y FEN inicial hace round-trip semántico.
- Promoción elegible; drop ilegal no cambia estado.
- Guardar/listar/abrir funciona después de recarga.
- No hay acceso directo a almacenamiento desde componentes.
- Build y E2E pasan en Edge.
- Smoke Windows y Android tienen evidencia humana.

## 5. Fase 1.5 — Worker y seguridad local

Tarjetas detalladas: `CM-114` a `CM-117` en `tasks/PHASE-1.5.md`. Se ejecutan
en orden después del gate de Fase 1, sin reabrir decisiones del núcleo.

### Alcance

- `worker/` Node/TypeScript con health, versión y capabilities.
- Escucha exclusiva `127.0.0.1:3210`.
- Token aleatorio requerido para toda ruta salvo health mínimo.
- Cliente server-only en Next; nunca se importa en un Client Component.
- Timeouts, cancelación y errores tipados.
- `GET /api/health` y `GET /api/diagnostics` sin filtrar secretos/rutas sensibles.
- Advertencia/auth local antes de usar datos reales por LAN.

### Gate

- Una petición sin token es rechazada.
- Un worker ausente degrada la UI y no rompe tablero/PGN.
- Android no conoce ni puede resolver la URL interna.
- El worker no escucha en `0.0.0.0`.

## 6. Fase 2 — Stockfish

### Subfases

1. Contrato `EngineAdapter` y fake determinista.
2. Inventario/licencia/checksum de assets Stockfish 18 lite single-thread.
3. Web Worker y protocolo UCI.
4. Parser de `info`/`bestmove`, score cp/mate y perspectiva blanca.
5. Ciclo start/cancel/dispose, request IDs y resultados obsoletos.
6. UI de profundidad, tiempo, MultiPV, flechas y navegación temporal de PV.
7. Comparación de jugada humana sin modificar el árbol original.

### Gate

- FENs dorados producen bestmove legal.
- MultiPV respeta cantidad y orden.
- Mate y centipawns no se mezclan.
- Cambiar posición cancela y nunca pinta una respuesta vieja.
- Worker se termina al cerrar/reiniciar análisis.
- Indisponibilidad muestra diagnóstico y conserva funciones de Fase 1.

## 7. Fase 3 — Entrenador determinista

### Decisiones que se deben cerrar antes

- Jugada correcta: exacta, conjunto MultiPV o tolerancia cp.
- Secuencia de pistas y penalización por pista.
- Algoritmo de repetición (por ejemplo FSRS o SM-2) y zona horaria.
- Criterios de dificultad y tiempo.

### Alcance inicial

- ejercicios desde FEN y errores de partidas;
- intento por movimiento;
- pistas de plantilla, no LLM;
- variante corta del motor;
- reintento, resultado y scheduler;
- persistencia detrás de repositorio local.

### Gate

- Mismo input produce mismo score/siguiente fecha con reloj inyectado.
- Jugadas equivalentes siguen una política documentada.
- Pedir pistas no revela inmediatamente la solución.
- Stockfish ausente deja ejercicios manuales utilizables.

## 8. Fase 3.5 — Datos y trabajos largos

Prerequisito humano: Docker/WSL disponible o alternativa aprobada. El agente no los instala.

### Alcance

- PostgreSQL dedicado a Chess Mentor en host `5433`, no el servicio existente `5432`.
- Docker named volume fuera de OneDrive.
- Prisma schema mínimo y migraciones.
- Repositorios para partidas, ejercicios y jobs.
- Estados `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- `attemptCount`, lease, checkpoint e idempotency key.
- Recuperación de un `running` abandonado con límite de intentos.

### Gate

- Migración desde cero y desde versión anterior de fixture.
- Backup de prueba restaurado.
- Job interrumpido reanuda sin duplicar resultados.
- No se toca ninguna DB/tabla ajena.

## 9. Fase 4 — Biblioteca textual

Implementar formatos uno por uno: TXT → Markdown → PGN → EPUB → PDF con texto. Cada formato tiene fixture dorado antes del siguiente.

### Contratos

- Original inmutable + SHA-256.
- Texto extraído/corregido/chunks separados.
- Localizador tipado: página, capítulo/CFI, offset o ply.
- Import idempotente por hash y versión nueva al modificar binario.
- Detección con nivel de confianza y cola de revisión.
- Búsqueda textual antes de embeddings.

### Fuera del MVP

- OCR, PDF cifrado, diagramas, notación ambigua reconstruida automáticamente.

## 10. Fase 5 — IA contextual

Prerequisito humano: modelo de embeddings instalado y probado; la app no lo descarga.

### Orden

1. `AIProvider` y fakes.
2. Health de Ollama `/api/tags` y `/api/ps`.
3. Chunking/versionado y dimensión de embeddings.
4. Recuperación con búsqueda textual como fallback.
5. Respuesta estructurada con claims y citations.
6. Verificador: claims bibliográficos sin fuente se rechazan.
7. Explicación pedagógica de Stockfish claramente etiquetada.

### Gate

- Modelo asignado/instalado/cargado se distinguen.
- Ollama ausente degrada sin afectar fases previas.
- Corpus insuficiente devuelve `unsupported`.
- Ninguna cita apunta a un localizador/hash inexistente.

## 11. Fase 6 — Autores y teorías

- perfiles, escuelas y conceptos;
- comparación/diferencias con cobertura de fuentes;
- autor contra motor, sin atribuir al autor la evaluación;
- mesa redonda como reconstrucción explícita;
- flujo humano aprobar/rechazar/corregir.

Gate: cada argumento tiene tipo, fuente o estado `unsupported`, y toda corrección humana deja auditoría.

## 12. Fase 7A — Obsidian y Drive

### Obsidian

- lectura unidireccional explícita;
- exportación solo a carpeta exclusiva;
- nombres saneados, escritura temporal + rename atómico;
- hash para duplicados;
- jamás sobrescribir nota fuente.

### Drive

- OAuth de app instalada con scope mínimo;
- secretos/tokens fuera de Git;
- dry-run inicial;
- detectar alta/modificación/rename/borrado según política escrita;
- originales en Drive, derivados necesarios en DB.

## 13. Fase 7B — Tailscale y HTTPS

- Tailscale instalado/configurado por el usuario.
- HTTPS privado para Next.js.
- Ningún puerto del router.
- Worker/Ollama/PostgreSQL/Obsidian permanecen loopback.
- matriz de autorización entre dispositivos.

## 14. Fase 7C — Voz

STT y TTS se separan en tarjetas/proveedores. El original, transcripción bruta, corregida y respuesta son artefactos distintos. Whisper/faster-whisper y Piper/Kokoro se instalan manualmente; FFmpeg y formatos Android se verifican antes de código de UI.

## 15. Fase 8 — Nube y producción

- Supabase Auth y RLS probada con dos usuarios.
- pgvector solo después de fijar modelo/dimensión.
- sincronización idempotente con UUID/version/tombstone/conflictos.
- Vercel en perfil cloud sin imports nativos/locales.
- PWA y estrategia de cache que no guarde secretos/originales.
- backups, restauración y observabilidad sin texto bibliográfico sensible.
- matriz PC apagada aprobada.

## 16. Documentación por fase

Los documentos obligatorios se crean cuando su función existe, para no publicar instrucciones ficticias:

| Documento                                                            | Momento                      |
| -------------------------------------------------------------------- | ---------------------------- |
| `README.md`, `AGENTS.md`, `.env.example`                             | Preparación, completos       |
| `ARCHITECTURE`, `ROADMAP`, `LOCAL-DEVELOPMENT`, `TESTING`, `PRIVACY` | Fase 0/1                     |
| `STOCKFISH.md`                                                       | Fase 2                       |
| `OLLAMA.md`                                                          | Fase 5                       |
| `OBSIDIAN.md`, `GOOGLE-DRIVE.md`                                     | Fase 7A                      |
| `MOBILE-ACCESS.md`, `REMOTE-ACCESS.md`                               | Fase 1 y 7B, respectivamente |
| `docker-compose.yml`                                                 | Fase 3.5, no antes           |
