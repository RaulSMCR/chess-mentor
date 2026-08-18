# Ollama local

## Alcance

Ollama es opcional y solo se consulta desde el proceso local. Su URL permitida
para el health es `http://127.0.0.1:11434`; no se expone a LAN, no se usa desde
Android y la aplicacion no descarga modelos.

## Comprobacion de servicio y modelos

Ejecutar en PowerShell:

```powershell
$base = 'http://127.0.0.1:11434'
Invoke-RestMethod "$base/api/tags" -Method Get
Invoke-RestMethod "$base/api/ps" -Method Get
```

Interpretacion:

| `/api/tags` | `/api/ps`   | Estado                  |
| ----------- | ----------- | ----------------------- |
| vacio       | vacio       | `none_installed`        |
| con modelos | vacio       | `installed_not_running` |
| con modelos | con modelos | `running`               |

La presencia en `/api/tags` demuestra instalacion, no que el modelo este
cargado. La evidencia debe indicar cual es el modelo elegido para embeddings.

## Evidencia manual

Conservar fuera de Git o en el registro de evidencia solo el resumen siguiente,
sin tokens ni respuestas completas:

```md
Fecha y hora UTC:
Responsable:
Host: 127.0.0.1
Servicio: available | unavailable
Modelo de embeddings elegido:
Modelo instalado: si | no
Modelo cargado en /api/ps: si | no
Prueba de embedding: PASS | FAIL | NOT RUN
Resultado del gate: PASS | NOT RUN
Notas:
```

Un modelo no instalado o no cargado deja el gate en `NOT RUN`. No ejecutar
`ollama pull` como parte de una tarjeta ni pegar credenciales en el repositorio.

## Degradacion esperada

Si Ollama no responde, la aplicacion debe conservar el entrenador
determinista, la biblioteca y la busqueda textual. La recuperacion semantica
degrada a `textual_fallback`; no se muestra una cita inventada.

## Automatizacion

La cobertura reproducible usa `OllamaHealth.ts` con HTTP fake y se ejecuta con:

```powershell
pnpm.cmd exec vitest run src/infrastructure/ai/OllamaHealth.test.ts
pnpm.cmd run verify
```

Estas pruebas no demuestran que Ollama real este instalado, cargado o
respondiendo en el equipo.
