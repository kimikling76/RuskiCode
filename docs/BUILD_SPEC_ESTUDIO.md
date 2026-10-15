# Estudio — BUILD-SPEC aplicado

Se reemplaza el sistema anterior por `src/styles/tokens.css`, derivado del adjunto. Única fuente UI: Inter. Portada en orden: navegación, hero con prompt, categorías y muestras, funciones, costos, cierre y footer.

## Comportamiento real
- El prompt guarda un borrador temporal en sessionStorage y abre el Chat privado. El Chat lo recupera sin enviarlo automáticamente. No hay consumo de IA en la portada.
- Las categorías filtran seis composiciones propias de ejemplo. Las tarjetas abren estudios o el editor existentes.
- Los enlaces de navegación y el menú móvil funcionan con teclado. Escape cierra el menú; las pestañas admiten flechas, Inicio y Fin.
- La autenticación, backend, claves, datos y rutas de API se conservan.

## Adaptaciones respecto de los adjuntos
1. Se sirve Inter localmente, con su licencia existente, en lugar del @import de Google Fonts. No se carga Space Grotesk ni ninguna otra fuente de interfaz.
2. Se corrige `transition: transform 400ms var(--ease)` a `transition: transform var(--ease)` porque --ease ya incluye duración. `.badge-pink` usa --ink en lugar de #fff. El resto de tokens conserva los valores adjuntos.
3. No se muestra «Gratis», descuentos, suscripciones ni precios sin verificar. La sección de costos tiene tres tarjetas que describen el estado real de Chat, Cinema y PDF. No se incluye la etiqueta rosa de descuento ni se inventa un plan recomendado.
4. El botón + abre el editor actual, donde se trabaja con archivos. Los chips llevan a los tres estudios reales; no se anuncian MCP, conectores o habilidades aún no integrados. La opción a la derecha conduce a la explicación de costos, sin simular un agente de generación.
5. Se mantienen controles de al menos 40px en móvil, priorizando la regla de accesibilidad frente al ejemplo de 32px. Las columnas son 1 hasta 767px, 2 desde 768 y 3 desde 1024.
6. Los estilos antiguos del editor se conservan para no alterar su funcionamiento, pero sus colores y fuentes de interfaz se remapean a los tokens suministrados. Los layouts de la portada y estudio usan clases adicionales para estructura; no agregan colores, fuentes, radios ni sombras al sistema.
7. No se dispone del navegador de capturas de pantalla en esta sesión. Las capturas a 375, 768 y 1440 px y su comparación visual siguen pendientes. No se simulan capturas.

## Qué probar
- Portada: ancho 375, 768 y 1440 px; menú móvil y tarjetas en 1/2/3 columnas.
- Un botón lima por sección; titulares en mayúsculas; solo Inter; tarjetas sin forma de cápsula.
- Escribir una idea y continuar: tras iniciar sesión aparece el borrador en Chat, sin enviarlo.
- Cambiar de categoría con clic y teclado; abrir tarjetas y enlaces del footer.
- Chat: enviar, detener, copiar, regenerar, renombrar, convertir y borrar/deshacer.
- Acceder a PDF, Cinema y editor actual. No ejecutar generaciones de pago solo para probar estilos.
- Tab, Shift+Tab, Escape y preferencia de movimiento reducido.

## Archivos completos
- tailwind.config.ts
- src/styles/tokens.css
- src/styles/landing.css
- src/styles/studio-spec.css
- src/app/globals.css
- src/app/layout.tsx
- src/app/page.tsx
- src/components/creative-landing.tsx
- src/components/studio/personal-chat.tsx
- src/components/ui/button.tsx
- docs/BUILD_SPEC_ESTUDIO.md
Se elimina src/styles/design-tokens.css porque su import fue reemplazado por tokens.css.
