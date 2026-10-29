# Videos de referencia

Los modelos de video que, según su documentación en Kie, aceptan videos ahora dejan elegirlos como referencia. Se pueden subir desde la computadora o tomar de la galería. Los demás modelos siguen aceptando solo imágenes, como antes.

## Qué modelos

Leídos de docs.kie.ai el 29 de octubre de 2026:

| Modelo | Videos | Por archivo | Duración | Además |
|---|---|---|---|---|
| Seedance 2.0, 2.0 Fast, 2.0 Mini | hasta 3 | 50 MB | 2 a 15 s, 15 s entre todos | también imágenes |
| Seedance 2.5 | hasta 10 | 50 MB (el estudio) | 2 a 30 s, 30 s entre todos | también imágenes |
| Wan 3.0 Video y Video Prime | hasta 5 | 50 MB (el estudio) | 1 a 15 s, 15 s entre todos | también imágenes |
| Wan 2.7 R2V | hasta 5 | — | — | hasta 5 entre imágenes y videos; pide al menos uno |
| Kling 4.0 Reference to Video | hasta 5 | — | 2 a 30 s | en el texto, `@video_1`… |
| MiniMax H3 Reference to Video | hasta 3 | 50 MB | 2 a 15 s, 15 s entre todos | pide al menos una imagen o un video |
| Kling 3.0 Omni Transformation | 1, obligatorio | 50 MB (el estudio) | 3 a 15,5 s | transforma un video |
| **Nuevos:** Wan 2.6 Video to Video y Flash | hasta 3, obligatorio | 10 MB | — | |
| **Nuevo:** Wan 2.7 Video Edit | 1, obligatorio | 50 MB (el estudio) | — | |
| **Nuevo:** HappyHorse Video Edit | 1, obligatorio | 50 MB (el estudio) | 3 a 60 s | también imágenes |
| **Nuevo:** Kling 3.0 Motion Control | 1, obligatorio | — | — | y una imagen del personaje |
| **Nuevo:** Runway Aleph | 1, obligatorio | — | — | |

- **Modelos nuevos:** los marcados así no estaban habilitados porque pedían un video que el estudio no podía dar. Ahora aparecen en la lista. HappyHorse Reference to Video (y su versión 1.1) también se habilitó: pedía imágenes con un nombre de campo que el estudio no conocía.
- **Límites:** donde la página de Kie no dice el peso máximo, o dice más de 50 MB, el estudio acepta hasta 50 MB por video.
- **Sin video:** Kling 2.6 Motion Control sigue deshabilitado, porque pide además una orientación del personaje que la pantalla no da. Gemini Omni pide videos con recortes de tiempo y todavía no se ofrece.

## Cómo se usa

- **Dónde:** en la pestaña Video de Cinema y en el Estudio (modo Video), con el botón de película junto al de imágenes. En el Chat, la tarjeta de /video-generation tiene «Elegir videos…».
- **El selector:**
  - **«Subir video desde tu computadora»** (MP4 o MOV), o arrastrar el video;
  - **«De la galería»:** los videos que generaste. Kie los guarda 14 días.
- **El selector avisa antes de usar el video** si pesa o dura más de lo que acepta el modelo, o si entre todos suman más segundos de los permitidos.
- **En el texto, los videos se llaman @video1, @video2…** El servidor lo traduce al formato de cada modelo: Kling 4.0 recibe `@video_1`, los demás «video 1». «Ver lo que se envía» lo muestra.
- **Al cambiar de modelo:** si un video elegido ya no le sirve al nuevo, por ejemplo porque pesa más, un aviso lo dice y Generar queda apagado.
- **Si el modelo necesita un video** (Video to Video, Video Edit), Generar queda apagado hasta elegirlo.

## Qué pasa con el video

- **Un video de tu computadora queda guardado en este navegador.** No va a tu cuenta ni a otras computadoras: en otra computadora hay que elegirlo de nuevo.
- **Al generar, se envía en partes** de menos de 4 MB, porque Vercel no acepta más por pedido. El servidor:
  - junta las partes;
  - comprueba que el archivo sea exactamente el elegido, con su huella SHA-256;
  - lo sube al almacenamiento temporal de Kie (24 horas);
  - **borra las partes**, así no ocupan espacio en tu base de datos.
- **Si hay que reintentar**, las partes se vuelven a enviar desde el navegador.
- **La duración y una imagen de muestra** las lee el navegador. Si no puede abrir el video (algunos navegadores no abren ciertos MP4 o MOV), lo acepta igual, sin duración. Kie lo comprueba al recibirlo.

## Cómo se probó

- **Pruebas automáticas** (`tests/estudio.test.ts`):
  - los límites leídos de cada página;
  - el pedido con los videos en su campo (lista o uno solo);
  - `@video1` traducido (Kling 4.0: `@video_1`, y los videos no nombrados se agregan);
  - las partes que deben coincidir con el tamaño.
- **En el navegador, con una Kie de prueba (sin gastar créditos):**
  - **video de 10,8 MB desde la computadora con Seedance 2.0 Fast:** viajó en 3 partes, y Kie recibió el archivo con la misma huella SHA-256 que el original. Después las partes ya no estaban en el servidor;
  - **Wan 2.6 Video to Video:** sin video, Generar quedó apagado. El video de 10,8 MB se rechazó en el selector, porque el límite es 10 MB. Al pasar a ese modelo con el video ya elegido apareció el aviso. Con un video de 0,4 MB, Kie recibió `video_urls`;
  - **Estudio con Kling 4.0:** «Ver lo que se envía» mostró `@video_1`;
  - **Chat:** un video de la galería llegó como su enlace de Kie en `reference_video_urls`.
