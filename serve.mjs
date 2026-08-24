/* Servidor estático mínimo, sin dependencias.
   Sirve la carpeta del proyecto para que funcionen las dos cosas:
     http://localhost:4321/dist/index.html        el sitio compilado
     http://localhost:4321/Menu Interactivo.dc.html   la página de Claude Design
   Uso: npm run serve                                                       */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const puerto = Number(process.env.PORT || 4321);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

createServer(async (req, res) => {
  try {
    let ruta = decodeURIComponent(req.url.split('?')[0]);
    if (ruta === '/') ruta = '/dist/index.html';
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = join(raiz, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
    if ((await stat(archivo)).isDirectory()) throw new Error('es carpeta');
    res.writeHead(200, {
      'content-type': TIPOS[extname(archivo).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(archivo));
  } catch {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('404 — no encontrado');
  }
}).listen(puerto, () => {
  console.log(`  sitio compilado   http://localhost:${puerto}/`);
  console.log(`  página de diseño  http://localhost:${puerto}/Menu%20Interactivo.dc.html`);
});
