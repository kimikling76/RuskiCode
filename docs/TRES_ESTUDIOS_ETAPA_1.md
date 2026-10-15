# Tres estudios — etapa 1

## Qué se conserva y qué cambia

Se conservan Google/password login, la sesión privada, Neon, Redis, Inngest, las rutas de Kie y la generación del libro. No se modifica ninguna variable existente, no hay migración de base de datos y no se añaden dependencias. Se añaden rutas aisladas `/api/studio-chat/*`, necesarias para consultar OpenRouter desde el servidor, cotizar y registrar el consumo. La nueva barra lateral separa CHAT, PDF STUDIO y CINEMA STUDIO, manteniendo la identidad visual aprobada.

## Activar el Chat: única variable nueva

La clave de Kie no sirve para OpenRouter. El catálogo público puede consultarse sin ella, pero las conversaciones requieren una clave de OpenRouter.

1. Abrir `https://openrouter.ai/settings/keys` e iniciar sesión en la cuenta que quieran usar para el estudio.
2. Crear una clave API para Estudio. No compartirla en el chat ni guardarla en GitHub.
3. Abrir Vercel → equipo `ruski-code` → proyecto `ruskicode` → Settings → Environment Variables.
4. Añadir el nombre exacto `OPENROUTER_API_KEY`. Pegar la clave como valor y marcarla como Sensitive. Seleccionar Production.
5. Guardar. Abrir Deployments → el último despliegue de `main` → menú de tres puntos → Redeploy. Mantener el entorno Production y confirmar.
6. Esperar Ready, abrir `https://www.ruskicode.com/workspace?studio=chat` y actualizar la página.

No tocar `KIE_API_KEY`, Google, Redis, Neon ni Inngest. No usar el prefijo `NEXT_PUBLIC_` para esta clave. La API puede necesitar saldo; que un modelo esté en el catálogo no garantiza que esté disponible para la cuenta.

## Chat incluido

- Catálogo completo devuelto por `GET https://openrouter.ai/api/v1/models` (sin paginación ni lista fija). Esa ruta devuelve por defecto modelos con salida de texto, adecuados para este Chat. Caché compartida del servidor: 3 horas.
- Búsqueda por nombre/ID, proveedor/autor del modelo, favoritos locales y opción Auto. Los modelos incompatibles o con precio dinámico/desconocido se muestran, pero no se pueden enviar sin un precio verificable.
- Auto elige un modelo conversacional económico del catálogo vivo y muestra cuál antes de enviar. No hace fallback silencioso a otro modelo que pueda cobrar diferente.
- Puede cambiarse el modelo entre mensajes. Cada respuesta conserva el modelo que la generó.
- Streaming, copiar, detener, historial lateral local, regenerar con nueva cotización y borrado confirmado.
- Chat sin proyectos, carpetas ni herramientas de generación. No puede leer adjuntos, navegar o generar archivos.
- Historial en este navegador. No se sincroniza entre computadoras ni se importan los proyectos antiguos al Chat puro.

## Créditos y costes

Único archivo de configuración: `src/lib/studio-chat/config.ts`.

- `usdPerCredit: 0.01`: un crédito interno equivale a 0,01 USD. Es una unidad informativa, no un saldo recargable ni un crédito de Kie.
- `defaultSessionLimitCredits: 100`: límite inicial de 1 USD por sesión de acceso.
- `warningRatio: 0.8`: aviso al acercarse al 80 %.
- `defaultOutputTokens: 512`: longitud usada para estimar la respuesta; el usuario puede elegir el máximo de salida.

La estimación incluye el sistema, el mensaje y TODO el historial enviado. Usa aproximadamente un token por 3 caracteres, más sobrecarga por mensaje, el precio de entrada/salida por token y el precio por solicitud si existe en el catálogo. La salida es una previsión, no un importe garantizado.

El servidor hace además una reserva conservadora, con longitud UTF-8 y el máximo de salida. Comprueba y reserva de forma atómica en Redis antes de llamar al proveedor. Solicita a OpenRouter los precios máximos del catálogo mediante `provider.max_price`. Si el límite de sesión no alcanza, bloquea el envío; si ese precio ya no está disponible, el proveedor puede rechazarlo y habrá que recotizar/cambiar modelo.

El coste REAL sale de `usage.cost` informado por OpenRouter, y se convierte de USD a créditos internos. Se muestran los tokens de entrada/salida devueltos por la API. No se sustituye un coste desconocido por tokens estimados ni por cero. Un cargo informado como cero sí es cero real.

Si se interrumpe la respuesta o no llega el importe, queda pendiente y conserva su reserva. En Uso, «Consultar coste» intenta recuperar `total_cost` usando el ID de generación que guardó el servidor. Si no existe ID o el proveedor todavía no publica el resultado, no puede confirmarse automáticamente y la reserva se mantiene. No se reintenta una generación de pago de forma automática.

Regenerar es otra solicitud y otro coste. Se revisa la estimación antes de confirmarlo. El gasto de la conversación incluye las respuestas sustituidas. Borrar el texto de una conversación no borra el registro de Uso.

La sesión es la sesión de acceso de Better Auth: sus pestañas comparten registro y límite. Un inicio de sesión diferente tiene su propio contador/límite. Redis conserva los registros hasta 7 días desde su último uso. El valor real informado por el proveedor tiene prioridad sobre la estimación; el registro no es una factura ni incluye comisiones de compra de saldo, impuestos o redondeos de la cuenta del proveedor.

## Alcance de los otros estudios

Cinema Studio queda con pestañas Imagen, Video, Editar, Dirigir y Galería, identificadas como próximas a la etapa 2. PDF Studio queda como etapa 3, con acceso explícito al editor actual y los briefs anteriores. Archivos compartidos muestra la futura biblioteca común, sin inventar assets.

Los nuevos contadores cubren el nuevo Chat. Las llamadas existentes de Kie/editor todavía no están instrumentadas. Cinema y PDF sumarán sus gastos a este registro cuando se implementen, junto con la galería persistente compartida. No hay llamadas a fal.ai en esta etapa.

## Qué probar

Antes de añadir la clave:
1. Entrar con Google. Ver CHAT, PDF STUDIO, CINEMA STUDIO, Archivos y Uso.
2. En Chat abrir el selector: buscar modelos, filtrar proveedor, marcar favoritos, cerrar/reabrir. Comprobar el aviso de clave pendiente.
3. Escribir un mensaje: comprobar la estimación en créditos y USD, el modelo concreto de Auto y la reserva conservadora. El envío permanece bloqueado sin clave.
4. En PDF Studio abrir el editor y los proyectos anteriores. En Cinema recorrer las pestañas: no deben generar nada.
5. Probar menú móvil, Tab, Escape y navegación atrás/adelante.

Después de añadir la clave y desplegar (cada mensaje puede consumir saldo):
1. Enviar un mensaje corto. Ver streaming, etiqueta del modelo y «Usó N créditos (USD)» al terminar.
2. Cambiar el modelo y mandar otro mensaje. La primera respuesta debe conservar su etiqueta original.
3. Copiar una respuesta. Pulsar Regenerar, revisar la NUEVA estimación y confirmar la solicitud. El total debe incluir las dos respuestas cobradas.
4. Ir a Uso y verificar el desglose por modelo/estudio. Cambiar el límite a un valor que cubra lo gastado pero no la siguiente reserva: el nuevo envío debe bloquearse.
5. Abrir dos pestañas con la misma sesión y verificar que el gasto/límite se actualizan. No aumentar el límite para esta comprobación si no se necesita.
6. Borrar una conversación: desaparece el texto, pero los cargos permanecen en Uso.
7. Si se detiene una respuesta, comprobar que el cargo no se convierte en cero; usar Consultar coste si queda pendiente.

## Archivos completos

Reemplazar:
- `.env.example` (solo se añade el nombre de la nueva variable vacía).
- `src/app/globals.css`
- `src/components/workspace.tsx`
- `src/components/studio/sidebar.tsx`

Añadir:
- `src/app/api/studio-chat/models/route.ts`
- `src/app/api/studio-chat/quote/route.ts`
- `src/app/api/studio-chat/stream/route.ts`
- `src/app/api/studio-chat/usage/route.ts`
- `src/lib/studio-chat/config.ts`
- `src/lib/studio-chat/catalog.ts`
- `src/lib/studio-chat/pricing.ts`
- `src/lib/studio-chat/ledger.ts`
- `src/lib/studio-chat/server.ts`
- `src/lib/studio-chat/openrouter.ts`
- `src/components/studio/chat-errors.ts`
- `src/components/studio/chat-model-picker.tsx`
- `src/components/studio/pure-chat.tsx`
- `src/components/studio/usage.tsx`
- `src/store/chat.ts`
- `tests/studio-chat.test.ts`
- `docs/TRES_ESTUDIOS_ETAPA_1.md`

El ZIP entrega cada archivo entero en su ruta. No incluye secretos ni `.env`. El repositorio ya contiene las fuentes, el logo y el componente de proyectos anteriores de la etapa previa: esta entrega se aplica SOBRE ese repositorio, no es un proyecto vacío.

## Instalación manual alternativa

Si ya está publicado por GitHub no es necesario hacer esto:
1. Descomprimir el ZIP.
2. En GitHub abrir `kimikling76/RuskiCode`, crear una rama desde `main`.
3. Abrir cada archivo existente con el lápiz y reemplazar TODO su contenido por el archivo correspondiente del ZIP. Añadir los archivos nuevos con Add file → Create new file, usando la ruta completa, o Upload files dentro de la carpeta correspondiente. No subir el ZIP como un solo archivo.
4. Abrir una pull request a `main`, comprobar la lista de rutas e integrarla.
5. En Vercel esperar que el despliegue de `main` quede Ready. No hay comando de migración ni instalación adicional.

Validación automática: pruebas de precio, créditos reales/cero/desconocido, contexto, Auto, firmas de cotización, reservas/límites y parsing SSE. Además se ejecutan las pruebas existentes y la compilación. Una autorización real de OpenRouter requiere la clave del propietario; no se ha simulado como una conexión real ni se ha gastado saldo. La revisión visual automatizada en navegador no está disponible en este entorno.

Fuentes oficiales para revisar los importes y contratos:
- https://openrouter.ai/api/v1/models
- https://openrouter.ai/docs/cookbook/administration/usage-accounting
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation
