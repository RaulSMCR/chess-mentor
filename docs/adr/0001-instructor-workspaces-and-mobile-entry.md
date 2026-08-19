# ADR-0001 - Modos de trabajo, instructor y entrada movil

- Estado: accepted
- Fecha: 2026-08-19
- Aprobacion: el usuario acepto la recomendacion de separar Practica e
  Instructor y mantener una entrada por shortcut.

## Contexto

La aplicacion actual abre directamente el tablero y ofrece las vistas Partida y
Entrenador. El entrenador permite crear un ejercicio manual desde FEN, jugadas
aceptadas y pistas, pero no relaciona el ejercicio con una fuente, una sesion de
estudio o una postura de autor. La biblioteca, la recuperacion, los claims, el
motor y el catalogo de autores existen como contratos separados y todavia no
forman una experiencia de instructor.

El telefono se usa desde un shortcut instalado. La URL publica de Vercel puede
ejecutar capacidades del navegador, pero no puede alcanzar la biblioteca,
PostgreSQL u Ollama del PC. La URL LAN HTTP depende de una IPv4 dinamica, no
tiene autenticacion de aplicacion y no es adecuada para exponer corpus real.

El producto necesita:

- elegir claramente entre Practica e Instructor al iniciar;
- cargar ejercicios manuales, bibliograficos o de repositorios;
- generar borradores de ejercicio desde una sesion de instructor;
- discutir una posicion mientras se mueven piezas y se solicita analisis o
  prospectiva;
- permitir elegir la respuesta de la contraparte solo en Instructor;
- conservar fuente, inferencia, motor y sintesis IA como categorias distintas.

## Decision

### 1. Entrada y capacidades

La instalacion personal canonica sera una PWA abierta desde un unico shortcut.
Su ruta inicial mostrara un menu que explica y permite elegir `Practica` o
`Instructor`.

El destino final de ese shortcut personal sera una URL HTTPS privada que sirva
la instancia local de Next.js. Tailscale es la opcion prevista por D-014; su
instalacion y gate siguen siendo humanos. Solo Next.js puede exponerse. Worker,
Ollama, PostgreSQL, archivos y otros servicios permanecen en loopback.

La publicacion de Vercel se conserva como demo y practica con capacidades de
navegador. No promete acceso a recursos locales. El menu mostrara capacidades
no disponibles con una causa comprensible; nunca simulara que el instructor
local esta conectado. El acceso LAN HTTP queda como diagnostico temporal con
fixtures ficticios, no como entrada personal canonica.

### 2. Modos

`Practica` consume ejercicios aprobados. La politica de respuesta esta fijada
por el ejercicio y la interfaz no muestra un selector para la contraparte.
Stockfish o IA pueden enriquecer una explicacion, pero su ausencia no impide
resolver ni programar la repeticion.

`Instructor` es una sesion de estudio situada en el tablero. Permite elegir
fuentes, recorrer variantes, formular preguntas, solicitar analisis y
prospectiva, y seleccionar una respuesta legal de la contraparte entre
candidatos con origen explicito. Una jugada de fuente, una sugerencia de motor
y una eleccion manual nunca se presentan como equivalentes ni se atribuyen a
un autor sin evidencia.

### 3. Sesion de instructor

El dominio incorporara un documento versionado e inmutable para la sesion. El
contrato conservara, como minimo:

- identidad, revision y timestamps UTC;
- documento de partida o referencia estable a su snapshot;
- nodo del tablero asociado a cada intervencion;
- referencias opacas a biblioteca, repositorio, autor, concepto y citas;
- preguntas y respuestas estructuradas;
- analisis de motor separado de claims bibliograficos;
- politica y seleccion de respuesta de la contraparte;
- IDs de borradores de ejercicio derivados de la sesion.

El contrato de dominio no importa React, red, almacenamiento ni proveedores.
Una respuesta generativa sin evidencia suficiente se conserva como
`unsupported` y no bloquea el tablero ni Stockfish.

### 4. Ejercicios y procedencia

Se introduce un contrato `ExerciseV2` compatible por lectura con `ExerciseV1`.
V2 agrega procedencia, continuacion de la contraparte y revision, sin cambiar
silenciosamente los registros V1 existentes.

Un ejercicio puede originarse en:

- creacion manual;
- entrada aprobada de biblioteca;
- partida o coleccion PGN usada como repositorio de ejercicios;
- registro de autor/teoria respaldado y revisado;
- snapshot de una sesion de instructor.

Toda carga o generacion produce primero un borrador. El borrador registra
posicion, nodo de origen, jugadas aceptadas, posibles respuestas de la
contraparte, pistas, dificultad y referencias de procedencia. Solo una revision
humana explicita puede aprobarlo para Practica. Las propuestas de Stockfish se
etiquetan `engine`; no se convierten en postura de autor.

### 5. Respuesta de la contraparte

Instructor admite tres origenes de candidato:

- continuacion conservada por una fuente o repositorio;
- candidato calculado por Stockfish;
- jugada legal elegida manualmente.

La seleccion se registra junto con el nodo, UCI y origen. Los candidatos
ilegales, obsoletos o calculados para otra posicion se descartan. Practica usa
la continuacion aprobada del ejercicio y no expone este selector.

### 6. Orquestacion de respuestas

La respuesta del instructor compone resultados existentes sin fusionar sus
autoridades:

1. snapshot de posicion y pregunta;
2. recuperacion bibliografica con localizadores;
3. analisis cancelable de Stockfish;
4. generacion opcional mediante `AIProvider`;
5. verificacion de claims y citas;
6. respuesta estructurada con estado de suficiencia.

La prospectiva es una o mas lineas futuras etiquetadas por origen. No modifica
el arbol hasta que el usuario elige jugar o incorporar una variante.

## Opciones consideradas

### Mantener una unica vista con pestanas

Rechazada. Oculta diferencias de autoridad y permite que controles propios del
instructor aparezcan durante una practica evaluada.

### Usar Vercel como unica instalacion

Rechazada para el instructor personal. El despliegue publico no puede alcanzar
servicios ni originales locales y no debe recibir libros privados por defecto.

### Usar LAN HTTP como instalacion personal

Rechazada. La IP puede cambiar, falta autenticacion de aplicacion y el contexto
no es HTTPS. Se conserva solo para diagnostico con fixtures.

### PWA privada HTTPS mas demo publica

Aceptada. Mantiene una entrada de un toque, respeta la topologia loopback y
permite degradar capacidades de forma explicita.

## Compatibilidad y migracion

- `GameDocumentV1`, partidas guardadas y sus claves no cambian.
- `ExerciseV1` sigue siendo legible y practicable. La migracion a V2 es
  explicita, idempotente y no inventa fuentes.
- Los ejercicios V1 migrados usan origen `legacy_manual` y no reciben citas ni
  respuestas de contraparte inferidas.
- La PWA mantiene `/` como entrada; el cambio visible es el menu inicial.
- `localhost`, IPv4 LAN, Vercel y HTTPS privado siguen siendo origenes de
  navegador distintos. No se promete compartir LocalStorage entre ellos.
- Los registros sincronizables futuros usan UUID, version, timestamps,
  `deviceId` y tombstone segun D-021.

## Seguridad y gates

- No se importan libros, notas o ejercicios privados por LAN HTTP.
- El navegador nunca recibe URL ni token de worker, Ollama o PostgreSQL.
- La API de instructor valida tamano, formato, identidad de posicion y
  procedencia en el servidor.
- Android, shortcut HTTPS privado, autenticacion y Tailscale requieren evidencia
  humana antes de declarar acceso movil al instructor.
- Ningun gate automatico afirma que una cita prueba semanticamente una postura;
  la revision humana sigue siendo obligatoria.

## Consecuencias

- La construccion continua con contratos puros antes de UI y proveedores reales.
- El menu puede mostrar Instructor como no disponible mientras falten
  capacidades; esto es un estado valido y testeable.
- La generacion desde una sesion no publica automaticamente un ejercicio.
- Se agrega una fase integrada de escritorio antes del gate movil privado.
- La version publica sigue siendo util para demostracion y practica, pero no es
  la autoridad de datos personales del instructor.

## Plan de entrega

Las tarjetas `CM-503` a `CM-515` de `tasks/PHASE-6-INSTRUCTOR.md` implementan
esta decision en orden. Cada tarjeta mantiene fixtures ficticios hasta que una
tarjeta de gate solicite de forma explicita una fuente real seleccionada por el
usuario.
