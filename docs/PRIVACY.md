# Privacidad y seguridad de datos

## Clasificación

| Clase                    | Ejemplos                           |              Git |                       Proveedor externo |
| ------------------------ | ---------------------------------- | ---------------: | --------------------------------------: |
| Fixture público/ficticio | PGN/FEN de pruebas                 |               Sí |             Solo si una prueba lo exige |
| Dato de aplicación       | partidas, ejercicios, progreso     |   No por defecto |                        Solo sync opt-in |
| Contenido bibliográfico  | originales, páginas, chunks, citas | Nunca originales |     Solo fragmento recuperado necesario |
| Nota personal            | vault, comentarios, debates        |            Nunca |          Solo opt-in y fragmento mínimo |
| Secreto                  | tokens, API keys, passwords        |            Nunca |           Solo endpoint correspondiente |
| Biométrico/voz           | audio y transcripción              |            Nunca | Solo proveedor elegido y consentimiento |

## Reglas

- Local por defecto y consentimiento por proveedor/capacidad.
- Originales inmutables y fuera del repositorio.
- Logs no incluyen texto de libros, prompts completos, tokens, rutas privadas ni audio.
- Diagnósticos exponen estados/códigos, no secretos.
- Toda subida valida tamaño, tipo real y nombre; las rutas se resuelven dentro de directorios configurados.
- Markdown/HTML extraído se trata como no confiable y se sanea antes de renderizar.
- Next Client Components nunca reciben service role keys, worker token, DB URL o tokens OAuth.
- `NEXT_PUBLIC_*` se limita a valores deliberadamente públicos.
- LAN de Fase 1 usa solo fixtures ficticios porque aún no hay auth.
- Tailscale/HTTPS no sustituye la autorización de aplicación para datos sensibles.

## Proveedores de IA

- Ollama es el proveedor por defecto local.
- Proveedores cloud están desactivados sin clave/configuración explícita.
- La petición externa contiene solo los chunks recuperados y el contexto mínimo.
- No se envía un libro completo, vault completo, índice ni conversación ajena.
- La app debe mostrar qué proveedor recibirá datos antes de habilitarlo.

## Retención y borrado futuros

- Original, derivados, embeddings, análisis y notas tienen ciclos separados.
- Borrar un derivado no borra el original.
- Borrar una referencia sincronizada crea tombstone; no resucita por un dispositivo offline.
- Backups y Drive necesitan política de retención explícita antes de producción.
- Durante desarrollo se usan fixtures; nunca copiar datos reales para arreglar un test.

## Incidente

Ante exposición accidental:

1. Detener servicio/sync afectado.
2. No borrar evidencia/logs relevantes sin autorización.
3. Identificar dato, destino, tiempo y credencial.
4. Revocar/rotar credencial si aplica.
5. Retirar el dato de Git/historial/remoto con procedimiento aprobado.
6. Añadir regresión y documentar el incidente sin repetir el secreto.
