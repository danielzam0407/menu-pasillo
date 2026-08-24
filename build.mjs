/* Compila menu-pasillo.jsx a una página autocontenida.
   Salidas:
     dist/index.html    documento completo — para servir en cualquier host
     dist/artifact.html mismo contenido sin <html>/<head>/<body> — para Artifacts
   Uso: npm install && npm run build                                        */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const raiz = dirname(fileURLToPath(import.meta.url));
const p = (...x) => join(raiz, ...x);

const VENDOR = [
  ['react.js', 'https://unpkg.com/react@18.3.1/umd/react.production.min.js'],
  ['react-dom.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js'],
];

// React se descarga una vez y queda cacheado en vendor/, así el build vuelve a
// correr sin red y la página publicada no depende de ningún CDN.
async function vendor(){
  await mkdir(p('vendor'), {recursive: true});
  const out = [];
  for (const [archivo, url] of VENDOR){
    const destino = p('vendor', archivo);
    if (!existsSync(destino)){
      process.stdout.write(`  bajando ${archivo}… `);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`no se pudo bajar ${url}: ${r.status}`);
      await writeFile(destino, await r.text());
      console.log('ok');
    }
    out.push(await readFile(destino, 'utf8'));
  }
  return out.join('\n');
}

const KEYFRAMES = `
@keyframes om-idle-sway { 0%, 50%, 100% { transform: translateZ(0); } 25% { transform: translateZ(70px); } 75% { transform: translateZ(-70px); } }
@keyframes om-walk-bob { 0%, 100% { transform: translateY(0) rotate(0deg); } 30% { transform: translateY(-7px) rotate(0.3deg); } 70% { transform: translateY(3px) rotate(-0.2deg); } }
@keyframes om-tube { 0%, 100% { opacity: 0.72; } 50% { opacity: 0.94; } }
@keyframes om-sheen { from { transform: translateY(0); } to { transform: translateY(6100px); } }
@keyframes om-flash-in { 0%, 72% { opacity: 0; } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes om-flash-out { 0% { opacity: 0; } 33% { opacity: 1; } 100% { opacity: 0; } }
@keyframes om-room-drift { 0%, 100% { transform: rotateY(0deg) translateY(0); } 25% { transform: rotateY(2.2deg) translateY(-3px); } 75% { transform: rotateY(-2.2deg) translateY(3px); } }`;

const CSS = `
:root { color-scheme: dark; }
html, body { margin: 0; padding: 0; background: #050d16; }
body { overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
/* 100dvh evita que la barra del navegador móvil recorte la escena; 100vh queda de respaldo */
#om-root { height: 100vh; height: 100dvh; }
#om-root :focus-visible { outline: 2px solid #8fdcff; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  #om-root *, #om-root *::before { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
}${KEYFRAMES}`;

const BOOT = `
window.TWEAK_DEFAULTS = { sonido: true, acento: '#8fdcff' };
(function(){
  var montar = function(){
    var nodo = document.getElementById('om-root');
    if (!nodo || !window.MenuInteractivo) return;
    ReactDOM.createRoot(nodo).render(React.createElement(window.MenuInteractivo, { height: '100%' }));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();`;

const FUENTE = '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
  + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">\n'
  + '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap" rel="stylesheet">';

const build = async () => {
  console.log('construyendo…');
  const fuente = await readFile(p('menu-pasillo.jsx'), 'utf8');
  const { code } = await esbuild.transform(fuente, {
    loader: 'jsx',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2019',
    minify: true,
  });
  const react = await vendor();

  const cabeza = [
    '<title>Menú Pasillo</title>',
    '<meta name="description" content="Portafolio personal que se navega como un menú de videojuego: un pasillo 3D con una habitación detrás de cada opción.">',
    FUENTE,
    `<style>${CSS}</style>`,
  ].join('\n');
  const cuerpo = [
    '<div id="om-root"></div>',
    `<script>${react}</script>`,
    `<script>${code}</script>`,
    `<script>${BOOT}</script>`,
  ].join('\n');

  await mkdir(p('dist'), {recursive: true});
  // El publicador de Artifacts envuelve el archivo en su propio esqueleto, así
  // que ahí cabeza y cuerpo van planos, sin <head>/<body> propios.
  await writeFile(p('dist', 'artifact.html'), cabeza + '\n' + cuerpo + '\n');
  await writeFile(p('dist', 'index.html'),
    '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + cabeza + '\n</head>\n<body>\n' + cuerpo + '\n</body>\n</html>\n');

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' kB';
  console.log(`  menu-pasillo.jsx -> ${kb(code)} de JS`);
  console.log(`  dist/index.html    (documento completo)`);
  console.log(`  dist/artifact.html (fragmento para Artifacts)`);
};

build().catch((e) => { console.error(e); process.exit(1); });
