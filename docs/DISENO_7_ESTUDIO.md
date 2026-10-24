# Diseño 7 — Cinema Studio · Estudio

Es un espacio nuevo dentro de Cinema Studio, en `/workspace/estudio`. Se entra con el botón amarillo «Estudio» de la cabecera de Cinema Studio. Reúne en un solo lugar tres cosas:

- escribir una escena;
- llamar a personajes y lugares con «@»;
- guardar los resultados por proyecto y por carpeta.

Las pestañas de siempre (Imagen, Video, Editar, Dirigir, Galería) siguen igual.

El pedido tomaba como referencia un «Cinema Studio» comercial de generación con IA. Se tomó su nivel de calidad y su estructura, no su marca, sus textos ni sus imágenes.

## Qué tiene

### Estilo propio

- Fondo casi negro (#0F0F10 y #141414), paneles #1C1C1E y bordes finos.
- Un amarillo verdoso neón (#E4FF1A) solo para la acción principal (Generar), el logo y el foco del teclado.
- Títulos grandes en mayúsculas; etiquetas chicas en letra monoespaciada gris.
- Se usan las mismas fuentes del sitio (Onest y Geologica), que tienen cirílico completo.
- Todo vive dentro del Estudio: el resto del sitio no cambia de colores.

### Barra lateral propia, que se pliega

- Arriba, «Cinema Studio» con un menú para cambiar de estudio (Chat, PDF Studio, las pestañas de Cinema o el Estudio) y el botón para plegarla. Plegada, solo quedan los íconos, y cada uno muestra su nombre al pasar el mouse. La elección queda guardada en el navegador.
- **Inicio, Mis generaciones, Mis elementos, Mis favoritos**, cada una con su ícono de color.
- **Proyectos**: buscar por nombre, ordenar (los más recientes o por nombre), «Nuevo proyecto», «Nueva carpeta» y el árbol de carpetas con sus proyectos, que se abre y se cierra.
- Abajo: «Todos los proyectos», el **saldo real de Kie** (lleva a Ajustes → Uso) y la cuenta.
- En el teléfono, la barra se abre con el botón «Estudio» de arriba.

### Inicio

1. **Un carrusel con tus últimos resultados**: tres a la vista y el del medio más grande. Avanza solo cada 6 segundos; se detiene si pasás el mouse por encima, si estás usando el teclado ahí o si el sistema pide menos movimiento. Las flechas lo mueven a mano. Si todavía no hay resultados, muestra tres marcos vacíos con «Tus imágenes y videos aparecen acá».
2. **«Dale vida a tus historias»**, grande.
3. **El panel para generar** (abajo se detalla).
4. **Lo último**: los cuatro resultados más recientes, con el estado de los que todavía se están generando.
5. **Mis proyectos ›**: la tarjeta «Crear proyecto nuevo» y tus carpetas y proyectos, cada uno con un collage de sus resultados, cuántos tiene y «Privado» con su candado.

### El panel para generar

- **Imagen / Video**, a la izquierda (arriba, en el teléfono).
- **Cinco chips**:
  - **Referencias n/máx.** Abre la galería para elegir imágenes. El máximo es el que acepta el modelo elegido.
  - **Película, Cámara, Paleta de color y Luz.** Cada uno abre sus opciones:
    - Cámara: Primer plano, Plano general, Dron, Travelling, Cámara en mano, Contrapicado.
    - Luz: Hora dorada, Neón, Clave baja, Luz suave, Contraluz, Noche azul.
    - En cada uno, «Auto» deja decidir al modelo y no agrega nada al prompt.
    - Cada opción dice qué frase agrega al prompt.
- **La escena.** Al escribir «@» se abre la lista de personajes y lugares; se elige con el mouse o con las flechas y Enter (o Tab). Escape la cierra.
- **La barra de abajo**:
  - «+» agrega referencias;
  - «@» suma un personaje o un lugar;
  - el cuadro elige la imagen inicial (en un video, su primer cuadro);
  - el modelo;
  - la calidad, el formato y la duración, solo si el modelo los ofrece;
  - el contador de variaciones (− 1/4 +), hasta el máximo del modelo.
- **GENERAR.** Muestra «≈ N» (créditos estimados) solo si el catálogo publica un precio para ese modelo.
- Debajo:
  - «Guardar en» un proyecto (en Inicio);
  - «Preguntar antes», que pide confirmar con todos los datos antes de gastar;
  - «Ver lo que se envía», el texto exacto que recibe Kie.

### Personajes y lugares («Mis elementos»)

- **Tus personajes y lugares.** Se crean, se editan y se borran aquí. Cada uno tiene:
  - un nombre (el que va después de @);
  - si es un personaje o un lugar;
  - cómo es, mejor en inglés;
  - una imagen opcional de la galería, que se envía como referencia. Se guarda la copia del estudio, no el enlace de Kie, que se borra a los 14 días.
- **Los personajes del libro.** Vienen de Contexto del libro y aquí solo se leen; se editan allá. Con @ se envía:
  - solo la **foto principal aprobada** del personaje (nunca una rechazada o sin revisar);
  - su descripción confirmada (edad y aspecto).
- Si el modelo acepta menos imágenes que las que llamaste, el panel avisa quién va solo con su descripción.

### Proyectos y carpetas

- **Crear y renombrar** proyectos y carpetas, y **mover** un proyecto a una carpeta.
- **Borrar**:
  - borrar un proyecto no borra sus imágenes: quedan en «Mis generaciones»;
  - borrar una carpeta deja sus proyectos sin carpeta.
- En la página de un proyecto, lo que generás queda guardado en él.
- Cada resultado tiene:
  - **un corazón** para favoritos;
  - **«Mover a un proyecto»**;
  - las acciones de siempre: descargar, ver en grande, usar como referencia (en el Estudio, se suma a sus propias referencias) y editar (abre «Editar» de Cinema).
- Proyectos, carpetas, elementos, favoritos y a qué proyecto pertenece cada resultado se guardan en la cuenta: aparecen en las otras computadoras.

### Mientras se genera

- Cada tarjeta muestra un brillo que se mueve, una barra amarilla que va y viene, el estado real de Kie («Enviando», «En cola», «Generando») y el tiempo que lleva.
- La barra no tiene porcentaje porque Kie no informa uno.

## Qué no se copió, a propósito

Estas partes del pedido no se hicieron, porque habrían mostrado algo inventado:

- **Community** y **Contest Projects / AI Film Festival**: no hay una comunidad ni concursos reales detrás.
- **El aviso «Pricing 30% OFF»**: no hay una oferta. En su lugar va el saldo real de Kie.
- **La campana de notificaciones**: no hay notificaciones que mostrar.
- **«Audio On»**: el catálogo de modelos no dice cuáles generan audio, así que no se ofrece un botón que podría no hacer nada.
- **«GENERATE ✦ 80»**: no se muestra un número fijo. Se muestra el estimado del catálogo con «≈» cuando existe; si no, nada. El costo real lo informa Kie al terminar y se descuenta de tu saldo en Kie.
- **«Cinema Studio 4.0»**: se muestran los modelos reales que están habilitados.
- **Funciones «de prueba» para conectar una clave**: no hacían falta, porque la conexión es real. El Estudio usa la misma conexión con Kie que las pestañas; la clave vive solo en el servidor.

## Qué no cambió

- Las pestañas de Cinema Studio, sus borradores y su galería.
- Cómo se genera: el mismo camino del servidor, que revisa cada opción contra el catálogo y solo acepta imágenes de Kie o archivos propios.
- Los personajes del libro: se editan solo en Contexto del libro, y el Estudio no guarda copias de sus fotos.

## Cómo probarlo

1. En Cinema Studio, tocá **Estudio** (arriba a la derecha).
2. En **Mis elementos**, creá un personaje (con su nombre y su descripción en inglés) y un lugar.
3. En la barra, tocá **Nuevo proyecto** y ponele nombre.
4. En el proyecto, escribí una escena con «@» y elegí a tu personaje. Cambiá **Cámara** y **Luz**.
5. Abrí **Ver lo que se envía**: ahí está el texto con las descripciones y las frases de cámara y luz.
6. Tocá **GENERAR**. Con «Preguntar antes» encendido, confirmá en el cuadro que muestra el modelo, la cantidad, a quiénes llamaste y el proyecto.
7. Mientras se genera, la tarjeta muestra el estado. Al terminar, tocá el corazón y probá «Mover a un proyecto».
8. Abrí el Estudio en otra computadora: tus proyectos, elementos y favoritos están ahí.

## Qué se probó

- Pruebas automáticas (`tests/estudio.test.ts`):
  - «@» encuentra cada nombre una vez, con el más largo primero y en el orden de la escena;
  - el texto que se envía, con «Auto» sin agregar nada;
  - las referencias se ordenan sin repetir y respetan el límite del modelo.
- En el navegador, contra una copia local con una Kie de prueba (sin gastar créditos), se probaron:
  - crear elementos y proyectos;
  - la lista de «@» con mouse y teclado, y el botón «@»;
  - los chips y lo que se envía;
  - generar 3 imágenes y un video, con la confirmación;
  - el estado de carga;
  - favoritos, mover un resultado, carpetas, renombrar y borrar;
  - el botón Atrás del navegador y un proyecto que no existe;
  - la barra plegada;
  - el teléfono: sin desborde horizontal y con botones grandes para el dedo (40 a 44 px);
  - la sincronización con un navegador nuevo.
- Revisión de accesibilidad (axe) sin hallazgos en Inicio, un proyecto, Todos los proyectos, Mis elementos, Mis generaciones, la barra plegada y el teléfono.
- `tsc`, las 170 pruebas y el build de producción, sin errores.
