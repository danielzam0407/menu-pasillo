/* Exportador de cuadros de una composición de Claude Design, sin dependencias.
 *
 * El motor (`animations-v3.jsx`) expone el mismo contrato que usa el exportador
 * de Claude Design: se le manda `data-om-seek-to-time-frame` con
 * `detail {time, sync, playing}` al elemento marcado con `data-om-sync-seek`, y
 * ese cuadro queda renderizado de forma DETERMINISTA. Nada de grabar en tiempo
 * real: cada cuadro se pide, se espera y se captura, así que no hay saltos.
 *
 * Node 22 trae WebSocket global -> se habla CDP a pelo contra Edge headless.
 *
 *   node exportar.mjs <archivo.html> <salida/> <fps> <segundos> [ancho] [alto]
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, basename, extname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [archivo, salida, fpsTxt, segsTxt, anchoTxt, altoTxt] = process.argv.slice(2);
const FPS = Number(fpsTxt) || 30;
const SEGS = Number(segsTxt) || 5;
const ANCHO = Number(anchoTxt) || 1280;
const ALTO = Number(altoTxt) || 720;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── CDP mínimo ─────────────────────────────────────────────────────────── */
class Cdp {
  constructor(ws) { this.ws = ws; this.n = 0; this.pend = new Map(); this.oyentes = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pend.has(m.id)) {
        const { ok, mal } = this.pend.get(m.id); this.pend.delete(m.id);
        m.error ? mal(new Error(m.error.message)) : ok(m.result);
      } else if (m.method && this.oyentes.has(m.method)) {
        this.oyentes.get(m.method).forEach((f) => f(m.params));
      }
    });
  }
  al(metodo, fn) { if (!this.oyentes.has(metodo)) this.oyentes.set(metodo, []); this.oyentes.get(metodo).push(fn); }
  enviar(method, params = {}, sessionId) {
    const id = ++this.n;
    return new Promise((ok, mal) => {
      this.pend.set(id, { ok, mal });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
}

async function traer(url, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {}
    await dormir(250);
  }
  throw new Error('el navegador no abrió su puerto de depuración');
}

/* ── el trabajo ─────────────────────────────────────────────────────────── */
const perfil = join(tmpdir(), 'nerv-export-' + process.pid);
const puerto = 9000 + (process.pid % 900);

if (!existsSync(EDGE)) { console.error('no encuentro Edge en ' + EDGE); process.exit(1); }
await mkdir(salida, { recursive: true });

/* La composición se sirve por http, no por file://: `support.js` monta los
   `.jsx` con fetch, y desde file:// el navegador los bloquea por origen. El
   servidor vive DENTRO de este proceso y muere con él — no es un servidor de
   desarrollo, es parte del render. */
const RAIZ = dirname(resolve(archivo));
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.jsx':'text/javascript',
                '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json',
                '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
                '.woff2':'font/woff2', '.woff':'font/woff' };
const sitio = createServer(async (req, res) => {
  try {
    const pedido = decodeURIComponent(req.url.split('?')[0]);
    const destino = normalize(join(RAIZ, pedido));
    if (!destino.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
    const cuerpo = await readFile(destino);
    res.writeHead(200, { 'content-type': TIPOS[extname(destino).toLowerCase()] || 'application/octet-stream',
                         'cache-control': 'no-store' });
    res.end(cuerpo);
  } catch (_) { res.writeHead(404).end(); }
});
const puertoSitio = await new Promise((ok) => sitio.listen(0, '127.0.0.1', () => ok(sitio.address().port)));

const navegador = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + puerto,
  '--user-data-dir=' + perfil,           // perfil desechable: no toca el suyo
  '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=' + ANCHO + ',' + ALTO,
  '--disable-gpu-vsync',
  '--allow-file-access-from-files',
  'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  const version = await traer(`http://127.0.0.1:${puerto}/json/version`);
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.addEventListener('open', ok); ws.addEventListener('error', mal); });
  const cdp = new Cdp(ws);

  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.enviar(m, p, sessionId);

  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false,
  });

  const url = `http://127.0.0.1:${puertoSitio}/` + encodeURIComponent(basename(archivo));
  await s('Page.navigate', { url });
  await new Promise((ok) => cdp.al('Page.loadEventFired', ok));

  // Esperar a que el escenario exista y declare que acepta seek síncrono.
  let listo = false;
  for (let i = 0; i < 80 && !listo; i++) {
    const r = await s('Runtime.evaluate', {
      expression: `!!document.querySelector('[data-om-sync-seek]')`, returnByValue: true,
    });
    listo = r.result.value; if (!listo) await dormir(250);
  }
  if (!listo) throw new Error('la composición nunca declaró data-om-sync-seek');

  /* MODO EXPORTACIÓN. El anfitrión de Claude Design marca `<html
     data-om-exporting>` durante la captura, y los componentes se apagan las
     partes que son ANDAMIO y no obra: `image-slot.js` esconde así sus mandos y
     su crédito (busca `:host-context([data-om-exporting])` en ese archivo).
     Sin esto, un `<image-slot>` vacío pinta su hueco punteado con la leyenda
     «foto de tu espacio de trabajo» y el video sale con cara de plantilla a
     medio llenar. Pasó: el primer render de work2 los traía a la vista.
     Los mandos los tapa el componente; el hueco vacío hay que taparlo desde
     aquí, porque vive en su shadow DOM y sólo el elemento entero se alcanza. */
  await s('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.setAttribute('data-om-exporting', '');
      const e = document.createElement('style');
      e.textContent = 'image-slot:not([src]){visibility:hidden !important}';
      document.head.appendChild(e);
      return document.querySelectorAll('image-slot:not([src])').length;
    })()`,
    returnByValue: true,
  }).then((r) => console.log(`modo exportación: ${r.result.value} hueco(s) de imagen vacío(s) ocultos`));

  await dormir(1200);   // fuentes inlineadas + primer layout

  // La caja del escenario, para recortar la captura a la pieza y no a la ventana.
  const caja = (await s('Runtime.evaluate', {
    expression: `(() => { const e = document.querySelector('[data-om-sync-seek]');
      const r = e.getBoundingClientRect();
      return JSON.stringify({x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}); })()`,
    returnByValue: true,
  })).result.value;
  const c = JSON.parse(caja);
  console.log(`escenario ${c.w}x${c.h} en (${c.x},${c.y}) — ${FPS} fps x ${SEGS}s = ${Math.round(FPS*SEGS)} cuadros`);

  const total = Math.round(FPS * SEGS);
  for (let n = 0; n < total; n++) {
    const t = n / FPS;
    await s('Runtime.evaluate', {
      expression: `(() => { const e = document.querySelector('[data-om-sync-seek]');
        e.dispatchEvent(new CustomEvent('data-om-seek-to-time-frame',
          { detail: { time: ${t}, sync: true, playing: false }, bubbles: false }));
        return true; })()`,
      returnByValue: true, awaitPromise: false,
    });
    const tiro = await s('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
      clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 },
    });
    await writeFile(join(salida, String(n).padStart(5, '0') + '.png'), Buffer.from(tiro.data, 'base64'));
    if (n % 30 === 0) process.stdout.write(`  ${n}/${total}\r`);
  }
  console.log(`\nlisto: ${total} cuadros en ${salida}`);
} finally {
  try { ws && ws.close(); } catch (_) {}
  navegador.kill();
  sitio.close();
  await dormir(500);
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}
