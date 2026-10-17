# Etapa 1 — Chat y componentes compartidos

Dirección visual «Графит»: grafito casi negro, un solo acento lima refinado (`#C4EB5C`), Geologica para títulos y marca, Onest para interfaz y lectura, JetBrains Mono para código.

## Qué cambió

### Solo visual (sin tocar backend, endpoints ni base de datos)

- **Un único archivo de tokens**: `src/styles/tokens.css`. Antes había seis hojas CSS que redefinían colores y tres limas distintas (`#D1FE17`, `#C6FF00`, `#C8ED68`). Ahora todo sale de un solo lugar.
- **Hojas eliminadas**: `studio-spec.css`, `workspace-design.css` y `redesign-foundation.css`. Además se quitaron de `globals.css` unas 850 reglas que ya no usaba ningún componente: el archivo pasó de 54 KB a 5 KB.
- **Fuentes**:
  - Se borraron Barlow Condensed y Space Grotesk, que no tenían cirílico, e Inter.
  - Las tres fuentes nuevas cubren А–Я, Ё/ё, ñ, tildes, ¿, ¡, «» y el acento tónico U+0301 (заво́д). Lo verifiqué glifo por glifo.
  - Se cargan con `next/font/local` desde `src/app/fonts/`.
- **Marca**: símbolo Ж dibujado como `>|<` (dos corchetes de código y un cursor lima). Archivos:
  - `src/components/studio/brand.tsx`
  - favicon `src/app/icon.svg`
  - wordmark vectorial `public/brand/russian-code-wordmark.svg`
- **Barra lateral nueva**: estudios en filas compactas, historial agrupado por Hoy / Últimos 7 días / Anteriores, menús accesibles por chat, cuenta y ajustes en un solo menú. Se puede plegar a 56 px; en móvil es un cajón lateral.
- **Chat**:
  - Encabezado compacto.
  - Respuestas sin tarjeta, a 68 caracteres de ancho y con interlineado 1,65.
  - La hora, el modelo y los créditos (solo si Kie los informó) quedan en la misma línea, pegados a cada mensaje.
  - Las acciones aparecen al pasar el cursor; en la última respuesta están siempre visibles.
- **Error único**: «No pude terminar esta respuesta.» con un solo botón «Reintentar». El detalle técnico queda plegado en «Detalles».
- **Selector de modelos**: popover con búsqueda, flechas, Enter y Escape (Radix Popover + cmdk). En móvil se abre como hoja inferior. Muestra solo los modelos que el servidor tiene configurados, sin precios ni velocidades inventadas.
- **Compositor**: textarea que crece hasta 8 líneas, brillo superior sutil, interruptor «Preguntar antes» propio.
- **Pantalla vacía**: Ж de fondo con contraste muy bajo, un título y cuatro sugerencias.
- **Convertir en proyecto**: tres pasos numerados (Destino, Qué trasladar, Brief) dentro del mismo diálogo.
- **PDF Studio y Cinema Studio** (portadas): misma familia de títulos, listas y estados vacíos. Las herramientas internas no cambian (eso es la Etapa 2 y la Etapa 3).
- **Textos eliminados**: «Costo estimado: no disponible», «Créditos no informados», «No se recibió texto», la nota de historial debajo del compositor y la línea de atajo de teclado.

### Cambios de comportamiento (pequeños, a propósito)

- **Enter envía** en computadora; **Shift+Enter** agrega una línea. En el celular, Enter agrega una línea y se envía con el botón. Antes era Ctrl/⌘+Enter (sigue funcionando).
- **Reintentar y Regenerar** ya no piden confirmación salvo que «Preguntar antes» esté activado. Antes la pedían siempre.
- **«Preguntar antes»** queda recordado en este navegador.
- **Detener** conserva lo que llegó, sin mostrar error.
- **Regenerar con otro modelo**: desde el menú «⋯» de la última respuesta.
- **Borrar un chat** muestra una notificación con «Deshacer» durante 8 segundos, igual que antes.
- **Se borró `template-gallery.tsx`**: no lo usaba ninguna pantalla.

### Requiere backend (no se hizo en esta etapa)

- Historial sincronizado entre dispositivos y personas: hoy vive en el navegador (`localStorage`).
- Saldo real de Kie: no existe un endpoint documentado. Solo se muestra la suma de créditos que Kie informó.
- Descripciones, precios o velocidad de los modelos: `/api/personal-chat` devuelve nombre y proveedor, nada más.

## Bibliotecas nuevas

| Paquete | Para qué |
|---|---|
| `@radix-ui/react-popover`, `react-dropdown-menu`, `react-tooltip`, `react-switch`, `react-alert-dialog` | Menús, popovers, tooltips, interruptor y confirmaciones accesibles |
| `cmdk` | Búsqueda y teclado dentro del selector de modelos |
| `sonner` | Notificaciones (por ejemplo «Chat borrado · Deshacer») |
| `react-textarea-autosize` | Caja de texto que crece sola |

Se quitó `lenis`, que no se usaba.

## Archivos

- **Nuevos**:
  - `src/app/fonts.ts`
  - `src/app/fonts/*`
  - `src/app/icon.svg`
  - `public/brand/russian-code-wordmark.svg`
  - `src/styles/system.css`
  - `src/styles/shell.css`
  - `src/store/shell.ts`
  - `src/components/ui/{dialog,menu,tooltip,switch,toaster}.tsx`
  - `src/components/studio/chat-model-picker.tsx`
- **Reescritos**:
  - `src/styles/tokens.css`
  - `src/styles/chat.css`
  - `src/components/workspace.tsx`
  - `src/components/studio/{sidebar,personal-chat,chat-dialogs,convert-chat,message-markdown,brand}.tsx`
- **Retocados**:
  - `src/app/layout.tsx`
  - `src/app/globals.css`
  - `src/app/login/page.tsx` (solo el logo)
  - `src/components/creative-landing.tsx` (solo el nombre y el logo)
  - `src/components/providers.tsx`
  - `src/lib/personal-chat/state.ts` (dos campos opcionales en el mensaje: `error` y `stopped`)
  - `tailwind.config.ts`

## Verificación hecha

- `npm run typecheck`, `npm test` (47/47) y `next build` sin errores.
- Prueba en navegador con datos simulados y sin llamar a Kie, a 390, 768, 1024 y 1280 px:
  - Sin scroll horizontal, sin superposición del compositor y sin cortes abajo.
  - Comprobados el error único, la búsqueda + Enter en el selector, Escape con devolución del foco, «Preguntar antes» con cancelación que conserva el borrador, y borrar + deshacer.
  - axe (WCAG 2.1 AA): 0 problemas en el Chat vacío y con conversación.

## Qué probar (sin saber programar)

Abrí la vista previa de Vercel de esta rama e iniciá sesión.

1. **Marca**: la pestaña del navegador muestra la Ж. Arriba a la izquierda dice «Russian Code».
2. **Escribir**: escribí en ruso y en español con «ё», «ñ», «¿» y «¡». Enter envía; Shift+Enter baja de línea.
3. **Respuesta larga**: pedí una tabla y un ejemplo de código. Los números de las listas, la tabla y el botón «Copiar» del código tienen que verse bien.
4. **Detener**: durante una respuesta, tocá el cuadrado. Lo escrito queda y no aparece ningún error.
5. **Error**: cortá el wifi a mitad de una respuesta. Tiene que aparecer **un solo** aviso, «No pude terminar esta respuesta», con «Reintentar».
6. **Modelos**: abrí el selector, escribí «flash», Enter. Abrilo otra vez y apretá Escape: se cierra.
7. **Preguntar antes**: activalo, escribí algo y enviá. Aparece una confirmación. Si cancelás, el texto sigue ahí.
8. **Historial**: renombrá un chat desde «⋯». Borralo y tocá «Deshacer» enseguida: vuelve.
9. **Convertir en proyecto**: probalo hacia PDF Studio. El chat original tiene que seguir en el historial.
10. **Celular**:
    - Abrí el menú ☰.
    - Escribí con el teclado abierto: el cuadro de texto no tapa el último mensaje.
    - El selector de modelos sube desde abajo.
    - Nada queda cortado al pie.
11. **Teclado**: en computadora, apretá Tab varias veces. Siempre se ve un contorno lima en el elemento activo.
12. **Movimiento reducido**: activá «Reducir movimiento» en el sistema. Las animaciones desaparecen.

## Si algo no te gusta

Todo está en un solo commit en la rama `claude/lucid-allen-2e87pn`. No se tocó la rama principal. El favicon anterior (`src/app/icon.png`) puede recuperarse del historial de git si preferís conservarlo.
