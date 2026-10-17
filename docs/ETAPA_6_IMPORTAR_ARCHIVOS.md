# Etapa 6 — Importar PDF, Word y otros archivos en PDF Studio

PDF Studio ahora convierte un **PDF**, un **Word (.docx)**, un archivo de **texto**, uno de **Markdown** o uno **HTML** en un libro editable. Se edita por bloques como cualquier libro, y con **«Exportar PDF»** vuelve a salir como PDF.

## Cómo se usa

1. **Elegí el archivo.** En PDF Studio tocá **«Importar archivo»**, o arrastrá el archivo hasta la página.
2. **Revisá el resumen.** El estudio lee el archivo y muestra:
   - qué es y cuántas páginas tiene;
   - cuántos capítulos, bloques, tablas e imágenes salen;
   - la lista de capítulos;
   - lo que conviene revisar.
3. **Ajustá si hace falta** el título, el idioma y el formato de página (A4, A5 o 6 × 9 in). El estudio los propone a partir del archivo.
4. **Tocá «Crear libro editable».** Se abre en el editor, se guarda en tu cuenta como cualquier otro libro y aparece en «Tus libros».
5. **Corregí lo que haga falta** y tocá **«Exportar PDF»**.

## Qué se conserva y qué no

| Del archivo | En el libro |
|---|---|
| Títulos y subtítulos | Títulos (3 niveles). Los capítulos empiezan en el título de más arriba. |
| Párrafos | Párrafos, con el texto tal cual. Los diálogos con «—» mantienen una réplica por renglón. |
| Listas numeradas y con viñetas | Párrafos con «1.», «2.» o «•». No se convierten en «Ejercicio», porque eso agregaría un significado que el archivo no tenía. |
| Tablas | Tablas de hasta 6 columnas. Si tiene más, queda como texto, una fila por renglón. Las de más de 30 filas se dividen en partes con los mismos encabezados. |
| Imágenes | Imágenes del libro, hasta 24 por libro. En Word, su texto alternativo pasa a ser el pie. |
| Páginas escaneadas | Entran como imagen **a página completa**, y se avisa que su texto no se puede editar. |
| Encabezados, pies y números de página repetidos | Se quitan: el libro pone los suyos. |
| El diseño (fuentes, colores, posiciones) | **No se conserva.** El libro usa el diseño del estudio, que se cambia en la pestaña «Libro». |
| Comentarios y notas al pie de Word | No se importan, y se avisa. |

Cada cosa que no entra o cambia aparece en **«Para revisar»** antes de crear el libro.

## Formatos

| Archivo | Cómo se lee |
|---|---|
| **PDF** con texto | Con `pdfjs-dist`, que ya estaba instalado: posiciones y tamaños de letra, columnas, listas, tablas por alineación, negritas e imágenes. Hasta 150 páginas. |
| **PDF escaneado** | Cada página sin texto se agrega como imagen. No hay reconocimiento de texto (OCR). |
| **Word (.docx)** | Con `mammoth`: estilos de título (también con nombres en español o en ruso), listas, tablas, imágenes y su texto alternativo. |
| **.txt** y **.md** | Títulos `#`, listas, tablas `\|` y citas `>`. Los `.txt` viejos en ruso (Windows-1251) se detectan solos. |
| **.html** | Títulos, párrafos, listas, tablas e imágenes incluidas en el archivo. |
| **.json** | El editable de PDF Studio, como antes. |

- **No se leen** `.doc` (Word 97-2003), `.odt`, `.rtf`, `.pages` ni presentaciones. El estudio explica cómo guardarlos como `.docx` o PDF.
- **Tamaño máximo:** 50 MB.

## Privacidad y costo

El archivo se convierte **en tu navegador**: no se sube a ningún servidor para leerlo ni lo lee una IA, así que **no cuesta créditos**. El libro que resulta se guarda y se sincroniza como cualquier otro.

## Límites del editor

- **Capacidad:** un libro tiene hasta 12 capítulos de 100 bloques.
  - Si el documento tiene más secciones, se agrupan.
  - Si ni así entra, se importa lo que entra y se avisa desde dónde quedó afuera, para importar el resto como otro libro.
- **PDF:**
  - El PDF no guarda qué es una tabla o un título: se deduce por la alineación y el tamaño de letra. Por eso conviene revisar las tablas.
  - Las fórmulas y el texto vertical no se reconocen.

## Cambios técnicos

- **Conversión:**
  - `src/lib/books/import/model.ts`: arma el libro dentro de los límites del esquema.
  - `text.ts`, `html.ts`, `pdf-layout.ts`, `pdf.ts` y `docx.ts`: un convertidor por formato.
  - `browser.ts`: elige el convertidor y carga `pdfjs` y `mammoth` solo cuando hacen falta.
- **Pantalla:**
  - `src/components/pdf/import-dialog.tsx`;
  - el botón y la zona para soltar en `pdf-home.tsx`;
  - los estilos en `src/styles/pdf.css`.
- **Imagen a página completa:** campo opcional `fit: 'page'` en el bloque de imagen. Se activa también a mano con «Ocupar la página».
  - El pie de imagen ahora puede quedar vacío; entonces no se imprime.
- **pdf.js en el navegador:**
  - Se usa su versión «legacy», porque la moderna necesita JavaScript que muchos navegadores todavía no tienen (`Map.getOrInsertComputed`).
  - `scripts/copy-pdfjs-assets.mjs` copia el worker y sus datos a `public/vendor/pdfjs` al instalar y al compilar. La copia no se guarda en git.
- **Dependencia nueva:** `mammoth` 1.13 (licencia BSD-2).
  - Es el convertidor de `.docx` más usado.
  - Corre en el navegador y se carga solo al importar un Word.
  - `npm audit` marca un aviso moderado en `argparse`, que solo usa su herramienta de línea de comandos. El estudio no la usa.

## Pruebas

- **`tests/import.test.ts`:** 10 tests.
  - Usan un `.docx` hecho con python-docx (estilos reales de Word) y el PDF que exporta LibreOffice de ese mismo archivo, con texto en ruso y en español. Están en `tests/fixtures/import/`.
  - Comprueban los títulos, la tabla, las listas, el diálogo, la imagen con su pie y la puntuación exacta. LibreOffice escribe la puntuación y el cirílico en fuentes distintas, y el lector las vuelve a ordenar.
  - Comprueban además los límites, el idioma, el formato, los encabezados repetidos, el guion de fin de línea, las dos columnas y las páginas escaneadas.
- **Prueba en el navegador: 28 de 28.** Importa PDF, Word, un PDF escaneado y Markdown; prueba el `.doc` viejo, arrastrar y soltar, el editor resultante y «Exportar PDF». En escritorio y a 390 px, con axe, contraste, teclado y «reducir movimiento».
