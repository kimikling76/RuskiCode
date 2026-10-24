# Referencias desde la computadora y Kling 4.0

## Subir referencias desde tu computadora

Hasta ahora las referencias solo se podían elegir de la galería de Cinema. Ahora el mismo selector tiene, arriba, **«Subir desde tu computadora»**, y también se pueden **arrastrar imágenes** al selector.

- **Dónde:**
  - en el Estudio: el chip Referencias, el botón «+» y el cuadro de imagen inicial;
  - en Mis elementos, la imagen de cada personaje o lugar;
  - en las pestañas Imagen, Video y Editar de Cinema Studio.
- **Qué imágenes:** PNG, JPEG, WebP, GIF o AVIF. Si arrastrás otro tipo de archivo, el selector lo explica y no lo sube.
- **Qué pasa con la imagen:**
  - si es muy grande, se achica en tu navegador (hasta 2048 px por lado);
  - se guarda en el almacenamiento de tu estudio, igual que los adjuntos del Chat;
  - llega a Kie **solo cuando generás** con ella;
  - no vence a los 14 días como los enlaces de Kie.
- **Límite:** el del modelo elegido. Si subís más imágenes de las que acepta, se suman las que entran y el selector lo avisa.
- Las imágenes subidas aparecen en el grupo **«Subidas desde tu computadora»**, arriba de la galería, ya marcadas. Las que no elijas dejan de aparecer ahí al recargar la página: hay que subirlas de nuevo, lo que lleva un momento.

Los textos que decían «subir desde el dispositivo llega más adelante» se cambiaron.

## Kling 4.0

Kie publicó Kling 4.0 en su documentación (docs.kie.ai, leída el 24 de octubre de 2026) en dos variantes, y las dos ya están en los modelos de video.

### Kling 4.0 Reference to Video

- **Referencias:** hasta 10 imágenes.
- **Calidad:** 720p o 1080p.
- **Formato:** automático, 16:9, 9:16, 1:1 o 21:9.
- **Duración:** de 3 a 30 segundos (5 por defecto, como indica Kie).

### Kling 4.0 Keyframe to Video

- **Imagen inicial:** una (su primer cuadro).
- Mismas calidades, formatos y duraciones que Reference to Video.

### Lo que no se ofrece todavía

Kie documenta más cosas de Kling 4.0 que el estudio todavía no tiene:
- videos de referencia;
- «elementos» con varias fotos;
- voces;
- cuadros intermedios y final en Keyframe.

No se muestran botones para eso. Tampoco se muestra un precio, porque Kie no lo publica para estos modelos.

### Cómo nombra Kling 4.0 las imágenes

La documentación pide que el texto nombre las imágenes como `@image_1`, `@image_2`… (o `@first_frame` en Keyframe), y **rechaza el pedido si hay un «@» que no corresponde a nada enviado**. Por eso, solo con los modelos cuya página lo dice:

- **Los «@» sueltos se quitan.** Un «@esto» del texto queda como «esto». Así Kie no rechaza el pedido.
- **Cada imagen enviada queda nombrada.** Si el texto no la nombra, se agrega al final, por ejemplo «Use @image_1, @image_2.».
- **En el Estudio, cada personaje llamado con «@» que tiene foto lleva su etiqueta**, por ejemplo «Иван (@image_1): A tall man…». Así el modelo sabe qué imagen es quién.
- **«Ver lo que se envía» muestra exactamente ese texto**, igual al que recibe Kie.

Los demás modelos reciben el texto como siempre.

### Cómo se agregó

- **El catálogo:** el generador del catálogo (`scripts/kie-catalog.mjs`) aprendió a leer dos cosas que trae la documentación de Kling 4.0:
  - una duración dada como rango de segundos enteros;
  - la forma de nombrar las imágenes en el texto.

  Con eso generó las dos entradas, que se sumaron al catálogo. El resto del catálogo no se regeneró, para no cambiar modelos que hoy funcionan.
- **El servidor** arma el pedido con esos datos (`src/lib/cinema/mentions.ts`).

## Cómo se probó

- **Pruebas automáticas:**
  - los «@» sueltos y las imágenes nombradas, incluido que `@image_10` no se confunda con `@image_1`;
  - la etiqueta de los personajes;
  - el pedido exacto de los dos Kling 4.0.
- **En el navegador, con una Kie de prueba (sin gastar créditos):**
  - subir una imagen en el Estudio, en Mis elementos y en las pestañas Imagen y Editar;
  - rechazar un archivo de texto;
  - elegir Kling 4.0 en el Estudio y en la pestaña Video;
  - generar un video con la imagen subida.

  La Kie de prueba recibió:
  - la imagen subida a su almacenamiento;
  - `kling-4.0/reference-to-video`, con `image_urls`, 720p, formato auto y 5 segundos;
  - el texto con «Use @image_1.».
- **Accesibilidad:** axe sin hallazgos en el selector.
- **Lo demás:** `tsc`, las 173 pruebas y el build de producción, sin errores.
