# Chat personal — correcciones 1, 2 y 3

Esta entrega se aplica sobre la versión publicada en `main`, conservando el diseño oscuro/lima, login, variables, generación de libros, Postgres, Redis e Inngest. Añade una ruta aislada para el Chat personal. No modifica el backend editorial del libro ni requiere nuevas claves.

## 1. Conversación personal

La pantalla CHAT deja de usar Workspace/AIConversation editorial. Se usa un componente independiente y `POST /api/personal-chat`. El prompt de sistema es exactamente:

«Eres un asistente útil; responde en el idioma del usuario.»

No importa BookSpec, skills, contexto del libro ni proyectos. La validación rechaza campos de proyecto y roles system enviados desde el navegador. El primer envío crea solo un chat, con título del mensaje; el menú y el lápiz permiten renombrarlo. Nuevo chat no crea un proyecto ni un chat vacío guardado.

Para conservar las llamadas que ya funcionaban, esta etapa reutiliza únicamente los adaptadores Kie del servidor existente. No incorpora OpenRouter ni fal.ai y no pide otra clave. La revisión del catálogo y los precios por modelo se hace en la corrección 4. Los costes desconocidos no se muestran como cero ni se inventan créditos internos.

## 2. Conversión explícita

La barra superior del Chat incluye «Convertir en proyecto». Se elige:
- PDF Studio: libro, documento o presentación.
- Cinema Studio: imagen o video.
- Nombre y tipo de proyecto.
- Toda la conversación, solo un resumen revisado, o mensajes marcados.

Abrir/cancelar el panel no guarda un proyecto ni llama a la IA. «Proponer brief con IA» es una solicitud explícita a Kie que puede consumir saldo. La propuesta contiene objetivo, público, nivel, estilo, restricciones y un resumen; los datos ausentes se marcan por definir, sin asumir Русский код. Todo es editable antes de confirmar. También puede redactarse manualmente si falla la IA.

«Confirmar y abrir proyecto» guarda el proyecto y su enlace en una sola escritura del almacenamiento. El chat original sigue siendo personal y puede convertirse otra vez en proyectos distintos. Si se elige resumen, el proyecto conserva solo el resumen revisado y el brief, no una copia oculta del transcript completo. Los mensajes seleccionados se copian solo al confirmar. El destino abre su proyecto con brief y fuente; las herramientas futuras de Cinema/PDF se conectan por etapas.

## 3. Borrado y lugar de almacenamiento

Ahora los chats NUEVOS son locales: `localStorage`, clave `estudio-personal-v2`. Dentro se separan chats, proyectos confirmados, borrados pendientes y metadatos de consumo. No se guardan conversaciones personales en Postgres ni Redis. La conversación se envía al proveedor solo al pedir una respuesta o propuesta. Sus registros externos en Kie no se eliminan desde esta interfaz.

Si existieran chats de la PR anterior en `estudio-pure-chat-v1`, se trasladan a la nueva clave; la clave antigua se elimina después de guardar correctamente, evitando copias duplicadas que sobrevivan al borrado.

Los proyectos y chats editoriales antiguos (`ruskicode-projects-v1` y `ruskicode-chat-v1-*`) se mantienen dentro de PDF/Cinema como proyectos anteriores. No se importan al Chat personal ni se borran al limpiar los chats personales, para no eliminar proyectos existentes sin una decisión explícita.

Cada chat tiene menú «…»: Renombrar y Borrar. Borrar pide confirmación y explica que los proyectos se conservan. Durante 8 segundos el contenido permanece en el registro de pendientes para poder deshacer. Luego se elimina ese registro, incluidos título y mensajes. Si se cierra el navegador durante esos 8 segundos, JavaScript no puede ejecutar un temporizador; al volver a abrir, el registro vencido se purga antes de mostrar el historial. Recargar no permite recuperar un borrado ya vencido.

Cada mensaje tiene su propio botón de borrar con confirmación. Eliminar el primer mensaje también elimina su título automático derivado; un título renombrado por vos se conserva. Las copias previamente confirmadas en proyectos son independientes.

Ajustes → Borrar todos los chats exige dos confirmaciones; la segunda requiere escribir BORRAR. Elimina chats y todos los pendientes, sin conservar una papelera oculta. Los proyectos y los metadatos de consumo no contienen una copia adicional del chat y se conservan. Los proyectos convertidos solo se borran desde el estudio de destino, mediante su propia confirmación.

Si el almacenamiento falla, se muestra un error y la operación no se anuncia como confirmada. Las pestañas de un mismo navegador escuchan cambios del almacenamiento y evitan sobrescribir silenciosamente una versión de otra pestaña. Esto no equivale a sincronización entre computadoras.

## Sincronización entre ustedes

Los chats y los proyectos convertidos NO se sincronizan entre tu compañero y vos. La opción más simple es usar el Postgres existente con tablas de chats, mensajes y proyectos asociadas a la cuenta compartida, conservando los mismos flujos de conversión y borrado. Implica una migración y endpoints de lectura/escritura; no está activada en esta entrega. No hace falta contratar otro servicio.

## Archivos completos y sus rutas

Reemplazar:
- `src/app/globals.css`
- `src/components/workspace.tsx`
- `src/components/studio/sidebar.tsx`

Añadir:
- `src/lib/personal-chat/state.ts`
- `src/lib/personal-chat/input.ts`
- `src/store/personal-chat.ts`
- `src/app/api/personal-chat/route.ts`
- `src/components/studio/personal-chat.tsx`
- `src/components/studio/chat-dialogs.tsx`
- `src/components/studio/convert-chat.tsx`
- `tests/personal-chat.test.ts`
- `docs/CORRECCIONES_CHAT_1_2_3.md`

El ZIP incluye cada archivo COMPLETO en su carpeta, no parches ni fragmentos. No incluye secretos ni `.env`. Se aplica sobre RuskiCode existente, no sobre un proyecto vacío. No cambia package.json ni requiere instalar paquetes.

## Instalación manual alternativa

Si se integra la PR preparada, no hace falta copiar archivos:
1. Descargar y descomprimir el ZIP.
2. Abrir GitHub → `kimikling76/RuskiCode`. Crear una rama desde `main`.
3. Para cada archivo existente: abrir su ruta, pulsar el lápiz y reemplazar TODO su contenido por el archivo del ZIP.
4. Para archivos nuevos: Add file → Create new file, escribir la ruta completa y pegar el archivo completo. O usar Upload files dentro de la carpeta correspondiente. No subir el ZIP como un solo archivo.
5. Crear la pull request a main y revisar que solo contenga esta lista de rutas.
6. Tras integrar el cambio, Vercel despliega automáticamente. Abrir proyecto ruskicode → Deployments y esperar Ready.
7. Entrar en `https://www.ruskicode.com/workspace?studio=chat` y actualizar la página.

No cambiar variables de entorno, claves ni base de datos. El acceso de Google permanece igual. No integrar la antigua PR #5 de OpenRouter: corresponde a una propuesta anterior que esta corrección reemplaza.

## Qué probar

1. Entrar con Google y escribir algo ajeno al libro. Debe crear un chat con título, responder como asistente general y no mostrar Detalles del proyecto, Editar brief ni Tipo de proyecto. PDF/Cinema no deben recibir un proyecto automáticamente.
2. Renombrar desde el menú … y desde el lápiz. Recargar y comprobar que se conserva.
3. Abrir Convertir en proyecto y cancelarlo: no debe aparecer ningún proyecto. Proponer un brief con IA solo si se acepta que esa solicitud puede consumir saldo.
4. Confirmar una conversión a PDF, luego otra a Cinema. Revisar que ambas existan, que el chat siga intacto y que sus etiquetas abran el proyecto correcto.
5. Probar los tres alcances: conversación completa, resumen y mensajes marcados. En resumen no debe aparecer la conversación completa dentro del proyecto; en selección, solo deben aparecer los mensajes marcados.
6. Borrar un chat y pulsar Deshacer antes de 8 segundos. Repetir sin deshacer, esperar y recargar: no debe volver. Sus proyectos deben seguir disponibles.
7. Borrar un mensaje; comprobar que desaparece tras recargar y que las copias de proyectos no cambian. Borrar el primer mensaje sin título renombrado: su contenido no debe quedar como título automático.
8. Ajustes → Borrar todos: comprobar ambas confirmaciones y que el borrado final conserve los proyectos. Borrar un proyecto solo desde su estudio: el chat original debe continuar.
9. Probar navegación móvil y dos pestañas del mismo navegador. Ver el aviso de que no hay sincronización entre computadoras.
10. Abrir los proyectos anteriores y el editor: las herramientas existentes deben seguir disponibles.

## Validación y siguiente entrega

Las pruebas cubren neutralidad, rechazo de contexto editorial, conversión repetida, selección/resumen, borrado a 8 segundos, conservación de proyectos/consumo y limpieza del almacenamiento real simulado. No se han hecho llamadas de pago. La revisión del flujo con una sesión real de Google y una respuesta real de Kie requiere probar la interfaz autenticada.

Siguiente: corrección 4, primero catálogo/precios de Chat y después Cinema. No se supondrá una API de listado de modelos ni una compatibilidad universal entre modelos. Se consultará la documentación de cada endpoint, los precios de Kie y la documentación del saldo antes de activarlos. Los modelos sin verificar quedarán desactivados. No se usará OpenRouter.
