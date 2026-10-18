# Etapa 10 — Manual: las unidades del libro, editables sin perder el diseño

PDF Studio suma la sección **Manual**. Sirve para dos cosas:

- **Corregir de a poco una unidad ya hecha.** Importás su PDF y lo editás sin perder nada del diseño: texto, fotos, bandas, colores.
- **Crear unidades nuevas con el mismo diseño.** Los ejercicios nuevos salen con el encabezado, los colores, las medidas y el pie de página de la unidad importada.

Las páginas que no tocás se exportan iguales al original.

## 1. Cómo se usa

### Importar una unidad

En **PDF Studio → Manual → Importar unidad (PDF)** elegís el PDF.

- **Qué pasa al importar:** el estudio lee cada página y la separa en bloques: el título de la página, un bloque por ejercicio, el pie de página y la pestaña lateral. El PDF original se guarda tal cual, para comparar.
- **Qué te dice al terminar:** cuántas páginas quedaron editables, cuántas se conservan tal cual y cuántos «parches ocultos» se limpiaron.
- **Qué es un parche oculto:** es el rastro de una edición anterior. Por ejemplo, texto viejo tapado con un rectángulo blanco y el texto nuevo escrito encima. Se quita solo si no cambia en nada cómo se ve la página, y así el texto fantasma deja de aparecer al copiar o buscar.

### Editar

- **Elegir:**
  - un clic elige un bloque, por ejemplo un ejercicio completo;
  - otro clic adentro elige un elemento: una línea, una foto, una forma;
  - Esc vuelve un nivel.
- **Mover:**
  - con el mouse, arrastrando: el borde se pega al margen izquierdo, al derecho y al centro de la página (con Alt no se pega);
  - con las flechas del teclado, de a 1 punto; con Mayús, de a 10.
- **Texto.** Se corrige en el cuadro del panel derecho.
  - **Cada letra que no cambiás conserva su estilo.** La palabra resaltada sigue resaltada aunque edites el resto de la línea.
  - **Para dar estilo:** elegís letras en el cuadro y tocás **Negrita**, **Normal**, **Resaltar** o **Sin resaltar**.
  - **Tilde de acento:** el botón **Tilde** se la agrega a la letra anterior al cursor.
  - **Avisos:** si el texto ya no entra en su lugar, se marca en rojo. Si escribís una letra que la fuente no tiene, también avisa.
- **Fotos.**
  - **Reemplazar imagen…:** la foto nueva ocupa el mismo lugar, sin deformarse, y conserva las esquinas redondeadas.
  - **Ancho y alto:** se ajustan en milímetros, o arrastrando las esquinas.
  - **Resolución:** el panel muestra a cuántos ppi queda la foto. Avisa si baja de 200: para imprimir conviene 300.
- **Lo que se repite en todas las páginas.** Al corregir el texto del pie o de la pestaña, el panel avisa cuántas páginas más dicen lo mismo. **Cambiar en todas** las corrige de una vez: también las aprobadas y las páginas nuevas que agregues después.
- **Bloques aprobados.**
  - **Para qué sirven:** un bloque «aprobado» queda bloqueado; ni el editor ni el futuro asistente lo cambian hasta que lo desbloquees.
  - **Cuáles llegan bloqueados:** el pie de página, la pestaña lateral y el fondo de la portada, porque se repiten en todo el libro.
- **Deshacer y rehacer:** ⌘Z y ⇧⌘Z (Ctrl en Windows), hasta 100 pasos.
- **Guardado:** todo se guarda solo («Guardado» arriba).

### Agregar contenido con la plantilla

La pestaña **Agregar** arma contenido nuevo con la plantilla que se sacó de la propia unidad.

- **Ejercicio.**
  - El número y el código de audio se proponen solos: siguen a los últimos de la unidad (13 y 1.16 después del 12 y el 1.15).
  - Se escriben la consigna, las líneas de ejemplo y los ítems, uno por renglón. Los ítems se numeran solos, en una o dos columnas.
  - Marcas: `**negrita**` y `==resaltado==`.
- **Texto, título e imagen:** con los estilos y las esquinas de foto de la unidad.

**Dónde va:** debajo del último bloque de la página. Si no entra, el estudio lo dice y ofrece ponerlo en una página nueva.

**Otro encabezado de modelo:** si preferís otro encabezado para los ejercicios nuevos, elegí ese ejercicio y tocá **Usar este encabezado para los ejercicios nuevos**.

### Páginas

- **Operaciones:** página nueva, duplicar, mover antes o después, y borrar.
- **Página nueva:** lleva el pie y la pestaña de la página anterior.
- **Números de página:** se ordenan solos.

### Comparar con el original

En **Comparar** hay dos formas:

| Modo | Qué muestra |
|---|---|
| **Original al lado** | La página del PDF importado junto a la de ahora. |
| **Marcar diferencias en rojo** | Lo que cambió, en rojo, y qué porcentaje de la página sigue igual. Una página sin tocar da 100 %. |

### Versiones y exportar

- **Versiones:** **Guardar versión** saca una foto de la unidad para volver después.
  - La importada se conserva siempre.
  - Volver a una versión guarda antes la actual.
  - Se guardan hasta 30 versiones por unidad.
- **Exportar PDF:** arma el PDF final.
  - Avisa si quedó algún texto que no entra.
  - Avisa si falta una imagen que todavía no llegó de la otra computadora.
- **El original:** se puede descargar desde el menú «…».

### Unidad nueva con el diseño

En **PDF Studio → Manual → Nueva unidad con el diseño**:

1. Elegís de qué unidad se copia el diseño.
2. Ponés el título y el número de unidad.
3. Arranca con una página que ya tiene el pie (página 1) y la pestaña con el número nuevo.
4. Los ejercicios empiezan en 1 y los códigos de audio en «número.01».

## 2. Cómo funciona por dentro

### Las piezas del motor

Todo el motor está en `src/lib/manual/`:

| Archivo | Qué hace |
|---|---|
| `pdf-read.ts` | Lector propio del contenido de cada página. Interpreta las instrucciones del PDF y guarda cada objeto como un elemento: cada texto con su fuente, tamaño, color y posición exacta; cada imagen con sus bytes originales, sin descomprimir; cada forma con su relleno y su trazo; los recortes y la transparencia. Si una página usa algo que no entiende (otra fuente, un degradado, una imagen incrustada en el texto, texto girado), no la aproxima: la marca para conservarla tal cual y dice el motivo. |
| `segment.ts` | Limpia los parches ocultos y separa la página en bloques: fondo, pie, pestaña, título y un bloque por banda de ejercicio. Pone nombre a cada uno, por ejemplo «Ejercicio 6 · 1.07 · consigna». |
| `template.ts` | Saca la plantilla de las propias páginas: el encabezado de ejercicio más común (banda, círculo, auriculares, código y consigna), los estilos de ítem, ejemplo, resaltado y título, la distancia entre renglones, la segunda columna, los márgenes, el pie, la pestaña y el radio de las fotos. |
| `compose.ts` | Arma el contenido nuevo con esa plantilla: ejercicios, párrafos con cortes de línea, títulos y fotos. |
| `edit.ts` | Los cambios: texto letra por letra, estilos, mover, cambiar tamaño, reemplazar imagen, bloquear, páginas y versiones. Cada cambio da una unidad nueva, así deshacer es exacto. |
| `render.ts` | Escribe el PDF con `pdf-lib`. |
| `store.ts` | Guarda las unidades en el navegador y las sincroniza con la cuenta. |

### Cómo se escribe el PDF

`render.ts` escribe el PDF así:

- **Texto:** con DejaVu Sans, la misma fuente que usa el manual. Va incluida en `public/fonts/dejavu/` con su licencia libre. Las letras se ponen una por una, sin ligaduras ni ajustes, igual que en el original.
- **Imágenes:** con sus bytes originales; no se recomprimen.
- **Páginas que no se pudieron separar:** se copian del original.
- **Mismo resultado siempre:** la misma unidad da siempre el mismo PDF, byte por byte, porque no se agregan fechas ni nombres al azar.

### Dónde se guarda

- **En el navegador:** IndexedDB. La unidad guarda solo la referencia (huella) de cada archivo. Cada archivo (el PDF original y cada imagen) se guarda una sola vez y lo comparten la unidad y sus versiones.
- **En la cuenta:** dos tipos nuevos de registro, `manual-unit` y `manual-version`. Los archivos van al mismo depósito que los libros (`/api/sync/assets`), que ahora acepta también `application/octet-stream`: una imagen tal como venía en el PDF, todavía codificada.
  - Cada archivo puede pesar hasta 4 MB.
  - Una unidad como la 1 ocupa unos 150 KB de datos más sus imágenes.
- **Cambios en otra computadora:** si la unidad está abierta y cambia en la otra computadora, no se reemplaza nada: aparece «Cargar esos cambios».

## 3. Verificación

### Con la Unidad 1 (solo en el área temporal de esta sesión)

Tu PDF no se subió al repositorio.

| Prueba | Resultado |
|---|---|
| Leer y volver a escribir las 9 páginas, sin limpiar | Idénticas píxel por píxel a 150 y 300 ppp, con poppler. Con pdf.js, el lector del navegador, solo hay diferencias de suavizado de bordes, en menos del 0,001 % de los píxeles. |
| Texto extraído del PDF | Igual, carácter por carácter. |
| Imágenes | Las 35 son byte por byte las originales. |
| Con la limpieza de parches | 11 parches quitados en 2 páginas. Cinco páginas son idénticas. En las otras cuatro hay solo diferencias de suavizado de bordes, en menos del 0,002 % de los píxeles. El texto tapado ya no aparece. |
| Tiempo | Leer y separar la unidad tarda menos de 0,2 s en Node. Exportarla entera, unos 0,15 s. |

### Pruebas automáticas

`npm test` pasa 128 pruebas. Las 11 nuevas están en `tests/stage10.test.ts` y usan una unidad sintética (`tests/fixtures/manual/sample-unit.pdf`, hecha con `scripts/manual-fixture.py`, con texto genérico). Comprueban:

- **El lector:**
  - texto con tildes de acento;
  - líneas con una palabra resaltada;
  - dos columnas separadas;
  - fotos con recorte y con transparencia;
  - la página con degradado se conserva.
- **La vuelta completa:** el PDF se ve igual con pdf.js, las imágenes son idénticas y el resultado es el mismo cada vez.
- **La limpieza del parche blanco:** quita el texto viejo tapado y la página se ve igual.
- **Los bloques y la plantilla:** se separan bien y la plantilla sale de las páginas.
- **Un ejercicio nuevo:** número y código siguientes, ítems en dos columnas a la distancia de la plantilla.
- **La edición de texto:** conserva el estilo de cada letra.
- **Las páginas:** al agregar o borrar, los números de página se reordenan.
- **Reemplazar una foto:** no la deforma.
- **Una imagen que falta:** se avisa en lugar de romper la exportación.
- **Corregir un pie en todas las páginas:** también corrige la plantilla, así las páginas nuevas salen bien.

`npm run build` también pasa.

### Prueba en el navegador

Pasaron los 29 controles. Se usaron el servidor real, la cuenta real, Postgres con las migraciones y dos perfiles del navegador como «dos computadoras». Comprobé:

- **Importar la Unidad 1:** 9 páginas editables y 11 parches limpiados, en unos 3 s.
- **Comparar una página sin tocar:** 100 % igual.
- **Corregir una línea de ejemplo:** el resaltado de la palabra se conserva y se agrega otro. La comparación baja a 99,94 % y marca el cambio.
- **El pie bloqueado:** se desbloquea y se corrige «A1» escrito con A latina por «А1» con letra rusa. Con **Cambiar en todas** se corrigieron los otros 7 pies, y el PDF exportado tiene los 8 con letra rusa.
- **Exportar:** las 35 imágenes salen idénticas.
- **Mover un ejercicio:** arrastrando 20 puntos y con Mayús+↓ otros 10. Al deshacer dos veces, el PDF vuelve a ser idéntico byte por byte.
- **Reemplazar una foto recortada de una imagen grande:** el JPEG nuevo va sin recomprimir.
- **Agregar el ejercicio 13 (1.16) en una página nueva:** queda con el número de página 7 y con el pie ya corregido.
- **Versiones:** se guarda una versión.
- **Unidad nueva «Урок 2»:** página 1, pestaña 2, ejercicio 1 con código 2.01.
- **Computadora B:**
  - llegaron las dos unidades;
  - el PDF que exporta B es idéntico, byte por byte, al de A;
  - el PDF original llegó intacto;
  - con la unidad abierta, avisó del cambio hecho en A y lo cargó al pedirlo.
- **Celular (390 px):** la sección Manual entra sin desplazamiento horizontal.
- **Calidad:** axe (WCAG 2.1 AA) sin problemas y sin errores de consola.

## 4. Decisiones que tomé mientras no me respondías

| Pregunta | Qué hice |
|---|---|
| ¿PDF sin comprimir? | Usé el comprimido que me pasaste: sus imágenes se conservan tal cual. Si tenés el original sin comprimir, conviene importarlo: las fotos van a tener más calidad para imprimir. |
| ¿Tildes de acento en todo el texto o solo en el vocabulario nuevo? | No se agregan solas. Hay un botón para ponerlas a mano. Revisar la unidad entera es trabajo del futuro `/revisar-ruso`. |
| ¿El libro se imprime? | El panel avisa cuando una foto queda por debajo de 200 ppi y recomienda 300. |
| ¿Globos de cómic editables? | Todavía no. En la Unidad 1 los globos son parte de la imagen. Por ahora se reemplaza la imagen entera, o se agregan textos encima. |
| ¿Rehacer la Unidad 1 con la plantilla? | La Unidad 1 queda importada como está. El original se guarda para comparar, y la plantilla sale de ella. |

## 5. Límites y pendientes

- **Texto dentro de imágenes.** Los globos de cómic, las etiquetas de infografías, el título de la lección y las tarjetas de despedida son parte de las fotos. No se editan como texto. Para cambiarlos hay que reemplazar la imagen.
- **El texto importado son líneas sueltas.**
  - Al corregir, la línea no pasa sola al renglón siguiente: si se alarga, se marca en rojo para acortarla o achicar la letra.
  - Los párrafos nuevos que agregás desde «Agregar» sí se cortan en renglones.
- **Fuentes.** El editor dibuja con DejaVu Sans normal y negrita, que son las del manual. Una página con otra fuente se conserva tal cual, sin edición.
- **Todavía no hay:**
  - elegir varios elementos a la vez;
  - copiar bloques entre páginas (se puede duplicar la página entera);
  - deshacer después de recargar (para eso están las versiones).
- **Asistente y `/pdf-generator`.** La plantilla ya está lista para que el asistente arme ejercicios con ella. Es el paso siguiente, junto con la skill `/pdf-generator`.
- **Archivos de más de 4 MB.** Se quedan en la computadora donde se importaron.
- **Base de datos y Vercel.** No hace falta ninguna migración: los registros nuevos usan las mismas tablas. Tampoco hay que configurar nada nuevo en Vercel.
