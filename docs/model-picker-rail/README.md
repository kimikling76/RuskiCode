# Selector de modelos: riel de proveedores

Base: `refine/codigo-de-autor`, commit `f46acf20219b3ea7ecdfad323e01b04868e2fafb`.
Rama de entrega: `feat/model-picker-rail`. El parche adjunto se aplicó con `git am` y se ajustó en el mismo commit.

## Alcance

- Riel de 52 px con botones de 38 px, únicamente cuando el catálogo recibido contiene varios proveedores. Si falta `provider`, se usa «Kie.ai».
- Búsqueda global al escribir; con el campo vacío, las flechas izquierda/derecha recorren proveedores manteniendo el foco en el buscador. «Auto» encabeza cada vista de proveedor.
- Filas de 48 px con iconos de 30 px; sin subtítulos inventados. Google usa un SVG monocromo en línea; los demás proveedores, su inicial.
- Hover/navegación y selección tienen tratamientos distintos. El buscador enfocado usa un subrayado de 1 px con el token de acento.
- Popover de hasta 416 px, radio de 18 px y altura limitada por el espacio disponible de Radix. Ayuda de teclado oculta en móvil y dispositivos sin hover.
- Conservados nombres accesibles, combobox, `aria-activedescendant`, IME, Tab/Shift+Tab, Escape y retorno del foco.

Los únicos archivos de producción modificados son `src/components/studio/model-picker.tsx` y las reglas del selector en `src/styles/chat.css`. No se modificaron endpoints, autenticación, datos, catálogo real, integraciones, variables de entorno ni dependencias.

## Verificación ejecutada

- `npm ci`: completado.
- `npm run typecheck`: completado sin errores.
- `npm test`: 48 tests aprobados.
- `npm run build`: completado.
- `node scripts/author-chat-qa.mjs /tmp/author-chromium/chromium`: 30 capturas; diez análisis axe sin incidencias; sin errores de consola ni llamadas inesperadas de autenticación.
- Instalación de axe fuera del proyecto: `npm install --prefix /tmp/ruskicode-qa --no-save axe-core`.

El script conserva su prueba del catálogo de un proveedor y agrega una fixture local de tres proveedores: Google, Anthropic y un modelo sin proveedor. Los modelos de esa fixture se interceptan en Playwright, nunca se escriben en la configuración de la aplicación. La página de prueba se crea únicamente en una copia temporal del código, sin copiar archivos de entorno ni habilitar rutas de prueba en producción.

Con esa fixture se comprobaron geometría, búsqueda entre proveedores, fallback, flechas, campo con espacios, IME, estado activo frente a seleccionado, `aria-activedescendant`, clic sin perder foco, Tab hacia «Preguntar antes», Shift+Tab hacia el textarea, Escape y proveedor seleccionado al volver a abrir. Se comprobaron movimiento reducido, ayuda oculta en táctil y límites del popover a 1280 × 900, 390 × 900 y 390 × 480. El Chat completo se revisó además a 768 y 1920 px, con streaming simulado, detener, copiar, regenerar, renombrar, borrar/deshacer y conversión a proyecto.

## Capturas revisadas

| Catálogo | Escritorio | Móvil | Móvil con altura reducida |
| --- | --- | --- | --- |
| Un proveedor | [1280 px](single-1280.png) | [390 px](single-390.png) | Incluido en los controles de límites del compositor |
| Varios proveedores, fixture | [1280 px](multi-1280.png) | [390 px](multi-390.png) | [390 × 480](multi-390x480.png) |

El informe automático completo está en [qa-results.json](qa-results.json). La repetición de interacciones con `--behavior-only`, incluyendo la ausencia de riel con un proveedor y el color del subrayado de foco, está en [qa-behaviors.json](qa-behaviors.json). Para repetirlo, instalá las dependencias, instalá axe fuera del proyecto y pasale al script la ruta de un Chromium compatible.

## Límites

Las pruebas usan Chromium headless y datos controlados. No se ejecutaron llamadas pagas a Kie.ai, ni se comprobó un inicio de sesión real, Safari/Firefox, un teclado móvil físico o lectores de pantalla. Axe y las pruebas de teclado no sustituyen una auditoría manual con tecnología de asistencia. No se publicó en producción ni se hizo merge.
