# Diseño 2 — PDF Studio: los tres editores se manejan igual

Es el segundo paso del plan de refinamiento visual. PDF Studio tiene tres editores:

- el del **libro** (por bloques);
- el de la **unidad del manual**;
- el del **PDF importado**.

Cada uno había crecido por su lado: el zoom, el aviso de guardado, las miniaturas y las pestañas se veían y funcionaban distinto. Ahora comparten las mismas piezas (`src/components/pdf/editor-parts.tsx`).

## Qué cambió

- **Más lugar para la página.**
  - Los editores se abren con la navegación de la izquierda plegada.
  - Si la desplegás en un editor, queda así en los editores la próxima vez.
  - El resto del estudio guarda su propia elección, como antes.
- **El mismo zoom en los tres**: Alejar · Ajustar · Acercar, de 50 % a 200 %.
  - El botón del medio dice «Ajustar» o el porcentaje. Tocarlo alterna entre ajustar al ancho y 100 %.
  - El editor del libro antes tenía solo «Ajustar» y «100%».
- **El mismo aviso de guardado.**
  - Dice «Guardando…» y después «✓ Guardado · 21:58», con la hora del último guardado.
  - Si falla, aparece en rojo.
  - Una muestra que no se guarda no muestra nada, como antes.
- **Pestañas que entran siempre.** El editor del libro tenía seis pestañas y las últimas quedaban cortadas en el borde.
  - Ahora las principales están siempre a la vista y el resto está en **Más**:

    | Editor | Siempre a la vista | En «Más» |
    | --- | --- | --- |
    | Libro | Bloque, Capítulo, Asistente | Libro, Versiones, Notas |
    | Unidad del manual | Selección, Agregar, Páginas | Libro, Versiones |
    | PDF importado | Herramientas, Asistente, Versiones | — |

  - La pestaña que elegís en «Más» aparece al lado de las otras mientras está abierta. «Más» se achica a su flecha para hacerle lugar.
  - Con el teclado, el foco pasa a la pestaña elegida.
- **Miniaturas iguales.**
  - La página actual tiene el mismo borde verde en los tres editores. En el del libro antes era beige.
  - Los números se leen un poco más grandes.
- **Celular.** Las pestañas y «Más» miden al menos 44 px.

## Qué no cambió

- Lo que hace cada panel.
- Cómo se guarda y se sincroniza.
- Las versiones, el asistente, la exportación y las herramientas de Stirling.
- El color de la selección sobre la página. Ya era el mismo verde oliva en el libro y en el manual, y se distingue bien sobre el papel blanco.

## Cómo probarlo

En la vista previa de esta rama, con sesión iniciada:

1. **Navegación.**
   - Abrí un libro: la navegación de la izquierda aparece plegada.
   - Desplegala y abrí otro editor: sigue desplegada.
   - Volvé al Chat: está como la tenías antes.
2. **Zoom.**
   - En cualquiera de los tres editores, tocá **+** dos veces: 125 % y 150 %.
   - Tocá el porcentaje: vuelve a «Ajustar».
3. **Guardado.** En una unidad del manual, cambiá el nombre de un bloque. Arriba dice «Guardando…» y enseguida «Guardado · » con la hora.
4. **Pestañas.**
   - En el editor del libro, tocá **Más** → **Notas**: aparece «Notas» al lado de «Asistente», sin cortarse.
   - Tocá **Capítulo**: «Notas» vuelve a «Más».
5. **Celular.**
   - Las pestañas quedan debajo de la página.
   - «Más» funciona igual.
   - No hay desplazamiento de costado.

## Qué se probó

- **Copia local** con base de datos de prueba, en los tres editores:
  - un libro de muestra;
  - una unidad importada del PDF de prueba;
  - el mismo PDF abierto «tal cual».
- **Escritorio** a 1440 px y 1200 px: las pestañas principales y la que se abre desde «Más» entran sin cortarse.
- **Teclado:** «Más» se abre con Enter, las flechas eligen y el foco queda en la pestaña elegida.
- **Celular de 390 px:**
  - sin desplazamiento de costado;
  - pestañas de 48 px de alto y «Más» de 44 px.
- **Accesibilidad:** axe en los tres editores, en escritorio y en celular.
  - Solo avisa que la página no tiene un título principal (h1). Ya pasaba antes en los tres editores y queda para otro paso.
  - Con un menú abierto, axe marca lo mismo que con los menús que ya existían. Es por cómo Radix oculta el fondo mientras el menú tiene el foco.
- `npm test`, `tsc` y `next build` sin errores.
- **No probado:** un celular real y las herramientas de Stirling, que no estaban conectadas en la copia local.
