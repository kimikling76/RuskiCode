# Etapa 12 — Imágenes en `/pdf-generator` y búsqueda en la web

Esta etapa trae dos cosas:
- **`/pdf-generator` ahora crea las imágenes de las páginas**, como en la unidad 1: fotos, galerías con etiquetas e historietas con globos. Las imágenes **no se buscan en internet**: las crea un modelo de imagen de Kie a partir de lo que pediste.
- **Los modelos de texto pueden buscar en la web**, en el Chat, en las skills de texto y en «Crear con IA». Solo lo hacen los modelos cuya documentación de Kie dice cómo.

**La regla sigue igual:** nada se pide a Kie ni se cambia en el manual hasta que confirmes.

## 1. Imágenes en `/pdf-generator`

### Qué tipos de imagen hay

Son las mismas que usa la unidad 1:

| Tipo | Para qué | Cómo queda en la página |
|---|---|---|
| **Foto** | Una escena (la familia en la cocina, la escuela). | Con esquinas redondeadas y un epígrafe opcional debajo. |
| **Galería** | Varias fotos en cuadrícula, cada una con su etiqueta (un abecedario, las caras de los personajes). | De 2 a 6 columnas. Si un ejercicio habla de «la foto 3», la galería va numerada. |
| **Historieta** | Un diálogo en viñetas. | Viñetas con marco y **globos de diálogo dibujados por el estudio**. |

**Las etiquetas y los globos no están dentro de la imagen:** son texto del estudio, encima o debajo. Por eso se pueden corregir (una tilde, una palabra) sin generar la imagen de nuevo.

### Cómo se usa

1. **Pedís las páginas** con `/pdf-generator`, como antes. Podés decir qué imágenes querés («con fotos de la familia y una historieta en la casa de la abuela»). Si no decís nada, el modelo pone imágenes donde ayudan, como en el manual.
2. **Si querés que los personajes se parezcan a alguien**, adjuntá fotos en el mismo mensaje. Van como referencia con cada imagen, si el modelo de imagen acepta referencias.
3. **La tarjeta muestra el borrador** con la vista previa de las páginas. Las imágenes que todavía no existen se ven como recuadros **«Imagen pendiente»**.
4. **Debajo está la sección «Imágenes»:**
   - cada imagen, con su etiqueta y su prompt (que podés cambiar);
   - el modelo de imagen (Nano Banana 2.1 por defecto);
   - la resolución (2K por defecto, para que se vea bien impresa);
   - el **estilo común** de todas las imágenes. El modelo de texto propone uno («fotos realistas, luminosas, con luz natural»), y lo podés cambiar.
5. **«Generar las N imágenes que faltan…»** abre una confirmación con el modelo, la cantidad, la resolución, las referencias y **el último costo real** que informó Kie para ese modelo. Si Kie todavía no informó ninguno, lo dice: no se inventa un precio.
6. **Al confirmar**, se pide una tarea a Kie por imagen, con unos segundos entre una y otra (el estudio acepta 8 tareas cada 10 segundos). Cada imagen terminada **se guarda en el estudio y entra sola en la vista previa**. También aparece en la galería de Cinema.
7. **Si una imagen no te gusta**, tocá **«Otra versión»**: se pide solo esa, con su confirmación. Si cambiás el prompt de una imagen, esa vuelve a quedar pendiente.
8. **«Guardar en PDF Studio»** guarda la unidad con sus imágenes. Si falta alguna, la confirmación lo avisa: queda el recuadro «Imagen pendiente» y la podés poner después.

**Lo que no se paga dos veces:** si pedís cambios al borrador con otro `/pdf-generator`, las imágenes con el mismo prompt se conservan.

### Qué recibe el modelo de imagen

Cada prompt tiene tres partes:
- **la escena**, en inglés, que escribió el modelo de texto. Si un personaje aparece en varias imágenes, se repite su descripción completa (edad, pelo, ropa) para que se vea igual;
- **el estilo común**;
- **la orden de no dibujar texto, letras, números, globos ni logos.** En las viñetas, además, se pide dejar lugar arriba para los globos.

El formato de cada imagen (16:9, 1:1, 4:3…) se adapta al más cercano que ofrece el modelo elegido. La imagen llena su lugar y se recorta, como las fotos de la unidad 1, sin deformarse.

### En el editor del manual

Al elegir una foto, una galería o una historieta, el panel muestra:
- **cada imagen**, con su tamaño en píxeles;
- **«Cambiar imagen…»**, para poner otra desde un archivo;
- **«Copiar prompt»**, para generarla en Cinema o con `/image-generation`;
- **las etiquetas, el epígrafe y los globos**, como campos de texto. Una historieta acepta hasta 4 globos por viñeta.

Una galería o una historieta más alta que una página sigue en la página siguiente, y la numeración continúa.

## 2. Búsqueda en la web

### Cómo se usa

- **En el Chat:** el botón del globo terráqueo 🌐 en la barra del mensaje. Queda guardado en cada conversación.
- **En «Crear con IA»** (PDF Studio): el mismo botón, al lado del modelo.
- **En `/pdf-generator` y `/revisar-ruso`:** usan la búsqueda si está activada en ese chat.

La respuesta:
- **dice «Con búsqueda web»** debajo, al lado del modelo;
- **muestra «Páginas consultadas»** cuando Kie informa cuáles usó. Son enlaces que abren en otra pestaña;
- **además, el modelo cita sus fuentes** al final de la respuesta, en una sección «Fuentes».

### Qué modelos buscan

Solo los que lo dicen en su página de la documentación de Kie (revisada el 17 de octubre de 2026). El selector de modelos lo indica con **«busca en la web»**.

| Modelos | Cómo se activa (según la documentación de Kie) |
|---|---|
| Gemini (2.5 Pro, 3 Pro, 3.1 Pro, 3.5 a 3.8 Flash, 4 Argon), en el formato de OpenAI | `tools: [{"type":"function","function":{"name":"googleSearch"}}]` |
| Gemini 3.5 a 3.8 Flash y 4 Argon, en su formato propio | `tools: [{"googleSearch": {}}]` |
| GPT 5.5, 5.6 y 6.x (formato Responses) | `tools: [{"type":"web_search"}]` |
| GPT 5.2 | `tools: [{"type":"function","function":{"name":"web_search"}}]` |

**No buscan:** Claude, Grok y DeepSeek (su documentación no lo menciona) y Kimi K3 (su página dice que no lo admite). Si el globo está activado y elegís uno de esos:
- un aviso dice que ese mensaje va sin búsqueda;
- el servidor tampoco la pide: si un pedido la trae con un modelo que no la admite, lo rechaza.

### Seguridad

- **Lo que dicen las páginas es información, no órdenes.** El modelo recibe esa indicación: no debe seguir instrucciones que encuentre en una página, y si una lo intenta, tiene que decirlo.
- **Solo se muestran enlaces web** (`http` o `https`).
- **En las tareas que responden JSON** (`/pdf-generator`, `/revisar-ruso`), el modelo no pone enlaces dentro del JSON: las páginas se listan aparte.

## 3. Cómo funciona por dentro

| Pieza | Qué hace |
|---|---|
| `scripts/kie-catalog.mjs` | Lee en cada página de la documentación de Kie si el modelo busca en la web y con qué herramienta. |
| `src/lib/ai/provider.ts` | Agrega la herramienta que corresponde a cada formato. Lee las páginas citadas en las formas que usan OpenAI (`url_citation`) y Gemini (`groundingMetadata`). |
| `src/lib/personal-chat/input.ts` | La opción `webSearch` del pedido y la indicación sobre las páginas. Las instrucciones de `/pdf-generator` ahora incluyen foto, galería e historieta. |
| `src/components/studio/chat-sources.tsx` | La lista «Páginas consultadas». |
| `src/lib/manual/model.ts` · `compose.ts` · `units.ts` | Los tres tipos de imagen del manual: cómo se dibujan, el recuadro pendiente, los globos y la galería que sigue en otra página. |
| `src/lib/skills/chat.ts` | El borrador con imágenes, la lista de imágenes y el prompt de cada una. |
| `src/lib/skills/run.ts` | Pide las imágenes a Kie, las sigue y las trae al borrador desde la copia del estudio. |
| `src/components/studio/skill-cards.tsx` | La sección «Imágenes» de la tarjeta. |
| `src/components/manual/manual-inspector.tsx` | Los campos de imágenes, etiquetas y globos en el editor. |

- **Base de datos:** no hace falta ninguna migración.
- **Vercel:** no hay que configurar nada nuevo; alcanza con `KIE_API_KEY`.
- **Arreglo de accesibilidad:** las miniaturas de páginas del editor de documentos ahora tienen un nombre que coincide con lo que se ve.

## 4. Verificación

### Pruebas automáticas

`npm test` pasa 144 pruebas. Las 8 nuevas están en `tests/stage12.test.ts` y comprueban:
- **Qué modelos buscan:** Gemini y GPT sí; Kimi K3, Claude, Grok y DeepSeek no.
- **La herramienta de cada formato:** se manda la que dice la documentación, y nada con la búsqueda apagada.
- **Las páginas citadas:** se leen en los formatos de OpenAI, Responses y Gemini; los enlaces que no son web se descartan.
- **La indicación al modelo:** en el chat y en las tareas JSON.
- **El borrador con imágenes:**
  - cada imagen tiene su lugar;
  - los valores imposibles se corrigen solos;
  - un borrador que pide más de 24 imágenes se rechaza.
- **El prompt de cada imagen:** la escena, el estilo y «sin texto».
- **El formato más cercano** que ofrece cada modelo.
- **Qué imágenes se conservan:** solo las del mismo prompt.
- **El armado:** recuadros pendientes, imagen recortada a su lugar, etiquetas y globos como texto, PDF sin faltantes.
- **La galería larga:** sigue en otra página y la numeración continúa.

`npm run build` también pasa.

### Prueba en el navegador

Pasaron los 46 controles, con axe (WCAG 2.1 AA) sin problemas y sin errores de consola. Se usaron el servidor real, la cuenta real, Postgres con las migraciones, dos perfiles del navegador como «dos computadoras» y un celular (390 px).

**Lo que se simuló:** Kie, porque en este entorno no hay clave. El Kie simulado responde en los formatos documentados y registra lo que recibe. Las imágenes «generadas» son campos de color distintos para cada tarea, para comprobar que cada una cae en su lugar. Comprobé:
- **La búsqueda en el Chat:**
  - el globo empieza apagado;
  - el selector dice qué modelos buscan;
  - con Gemini, Kie recibió `googleSearch` y la indicación sobre las páginas;
  - la respuesta muestra 2 páginas consultadas, como enlaces que abren aparte;
  - con GPT 5.5, Kie recibió `web_search`;
  - con Kimi K3 aparece el aviso y no se manda ninguna herramienta;
  - con el globo apagado, tampoco.
- **«Crear con IA»:** busca, cita y muestra las páginas.
- **`/pdf-generator` con imágenes:**
  - el borrador trajo 8 imágenes pendientes y **Kie no recibió nada antes de confirmar**;
  - la confirmación dice el modelo, la cantidad, 2K, la referencia y que todavía no hay costo informado;
  - Kie recibió 8 tareas, separadas por casi 1,5 segundos, cada una con su escena, el estilo, «sin texto», su formato (16:9, 1:1, 4:3) y la foto de referencia;
  - las 8 imágenes llegaron a la tarjeta y a la vista previa, cada una en su lugar;
  - «Otra versión» pidió solo esa imagen;
  - cambiar un prompt la dejó pendiente; guardar en ese momento avisó «Falta 1 imagen».
- **El editor:**
  - muestra la galería con cada imagen y su etiqueta;
  - corregir una etiqueta («наш папа») y un globo cambió el texto de la página.
- **Computadora B**, con los enlaces de Kie ya vencidos:
  - la tarjeta mostró las 8 imágenes desde la copia del estudio;
  - el PDF exportado tiene las 8 imágenes y la etiqueta corregida, sin avisos de faltantes.
- **Celular:** las imágenes y los botones entran sin cortes ni desplazamiento.

## 5. Límites y pendientes

- **Nada de esto se probó todavía contra Kie real:** en este entorno no hay clave.
  - Nano Banana 2.1 ya se usaba de verdad en Cinema.
  - **Las páginas citadas:** Kie no documenta cómo devuelve las citas. El estudio las lee en los formatos de OpenAI y de Gemini; si Kie usa otro, la lista no aparece, pero el modelo igual cita sus fuentes en el texto. Conviene probar una pregunta con tu clave.
  - **Los borradores con imágenes** dependen de cada modelo de texto. El estudio valida el formato y rechaza lo que no cumple.
- **Personajes iguales en todas las imágenes:** ayudan la descripción repetida y las fotos de referencia, pero el modelo de imagen puede variar algo. Para eso está «Otra versión».
- **Las imágenes pendientes en el editor** se ponen desde un archivo: todavía no hay un botón «Generar» dentro del editor. Mientras tanto, «Copiar prompt» y `/image-generation`.
- **Videos:** sigue pendiente dónde guardarlos.
