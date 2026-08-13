# Accesos de un toque

## Teléfono Android

Con el servidor publicado en Vercel, abre la URL HTTPS en Chrome y elige
`⋮ → Agregar a pantalla de inicio` o `Instalar aplicación`. El manifiesto de
Chess Mentor usa modo independiente, por lo que se abre como una aplicación.

Durante el modo LAN también puedes agregar `http://<IPv4-del-PC>:3000` a la
pantalla de inicio, pero solo funcionará si la PC está encendida y ambos
dispositivos permanecen en la misma red Wi‑Fi.

## Windows

Haz doble clic en `tools/open-chess-mentor.cmd`. El script inicia `dev:lan` y
abre `http://127.0.0.1:3000`. Para crear un acceso directo: clic derecho sobre
el archivo → `Mostrar más opciones` → `Enviar a → Escritorio (crear acceso
directo)`.

El script no mata procesos ajenos. Para detener el servidor, cierra la ventana
`Chess Mentor LAN` que abrió el script.
