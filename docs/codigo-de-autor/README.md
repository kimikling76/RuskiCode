# Código de autor — Chat y componentes compartidos

## Resultado y alcance
Refinamiento del Chat en la rama `refine/codigo-de-autor`. Los cambios se preparan para revisión; no se fusiona ni publica esta rama en producción. No se implementan Cinema Studio ni un editor PDF nuevo. Se conservan endpoints, auth, esquema de datos, integraciones y variables de entorno.

## Diseño
Paleta aplicada como tokens compartidos: fondo #101113, sidebar #141517, panel #1B1D20, texto #F1F2EE, secundario #A5A9AF, acento #C8E879. Onest para títulos y marca, Inter para interfaz y JetBrains Mono para código. Son las fuentes locales existentes: no se descargan fuentes en ejecución ni se agregan archivos nuevos. Se verificaron sus cmap para todo el alfabeto ruso moderno, Ё/ё, latín y diacríticos/signos españoles; evidencia en `font-coverage.json`.

Texto regular con interlineado 1,65 y un máximo de 70ch en respuestas. Encabezado alineado con la columna, sin divisor duro. Asistente abierto, compositor con luz superior de 1px, sombra amplia y foco discreto; una luz ambiental neutra y textura inferior al 1%. Radios 24/18/12/9/8 según jerarquía. El acento se reserva a acciones principales, estados activos y foco. Se conserva el símbolo propio y el favicon aprobado.

Contraste de los pares principales: texto/fondo 16,80:1; secundario/fondo 8,00:1; secundario/panel 7,15:1; texto del botón/acento 12,21:1. Cálculo sobre tokens sólidos en `contrast.json`; no equivale a auditar manualmente cada combinación dinámica.

## Qué se quitó
- La triple presentación de una respuesta fallida y los reintentos duplicados.
- «No se recibió texto», «La respuesta no se completó», créditos desconocidos y estimaciones sin datos fiables.
- Contadores de solicitudes de costo desconocido y contadores monetarios sin cantidades informadas.
- Selector nativo de modelos y menús HTML details en los chats.
- Horas permanentes en escritorio y repetición del aviso de almacenamiento cuando ya se ve en la sidebar expandida.
- Contenedores visuales innecesarios y pesos fuertes en navegación.

## Qué se agregó o adaptó
- Selector buscable sobre Radix Popover: usa exclusivamente GET `/api/personal-chat`, más Auto del servidor. Búsqueda por nombre/proveedor, flechas, Enter, Escape y Tab/Shift+Tab hacia los controles del compositor. Foco administrado, listbox/combobox ARIA y retorno al disparador. Inicial del proveedor sin descargar logos. No se inventan descripciones de capacidades, precios ni velocidad.
- Menús de acciones Radix Dropdown Menu con teclado; abrir Renombrar/Borrar desde ellos y cerrar el diálogo devuelve el foco al menú correspondiente.
- Confirmaciones de borrado de chats/mensajes con Radix Alert Dialog, foco inicial en Cancelar y explicación de que los proyectos se conservan.
- Dialog existente reutilizado para ajustes, conversión y confirmación de consumo. La doble confirmación para borrar todos los chats se conserva.
- IconButton reutiliza el Button existente en modo sin estilos heredados y añade Tooltip. Se conserva el comportamiento de las variantes antiguas de Button.
- Sidebar con jerarquía más tranquila y navegación móvil en drawer con foco retenido y Escape.
- Un solo error por respuesta con «No pude terminar esta respuesta» y «Reintentar». Cuando hay una causa concreta, se explica dentro de ese mismo estado. Un fallo de almacenamiento o del catálogo conserva su propio aviso porque comunica otra condición.
- Créditos únicamente si son números finitos y no negativos informados por el proveedor; cero válido también se muestra. Regenerar/reintentar sigue pidiendo confirmación de consumo.
- Reintentar una respuesta antigua reemplaza solo esa respuesta y conserva los mensajes posteriores. Se conserva el consumo anterior.
- Horas y acciones por hover/foco en escritorio, siempre accesibles en móvil/touch. Mensajes con entrada de 5px/160ms y respeto por movimiento reducido, también en portales.
- Padding de zona segura en el compositor, autoresize de hasta 8 líneas y adaptación al visualViewport. El compositor ocupa su propio espacio y no se superpone a mensajes.

## Dependencias
Ya existían React/Next, Button/CVA/Slot, Radix Dialog, Lucide, Markdown, Zustand y TanStack Query. Se agregaron únicamente los cuatro primitivos faltantes:
- `@radix-ui/react-popover ^1.3.1`
- `@radix-ui/react-dropdown-menu ^2.2.1`
- `@radix-ui/react-alert-dialog ^1.2.1`
- `@radix-ui/react-tooltip ^1.4.1`

No se instaló otra biblioteca de estilos, el CLI de shadcn, Base UI ni cmdk. Se adaptó el patrón de búsqueda a Radix y al catálogo existente. Las demos no definen el aspecto de esta interfaz.

## Referencias oficiales consultadas
- [Combobox de shadcn](https://ui.shadcn.com/docs/components/radix/combobox): composición de búsqueda/lista, elementos personalizados y estado vacío.
- [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover): portal, foco, cierre, colisiones y altura disponible.
- [Radix Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu): menús, selección y teclado.
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog): foco retenido, título/descripción y Escape.
- [Radix Alert Dialog](https://www.radix-ui.com/primitives/docs/components/alert-dialog): confirmación explícita y cancelación.
- [Radix Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip): ayudas de controles con foco y puntero.

## Verificación
- `npm run build`: correcto, sin ruta QA en la aplicación real.
- `npm run typecheck`: correcto.
- `npm test`: 48 pruebas correctas, incluida validación de cantidades que pueden mostrarse como créditos.
- El repositorio no tiene script ni configuración de lint; no se afirma que haya pasado un lint inexistente.
- Playwright: 27 capturas, incluidos vacío, conversación normal, Markdown largo, streaming activo y error en 390/768/1280/1920px; además selector, código, navegación móvil y viewport de 390x480. Sin desbordamiento horizontal de página ni solapamiento/clipping del compositor. Capturas revisadas visualmente.
- Axe: siete escaneos sin infracciones detectadas: vacío móvil, conversación normal, Markdown largo, selector en escritorio y móvil, confirmación de borrado y navegación móvil.
- Teclado: flechas/Enter/búsqueda/Tab/Shift+Tab/Escape en selector; foco retenido en diálogos y drawer; retorno del foco al cerrar menús/renombrar/confirmaciones; foco tras editar el título.
- Flujos UI: enviar, cambiar modelo durante un chat, SSE incremental, detener, scroll manual conservado, ir al último mensaje, copiar realmente al portapapeles, renombrar, buscar historial, regenerar, convertir y abrir proyecto con brief manual, borrar mensaje, borrar/deshacer chat y purgarlo tras 8 segundos. Las copias en proyectos se conservan.
- Se verificó que un error SSE real del fixture deja exactamente un error y una acción de reintento. También se comprobó el reintento de una respuesta antigua sin borrar mensajes posteriores.
- Sin errores de consola ni solicitudes inesperadas a auth en el fixture aislado. Datos en `qa-results.json`.

## Límites de las pruebas y de los datos
Las pruebas UI usan una copia temporal explícita de archivos de código, nunca .env, y una ruta de desarrollo creada solo dentro de esa copia. Se intercepta el endpoint de chat con respuestas controladas, incluido SSE incremental por HTTP. No hay bypass de autenticación ni datos de ejemplo en la aplicación real.

No se hicieron llamadas de IA de pago, login real de Google ni cierre de sesión de una cuenta real. Auth y los endpoints están sin cambios. La prueba con viewport reducido aproxima el espacio del teclado; no sustituye comprobar el teclado real en iOS/Android. No se ejecutó un nuevo Lighthouse en esta entrega.

La API actual no entrega tarifas ni velocidad. Se omiten sus etiquetas y la estimación previa; solo se muestran créditos realmente informados. Los modelos que aparecen son los que habilita la configuración del servidor, sin añadir otros. La persistencia continúa en el navegador (`estudio-personal-v2`); no se migra ni sincroniza en esta entrega. `errorCode` es un campo opcional de presentación en el mensaje local y nunca se envía como parte del historial a la API.

## Cómo repetir las comprobaciones
1. `npm ci`, `npm run build`, `npm run typecheck`, `npm test`.
2. Instalar axe-core fuera del proyecto: `npm install --prefix /tmp/ruskicode-qa --no-save axe-core`.
3. `node scripts/author-chat-qa.mjs /ruta/al/ejecutable/chromium`. Playwright ya es una dependencia del proyecto. El servidor y el navegador se lanzan en el mismo proceso de comprobación; la ruta de QA se crea en una copia temporal.
4. Las capturas están en esta carpeta. `--behavior-only` permite repetir únicamente las interacciones; su JSON separado no forma parte del informe principal.

## Qué probar como usuario en la rama
1. Abrí el selector, buscá un modelo, elegilo con flechas/Enter y cerralo con Escape. Probá Tab para seguir hacia «Preguntar antes».
2. Enviá un mensaje corto; cada envío real puede consumir créditos. Probá copiar, cambiar de modelo y renombrar.
3. Durante una respuesta larga, subí para leer y después usá «Ir al último mensaje».
4. Borrá un chat de prueba y usá Deshacer. Al convertir uno, verificá el brief antes de confirmar.
5. En el celular, abrí la navegación y después escribí varias líneas con el teclado abierto; el compositor y los controles deben seguir accesibles.
