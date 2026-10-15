# RuskiCode Studio — Fase 6

Next.js App Router + TypeScript + Tailwind, componentes estilo shadcn con Radix, Framer Motion, Lenis, Zustand y TanStack Query.

## Ejecutar

Node 22 o superior. `npm ci`, `npm run dev`. Validar con `npm run typecheck` y `npm run build`.

## Estructura

- `src/app`: rutas Explorar `/` y estudio `/workspace`.
- `src/components`: navbar, sidebar, drawer accesible y proveedores.
- `src/components/ui`: componentes reutilizables con configuración shadcn.
- `src/lib`: traducciones ES/RU/EN, utilidades y variantes motion.
- `src/store`: estado de idioma y sidebar.
- `public/prototype.html`: prototipo previo conservado, con editor local.

## Despliegue

Vercel: framework Next.js; comandos y salida automáticos. Quitar overrides de salida estática si están configurados en el panel. El dominio existente sigue asociado al proyecto.

## Alcance

Esta fase establece estructura, tokens y navegación, no el producto completo. El selector de idioma funciona en memoria; no hay inicio de sesión, IA, almacenamiento compartido ni pagos. El prototipo anterior conserva las claves de localStorage y exportaciones de su editor.

KIE será el proveedor inicial. `.env.example` documenta secretos futuros, no son necesarios para esta fase. Nunca publicar claves en el cliente. Redis/BullMQ y Chromium requerirán un worker separado; se implementarán en fases posteriores. No se crean servicios pagos en esta fase.

Siguientes fases: Explorar, compositor y modelos, adaptadores/streaming, skills/Book Spec, pipeline/PDF/QA y editor/visor.

## Fase 2 — Explorar

Landing ES/RU/EN con carrusel nativo (scroll táctil, flechas, teclado, reproducción automática pausable), tarjetas conceptuales propias, herramientas, proceso editorial, consumo y FAQ. Animaciones Framer Motion con scroll reveal y movimiento reducido. Sin testimonios, descuentos ni planes ficticios. Los previews son CSS, no páginas aprobadas ni videos generados. El compositor funcional corresponde a la Fase 3.

## Fase 3 — Compositor

`/workspace`: textarea adaptable, selector de proveedores con búsqueda accesible (Radix Dialog), categorías animadas, referencias (hasta 6 archivos de 10 MB) y URL. Preparación de briefs con aprobación opcional, estados review/ready, historial de hasta 30 proyectos en localStorage validado y descarga JSON. Los archivos permanecen en memoria de la sesión; se persisten solo sus metadatos. No se suben ni extraen ni consultan URLs. No hay cargos, estimaciones inventadas ni respuestas simuladas. Las opciones del selector son preferencias para las futuras integraciones, no modelos conectados. Fase 4 añadirá generación y streaming.

## Fase 4 — Chat real y adaptadores

API SSE `/api/chat`, catálogo `/api/models`, acceso `/api/session`. Adaptadores REST tipados para chat compatible OpenAI (KIE incluido), Anthropic y Google. No se utiliza AI Gateway ni se envían claves al cliente. Router Auto prioriza según tarea; falla hacia otro proveedor configurado solo antes de emitir texto. Un modelo explícito nunca cambia silenciosamente. Un 429 se reintenta una vez; no se reintenta una generación parcialmente emitida.

### Activar en Vercel

Configurar **Production** en Settings → Environment Variables y redeploy:

- `KIE_API_KEY`: clave actual de KIE.
- `STUDIO_ACCESS_CODE`: código largo aleatorio compartido por los dos autores. Protege solo llamadas de IA, no toda la interfaz ni archivos. Se canjea por cookie HttpOnly, SameSite Strict y Secure en producción (7 días).
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: Redis HTTP para limitación distribuida. Se bloquean llamadas en producción si no está disponible. No se crea ningún servicio de pago automáticamente.

Alternativamente, usar credenciales y modelos explícitos de los proveedores directos enumerados en `.env.example`. Verificar los IDs en su catálogo actual. El endpoint compatible personalizado es exclusivamente una variable del servidor.

El chat aparece al aprobar el brief. Tiene historial local, streaming, cancelar, manejo de errores y consumo reportado por el proveedor. No lee archivos/URLs, no llama herramientas ni genera PDF/imágenes/videos aún. No hay un saldo de créditos inventado, precios por token ni facturación propia; KIE puede devolver créditos consumidos. Las cifras de consumo por respuesta no son un ledger contable persistente.

Los adaptadores actualmente declaran `supportsTools: false` y `supportsVision: false`: capacidades futuras no implementadas. La documentación KIE advierte que el endpoint Gemini 3.1 Pro es para chat y no está adaptado a agentes; para las skills se usará JSON validado o un endpoint con herramientas verificado.

### Validación

`npm run test`, `npm run typecheck`, `npm run build`. Las pruebas de protocolo usan transporte simulado y no consumen saldo. Sin credenciales no se puede validar una generación real. Referencias: https://docs.kie.ai/30442144e0 ; https://docs.kie.ai/market/gemini/gemini-3-8-flash-openai ; https://platform.claude.com/docs/en/build-with-claude/streaming ; https://ai.google.dev/api/generate-content ; https://developers.openai.com/api/reference/resources/chat .

## Fase 5 — Book Spec y skills

Book Spec validado con Zod: identidad, público, idioma/nivel, formato, márgenes/sangrado, estimaciones, referencias, glosario, memoria, reglas, pedagogía y design tokens. Valores iniciales de «Русский код» son una plantilla editorial que el autor debe revisar contra sus archivos actuales; no se importaron PDFs ni personajes visuales aprobados.

En un proyecto de categoría Libro, abrir «Contexto y reglas del libro». Guardar, importar o exportar JSON; la configuración se almacena localmente por proyecto. Cada petición del chat recibe el Book Spec guardado. Campos no expuestos en el formulario siguen disponibles por importación validada. Referencias y adjuntos no se descargan ni se leen aún.

Siete paquetes dentro de `skills/`: SKILL.md, manifest validado, plantilla de salida. Loader con lista permitida (sin rutas arbitrarias) y trazado de archivos de Next para Vercel. Las skills pueden ejecutarse desde el proyecto: resultados JSON validados, hasta tres intentos de reparación, consumo acumulado cuando lo informa el proveedor. Sin claves, acceso y Redis configurados no habrá ejecución real.

Los modelos de chat reciben instrucciones y esquema JSON completos. No se activan llamadas nativas a herramientas; se usa el modo estructurado compatible con los adaptadores actuales. `src/lib/books/tools.ts` expone herramientas puras tipadas para leer/actualizar spec, outline y tokens; no es todavía un servidor MCP. Actualizar la spec mediante herramienta exige la señal de aprobación del autor.

Skills de imagen/portada producen planes de prompts, typesetter produce checklist con `readyForRender:false`, QA produce revisión textual. Generación de assets, render PDF, QA visual, almacenamiento remoto y pipeline persistente son Fase 6/7.

Pruebas: validación de todos los manifests y ejemplos, rechazo de traversal, contexto en cada intento, límite de tres intentos, aprobación y datos editoriales.

## Fase 6 — Pipeline y PDF real

### Implementado

Máquina de estados con checkpoints Postgres/Prisma: outline (aprobación opcional) → design → capítulos secuenciales con contexto previo → assets → render → QA → complete/needs-review. BullMQ/Redis procesa el trabajo en un worker separado. Las tareas de imagen confirmadas conservan taskId; una creación incierta se detiene para reconciliación manual en lugar de enviar otra petición automáticamente.

Render Playwright: HTML de bloques escapados, red externa bloqueada, fuentes locales con soporte cirílico, encabezados/pies, portada textual, índice con números físicos reales, paginación medida, división de párrafos largos y tablas/ejercicios, imágenes completas sin recorte. Sangrado con TrimBox/BleedBox. El proyecto conserva Book Spec, capítulos originales y layout derivado; el PDF no es el archivo fuente editable.

Poppler rasteriza **el PDF real**, una imagen por página. QA automático comprueba desbordes/encabezados huérfanos y, si está habilitado, envía cada raster a Gemini vía KIE mediante URLs firmadas temporales. Tres rondas como máximo por ejecución; los ajustes automáticos son tipográficos, no reescritura del contenido. Los errores pendientes requieren revisión del autor. Sin QA visual habilitado se registra explícitamente esa limitación.

Las imágenes utilizan el endpoint documentado `nano-banana-2-1`; se requieren referencias visuales antes de generar. Los binarios se normalizan con Sharp y se descargan solo de hosts permitidos. No se envían ilustraciones aprobadas que no se hayan proporcionado. La ingesta automática de adjuntos/PDF/URLs todavía no está conectada: en esta fase el contexto proviene del brief y Book Spec.

### Activación (infraestructura pendiente)

Web en Vercel: `DATABASE_URL`, `REDIS_URL` TCP, claves y acceso de Fase 4, `PUBLIC_APP_URL`, `ARTIFACT_SIGNING_SECRET`. Migrar la base elegida con `npm run db:migrate`. No se crean bases ni servicios pagos automáticamente.

Worker: proceso Node persistente, no una Function que duerme entre solicitudes. Requiere los mismos Postgres/Redis, KIE y configuración de URLs firmadas. Build desde la raíz: `docker build -f worker/Dockerfile -t ruskicode-worker .`. Ejecutar en el servicio de contenedores elegido: `docker run --env-file .env.worker ruskicode-worker`. El Dockerfile instala Chromium, Poppler y fuente cirílica. En desarrollo, exportar las variables del entorno y usar `npm run worker`. `.env.worker` no se sube a Git.

Redis para BullMQ debe permitir conexiones TCP y comandos requeridos por BullMQ. La URL REST de Upstash usada para rate limiting no reemplaza `REDIS_URL`. El worker publica un heartbeat de 60 segundos; no se permite iniciar producción si está offline.

API: `/api/books` (crear y estado de configuración), `/api/books/:id` (progreso), `/api/books/:id/action` (aprobar/retomar), `/api/books/:id/artifacts/:artifactId` (descarga privada o URL firmada). Artefactos binarios almacenados en Postgres en esta primera implementación para dos autores; almacenamiento de objetos es una mejora futura para volúmenes grandes. Los permisos son de estudio compartido por código, aún no cuentas individuales.

### Límites y reanudación

Hasta 12 capítulos, 120 páginas estimadas y 12 imágenes nuevas por trabajo en la primera versión. Conteos estimados no fuerzan paginación artificial. No hay descargas arbitrarias de referencias: solo imágenes generadas en hosts explícitamente permitidos. Los archivos del libro se muestran como borrador hasta completar QA. Puede retomar una tarea guardada tras recargar el navegador.

Checkpoints y taskId reducen repeticiones, pero no garantizan exactamente una llamada pagada ante un fallo entre respuesta de proveedor y escritura de checkpoint. Un reintento manual puede generar consumo adicional. Se preserva el contenido original para editar y re-renderizar; visor/timeline/editor completo son Fase 7.

### Prueba sin saldo

`npm run pdf:demo` genera una muestra conceptual de tres páginas y sus rasters en `public/demo`. Se revisaron visualmente las tres páginas y se verificó cero desbordes. No reemplaza portada ni páginas aprobadas. `npm run test` valida checkpoints, aprobación, máximo de QA, persistencia de taskIds, firmas, sanitización y el PDF real. No se probaron llamadas reales a KIE, una base remota ni un worker alojado: faltan credenciales e infraestructura.

Se probó además un texto largo en A5 con sangrado: 21 páginas, sin desbordes y TrimBox correcto. QA guarda el número de rasters revisados y una huella del contenido: al retomar, no repite revisiones de páginas sin cambios. Los contadores de tokens/créditos de esta versión incluyen solo escritura; no representan toda la facturación de imágenes y visión.

## Fase 7 — Editor y seguimiento

Abrir `/workspace/editor` para probar la muestra sin claves. El editor ofrece portada, navegación por capítulos con miniaturas de contenido, vista adaptada a la pantalla, edición de párrafos/encabezados/callouts, ejercicios y celdas de tablas, reemplazo de imágenes PNG/JPEG/WebP (hasta 2 MB), inserción/eliminación de bloques y 20 pasos de deshacer. No altera textos aprobados automáticamente. El diseño original sigue en el Book Spec y es importable/exportable.

El original JSON incluye `spec`, `chapters` y `assets` separados. Se puede descargar, importar y continuar editando. El borrador se guarda en este navegador por libro y revisión; no es sincronización entre autores. Los archivos JSON inválidos, IDs duplicados, tablas inconsistentes y formatos de imagen ejecutables se rechazan. Descargá el original para conservarlo fuera del navegador. El PDF se recompone desde estos bloques; no se ofrece edición arbitraria de PDFs importados ni de capas dentro de ilustraciones raster.

Desde un trabajo con capítulos guardados: «Abrir editor» carga `/api/books/:id/project` bajo la misma sesión privada. «Componer nuevo PDF» guarda la edición con control optimista de revisión y encola render/QA; se conservan copias de la fuente y del PDF anterior. «Regenerar este capítulo» invoca solo la skill del capítulo seleccionado, manteniendo los demás capítulos. «Regenerar esta imagen» limpia solo su asset/taskId y vuelve a generar con las referencias del Book Spec. Estas acciones pueden consumir saldo; no se ejecutan al escribir. Requieren infraestructura activa. Ediciones simultáneas obsoletas se rechazan y exigen recargar.

El panel del trabajo muestra etapas, capítulos guardados, conteo de páginas/revisiones QA, rasters reales y descargas. Los rasters viejos que sobran tras una nueva composición se eliminan. La vista del editor es de contenido, no una promesa de paginación idéntica al PDF. El enlace «PDF anterior» no incluye cambios locales hasta completar la nueva composición.

Validación: 31 pruebas pasan, incluyendo rechazo de fuentes inseguras, invalidación de QA tras ediciones, regeneración exclusiva de un capítulo y preservación de imágenes no seleccionadas. TypeScript y build de producción comprobados. La interacción visual en navegador y la integración remota completa de base/cola/KIE siguen sin verificarse en este entorno; no se presentan como aprobadas.

### Estado final y límites pendientes

Las siete fases de esta primera versión están implementadas. GitHub conserva el código y Vercel publica la web. Falta activar los servicios y variables enumerados en Fase 6 para usar IA/producción real. No se provisionó infraestructura ni se consumieron créditos. El frontend es público; las APIs y artefactos generados requieren el código compartido, no hay cuentas individuales ni coedición en tiempo real. La ingesta automática de PDFs/referencias y la generación de vídeo Seedance siguen pendientes; el selector multimedia no ejecuta esos modelos. El chat orienta el proyecto con el Book Spec, mientras la producción se inicia mediante controles explícitos. Las estimaciones de consumo incluyen solo texto, no facturación completa de imagen/visión.

## Ejecución gratuita: Neon + Upstash + Inngest

Alternativa al worker persistente de Render: `BOOK_EXECUTOR=inngest`. Cada etapa, capítulo y página de revisión visual se ejecuta en un paso independiente de Inngest; los originales, artefactos y checkpoints permanecen en Postgres. Los pasos devuelven únicamente estados pequeños, no el manuscrito ni imágenes. Las esperas de generación de imágenes usan `step.sleep`, sin mantener una Function abierta. BullMQ sigue disponible cuando no se selecciona Inngest. No se contratan planes pagos automáticamente.

En Vercel, el PDF se rasteriza desde sus bytes reales con PDF.js y canvas nativo; no requiere instalar Poppler. Playwright/Chromium sigue generando el PDF. La ruta `/api/inngest` tiene un límite de 300 segundos por invocación. Esta modalidad limita cada libro a **30 páginas físicas** (dividir obras más largas en unidades); es un límite operativo inicial, no una garantía de que cualquier composición termine dentro de las cuotas. Las llamadas de escritura tienen un presupuesto de 210 segundos por paso. No hay reintentos automáticos de pasos fallidos que puedan repetir consumo de IA: el autor retoma explícitamente desde el último checkpoint. Un fallo entre respuesta del proveedor y guardado puede requerir reconciliación manual.

### Activar sin contratar infraestructura paga

1. Crear un proyecto **Neon Free**, conectar su URL Postgres a `DATABASE_URL` en Vercel, con TLS (`sslmode=require`) y un pool pequeño (`connection_limit=2`). Para las migraciones usar una conexión directa si el proveedor la requiere. No importar datos del Postgres temporal de Render: esta instalación empezó vacía. La base de Render no se borra automáticamente.
2. Crear una base **Upstash Redis Free** y guardar `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en Vercel. Se usa solo para rate limiting, no para sondear una cola BullMQ. No hace falta exponer Redis TCP a cualquier IP.
3. Crear una app en **Inngest Free**. Guardar `INNGEST_EVENT_KEY` y `INNGEST_SIGNING_KEY` como secretos en Vercel. Configurar `BOOK_EXECUTOR=inngest` y sincronizar la app con `https://www.ruskicode.com/api/inngest` después del despliegue. Las claves no sustituyen esta sincronización. Si las URLs de despliegue están protegidas, usar el dominio público o configurar el bypass oficial de Inngest; no desactivar la verificación de firmas.
4. Conservar `PUBLIC_APP_URL` y `ARTIFACT_SIGNING_SECRET`; configurar `STUDIO_ACCESS_CODE` y una clave vigente `KIE_API_KEY` mediante los campos secretos del proveedor. Nunca subirlas a Git.
5. Aplicar `npm run db:migrate` contra Neon antes de generar libros. Redeploy en Vercel para aplicar las variables. Confirmar la sincronización en Inngest, crear una unidad pequeña, aprobar su índice y verificar el PDF descargado, QA y edición/recomposición.

`/api/books` informa configuración presente, no certifica conectividad ni la sincronización remota de Inngest. La generación completa no se declara probada hasta comprobarla con cuentas y claves reales. Las cuotas gratuitas y las condiciones de cada proveedor pueden cambiar; elegir explícitamente los planes Free, sin activar upgrades. Vercel Hobby tiene restricciones de uso que deben revisarse antes de comercializar la plataforma. La infraestructura gratuita no incluye consumo de KIE/ElevenLabs.

### Desarrollo y validación

`npm ci`, `npm run test`, `npm run typecheck`, `npm run build`. Para el servidor local de Inngest: ejecutar `INNGEST_DEV=1 npm run dev` y `npx inngest-cli@latest dev`; usar una base de desarrollo y no apuntar pruebas a producción. El worker Docker con Poppler sigue siendo compatible para instalaciones BullMQ existentes.

## Cuenta privada compartida

`/login` usa Better Auth 1.7 con Prisma/Neon, sesiones individuales de siete días y correo/contraseña para una única cuenta del equipo. El registro público está deshabilitado. El rol administrador se asigna exclusivamente a la cuenta creada durante la primera activación; **no habilitar registro público con esta política**. Una futura implementación de clientes debe crear permisos y un rol predeterminado sin privilegios antes de abrir altas.

Antes de publicar: aplicar `prisma/migrations/202610150001_private_auth/migration.sql`, configurar `BETTER_AUTH_SECRET` (aleatorio, al menos 32 caracteres) y `BETTER_AUTH_URL=https://www.ruskicode.com` en Production. El formulario permite ingresar el correo compartido, una contraseña de al menos 12 caracteres y el `STUDIO_ACCESS_CODE` existente. Nunca guardar esos datos en Git ni pedirlos por chat. `/api/studio/setup` verifica el código en servidor, aplica un límite distribuido y reserva una fila única antes de crear la cuenta. Si ya existe un usuario, se cierra definitivamente; no es un endpoint de recuperación. Un fallo incierto deja la reserva para revisión, en vez de permitir una segunda cuenta.

El workspace y su editor verifican la sesión en servidor. Las APIs de libros, generación, skills y archivos verifican sesiones actuales con rol administrador; los enlaces temporales firmados para QA conservan su alcance a un solo archivo y caducidad. Inngest sigue usando su propia verificación de firmas. El código de acceso anterior y sus cookies HMAC ya no permiten acceder a la aplicación. La presentación y las muestras conceptuales siguen siendo públicas. Cerrar sesión revoca esa sesión; la sesión del otro dispositivo puede continuar.

No se ofrece recuperación por correo hasta configurar entrega de emails. Si ambos olvidan la contraseña, el propietario debe realizar una recuperación administrativa verificada; no se reabre el registro. Los proyectos e historiales que ya estaban en localStorage siguen siendo locales al navegador: compartir la cuenta no agrega sincronización del contenido local ni coedición.

Las tablas iniciales de libros se aplicaron mediante Neon porque este entorno no tiene conexión TCP directa a Postgres. Si se aplica también la migración de autenticación por Neon, antes de futuras ejecuciones de Prisma Migrate registrar esas migraciones existentes con `prisma migrate resolve --applied 202610140001_books` y `prisma migrate resolve --applied 202610150001_private_auth` usando una conexión directa desde un entorno con acceso. No volver a ejecutar sus CREATE TABLE sobre las tablas ya creadas.

Validación de autenticación: cierre de registro, rechazo de contraseña errónea, dos sesiones de la cuenta compartida, revocación de una sesión sin cerrar la otra y rechazo del acceso legado. No se crean usuarios reales durante las pruebas locales.
