# Etapa 3 — PDF Studio

PDF Studio deja de ser un formulario con un JSON y pasa a ser un **editor de libros con páginas reales**: miniaturas a la izquierda, la hoja en el centro y un inspector a la derecha. El libro se guarda en su propio formato editable (`.editable.json`) y el PDF se exporta al final. Un PDF exportado no se vuelve a abrir para editar: lo que se edita es el proyecto.

## Qué funciona

| Parte | Qué hace | De dónde salen los datos |
|---|---|---|
| **Inicio de PDF Studio** | «Nuevo libro» (título, autor, idioma, nivel y formato), «Importar editable», tus libros, los libros del compositor, la muestra «Русский код · A1» y los proyectos convertidos desde el Chat, con «Crear libro». | Este navegador (IndexedDB) y el servidor para los libros del compositor. |
| **Páginas reales** | La hoja del centro muestra las mismas páginas que tendrá el PDF: mismos cortes, misma portada y mismo pie. Al escribir, la página se actualiza en menos de un segundo. | El mismo código de maquetación que usa el compositor del servidor (`src/lib/books/layout-html.ts`). |
| **Miniaturas** | Portada, contenido y capítulos agrupados. Un punto marca las páginas con avisos (página casi vacía, bloque que no entra, imagen faltante). | La maquetación real. |
| **Bloques** | Tocás un bloque en la página y se edita en el inspector: títulos, párrafos, ejercicios, tablas, notas destacadas, imágenes y la nueva **caligrafía** (modelo más 1 a 10 renglones). Mover, duplicar y borrar, con «Deshacer». | — |
| **Plantillas** | Unidad completa, vocabulario, diálogo, ejercicio, repaso y caligrafía, en ruso, español o inglés según el idioma del libro. | `src/lib/books/templates.ts`. |
| **Capítulo** | Título, resumen interno y el orden de los bloques, que se cambia arrastrando o con el teclado. Mover, duplicar y borrar capítulos. | — |
| **Libro** | Portada, nivel, colores, tamaños de letra, interlineado, columnas de las listas, formato A4, A5 o 6 × 9 in y márgenes. El libro se vuelve a paginar al cambiar cualquiera. | — |
| **Imágenes** | Subir desde el dispositivo, elegir una de Cinema o generar una nueva con Cinema (4:3, 1K), con la misma confirmación de «Preguntar antes». | Kie, con los endpoints de la Etapa 2. |
| **Asistente editorial** | «Revisar la calidad pedagógica» (crítica honesta, cada problema apunta a su bloque), «Proponer ejercicios» pensados para clases 1 a 1 y «Mejorar el bloque elegido» con antes y después. Nada se aplica sin que lo confirmes. | El modelo de chat ya configurado (`/api/personal-chat`), con instrucciones fijas en el servidor. |
| **Notas** | Notas propias o del asistente, ancladas a un bloque. Se marcan en la página con un punto, se resuelven y se reabren. | Este navegador. |
| **Historial** | Deshacer y rehacer (botones, Ctrl+Z y Ctrl+Mayús+Z), hasta 50 pasos. Guardado automático. | — |
| **Exportar PDF** | Abre el diálogo de impresión del navegador con el tamaño de página correcto. Elegí «Guardar como PDF». Si faltan imágenes, avisa antes. | El navegador. |
| **Editable** | «Descargar editable (.json)» para tener copia o abrirlo en otra computadora, y «Duplicar como libro propio» desde la muestra o un libro del compositor. | — |

- **Libros del compositor:** se abren igual que antes. En el menú ⋯, «Componer PDF en el servidor» sigue usando el mismo contrato, y el PDF final se genera allí.
- **Ruso y español:** el editor y el PDF usan Noto Sans (licencia OFL), que cubre el cirílico, la Ё/ё, la tilde de acento ruso (заво́д), la ñ, los acentos, ¿ y ¡. Ahora tiene negrita real.

## Cambios en el PDF del servidor

Estos cambios afectan a los PDF que genera el compositor, no solo al editor:

- **Tablas y ejercicios largos llenan la página.** Antes, una tabla larga se cortaba en una tabla por fila y dejaba huecos (8 páginas en la prueba). Ahora sigue en la página siguiente y repite el encabezado (5 páginas para el mismo contenido). Un ejercicio que no entra continúa con la numeración correcta.
- **La tilde de acento ruso (U+0301) ya se ve.** La fuente de respaldo no la incluía.
- **Una sola fuente en todos lados.** `worker/Dockerfile` ya no fija DejaVu Sans, así el worker usa Noto Sans igual que la vista previa del editor. Si querés otra fuente, se puede volver a fijar con `BOOK_FONT_FILE`.

## Requiere backend o un formato nuevo (no hecho)

- **Bloques con posición libre** (mover y cambiar de tamaño a mano sobre la hoja): necesita un formato de maquetación con coordenadas y otro renderizador. Hoy los bloques fluyen en orden y la paginación es automática.
- **Exportar a Word.**
- **Libros y notas compartidos entre dispositivos y personas:** hoy los libros propios y las notas viven en este navegador. El editable `.json` sirve de copia mientras tanto.
- **PDF generado en el servidor desde el editor sin pasar por el compositor:** hoy se usa la impresión del navegador, con la misma maquetación.

## Fuentes consultadas

- [`@page` y `size`](https://developer.mozilla.org/docs/Web/CSS/@page): tamaño de página al imprimir.
- [`print-color-adjust`](https://developer.mozilla.org/docs/Web/CSS/print-color-adjust): conserva los fondos y colores en el PDF.
- [IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API): guardado local de libros con imágenes, que no entran en localStorage.
- [Noto Sans en Fontsource](https://fontsource.org/fonts/noto-sans): archivos y rangos Unicode de la fuente que ya usaba el proyecto.

## Archivos

- **Maquetación compartida:**
  - `src/lib/books/layout-html.ts`: bloques a HTML, portada, fuentes y paginación. La usan el servidor y el editor.
  - `src/lib/pipeline/render.ts`: el compositor ahora la importa.
- **Formato del libro:** `src/lib/skills/schemas.ts` suma el bloque `writing` (caligrafía).
- **Navegador:**
  - `src/lib/books/{library,local-store,templates,images,assistant}.ts`
  - `src/lib/ai/text-request.ts`: pedidos de texto compartidos con Cinema.
  - `src/store/book-notes.ts`
  - `src/components/pdf/*`: editor, páginas, miniaturas, inspector, asistente, notas e inicio.
  - `src/styles/pdf.css`
  - `public/book-fonts/`: Noto Sans y su licencia.
- **Rutas:**
  - `src/app/workspace/editor/page.tsx`
  - `src/components/workspace.tsx`: el inicio de PDF Studio.
- **Texto:** `src/lib/personal-chat/input.ts` suma los usos `book-review`, `book-exercises` y `book-rewrite`. El Chat personal sigue con su instrucción neutral.
- **Despliegue:**
  - `next.config.ts` incluye la negrita de Noto Sans.
  - `worker/Dockerfile`: ver arriba.
- **Borrados:** `src/components/book-editor.tsx` (el editor anterior) y `src/components/navigation.tsx` (sin uso).
- **Pruebas:** `tests/pdf-studio.test.ts`, con 9 pruebas. La de maquetación real necesita Chromium y se salta si no está.

No hay dependencias nuevas.

## Verificación hecha

- `npm run typecheck`, `npm test` y `next build` sin errores. Con Chromium, las 9 pruebas de PDF Studio pasan.
- **Navegador con el asistente y Kie simulados**, a 1280 y 390 px:
  - Libro nuevo desde plantilla, con caligrafía.
  - El libro sigue en la lista después de recargar.
  - Tocar un bloque, editarlo, ver la página cambiar y deshacer.
  - Nota del asistente con su marca en la página.
  - Ejercicio propuesto insertado.
  - Cambio a A5 que vuelve a paginar.
  - «Exportar PDF» abre la impresión.
- **PDF del servidor:** comparé el mismo libro antes y después del cambio. Hay menos páginas, sin huecos, con negrita y con заво́д bien dibujado.
- **Calidad:** axe (WCAG 2.1 AA) sin problemas, sin scroll horizontal y sin errores de consola. Cinema vuelve a pasar sus 7 comprobaciones.

## Qué probar (sin saber programar)

En la vista previa de Vercel de esta rama, con sesión iniciada:

1. **Libro nuevo:**
   - Entrá a PDF Studio y tocá **Nuevo libro**.
   - Poné un título en ruso, elegí A1 y A4, y creá el libro.
   - Tiene que aparecer la unidad con vocabulario, diálogo, ejercicio y repaso.
2. **Editar en la página:**
   - Tocá un párrafo en la hoja y cambiá el texto en el panel de la derecha.
   - La página se actualiza sola.
   - Probá con Ё, ё, заво́д, ñ, ¿ y ¡.
3. **Deshacer:** borrá un bloque y tocá «Deshacer» en el aviso. Después probá Ctrl+Z.
4. **Plantillas:** con **Insertar**, agregá «Caligrafía» y una tabla de vocabulario. Agregá filas hasta que la tabla pase a la página siguiente: el encabezado se repite.
5. **Formato:** en la pestaña **Libro**, cambiá a A5. Las páginas se vuelven a armar.
6. **Imagen:**
   - Elegí un bloque de imagen y tocá **Generar con Cinema**.
   - Confirmá y esperá. Tocá **Usar en el libro**.
   - Anotá los créditos que dice.
7. **Asistente:**
   - En la pestaña **Asistente**, tocá **Revisar la calidad pedagógica**.
   - Tocá **Ver** en un problema: la hoja va a ese bloque.
   - Guardalo como nota.
8. **Exportar:**
   - Tocá **Exportar PDF** y elegí «Guardar como PDF».
   - Abrí el archivo. Tiene que tener las mismas páginas que el editor, con colores y acentos.
9. **Copia:**
   - En el menú ⋯, tocá **Descargar editable**.
   - En el inicio de PDF Studio, tocá **Importar editable** y elegí ese archivo. Aparece como un libro nuevo.
10. **Recargar:** cerrá la pestaña y volvé a entrar. El libro y sus notas siguen ahí.
11. **Compositor:**
    - Abrí un libro hecho por el compositor y, en el menú ⋯, tocá **Componer PDF en el servidor**.
    - Si el PDF del servidor no coincide con lo que ves en el editor, avisame en qué página.
12. **Celular:** las miniaturas se ocultan, la hoja se ve arriba y el inspector abajo. El botón de exportar queda como ícono.
