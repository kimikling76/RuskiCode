# Pedidos de texto sin perder créditos

Cuatro cambios para que un pedido largo a la IA no se pierda después de que Kie lo cobró.

## 1. El precio antes de enviar
- **Kie no publica el precio** de sus modelos de texto. Lo único honesto es estimarlo con lo que Kie te cobró antes.
- **Junto al selector de modelo,** el Chat muestra cuánto suele costar:
  - «≈ 3 cr.» por respuesta;
  - con /pdf-generator, «≈ 9 cr./parte».
- **Cómo se calcula:** es el valor del medio de tus últimos 6 pedidos del mismo tipo con el mismo modelo. Al pasar el mouse dice en cuántos pedidos se basa.
- **La primera vez con un modelo** dice «Precio al terminar». El costo real sigue apareciendo en cada tarjeta y en «Gasto de esta sesión».

## 2. Se escribe en el servidor
- **/pdf-generator ya no depende de la pestaña.** El pedido corre en el servidor y la respuesta se guarda a medida que llega, cada 3 segundos.
- **Si cerrás la pestaña, recargás o se corta internet,** al abrir de nuevo el chat la tarjeta sigue esperando la misma respuesta. No se pide de nuevo.
- **Dos pestañas con el mismo chat** esperan la misma respuesta: Kie cobra una sola vez.
- **Las respuestas se guardan una semana** en la base del estudio (tabla `text_job`, que se crea sola la primera vez y solo agrega).
- **Si el servidor no puede guardarlas,** se usa el envío de antes.

## 3. Pedidos grandes en partes
- **La IA escribe como máximo 12 bloques por respuesta.** Si el pedido necesita más (una unidad entera, varias páginas), escribe la primera parte y dice qué falta.
- **El estudio pide la parte siguiente solo** y la agrega al final, hasta 8 partes. Cada parte es corta, así que no se corta por tiempo.
- **Las galerías numeradas siguen contando:** el alfabeto en dos partes va del 1 al 17 y del 18 al 33.
- **«Detener después de esta parte»:** termina la parte que se está escribiendo y no pide más.
- **Cada parte se cobra aparte.** La tarjeta suma el total.

## 4. «Continuar»
- **Aparece cuando falta algo:**
  - después de detener;
  - si una parte se cortó;
  - si una parte no se pudo leer;
  - si ya se escribieron las 8 partes.
- **Qué hace:** le pide a la IA solo lo que falta, con la lista de lo ya escrito para que no lo repita.
- **Lo ya escrito no se pierde ni se paga de nuevo.**

## Cómo se probó
- **Pruebas automáticas** (`tests/text-jobs.test.ts`):
  - la tabla nueva es igual a su migración y solo agrega;
  - el código de cada pedido es el mismo para la misma tarjeta, parte e intento;
  - unir partes;
  - la numeración de las galerías;
  - el pedido de continuación;
  - las instrucciones al modelo;
  - la estimación de precio.
- **En el navegador, con una Kie de prueba** que escribe cada parte en unos 12 segundos:
  - se pidió el alfabeto completo y se **recargó la página a mitad** de la respuesta;
  - al abrir el chat de nuevo, la tarjeta retomó la misma respuesta, pidió sola la parte 2 y unió las dos: 5 bloques, 16 créditos;
  - la Kie de prueba recibió **2 pedidos, uno por parte**: nada se pidió dos veces;
  - **«Detener después de esta parte»** dejó la primera parte con «Falta: …» y el botón «Continuar». «Continuar» pidió solo lo que faltaba;
  - el precio estimado apareció junto al modelo («≈ 8 cr./parte») y en la tarjeta.
