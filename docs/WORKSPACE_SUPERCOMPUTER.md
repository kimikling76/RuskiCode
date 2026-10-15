# Estudio — diseño del workspace / supercomputer

Se aplica DESIGN.md al espacio privado `/workspace`. La portada pública conserva BUILD-SPEC. Tokens del nuevo diseño limitados a `.studio-app` y diálogos portados; no se cambian variables globales de la portada.

## Qué cambia
- Sidebar de 240 px, búsqueda de chats por título, plegado manual y modo compacto automático entre 768 y 1199 px. En móvil se conserva el drawer de Radix.
- Inicio con logo de bloques propio y título condensado, prompt de 672 px, controles compactos y accesos a los estudios.
- Galería de seis plantillas filtrables en 3/2/1 columnas. Las vistas previas son ilustraciones SVG originales, claras y neutras. Elegir una completa y enfoca el mensaje; no envía ni genera.
- «Preguntar antes» abre una confirmación con el modelo antes de enviar el Chat a Kie. No activa herramientas ni modifica el prompt de sistema. Regenerar mantiene su confirmación propia.
- Paleta plana, bordes, radios, foco visible y movimiento reducido. No hay gradientes ni sombras decorativas.

## Suposiciones y adaptaciones
- Se conserva la estructura Chat / PDF Studio / Cinema Studio. Skills, conectores y MCP no se muestran como funciones activas sin estar conectadas.
- Sin «Free», precios o descuentos inventados. La tarjeta de ayuda sustituye la promoción; los registros de Kie sustituyen un pricing comercial.
- El selector nativo conserva los modelos actuales y su navegación de teclado. El catálogo completo sigue pendiente de la integración Kie.
- Se usa Barlow Condensed ExtraBold 800, ya alojada en el proyecto con licencia OFL, en lugar de descargar Anton. El documento admite una fuente condensada equivalente; Inter sigue en la interfaz.
- El botón + abre el editor existente para trabajar con archivos; no simula adjuntar a un chat que aún no procesa archivos.
- Se conserva una línea de costo no disponible en el prompt y los costos reales cuando Kie los informa.
- Se conserva Ctrl/⌘+Enter para enviar. La activación de «Preguntar antes» intercepta ese atajo y el botón de envío.
- La búsqueda filtra títulos de chats, sin enviar texto a un servicio externo. El plegado y la tarjeta de ayuda se guardan solo en el estado de la pantalla.

## Qué probar
1. Abrir `/workspace?studio=chat`: título, prompt compacto y seis plantillas debajo. La portada `/` debe conservar su diseño.
2. Elegir filtros y plantillas: solo debe cambiar el borrador; no hay consumo hasta enviar.
3. Activar «Preguntar antes», escribir y enviar con botón o Ctrl/⌘+Enter. Cancelar no envía. Confirmar hace una solicitud normal al Chat.
4. Buscar, abrir, renombrar y borrar/deshacer conversaciones. Convertir en proyecto debe conservar sus confirmaciones y el Chat original.
5. Plegar/expandir la sidebar. En 768–1199 px empieza como rail de íconos; en móvil el menú abre y cierra con foco atrapado y Escape.
6. Abrir PDF Studio, Cinema Studio y el editor actual. Revisar créditos y cerrar sesión.
7. Navegar con Tab y Shift+Tab; activar reducir movimiento.

Compilación/TypeScript y 45 pruebas existentes correctas. SSR comprueba un título, seis plantillas y el switch. No se han ejecutado llamadas de pago ni una revisión visual autenticada en navegador.

## Archivos completos
- src/app/layout.tsx
- src/components/studio/sidebar.tsx
- src/components/studio/personal-chat.tsx
- src/components/studio/template-gallery.tsx
- src/styles/workspace-design.css
- docs/WORKSPACE_SUPERCOMPUTER.md
El ZIP incluye también los assets existentes public/fonts/estudio-display.ttf y public/fonts/barlow-OFL.txt.
