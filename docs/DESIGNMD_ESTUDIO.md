# Estudio — adaptación del DesignMD

Se adapta la referencia visual proporcionada: fondo #0F1113, superficie #1C1E21, acento #D1FE17, titulares Space Grotesk e interfaz Inter, tarjetas de 10–12 px y controles de 40 px.
La marca, el logo de bloques y los textos son propios de Estudio. No se incluyen logos, recursos gráficos ni textos comerciales del sitio de referencia.

## Archivos completos
- src/styles/design-tokens.css
- src/app/globals.css
- src/app/page.tsx
- src/components/studio/personal-chat.tsx
- src/components/studio/sidebar.tsx
- public/fonts/estudio-space-grotesk.ttf
- public/fonts/space-grotesk-OFL.txt
- docs/DESIGNMD_ESTUDIO.md

La fuente se sirve desde el proyecto con su licencia OFL. No requiere Google Fonts en tiempo de ejecución, variables nuevas, dependencias ni cambios de backend.

## Composición
Un solo título para el Chat vacío, caja próxima al título y sugerencias que rellenan el mensaje para revisarlo antes de enviarlo. Al iniciar la conversación, el historial ocupa el espacio y la caja vuelve al pie del contenido. Se conserva Ctrl/⌘+Enter para enviar.
Se sustituye la explicación técnica de precios pendientes por «Costo estimado: no disponible». No se fabrican costos ni se amplía el catálogo de modelos.
La portada pública usa la misma paleta y tipografía; conserva sus contenidos y navegación.

## Qué probar
1. Abrir portada y Chat en escritorio y móvil: titulares, superficies y controles consistentes.
2. Elegir una sugerencia: debe completar y enfocar la caja, sin enviar ni consumir créditos.
3. Escribir y enviar, detener, copiar, regenerar y cambiar de chat.
4. Cambiar de modelo, renombrar, convertir en proyecto y borrar/deshacer.
5. Abrir PDF Studio, Cinema Studio y el editor anterior: deben conservar las herramientas existentes.
6. Recorrer controles con Tab y activar reducir movimiento en el sistema.

## Límites
El documento de referencia no describe el dashboard privado ni mide todos los estados. La composición de Chat, el responsive y los estados se adaptan a nuestra aplicación.
No se ejecutan generaciones de pago. La inspección visual en navegador autenticado y la auditoría completa de accesibilidad siguen pendientes.
