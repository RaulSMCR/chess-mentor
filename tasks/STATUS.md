# Estado de ejecución

Este archivo es la única fuente del estado de tarjetas. Solo una tarjeta puede estar `in_progress`.

Estados válidos: `pending`, `in_progress`, `complete`, `ready_for_manual`, `blocked`, `failed`.

<!-- prettier-ignore -->
| ID     | Estado           | Depende de | Resultado                                     |
| ------ | ---------------- | ---------- | --------------------------------------------- |
| CM-000 | complete         | —          | Auditoría, decisiones, runbook y fixtures     |
| CM-001 | complete         | CM-000     | Inicializar Git, baseline Next y lockfile     |
| CM-002 | complete         | CM-001     | Lint, typecheck, format y unit harness        |
| CM-003 | complete         | CM-002     | Playwright/Edge y E2E smoke                   |
| CM-004 | complete         | CM-003     | Gate baseline reproducible                    |
| CM-101 | complete         | CM-004     | Modelo e invariantes del árbol                |
| CM-102 | complete         | CM-101     | Replay y reglas con chess.js                  |
| CM-103 | complete         | CM-102     | Comandos y navegación no destructiva          |
| CM-104 | complete         | CM-103     | Undo/redo de ediciones                        |
| CM-105 | complete         | CM-104     | Import/export PGN semántico                   |
| CM-106 | complete         | CM-105     | Repositorios memoria/localStorage             |
| CM-107 | complete         | CM-106     | Sesión React y shell de UI                    |
| CM-108 | complete         | CM-107     | Tablero, drop, promoción y flip               |
| CM-109 | complete         | CM-108     | Árbol visible, navegación, comentarios y NAG  |
| CM-110 | complete         | CM-109     | Nueva/FEN, import/export y partidas guardadas |
| CM-111 | complete         | CM-110     | Responsive, touch y accesibilidad             |
| CM-112 | complete         | CM-111     | E2E integral y gate automatizado              |
| CM-113 | complete         | CM-112     | Smoke público Android con evidencia humana    |
| CM-114 | complete         | CM-113     | Contrato del worker y fake determinista       |
| CM-115 | complete         | CM-114     | Runtime loopback con token y capabilities     |
| CM-116 | complete         | CM-115     | Puente server-only y endpoints Next           |
| CM-117 | complete         | CM-116     | Gate de seguridad y degradación               |
| CM-118 | complete         | CM-117     | Contrato EngineAdapter y fake determinista    |
| CM-119 | complete         | CM-118     | Inventario, licencia y checksum Stockfish     |
| CM-120 | complete         | CM-119     | Worker UCI del navegador                      |
| CM-121 | complete         | CM-120     | Parser de score, MultiPV y perspectiva        |
| CM-122 | complete         | CM-121     | Cancelación y descarte de análisis obsoleto   |
| CM-123 | complete         | CM-122     | UI de análisis y navegación de PV             |
| CM-124 | complete         | CM-123     | Comparación de jugada y gate Stockfish        |
| CM-300 | complete         | CM-124     | Políticas y tarjetas de Fase 3                |
| CM-301 | complete         | CM-300     | Contrato de ejercicios y aceptación           |
| CM-302 | complete         | CM-301     | Pistas y puntuación deterministas             |
| CM-303 | complete         | CM-302     | Scheduler SM-2 con reloj inyectable           |
| CM-304 | complete         | CM-303     | Repositorio local de ejercicios               |
| CM-305 | complete         | CM-304     | Variante corta opcional del motor             |
| CM-306 | complete         | CM-305     | UI y gate de Fase 3                           |
| CM-350 | complete         | CM-306     | Base PostgreSQL aislada y Prisma              |

## Próxima tarjeta

CM-350 está completa. Supabase cloud queda fuera de esta tarjeta y requiere una
tarjeta posterior específica.

## Regla de avance

Aplicar la precedencia exacta de `AGENTS.md`: única `in_progress`; luego `ready_for_manual` con intervención disponible; luego `blocked` solo si cambió el bloqueo. Una `failed` sin causante activa detiene la selección. Solo cuando ninguna aplica, elegir la primera `pending` cuyas dependencias estén `complete`. `ready_for_manual` no satisface una dependencia física.
