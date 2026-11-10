# Cuadros de Kling 4.0 Keyframe y audio de referencia

## Kling 4.0 Keyframe: inicio, cuadros intermedios y final
- **Antes** solo se podía dar la primera imagen. Ahora entran **hasta 10 imágenes**, que son los cuadros del video en orden:
  - la primera es **el inicio** (`@first_frame`);
  - las siguientes son **cuadros por los que pasa** (`@keyframe_1`, `@keyframe_2`…);
  - con **«La última imagen es el cuadro final del video»**, la última es **el final** (`@last_frame`).
- **En el texto** se siguen llamando @image1, @image2… El estudio las convierte en los nombres de Kling.
- **Para cambiar el orden,** la flecha de cada imagen la pasa un lugar antes.
- **La duración limita los cuadros**, como dice la página de Kie: 3 s, 4 cuadros; 5 s, 6; 8 s, 9; de 9 s en adelante, 10. Si hay más, el estudio avisa y no lo envía.
- **El formato** solo se usa si no hay imágenes. Con imágenes, el video sale con el formato del primer cuadro.
- **Está en** Cinema → Video y en el Estudio.

## Audio de referencia
Los modelos de video que, según su página de Kie, aceptan audio ahora tienen un botón con una **nota musical**. El audio se elige desde tu computadora y se escucha antes de enviarlo.

| Para qué es | Modelos | Reglas de su página |
|---|---|---|
| **Audio de referencia** (música, una voz o un sonido para que el video lo siga) | Seedance 2.0, 2.0 Fast, 2.0 Mini (hasta 3) | MP3 o WAV, 2 a 15 s cada uno, 15 s entre todos, 15 MB |
| | Seedance 2.5 (hasta 10) | MP3, WAV, AAC u OGG, 2 a 30 s, 30 s entre todos, 15 MB |
| | MiniMax H3 Reference (hasta 3) | Además, necesita una imagen o un video |
| | Vidu Q4 Reference (hasta 3) | Solo MP3, 3 a 12 s, 50 MB |
| | Wan 3.0 y 3.0 Prime (hasta 5) | MP3 o WAV, 1 a 15 s, 15 s entre todos; en el texto se llaman Audio1, Audio2 |
| **Voz de referencia** (el timbre de la voz del personaje) | Wan 2.7 R2V | MP3 o WAV, 1 a 10 s, 30 MB |
| **Audio que dice el personaje** (la persona de la imagen lo dice: mueve los labios) | Wan 2.7 Image to Video, OmniHuman 1.5, InfiniTalk, Kling AI Avatar Pro y Standard | Según cada modelo. Los avatares **piden** una imagen y un audio |
| **Audio del video** | Wan 2.7 Text to Video | La página no da límites |

- **Los avatares** (OmniHuman, InfiniTalk y Kling AI Avatar) antes no se podían usar, porque el estudio no daba audio. Ahora sí, desde Cinema → Video y el Estudio. En la tarjeta del Chat siguen apagados, porque ahí no hay botón de audio.
- **En el texto,** los audios se llaman @audio1, @audio2…
- **Cada regla se comprueba al elegir el audio,** antes de pagar: tipo, peso, duración de cada uno y de todos juntos.
- **Cómo viaja el audio:** queda en este navegador y, al generar, va al servidor en partes. El servidor lo arma, comprueba su huella, lo sube a Kie con un enlace temporal de 24 horas y borra las partes.
- **No hay límites inventados:** los límites salen de la página de cada modelo, leída por el generador del catálogo (`scripts/kie-catalog.mjs`).

## Cómo se probó
- **Pruebas automáticas:**
  - `tests/estudio.test.ts`:
    - los cuadros en sus campos;
    - los nombres en el texto;
    - el límite por duración;
    - el máximo de 8 intermedios.
  - `tests/audio-refs.test.ts`:
    - los campos y reglas de cada modelo;
    - el audio en su campo;
    - los nombres;
    - los mensajes de cada regla.
- **En el navegador, con una Kie de prueba:**
  - **Kling 4.0 Keyframe con 3 imágenes y «final» marcado:** Kie recibió `first_frame_url`, `keyframe_urls` (1) y `last_frame_url`, y el texto con `@first_frame`, `@keyframe_1` y `@last_frame`.
  - **Seedance 2.0 con un WAV de 4 s:** el audio se pudo escuchar en el selector, se subió (128 KB) y Kie lo recibió en `reference_audio_urls`. El texto decía «audio 1».
  - **En el Estudio:** el botón de audio aparece con Seedance y no aparece con un modelo que no lo acepta.
  - **Pantalla:** sin desbordes.
