# Menú Pasillo

Portafolio personal que se navega como un menú de videojuego: un pasillo 3D
—construido con CSS, sin WebGL ni imágenes de fondo— con una habitación detrás
de cada opción del menú.

## Correrlo

```bash
npm install
npm start
```

- `http://localhost:4321/` — el sitio compilado
- `http://localhost:4321/Menu%20Interactivo.dc.html` — la página de Claude Design

`npm start` compila y sirve. Por separado: `npm run build` y `npm run serve`.

## Editar el contenido

Todo el texto vive en el bloque `CONTENT` al inicio de `menu-pasillo.jsx`
(nombre, tagline, proyectos, experiencia, notas del blog, correo, redes).
Después de editarlo hay que volver a compilar con `npm run build`.

Justo debajo está el bloque `RITMO`, con las duraciones del modo interactivo en
segundos: cuánto dura la caminata, el giro, la salida, los fundidos y el armado
de la habitación. Toda la coreografía se deriva de esos números, así que subirle
o bajarle al "cine" del sitio es cambiar un valor y recompilar.

Las imágenes tienen dos caminos:

- **En Claude Design** — arrastra una imagen sobre cualquier recuadro; queda
  guardada en `.image-slots.state.json`.
- **En el sitio publicado** — pon la URL de la imagen en el campo `foto`
  (o `avatar`) del bloque `CONTENT`. Mientras esté vacío se dibuja un marco
  con su rótulo, para que la página se vea diseñada y no rota.

## Estructura

| Archivo | Qué es |
| --- | --- |
| `menu-pasillo.jsx` | El proyecto: contenido, pasillo, habitaciones y los dos modos |
| `build.mjs` | Compila el JSX a una página autocontenida en `dist/` |
| `serve.mjs` | Servidor estático para desarrollo |
| `Menu Interactivo.dc.html` | Página de Claude Design — modo interactivo |
| `Menu Pasillo.dc.html` | Página de Claude Design — modo cinemático (loop de 40 s) |
| `animations-v3.jsx`, `tweaks-panel.jsx`, `image-slot.js`, `support.js` | Andamiaje de Claude Design — no editar |

`tweaks-panel.jsx` sólo existe dentro de Claude Design, así que el build inyecta
un `useTweaks` mínimo y deja los controles del panel en nada. Sin ese shim el
componente truena al montar y la página publicada sale en blanco.
| `uploads/` | Capturas de referencia (Persona 3 Reload) y el pasillo original |

El archivo exporta dos componentes que comparten escenario y habitaciones:

- **`MenuInteractivo`** — lo que se publica. Se navega con clic, teclas 1–5 o
  tabulador; `Esc` regresa al pasillo. La cámara corre con transiciones CSS.
- **`MenuPasillo`** — versión cinemática, con la cámara guiada por tiempo sobre
  el motor `animations-v3.jsx`. Sirve para grabar o dejar en loop.

## Publicar

En vivo: **https://danielzam0407.github.io/menu-pasillo/**

Cada build escribe tres salidas:

- `index.html` en la raíz — lo que sirve GitHub Pages. Es copia de
  `dist/index.html`, regenerada en cada build para que lo publicado no se
  quede atrás del código. Es la única salida que va en git.
- `dist/index.html` — el mismo documento completo, para cualquier host estático.
- `dist/artifact.html` — el mismo contenido sin `<html>/<head>/<body>`, para
  publicarlo como Artifact de Claude.

Para actualizar el sitio: `npm run build`, luego commit y push de `index.html`.

Ambos son autocontenidos: React va incrustado y lo único externo es la fuente
Outfit de Google Fonts. `vendor/` cachea React para que el build corra sin red.

Para actualizar el Artifact ya publicado hay que compilar primero y volver a
publicar **la misma URL** — publicar sin ella crea un artifact aparte.
