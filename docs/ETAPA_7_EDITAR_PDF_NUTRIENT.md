# Etapa 7 — Editar un PDF tal cual, con Nutrient

> **Desde la Etapa 8:** un PDF importado se abre primero en el editor de páginas con Stirling PDF (ver `ETAPA_8_STIRLING_PDF_STUDIO.md`). El editor de Nutrient sigue disponible para cambiar el texto en su lugar: menú «…» → «Editar el texto en su lugar (Nutrient)». Cada guardado de Nutrient ahora es una versión más.

PDF Studio puede abrir un PDF **exactamente como es** y editarlo en su lugar: cambiar textos e imágenes, anotar, firmar, llenar formularios y reordenar páginas.

El resto del documento queda igual: fuentes, diseño, imágenes, páginas, colores. No se pasa a bloques. El editor es **Nutrient Web SDK** (antes PSPDFKit) y corre en el navegador.

## Cómo se usa

1. **Importá el PDF.** En PDF Studio tocá **«Importar archivo»**, o arrastrá el PDF hasta la página.
2. **Elegí cómo trabajarlo:**
   - **«Editar el PDF tal cual»** (recomendado): abre el original en el editor de Nutrient.
   - **«Convertir en libro editable»**: el camino de la Etapa 6, que pasa el contenido a bloques del estudio.
3. **Editá el contenido.** Tocá **«Editar textos e imágenes»** o el botón del editor de contenido en la barra de Nutrient. Hacé clic en un texto para cambiarlo y terminá con «Guardar y cerrar» (en la barra de Nutrient) o con «Terminar edición».
4. **Guardá o descargá.** **«Guardar»** (o Ctrl+S) guarda el PDF en tu cuenta; **«Descargar PDF»** baja una copia.
5. **Volvé a abrirlo** cuando quieras desde **«PDF originales»**, en el inicio de PDF Studio.

## Licencia: modo de prueba y clave

Nutrient es un producto comercial.

- **Sin clave**, funciona en **modo de prueba**:
  - **Marca de agua:** cada página muestra la marca roja «For Evaluation Purposes Only», y la descarga también la lleva.
  - **Tiempo limitado:** el modo de prueba vence, y después Nutrient pide una licencia.
  - **Tu PDF queda protegido:** en este modo el estudio **no deja guardar encima** del PDF, porque la marca quedaría escrita adentro (se comprobó). Solo deja descargar una «copia de prueba». El PDF guardado no cambia.
- **Con una clave**, se guarda y se descarga sin marca. Hay dos tipos:
  - **Clave publicable** (empieza con `pdf_pub_`): se crea gratis en el panel de Nutrient y es por uso, con un tramo gratuito mensual. **Sin verificar:** no pude confirmar si ese tramo gratuito incluye el editor de contenido.
  - **Licencia comercial:** la vende Nutrient.

**Para cargar la clave** (yo no la veo ni la necesito):

1. En Vercel, entrá al proyecto **ruskicode** → **Settings** → **Environment Variables**.
2. Creá `NEXT_PUBLIC_NUTRIENT_KEY` con la clave, en **Production** y **Preview**.
3. Volvé a desplegar.

Las dos claves están hechas para usarse en el navegador; Nutrient las ata a tu dominio.

## Qué hace y qué no

- **Cambia solo lo que tocás.** Se probó en un PDF de una sola fuente: se cambió una palabra y todo el resto del texto, las páginas y las imágenes quedaron iguales.
- **Hay PDFs que mezclan fuentes por idioma,** por ejemplo algunos exportados por LibreOffice cuando faltan fuentes. Ahí, al editar un párrafo se pueden perder los espacios de ese párrafo. Los PDFs de Word o InDesign con fuentes completas no tienen este problema.
- **Letras que la fuente no tiene:** si escribís una letra que no existe en las fuentes guardadas en el PDF, Nutrient no la puede dibujar. El estudio avisa cuáles fueron y en qué página.
- **PDFs escaneados:** se ven y se anotan, pero su texto no se edita, porque es una imagen.
- **Solo PDF:** Word y otros formatos siguen el camino de «Convertir en libro editable». El motor de Office de Nutrient (unos 130 MB) no se incluyó.

## Sincronización

- **Hasta 4 MB:** el PDF se guarda en tu cuenta como archivo y aparece en tus otras computadoras.
- **Más pesados:** quedan en la computadora donde se importaron; la otra los lista como «quedó en la otra computadora».
- **Abierto en las dos:** si el mismo PDF está abierto en dos computadoras, los cambios de la otra esperan; nunca se pisan en silencio.
- **Borrar:** pide confirmación y tiene «Deshacer».

## La IA de Nutrient (AI Assistant)

**No está incluida.** Nutrient AI Assistant (chat sobre el documento, resúmenes, traducción, tachado de datos privados) necesita:

- un servidor propio de Nutrient (Docker con PostgreSQL y pgvector);
- su clave de activación (licencia paga);
- una clave de un proveedor de IA (OpenAI, Azure o AWS).

No corre en Vercel. Si la querés, primero hay que contratar y alojar ese servidor; lo vemos juntos antes.

## Privacidad

- El PDF se abre y se edita **en tu navegador**.
- Nutrient manda **estadísticas de uso** a `dam.our.services.nutrient-powered.io`: la versión, un identificador al azar, una huella cifrada del documento y qué funciones se usaron. Se revisaron: no llevan el texto del documento.
- No encontré una opción documentada para apagarlas.

## Cambios técnicos

- **Dependencia nueva:** `@nutrient-sdk/viewer` **1.23.0**, con la versión fija.
  - Pesa 158 MB instalada.
  - En el sitio se publican 16 MB (motor wasm, workers, fuentes y traducciones, sin el motor de Office) en `public/vendor/nutrient`.
  - La librería es un archivo aparte de 5,4 MB que solo se carga al abrir un PDF original.
- **`scripts/copy-vendor-assets.mjs`:** reemplaza a `copy-pdfjs-assets.mjs` y copia pdf.js y Nutrient en `postinstall` y `build`. Las copias no se guardan en git.
  - Nutrient avisa que copiar sus archivos desde npm va a dejar de funcionar en una versión futura. Por eso la versión está fija; antes de actualizarla hay que revisar su guía de recursos propios («self-host assets»).
- **Editor:** `src/components/pdf/original-editor.tsx`, en la ruta `/workspace/documento?id=…`.
- **Datos:** `src/lib/books/originals.ts`. Datos y archivo se guardan por separado en IndexedDB.
- **Sincronización:** tipo `pdf-original` en `src/lib/sync/collections.ts`. El servidor de sincronización ahora acepta archivos `application/pdf` de hasta 4 MB, con `nosniff` y una CSP estricta al servirlos.
- **Pantallas:**
  - la elección en `src/components/pdf/import-dialog.tsx`;
  - la lista «PDF originales» en `src/components/pdf/pdf-home.tsx`.

## Pruebas

- **Typecheck, tests y build:** typecheck sin errores; 90 de 90 tests (3 nuevos en `tests/originals.test.ts`); build de producción correcto.
- **Prueba del editor en el navegador, en modo de prueba: 20 de 20.** Recorre:
  - la elección al importar;
  - la apertura con Nutrient;
  - el editor de contenido;
  - un cambio de texto, en el que la descarga trae el cambio y el resto del texto igual;
  - que el PDF guardado no se toque en modo de prueba;
  - la sincronización con otra computadora (mismo archivo);
  - borrar con «Deshacer»;
  - el celular, axe y contraste.
- **Camino de guardar: 4 de 4.** Se probó en una copia de prueba que habilita guardar sin clave. Comprueba «Cambios sin guardar», Ctrl+S, el archivo guardado con el cambio y la versión guardada al reabrir.
- **Sincronización real con dos navegadores, servidor y Postgres: 37 de 37.** Incluye el PDF original pasando por el servidor de verdad.
- **Importación:** 28 de 28.
- **No probado:** el uso con una clave real de Nutrient, porque no hay clave en este entorno.
