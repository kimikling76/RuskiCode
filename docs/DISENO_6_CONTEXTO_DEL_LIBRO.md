# Diseño 6 — Contexto del libro: los personajes con su cara y un solo sistema de estados

Es la pantalla del plan de diseño donde se guardan los personajes, las unidades, las reglas y las decisiones del libro. Antes tenía tres problemas:

- **Los datos empezaban lejos.** Había un párrafo largo, una fila de botones, cinco etiquetas de colores y las pestañas, y los datos aparecían a unos 390 px del borde de arriba.
- **Demasiados colores.** «Aprobado» usaba el mismo verde lima que los botones de acción, y había cinco colores de estado juntos.
- **Los personajes eran una lista de texto**, aunque cada uno tiene su ficha con foto.

## Qué cambió

### Arriba, un solo bloque

- **El título**, el nombre del libro (o el selector, si hay varios) y una línea que dice para qué se usa.
- **A la derecha: «Importar archivos», «Agregar dato» y «⋯».** El menú «⋯» tiene «Exportar el contexto (.json, con las imágenes)», que hace lo mismo que el botón de antes.
- **Una línea con cuántos datos hay en cada estado.** Tocar uno filtra «Todos los datos». Al lado van los avisos («1 decisión pendiente», «2 personajes sin foto principal»), que llevan a donde hay que resolverlos.

### Estados: un punto y su nombre

| Estado | Punto |
| --- | --- |
| Aprobado | verde |
| Pendiente | ámbar |
| Propuesto | azul |
| Observado en un archivo | círculo vacío |
| Sustituido | círculo vacío y el nombre tachado |

El verde lima de los botones queda solo para acciones, foco y selección.

### Pestaña nueva: «Personajes»

Es la primera pestaña cuando el libro tiene personajes.

- **Cada personaje es una tarjeta con su foto principal**: la misma que reciben los modelos de imagen.
  - Debajo van su nombre en ruso, su edad, su rol y su estado.
  - Si la edad ya está escrita en el rol, no se repite.
- **Sin foto principal, la tarjeta lo avisa** («Sin foto principal», «Sin imagen» o «Sin imagen verificada»).
  - Si el personaje tiene otra imagen, muestra esa: primero una aprobada, nunca una rechazada.
  - Si no tiene ninguna, muestra la inicial de su nombre.
  - No se genera ninguna imagen para llenar el hueco.
- **Al tocar un personaje**, la grilla se achica a una columna con caras pequeñas y al lado se abre su ficha completa, la misma de siempre. Desde la columna se pasa de un personaje a otro, y «Todos los personajes» vuelve a la grilla.
- **«Todos los datos»** sigue como antes: lista con búsqueda, tipo y estado, y la ficha al lado.

### Celular

- Dos tarjetas por fila.
- Al abrir un personaje se ve solo su ficha, con «Todos los personajes» para volver.
- Los botones, filtros y pestañas miden 44 px.
- El título de la página sigue en la barra de arriba, y ahora también queda para los lectores de pantalla.

## Qué no cambió

- **Lo que se guarda y cómo se sincroniza:** los datos, sus versiones e historial, las fuentes y las imágenes de referencia.
- **Cómo se aprueba, se edita y se decide**, y la ilustración con un personaje.
- **Importar y exportar** el paquete del libro.
- **Las pestañas «¿Qué sabe el alumno?» y «Unidades y asistentes».**

## Cómo probarlo

En la vista previa de esta rama, con sesión iniciada, en PDF Studio → Contexto del libro:

1. **Personajes.** Se abre «Personajes» con la foto de cada uno. Los que no tienen foto principal lo dicen.
2. **Ficha.** Tocá un personaje: a la izquierda quedan las caras pequeñas y a la derecha su ficha. Tocá otro desde la columna y después «Todos los personajes».
3. **Estados.** Arriba, tocá «Pendiente»: se abre «Todos los datos» filtrado.
4. **Exportar.** En «⋯» → «Exportar el contexto»: se descarga el .json con las imágenes.

## Qué se probó

- **Copia local** con un libro inventado de 7 personajes. Las fotos son manchas de color de prueba y no hay nada del libro real.
  - importar el paquete;
  - la grilla;
  - abrir un personaje y pasar a otro;
  - volver a la grilla;
  - el filtro por estado;
  - los avisos;
  - exportar desde «⋯»: 10 datos y 6 imágenes.
- **Accesibilidad:** axe sin problemas en la grilla, la ficha abierta y «Todos los datos», en escritorio y en el celular.
- **Celular de 390 px:**
  - sin desplazamiento de costado;
  - sin botones de menos de 44 px.
- `npm test`, `tsc` y `next build` sin errores.
- **No probado:** el libro real con sus fichas verdaderas (está en tu cuenta) y un celular real.
