# Acceso móvil — Fase 1

Alcance: tablero con datos ficticios en Android dentro de la misma Wi-Fi. No cubre remoto, HTTPS ni micrófono.

## Iniciar

Antes, confirmar que el puerto 3000 no pertenece a otro proceso. Ejecutar `pnpm.cmd run dev:lan` en una segunda terminal supervisada, mantenerla abierta durante la prueba y detenerla con `Ctrl+C`; no lanzar un proceso sin conservar cómo finalizarlo.

```powershell
$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($existing) { throw 'Puerto 3000 ocupado; identificar el PID y no matar procesos ajenos' }
pnpm.cmd run dev:lan
```

El servidor escucha en todas las interfaces, pero se accede con la IPv4 activa del PC:

```powershell
Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -ne $null } |
  Select-Object -ExpandProperty IPv4Address |
  Select-Object IPAddress
```

Abrir en Android: `http://<IPv4>:3000`.

El almacenamiento es propio de cada origen y perfil. La colección de Android por IPv4 no se comparte con `127.0.0.1`/`localhost` del PC; usar siempre la misma URL durante un smoke y guardar/abrir la partida dentro del mismo navegador.

## Diagnóstico en orden

1. `http://127.0.0.1:3000` responde en el PC y contiene el heading exacto `Chess Mentor`.
2. El proceso propio escucha puerto 3000; comprobar PID, no solo puerto abierto.
3. Se usa la IPv4 del adaptador con default gateway, no VPN/virtual.
4. Ambos dispositivos están en la misma red y sin guest isolation.
5. Perfil Windows y Firewall permiten el puerto si el usuario lo aprueba.
6. No abrir 3210, 5432/5433 ni 11434.

## Seguridad

- Fase 1 no tiene autenticación LAN.
- No importar libros, notas, audios o partidas sensibles.
- Detener el servidor después de la prueba.
- No crear regla permanente de Firewall como parte automática del código.

## Aceptación

Usar la plantilla Android de `docs/TESTING.md`. Sin evidencia humana el estado es `NOT RUN`/`ready_for_manual`.

El acceso remoto privado y el micrófono se documentan en Fase 7B/7C después de HTTPS.
