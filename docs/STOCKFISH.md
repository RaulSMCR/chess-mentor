# Stockfish para Chess Mentor

## Estado de CM-119

El 13 de agosto de 2026 el usuario autorizó utilizar los archivos de
Stockfish 18 lite single-threaded para navegador. Se descargaron
temporalmente fuera del repositorio, se calcularon sus SHA-256 y se registró
el resultado en `fixtures/phase2/stockfish-manifest.json`.

CM-119 dejó los binarios fuera del repositorio. CM-120 los copia ahora a
`public/stockfish/` junto con `Copying.txt` para que el Worker del navegador
pueda cargarlos. No se distribuye un ejecutable nativo.

## Asset aprobado

| Archivo                         | Paquete            |          Tamaño | SHA-256                                                            |
| ------------------------------- | ------------------ | --------------: | ------------------------------------------------------------------ |
| `stockfish-18-lite-single.js`   | `stockfish@18.0.5` |    20,670 bytes | `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe` |
| `stockfish-18-lite-single.wasm` | `stockfish@18.0.5` | 7,295,411 bytes | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |

Descargas exactas usadas para la medición:

- <https://unpkg.com/stockfish@18.0.5/bin/stockfish-18-lite-single.js>
- <https://unpkg.com/stockfish@18.0.5/bin/stockfish-18-lite-single.wasm>

El paquete de navegador procede de [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js/), que documenta la variante lite single-threaded y su uso en Web Worker. El motor aguas arriba es [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish), release `sf_18`:

- <https://github.com/official-stockfish/Stockfish/releases/tag/sf_18>
- <https://github.com/official-stockfish/Stockfish>

La URL de CDN es una distribución del build JavaScript/WASM; no se debe
describir como un binario oficial de Windows. El manifest conserva ambas
procedencias para distinguir el build de navegador del proyecto upstream.

## Licencia

Stockfish se distribuye bajo **GNU GPL v3**. La copia de la licencia utilizada
para la verificación está publicada en:

- <https://raw.githubusercontent.com/nmrugg/stockfish.js/master/Copying.txt>
- <https://github.com/official-stockfish/Stockfish#terms-of-use>

Si Chess Mentor distribuye el JS/WASM, debe conservar el aviso de licencia y
ofrecer el código fuente correspondiente o un puntero válido para obtenerlo,
además de cumplir las obligaciones de GPLv3 aplicables a la combinación
distribuida. Esta nota no sustituye asesoramiento jurídico.

## Verificación reproducible

Con los dos archivos colocados en una carpeta local, ejecutar:

```powershell
pwsh -File .\tools\verify-stockfish.ps1 -AssetDirectory C:\ruta\a\los\assets
```

En Windows PowerShell también puede ejecutarse:

```powershell
.\tools\verify-stockfish.ps1 -AssetDirectory C:\ruta\a\los\assets
```

El script falla si falta un asset, aparece una variante distinta, cambia el
tamaño, no coincide el SHA-256 o el manifest no declara GPL-3.0. Por defecto
busca en `public\stockfish`, que ahora contiene los dos assets aprobados.

## Integración CM-120

Los archivos versionados en `public/stockfish/` son exactamente los que figuran
en el manifest. El loader JS busca `stockfish-18-lite-single.wasm` en el mismo
directorio y el adaptador lo ejecuta en un Worker clásico, sin
`SharedArrayBuffer`, COOP ni COEP.

## Alcance de distribución

- CM-119: procedencia, licencia, tamaños y hashes registrados.
- CM-120: integración opcional en Web Worker completada; la UI todavía no la
  consume hasta CM-123.
- No se distribuye un ejecutable nativo ni se instala Stockfish en el sistema.
- No se modifica `package.json` ni se añade una dependencia para el motor.
