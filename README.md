# Chess Mentor

Este repositorio contiene el paquete de ejecución preparado a partir del plan original de Chess Mentor. El objetivo inmediato no es implementar todo el producto de una vez: es completar un vertical slice verificable sin que el agente tenga que improvisar arquitectura, versiones o criterios de terminado.

## Punto de entrada para el siguiente agente

1. Leer `AGENTS.md` completo.
2. Leer `PLAN-EJECUTABLE.md` y `docs/DECISIONS.md`.
3. Abrir `tasks/STATUS.md`.
4. Ejecutar **una sola tarjeta pendiente**, empezando por `CM-001`.
5. Entregar el handoff exigido por `docs/HANDOFF.md`.

Prompt recomendado para un modelo de menor capacidad:

> Lee AGENTS.md completo y sigue su orden de autoridad. Revisa tasks/STATUS.md: reanuda la única tarjeta `in_progress`; si no hay una, reanuda `ready_for_manual` solo cuando el usuario aporte o solicite el gate físico; una `blocked` requiere que haya cambiado el bloqueo y una `failed` sin causante activa obliga a detenerse. Solo entonces ejecuta la primera `pending` cuyas dependencias estén `complete`. No avances a otra tarjeta. Si una prueba manual requiere al usuario, déjala como `NOT RUN` y solicita la evidencia indicada; no la inventes.

## Qué ya está resuelto

- Auditoría completa del plan original de 916 líneas.
- Auditoría del entorno Windows y de la carpeta sin app (solo existía `debug.log`, preservado e ignorado).
- Orden de fases corregido para eliminar dependencias invertidas.
- Versiones y decisiones de la Fase 1 congeladas.
- Contrato del árbol de partida, navegación, undo/redo, PGN y persistencia.
- Tarjetas atómicas para Fase 0 y Fase 1.
- Fixtures PGN/FEN y matriz de pruebas.
- Registro de riesgos, rutas de recuperación y plantilla de handoff.

## Documentos canónicos

| Documento                    | Uso                                                       |
| ---------------------------- | --------------------------------------------------------- |
| `AGENTS.md`                  | Reglas operativas obligatorias para agentes               |
| `PLAN-EJECUTABLE.md`         | Alcance, secuencia corregida y gates                      |
| `docs/DECISIONS.md`          | Decisiones que no se pueden cambiar dentro de una tarjeta |
| `docs/ARCHITECTURE.md`       | Topología y contratos técnicos                            |
| `docs/ROADMAP.md`            | Dependencias y Definition of Done por fase                |
| `docs/LOCAL-DEVELOPMENT.md`  | Entorno real y comandos de Windows                        |
| `docs/BASELINE-INVENTORY.md` | Inventario exacto y log preexistente preservado           |
| `docs/TESTING.md`            | Fixtures, pruebas y comparación PGN semántica             |
| `docs/RISKS.md`              | Riesgos, síntomas, prevención y recuperación              |
| `docs/HANDOFF.md`            | Formato obligatorio al cerrar cada tarjeta                |
| `tasks/STATUS.md`            | Única fuente del estado de las tarjetas                   |

## Fuente original

El plan recibido está en `C:\Users\usuario\Downloads\PLAN-CODEX-CHESS-MENTOR.md`.

- Longitud auditada: 916 líneas de contenido (916 saltos LF y newline final).
- SHA-256: `DF21EE502495B37DC1A7B4B3B942E1F1FD38A217F51C649B80FC9690AF0A65A5`.
- Si el original y este paquete difieren en el orden técnico, manda este paquete para la ejecución. El alcance de producto y los principios de privacidad del original se conservan.

## Estado actual

No hay aplicación aún. La próxima acción es `CM-001`: crear y verificar el baseline de Next.js sin implementar funciones de ajedrez.
