# Diseño 3 — Cinema Studio · Video: igual que Imagen

Es el mismo cambio que se hizo en la pestaña Imagen (ver `DISENO_1_CINEMA_IMAGEN.md`), ahora en Video.

## Qué cambió

**Antes:**

- Una columna de ajustes a la izquierda y los videos en un área chica.
- Solo se podían elegir los modelos que trabajan con texto.
- Los modelos que animan una imagen no se podían usar desde esta pestaña, solo desde el Chat con `/video-generation`.

**Ahora:**

- **Los videos ocupan la pantalla.**
  - En una computadora van en una grilla grande.
  - En el celular van a dos columnas.
  - Un video vertical no estira la tarjeta más allá de 520 px de alto.
- **El pedido se escribe abajo, como en Imagen.** El cuadro tiene:
  - el prompt;
  - la imagen inicial o las referencias, como miniaturas;
  - una fila de chips.
- **Cada chip muestra el valor elegido: Modelo, Formato, Resolución y Duración.**
  - Solo aparecen los que acepta el modelo elegido.
  - Un modelo con muchas duraciones (de 3 a 15 s) las muestra en filas.
- **Imagen inicial.** Con un modelo que anima una imagen (por ejemplo «Wan 2.6 · Image to Video»):
  - el botón de imagen abre la galería para elegirla;
  - el cuadro avisa si falta;
  - «Generar video» queda desactivado hasta que la elijas.
  - En los modelos que la aceptan pero no la exigen, la imagen es opcional.
- **Ayuda con el prompt pensada para video.** Propone qué pasa, el lugar, el movimiento de cámara, la luz y el estilo. Antes usaba la misma ayuda que para las fotos.
- **Generar.**
  - **Ctrl+Enter** dentro del prompt genera.
  - Con «Preguntar antes» activado se ve la confirmación de siempre, con el modelo, el formato, la resolución, la duración y la imagen inicial. No inventa costos.
- **Lo que elegís se mantiene** al pasar a otra pestaña y volver.

## Arreglos que se ven en todo Cinema

- **Las tarjetas de video** muestran solo **Descargar** y **Ver en grande**. Antes ofrecían «Usar como referencia» y «Editar esta imagen», que con un video no funcionan.
- **El visor reproduce los videos.** Antes intentaba mostrarlos como una foto. Además:
  - dice el modelo real (antes decía siempre «Nano Banana 2.1»);
  - muestra la duración;
  - **Repetir con estos ajustes** vuelve a Video con el mismo pedido;
  - la hora se muestra en formato de 24 horas.
- **La galería** muestra solo **Descargar** en los videos.
- **El selector de imágenes** (para referencias o la imagen inicial) ya no muestra videos.
- **El cuadro de generación** es un poco más ancho (1040 px) en Imagen y Video, para que los chips entren en una sola línea.

## Qué no cambió

- Lo que se manda a Kie: el servidor sigue controlando cada opción contra lo que documenta el modelo.
- El seguimiento de las tareas, lo guardado y la galería.
- `/video-generation` en el Chat.

## Cómo probarlo

En la vista previa de esta rama, con sesión iniciada:

1. **Desde texto.** En Cinema Studio → Video:
   - Escribí un prompt.
   - Tocá **Formato** y elegí 9:16.
   - Tocá **Generar video**. La confirmación dice modelo, formato y resolución.
2. **Con imagen inicial.**
   - Generá una imagen en la pestaña Imagen.
   - En Video, elegí el modelo «Wan 2.6 · Image to Video». Aparece el aviso de que falta la imagen.
   - Tocá el botón de imagen, elegí la de la galería y tocá **Usar**.
   - Escribí qué pasa y generá.
3. **Visor.** Tocá el botón de ver en grande de un video: se reproduce y muestra su modelo y duración.
4. **Celular.**
   - Los videos van a dos columnas.
   - Los chips se deslizan de costado.
   - No hay desplazamiento de costado de la página.

## Qué se probó

- **Copia local** con base de datos de prueba y Kie simulado, sin gastar créditos. Los videos de prueba son clips de barras de colores:
  - dos videos desde texto, uno con el teclado (chip con Enter y flechas, Ctrl+Enter, confirmación);
  - un video con imagen inicial elegida de la galería. Kie recibió la imagen en `image_urls`, con la resolución y la duración elegidas;
  - el chip de 13 duraciones;
  - el visor y «Repetir con estos ajustes»;
  - la ayuda con el prompt, que mandó las instrucciones de video;
  - las acciones de la galería;
  - el borrador al cambiar de pestaña.
- **Escritorio** a 1440 px: los chips entran en una línea con y sin imagen inicial.
- **Celular de 390 px:**
  - sin desplazamiento de costado;
  - los botones del cuadro miden al menos 44 px.
  - Los botones de las tarjetas siguen midiendo 28 px, igual que en Imagen.
- **Accesibilidad:** axe da lo mismo que en Imagen. Solo avisa que la página no tiene un título principal (h1), algo que ya pasaba antes. Con un chip abierto no marca nada.
- `npm test`, `tsc` y `next build` sin errores.
- **No probado:**
  - Kie real.
  - Un celular real.
  - El control de seguridad que verifica la dirección de cada imagen antes de mandarla. En la copia local ese control no puede consultar internet, así que se salteó solo ahí. En la página real funciona igual que antes, y es el mismo que ya usa `/video-generation` en el Chat.
