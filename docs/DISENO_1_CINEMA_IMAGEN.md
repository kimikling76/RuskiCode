# Diseño 1 — Cinema Studio · Imagen: resultados grandes y un cuadro de generación con chips

Es el primer paso del plan de refinamiento visual, en la dirección «Estudio abierto»: el trabajo queda en el centro y los controles cerca de él. Se empezó por la pestaña Imagen porque era el cambio más grande del plan. Video, Editar, Dirigir y Galería no cambiaron de estructura.

## Qué cambió

**Antes:** una columna de ajustes de 340 px, más alta que la pantalla, y resultados de 258 px de ancho en un área de 852 px.

**Ahora:**

- **Los resultados ocupan la pantalla.**
  - En una computadora van en una grilla de al menos 280 px por imagen: unos 370 px en una pantalla de 1440 px.
  - En el celular van a dos columnas, arriba del cuadro de generación.
- **El pedido se escribe abajo, como en el Chat.** El cuadro tiene:
  - el prompt;
  - las referencias, como miniaturas que se quitan con la ✕;
  - una fila de chips.
- **Cada chip muestra el valor elegido.** Modelo, Formato, Resolución e Imágenes nunca quedan escondidos.
  - Al tocar un chip se abren sus opciones.
  - Un clic, Espacio o Enter elige y cierra.
  - Las flechas mueven la elección sin cerrar y Escape cierra.
  - Las opciones son solo las que el modelo elegido acepta, como antes.
- **Botones del cuadro.** El de imagen agrega referencias de la galería y muestra cuántas hay. El de chispas abre la ayuda con el prompt.
- **Generar.**
  - **Ctrl+Enter** dentro del prompt genera.
  - Con «Preguntar antes» activado pide la confirmación de siempre, que no inventa costos.
  - El rótulo «Preguntar antes» ahora se ve también en el celular.
- **Arreglos que se ven en todo el estudio:**
  - El botón principal desactivado se ve gris neutro, no verde apagado.
  - Los datos de cada tarjeta («16:9 · 1K · 3 créditos») ya no se parten en dos líneas.
  - El selector de modelo de Video y Editar queda alineado con su rótulo y muestra el nombre completo.

## Qué no cambió

- Lo que se manda a Kie y el seguimiento de las tareas.
- La confirmación, el visor, la galería y lo guardado.
- Las otras pestañas de Cinema.

## Cómo probarlo

En la vista previa de esta rama, con sesión iniciada:

1. **Generar.** En Cinema Studio → Imagen:
   - Escribí un prompt.
   - Tocá el chip **Formato** y elegí 16:9.
   - En **Imágenes**, elegí 2.
   - Tocá **Generar 2**. La confirmación dice modelo, cantidad, formato y resolución.
2. **Resultados.** Las tarjetas aparecen arriba con «Enviando», su tiempo real y después la imagen. Se ven grandes, y cada una tiene descargar, usar como referencia, editar y ver.
3. **Referencias.**
   - Tocá «Usar como referencia» en un resultado: aparece como miniatura dentro del cuadro.
   - El botón de imagen abre la galería para agregar más.
4. **Teclado.**
   - Con Tab llegás a cada chip.
   - Enter abre las opciones y las flechas cambian la elección.
   - Escape cierra y el foco vuelve al chip.
   - Ctrl+Enter en el prompt genera.
5. **Celular.**
   - Los resultados van arriba, a dos columnas.
   - Los chips se deslizan de costado.
   - «Preguntar antes» y «Generar» quedan en su propia línea.
   - Cada botón mide al menos 44 px.

## Qué se probó

- **Copia local** con base de datos de prueba y Kie simulado, sin gastar créditos:
  - generar 3 imágenes desde el cuadro;
  - la confirmación con Ctrl+Enter;
  - agregar y quitar referencias;
  - los chips con el mouse y con el teclado;
  - el visor;
  - las pestañas Video, Editar y Galería;
  - el celular de 390 px sin desplazamiento horizontal.
- **Accesibilidad:** axe sin problemas en escritorio, con un chip abierto y en el celular.
- **Movimiento reducido:** las opciones aparecen sin animación.
- **No probado:** el teclado en pantalla de un celular real y Kie real.
