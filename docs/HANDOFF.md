# Handoff obligatorio

Cada tarjeta termina con este bloque completo. No omitir campos; usar `None` o `NOT RUN` cuando corresponda.

```md
## Handoff

Tarea: CM-___ — título
Estado: complete | failed | blocked | ready_for_manual
SHA inicial:
SHA final: NOT COMMITTED | <sha local>
Implementation SHA (solo gates manuales): N/A | <sha>
Resultado observable:

### Alcance

Archivos modificados:
-

Archivos preexistentes preservados:
-

Dependencias/lockfile:

- None

Migraciones/datos:

- None

### Decisiones

Decisiones aplicadas:

- D-___

Decisiones nuevas o desviaciones:

- None

### Verificación

| Comando | Exit code | Resultado |
| ------- | --------: | --------- |
| `...`   |         0 | PASS      |

Pruebas automatizadas:
-

Pruebas manuales:

- NOT RUN — responsable y evidencia requerida

`git diff --check`:
`git diff --cached --check` antes del commit:
`git status --short`:

### Problemas

Errores encontrados:

- None

Reproducción mínima:

- None

Intentos realizados (máximo dos por causa): 1. 2.

Riesgos restantes:
-

### Recuperación

Rollback exacto de esta tarjeta:
-

### Siguiente paso

Siguiente tarjeta elegible:
Prerequisitos pendientes:
```

## Estados

- `complete`: todos los gates de la tarjeta pasan, incluidas pruebas manuales si la tarjeta las exige, y existe el commit local de cierre.
- `ready_for_manual`: automatización verde; falta exclusivamente evidencia humana descrita.
- `blocked`: dependencia/autorización ausente o misma causa tras dos remediaciones distintas.
- `failed`: se determinó que el resultado es incorrecto y hay que revertir/corregir antes de continuar.

## Reglas

- Un resumen narrativo no sustituye la tabla de comandos.
- No escribir “tests passed” sin comando y exit code.
- No escribir “Android verificado” sin dispositivo, navegador, URL, fecha y evidencia.
- Una tarjeta `complete` siempre tiene SHA final local. `NOT COMMITTED` solo es válido para `failed`/`blocked` con parche parcial; `ready_for_manual` también se commitea para que pueda reanudarse sobre worktree limpio.
- El commit incluye solo archivos permitidos y `tasks/STATUS.md`; nunca push automático.
- Rollback debe nombrar archivos/commit; “usar git” no es suficiente.
