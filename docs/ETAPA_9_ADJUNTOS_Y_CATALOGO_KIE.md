# Etapa 9 — Adjuntos en el Chat y catálogo completo de Kie

Esta etapa suma dos cosas:

- **El Chat acepta imágenes y archivos.** Podés adjuntarlos con el clip, arrastrarlos y soltarlos, o pegar una captura.
- **El estudio lista todos los modelos que Kie documenta.** Son 230 modelos de texto, imagen, video y audio, cada uno con sus opciones reales.

## 1. Adjuntos en el Chat

### Qué se puede adjuntar

| Tipo | Archivos | Qué recibe el modelo |
|---|---|---|
| **Imágenes** | PNG, JPEG, WebP, GIF, AVIF (lo que el navegador pueda abrir) | La imagen. |
| **Documentos** | PDF con texto, Word (.docx), texto (.txt), Markdown, HTML, CSV y JSON | El texto del documento, tal cual. No se resume ni se reescribe. |

- **Límites:** hasta 6 archivos por mensaje y hasta 50 MB por archivo.
- **Imágenes:** las que miden más de 2048 px se achican en tu navegador.
- **Documentos:** de cada uno se envían hasta 120.000 caracteres. Si es más largo, el chip lo avisa («se envían los primeros 120.000 caracteres») y el modelo recibe la marca de recortado.
- **Rechazos con motivo:**
  - Un PDF escaneado (sin texto) se rechaza y se sugiere pasarlo antes por «Reconocer texto (OCR)» en PDF Studio.
  - Un .doc viejo se rechaza y se sugiere guardarlo como .docx o PDF.

### Cómo funciona

1. **En tu navegador.** La imagen se achica, si hace falta. Del documento se extrae el texto: con pdf.js para los PDF, con mammoth para Word y con el mismo lector del importador de PDF Studio para HTML y texto.
2. **Se guarda una sola vez en el estudio.** Va al mismo depósito de archivos que las imágenes de los libros (`/api/sync/assets`), identificado por su contenido. El mensaje guarda solo la referencia. Por eso el chat aparece con sus imágenes y documentos en tus otras computadoras, sin llenar el almacenamiento del navegador.
3. **El servidor arma el pedido.** Lee los archivos de tu cuenta y los manda como lo documenta cada API de Kie:

| Modelos | API de Kie | Cómo van las imágenes | Fuente |
|---|---|---|---|
| Gemini (formato OpenAI), GPT 5.2 | `…/v1/chat/completions` | Como **enlace https**. Kie documenta solo enlaces para este formato, así que el servidor sube la imagen a la [subida de archivos de Kie](https://docs.kie.ai/file-upload-api/quickstart). Es gratis y la borran a las 24 horas; el enlace se reutiliza durante 20 horas. | [Gemini 3.8 Flash](https://docs.kie.ai/market/gemini/gemini-3-8-flash-openai), [GPT 5.2](https://docs.kie.ai/market/chat/gpt-5-2) |
| GPT 5.5 a 6.1, Grok 4.x, DeepSeek, Kimi | `…/v1/responses` | Como `input_image` con la imagen misma (`data:image/…;base64`). | [GPT 5.5](https://docs.kie.ai/market/chat/gpt-5-5), [Grok 4.7](https://docs.kie.ai/market/grok/grok-4-7) |
| Gemini «(API de Gemini)» | `/gemini/v1/models/…:streamGenerateContent` | Como `inline_data`, con la imagen misma. | [Gemini 3.8 Flash](https://docs.kie.ai/market/gemini/gemini-3-8-flash) |
| Claude | `/claude/v1/messages` | **No se envían.** Kie no documenta imágenes para Claude. El Chat avisa y no deja enviar; las imágenes de mensajes anteriores se nombran sin enviarse. Los documentos sí llegan, porque son texto. | [Claude Sonnet 4.6](https://docs.kie.ai/market/claude/claude-sonnet-4-6) |

- **Qué modelos leen imágenes:** el selector de modelos lo dice en cada fila («lee imágenes»).
- **Cuántas imágenes se reenvían:** los modelos no recuerdan, así que en cada pedido se vuelven a mandar las imágenes de la conversación. Van las 8 más recientes; las más viejas se nombran. Lo mismo vale para los documentos: hasta 240.000 caracteres por pedido, empezando por los más nuevos.
- **Los adjuntos como material:** el servidor le aclara al modelo que el texto dentro de `<attachment>` es material que adjuntaste, no instrucciones. El Chat sigue neutro: no se agregan otras instrucciones.

### Privacidad

- **En el estudio:** los archivos se guardan en tu cuenta, igual que las imágenes de los libros. Borrar un mensaje no borra el archivo guardado.
- **En Kie:** solo los modelos que piden un enlace (Gemini en formato OpenAI y GPT 5.2) hacen que la imagen se suba al almacenamiento temporal de Kie. Ese enlace es público mientras dura (24 horas). Con los demás modelos la imagen va dentro del pedido.

## 2. Catálogo completo de Kie

### De dónde sale

Kie no tiene una API que liste sus modelos, pero su documentación sí los lista:

- `docs.kie.ai/llms.txt` enumera todas las páginas;
- cada página trae la especificación OpenAPI del modelo: endpoint, campos, valores permitidos y valores por defecto.

`scripts/kie-catalog.mjs` lee esas páginas y escribe `src/lib/ai/kie-catalog.ts`. Para actualizarlo cuando Kie agregue modelos:

```bash
npm run kie:catalog
```

Los tres modelos usados de verdad desde el estudio (Gemini 3.8 Flash, Gemini 3.1 Pro y Nano Banana 2.1) siguen escritos a mano en `src/lib/ai/models.ts` y reemplazan a su versión generada.

**Regla del generador:** solo se ofrece una opción si la documentación la enumera. Por ejemplo, si Kie no lista las duraciones de un modelo de video que exige duración, el modelo queda listado pero deshabilitado.

### Qué hay hoy (revisado el 17 de octubre de 2026)

| Tipo | Total | Usado de verdad | Habilitado, sin prueba real | Listado, sin pantalla |
|---|---|---|---|---|
| Texto | 41 | 2 | 39 | 0 |
| Imagen | 65 | 1 | 56 | 8 |
| Video | 94 | 0 | 31 | 63 |
| Audio y música | 30 | 0 | 0 | 30 |

Por qué quedan modelos listados pero deshabilitados (el motivo se ve en Ajustes y en cada selector):

| Motivo | Modelos |
|---|---|
| Video que necesita una imagen de inicio o de referencia: la pestaña de video todavía no la tiene. | 29 |
| Herramientas sin prompt (mejorar resolución, quitar fondo, detección). | 18 |
| Pide un campo que la pantalla no da (video de entrada, audio, máscara…). | 18 |
| Audio y música (Suno, ElevenLabs, voz de Gemini): todavía no hay pantalla. | 30 |
| Pide una duración sin que la documentación enumere los valores. | 4 |
| Usa una API propia de Kie que el estudio no implementa. | 2 |

### Dónde se ve

- **Chat, «Crear con IA» y el asistente de PDF Studio:** los 41 modelos de texto.
- **Cinema → Imagen:** los modelos de imagen, con sus proporciones, resoluciones, «Calidad» o «Tamaño» según el modelo. Un modelo que solo edita pide al menos una imagen de referencia antes de generar.
- **Cinema → Video:** ahora tiene 31 modelos habilitados (Veo 3.1, Kling, Wan, Seedance, Grok Imagine, MiniMax, HappyHorse y otros), con sus formatos, resoluciones y duraciones. Ya no dice «Próximamente».
- **Ajustes → Conectores:** el catálogo entero, con búsqueda y filtros por tipo y por estado.

## 3. Verificación

### Pruebas automáticas

`npm test` pasa: 116 pruebas, 10 de ellas nuevas en `tests/stage9.test.ts`. Comprueban:

- **El catálogo:**
  - lista todos los modelos;
  - Grok toma su identificador del ejemplo documentado;
  - los endpoints de Gemini en formato OpenAI no reciben un campo `model`, porque la documentación no lo tiene;
  - GPT 5.2 se pide sin streaming;
  - Claude figura sin imágenes.
- **El formato de cada API**, con un transporte simulado:
  - enlace https para el formato OpenAI;
  - `input_image` para Responses;
  - `inline_data` y las instrucciones al comienzo del primer turno para la API de Gemini;
  - los créditos que Gemini informa después del texto;
  - la respuesta JSON de GPT 5.2.
- **Los adjuntos:**
  - el esquema solo acepta referencias, nunca bytes;
  - los documentos van como texto y no pueden cerrar su propia etiqueta;
  - las 8 imágenes más nuevas y el recorte de documentos largos;
  - un archivo que falta se rechaza.
- **La subida a Kie:** formulario multipart, la clave del servidor, el host documentado y una sola subida por contenido.
- **Cinema:**
  - una sola imagen donde el campo la pide;
  - la duración como número (Veo 3.1);
  - los valores por defecto documentados nunca pisan lo que elegiste.

`npm run build` también pasa.

### Prueba en el navegador

Pasaron los 30 controles. La prueba usó el servidor real, la cuenta real con Better Auth, Postgres con las migraciones y dos perfiles del navegador como «dos computadoras». Kie fue simulado (ver los límites). Comprobé:

- **Adjuntar:**
  - una imagen grande (3200 px quedó en 2048 px), un PDF en ruso y un Word;
  - el PDF escaneado y el .doc se rechazan con su motivo;
  - pegar una captura y arrastrar un CSV también los adjunta.
- **Lo que recibió cada API**, según lo registrado por el Kie simulado:
  - Automático (Gemini 3.8 Flash): enlace https después de subir la imagen;
  - GPT 5.5: la imagen anterior otra vez, como `input_image`;
  - Gemini con su propia API: `inline_data` y streaming;
  - Claude: solo texto, con la imagen nombrada sin enviarse;
  - GPT 5.2: sin streaming.
- **El texto ruso** llegó intacto en `<attachment>`.
- **Mensajes:**
  - un mensaje solo con archivos se envía sin texto vacío;
  - la misma imagen se sube a Kie una sola vez.
- **Computadora B:** el chat llegó con sus 2 imágenes, descargadas del estudio, y sus 3 documentos.
- **Ajustes:** 230 modelos; la búsqueda «veo» y el filtro «Audio» funcionan; audio aparece «Sin pantalla en el estudio».
- **Cinema:**
  - Seedream 4.5 muestra «Calidad»;
  - Veo 3.1 se pidió con `duration: 8` como número;
  - la confirmación muestra modelo, formato, resolución y duración.
- **Celular (390 px):** la bandeja de adjuntos entra sin desplazamiento horizontal.
- **Calidad:** axe (WCAG 2.1 AA) sin problemas en el compositor con adjuntos, el chat ni el catálogo, y sin errores de consola.

## 4. Límites y pendientes

- **Solo se probó contra un Kie simulado.** En este entorno no hay clave de Kie. Las pruebas verifican la forma exacta de cada pedido según la documentación, no que Kie responda. Antes de dar por cerrado cada modelo nuevo conviene probarlo una vez desde el estudio. Los modelos marcados «sin prueba real» no se usaron nunca contra Kie.
- **Claude no recibe imágenes** mientras Kie no las documente para su endpoint.
- **PDF escaneados:** primero hay que pasarlos por el OCR de PDF Studio. Los modelos de Gemini podrían leer un PDF directamente, pero el estudio manda el texto para que funcione igual con todos los modelos y puedas ver qué se envió.
- **Video desde una imagen:** la pestaña de video todavía no deja elegir una imagen de inicio, por eso esos 29 modelos están deshabilitados.
- **Audio y música:** no tienen pantalla todavía.
- **Archivos guardados:** quedan en el estudio aunque borres el mensaje (no hay limpieza automática).
- **Base de datos:** no hace falta ninguna migración. Los archivos usan la tabla `sync_asset`, que ahora también acepta `text/plain`.
- **Vercel:** no hace falta configurar nada nuevo. Alcanza con `KIE_API_KEY`, como antes.
