# Estudio — etapa premium 1

## Archivos completos
- `src/styles/design-tokens.css`: fuente única de colores, escala tipográfica, radios principales, sombras y tiempos. Los tokens `palette-*` conservan colores históricos de ilustraciones y pantallas anteriores.
- `src/app/globals.css`: estilos completos; importa los tokens. Sustituir entero, no añadir al anterior.
- `src/components/studio/brand.tsx`: marca de bloques con clase compartida.

## Instalación
1. Descomprimir el ZIP conservando las carpetas.
2. En GitHub, abrir el repositorio RuskiCode y crear una rama llamada `design/premium-stage-1` desde main.
3. Usar Add file → Upload files para subir las carpetas `src` y `docs` del ZIP. Confirmar los cambios en esa rama.
4. Abrir una pull request hacia main. Esperar al despliegue Preview de Vercel.
5. Probar la vista previa antes de integrar la pull request. Al integrarla, Vercel publica automáticamente.
No hay variables nuevas, dependencias ni migraciones. No subir claves ni archivos .env.

## Qué probar
- Acceder con el login actual. En Chat, escribir, enviar, detener y cambiar de conversación.
- El fondo debe ser casi negro, con paneles y tarjetas diferenciados y borde superior tenue.
- Enfocar la caja y escribir: el halo lima se intensifica sin mover el contenido.
- Navegar con Tab y Shift+Tab, abrir un menú y un diálogo: el foco debe verse.
- Renombrar, convertir en proyecto y borrar/deshacer mantienen el comportamiento actual.
- Revisar Chat, PDF Studio, Cinema Studio y el editor anterior en móvil y escritorio.
- Activar reducir movimiento en el sistema: las animaciones deben desaparecer.

## Alcance y verificación
Solo sistema visual. No se incorporan todavía caja adaptativa, catálogo Kie, generación, créditos nuevos ni herramientas de estudio.
Las superficies, texto principal y texto secundario usan valores de alto contraste. La auditoría visual completa de contraste y teclado en todas las pantallas sigue pendiente; no se certifica WCAG global.
No se ejecutan llamadas de pago a Kie. No se modifican autenticación, backend, datos guardados ni variables de entorno.
