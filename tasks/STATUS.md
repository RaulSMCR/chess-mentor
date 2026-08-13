# Estado de ejecución

Este archivo es la única fuente del estado de tarjetas. Solo una tarjeta puede estar `in_progress`.

Estados válidos: `pending`, `in_progress`, `complete`, `ready_for_manual`, `blocked`, `failed`.

| ID     | Estado   | Depende de | Resultado                                     |
| ------ | -------- | ---------- | --------------------------------------------- |
| CM-000 | complete | —          | Auditoría, decisiones, runbook y fixtures     |
| CM-001 | complete | CM-000     | Inicializar Git, baseline Next y lockfile     |
| CM-002 | complete | CM-001     | Lint, typecheck, format y unit harness        |
| CM-003 | complete | CM-002     | Playwright/Edge y E2E smoke                   |
| CM-004 | complete | CM-003     | Gate baseline reproducible                    |
| CM-101 | complete | CM-004     | Modelo e invariantes del árbol                |
| CM-102 | complete | CM-101     | Replay y reglas con chess.js                  |
| CM-103 | complete | CM-102     | Comandos y navegación no destructiva          |
| CM-104 | complete | CM-103     | Undo/redo de ediciones                        |
| CM-105 | complete | CM-104     | Import/export PGN semántico                   |
| CM-106 | complete | CM-105     | Repositorios memoria/localStorage             |
| CM-107 | complete | CM-106     | Sesión React y shell de UI                    |
| CM-108 | complete | CM-107     | Tablero, drop, promoción y flip               |
| CM-109 | complete | CM-108     | Árbol visible, navegación, comentarios y NAG  |
| CM-110 | complete | CM-109     | Nueva/FEN, import/export y partidas guardadas |
| CM-111 | complete | CM-110     | Responsive, touch y accesibilidad             |
| CM-112 | complete | CM-111     | E2E integral y gate automatizado              |
| CM-113 | complete | CM-112     | Smoke público Android con evidencia humana    |
| CM-114 | complete | CM-113     | Contrato del worker y fake determinista       |
| CM-115 | complete | CM-114     | Runtime loopback con token y capabilities     |
| CM-116 | complete | CM-115     | Puente server-only y endpoints Next           |
| CM-117 | complete | CM-116     | Gate de seguridad y degradación               |
| CM-118 | pending  | CM-117     | Contrato EngineAdapter y fake determinista    |
| CM-119 | pending  | CM-118     | Inventario, licencia y checksum Stockfish     |
| CM-120 | pending  | CM-119     | Worker UCI del navegador                      |
| CM-121 | pending  | CM-120     | Parser de score, MultiPV y perspectiva        |
| CM-122 | pending  | CM-121     | Cancelación y descarte de análisis obsoleto   |
| CM-123 | pending  | CM-122     | UI de análisis y navegación de PV             |
| CM-124 | pending  | CM-123     | Comparación de jugada y gate Stockfish        |

## Próxima tarjeta

`CM-118` en `tasks/PHASE-2.md`.

## Regla de avance

Aplicar la precedencia exacta de `AGENTS.md`: única `in_progress`; luego `ready_for_manual` con intervención disponible; luego `blocked` solo si cambió el bloqueo. Una `failed` sin causante activa detiene la selección. Solo cuando ninguna aplica, elegir la primera `pending` cuyas dependencias estén `complete`. `ready_for_manual` no satisface una dependencia física.
