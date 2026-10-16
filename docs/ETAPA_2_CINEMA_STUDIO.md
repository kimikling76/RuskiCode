# Etapa 2 — Cinema Studio

Cinema Studio deja de ser una lista de briefs y pasa a tener cinco pestañas: **Imagen, Video, Editar, Dirigir y Galería**. Todo lo que muestra sale de respuestas reales del servidor o de Kie: no hay avances simulados ni opciones inventadas.

## Qué funciona

| Pestaña | Qué hace | De dónde salen los datos |
|---|---|---|
| **Imagen** | Prompt, modelo, formato dibujado a escala, resolución, 1 a 4 variantes y hasta 4 referencias de la galería. Cada variante es una tarjeta con su estado real: Enviando → En cola → Generando → lista o error. | Kie `jobs/createTask` y `jobs/recordInfo` con el modelo `nano-banana-2-1`, el mismo que ya usa el flujo de libros. |
| **Ayuda con el prompt** | Convierte una idea en un prompt concreto que podés editar antes de usarlo. No genera imágenes. | El modelo de chat de Kie que ya está configurado (`/api/personal-chat`, uso `prompt`). |
| **Editar** | Elegís una imagen de la galería, escribís la instrucción («que sea de noche») y comparás antes/después con un divisor que se mueve con el mouse, el dedo o las flechas. Con 2 o más variantes, también se comparan lado a lado. | El mismo modelo, con la imagen original como `image_input`. |
| **Dirigir** | De una idea a un plan: título, guion y 3 a 8 planos, cada uno con descripción y prompt editables. Los planos se reordenan arrastrando o con el teclado, y cada uno genera su imagen y muestra el costo real cuando Kie lo informa. Podés partir del brief de un proyecto convertido desde el Chat. | El modelo de chat para el plan (uso `storyboard`) y Kie para las imágenes. |
| **Galería** | Todo lo generado: búsqueda por prompt, filtros (Creadas, Editadas, Planos), selección múltiple, descarga, «Usar como referencia», «Editar» y «Repetir con estos ajustes». Al quitar imágenes aparece «Deshacer». | Este navegador, igual que los chats. |
| **Video** | Pantalla honesta: todavía no está conectado y no muestra controles. | — |

- **Costo:** antes de generar se muestra el modelo, la cantidad, el formato y la resolución, sin precio estimado (Kie no publica uno). El costo real aparece en la tarjeta cuando Kie lo informa (`creditsConsumed`) y se suma a la línea de créditos de la barra lateral.
- **Preguntar antes:** en Cinema está activado de entrada, porque las imágenes cuestan más que un mensaje.

## Qué se verificó en la documentación de Kie

Este entorno de desarrollo no puede abrir `docs.kie.ai`; la red lo bloquea. Lo consulté con el buscador web:

- **Endpoint de tareas, sus cinco estados** (`waiting`, `queuing`, `generating`, `success`, `fail`), **campos de respuesta** (`resultJson`, `failMsg`, `creditsConsumed`) y **errores** que llegan con HTTP 200 y el código en el cuerpo (401, 402, 422, 429, 501). Fuente: [Get Task Details](https://docs.kie.ai/market/common/get-task-detail).
- **Los archivos generados se borran a los 14 días.** Fuente: [Getting Started](https://docs.kie.ai/).
- **Modelo y campos:** `nano-banana-2-1`, con `prompt`, `image_input`, `aspect_ratio`, `resolution` y `output_format`. Fuente: [Nano Banana 2.1](https://docs.kie.ai/market/google/nanobanana-2-1).

**Pendiente de confirmar:** la tabla exacta de formatos del modelo 2.1. Ofrezco «auto», 4:3 (ya usado en producción) y los formatos que Kie publica para la misma familia de modelos ([Nano Banana 2 Lite](https://docs.kie.ai/market/google/nano-banana-2-lite)). Para la resolución, 1K sale del ejemplo oficial, 2K ya se usa en producción y 4K figura en [la página del modelo](https://kie.ai/nano-banana-2). Si Kie rechaza alguno, la tarjeta lo dice («Kie no aceptó alguno de los parámetros») y se quita de `src/lib/cinema/capabilities.ts`.

## Requiere backend (no hecho)

- **Video:** elegir un modelo de video de Kie y verificar su documentación.
- **Subir imágenes desde el dispositivo:** Kie tiene una API de subida, pero la documentación es contradictoria (24 horas o 3 días de vida del archivo) y no se pudo confirmar su formato.
- **Galería compartida entre dispositivos y personas:** hoy vive en este navegador.

## Archivos

- **Servidor:**
  - `src/app/api/cinema/images/route.ts` (crear y consultar tareas)
  - `src/app/api/cinema/download/route.ts` (descargar con nombre de archivo)
  - `src/lib/cinema/kie-jobs.ts`
  - `src/lib/cinema/capabilities.ts`
  - `src/lib/pipeline/asset-url.ts`: la validación de URLs, separada de `kie-images.ts` sin cambiar su comportamiento.
- **Texto:** `src/lib/personal-chat/input.ts` suma los usos `storyboard` y `prompt`, con instrucciones fijas en el servidor. El Chat personal sigue con su instrucción neutral.
- **Navegador:**
  - `src/store/cinema.ts`
  - `src/store/cinema-ui.ts`
  - `src/lib/cinema/{client,errors,plan}.ts`
  - `src/components/cinema/*`
  - `src/styles/cinema.css`
- **Pruebas:** `tests/cinema.test.ts` (7 pruebas nuevas; 54 en total).

**Dependencias nuevas:**
- `@radix-ui/react-tabs`
- `react-compare-slider`
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

## Verificación hecha

- `npm run typecheck`, `npm test` (54/54) y `next build` sin errores.
- **Navegador con Kie simulado**, a 1280 y 390 px:
  - Generación con estados reales y foto final.
  - Confirmación antes de generar.
  - Asistente de prompt.
  - Comparador manejable con teclado.
  - Planos que se reordenan con teclado y generan su imagen.
  - Galería con filtro, selección, quitar y deshacer.
  - Video sin controles falsos.
- **Calidad:** axe (WCAG 2.1 AA) sin problemas, sin scroll horizontal y sin errores de consola. El Chat de la Etapa 1 vuelve a pasar sus 7 comprobaciones.

## Qué probar (sin saber programar)

En la vista previa de Vercel de esta rama, con sesión iniciada:

1. **Imagen:**
   - Escribí un prompt, elegí 16:9, 1K y 1 variante, y tocá **Generar**.
   - Confirmá. La tarjeta pasa por «En cola» y «Generando» y muestra la imagen.
   - Anotá cuántos créditos dice.
2. **Costo:** compará esos créditos con [los registros de Kie](https://kie.ai/logs). Si no coinciden, avisame.
3. **Formatos:** probá 9:16, 1:1 y 21:9. Si alguno falla con «Kie no aceptó alguno de los parámetros», decime cuál y lo quito.
4. **Ayuda con el prompt:** escribí una idea simple y tocá «Usar este prompt».
5. **Editar:**
   - Elegí una imagen de la galería y escribí «que sea de noche».
   - Mové el divisor antes/después con el mouse y después con las flechas.
6. **Dirigir:**
   - Escribí una idea de video corto y tocá **Crear plan**.
   - Arrastrá un plano a otro lugar.
   - Generá la imagen de un solo plano.
7. **Galería:**
   - Buscá una palabra del prompt.
   - Seleccioná dos imágenes, quitalas y tocá «Deshacer».
   - Descargá una.
8. **Celular:**
   - Las pestañas se deslizan de costado.
   - El botón Generar queda fijo abajo.
   - La imagen grande se ve completa.
9. **Seguimiento:** cambiá al Chat mientras se genera una imagen y volvé. La tarea siguió avanzando.
