# Etapa 11 — Skills en el Chat

El Chat ahora tiene **skills**. Una skill es una herramienta que la IA usa con las capacidades del estudio:
- generar imágenes y videos con Kie;
- crear páginas del manual con el diseño de una unidad;
- revisar el ruso.

Se llaman escribiendo **«/»** al principio del mensaje. Si no llamás ninguna, el Chat sigue siendo un chat neutro.

**La regla de todas:** nada se pide a Kie ni se cambia en el manual hasta que confirmes, en una ventana que dice qué va a pasar. Las cuatro skills quedan en la conversación y llegan a tus otras computadoras con el chat.

## 1. Cómo se usan

### Elegir una skill

Hay tres formas de elegirla:
- **Escribiendo «/»** al principio del mensaje. Se abre la lista; al seguir escribiendo se filtra («/vid» deja solo `/video-generation`). Con ↑ y ↓ te movés, con Enter o Tab elegís y con Esc cerrás.
- **Con el botón** de la barra del mensaje que está al lado del clip.
- **Tocando una de las skills** que aparecen en un chat vacío.

Qué pasa después:
- **La skill elegida queda marcada** arriba del mensaje y sirve también para los mensajes siguientes.
- **Para quitarla:** la ✕ o la tecla Borrar con el mensaje vacío.
- **Para cambiar de skill:** escribí «/» de nuevo.

### `/image-generation` — generar imágenes

1. **Escribís la imagen.** Si querés, adjuntás imágenes de referencia (por ejemplo, la foto de un personaje).
2. **Se arma una tarjeta en el chat** con el prompt, el modelo de imagen (Nano Banana 2.1 por defecto), el formato, la resolución o calidad, la cantidad y las referencias.
   - **Solo aparecen las opciones que la documentación de Kie da para ese modelo.**
   - **Si el modelo acepta menos referencias de las que adjuntaste,** lo dice.
3. **«Mejorar el prompt con IA»** (opcional): reescribe el prompt con el modelo de texto automático. Cuesta pocos créditos.
4. **«Generar…»** abre la confirmación: modelo, opciones, cantidad, referencias y el **último costo real** que Kie informó para ese modelo en el estudio. Si todavía no hay uno, lo dice: nunca muestra un precio inventado.
5. **El resultado:** aparece en la tarjeta y en la galería de Cinema, con su estado real (en cola, generando).
6. **La copia en el estudio:** cuando la imagen termina, el estudio guarda su propia copia en tu cuenta. Kie borra sus archivos a los 14 días; desde ahora el chat y la galería muestran la copia del estudio cuando la de Kie ya no está, también en la otra computadora.

**Las referencias:**
- **Cómo viajan:** las imágenes adjuntas ya estaban guardadas en el estudio. El servidor las lee de tu cuenta y se las pasa a Kie con su subida de archivos.
- **Privacidad:** es un enlace temporal, que Kie borra a las 24 horas y que es público mientras dura.

### `/video-generation` — generar videos

- **Desde texto:** con los modelos de video que funcionan solo con un prompt.
- **Desde una imagen:** adjuntás una imagen, o tocás **«Animar con /video-generation»** en una imagen generada en el chat. Se crea una tarjeta de video con esa imagen de inicio.
- **El modelo:** Veo 3.1 por defecto, porque acepta texto e imagen. Los modelos que **necesitan** una imagen solo se pueden elegir cuando hay una; si no, el selector explica por qué.
- **La confirmación** muestra modelo, formato, resolución, duración, imagen de inicio y último costo real.
- **El video** se ve en la tarjeta y en Cinema. Un video tarda minutos: podés seguir trabajando.
- **Los videos no se copian al estudio:** suelen pesar más de 4 MB, que es lo máximo que guarda hoy. Por eso la tarjeta dice hasta qué día lo guarda Kie, para que lo descargues antes. El botón de descarga ahora funciona también para videos.

**Más modelos de video:** el catálogo ahora sabe en qué campo pide la imagen cada modelo. Hay **49 modelos de video habilitados**, antes eran 31:
- 31 funcionan solo con texto (son los de la pestaña Video de Cinema);
- 18 necesitan una imagen de inicio (se usan desde `/video-generation`);
- 33 aceptan una imagen.

### `/pdf-generator` — crear páginas del manual

1. **Escribís qué querés,** por ejemplo «ejercicios de мой / моя sobre la familia».
2. **La IA escribe el contenido** con las piezas de la plantilla del manual: títulos, textos y ejercicios con consigna, ejemplo, ítems y respuestas. Recibe como contexto:
   - las consignas y los ejemplos de tu unidad, para copiar el estilo;
   - el vocabulario que ya aparece en el manual;
   - el nivel.
3. **El estudio arma las páginas** con el diseño de la unidad: banda, número, auriculares, código de audio, colores, dos columnas, pie y pestaña.
   - **La IA no dibuja nada:** el diseño sale siempre igual.
   - **La numeración es del estudio, no del modelo:** los números de ejercicio y los códigos de audio siguen la unidad (después del 3 y el 9.03 vienen el 4 y el 9.04). En una unidad nueva, el ejercicio 1 lleva el código 10.01.
4. **La tarjeta muestra:**
   - la **vista previa real** de las páginas; un clic en una página la abre en grande;
   - las **palabras que no aparecen en el manual**, para revisarlas;
   - **dónde va:**
     - **una unidad nueva** con el diseño de otra (número siguiente, página 1, pestaña con el número nuevo);
     - **al final de una unidad**, en páginas nuevas.
5. **Para pedir cambios,** escribilos en el chat con `/pdf-generator`. El borrador anterior vuelve al modelo junto con el pedido.
6. **«Guardar en PDF Studio…»** confirma y guarda. Cuando se agregan páginas a una unidad, antes se guarda una versión de la unidad. El enlace **«Abrir en PDF Studio»** abre el editor en la primera página nueva.

**Si el modelo responde en otro formato,** no se aplica nada y la tarjeta lo dice.

### `/revisar-ruso` — revisar el ruso

- **Con texto:** pegás el texto o adjuntás el documento.
- **Sin texto:** la tarjeta te deja elegir una unidad del manual y qué páginas revisar.
- **Dos revisiones:**
  - **Automática, sin IA y gratis:** encuentra letras latinas metidas en palabras rusas («мaма» con una «a» latina) y códigos escritos de dos formas (como «A1» con A latina en unas páginas y con А rusa en otras).
  - **Con IA:** ortografía, gramática, tildes de acento mal puestas, palabras fuera de nivel y consignas poco claras. Cada observación trae la cita, el problema y la sugerencia; en una unidad, también un enlace que abre el editor en esa página.
- **Nada se cambia solo:** la revisión informa y la corrección la hacés vos en el editor.

## 2. Cómo funciona por dentro

| Pieza | Qué hace |
|---|---|
| `src/lib/skills/chat.ts` | La lista de skills. Define lo que cada una deja en el chat (un registro en el mensaje, con una línea de resumen para el historial). Valida el borrador de `/pdf-generator` y la revisión con zod, numera los ejercicios, calcula el vocabulario y hace las revisiones automáticas. |
| `src/lib/skills/run.ts` | Lo que hace cada skill: pedir el texto al modelo, armar y guardar las páginas, mandar las imágenes y los videos a Kie. |
| `src/components/studio/skill-cards.tsx` | Las tarjetas del chat, con su confirmación. |
| `src/lib/manual/units.ts` | Una unidad nueva con el diseño de otra, y el contenido nuevo acomodado en páginas, en memoria. Sirve para la vista previa; se guarda solo al confirmar. |
| `src/lib/cinema/keep.ts` | Copia al estudio las imágenes terminadas. Las que pesan más de 4 MB se guardan como JPEG de alta calidad del mismo tamaño. |
| `/api/cinema/images` | Ahora acepta como referencia una imagen guardada en el estudio (`asset:<huella>`). |
| `/api/cinema/download` | Ahora también descarga videos. |
| `src/lib/personal-chat/input.ts` | Dos tareas nuevas para el modelo de texto, con sus instrucciones: escribir con la plantilla del manual y revisar ruso. Las dos piden una respuesta JSON que el estudio valida antes de mostrar nada. |

- **Base de datos:** no hace falta ninguna migración.
- **Vercel:** no hay que configurar nada nuevo; alcanza con `KIE_API_KEY`, como antes.
- **Las skills viejas:** las de la carpeta `skills/` son del compositor de libros anterior y no cambiaron.

## 3. Verificación

### Pruebas automáticas

`npm test` pasa 136 pruebas. Las 8 nuevas están en `tests/stage11.test.ts` y comprueban:
- **El menú:** las cuatro skills, el filtro y el comando escrito completo.
- **`/pdf-generator`, el borrador:**
  - se lee aunque venga entre marcas de código;
  - a los ítems se les sacan los números;
  - si trae piezas desconocidas, se rechaza.
- **`/pdf-generator`, la numeración:** la ponen el estudio, en una unidad nueva y al final de una existente.
- **El armado con la plantilla:** sin desbordes.
- **Las palabras nuevas** y el contexto que recibe el modelo.
- **Las revisiones automáticas:** letras latinas y «A1» de dos formas, sin falsas alarmas.
- **La revisión con IA:** se lee de la respuesta y las páginas de una unidad se mandan una por una.
- **Las instrucciones** de cada tarea del modelo y la línea de resumen de las tarjetas.
- **El video desde una imagen:** cada modelo recibe la imagen en el campo que nombra su documentación (Veo 3.1 en `image_urls`; los que piden un enlace solo, en su campo de texto).

`npm run build` también pasa.

### Prueba en el navegador

Pasaron los 30 controles. Se usaron el servidor real, la cuenta real, Postgres con las migraciones y dos perfiles del navegador como «dos computadoras».

**Lo que se simuló:** Kie, porque en este entorno no hay clave. El Kie simulado responde en los formatos documentados y registra lo que recibe. Los archivos que Kie aloja tampoco se pueden bajar desde acá: la prueba pone una imagen en esos enlaces. Comprobé:
- **El menú:** se abre con «/», se filtra, se cierra con Esc y entra en un celular (390 px).
- **`/image-generation`:**
  - la tarjeta trae el prompt, el modelo y la referencia adjunta;
  - **antes de confirmar, Kie no recibió ningún pedido**;
  - «Mejorar el prompt» reescribe el prompt;
  - la confirmación dice todo, sin inventar un costo;
  - Kie recibió el modelo, el prompt mejorado y la referencia ya subida a su almacenamiento;
  - la imagen terminada quedó **guardada en el estudio**.
- **«Animar»:** creó una tarjeta de video con esa imagen. Kie recibió Veo 3.1 con la imagen en `image_urls`, formato 16:9, 720p y 4 s. La tarjeta muestra el video y hasta qué día lo guarda Kie.
- **`/pdf-generator`:**
  - **el borrador:** tiene vista previa real y una página se abre en grande;
  - **lo que recibió el modelo:** las consignas del manual, el vocabulario y el pedido;
  - **la unidad nueva:** se guardó «Урок 10. Семья» con el diseño de la unidad de prueba;
  - **un pedido de cambios:** llevó el borrador anterior; se agregó al final de la otra unidad, con su versión previa;
  - **el editor:** abrió directamente en la página 4.
- **`/revisar-ruso`:**
  - **con texto:** la revisión automática encontró la «a» latina;
  - **con una unidad:** las observaciones tienen enlace a su página, y el modelo recibió el texto página por página.
- **Computadora B:**
  - con el enlace de Kie respondiendo «no existe», la imagen se ve desde la copia del estudio;
  - llegaron el video, el borrador guardado y las revisiones.
- **Calidad:** axe (WCAG 2.1 AA) sin problemas y sin errores de consola.

## 4. Límites y pendientes

- **Ningún modelo se probó todavía contra Kie real** desde estas skills: en este entorno no hay clave.
  - **Nano Banana 2.1** ya se usaba de verdad en Cinema.
  - **Veo 3.1** y los demás modelos de video figuran como «sin prueba real».
  - **Las respuestas de los modelos de texto** con la plantilla y con la revisión dependen de cada modelo. El estudio valida el formato y rechaza lo que no cumple, pero conviene probar uno o dos modelos con tu clave.
- **Videos:** no se guardan en el estudio por su tamaño. Sigue pendiente la decisión: contratar un almacenamiento de archivos, o descargarlos antes de los 14 días.
- **Imágenes en las páginas:** `/pdf-generator` todavía no pone imágenes. Para eso hay que generarlas con `/image-generation` y ponerlas en el editor del manual.
- **Las palabras nuevas son una comparación de formas:** «учителя» aparece como nueva aunque el manual tenga «учитель». Es una lista para revisar, no un error.
- **Pendientes:** `/audio` y las skills creadas por ustedes, como estaba en el plan.
