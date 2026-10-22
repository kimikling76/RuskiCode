# Diseño 4 — Chat: selector de modelo, respuestas y celular

Es la fase del Chat del plan de diseño, salvo la letra y los colores, que esperan tu respuesta a las preguntas 1 y 3 del plan.

## Qué cambió

### Selector de modelo (Chat y Cinema)

El mismo selector se usa en el Chat y en Cinema: Imagen, Video y Editar.

- **La búsqueda va primero.** Al abrirlo, el cursor ya está en «Buscar modelo».
- **Filtros en una sola fila.**
  - Antes, los filtros por proveedor ocupaban dos filas arriba de la búsqueda.
  - Ahora van debajo, en una fila que se desliza de costado. El borde se esfuma cuando hay más.
- **Grupos honestos.** Los modelos se agrupan así:
  - «Probados en el estudio».
  - «Sin probar todavía · según la documentación de Kie». Antes, cada fila repetía «sin prueba real todavía».
  - Los que no están disponibles, al final.
- **Qué hace cada modelo, completo y en hasta dos líneas** (antes se cortaba con «…»). Sale del catálogo y no promete nada más:
  - texto: «lee imágenes», «busca en la web»;
  - imagen: «crea y edita», «solo edita», «hasta 10 referencias», «hasta 4 por pedido»;
  - video: «anima una imagen», «imagen inicial opcional», «hasta 9 referencias», «5–10 s».
- **Más ancho**: 420 px.
- **Accesibilidad.**
  - Cada fila se lee con el mismo texto que se ve.
  - El panel tiene nombre.

### Respuestas

- **Los bloques de texto y de prompt ajustan la línea.** El prompt sugerido se lee entero, sin deslizar de costado. El código de verdad (con lenguaje: js, python…) conserva sus líneas y se desliza dentro de su caja.
- **Las tablas no parten las palabras.** «Tipográfica» ya no se corta en «Tipográfi / ca». Cada columna tiene un ancho mínimo y, si la tabla no entra, se desliza dentro de su caja.

### Bienvenida y título

- **Chat vacío**: la bienvenida queda centrada en la pantalla y sin la «Ж» gigante de fondo.
- **Título de un chat nuevo**: se corta en una palabra entera y termina en «…». Antes podía quedar «…cocina rusa para pr».

### Celular

- **Botón «+» con las herramientas.** Adjuntar, Skills, Buscar en la web y Contexto del libro quedan juntos en un solo botón «+».
  - Un punto en el «+» avisa si la búsqueda o el contexto del libro están activados.
  - El menú marca con ✓ lo activado.
- **«Preguntar» se ve siempre.** Antes, en el celular el interruptor «Preguntar antes» quedaba solo, sin texto. Para los lectores de pantalla sigue llamándose «Preguntar antes».
- **Botones del cuadro de 44 px**: «+», modelo, Preguntar y Enviar.
- **Opciones de menú de 44 px** en las pantallas táctiles, en todo el estudio.

## Qué no cambió

- Qué modelos hay y cuáles se pueden elegir.
- Los favoritos y lo que se manda a Kie.
- Las skills, adjuntos, búsqueda y contexto del libro: hacen lo mismo, solo cambia dónde están en el celular.
- `/revisar-ruso` sigue en las sugerencias del Chat neutro. Sacarlo fuera del contexto del libro cambia un comportamiento, y el plan lo dejó para cuando lo apruebes.
- La letra y los colores.

## Cómo probarlo

En la vista previa de esta rama, con sesión iniciada:

1. **Selector.**
   - En el Chat, tocá el modelo (abajo, «Automático»).
   - Escribí «haiku» y Enter: queda elegido.
   - Abrilo de nuevo y fijate en los dos grupos.
2. **Respuestas.** Pedí algo que traiga una tabla y un prompt: la tabla no corta palabras y el prompt se lee sin deslizar.
3. **Cinema.** En Video, abrí el modelo: cada uno dice si anima una imagen, si la imagen inicial es opcional y cuántos segundos dura.
4. **Celular.**
   - Tocá «+»: aparecen las cuatro herramientas.
   - Activá «Buscar en la web»: el «+» muestra un punto.
   - Elegí «Skills»: se abre la lista de skills con el cursor en el mensaje.

## Qué se probó

- **Copia local** con base de datos de prueba y Kie simulado:
  - el selector con el teclado: búsqueda, Enter, y Tab y Enter en los filtros sin elegir un modelo por error;
  - los selectores de Imagen y Video;
  - una respuesta con tabla y bloque `text`;
  - el título de un mensaje largo;
  - el menú «+» y sus cuatro herramientas.
- **Celular de 390 px:**
  - sin desplazamiento de costado;
  - el cuadro en una sola línea de 44 px;
  - la tabla y el código sin cortes ni desplazamiento.
- **Accesibilidad:** axe en el Chat, el selector abierto, Cinema y el celular.
  - Queda un aviso que ya existía: el cuadro de mensaje usa el rol «combobox» para la lista de skills.
  - Con un menú abierto, axe marca lo mismo que con los menús de siempre.
- `npm test` (con una prueba nueva para el título), `tsc` y `next build` sin errores.
- **No probado:** Kie real y un celular real con el teclado en pantalla.
