# Diseño 8 — Estudio: el acabado premium

Es el mismo Estudio de Cinema Studio (`/workspace/estudio`), con la misma estructura, las mismas funciones y los mismos textos. Cambia el acabado, siguiendo la imagen de referencia.

## Qué cambió

### Carrusel de pósters

- Los tres pósters son **planos y nítidos**: ya no se inclinan, no se vuelven transparentes y no se desvanecen en los bordes.
- **El del medio** lleva un borde claro y una sombra profunda. Los de los costados son más chicos, un poco más oscuros y quedan detrás.
- Al avanzar, cada póster **se desliza** a su nuevo lugar, en vez de cambiar de golpe.
- Al pasar el mouse, el póster sube un poco y se aclara.
- Las flechas se ven tenues y se encienden al pasar el mouse o al llegar con el teclado. En el teléfono quedan debajo de los pósters, para no taparlos.
- El carrusel es más bajo, así el panel para generar queda más cerca.

### Barra lateral

- Cada página tiene su **cuadrito con degradado** y un brillo arriba:
  - Inicio: plateado;
  - Mis generaciones: celeste;
  - Mis elementos: azul;
  - Mis favoritos: rosa;
  - Todos los proyectos: gris.
- Al pasar el mouse, el cuadrito crece un poco.
- «Proyectos» ya no está en mayúsculas de máquina de escribir.
- «Nuevo proyecto» y «Nueva carpeta» llevan su ícono en un circulito, que se pone amarillo al pasar el mouse.

### Chips con miniaturas

Cada chip muestra un dibujo de la opción elegida y cambia al elegir otra:

- **Película:** el cuadro de la película, con sus perforaciones. Cambia según sea 35 mm, 16 mm, digital, anamórfico o blanco y negro.
- **Cámara:** el encuadre: un lente (Auto), una cara de cerca, un paisaje con una figura chica, una vista desde arriba, rieles de travelling, un cuadro torcido o una figura vista desde abajo.
- **Paleta de color:** los cuatro colores reales de esa paleta.
- **Luz:** su cielo: un atardecer, neón, una cara iluminada de un solo lado, luz suave, una silueta a contraluz o una luna.
- **Referencias:** si hay imágenes elegidas, muestra la primera.

Los popovers ahora son tarjetas con el dibujo y el nombre. La elegida lleva un borde amarillo y una tilde.

Los dibujos están hechos en el propio sitio: no son imágenes de otra página.

### Panel en capas

- **Afuera**, el panel con los chips arriba.
- **Adentro**, un escenario más claro con la escena, los ajustes y el botón. Se marca apenas cuando estás escribiendo.
- Los ajustes son píldoras en relieve, cada una con su ícono: un diamante para la calidad, un rectángulo para el formato y un reloj para la duración.
- Imagen / Video queda al costado, a la altura del escenario. En tablet y en teléfono pasa arriba del panel.

### GENERAR con relieve

- Es una **tecla en relieve**, con un canto más oscuro abajo. Al pasar el mouse sube un poco y al apretarla se hunde.
- Desactivada, es una tecla gris.
- **La segunda línea muestra créditos reales:**
  - si el catálogo tiene un precio publicado para el modelo, el estimado «≈ N»;
  - si no, tu saldo real de Kie: «1.000 disponibles».
- Hoy ningún modelo habilitado tiene precio publicado, así que se ve el saldo. No se inventa un número como el «80» de la referencia.

### Proyectos

- **El collage tiene tres piezas separadas**, cada una con sus esquinas redondeadas: el último resultado grande y los dos anteriores apilados al lado.
- Una pieza vacía muestra una placa oscura con un brillo suave.
- Al pasar el mouse, la tarjeta sube y las imágenes se acercan un poco.
- El nombre y «Privado», con su candado, van en la misma línea; debajo, cuántos resultados o proyectos tiene.
- «Crear proyecto nuevo» tiene un círculo en relieve que se pone amarillo al pasar el mouse.

### Espacio y movimiento

- Hay más aire entre el carrusel, el título, el panel y las secciones.
- «Lo último» es una fila de cuatro, para que los proyectos queden más cerca.
- Todos los movimientos son cortos y suaves. Si la computadora pide menos movimiento, no se mueve nada y el carrusel no avanza solo.

## Qué no cambió

- La estructura de las páginas, la barra lateral, los textos en español y todas las funciones: «@», proyectos, carpetas, favoritos, generar, «Preguntar antes» y sincronización.
- Las pestañas de Cinema Studio.

## Cómo se revisó

- Capturas de antes y después a 1440, 768 y 390 px de ancho, con datos de prueba y una Kie falsa (sin gastar créditos).
- Tres rondas de corrección:
  - la miniatura del popover que quedaba más baja;
  - el panel que no se alineaba en la página de proyecto;
  - Imagen / Video, que apretaba el panel en tablet;
  - las flechas, que tapaban el póster en el teléfono;
  - el botón, que se estiraba cuando había referencias.
- Revisión de accesibilidad (axe) sin hallazgos en Inicio, un popover abierto, un proyecto, la barra plegada y el teléfono.
- Con el teclado: el popover abre con el foco en la opción elegida, las flechas se mueven entre las tarjetas y Enter elige.
- `tsc`, las 170 pruebas y el build de producción, sin errores.

## Pulido de detalles (con la guía UI/UX Pro Max)

Se revisó el Estudio contra la lista de la guía: accesibilidad, uso con el dedo y respuesta de los botones. Antes de corregir, se midió en el navegador.

### Qué se encontró y se corrigió

- **Un doble clic en GENERAR creaba dos tareas en Kie, y se cobraban las dos.** Pasaba con «Preguntar antes» apagado.
  - Ahora, mientras se le pide a Kie, el botón se bloquea y dice «ENVIANDO… Pidiendo a Kie». Un segundo clic no hace nada.
  - El arreglo está en la parte compartida, así que también protege las pestañas Imagen, Video y Editar de Cinema Studio. «Dirigir» genera plano por plano y no se cambió.
  - Medido antes y después: el doble clic pasó de 2 tareas a 1, en el Estudio y en la pestaña Imagen.
- **El carrusel avanzaba solo y no tenía cómo detenerlo.** Ahora tiene, debajo de los pósters, una fila con:
  - anterior;
  - puntos que muestran en cuál estás;
  - **pausa / reanudar**;
  - siguiente.

  En pausa queda quieto hasta que lo reanudes. Mientras avanza solo, el lector de pantalla no anuncia cada cambio; sí lo hace cuando lo movés vos. Si la computadora pide menos movimiento, no avanza solo y no aparece el botón de pausa.
- **El foco del teclado no se veía en varios controles:** la página actual de la barra lateral, los pósters, Imagen/Video, el modelo, Calidad, Formato y los videos. Sus sombras tapaban la marca.
  - Ahora se usa la misma marca que en el resto del sitio, un contorno amarillo que ninguna sombra tapa.
  - En el botón GENERAR el contorno es blanco, para que se vea sobre el amarillo.
  - Al escribir la escena se ilumina todo el escenario.
- **Las etiquetas chicas de los chips** («REFERENCIAS», «LUZ»…) tenían un contraste de 4,17:1. Ahora tienen más de 4,5:1, que es el mínimo.
- **En el teléfono:**
  - los ajustes del panel quedan a 8 px entre sí;
  - los botones responden al toque sin demora;
  - «Imagen» y «Video» quedan centrados en su botón.

### Cómo se verificó

- Un recorrido con Tab por toda la página: todos los controles muestran el foco (el cuadro de texto lo muestra iluminando el escenario).
- Una medición de contraste de cada texto visible: ninguno queda por debajo de 4,5:1.
- axe sin hallazgos en Inicio, un popover abierto, un proyecto, Mis elementos y el teléfono.
- `tsc`, las 170 pruebas y el build de producción, sin errores.
