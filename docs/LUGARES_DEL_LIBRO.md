# Lugares del libro

En **Contexto del libro** hay una pestaña nueva, **Lugares**, junto a **Personajes**. Sirve para que la casa, la escuela o la ciudad se vean siempre iguales en las ilustraciones.

## Qué tiene cada lugar
- **Nombre en ruso**, como aparece en el libro (por ejemplo, «Школа»).
- **Alias:** otras formas de nombrarlo, en ruso, español o inglés («la escuela», «school»). Sirven para encontrarlo.
- **Descripción confirmada:** la arquitectura, los ambientes y los colores. Conviene escribirla en inglés, porque es lo que leen los modelos de imagen.
- **Imágenes de referencia:** las mismas reglas que las de los personajes.
  - Entran **sin revisar**.
  - Solo las que vos **aprobás** pueden enviarse.
  - Una de las aprobadas es la **principal**.

## Dónde se usa
- **Ilustración en este lugar…** (desde la ficha del lugar). También la **Ilustración** del Manual tiene un campo nuevo, **Lugar**.
  - La imagen principal del lugar va como referencia, después de la primera foto de cada personaje.
  - Si el modelo acepta pocas imágenes, primero van las caras.
  - El prompt le pide al modelo mantener el lugar igual: la misma arquitectura, los muebles y los colores. El ángulo de la cámara puede cambiar.
- **/pdf-generator en el Chat**, con «Contexto del libro» activado:
  - el modelo de texto recibe la lista de lugares del libro;
  - en cada foto que pasa en uno de ellos, escribe su nombre en el campo «place»;
  - el estudio agrega la imagen aprobada de ese lugar al pedir la foto;
  - la tarjeta dice qué lugares se usaron y si tenían imagen aprobada.
- **Estudio de Cinema:** al escribir **@** aparecen también los lugares del libro, con su imagen principal.

## Importar y exportar
- **El paquete del libro** (.json) puede traer lugares con sus imágenes, igual que los personajes. Se importa con **Importar archivos**.
- **«Exportar el contexto»** también guarda los lugares con sus imágenes.

## Cómo se probó
- **Pruebas automáticas** (`tests/places.test.ts`):
  - el lugar se guarda con sus imágenes;
  - una imagen sin archivo queda afuera;
  - el orden de las imágenes enviadas: primero las caras, después el lugar;
  - el prompt nombra el lugar y su imagen;
  - el lugar se encuentra por su nombre o un alias, y nunca por un nombre que comparten dos lugares;
  - el modelo de texto de /pdf-generator recibe la lista de lugares.
- **En el navegador, con una Kie de prueba** (sin gastar créditos):
  - se importó el paquete de lugares;
  - se aprobó la imagen de la escuela y se eligió como principal;
  - se generó una ilustración de Миша en la escuela.
  - La Kie de prueba recibió la imagen de la escuela (la misma huella sha256) y el prompt con «Школа».
  - En el Estudio, «@Шк» mostró la escuela como lugar con su imagen principal.
  - En el celular, la pestaña y la ficha se ven sin desbordes.

## Varios libros y deshacer una importación (3 de noviembre de 2026)

**El problema:** la página tenía un solo libro y no había forma de crear otro. Por eso, el paquete del libro de niños entró dentro de «Русский код»:
- cambió las fichas de los personajes y las unidades 1 a 8;
- agregó reglas, lugares y una segunda «Аня».

**Lo nuevo:**
- **Nuevo libro…** (en el menú «⋯» de Contexto del libro): crea un libro aparte. Arriba se elige con cuál trabajar.
- **Unidades y asistentes → Archivos importados:**
  - lista cada archivo importado en ese libro;
  - se eligen uno o varios y **Deshacer**;
  - antes de cambiar nada, muestra qué vuelve a como estaba y qué se quita;
  - avisa si después de esa importación hiciste cambios que también se deshacen.
  - Varios archivos se deshacen juntos, hasta antes del primero de ellos.
  - Cada dato que vuelve atrás guarda una versión nueva: se puede rehacer desde su historial.
- **Importar una base exportada reemplaza los datos del dato entero.** Un campo que el archivo nuevo no trae (por ejemplo, una edad que escribió un archivo anterior) ya no queda pegado.

**Cómo se probó:**
- **En una copia local:**
  1. se importó el libro de adultos completo (145 datos);
  2. se importaron encima las dos versiones del paquete de niños;
  3. se deshicieron juntas.
  - La exportación después de deshacer es **idéntica** a la original: los mismos 145 datos y los mismos contenidos.
  - Después se creó el libro de niños aparte y se importó ahí: 42 datos, con los 8 personajes del manual de adultos y sus fichas aprobadas.
- **Pruebas automáticas** en `tests/places.test.ts`.
