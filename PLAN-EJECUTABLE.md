# Plan ejecutable — Chess Mentor

## 0. Propósito

Construir una aplicación local-first que funcione como tablero de estudio, analista, entrenador y biblioteca de ajedrez. El producto final combinará reglas legales, FEN/PGN, variantes, Stockfish, entrenamiento, corpus bibliográfico con procedencia, IA local, voz, notas e infraestructura remota opcional.

Este documento convierte la visión original en una secuencia ejecutable. Las decisiones técnicas que antes quedaban abiertas están congeladas en `docs/DECISIONS.md`; las tareas inmediatas están atomizadas en `tasks/`.

## 1. Alcance de producto conservado

### Modos finales

- **Partida:** crear desde posición inicial o FEN, mover legalmente, navegar, ramificar, comentar, importar/exportar PGN y guardar.
- **Análisis:** Stockfish, evaluación, profundidad, MultiPV, flechas, comparación y navegación de líneas.
- **Entrenador:** intentos sobre tablero, pistas graduales, explicación, progreso y repetición espaciada.
- **Biblioteca:** PDF/EPUB/TXT/Markdown/PGN, búsqueda, texto junto al tablero y citas navegables.
- **Diálogo:** preguntas, comparación de autores, escuelas y teorías, siempre distinguiendo fuentes, inferencias, síntesis y motor.

### Fuera de alcance permanente

- La aplicación general de aprendizaje de obras complejas.
- La biblioteca académica no ajedrecística.
- El CRM de Salud Mental Costa Rica.
- Cualquier schema, usuario, secreto, ruta o dato de esos proyectos.

## 2. Principios no negociables

1. El tablero y las reglas funcionan sin Internet.
2. Stockfish se ejecuta localmente; la nube no procesa análisis profundo.
3. Motor, explicación de IA y comentario bibliográfico son capas distintas.
4. No se inventan citas ni posturas de autores.
5. Cita, paráfrasis, inferencia, síntesis, hipótesis y evaluación de motor se etiquetan por separado.
6. Los originales nunca se sobrescriben.
7. No se envían libros completos a proveedores externos.
8. No se descargan modelos pesados automáticamente.
9. Los secretos solo existen en procesos servidor/worker y archivos locales ignorados.
10. No se avanza de fase con verificaciones automatizables rojas.
11. Las pruebas físicas solo las aprueba una persona que las ejecutó.
12. Supabase y Vercel son opcionales para el modo local; su ausencia no bloquea las fases locales.

## 3. Correcciones al orden original

El orden original tenía dependencias invertidas: ubicaba el worker al final aunque lo necesitaban biblioteca, IA, Drive y voz; pedía explicaciones generativas antes de integrar IA; y exigía micrófono Android antes de disponer de HTTPS. La secuencia corregida es:

1. **Fase 0A — auditoría:** completada en este paquete.
2. **Fase 0B — baseline reproducible:** Next.js, TypeScript, scripts y arnés de pruebas.
3. **Fase 1 — núcleo de ajedrez:** vertical slice local, persistente y móvil.
4. **Fase 1.5 — worker y seguridad local:** proceso loopback, health/capabilities y autenticación entre servicios.
5. **Fase 2 — Stockfish:** WASM single-thread como primaria; ciclo UCI y cancelación.
6. **Fase 3 — entrenador determinista:** motor + plantillas; IA generativa queda diferida.
7. **Fase 3.5 — datos y trabajos:** PostgreSQL aislado, Prisma, cola reanudable y almacenamiento local de archivos.
8. **Fase 4 — biblioteca textual:** formatos con texto; OCR y diagramas como subfase posterior.
9. **Fase 5 — IA contextual:** Ollama, recuperación y procedencia estructurada.
10. **Fase 6 — autores y teorías:** comparación y revisión humana de atribuciones.
11. **Fase 7A — Obsidian y Drive.**
12. **Fase 7B — Tailscale y HTTPS.**
13. **Fase 7C — voz:** STT/TTS después de HTTPS.
14. **Fase 8 — nube y producción:** Supabase, RLS, sincronización, Vercel, PWA, backups y observabilidad.

## 4. Regla de ejecución

- Una tarjeta por turno.
- Cada tarjeta produce un resultado observable y una prueba focal.
- Cada tarjeta verde termina en un commit local propio; no se hace push automáticamente.
- Una tarjeta no puede resolver decisiones de otra fase de forma anticipada.
- Toda dependencia externa tiene adaptador y fake determinista.
- Los tests normales no dependen de Ollama, Stockfish real, Drive, Supabase, Tailscale ni un teléfono.
- Las pruebas `live` están separadas y nunca sustituyen las unitarias.

## 5. Vertical slice de Fase 1

La primera entrega debe permitir, sin Internet:

- iniciar desde posición estándar o FEN válida;
- arrastrar piezas con validación legal;
- elegir promoción;
- reconocer enroque, captura al paso, jaque, mate, ahogado, repetición y regla de cincuenta movimientos;
- navegar por un árbol de movimientos;
- jugar desde el pasado sin borrar la línea original;
- deshacer y rehacer ediciones;
- importar y exportar un PGN con tags, FEN inicial, comentarios, NAG y variantes anidadas;
- editar comentarios y NAG;
- voltear el tablero;
- guardar y volver a abrir varias partidas en el navegador;
- funcionar en escritorio y en Android por la red local.

### No pertenece a Fase 1

- PostgreSQL, Prisma, Docker o Supabase.
- API de partidas.
- Usuarios o autenticación.
- Stockfish o explicaciones de IA.
- PWA, HTTPS, micrófono, Obsidian, Drive o libros reales.
- Eliminar/reordenar variantes o colaboración multi-dispositivo.

## 6. Gate de Fase 1

### Automatizable

Todos deben terminar con exit code 0:

```powershell
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test:unit
pnpm.cmd run build
pnpm.cmd run test:e2e:only
git diff --check
```

El comando agregado equivalente es `pnpm.cmd run verify:phase1`; no reconstruye dos veces.

Además:

- El fixture PGN anotado supera importación → exportación → reimportación con equivalencia semántica.
- Crear una rama desde el pasado no cambia ni elimina la línea principal.
- Una partida guardada manualmente puede volver a abrirse después de recargar.
- Un movimiento ilegal no cambia documento, cursor ni undo stack.
- Un almacenamiento corrupto se reporta sin borrar silenciosamente la copia original.

### Manual

- Windows/Edge: flujo de crear, mover, ramificar, comentar, exportar y recargar.
- Android/Edge o Chrome en la misma Wi-Fi: tablero visible, drag táctil, promoción y controles de al menos 44×44 CSS px.
- La evidencia y el formato están en `docs/TESTING.md`.

No se inicia Fase 1.5 ni Fase 2 hasta que el gate manual tenga evidencia `PASS`.

## 7. Gates posteriores resumidos

| Fase | Gate mínimo                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 1.5  | Worker solo en loopback, token obligatorio, health y capabilities con fallos explícitos               |
| 2    | FEN conocida, MultiPV, mate/cp, cancelación, descarte de respuestas obsoletas y liberación del worker |
| 3    | Política reproducible de jugadas aceptadas, pistas por niveles y scheduler determinista               |
| 3.5  | DB aislada, migraciones limpias, jobs idempotentes/reanudables y backup de prueba                     |
| 4    | Fixtures dorados por formato, hash, reimportación idempotente, localizadores y búsqueda textual       |
| 5    | Toda afirmación tipada y respaldada; corpus insuficiente devuelve negativa explícita                  |
| 6    | Cada argumento tiene cobertura de fuentes y flujo aprobar/rechazar/corregir                           |
| 7A   | Exportaciones confinadas, atómicas y sin overwrite; Drive inicia en dry-run                           |
| 7B   | HTTPS privado real sin publicar worker, DB, Ollama u Obsidian                                         |
| 7C   | Audio Android → transcripción → respuesta → TTS con originales preservados                            |
| 8    | RLS con dos usuarios, conflicto reproducible, backup restaurado y matriz PC apagada validada          |

## 8. API por etapa

La lista de API del plan original es conceptual. En Next.js, `:id` se implementa con segmentos `[id]`. No se crea toda en Fase 1.

- **Fase 1:** sin API; repositorio local de navegador.
- **Fase 1.5:** `GET /api/health`, `GET /api/diagnostics` y proxy autenticado al worker.
- **Fase 2:** análisis como sesión cancelable, no como POST bloqueante sin identidad.
- **Fase 3.5:** CRUD de partidas/ejercicios y estado de jobs.
- **Fase 4+:** importación/búsqueda, chat con procedencia, exportaciones y sync.

Los contratos HTTP se fijarán con Zod/OpenAPI antes de cada fase que los use.

## 9. Estado y siguiente paso

La auditoría y este paquete de preparación están completos. La aplicación todavía no existe. La única tarea autorizada a continuación es `CM-001` en `tasks/PHASE-0.md`.
