# Estado de ejecución

Este archivo es la única fuente del estado de tarjetas. Solo una tarjeta puede estar `in_progress`.

Estados válidos: `pending`, `in_progress`, `complete`, `ready_for_manual`, `blocked`, `failed`.

| ID     | Estado   | Depende de | Resultado                                     |
| ------ | -------- | ---------- | --------------------------------------------- |
| CM-000 | complete | —          | Auditoría, decisiones, runbook y fixtures     |
| CM-001 | in_progress | CM-000     | Inicializar Git, baseline Next y lockfile     |
| CM-002 | pending  | CM-001     | Lint, typecheck, format y unit harness        |
| CM-003 | pending  | CM-002     | Playwright/Edge y E2E smoke                   |
| CM-004 | pending  | CM-003     | Gate baseline reproducible                    |
| CM-101 | pending  | CM-004     | Modelo e invariantes del árbol                |
| CM-102 | pending  | CM-101     | Replay y reglas con chess.js                  |
| CM-103 | pending  | CM-102     | Comandos y navegación no destructiva          |
| CM-104 | pending  | CM-103     | Undo/redo de ediciones                        |
| CM-105 | pending  | CM-104     | Import/export PGN semántico                   |
| CM-106 | pending  | CM-105     | Repositorios memoria/localStorage             |
| CM-107 | pending  | CM-106     | Sesión React y shell de UI                    |
| CM-108 | pending  | CM-107     | Tablero, drop, promoción y flip               |
| CM-109 | pending  | CM-108     | Árbol visible, navegación, comentarios y NAG  |
| CM-110 | pending  | CM-109     | Nueva/FEN, import/export y partidas guardadas |
| CM-111 | pending  | CM-110     | Responsive, touch y accesibilidad             |
| CM-112 | pending  | CM-111     | E2E integral y gate automatizado              |
| CM-113 | pending  | CM-112     | Smoke Windows/Android con evidencia humana    |

## Próxima tarjeta

`CM-001` en `tasks/PHASE-0.md`.

## Regla de avance

Aplicar la precedencia exacta de `AGENTS.md`: única `in_progress`; luego `ready_for_manual` con intervención disponible; luego `blocked` solo si cambió el bloqueo. Una `failed` sin causante activa detiene la selección. Solo cuando ninguna aplica, elegir la primera `pending` cuyas dependencias estén `complete`. `ready_for_manual` no satisface una dependencia física.
