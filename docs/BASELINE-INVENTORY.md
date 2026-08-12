# Inventario exacto previo a CM-001

Este es el contenido esperado antes de inicializar Git. Ejecutar `Get-ChildItem -Force` y `rg --files -uu`; cualquier ruta adicional obliga a detenerse y preguntar, no a borrarla.

## Archivos que forman CM-000 y se commitean

```text
.editorconfig
.env.example
.gitattributes
.gitignore
AGENTS.md
PLAN-EJECUTABLE.md
README.md
docs/ARCHITECTURE.md
docs/BASELINE-INVENTORY.md
docs/DECISIONS.md
docs/HANDOFF.md
docs/LOCAL-DEVELOPMENT.md
docs/MOBILE-ACCESS.md
docs/PRIVACY.md
docs/RISKS.md
docs/ROADMAP.md
docs/TESTING.md
fixtures/phase1/annotated-variations.pgn
fixtures/phase1/black-to-move.pgn
fixtures/phase1/custom-start.pgn
fixtures/phase1/invalid.pgn
fixtures/phase1/positions.json
fixtures/phase1/unsupported-directives.pgn
tasks/PHASE-0.md
tasks/PHASE-1.md
tasks/STATUS.md
tasks/TEMPLATE.md
```

## Archivo preexistente preservado, pero ignorado

```text
debug.log
```

- Tamaño: 131 bytes.
- SHA-256: `8B7F37ED24E846E3BE33D526D35E7DB7032B0A265338BD56277B70584E81D041`.
- `.gitignore` lo excluye mediante `*.log`.
- No borrarlo, editarlo ni forzar su stage. `git check-ignore debug.log` debe confirmarlo y `git diff --cached --name-only` no debe listarlo.

`debug.log` fue generado por un proceso preexistente y no pertenece al producto. Su presencia no impide que el worktree Git quede limpio porque permanece ignorado.

`next-env.d.ts` todavía no existe aquí y, cuando Next lo genere, también permanecerá ignorado porque cambia entre `dev` y `build`; no se versiona ni se añade al inventario tracked.
