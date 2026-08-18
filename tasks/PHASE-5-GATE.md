# CM-417 - Gate de Fase 5 y evidencias manuales

Estado inicial: `in_progress`

## Objetivo

Cerrar la matriz automatizada de Fase 5 y preparar la evidencia humana del
servicio Ollama local, sin descargar modelos ni afirmar que un modelo esta
cargado por la sola existencia de una instalacion.

## Resultado observable

El repositorio conserva un runbook reproducible para comprobar `/api/tags` y
`/api/ps` en `127.0.0.1`, distingue `none_installed`,
`installed_not_running` y `running`, y deja el gate en `ready_for_manual` hasta
recibir evidencia humana del modelo asignado y probado.

## Prerrequisitos

- `CM-416` en `complete`.
- No instalar ni descargar modelos durante la tarjeta.

## Decisiones congeladas

- D-014: Ollama permanece en loopback; no se expone a LAN.
- D-017: la ausencia de Ollama no rompe el entrenador determinista.
- D-022: no se usan libros, notas ni credenciales reales.
- D-023: el agente no convierte pruebas físicas o live en `PASS` sin evidencia
  humana conservada.

## Contrato congelado

- El gate automatizable exige `pnpm.cmd run verify` y `git diff --check` en
  cero.
- La evidencia live debe conservar fecha, responsable, host loopback,
  respuesta resumida de `/api/tags` y `/api/ps`, modelo elegido y resultado de
  una prueba de disponibilidad/embedding sin exponer secretos.
- `installed_not_running` no satisface el gate de modelo cargado.
- La app no ejecuta `ollama pull`, no carga modelos automáticamente y no
  contacta una URL LAN o cloud.
- El corpus insuficiente y las citas inválidas ya quedan cubiertos por CM-414;
  este gate no sustituye esas pruebas.

## Archivos permitidos

- `docs/OLLAMA.md`.
- `tasks/PHASE-5-GATE.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Modelos, libros, notas, secretos, tokens, respuestas completas con datos
  sensibles y artefactos pesados.
- Descargas, `ollama pull`, cambios de allowlist, `package.json`, lockfile,
  schema Prisma, componentes React y Route Handlers.

## Fuera de alcance

- Implementar un adaptador live de generación/embeddings o cambiar el modelo
  elegido.
- Gate Android, HTTPS, Tailscale, Drive, Obsidian y voz.

## Pasos exactos

1. Documentar el runbook y la plantilla de evidencia sin secretos.
2. Ejecutar la matriz automatizada disponible.
3. Consultar loopback sin prompts ni descargas y registrar el estado observado.
4. Cambiar a `ready_for_manual` si solo queda la confirmación humana del
   modelo asignado/cargado.

## Verificacion focal

```powershell
pnpm.cmd run verify
git diff --check
```

Resultado observado en esta ejecución:

- Automatización: PASS, 266 tests y build.
- Loopback: `/api/tags` disponible con 2 modelos instalados; `/api/ps`
  disponible con 0 modelos cargados, por lo que el estado es
  `installed_not_running`.

## Prueba manual

- `READY_FOR_MANUAL`: falta evidencia humana de modelo de embeddings elegido,
  instalado, cargado y probado. No declarar `PASS` todavía.

## Commit local de cierre

- Mensaje: `CM-417: prepare Ollama phase gate`.
- Stage permitido: `docs/OLLAMA.md tasks/PHASE-5-GATE.md tasks/STATUS.md`.
- Push: prohibido salvo peticion separada del usuario.

## Condiciones de parada

- Se necesita descargar/cargar un modelo, usar una URL no loopback o guardar
  una respuesta con secretos.
- Falta responsable, fecha o evidencia del modelo elegido.

## Rollback

Revertir unicamente el commit de CM-417 y eliminar el runbook de gate; no
modificar los adaptadores de Ollama ni las pruebas automatizadas anteriores.

## Handoff

Usar `docs/HANDOFF.md`.
