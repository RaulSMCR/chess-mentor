@echo off
setlocal
cd /d "%~dp0.."

echo Iniciando Chess Mentor en modo LAN...
start "Chess Mentor LAN" /min cmd /c "pnpm.cmd run dev:lan"
timeout /t 5 /nobreak >nul
start "" "http://127.0.0.1:3000"
echo Chess Mentor se abrio en el navegador.
echo Para detenerlo, cierra la ventana del servidor "Chess Mentor LAN".
endlocal
