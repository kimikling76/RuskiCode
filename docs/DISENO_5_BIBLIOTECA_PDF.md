# Diseño 5 — PDF Studio: la portada pasa a ser una biblioteca

Es la parte de la fase 4 del plan de diseño sobre la portada de PDF Studio. Antes había:

- párrafos que explicaban cada función;
- tres botones de importar distintos;
- los libros abajo, fuera de la pantalla.

## Qué cambió

- **Todo en una grilla de tarjetas**: libros, PDF y unidades del manual juntos.
  - Lo último que tocaste aparece primero.
  - La muestra va al final.
- **Cada tarjeta muestra cómo es lo que contiene.**
  - **PDF y unidades del manual:** la primera página real del archivo. Se dibuja en tu navegador recién cuando la tarjeta aparece en pantalla, y no se vuelve a dibujar al regresar.
  - **Libros:** una portada armada con sus propios datos (título, nivel, idioma y autor), con el verde y la letra del libro. No es una foto de una página y no inventa nada.
  - **PDF de más de 4 MB** que quedó en otra computadora: la tarjeta lo dice en lugar de mostrar una página.
- **Un solo botón «Importar»** para PDF, Word, texto, Markdown, HTML o el editable (.json). También se puede arrastrar el archivo a la página.
  - Un PDF ofrece tres caminos: **Editar el PDF tal cual**, **Importar como unidad del manual** (lo nuevo) o **Convertir en libro editable**.
  - Antes, la unidad del manual tenía su propio botón en otra sección.
- **«Nuevo»** abre un menú con **Libro** y **Unidad con el diseño del manual**. Esta segunda opción se activa cuando ya hay una unidad importada que sirva de modelo.
- **Filtros y búsqueda.**
  - Filtros: Todo, Libros, PDF y Manual, con cuántos hay de cada uno.
  - La búsqueda no distingue mayúsculas ni tildes y también encuentra en cirílico.
- **Borrar desde la tarjeta.** El botón «⋯» de cada PDF y de cada unidad ofrece Borrar, con la misma confirmación y el mismo «Deshacer» que antes. Los libros se siguen borrando desde el editor, como antes.
- **«Contexto del libro» en una sola línea** debajo del título, con un acceso a cada libro y cuántas unidades tiene vinculadas.
- **Para empezar.** Si todavía no hay nada propio, la primera tarjeta es «Importar un archivo».
- **Celular.**
  - Dos columnas de tarjetas.
  - Los botones, filtros y búsqueda miden al menos 44 px.
  - Sin desplazamiento de costado.

## Qué no cambió

- Cómo se importa, se guarda y se sincroniza cada cosa.
- Los editores.
- «Del compositor», «Proyectos desde el Chat» y «Herramientas anteriores» siguen al final, como antes. La pregunta 5 del plan sigue abierta.
- «Manual» y «Contexto del libro» siguen en la portada de PDF Studio. Moverlos dentro del proyecto del libro es la pregunta 2 del plan.

## Cómo probarlo

En la vista previa de esta rama, con sesión iniciada, en PDF Studio:

1. **Importar un PDF.** Tocá **Importar** y elegí un PDF: aparecen los tres caminos.
   - Elegí «Editar el PDF tal cual».
   - Volvé a PDF Studio: la tarjeta muestra su primera página.
2. **Unidad del manual.** Importá el PDF de una unidad y elegí **Importar como unidad del manual**: se abre el editor del manual.
3. **Libro nuevo.** Tocá **Nuevo → Libro**, ponele un título y volvé: aparece su portada con el título y el nivel.
4. **Filtros, búsqueda y borrar.**
   - Usá los filtros y la búsqueda.
   - En el «⋯» de un PDF, tocá **Borrar PDF** y después **Deshacer**: vuelve.

## Qué se probó

- **Copia local** con base de datos de prueba:
  - importar el PDF de prueba tal cual y como unidad del manual desde el mismo botón;
  - crear un libro con «Nuevo → Libro»;
  - abrir «Nuevo → Unidad con el diseño del manual»;
  - las miniaturas reales del PDF y de la unidad;
  - los cuatro filtros y la búsqueda en español y en ruso;
  - borrar y deshacer un PDF y una unidad;
  - el orden de Tab: tarjeta → «⋯» → tarjeta siguiente.
- **Accesibilidad:**
  - axe sin problemas en escritorio, en el cuadro de importar y en el celular.
  - Cada tarjeta se lee como «PDF: Documento de prueba, 55 KB · fecha». La imagen no se lee.
- **Celular de 390 px:** dos columnas, sin desplazamiento de costado y sin botones de menos de 44 px.
- `npm test`, `tsc` y `next build` sin errores.
- **No probado:**
  - una biblioteca con muchos archivos grandes;
  - un PDF que quedó en otra computadora (ese caso solo se probó leyendo el código);
  - un celular real.
