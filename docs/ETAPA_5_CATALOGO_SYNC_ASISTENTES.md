# Etapa 5 — Catálogo de modelos, sincronización, Asistentes y saldo

> **Desde la Etapa 9:** el catálogo ya no se escribe a mano. Sale de la documentación de Kie con `npm run kie:catalog` y lista los 230 modelos (ver `ETAPA_9_ADJUNTOS_Y_CATALOGO_KIE.md`).

Esta etapa agrega cuatro cosas:

- Un **catálogo de modelos de Kie** en un solo lugar.
- La **sincronización** de tu trabajo entre computadoras.
- La página **Asistentes**.
- El **saldo real** de Kie en la barra lateral.

Todo lo anterior sigue igual: el login privado, el Chat con streaming, «Detener», «Regenerar», el historial, la conversión a proyecto, PDF Studio y Cinema Studio.

## Auditoría (antes de cambiar nada)

| Tema | Cómo estaba | Riesgo |
|---|---|---|
| Modelos | Dos modelos de texto de Kie (Gemini 3.8 Flash y 3.1 Pro) y uno de imagen (Nano Banana 2.1), escritos en tres archivos distintos. El video no estaba conectado. | Para agregar un modelo había que tocar varios lugares. Todo suponía el formato de OpenAI. |
| Tus datos | Chats, proyectos, libros, notas, Cinema y el registro de consumo vivían solo en el navegador (localStorage e IndexedDB). | Otra computadora no veía nada. Borrar los datos del navegador lo perdía todo. |
| Reintentos de imagen | Un reintento con el mismo pedido se bloqueaba con «ya enviado» (`409`), pero no devolvía la tarea creada. | Si la primera respuesta se perdía, el resultado quedaba huérfano o había que pagar de nuevo. |
| Saldo | Solo en Ajustes → Uso y créditos. | — |
| Asistentes | No existían. | — |

## Qué cambia para vos

### 1. Catálogo de modelos

- **Un solo archivo:** `src/lib/ai/models.ts`. Tiene **33 modelos de Kie**: 14 de texto, 16 de imagen y 3 de video.
- **Cada modelo indica:**
  - identificador interno y nombre;
  - proveedor y categoría;
  - el identificador que espera Kie;
  - endpoint y adaptador;
  - los parámetros verificados;
  - el enlace a la documentación y su estado.
- **Tres estados:**

  | Estado | Qué significa | Modelos |
  |---|---|---|
  | **Verificado y en uso** | Documentado y usado de verdad desde el estudio. | Gemini 3.8 Flash, Gemini 3.1 Pro, Nano Banana 2.1 |
  | **Verificado · sin prueba real** | Kie documenta el endpoint, el formato y el identificador, pero todavía no se probó con tu clave. Se puede elegir y el selector lo avisa. | Claude Sonnet 4.6, 4.5, 5 y 5.5, y Claude Haiku 4.5 (vía `https://api.kie.ai/claude/v1/messages`) |
  | **No verificado** | Falta algo esencial: el identificador exacto, la lista de opciones o el formato de streaming. Aparece desactivado y dice qué falta. | GPT‑5.x, Claude Opus, Gemini 3 Pro, el resto de los de imagen y los tres de video |

- **Formatos distintos:**
  - Los modelos de Claude usan el **formato de Anthropic**, no el de OpenAI.
  - Los de GPT‑5.4 en adelante usan la API **«responses»**. El adaptador está hecho y probado con respuestas simuladas, pero esos modelos siguen desactivados hasta confirmar los nombres de eventos de Kie.
- **Solo opciones reales:** imagen y video muestran solo lo que el modelo acepta (proporciones, resolución, duración, referencias, variantes). El servidor rechaza cualquier otra cosa (`INVALID_PARAMETERS`) y también los modelos no verificados.
- **El video sigue sin controles.** La pestaña Video lista los tres modelos, con lo que falta y el enlace a la documentación. No hay controles ni progreso simulado.
- **Los selectores** (Chat, Asistentes y Cinema) tienen:
  - búsqueda;
  - filtro por proveedor;
  - **favoritos**, que se sincronizan;
  - teclado: flechas, Enter para elegir, Ctrl+Enter para marcar favorito y Escape para cerrar;
  - «Automático», que se conserva para texto.
- **Precios:** ninguno, porque no encontré precios oficiales verificables. Si se carga uno (campo `price`, con su fuente), aparece como **«estimado ≈ … créditos»** y nunca como costo real.
- **Las claves** siguen solo en el servidor. El navegador recibe el catálogo sin endpoints ni identificadores internos de Kie.
- **Ajustes → Conectores** muestra el catálogo completo, con su estado.

### 2. Sincronización entre computadoras

- **Qué se sincroniza:**
  - chats (títulos e historial);
  - proyectos del Chat;
  - libros de PDF Studio, con sus imágenes subidas;
  - borradores y notas de libros;
  - guiones y planos de Cinema;
  - imágenes generadas;
  - asistentes y modelos favoritos;
  - el registro de consumo.
- **Dónde:** en la base de datos que ya usa el estudio (Postgres en Neon), en tres tablas nuevas. El navegador conserva su copia para trabajar rápido y sin conexión, pero ya no es el único lugar.
- **Estado abajo a la izquierda:**

  | Texto | Qué significa |
  |---|---|
  | «Guardado · 14:32» | Todo está en tu cuenta. |
  | «Guardando…» | Se están enviando cambios. |
  | «Sin conexión · reintentar» | No hay red. Los cambios esperan en el navegador. |
  | «No se pudo guardar · reintentar» | El servidor falló. Tocalo para volver a intentar. |
  | «N cambios para revisar» | Hay un conflicto que tenés que resolver. |
  | «Solo en este navegador» | El servidor todavía no tiene las tablas nuevas. Todo sigue como antes, en el navegador. |

- **Nada se pisa en silencio.** Si la misma cosa cambió en dos computadoras antes de guardarse, se conservan las dos y elegís:
  - «Conservar las dos»: la tuya queda como copia;
  - «Usar la de esta computadora»;
  - «Usar la otra».
- **Un libro abierto no cambia solo.** Si se modificó en otra computadora, aparece un aviso con «Cargar esos cambios».
- **Renombrar y borrar también se sincronizan.** El borrado respeta la confirmación y el «Deshacer». Los textos de los diálogos de borrado ahora dicen que el borrado llega a las otras computadoras.
- **Tus datos de antes** se suben solos la primera vez, sin duplicar. Esto se probó con un chat y un registro de consumo viejos.
- **Los chats personales y los proyectos** siguen separados: un chat pasa a proyecto solo con «Convertir».
- **Importante, porque la cuenta es compartida:** el estudio usa una sola cuenta para los dos. Por eso **tu compañero va a ver tus chats** y vos los suyos, igual que los libros y la galería. Si preferís chats privados por persona, hace falta una cuenta por persona. Avisame y lo planteo.

### 3. Asistentes

- **Dónde:** una página nueva en la barra lateral. Podés crear, editar, duplicar y borrar (con confirmación y «Deshacer»), y buscar por nombre o por instrucciones.
- **Campos:**
  - nombre y descripción;
  - instrucciones (hasta 8.000 caracteres);
  - modelo preferido;
  - ámbito: Chat, PDF Studio o Cinema Studio;
  - un interruptor para pasarle al asistente las opciones verificadas de imagen y video.
- **En el Chat:**
  - El Chat arranca **neutro** y lo dice: «Chat neutro, sin instrucciones guardadas».
  - Con «Elegir asistente» ves sus instrucciones antes de usarlo.
  - Mientras lo usás, el asistente queda visible arriba.
  - «Nuevo chat neutro» vuelve al chat sin asistente.
- **En los paneles de PDF y Cinema:** un selector «Sin asistente / …» con los asistentes de ese ámbito.
- **Qué se le envía al modelo:** las instrucciones van solo cuando elegís el asistente. Se le avisa que solo responde con texto. Nunca dice que guardó, generó o envió algo, porque el servidor no le da herramientas.
- **Si su modelo preferido desaparece**, las instrucciones se conservan y la página pide elegir otro.
- **Tres asistentes iniciales:**
  - **Editor del libro de ruso:** PDF; no toma decisiones editoriales ni cambia material aprobado sin confirmación.
  - **Coach de prompts para imagen y video:** Cinema.
  - **Director de video:** Cinema.

  Se crean con datos fijos, así que no se duplican entre computadoras.

### 4. Saldo en la barra lateral

| Línea | Qué muestra |
|---|---|
| **«Saldo disponible»** | El saldo real de Kie (`GET https://api.kie.ai/api/v1/chat/credit`, [documentación](https://docs.kie.ai/common-api/get-account-credits)), con la hora de consulta y un botón para actualizar. Se consulta al entrar, después de cada pedido y con el botón. Guarda la respuesta 20 segundos. |
| **«Gasto de esta sesión»** | La suma de lo que **Kie informó** desde que abriste esta ventana. Nunca se calcula restando saldos. |
| **«Costo de una generación»** | Aparece en cada respuesta y en cada tarjeta de imagen, cuando Kie lo informa. |

- **Si la consulta falla**, no se muestra cero ni un número inventado. Si había un saldo anterior, dice «Último saldo, consultado HH:MM» y avisa que no se pudo actualizar.
- **Si el saldo es 0**, avisa que las generaciones van a fallar.
- **Enlaces:** «Detalle» (Ajustes → Uso) y «Registro en Kie» (https://kie.ai/logs).
- **Sin conversión a dólares:** no encontré una equivalencia oficial.

### 5. Pedidos cobrados: sin duplicados

- **Cada generación de imagen** queda registrada en la base con su identificador (tabla `generation_request`).
- **Si reintentás el mismo pedido**, el servidor devuelve la tarea que ya existe y **no vuelve a pedirla a Kie**.
- **Si la respuesta de Kie se perdió** (tardó demasiado), el pedido queda como «incierto». Reintentar no lo vuelve a crear. La tarjeta lo explica y pide confirmación antes de crear uno nuevo.
- **Las tareas guardan su identificador** y se recuperan al recargar. Se revisan el estado HTTP y el campo `code` de Kie, porque Kie a veces responde 200 con un error dentro.

## Vista previa con datos separados de producción

La rama es `claude/lucid-allen-2e87pn`. Vercel arma la vista previa sola con cada envío. **No se publicó nada en producción ni se hizo merge a `main`.**

- **Si la vista previa usa la misma base que producción:** la sincronización queda en «Solo en este navegador» hasta que se apliquen las tablas. Nada se rompe.
- **Para probar la sincronización con datos separados**, seguí estos pasos (todavía no hice ninguno; necesito tu OK):
  1. **Neon:** en tu proyecto, «Branches» → «Create branch» desde `main`, con un nombre como `preview`. Es una copia gratis de la base.
  2. **Vercel → Settings → Environment Variables:** cambiá `DATABASE_URL` **solo para el entorno «Preview»** y poné la dirección de esa rama de Neon. Producción no se toca.
  3. **Neon → SQL Editor**, en la rama `preview`: pegá el contenido de `prisma/migrations/202610170001_sync/migration.sql` y ejecutalo.
     - Solo **agrega** una secuencia y tres tablas.
     - No cambia ni borra nada.
     - Se puede ejecutar dos veces sin problema.
  4. **Volvé a desplegar** la vista previa: Vercel → Deployments → la última de la rama → «Redeploy».
  5. **Para entrar**, usá la misma cuenta. Si la rama de Neon es una copia, el usuario ya existe. Si el login de la vista previa rechaza la dirección, agregala en `BETTER_AUTH_URL` o en los orígenes de confianza, solo para Preview.
- **Para producción, más adelante:** el mismo SQL del paso 3, en la base principal. Es aditivo, pero lo hacemos juntos cuando lo apruebes.

## Cómo agregar un modelo

1. **Abrí** `src/lib/ai/models.ts` y copiá una entrada del mismo tipo.
2. **Completá** los datos con lo que dice la documentación de Kie:
   - `id`, `name`, `provider`;
   - `providerModel` (el identificador exacto que espera Kie);
   - `endpoint`, `adapter` y `docs`.

   En imagen y video, completá también `options`: los nombres de los campos y las listas exactas de valores.
3. **Elegí el estado:**
   - si algo no está confirmado: `status: 'unverified'`, explicando qué falta en `missing`;
   - si todo está documentado: `status: 'docs'`;
   - después de una prueba real: `status: 'tested'`.
4. **Corré** `npm test`. Un test revisa que el catálogo sea coherente.
5. **Prueba real:** `KIE_API_KEY=… npm run kie:smoke -- --yes --models=<id>`. Consume pocos créditos.

## Pruebas que corrí de verdad

- **Typecheck:** `npx tsc --noEmit`, sin errores.
- **Tests:** `npm test`, 77 de 77. El test de PDF que necesita Chromium se corrió aparte, con Chromium, y también pasa.
  - Hay 12 tests nuevos en `tests/stage5.test.ts`: catálogo, adaptadores de Claude y Responses, `createTask` con HTTP y `code`, Chat neutro contra asistente, detección de cambios de la sincronización, validación y asistentes iniciales.
- **Build:** `next build --webpack`. El proyecto no tiene script de lint.
- **Sincronización real con dos navegadores independientes: 35 de 35.** Usé el servidor real, la autenticación real, un Postgres local con las migraciones aplicadas y un Kie simulado. Se probó:
  - la migración de datos viejos sin duplicar;
  - un chat nuevo y su historial;
  - el renombrado;
  - un conflicto sin conexión, resuelto con «Conservar las dos»;
  - «Deshacer» y el borrado confirmado;
  - asistentes: crear, editar y recuperar, con los iniciales sin duplicar;
  - favoritos;
  - un libro con imagen subida, y el aviso con el libro abierto;
  - la galería de Cinema;
  - un reintento con el mismo pedido: una sola tarea en Kie;
  - un envío incierto que no se repite;
  - opciones inválidas rechazadas;
  - el saldo válido, en cero, con falla, raro y actualizado;
  - el gasto de la sesión;
  - la base caída y su recuperación.
- **Registro de pedidos contra Postgres real:**
  - nuevo, mismo pedido mientras se envía, rechazado antes de enviar, creado, otro usuario e incierto;
  - las tablas se crearon con `prisma migrate deploy` en una base vacía.
- **Prueba visual de las pantallas nuevas: 76 de 76**, en escritorio y a 390 px, con teclado, «reducir movimiento», axe y una auditoría de contraste:
  - el Chat con asistente y el Chat neutro;
  - el selector: búsqueda, proveedor, favoritos y teclado;
  - la página Asistentes completa;
  - el selector de Cinema y la pestaña Video;
  - el catálogo en Conectores;
  - el diálogo de conflictos;
  - el saldo con falla;
  - la navegación en el celular.
- **Pruebas anteriores, todas sin problemas de axe ni desbordes:**

  | Prueba | Resultado |
  |---|---|
  | Chat | 7 de 7 |
  | Cinema | 7 de 7 |
  | PDF | 7 de 7 |
  | Etapa 4 | 61 de 61 |

- **Corregido gracias a las pruebas:**
  - un pedido cortado por el límite de velocidad antes de llegar a Kie quedaba como «incierto» para siempre; ahora se puede reintentar;
  - el contraste de la fila resaltada del selector;
  - la vista previa de «Usar en el Chat», que se cerraba sola;
  - un aviso falso de «cambió en otra computadora» en un libro recién creado;
  - el login antes de que la página termine de cargar, que ahora no manda el formulario solo.

## Limitaciones pendientes

- **Ninguna prueba real con Kie.** Desde este entorno no se puede llegar a `api.kie.ai` ni a `docs.kie.ai`, y la clave no llegó a la sesión. Lo verifiqué con el buscador web y con pruebas contra un Kie simulado. **Falta tu prueba con la clave real** (paso 6 de abajo). Hasta entonces:
  - Claude queda como «sin prueba real»;
  - el adaptador «responses» y todo el video siguen desactivados.
- **Las imágenes de los libros** se guardan en la base (hasta 4 MB cada una). Si ocupan mucho espacio en Neon, convendría un almacenamiento de archivos aparte. Eso sería contratar un servicio, así que no lo hice.
- **La vista previa** está protegida por Vercel y no pude abrirla desde acá.
- **Hay un solo espacio de trabajo y una sola cuenta.** Ver el punto sobre la cuenta compartida.

## Pasos cortos para que lo pruebes

1. **Abrí la vista previa e iniciá sesión.** Abajo a la izquierda tiene que decir «Guardado · hora», o «Solo en este navegador» si todavía no se aplicaron las tablas.
2. **Mirá el saldo.** Tiene que coincidir con https://kie.ai/logs. Tocá el botón de actualizar.
3. **En el Chat, tocá el selector de modelo.** Buscá «haiku», marcalo como favorito con la estrella y elegilo. Los modelos grises dicen qué les falta.
4. **Andá a «Asistentes»:** creá uno, editalo, duplicalo y borralo, y tocá «Deshacer». Después tocá «Usar en el Chat» en «Director de video», escribí algo y fijate que arriba diga el asistente. Volvé con «Nuevo chat neutro».
5. **Sincronización, con las tablas aplicadas:** abrí la vista previa en otra computadora o en una ventana privada e iniciá sesión. Tenés que ver los mismos chats, asistentes y libros. Cambiá el título de un chat en una y mirá la otra.
6. **Prueba real con Kie, con poco saldo:** con la clave en la terminal, corré `npm run kie:smoke -- --yes`. Consume pocos créditos: una respuesta corta de Gemini, una de Claude Haiku y una imagen de 1K. Pasame lo que imprime y actualizo los estados del catálogo.

## Archivos

- **Catálogo y adaptadores:**
  - `src/lib/ai/models.ts`
  - `src/lib/ai/kie-text.ts`
  - `src/lib/ai/provider.ts`: Anthropic con Bearer y «responses»
  - `src/lib/ai/catalog.ts`
  - `src/lib/cinema/kie-jobs.ts`
  - `src/app/api/cinema/images/route.ts`
  - `src/app/api/personal-chat/route.ts`
  - `src/app/api/models/route.ts`
- **Pedidos sin duplicar:**
  - `src/lib/cinema/ledger.ts`
  - `src/lib/cinema/client.ts`
- **Sincronización:**
  - `prisma/schema.prisma`
  - `prisma/migrations/202610170001_sync/migration.sql`
  - `src/app/api/sync/route.ts`
  - `src/app/api/sync/assets/route.ts`
  - `src/lib/sync/*`
  - los `replaceSynced` de los stores
  - `src/lib/books/library.ts`
- **Asistentes:**
  - `src/store/assistants.ts`
  - `src/app/workspace/asistentes/page.tsx`
  - `src/components/assistants/assistants-page.tsx`
  - `src/components/studio/assistant-chooser.tsx`
  - `src/lib/personal-chat/input.ts`
- **Selector y favoritos:**
  - `src/components/studio/chat-model-picker.tsx`
  - `src/store/favorites.ts`
- **Barra lateral:**
  - `src/components/studio/sidebar-status.tsx`
  - `src/components/studio/sync-conflicts.tsx`
  - `src/lib/ai/balance.ts`
  - `src/app/api/kie/credits/route.ts`
- **Prueba real con Kie:**
  - `scripts/kie-smoke.ts` (`npm run kie:smoke`)
- **Tests:**
  - `tests/stage5.test.ts`

## Fuentes consultadas (vía buscador web)

- **Saldo:** https://docs.kie.ai/common-api/get-account-credits
- **Claude vía Kie:** https://docs.kie.ai/market/claude/claude-sonnet-4-6 y las páginas hermanas que figuran en el catálogo.
- **Nano Banana 2.1:** https://docs.kie.ai/market/google/nanobanana-2-1
- **El resto:** cada modelo del catálogo tiene su enlace en el campo `docs`, visible en Ajustes → Conectores.
