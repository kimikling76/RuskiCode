# Manual con IA: revisar, crear ejercicios e ilustraciones con globos

En **PDF Studio → Manual**, al abrir una unidad, el panel de la derecha tiene una pestaña nueva: **IA**. Tiene tres partes y un selector de modelo arriba.

## El modelo

- **Se puede usar cualquier modelo de texto de Kie:** GPT, Claude, Gemini, Kimi, Grok, DeepSeek… La lista es la misma del Chat. «Automático» es Gemini 3.8 Flash.
- **Ven la página como imagen** los modelos que, según Kie, reciben imágenes: Gemini, GPT y Grok. Leen también el texto de las fotos y de los globos.
- **Claude solo lee el texto de la página,** porque Kie no documenta imágenes para Claude. El panel lo avisa al elegirlo.
- **El modelo elegido** queda guardado en este navegador.

## 1. Revisar con IA

**Qué revisa:** solo el **ruso** y las **traducciones al inglés**. El español no se revisa.

| Idioma | Qué busca |
|---|---|
| Ruso | Ortografía, gramática, concordancia y casos, tildes de acento mal puestas, letras latinas mezcladas con cirílicas, tipografía |
| Inglés | Traducciones que no coinciden con el ruso, ortografía y gramática |

**Cómo se usa:**
- **Revisar esta página:** un pedido a Kie.
- **Revisar toda la unidad:** un pedido por página. Primero pregunta, porque consume créditos, y se puede **Detener** en cualquier momento.

**Qué recibe la IA:**
- **El texto exacto de cada línea,** con un código (t1, t2…) y el nombre del bloque. El texto sale del Manual, no de una foto: no hay letras adivinadas.
- **Una imagen de la página tal como se imprime,** si el modelo ve imágenes.

**Qué devuelve:** una lista de hallazgos. Cada uno dice:
- de qué tipo es y en qué idioma;
- en qué bloque está;
- una explicación en español;
- y, cuando corresponde, la corrección.

**Antes de mostrarlos, el estudio los comprueba contra la página:**
- **Las palabras citadas tienen que estar tal cual en esa línea, una sola vez.** Si no, el hallazgo queda como nota, sin botón de aplicar.
- **Los bloques aprobados** (bloqueados) nunca se cambian desde acá: sus hallazgos son solo notas.
- **El texto dentro de una imagen** (un globo, un cartel) también es solo una nota: para corregirlo hay que cambiar la imagen.
- **Un código que no existe** en la página se descarta.

**En la página:** cada línea con hallazgos pendientes tiene una marca amarilla con el número.

### Aplicar una corrección

- **Antes y después:** cada corrección muestra la línea así, con lo quitado tachado y lo nuevo resaltado.
- **Aplicar:** cambia solo esas letras. El resto de la línea conserva su fuente, su negrita y su resaltado, letra por letra. Hay también **Aplicar las N correcciones de esta página**.
- **No se aplica, y el panel dice por qué:**
  - si la línea corregida ya no entra en su lugar;
  - si tiene una letra que la fuente no tiene;
  - si el texto cambió desde la revisión.
- **Antes de la primera corrección** se guarda la versión **«Antes de la revisión con IA»**. Además, cada cambio se deshace con ⌘Z.
- **Ver en la página:** elige la línea sin salir de la pestaña.
- **Descartar:** la quita de la lista.
- **Comparar → Marcar diferencias en rojo:** muestra después qué cambió de verdad.

## 2. Crear ejercicio con IA

1. **Escribí qué ejercicio querés,** o tocá una idea («Completar con la forma correcta del verbo», «Traducir del inglés al ruso»…).
2. **La IA lee el texto de toda la unidad** para usar su vocabulario y su gramática. Devuelve:
   - la consigna en ruso;
   - hasta 3 líneas de ejemplo;
   - los ítems;
   - las respuestas para la clave del profesor;
   - una o dos columnas.
3. **El Manual pone el número y el código de audio,** siguiendo los de la unidad, y dibuja el ejercicio con su plantilla: encabezado, colores, medidas.
4. **Vista previa:** se ve la página tal como quedará impresa.
5. **Insertar:** va debajo del último bloque. Si no entra, se ofrece una página nueva, que cambia el número de las siguientes. Antes se guarda una versión.

## 3. Ilustración con globos de diálogo

Elegiste que **el modelo de imagen dibuje todo**: la escena, los globos y el texto ruso adentro, como en las ilustraciones del manual.

- **Globos:** escribís uno por renglón, hasta 6. Con «Nombre: texto», el modelo sabe quién habla.
- **Qué recibe el modelo:**
  - el pedido de dibujar globos de cómic;
  - cada texto exacto, en cirílico, letra por letra, con sus tildes;
  - nada más escrito en la imagen.
- **Personajes:**
  - **si la unidad está vinculada a un libro** (Contexto del libro), podés elegirlos con sus imágenes aprobadas como referencia;
  - **si no lo está,** se describen en «Qué pasa».
- **Cada generación se confirma**, porque es paga. El resultado se revisa antes de insertarlo, con «¿Está bien?».
- **Importante:** los modelos de imagen a veces escriben mal las letras rusas, y ese texto queda dentro de la imagen: no se corrige como texto. Revisalo, o pasá **Revisar con IA**, que lee el texto de las imágenes.

## Créditos

- **Cada revisión de página y cada ejercicio** es un pedido a un modelo de texto de Kie.
- **Cada ilustración** es una tarea de imagen. Siempre se confirma antes.
- **Kie no publica precios por adelantado** para estos modelos. El panel muestra lo que Kie informó al terminar, y la barra lateral lo suma en «Gasto de esta sesión».

## Cómo se probó

- **Pruebas automáticas** (`tests/manual-ai.test.ts`):
  - los textos de la página en orden y con sus códigos;
  - los hallazgos comprobados: código desconocido, bloque aprobado, palabras que no están, texto en imagen, consejo sin corrección;
  - la corrección letra por letra, también dos en la misma línea;
  - los rechazos: bloque aprobado, letra sin fuente, línea que no entra;
  - la corrección dentro de un ejercicio hecho en el editor;
  - el pedido de globos;
  - las instrucciones del servidor.
- **En el navegador, con una Kie de prueba** (sin gastar créditos) y una unidad de ejemplo, no tu libro:
  - **revisar una página:** se envió la imagen de la página y los 19 textos con sus códigos;
  - **aplicar:** cambió solo esas letras, se guardó la versión «Antes de la revisión con IA» y se pudo deshacer;
  - **revisar la unidad:** después de confirmar salieron 3 pedidos, uno por página;
  - **Claude:** recibió solo el texto, sin imagen;
  - **ejercicio:** vista previa dibujada con la plantilla, e insertado como ejercicio 4 con el audio 9.04;
  - **ilustración con globos:** el pedido llegó a Nano Banana 2.1 con los dos textos rusos exactos y se insertó en la página.
- **Accesibilidad:** axe sin hallazgos en el panel ni en el diálogo de la ilustración. La página del editor ya tenía un aviso propio: le falta un título principal.
