# Cinema Studio: videos de referencia (primera versión, unificada)

La primera versión de los videos de referencia (#33) los ofrecía solo en **Kling 4.0 Reference to Video**, con un MP4 de hasta 4 MB guardado entero en el estudio. Se unificó con la versión que los ofrece en todos los modelos de video cuya página de Kie los documenta. Todo lo actual está en **`docs/VIDEOS_DE_REFERENCIA.md`**.

## Qué se conservó de la primera versión

- **La comprobación del archivo MP4**, por su encabezado (`ftyp`, `src/lib/cinema/video-reference.ts`). Ahora se hace en el navegador antes de aceptar el video, y el servidor la sigue aplicando a los MP4 guardados enteros.
- **El orden de las comprobaciones:** el pedido se revisa antes de buscar la clave de Kie, así que un pedido rechazado nunca llega a Kie. Un modelo sin campo de video, o más videos de los que acepta, se rechazan con `INVALID_PARAMETERS`.
- **Las menciones** `@video1` → `@video_1` en Kling 4.0, como nombres enteros (`@video10` no es `@video1`).
- **Los trabajos ya guardados con esa versión** (`videoReferences`, MP4 como `asset:<sha256>`):
  - siguen mostrando cuántos videos llevaban;
  - «Repetir con estos ajustes» y «Reintentar» los vuelven a enviar: el servidor toma el MP4 guardado y lo sube a Kie.
- **Sus pruebas** (`tests/video-reference.test.ts`), adaptadas a los nombres actuales del catálogo.

## Qué cambió

- **Más modelos y archivos más grandes:** el límite de 4 MB por video ya no aplica. Un video de la computadora queda en el navegador y viaja en partes al generar, hasta 50 MB.
- **El botón y el selector:** «Agregar video» dentro del selector de imágenes pasó a ser un selector propio de videos, en la pestaña Video, el Estudio y el Chat.
- **El script de QA** de la primera versión (`scripts/cinema-video-qa.mjs`) se retiró, porque probaba esa pantalla. La prueba en el navegador de la versión actual está descrita en `docs/VIDEOS_DE_REFERENCIA.md`.
