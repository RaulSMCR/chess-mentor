# Fase 6B - Workspace de instructor y ejercicios derivados

Esta fase ejecuta ADR-0001. Cada tarjeta se realiza en un turno separado y usa
solo fixtures ficticios hasta el gate que autorice una fuente real.

---

# CM-503 - Contrato de sesion de instructor

Estado inicial: `pending`

## Objetivo

Definir un documento de dominio serializable e inmutable para estudiar una
posicion con fuentes, dialogo, motor y respuesta de la contraparte.

## Resultado observable

Una fabrica valida sesiones, turnos, referencias de fuente, nodos del tablero y
selecciones legales de contraparte sin depender de React, red o almacenamiento.

## Prerrequisitos

- `CM-502` en `complete`.

## Decisiones congeladas

- ADR-0001 secciones 2, 3 y 5; D-005, D-008, D-019 y D-023.

## Contrato congelado

- `InstructorSessionV1` conserva identidad, revision, timestamps, snapshot de
  `GameDocumentV1`, fuentes, turnos y borradores derivados.
- Cada turno referencia un `nodeId` existente y separa pregunta, respuesta
  estructurada, analisis de motor y seleccion de contraparte.
- El origen de una respuesta de contraparte es `source`, `engine` o `manual`.
- La fabrica clona entradas y rechaza referencias rotas, UCI ilegal, IDs
  duplicados y timestamps no UTC.

## Archivos permitidos

- `src/domain/instructor/model.ts`.
- `src/domain/instructor/model.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Componentes, Route Handlers, repositorios, proveedores y datos reales.

## Fuera de alcance

- Generar respuestas, guardar sesiones o crear ejercicios.

## Pasos exactos

1. Definir tipos, errores, fabrica y validador versionados.
2. Validar referencias contra el snapshot del arbol y legalidad con chess.js.
3. Probar serializacion, inmutabilidad y casos invalidos.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/domain/instructor/model.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: contrato puro.

## Commit local de cierre

- Mensaje: `CM-503: define instructor session contract`.
- Stage: `src/domain/instructor/model.ts src/domain/instructor/model.test.ts tasks/STATUS.md`.

## Condiciones de parada

- El dominio necesita importar React, almacenamiento o un proveedor.

## Rollback

Revertir solo el commit de CM-503.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-504 - Ejercicio V2 con procedencia y continuacion

Estado inicial: `pending`

## Objetivo

Agregar un contrato de ejercicio versionado que preserve origen, revision y
respuestas de contraparte sin romper `ExerciseV1`.

## Resultado observable

Ejercicios manuales, bibliograficos, de repositorio, autor o sesion pueden
representarse como borrador V2; un V1 migra de forma idempotente sin inventar
fuentes.

## Prerrequisitos

- `CM-503` en `complete`.

## Decisiones congeladas

- ADR-0001 secciones 4 y 5; D-025 a D-029.

## Contrato congelado

- `ExerciseV2` agrega `origin`, referencias de fuente, continuaciones de
  contraparte y estado `draft`, `approved` o `rejected`.
- Solo `approved` es elegible para Practica.
- La migracion V1 usa `legacy_manual`, conserva todos los valores existentes y
  no agrega citas ni continuaciones inferidas.

## Archivos permitidos

- `src/domain/trainer/model-v2.ts`.
- `src/domain/trainer/model-v2.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Persistencia, UI, proveedores, schema Prisma y datos reales.

## Fuera de alcance

- Guardar V2 o construirlo desde una fuente.

## Pasos exactos

1. Definir V2, origenes, revision y errores.
2. Implementar validacion y migracion V1 a V2.
3. Probar legalidad, compatibilidad e inmutabilidad.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/domain/trainer/model-v2.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: contrato puro.

## Commit local de cierre

- Mensaje: `CM-504: version sourced exercises`.
- Stage: `src/domain/trainer/model-v2.ts src/domain/trainer/model-v2.test.ts tasks/STATUS.md`.

## Condiciones de parada

- La migracion altera un V1 o atribuye procedencia inexistente.

## Rollback

Revertir solo el commit de CM-504; V1 permanece intacto.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-505 - Generar borrador desde una sesion

Estado inicial: `pending`

## Objetivo

Transformar explicitamente un nodo y contexto de instructor en un borrador de
ejercicio V2 revisable.

## Resultado observable

El usuario puede seleccionar una posicion de una sesion, declarar jugadas
aceptadas, pistas y dificultad, y obtener un borrador enlazado al snapshot,
fuentes y claims usados.

## Prerrequisitos

- `CM-504` en `complete`.

## Decisiones congeladas

- ADR-0001 seccion 4; D-019 y D-025 a D-029.

## Archivos permitidos

- `src/domain/instructor/createExerciseDraft.ts`.
- `src/domain/instructor/createExerciseDraft.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- IA, Stockfish en vivo, UI, repositorios y red.

## Fuera de alcance

- Aprobar el borrador o decidir jugadas por el usuario.

## Pasos exactos

1. Validar nodo, FEN, acceptedMoves, pistas y referencias.
2. Copiar solo evidencia presente en la sesion.
3. Producir siempre estado `draft` e historial inicial auditable.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/domain/instructor/createExerciseDraft.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: servicio de dominio.

## Commit local de cierre

- Mensaje: `CM-505: derive exercise drafts from sessions`.
- Stage: `src/domain/instructor/createExerciseDraft.ts src/domain/instructor/createExerciseDraft.test.ts tasks/STATUS.md`.

## Condiciones de parada

- El servicio publica o aprueba automaticamente el ejercicio.

## Rollback

Revertir solo el commit de CM-505.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-506 - Candidatos desde biblioteca y repositorios

Estado inicial: `pending`

## Objetivo

Adaptar entradas del catalogo, partidas PGN y repositorios de ejercicios a
candidatos normalizados, sin tratarlos aun como ejercicios aprobados.

## Resultado observable

Una coleccion PGN o entrada bibliografica produce candidatos con FEN, linea,
localizador y hash; un registro del entrenador conserva su identidad y version.

## Prerrequisitos

- `CM-505` en `complete`.

## Decisiones congeladas

- ADR-0001 seccion 4; D-018, D-019 y D-021.

## Archivos permitidos

- `src/application/instructor/ExerciseSourceAdapter.ts`.
- `src/application/instructor/ExerciseSourceAdapter.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Descargas remotas, scraping, UI, datos reales y cambios de extractores.

## Fuera de alcance

- Repositorios externos sin contrato, licencias o autenticacion definidos.

## Pasos exactos

1. Definir una frontera extensible para `library`, `pgn_repository` y
   `trainer_repository`.
2. Preservar hashes, localizadores, orden de variantes e identidad.
3. Devolver errores tipados y candidatos en estado no aprobado.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/application/instructor/ExerciseSourceAdapter.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: fixtures ficticios.

## Commit local de cierre

- Mensaje: `CM-506: adapt instructor exercise sources`.
- Stage: `src/application/instructor/ExerciseSourceAdapter.ts src/application/instructor/ExerciseSourceAdapter.test.ts tasks/STATUS.md`.

## Condiciones de parada

- Una fuente pierde hash/localizador o requiere red no aprobada.

## Rollback

Revertir solo el commit de CM-506.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-507 - Interpretaciones de autor como fuente revisada

Estado inicial: `pending`

## Objetivo

Vincular catalogo, registros de autor y evidencia recuperada para proponer
ejercicios sin inventar posturas.

## Resultado observable

Solo un registro `approved` o `corrected`, cuyas citas coinciden con evidencia
conservada, puede originar un candidato de ejercicio de autor.

## Prerrequisitos

- `CM-506` en `complete`.

## Decisiones congeladas

- ADR-0001 seccion 4; D-019 y contratos CM-500/CM-501.

## Archivos permitidos

- `src/application/instructor/AuthorExerciseSource.ts`.
- `src/application/instructor/AuthorExerciseSource.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Perfilado automatico, corpus real, UI y decisiones automaticas de verdad.

## Fuera de alcance

- Inferir FEN desde prosa sin posicion conservada.

## Pasos exactos

1. Resolver IDs de autor/concepto contra el catalogo.
2. Verificar estado humano y referencias contra evidencia.
3. Rechazar `unsupported`, pendientes y asociaciones sin posicion.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/application/instructor/AuthorExerciseSource.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: fixtures ficticios.

## Commit local de cierre

- Mensaje: `CM-507: bind reviewed author exercise sources`.
- Stage: `src/application/instructor/AuthorExerciseSource.ts src/application/instructor/AuthorExerciseSource.test.ts tasks/STATUS.md`.

## Condiciones de parada

- Se intenta atribuir `engine` o `user_hypothesis` a un autor.

## Rollback

Revertir solo el commit de CM-507.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-508 - Orquestador de analisis y prospectiva

Estado inicial: `pending`

## Objetivo

Componer recuperacion, motor, IA opcional y verificador en una respuesta de
instructor cancelable y con procedencia.

## Resultado observable

La misma pregunta y snapshot con fakes produce una respuesta estructurada que
separa citas, inferencias, Stockfish y sintesis; ausencia de IA degrada a
fuentes/motor o `unsupported`.

## Prerrequisitos

- `CM-507` en `complete`.

## Decisiones congeladas

- ADR-0001 seccion 6; D-016, D-017 y D-019.

## Archivos permitidos

- `src/application/instructor/InstructorResponseService.ts`.
- `src/application/instructor/InstructorResponseService.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Componentes, Route Handlers, Ollama real, modelos y red.

## Fuera de alcance

- Renderizar chat o ejecutar proveedores live.

## Pasos exactos

1. Definir requestId, snapshot y cancelacion.
2. Recuperar evidencia, analizar, generar opcionalmente y verificar claims.
3. Descartar resultados obsoletos y devolver prospectiva sin mutar el arbol.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/application/instructor/InstructorResponseService.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: usa fakes.

## Commit local de cierre

- Mensaje: `CM-508: orchestrate sourced instructor responses`.
- Stage: `src/application/instructor/InstructorResponseService.ts src/application/instructor/InstructorResponseService.test.ts tasks/STATUS.md`.

## Condiciones de parada

- Una respuesta no verificada se presenta como cita o postura confirmada.

## Rollback

Revertir solo el commit de CM-508.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-509 - Repositorios locales de sesiones y ejercicios V2

Estado inicial: `pending`

## Objetivo

Persistir sesiones y ejercicios V2 detras de interfaces separadas, preservando
los datos V1 existentes.

## Resultado observable

Adaptadores memoria/localStorage guardan, listan y abren copias validadas; una
migracion V1 es explicita y un payload corrupto nunca se borra silenciosamente.

## Prerrequisitos

- `CM-508` en `complete`.

## Decisiones congeladas

- ADR-0001 compatibilidad; D-010, D-021 y D-029.

## Archivos permitidos

- `src/infrastructure/instructor/InstructorSessionRepository.ts`.
- `src/infrastructure/instructor/MemoryInstructorSessionRepository.ts`.
- `src/infrastructure/instructor/LocalStorageInstructorSessionRepository.ts`.
- `src/infrastructure/instructor/InstructorSessionRepository.test.ts`.
- `src/infrastructure/trainer/ExerciseV2Repository.ts`.
- `src/infrastructure/trainer/ExerciseV2Repository.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Prisma, UI, red y datos reales.

## Fuera de alcance

- Sincronizacion entre origenes o dispositivos.

## Pasos exactos

1. Definir envelopes y errores versionados.
2. Implementar memoria/localStorage con validacion antes de escribir.
3. Probar corrupcion, cuota, inmutabilidad y compatibilidad V1.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/infrastructure/instructor/InstructorSessionRepository.test.ts src/infrastructure/trainer/ExerciseV2Repository.test.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: adaptadores probados con storage fake.

## Commit local de cierre

- Mensaje: `CM-509: persist instructor sessions and sourced exercises`.
- Stage: rutas permitidas de CM-509 y `tasks/STATUS.md`.

## Condiciones de parada

- La escritura altera claves V1 o necesita migracion destructiva.

## Rollback

Revertir solo el commit de CM-509; no borrar LocalStorage del usuario.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-510 - Contratos HTTP y composicion local del instructor

Estado inicial: `pending`

## Objetivo

Exponer por mismo origen capacidades, fuentes y respuestas del instructor sin
filtrar URLs o secretos de servicios loopback.

## Resultado observable

Route Handlers validados permiten consultar capacidades, listar/importar una
fixture soportada y solicitar una respuesta; Vercel informa degradacion sin
intentar contactar el PC.

## Prerrequisitos

- `CM-509` en `complete`.

## Decisiones congeladas

- ADR-0001 secciones 1 y 6; D-011, D-014 y D-023.

## Archivos permitidos

- `src/server/instructor/contracts.ts`.
- `src/server/instructor/contracts.test.ts`.
- `src/server/instructor/service.ts`.
- `src/server/instructor/service.test.ts`.
- `src/app/api/instructor/capabilities/route.ts`.
- `src/app/api/instructor/capabilities/route.test.ts`.
- `src/app/api/instructor/sources/route.ts`.
- `src/app/api/instructor/sources/route.test.ts`.
- `src/app/api/instructor/respond/route.ts`.
- `src/app/api/instructor/respond/route.test.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Nuevas dependencias, exposicion directa de puertos, corpus real y UI.

## Fuera de alcance

- Autenticacion/Tailscale y proveedores live.

## Pasos exactos

1. Fijar schemas de request/response, limites y codigos.
2. Componer repositorios y fakes solo del lado servidor.
3. Probar mismo origen, no-cache, degradacion cloud y ausencia de secretos.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/server/instructor src/app/api/instructor
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: no se contactan servicios reales.

## Commit local de cierre

- Mensaje: `CM-510: expose local instructor contracts`.
- Stage: rutas permitidas de CM-510 y `tasks/STATUS.md`.

## Condiciones de parada

- El HTML/JSON revela URL, token o path privado del host.

## Rollback

Revertir solo el commit de CM-510.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-511 - Menu inicial y entrada PWA por modos

Estado inicial: `pending`

## Objetivo

Reemplazar la entrada directa al tablero por un menu accesible que explique
Practica e Instructor y muestre sus capacidades reales.

## Resultado observable

El shortcut abre `/`, presenta ambos modos, permite entrar y volver al menu, y
explica por que una capacidad local no esta disponible en la version publica.

## Prerrequisitos

- `CM-510` en `complete`.

## Decisiones congeladas

- ADR-0001 secciones 1 y 2; D-004 y D-014.

## Archivos permitidos

- `src/app/page.tsx`.
- `src/app/page.test.tsx`.
- `src/app/manifest.ts`.
- `src/app/globals.css`.
- `src/features/workspace/WorkspaceShell.tsx`.
- `src/features/workspace/WorkspaceShell.test.tsx`.
- `src/features/workspace/WorkspaceMenu.tsx`.
- `src/features/workspace/WorkspaceMenu.test.tsx`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Dominio, repositorios, proveedores y datos reales.

## Fuera de alcance

- Completar aun la UI de Instructor.

## Pasos exactos

1. Consultar capabilities de mismo origen con fallback seguro.
2. Renderizar tarjetas Practica/Instructor y estados disponibles.
3. Mantener heading, touch, PWA y navegacion accesible.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/app/page.test.tsx src/features/workspace
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: el gate integrado posterior cubre shortcut real.

## Commit local de cierre

- Mensaje: `CM-511: add workspace mode menu`.
- Stage: rutas permitidas de CM-511 y `tasks/STATUS.md`.

## Condiciones de parada

- El menu afirma que Instructor esta disponible sin capability positiva.

## Rollback

Revertir solo el commit de CM-511.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-512 - Workspace visual de instructor

Estado inicial: `pending`

## Objetivo

Integrar tablero, fuentes, dialogo, analisis/prospectiva y selector de
contraparte en el modo Instructor.

## Resultado observable

Con fixtures, el usuario abre una fuente, mueve piezas, pregunta por la
posicion, navega una prospectiva, elige una respuesta legal de contraparte y
guarda un borrador de ejercicio derivado.

## Prerrequisitos

- `CM-511` en `complete`.

## Decisiones congeladas

- ADR-0001 secciones 2 a 6; D-004, D-008, D-016 y D-019.

## Archivos permitidos

- `src/features/instructor/InstructorWorkspace.tsx`.
- `src/features/instructor/InstructorWorkspace.test.tsx`.
- `src/features/instructor/SourcePanel.tsx`.
- `src/features/instructor/SourcePanel.test.tsx`.
- `src/features/instructor/InstructorDialogue.tsx`.
- `src/features/instructor/InstructorDialogue.test.tsx`.
- `src/features/instructor/CounterpartSelector.tsx`.
- `src/features/instructor/CounterpartSelector.test.tsx`.
- `src/features/workspace/WorkspaceShell.tsx`.
- `src/app/globals.css`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Proveedores live, nuevas dependencias y corpus real.

## Fuera de alcance

- Gate Android y sincronizacion cloud.

## Pasos exactos

1. Cargar fuentes/capabilities por mismo origen.
2. Reusar tablero/arbol sin duplicar estado canonico.
3. Mostrar claims/citas/motor separados y prospectiva no destructiva.
4. Limitar selector de contraparte al modo Instructor.
5. Crear y guardar solo borradores de ejercicio.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/features/instructor
```

## Verificacion global

```powershell
pnpm.cmd run verify
git diff --check
```

## Prueba manual

- `NOT RUN`: la tarjeta usa fixtures; gate posterior.

## Commit local de cierre

- Mensaje: `CM-512: build instructor workspace`.
- Stage: rutas permitidas de CM-512 y `tasks/STATUS.md`.

## Condiciones de parada

- Prospectiva muta la partida sin accion explicita o el selector aparece en
  Practica.

## Rollback

Revertir solo el commit de CM-512.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-513 - Practica con ejercicios cargados o derivados

Estado inicial: `pending`

## Objetivo

Permitir que Practica abra ejercicios V1 o V2 aprobados, incluidos los creados
desde Instructor, sin exponer controles de seleccion de contraparte.

## Resultado observable

Un borrador aprobado en Instructor aparece en la biblioteca de Practica; el
flujo ejecuta su continuacion fija, conserva pistas/scheduler y rechaza
borradores pendientes.

## Prerrequisitos

- `CM-512` en `complete`.

## Decisiones congeladas

- ADR-0001 secciones 2, 4 y 5; D-025 a D-029.

## Archivos permitidos

- `src/features/trainer/TrainerPanel.tsx`.
- `src/features/trainer/TrainerPanel.test.tsx`.
- `src/features/trainer/approvedExercise.ts`.
- `src/features/trainer/approvedExercise.test.ts`.
- `src/features/workspace/WorkspaceShell.tsx`.
- `src/app/globals.css`.
- `tests/e2e/trainer.spec.ts`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- IA live, fuentes reales y cambios de scheduler.

## Fuera de alcance

- Editar procedencia durante un intento.

## Pasos exactos

1. Unificar lectura V1/V2 mediante adaptador.
2. Filtrar V2 no aprobados.
3. Aplicar respuesta aprobada de contraparte sin selector.
4. Preservar puntuacion, pistas y repeticion.

## Verificacion focal

```powershell
pnpm.cmd exec vitest run src/features/trainer tests/e2e/trainer.spec.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify:phase1
git diff --check
```

## Prueba manual

- `NOT RUN`: gate integrado posterior.

## Commit local de cierre

- Mensaje: `CM-513: practice sourced instructor exercises`.
- Stage: rutas permitidas de CM-513 y `tasks/STATUS.md`.

## Condiciones de parada

- Practica permite elegir la respuesta o usa un borrador no aprobado.

## Rollback

Revertir solo el commit de CM-513.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-514 - Gate integrado de instructor en escritorio

Estado inicial: `pending`

## Objetivo

Validar con fixtures el recorrido completo desde shortcut/menu hasta sesion,
respuesta, borrador aprobado y practica.

## Resultado observable

E2E prueba ambos modos, carga PGN ficticio, citas visibles, motor etiquetado,
selector solo en Instructor, generacion/revision y consumo del ejercicio.

## Prerrequisitos

- `CM-513` en `complete`.

## Decisiones congeladas

- ADR-0001 completa; D-012, D-019 y D-023.

## Archivos permitidos

- `tests/e2e/instructor.spec.ts`.
- `fixtures/phase6/instructor/**`.
- `docs/evidence/phase6-instructor-<date>.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Correcciones de producto, corpus real y configuracion externa.

## Fuera de alcance

- Android, Tailscale, Ollama live y fuentes privadas.

## Pasos exactos

1. Ejecutar matriz automatizada y E2E en Edge.
2. Comprobar que no aparecen secretos ni atribuciones sin evidencia.
3. Si hay bug, marcar CM-514 `failed` y reabrir la tarjeta causante.

## Verificacion focal

```powershell
pnpm.cmd run verify
pnpm.cmd exec playwright test tests/e2e/instructor.spec.ts
```

## Verificacion global

```powershell
pnpm.cmd run verify:phase1
git diff --check
```

## Prueba manual

- Windows/Edge con fixtures: registrar `PASS` o `FAIL`.

## Commit local de cierre

- Mensaje: `CM-514: gate instructor workspace`.
- Stage: rutas permitidas de CM-514 y `tasks/STATUS.md`.

## Condiciones de parada

- Falla funcional, cita invalida o proceso/puerto ajeno.

## Rollback

Revertir solo el commit de CM-514; no borrar datos externos.

## Handoff

Usar `docs/HANDOFF.md`.

---

# CM-515 - Shortcut HTTPS privado y gate Android

Estado inicial: `pending`

## Objetivo

Preparar y validar la instalacion personal del shortcut contra una URL HTTPS
privada que expone solo Next.js.

## Resultado observable

El telefono abre el menu desde el shortcut, entra a ambos modos y completa un
smoke con fixtures; los servicios internos siguen en loopback y Vercel muestra
la degradacion prevista.

## Prerrequisitos

- `CM-514` en `complete`.
- Tailscale/HTTPS y dispositivo Android disponibles por accion humana.

## Decisiones congeladas

- ADR-0001 seccion 1 y gates; D-014, D-020 y D-023.

## Archivos permitidos

- `docs/REMOTE-ACCESS.md`.
- `docs/SHORTCUTS.md`.
- `docs/TESTING.md`.
- `docs/evidence/phase6-mobile-<date>.md`.
- `tasks/STATUS.md`.

## Archivos prohibidos

- Configuracion automatica de Tailscale/Firewall, secretos, corpus real y
  cambios de producto.

## Fuera de alcance

- Voz, Drive, Obsidian, acceso publico al instructor y puertos del router.

## Pasos exactos

1. Documentar instalacion y matriz de autorizacion sin tokens.
2. Verificar listeners: solo Next accesible; 3210, 5433 y 11434 en loopback.
3. Instalar/actualizar shortcut por accion humana.
4. Ejecutar checklist Android con fixtures y registrar evidencia.
5. Usar `ready_for_manual` mientras falte exclusivamente la evidencia humana.

## Verificacion focal

```powershell
pnpm.cmd exec prettier --check docs/REMOTE-ACCESS.md docs/SHORTCUTS.md docs/TESTING.md
```

## Verificacion global

```powershell
pnpm.cmd run verify:phase1
git diff --check
```

## Prueba manual

- Android/Chrome desde shortcut HTTPS privado: menu, Practica, Instructor,
  selector solo en Instructor, recarga y orientaciones portrait/landscape.

## Commit local de cierre

- Mensaje: `CM-515: gate private mobile instructor access`.
- Stage: rutas permitidas de CM-515 y `tasks/STATUS.md`.

## Condiciones de parada

- Un servicio interno escucha en LAN, falta autorizacion humana o se requieren
  datos reales para completar el smoke.

## Rollback

Retirar el shortcut/configuracion mediante el procedimiento humano documentado
y revertir solo el commit de CM-515.

## Handoff

Usar `docs/HANDOFF.md`.
