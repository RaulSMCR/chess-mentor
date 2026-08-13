# Publicar en Vercel

Chess Mentor es una aplicación Next.js sin variables de entorno obligatorias.
Vercel detecta el framework y usa `pnpm-lock.yaml`; el proyecto requiere Node
24.15.x, ya fijado en `package.json`.

## Opción recomendada: conectar Git

1. Crea un repositorio privado en GitHub/GitLab/Bitbucket.
2. Sube este repositorio con sus commits locales.
3. En Vercel elige `Add New → Project`, importa el repositorio y pulsa
   `Deploy`.
4. Abre la URL HTTPS generada y usa `Agregar a pantalla de inicio` en Android.

## Opción CLI

Desde una terminal del proyecto, después de iniciar sesión:

```powershell
vercel.cmd login
vercel.cmd link
vercel.cmd --prod
```

La CLI puede pedir confirmación del equipo y del nombre del proyecto. No se
deben subir `.env.local`, libros, audios ni partidas privadas.

## Alcance de esta versión

Las partidas se guardan en `localStorage` del navegador. La URL de Vercel no
crea sincronización entre el teléfono y la PC, ni una base de datos compartida.
