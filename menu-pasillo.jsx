/* Menú Pasillo — composición continua (usa animations-v3) + modo interactivo */
const {CompositionStage, useComposition, Shot} = window;
const Easing = window.Easing || {
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => 1 + Math.pow(t - 1, 3),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOutBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
const clamp = window.clamp || ((v, a, b) => Math.min(b, Math.max(a, v)));
const {useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakColor} = window;

const W = 1920, H = 1080;
const BG = 'uploads/pasted-1787525265126-0.png';
const NAVY = '#050d16', INK = '#eaf6ff';
const DIM = 'rgba(206,232,252,0.62)', FAINT = 'rgba(206,232,252,0.26)';
const FONT = "'Outfit','Helvetica Neue',sans-serif";
const ITEM_X = 150, ITEM_Y0 = 486, STEP = 74;
const MENUS = [
  {id:'sobre', label:'Sobre mí', num:'01', cue:'Sobre mi'},
  {id:'portafolio', label:'Portafolio', num:'02', cue:'Portafolio'},
  {id:'experiencia', label:'Experiencia', num:'03', cue:'Experiencia'},
  {id:'blog', label:'Blog', num:'04', cue:'Blog'},
  {id:'contacto', label:'Contacto', num:'05', cue:'Contacto'},
];
const SEL = 0.9, WEND = 3.1, EXIT_PAD = 1.25;

function tri(t, a, p, b){ if (!(t > a && t < b)) return 0; return t < p ? (t - a) / (p - a) : 1 - (t - p) / (b - p); }
const MOTION = {
  enter: (t, s, d = 0.8) => { const p = Easing.easeOutCubic(clamp((t - s) / d, 0, 1)); return {opacity: p, transform: `translateY(${(1 - p) * 26}px)`}; },
  draw: (t, s, d = 1) => Easing.easeInOutQuad(clamp((t - s) / d, 0, 1)),
  pop: (t, s, d = 0.5) => Easing.easeOutBack(clamp((t - s) / d, 0, 1)),
};

const AC = {
  ctx: null,
  ensure(){ if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } return this.ctx; },
  blip(f, d, g){ const c = this.ensure(); if (!c || c.state === 'suspended') return;
    const o = c.createOscillator(), v = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    v.gain.setValueAtTime(g, c.currentTime);
    v.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d);
    o.connect(v); v.connect(c.destination); o.start(); o.stop(c.currentTime + d); }
};

const CORR = {w:1400, h:1100, depth:5200, wallX:700, floorY:550};
const DOORS = MENUS.map((m, i) => ({...m, side: i % 2 === 0 ? -1 : 1, z: 750 + i * 850}));

function flashPulse(t, peak, rise, fall){
  if (t <= peak - rise || t >= peak + fall) return 0;
  return t < peak ? Easing.easeOutQuad((t - (peak - rise)) / rise) : 1 - Easing.easeInOutQuad((t - peak) / fall);
}

function camera(T, sections, total){
  const idleZ = 70 * Math.sin(2 * Math.PI * T / Math.max(total, 1));
  let camZ = idleZ, yaw = 0, bob = 0, roll = 0, flash = 0, cover = 0, active = -1, walkP = 0;
  for (let i = 0; i < sections.length; i++){
    const s = sections[i], t = T - s.start;
    if (t < 0 || t >= s.dur) continue;
    active = i;
    const EX = s.dur - EXIT_PAD, door = DOORS[i], target = door.z - 380;
    if (t < WEND){
      walkP = clamp((t - SEL) / (WEND - SEL), 0, 1);
      const p = Easing.easeInOutSine(walkP);
      camZ = idleZ * (1 - walkP) + p * target;
      const env = Math.sin(Math.PI * walkP);
      bob = Math.sin(t * 6.4) * 8 * env;
      roll = Math.sin(t * 3.2) * 0.35 * env;
      yaw = -door.side * (8 * walkP + 50 * Easing.easeInOutSine(clamp((walkP - 0.55) / 0.45, 0, 1)));
    } else if (t < EX){ cover = 1; camZ = target; yaw = -door.side * 58; }
    else {
      const q = Easing.easeInOutSine(clamp((t - EX) / EXIT_PAD, 0, 1));
      camZ = target * (1 - q);
      yaw = -door.side * 58 * (1 - Easing.easeOutCubic(clamp((t - EX) / (EXIT_PAD * 0.45), 0, 1)));
      const env = Math.sin(Math.PI * q);
      bob = Math.sin(t * 6.4) * 6 * env;
      roll = Math.sin(t * 3.2) * 0.25 * env;
    }
    flash = Math.max(flashPulse(t, WEND, 0.22, 0.55), flashPulse(t, EX, 0.3, 0.5));
    break;
  }
  return {camZ, yaw, bob, roll, flash, cover, active, walkP};
}

function cursorState(T, sections, cam, outO){
  const introPos = {x: ITEM_X + 40, y: ITEM_Y0 + 5 * STEP + 110};
  const item = (i) => ({x: ITEM_X - 40, y: ITEM_Y0 + i * STEP + 16});
  let pos = introPos, o = 0, click = 0, dip = 0;
  const first = sections[0];
  if (first && isFinite(first.start)){
    o = MOTION.draw(T, first.start - 1.4, 0.8);
    if (T >= first.start + first.dur) pos = item(sections.length - 1);
  }
  for (let i = 0; i < sections.length; i++){
    const s = sections[i], t = T - s.start;
    if (t < 0 || t >= s.dur) continue;
    const from = i === 0 ? introPos : item(i - 1), to = item(i);
    const p = Easing.easeInOutQuad(clamp((t - 0.08) / 0.6, 0, 1));
    pos = {x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * 18};
    click = clamp((t - 0.72) / 0.5, 0, 1); if (t < 0.72) click = 0;
    dip = tri(t, 0.6, 0.72, 0.98);
    o = 1;
    break;
  }
  return {x: pos.x, y: pos.y, o: o * (1 - cam.cover) * outO, click, dip};
}

const CHECK = (a, b, s) => ({backgroundImage:`repeating-conic-gradient(${a} 0% 25%, ${b} 0% 50%)`, backgroundSize:`${s}px ${s}px`});

function Plane({w, h, t, style, children}){
  return <div style={{position:'absolute', left:0, top:0, width:w, height:h, transform:t, transformOrigin:'0 0', ...style}}>{children}</div>;
}

function Door({d, x, glow, acento, soft, vis}){
  const tr = soft ? 'opacity 0.6s ease' : undefined;
  return (
    <div style={{position:'absolute', left:x, top:CORR.h - 680, width:340, height:680}}>
      <div style={{position:'absolute', left:0, right:0, top:-74, textAlign:'center', fontSize:26, fontWeight:500,
        letterSpacing:'0.35em', color:'rgba(206,232,252,0.5)', opacity:vis, transition:tr}}>{d.num}</div>
      <div style={{position:'absolute', inset:0, background:'#061321', border:'2px solid rgba(140,200,255,0.28)',
        boxShadow:'inset 0 0 34px rgba(0,0,0,0.65)'}}>
        <div style={{position:'absolute', left:26, right:26, top:26, bottom:26, border:'1px solid rgba(140,200,255,0.18)'}}/>
        <div style={{position:'absolute', left:0, right:0, bottom:56, textAlign:'center', fontSize:22, fontWeight:300,
          letterSpacing:'0.3em', textTransform:'uppercase', color:'rgba(206,232,252,0.45)', whiteSpace:'nowrap',
          opacity:vis, transition:tr}}>{d.label}</div>
        <div style={{position:'absolute', right:34, top:330, width:10, height:56, background:'rgba(140,200,255,0.3)'}}/>
      </div>
      <div style={{position:'absolute', inset:-2, border:`2px solid ${acento}`, opacity:glow, pointerEvents:'none',
        transition:soft ? 'opacity 1.8s ease' : undefined,
        boxShadow:`0 0 70px ${acento}66, inset 0 0 46px rgba(140,220,255,0.16)`}}/>
    </div>
  );
}

function CorridorPlanes({acento, T, total, live, glowIdx, glowVal, camZ, walkIdx}){
  const {w, h, depth, wallX, floorY} = CORR;
  const wallChk = CHECK('#071624', '#4ea6cf', 260);
  const darkChk = CHECK('#030b14', '#0e2c44', 170);
  const sheenY = live ? 0 : (T / Math.max(total, 1)) * 10400 % 5200;
  const tubes = [0, 1, 2, 3, 4, 5, 6];
  const glowFor = (i) => glowIdx === i ? glowVal : 0;
  // los rótulos se apagan al pasar junto a la puerta (evita glifos gigantes sobre la UI)
  const visFor = (d, i) => {
    if (typeof camZ === 'number') return d.z < camZ + 120 ? 0 : clamp((d.z - camZ - 300) / 380, 0, 1);
    return walkIdx >= 0 && i < walkIdx ? 0 : 1;
  };
  return <>
        {/* piso */}
        <Plane w={w} h={depth} t={`translate3d(${-wallX}px, ${floorY}px, ${-depth}px) rotateX(90deg)`} style={{background:'#04101c', overflow:'hidden'}}>
          <div style={{position:'absolute', left:-2200, top:-2200, width:5800, height:9600, transform:'rotate(45deg)',
            ...CHECK('rgba(70,155,200,0.30)', 'transparent', 380)}}/>
          <div style={{position:'absolute', right:0, width:520, top:0, bottom:0, filter:'blur(3px)',
            background:'repeating-linear-gradient(to bottom, rgba(190,240,255,0.32) 0 260px, rgba(190,240,255,0.04) 260px 330px)'}}/>
          <div style={{position:'absolute', inset:0, background:'repeating-linear-gradient(70deg, transparent 0 340px, rgba(160,225,255,0.15) 340px 560px)'}}/>
          <div style={{position:'absolute', inset:0, background:'linear-gradient(to right, rgba(3,9,16,0.55), transparent 30%, transparent 62%, rgba(120,200,245,0.10))'}}/>
          <div style={{position:'absolute', left:0, width:'100%', height:900, top:-900, willChange:'transform',
            transform:live ? undefined : `translateY(${sheenY}px)`, mixBlendMode:'screen',
            animation:live ? 'om-sheen 13s linear infinite' : undefined,
            background:'linear-gradient(105deg, transparent 42%, rgba(190,235,255,0.4) 50%, transparent 58%)'}}/>
        </Plane>
        {/* techo */}
        <Plane w={w} h={depth} t={`translate3d(${-wallX}px, ${-floorY}px, 0) rotateX(-90deg)`} style={{...darkChk}}>
          {tubes.map(k => (
            <div key={k} style={{position:'absolute', left:w / 2 - 45, top:300 + k * 700, width:90, height:300,
              background:'#cfeeff', boxShadow:'0 0 60px 22px rgba(140,220,255,0.55)',
              opacity:live ? undefined : 0.72 + 0.22 * Math.sin(T * 9 + k * 2.1),
              animation:live ? 'om-tube 3.4s ease-in-out infinite' : undefined,
              animationDelay:live ? `${-k * 0.63}s` : undefined}}/>
          ))}
        </Plane>
        {/* pared izquierda */}
        <Plane w={depth} h={h} t={`translate3d(${-wallX}px, ${-floorY}px, 0) rotateY(90deg)`} style={{...wallChk}}>
          {[1,2,3,4,5,6,7].map(k => (
            <div key={k} style={{position:'absolute', left:k * 660, top:0, bottom:0, width:44,
              background:'linear-gradient(to right, #123952, #2a6a92 45%, #0a2438)', boxShadow:'0 0 26px rgba(0,0,0,0.5)'}}/>
          ))}
          <div style={{position:'absolute', left:0, right:0, bottom:0, height:58, background:'#041019', borderTop:'2px solid rgba(140,200,255,0.22)'}}/>
          {DOORS.filter(d => d.side === -1).map(d => {
            const i = MENUS.findIndex(m => m.id === d.id);
            return <Door key={d.id} d={d} x={d.z - 170} glow={glowFor(i)} acento={acento} soft={live} vis={visFor(d, i)}/>;
          })}
        </Plane>
        {/* pared derecha (ventanas) */}
        <Plane w={depth} h={h} t={`translate3d(${wallX}px, ${-floorY}px, ${-depth}px) rotateY(-90deg)`} style={{...wallChk}}>
          <div style={{position:'absolute', left:0, right:0, top:110, height:590, overflow:'hidden',
            background:'repeating-linear-gradient(to right, rgba(236,250,255,0.97) 0 264px, #0a2033 264px 330px)',
            boxShadow:'0 0 110px rgba(200,240,255,0.4)'}}>
            <div style={{position:'absolute', inset:0, background:'repeating-linear-gradient(to bottom, transparent 0 152px, rgba(10,32,51,0.85) 152px 166px)'}}/>
          </div>
          {[1,2,3,4,5,6,7].map(k => (
            <div key={k} style={{position:'absolute', left:k * 660, top:0, bottom:0, width:44,
              background:'linear-gradient(to right, #9fd4ea, #4e91b8 45%, #16405f)', boxShadow:'0 0 30px rgba(0,0,0,0.45)'}}/>
          ))}
          <div style={{position:'absolute', left:0, right:0, bottom:0, height:58, background:'#041019', borderTop:'2px solid rgba(140,200,255,0.22)'}}/>
          {DOORS.filter(d => d.side === 1).map(d => {
            const i = MENUS.findIndex(m => m.id === d.id);
            return <Door key={d.id} d={d} x={depth - d.z - 170} glow={glowFor(i)} acento={acento} soft={live} vis={visFor(d, i)}/>;
          })}
        </Plane>
        {/* Fondo.

            Llevaba TRES oscurecimientos encima —el damero oscuro, un
            `brightness(0.4)` y un velo negro al 88 %— y eso lo dejaba en negro
            liso. Mirando de frente no se nota, porque encima cae la niebla
            radial de `Corridor` y ahí abajo no hay nada que ver. Pero al entrar
            a una habitación la cámara gira 58° hacia la puerta y esa misma
            niebla SE APAGA (`fogO` baja con el giro, porque su centro ya no es
            el punto de fuga): entonces el fondo queda descubierto, ocupando un
            tercio del cuadro, plano y con canto duro contra la pared iluminada.
            Se lee como un boquete, no como el final de un pasillo. Medido: 19 %
            del cuadro al entrar a Contacto, 10 % en Blog, 9 % en Experiencia.

            El arreglo NO es geometría —hay pasillo de sobra por delante en casi
            todas las puertas— sino dejar de oscurecerlo dos veces: la niebla ya
            hace ese trabajo cuando toca. Con el damero a la vista el ojo lee
            una superficie que se aleja, que es lo que es. El techo usa el mismo
            `darkChk` sin filtro ni velo y siempre se leyó bien. */}
        <Plane w={w} h={h} t={`translate3d(${-wallX}px, ${-floorY}px, ${-depth + 40}px)`}
               style={{...darkChk, filter:'brightness(0.62)'}}>
          <div style={{position:'absolute', inset:0, background:'rgba(3,9,16,0.55)'}}/>
        </Plane>
  </>;
}

function Corridor({cam, T, total, acento, active}){
  const glowVal = cam.cover ? 1 : cam.walkP;
  const fogO = 1 - 0.9 * clamp(Math.abs(cam.yaw) / 58, 0, 1);
  return (
    <div style={{position:'absolute', inset:0, overflow:'hidden', background:NAVY, perspective:'680px', perspectiveOrigin:'50% 42%'}}>
      <div style={{position:'absolute', left:'50%', top:'50%', transformStyle:'preserve-3d', willChange:'transform',
        transform:`translateY(${cam.bob}px) rotateZ(${cam.roll}deg) rotateY(${-cam.yaw}deg) translateZ(${cam.camZ}px)`}}>
        <CorridorPlanes acento={acento} T={T} total={total} glowIdx={active} glowVal={glowVal} camZ={cam.camZ}/>
      </div>
      <div style={{position:'absolute', inset:0, pointerEvents:'none', opacity:fogO,
        background:'radial-gradient(circle 620px at 50% 46%, rgba(4,11,19,0.9) 0%, rgba(4,11,19,0.55) 34%, transparent 68%)'}}/>
      <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(3,10,18,0.2), transparent 30%, rgba(3,10,18,0.3))'}}/>
    </div>
  );
}

function Brand({T, CUES, outO, acento}){
  const a = MOTION.draw(T, 0.4, 1.0);
  const p = MOTION.draw(T, CUES['Sobre mi'] - 1.0, 1.5);
  return (
    <div style={{position:'absolute', left:150, top:236 - 148 * p, opacity:a * outO, zIndex:10, transform:'skewX(-6deg)'}}>
      <div style={{fontSize:84 - 64 * p, fontWeight:200, letterSpacing:(0.16 + 0.14 * p) + 'em', whiteSpace:'nowrap', color:'#f4fcff'}}>
        NIMBRA <span style={{fontWeight:500, color:acento, textShadow:`0 0 38px ${acento}55`}}>ESTUDIO</span>
      </div>
      <div style={{fontSize:15, letterSpacing:'0.45em', color:'rgba(206,232,252,0.58)', marginTop:14, textTransform:'uppercase',
        opacity:clamp(1 - p * 1.6, 0, 1)}}>Estudio de diseño — MMXXVI</div>
    </div>
  );
}

function MenuUI({T, sections, cam, acento, outO}){
  const hdr = MOTION.enter(T, 1.7).opacity * outO;
  const sel = cam.active;
  const rail = MOTION.enter(T, 1.9).opacity * outO;
  return (
    <div style={{position:'absolute', inset:0, zIndex:10}}>
      <div style={{position:'absolute', left:ITEM_X, top:ITEM_Y0 - 66, display:'flex', alignItems:'center', gap:14, width:540,
        opacity:hdr}}>
        <div style={{width:7, height:7, background:acento, transform:'rotate(45deg)', boxShadow:`0 0 16px ${acento}`}}/>
        <span style={{fontSize:12, fontWeight:500, letterSpacing:'0.62em', color:'rgba(206,232,252,0.72)'}}>MENÚ</span>
        <div style={{flex:1, height:1, background:'linear-gradient(90deg, rgba(143,220,255,0.34), rgba(143,220,255,0))'}}/>
      </div>
      <div style={{position:'absolute', left:ITEM_X - 32, top:ITEM_Y0 + 4, width:1, height:4 * STEP + 44, opacity:rail,
        background:'linear-gradient(180deg, rgba(143,220,255,0.04), rgba(143,220,255,0.2) 18%, rgba(143,220,255,0.2) 82%, rgba(143,220,255,0.04))'}}/>
      <div style={{position:'absolute', left:ITEM_X - 35, top:ITEM_Y0 + (sel < 0 ? 0 : sel) * STEP + 20, width:7, height:7,
        background:acento, transform:'rotate(45deg)', boxShadow:`0 0 18px ${acento}`, opacity:(sel < 0 ? 0 : 1) * outO}}/>
      {MENUS.map((m, i) => {
        const s = sections[i];
        let hl = 0;
        if (s && T >= s.start && T < s.start + s.dur) hl = MOTION.draw(T, s.start + 0.4, 0.4);
        const ent = MOTION.enter(T, 2.0 + i * 0.18);
        const lsp = 0.1 + 0.03 * hl + (cam.active === i ? 0.03 * cam.walkP : 0);
        const on = hl > 0.5;
        return (
          <div key={m.id} style={{position:'absolute', left:ITEM_X, top:ITEM_Y0 + i * STEP, height:52,
            display:'flex', alignItems:'center', paddingRight:16,
            opacity:ent.opacity * outO, transform:`${ent.transform} translateX(${hl * 26}px) skewX(-10deg)`}}>
            <div style={{position:'absolute', left:-30, right:-56, top:0, bottom:0, opacity:hl,
              background:'linear-gradient(96deg, #1c8fd6 0%, #1758b4 46%, rgba(12,42,88,0) 100%)',
              boxShadow:`0 0 46px rgba(45,140,225,${0.4 * hl})`}}/>
            <div style={{position:'absolute', left:-30, top:0, bottom:0, width:4, opacity:hl,
              background:'#e6f8ff', boxShadow:'0 0 22px rgba(210,244,255,0.85)'}}/>
            <div style={{position:'relative', display:'flex', alignItems:'baseline', gap:18}}>
              <span style={{fontSize:13, fontWeight:600, letterSpacing:'0.22em', width:28,
                color:on ? 'rgba(242,252,255,0.95)' : 'rgba(143,220,255,0.42)'}}>{m.num}</span>
              <span style={{fontSize:34, fontWeight:on ? 500 : 300, letterSpacing:lsp + 'em', textTransform:'uppercase',
                color:on ? '#ffffff' : '#cbe4f6', whiteSpace:'nowrap'}}>{m.label}</span>
            </div>
          </div>
        );
      })}
      <div style={{position:'absolute', left:ITEM_X, top:ITEM_Y0 + 4 * STEP + 92, display:'flex', alignItems:'center', gap:10,
        opacity:MOTION.enter(T, 2.9).opacity * outO}}>
        {['1', '2', '3', '4', '5'].map(k => (
          <span key={k} style={{width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:12, fontWeight:500, color:'rgba(206,232,252,0.6)', transform:'skewX(-10deg)',
            border:'1px solid rgba(143,220,255,0.22)', background:'rgba(10,28,48,0.5)'}}>{k}</span>
        ))}
        <span style={{fontSize:12, letterSpacing:'0.3em', color:FAINT, textTransform:'uppercase', marginLeft:8}}>o clic para entrar</span>
      </div>
    </div>
  );
}

function Cursor({st, acento}){
  return (
    <div style={{position:'absolute', left:0, top:0, zIndex:40, pointerEvents:'none', opacity:st.o,
      transform:`translate(${st.x}px, ${st.y}px)`}}>
      <div style={{width:14, height:14, border:`2px solid ${acento}`, transform:`rotate(45deg) scale(${1 - 0.28 * st.dip})`,
        boxShadow:`0 0 16px ${acento}66`}}/>
      {st.click > 0 && st.click < 1 && (
        <div style={{position:'absolute', left:-11, top:-11, width:40, height:40, border:`1.5px solid ${acento}`,
          borderRadius:'50%', opacity:1 - st.click, transform:`scale(${0.4 + st.click * 1.4})`}}/>
      )}
    </div>
  );
}

function Face({w, h, t, bg, style, children}){
  return <div style={{position:'absolute', left:0, top:0, width:w, height:h, transform:t, transformOrigin:'0 0', background:bg, ...style}}>{children}</div>;
}

function Box3({x, z, w, h, d, ry}){
  const y = 650 - h;
  return (
    <div style={{position:'absolute', transformStyle:'preserve-3d', transform:`translate3d(${x}px, ${y}px, ${z}px) rotateY(${ry || 0}deg)`}}>
      <div style={{position:'absolute', width:w, height:h, transform:`translateZ(${d}px)`, background:'#153252', boxShadow:'inset 0 -20px 40px rgba(0,0,0,0.35)'}}/>
      <div style={{position:'absolute', width:w, height:d, transformOrigin:'0 0', transform:`translateZ(${d}px) rotateX(-90deg)`, background:'#2a5a88'}}/>
      <div style={{position:'absolute', width:d, height:h, transformOrigin:'0 0', transform:`translate3d(${w}px, 0, ${d}px) rotateY(90deg)`, background:'#102743'}}/>
      <div style={{position:'absolute', width:d, height:h, transformOrigin:'0 0', transform:'rotateY(90deg)', background:'#102743'}}/>
    </div>
  );
}

function Ventana({cx, moon, acento}){
  return (
    <div style={{position:'absolute', left:cx - 330, top:140, width:660, height:820,
      border:'3px solid rgba(140,200,255,0.4)', background:'linear-gradient(to bottom, #0c2138, #071322)', overflow:'hidden'}}>
      {moon && <div style={{position:'absolute', left:120, top:100, width:340, height:340, borderRadius:'50%',
        background:'radial-gradient(circle, #f0f9ff 0%, #c3e6fb 52%, rgba(160,215,250,0.25) 78%, transparent 100%)',
        boxShadow:'0 0 140px 50px rgba(170,225,255,0.35)'}}/>}
      <div style={{position:'absolute', inset:0, background:'repeating-linear-gradient(to right, transparent 0 152px, rgba(6,16,28,0.92) 152px 168px)'}}/>
      <div style={{position:'absolute', inset:0, background:'repeating-linear-gradient(to bottom, transparent 0 190px, rgba(6,16,28,0.92) 190px 206px)'}}/>
    </div>
  );
}

function Marco({x, y, w, h}){
  return <div style={{position:'absolute', left:x, top:y, width:w, height:h, border:'3px solid rgba(140,200,255,0.32)',
    background:'linear-gradient(135deg, #0b2036, #071322)', boxShadow:'0 0 40px rgba(0,0,0,0.5)'}}/>;
}

function BackDecor({v, acento}){
  if (v === 1) return <Ventana cx={1300} moon acento={acento}/>;
  if (v === 2) return <>{[0, 1, 2].map(k => <Marco key={k} x={760 + k * 400} y={260} w={320} h={240}/>)}</>;
  if (v === 3) return <>
    <Marco x={820} y={180} w={300} h={700}/>
    <Marco x={1480} y={180} w={300} h={700}/>
    {[0, 1, 2].map(k => <div key={k} style={{position:'absolute', left:836, top:330 + k * 170, width:268, height:4, background:'rgba(140,200,255,0.22)'}}/>)}
    {[0, 1, 2].map(k => <div key={k} style={{position:'absolute', left:1496, top:330 + k * 170, width:268, height:4, background:'rgba(140,200,255,0.22)'}}/>)}
  </>;
  if (v === 4) return <><Marco x={880} y={240} w={420} h={300}/><Marco x={1400} y={300} w={260} h={190}/></>;
  return <>
    <Ventana cx={1300} moon acento={acento}/>
    <div style={{position:'absolute', left:880, top:100, width:110, height:900, background:'linear-gradient(to right, #050f1b, #0a1e33)', borderRadius:'0 0 30px 30px'}}/>
    <div style={{position:'absolute', left:1620, top:100, width:110, height:900, background:'linear-gradient(to left, #050f1b, #0a1e33)', borderRadius:'0 0 30px 30px'}}/>
  </>;
}

function Room3D({rt, v, acento, live}){
  const drift = Math.min(rt, 10);
  const push = live ? 90 : 60 * Easing.easeOutCubic(clamp(rt / 2.5, 0, 1)) + drift * 6;
  const camT = live ? `translateZ(${push}px)` : `rotateY(${Math.sin(rt * 0.35) * 2.2}deg) translateZ(${push}px) translateY(${Math.sin(rt * 0.8) * 3}px)`;
  const wallBg = 'linear-gradient(to bottom, #12304e 0%, #1a4569 58%, #0f2842 100%)';
  const panel = 'repeating-linear-gradient(to right, rgba(150,210,255,0.08) 0 6px, transparent 6px 240px)';
  const sideBg = 'linear-gradient(to bottom, #102941, #1a405e 60%, #0c2136)';
  return (
    <div style={{position:'absolute', inset:0, perspective:'900px', perspectiveOrigin:'50% 44%', overflow:'hidden', background:NAVY}}>
      <div style={{position:'absolute', left:'50%', top:'50%', transformStyle:'preserve-3d', willChange:'transform', transform:camT}}>
        <div style={{position:'absolute', left:0, top:0, transformStyle:'preserve-3d',
          animation:live ? 'om-room-drift 18s ease-in-out infinite' : undefined}}>
        <Face w={2600} h={1300} t={'translate3d(-1300px, -650px, -1500px)'} bg={wallBg}>
          <div style={{position:'absolute', inset:0, background:panel}}/>
          <BackDecor v={v} acento={acento}/>
          <div style={{position:'absolute', left:0, right:0, bottom:0, height:54, background:'#040d17', borderTop:'2px solid rgba(140,200,255,0.18)'}}/>
        </Face>
        <Face w={1500} h={1300} t={'translate3d(-1300px, -650px, 0) rotateY(90deg)'} bg={sideBg}>
          <div style={{position:'absolute', inset:0, ...CHECK('rgba(90,170,215,0.16)', 'transparent', 240)}}/>
        </Face>
        <Face w={1500} h={1300} t={'translate3d(1300px, -650px, -1500px) rotateY(-90deg)'} bg={sideBg}>
          <div style={{position:'absolute', inset:0, ...CHECK('rgba(90,170,215,0.16)', 'transparent', 240)}}/>
        </Face>
        <Face w={2600} h={1500} t={'translate3d(-1300px, 650px, -1500px) rotateX(90deg)'} bg={'#0c2136'}>
          <div style={{position:'absolute', left:-1400, top:-1400, width:5400, height:4300, transform:'rotate(45deg)',
            ...CHECK('rgba(90,180,230,0.28)', 'transparent', 300)}}/>
          <div style={{position:'absolute', left:600, top:80, width:1400, height:900,
            background:'radial-gradient(ellipse, rgba(170,225,255,0.35), transparent 70%)'}}/>
        </Face>
        <Face w={2600} h={1500} t={'translate3d(-1300px, -650px, 0) rotateX(-90deg)'} bg={'#0d1f36'}>
          <div style={{position:'absolute', left:1210, top:520, width:180, height:460, background:'#e6f7ff',
            boxShadow:'0 0 180px 90px rgba(160,230,255,0.55)'}}/>
        </Face>
        <Box3 x={-820} z={-1240} w={680} h={200} d={260}/>
        <Box3 x={-820} z={-1330} w={680} h={340} d={100}/>
        <Box3 x={-300} z={-870} w={460} h={110} d={220}/>
        <Box3 x={480} z={-1100} w={300} h={190} d={240} ry={-14}/>
        <Box3 x={500} z={-1190} w={300} h={300} d={90} ry={-14}/>
        <Box3 x={900} z={-1260} w={120} h={150} d={120}/>
        <Box3 x={945} z={-1250} w={26} h={430} d={26}/>
        </div>
      </div>
      <div style={{position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 28%, rgba(130,205,255,0.16), transparent 62%)'}}/>
      <div style={{position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(2,8,14,0.32))'}}/>
    </div>
  );
}

function RoomShell({num, title, rt, rd, acento, live, children}){
  const ent = Easing.easeOutCubic(clamp(rt / 0.8, 0, 1));
  const pull = rd ? Easing.easeInQuad(clamp((rt - (rd - 0.55)) / 0.55, 0, 1)) : 0;
  const scale = (1.10 - 0.10 * ent) * (1 + Math.min(rt, 10) * 0.004) * (1 - 0.05 * pull);
  const cap = MOTION.enter(rt, 0.12);
  const inner = live
    ? {animation:'om-room-in 1s cubic-bezier(0.22,1,0.36,1) both'}
    : {transform:`scale(${scale})`};
  return (
    <div style={{position:'absolute', inset:0, background:NAVY, overflow:'hidden', zIndex:20}}>
      <div style={{position:'absolute', inset:0, transformOrigin:'50% 50%', ...inner}}>
        <Room3D rt={rt} v={parseInt(num, 10)} acento={acento} live={live}/>
        <div style={{position:'absolute', left:150, top:130, ...cap}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{width:8, height:8, background:acento, transform:'rotate(45deg)'}}/>
            <span style={{fontSize:13, fontWeight:500, letterSpacing:'0.5em', color:DIM}}>HABITACIÓN {num}</span>
          </div>
          <div style={{fontSize:92, fontWeight:200, letterSpacing:'0.06em', marginTop:16, transform:'skewX(-6deg)',
            textShadow:'0 4px 40px rgba(2,8,14,0.9)'}}>{title}</div>
          <div style={{height:2, width:220 * MOTION.draw(rt, 0.5, 0.8), background:acento, marginTop:22}}/>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({v, l, acento}){
  return (
    <div>
      <div style={{fontSize:40, fontWeight:200, color:INK}}>{v}</div>
      <div style={{fontSize:14, letterSpacing:'0.2em', color:DIM, marginTop:6, textTransform:'uppercase', whiteSpace:'nowrap'}}>{l}</div>
    </div>
  );
}

function RoomSobre({rt, rd, acento, live}){
  return (
    <RoomShell num="01" title="Sobre mí" rt={rt} rd={rd} acento={acento} live={live}>
      <div style={{position:'absolute', left:150, top:490, width:600, ...MOTION.enter(rt, 0.5)}}>
        <p style={{margin:0, fontSize:24, fontWeight:300, lineHeight:1.7, color:DIM, textWrap:'pretty'}}>
          Diseño interfaces que se recorren en vez de leerse: menús, catálogos y kioscos
          donde moverse es parte de entender. Trabajo desde Guadalajara con un equipo de tres.
        </p>
        <div style={{display:'flex', gap:64, marginTop:52}}>
          <Stat v="+8" l="años creando" acento={acento}/>
          <Stat v="31" l="proyectos" acento={acento}/>
          <Stat v="GDL" l="base" acento={acento}/>
        </div>
      </div>
      <div style={{position:'absolute', right:140, top:140, bottom:140, width:620, ...MOTION.enter(rt, 0.35)}}>
        <image-slot id="slot-sobre" shape="rounded" radius="6" placeholder="retrato / ventana con luna"></image-slot>
      </div>
    </RoomShell>
  );
}

function RoomPortafolio({rt, rd, acento, live}){
  const PROY = [
    ['Vestíbulo Norte', 'Kiosco interactivo · 2026'],
    ['Cauce', 'Identidad y web · 2025'],
    ['Feria Lumbre', 'Dirección de arte · 2024'],
  ];
  return (
    <RoomShell num="02" title="Portafolio" rt={rt} rd={rd} acento={acento} live={live}>
      <div style={{position:'absolute', left:150, right:150, top:480, display:'flex', gap:36}}>
        {PROY.map((pr, i) => (
          <div key={i} style={{flex:1, ...MOTION.enter(rt, 0.4 + i * 0.16)}}>
            <div style={{height:300}}>
              <image-slot id={'slot-proyecto-' + (i + 1)} shape="rounded" radius="6" placeholder={'proyecto 0' + (i + 1)}></image-slot>
            </div>
            <div style={{display:'flex', alignItems:'baseline', gap:14, marginTop:20}}>
              <span style={{fontSize:13, fontWeight:500, letterSpacing:'0.2em', color:acento}}>{'0' + (i + 1)}</span>
              <span style={{fontSize:22, fontWeight:300, color:INK, whiteSpace:'nowrap'}}>{pr[0]}</span>
            </div>
            <div style={{fontSize:15, color:DIM, marginTop:6, whiteSpace:'nowrap'}}>{pr[1]}</div>
          </div>
        ))}
      </div>
    </RoomShell>
  );
}

function RoomExperiencia({rt, rd, acento, live}){
  const XP = [
    ['2021 — HOY', 'Dirección de diseño', 'Nimbra Estudio · Guadalajara'],
    ['2019 — 2021', 'Diseño de producto', 'Cardumen Digital · Ciudad de México'],
    ['2018 — 2019', 'Diseño junior', 'Taller Ocre · Guadalajara'],
  ];
  return (
    <RoomShell num="03" title="Experiencia" rt={rt} rd={rd} acento={acento} live={live}>
      <div style={{position:'absolute', left:150, top:470, display:'flex', flexDirection:'column', gap:44}}>
        {XP.map((e, i) => (
          <div key={i} style={{display:'flex', gap:28, ...MOTION.enter(rt, 0.45 + i * 0.18)}}>
            <div style={{width:3, background:acento, opacity:0.7, transformOrigin:'top', transform:`scaleY(${MOTION.draw(rt, 0.5 + i * 0.18, 0.6)})`}}/>
            <div>
              <div style={{fontSize:14, fontWeight:500, letterSpacing:'0.3em', color:acento, whiteSpace:'nowrap'}}>{e[0]}</div>
              <div style={{fontSize:30, fontWeight:300, color:INK, marginTop:6, whiteSpace:'nowrap'}}>{e[1]}</div>
              <div style={{fontSize:17, color:DIM, marginTop:4, whiteSpace:'nowrap'}}>{e[2]}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{position:'absolute', right:140, top:150, bottom:150, width:480, ...MOTION.enter(rt, 0.4)}}>
        <image-slot id="slot-experiencia" shape="rounded" radius="6" placeholder="foto de tu espacio de trabajo"></image-slot>
      </div>
    </RoomShell>
  );
}

function RoomBlog({rt, rd, acento, live}){
  const POSTS = [
    ['AGO 2026', 'Un menú no es una lista, es un lugar'],
    ['JUL 2026', 'Medir el ritmo de una transición'],
    ['JUN 2026', 'Tres semanas dibujando una sola puerta'],
  ];
  return (
    <RoomShell num="04" title="Blog" rt={rt} rd={rd} acento={acento} live={live}>
      <div style={{position:'absolute', left:150, top:480, width:900, display:'flex', flexDirection:'column'}}>
        {POSTS.map((p, i) => (
          <div key={i} style={{padding:'26px 0', borderBottom:`1px solid ${FAINT}`, display:'flex', alignItems:'baseline', gap:40,
            ...MOTION.enter(rt, 0.45 + i * 0.16)}}>
            <span style={{fontSize:14, fontWeight:500, letterSpacing:'0.25em', color:acento, width:110}}>{p[0]}</span>
            <span style={{fontSize:30, fontWeight:300, color:INK, whiteSpace:'nowrap'}}>{p[1]}</span>
          </div>
        ))}
      </div>
      <div style={{position:'absolute', right:140, top:460, width:440, height:300, ...MOTION.enter(rt, 0.4)}}>
        <image-slot id="slot-blog" shape="rounded" radius="6" placeholder="imagen de la nota destacada"></image-slot>
      </div>
    </RoomShell>
  );
}

function RoomContacto({rt, rd, acento, live}){
  return (
    <RoomShell num="05" title="Contacto" rt={rt} rd={rd} acento={acento} live={live}>
      <div style={{position:'absolute', left:0, right:0, top:400, bottom:0, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', gap:34}}>
        <div style={{width:150, height:150, ...MOTION.enter(rt, 0.35)}}>
          <image-slot id="slot-contacto" shape="circle" placeholder="tu avatar"></image-slot>
        </div>
        {/* Dominio `.example`, reservado por la RFC 2606 para muestras: nadie puede
            registrarlo, así que este correo no le cae a una persona de verdad. */}
        <div style={{fontSize:72, fontWeight:200, letterSpacing:'0.04em', ...MOTION.enter(rt, 0.5)}}>hola@nimbra.example</div>
        <div style={{display:'flex', gap:44, fontSize:16, letterSpacing:'0.3em', color:DIM, textTransform:'uppercase',
          ...MOTION.enter(rt, 0.68)}}>
          <span>GitHub</span><span style={{color:acento}}>·</span><span>LinkedIn</span><span style={{color:acento}}>·</span><span>Instagram</span>
        </div>
      </div>
    </RoomShell>
  );
}

const ROOMS = [RoomSobre, RoomPortafolio, RoomExperiencia, RoomBlog, RoomContacto];

function Piece({acento, sonido}){
  const {T, CUES, time, playing, authoredTotal} = useComposition();
  const sections = MENUS.map((m, i) => {
    const start = CUES[m.cue];
    const end = i < MENUS.length - 1 ? CUES[MENUS[i + 1].cue] : CUES['Cierre'];
    return {...m, start, dur: end - start};
  });
  const cam = camera(T, sections, authoredTotal);
  const outO = 1 - MOTION.draw(T, CUES['Cierre'] + 0.05, 0.8);
  const cur = cursorState(T, sections, cam, outO);

  const prevRef = React.useRef(-1);
  React.useEffect(() => {
    const prev = prevRef.current; prevRef.current = T;
    if (!sonido || !playing || prev < 0 || T < prev || T - prev > 0.5) return;
    sections.forEach(s => {
      if (!isFinite(s.start)) return;
      const ct = s.start + 0.72, ft = s.start + WEND, et = s.start + s.dur - EXIT_PAD;
      if (prev < ct && T >= ct) AC.blip(1200, 0.07, 0.05);
      if (prev < ft && T >= ft) AC.blip(330, 0.5, 0.05);
      if (prev < et && T >= et) AC.blip(240, 0.4, 0.04);
    });
  }, [T]);
  React.useEffect(() => {
    const f = () => { const c = AC.ensure(); if (c && c.resume) c.resume(); };
    window.addEventListener('pointerdown', f);
    return () => window.removeEventListener('pointerdown', f);
  }, []);

  return (
    <div data-screen-label={'t=' + Math.floor(time || 0) + 's'}
      style={{position:'absolute', inset:0, overflow:'hidden', fontFamily:FONT, color:INK, background:NAVY, cursor:'none'}}>
      <Corridor cam={cam} T={T} total={authoredTotal} acento={acento} active={cam.active}/>
      <div style={{position:'absolute', left:0, top:0, bottom:0, width:940, zIndex:9, pointerEvents:'none', opacity:outO,
        background:'linear-gradient(100deg, rgba(3,10,18,0.88) 0%, rgba(4,13,24,0.5) 54%, rgba(4,13,24,0) 100%)'}}/>
      <Brand T={T} CUES={CUES} outO={outO} acento={acento}/>
      <MenuUI T={T} sections={sections} cam={cam} acento={acento} outO={outO}/>
      {sections.map((s, i) => {
        const Room = ROOMS[i];
        if (!isFinite(s.start)) return null;
        const from = s.start + WEND, to = s.start + s.dur - EXIT_PAD;
        const rt = clamp(T - from, 0, to - from);
        return <Shot key={s.id} from={from} to={to}><Room rt={rt} rd={to - from} acento={acento}/></Shot>;
      })}
      <Cursor st={cur} acento={acento}/>
      <div style={{position:'absolute', inset:0, zIndex:50, pointerEvents:'none',
        background:'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(2,8,14,0.42))'}}/>
      <div style={{position:'absolute', inset:0, zIndex:60, pointerEvents:'none', background:'#e8f6ff',
        opacity:Math.pow(cam.flash, 1.1)}}/>
    </div>
  );
}

function MenuPasillo(){
  const [tw, setTweak] = useTweaks(window.TWEAK_DEFAULTS || {motionEditor:true, sonido:false, acento:'#8fdcff'});
  return (
    <div style={{width:'100%', height:'100vh', background:NAVY}}>
      <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={NAVY}>
        <Piece acento={tw.acento || '#8fdcff'} sonido={!!tw.sonido}/>
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Animación"/>
        <TweakToggle label="Motion editor" value={!!tw.motionEditor} onChange={v => setTweak('motionEditor', v)}/>
        <TweakToggle label="Sonido (SFX)" value={!!tw.sonido} onChange={v => setTweak('sonido', v)}/>
        <TweakSection label="Estilo"/>
        <TweakColor label="Acento" value={tw.acento || '#8fdcff'} options={['#8fdcff', '#5aa7ff', '#9ef0e4']}
          onChange={v => setTweak('acento', v)}/>
      </TweaksPanel>
    </div>
  );
}
window.MenuPasillo = MenuPasillo;

/* ================= MODO INTERACTIVO ================= */
const WDUR = 2.2, EXDUR = 1.25, ROOM_LAG = 0.25;

const LiveCorridor = React.memo(function LiveCorridor({acento, glowIdx, glowOn, turned, rig, walkIdx}){
  return (
    <div style={{position:'absolute', inset:0, overflow:'hidden', background:NAVY, perspective:'680px', perspectiveOrigin:'50% 42%'}}>
      <div ref={rig.bob} style={{position:'absolute', left:'50%', top:'50%', transformStyle:'preserve-3d', willChange:'transform'}}>
        <div ref={rig.yaw} style={{position:'absolute', left:0, top:0, transformStyle:'preserve-3d', willChange:'transform'}}>
          <div ref={rig.z} style={{position:'absolute', left:0, top:0, transformStyle:'preserve-3d', willChange:'transform',
            animation:'om-idle-sway 36s ease-in-out infinite'}}>
            <CorridorPlanes acento={acento} live glowIdx={glowIdx} glowVal={glowOn ? 1 : 0} walkIdx={walkIdx}/>
          </div>
        </div>
      </div>
      <div style={{position:'absolute', inset:0, pointerEvents:'none', opacity:turned ? 0.08 : 1, transition:'opacity 1.1s ease',
        background:'radial-gradient(circle 620px at 50% 46%, rgba(4,11,19,0.9) 0%, rgba(4,11,19,0.55) 34%, transparent 68%)'}}/>
      <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(3,10,18,0.2), transparent 30%, rgba(3,10,18,0.3))'}}/>
    </div>
  );
});

function MenuInteractivo(){
  const [tw, setTweak] = useTweaks(window.TWEAK_DEFAULTS || {sonido:true, acento:'#8fdcff'});
  const acento = tw.acento || '#8fdcff';
  const sonido = tw.sonido !== false;
  const [ph, setPh] = React.useState({mode:'idle', idx:-1});
  const [hov, setHov] = React.useState(-1);
  const [scale, setScale] = React.useState(1);
  const rig = React.useRef({bob:React.createRef(), yaw:React.createRef(), z:React.createRef()}).current;
  const curRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const phRef = React.useRef(ph); phRef.current = ph;
  const timers = React.useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);

  React.useEffect(() => {
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      setScale(Math.min(el.clientWidth / W, el.clientHeight / H));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // camara por CSS: transiciones y keyframes, cero trabajo por frame
  React.useEffect(() => {
    const z = rig.z.current, yw = rig.yaw.current, bb = rig.bob.current;
    if (!z || !yw || !bb) return;
    const door = ph.idx >= 0 ? DOORS[ph.idx] : null;
    if (ph.mode === 'walk' && door){
      const m = getComputedStyle(z).transform;
      z.style.animation = 'none'; z.style.transition = 'none';
      z.style.transform = m === 'none' ? 'translateZ(0px)' : m;
      void z.offsetWidth;
      z.style.transition = `transform ${WDUR}s cubic-bezier(0.37,0,0.63,1)`;
      z.style.transform = `translateZ(${door.z - 380}px)`;
      yw.style.transition = `transform 1.05s cubic-bezier(0.45,0,0.55,1) ${WDUR - 1.05}s`;
      yw.style.transform = `rotateY(${door.side * 58}deg)`;
      bb.style.animation = 'om-walk-bob 0.74s ease-in-out 3';
    } else if (ph.mode === 'exit2' && door){
      z.style.transition = `transform ${EXDUR}s cubic-bezier(0.37,0,0.63,1)`;
      z.style.transform = 'translateZ(0px)';
      yw.style.transition = 'transform 0.6s cubic-bezier(0.33,1,0.68,1)';
      yw.style.transform = 'rotateY(0deg)';
      bb.style.animation = 'om-walk-bob 0.64s ease-in-out 2';
    } else if (ph.mode === 'idle'){
      z.style.transition = 'none'; z.style.transform = 'translateZ(0px)';
      z.style.animation = 'om-idle-sway 36s ease-in-out infinite';
      bb.style.animation = 'none';
    }
  }, [ph.mode, ph.idx]);

  // el contenido de la habitacion se revela por CSS (sin reloj en React)

  const go = (i) => {
    if (phRef.current.mode !== 'idle') return;
    if (sonido) AC.blip(1200, 0.07, 0.05);
    setPh({mode:'walk', idx:i});
    later(() => { setPh({mode:'room', idx:i}); if (sonido) AC.blip(330, 0.5, 0.05); }, WDUR * 1000);
  };
  const back = () => {
    if (phRef.current.mode !== 'room') return;
    const i = phRef.current.idx;
    if (sonido) AC.blip(240, 0.4, 0.04);
    setPh({mode:'exit1', idx:i});
    later(() => setPh({mode:'exit2', idx:i}), ROOM_LAG * 1000);
    later(() => setPh({mode:'idle', idx:-1}), (ROOM_LAG + EXDUR) * 1000);
  };

  React.useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') back();
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 5) go(n - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sonido]);

  const sel = ph.idx >= 0 && ph.mode !== 'idle' ? ph.idx : (hov >= 0 && hov < 5 ? hov : -1);
  const inRoom = ph.mode === 'room' || ph.mode === 'exit1';
  const Room = ph.idx >= 0 ? ROOMS[ph.idx] : null;
  const menuOn = ph.mode === 'idle';
  const fkey = ph.mode === 'walk' || ph.mode === 'room' ? 'in' + ph.idx : (ph.mode === 'exit1' || ph.mode === 'exit2' ? 'out' + ph.idx : '');

  return (
    <div ref={wrapRef} style={{width:'100%', height:'100vh', background:NAVY, display:'flex', alignItems:'center',
      justifyContent:'center', overflow:'hidden'}}>
      <div onMouseMove={(e) => {
          const el = curRef.current; if (!el) return;
          const r = e.currentTarget.getBoundingClientRect();
          el.style.transform = `translate(${(e.clientX - r.left) / scale}px, ${(e.clientY - r.top) / scale}px)`;
        }}
        style={{width:W, height:H, position:'relative', overflow:'hidden', flex:'none', transform:`scale(${scale})`,
        fontFamily:FONT, color:INK, background:NAVY, cursor:'none'}}>
        <LiveCorridor acento={acento} glowIdx={ph.idx} glowOn={ph.mode !== 'idle' && ph.mode !== 'exit2'} turned={inRoom} rig={rig}
          walkIdx={ph.mode === 'idle' || ph.mode === 'exit2' ? -1 : ph.idx}/>
        {/* velo de legibilidad */}
        <div style={{position:'absolute', left:0, top:0, bottom:0, width:940, zIndex:9, pointerEvents:'none',
          opacity:menuOn ? 1 : 0, transition:'opacity 1.4s ease',
          background:'linear-gradient(100deg, rgba(3,10,18,0.88) 0%, rgba(4,13,24,0.5) 54%, rgba(4,13,24,0) 100%)'}}/>
        {/* marca */}
        <div style={{position:'absolute', left:150, top:236, zIndex:10, transform:'skewX(-6deg)', pointerEvents:'none',
          opacity:menuOn ? 1 : 0, transition:'opacity 1.4s ease'}}>
          <div style={{fontSize:84, fontWeight:200, letterSpacing:'0.16em', whiteSpace:'nowrap', color:'#f4fcff'}}>
            NIMBRA <span style={{fontWeight:500, color:acento, textShadow:`0 0 38px ${acento}55`}}>ESTUDIO</span>
          </div>
          <div style={{fontSize:15, letterSpacing:'0.45em', color:'rgba(206,232,252,0.58)', marginTop:14, textTransform:'uppercase'}}>Estudio de diseño — MMXXVI</div>
        </div>
        {/* menu clicable */}
        <div style={{position:'absolute', inset:0, zIndex:10, opacity:menuOn ? 1 : 0, transition:'opacity 1.4s ease',
          pointerEvents:menuOn ? 'auto' : 'none'}}>
          <div style={{position:'absolute', left:ITEM_X, top:ITEM_Y0 - 66, display:'flex', alignItems:'center', gap:14, width:540}}>
            <div style={{width:7, height:7, background:acento, transform:'rotate(45deg)', boxShadow:`0 0 16px ${acento}`}}/>
            <span style={{fontSize:12, fontWeight:500, letterSpacing:'0.62em', color:'rgba(206,232,252,0.72)'}}>MENÚ</span>
            <div style={{flex:1, height:1, background:'linear-gradient(90deg, rgba(143,220,255,0.34), rgba(143,220,255,0))'}}/>
          </div>
          <div style={{position:'absolute', left:ITEM_X - 32, top:ITEM_Y0 + 4, width:1, height:4 * STEP + 44,
            background:'linear-gradient(180deg, rgba(143,220,255,0.04), rgba(143,220,255,0.2) 18%, rgba(143,220,255,0.2) 82%, rgba(143,220,255,0.04))'}}/>
          <div style={{position:'absolute', left:ITEM_X - 35, top:ITEM_Y0 + (sel < 0 ? 0 : sel) * STEP + 20, width:7, height:7,
            background:acento, transform:'rotate(45deg)', boxShadow:`0 0 18px ${acento}`,
            opacity:sel < 0 ? 0 : 1, transition:'top 0.34s cubic-bezier(0.22,1,0.36,1), opacity 0.24s ease'}}/>
          {MENUS.map((m, i) => {
            const on = (ph.idx === i && ph.mode !== 'idle') || hov === i;
            return (
              <div key={m.id} onMouseEnter={() => { setHov(i); if (sonido && phRef.current.mode === 'idle') AC.blip(880, 0.04, 0.025); }}
                onMouseLeave={() => setHov(-1)} onClick={() => go(i)}
                style={{position:'absolute', left:ITEM_X, top:ITEM_Y0 + i * STEP, height:52, display:'flex', alignItems:'center',
                  paddingRight:16, transform:`translateX(${on ? 26 : 0}px) skewX(-10deg)`,
                  transition:'transform 0.32s cubic-bezier(0.22,1,0.36,1)'}}>
                <div style={{position:'absolute', left:-30, right:-56, top:0, bottom:0, opacity:on ? 1 : 0,
                  background:'linear-gradient(96deg, #1c8fd6 0%, #1758b4 46%, rgba(12,42,88,0) 100%)',
                  boxShadow:'0 0 46px rgba(45,140,225,0.4)', transition:'opacity 0.24s ease'}}/>
                <div style={{position:'absolute', left:-30, top:0, bottom:0, width:4, opacity:on ? 1 : 0,
                  background:'#e6f8ff', boxShadow:'0 0 22px rgba(210,244,255,0.85)', transition:'opacity 0.24s ease'}}/>
                <div style={{position:'relative', display:'flex', alignItems:'baseline', gap:18}}>
                  <span style={{fontSize:13, fontWeight:600, letterSpacing:'0.22em', width:28,
                    color:on ? 'rgba(242,252,255,0.95)' : 'rgba(143,220,255,0.42)', transition:'color 0.24s ease'}}>{m.num}</span>
                  <span style={{fontSize:34, fontWeight:on ? 500 : 300, letterSpacing:on ? '0.13em' : '0.1em', textTransform:'uppercase',
                    color:on ? '#ffffff' : '#cbe4f6', whiteSpace:'nowrap',
                    transition:'color 0.24s ease, letter-spacing 0.32s cubic-bezier(0.22,1,0.36,1)'}}>{m.label}</span>
                </div>
              </div>
            );
          })}
          <div style={{position:'absolute', left:ITEM_X, top:ITEM_Y0 + 4 * STEP + 92, display:'flex', alignItems:'center', gap:10}}>
            {['1', '2', '3', '4', '5'].map(k => (
              <span key={k} style={{width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:500, color:'rgba(206,232,252,0.6)', transform:'skewX(-10deg)',
                border:'1px solid rgba(143,220,255,0.22)', background:'rgba(10,28,48,0.5)'}}>{k}</span>
            ))}
            <span style={{fontSize:12, letterSpacing:'0.3em', color:FAINT, textTransform:'uppercase', marginLeft:8}}>o clic para entrar</span>
          </div>
        </div>
        {/* habitacion */}
        {inRoom && Room && (
          <>
            <Room rt={999} rd={ph.mode === 'exit1' ? 0.5 : undefined} acento={acento} live/>
            <div onClick={back} onMouseEnter={() => setHov(9)} onMouseLeave={() => setHov(-1)}
              style={{position:'absolute', right:150, top:140, zIndex:30, display:'flex', alignItems:'center', gap:14,
                padding:'12px 22px', transform:'skewX(-10deg)', cursor:'none',
                animation:'om-ui-in 0.6s ease 0.45s both',
                background:hov === 9 ? 'linear-gradient(90deg, #2f86e2, #1c5fb4)' : 'rgba(6,19,33,0.7)',
                border:'1px solid rgba(140,200,255,0.3)', boxShadow:hov === 9 ? '0 0 38px rgba(70,150,235,0.5)' : 'none',
                transition:'background 0.2s'}}>
              <span style={{fontSize:18, color:INK}}>←</span>
              <span style={{fontSize:15, fontWeight:500, letterSpacing:'0.3em', color:INK}}>VOLVER</span>
              <span style={{fontSize:11, letterSpacing:'0.2em', color:DIM, marginLeft:6}}>ESC</span>
            </div>
          </>
        )}
        {/* cursor personalizado (imperativo, sin re-render) */}
        <div ref={curRef} style={{position:'absolute', left:0, top:0, zIndex:40, pointerEvents:'none',
          transform:'translate(-100px, -100px)'}}>
          <div style={{width:14, height:14, border:`2px solid ${acento}`, transform:`rotate(45deg) scale(${hov >= 0 ? 1.3 : 1})`,
            boxShadow:`0 0 16px ${acento}66`, transition:'transform 0.15s'}}/>
        </div>
        <div style={{position:'absolute', inset:0, zIndex:50, pointerEvents:'none',
          background:'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(2,8,14,0.42))'}}/>
        {fkey !== '' && <div key={fkey} style={{position:'absolute', inset:0, zIndex:60, pointerEvents:'none', background:'#e8f6ff',
          opacity:0, animation:fkey[0] === 'i' ? `om-flash-in ${WDUR + 0.55}s linear` : 'om-flash-out 0.75s linear'}}/>}
      </div>
      <TweaksPanel>
        <TweakSection label="Interacción"/>
        <TweakToggle label="Sonido (SFX)" value={sonido} onChange={v => setTweak('sonido', v)}/>
        <TweakSection label="Estilo"/>
        <TweakColor label="Acento" value={acento} options={['#8fdcff', '#5aa7ff', '#9ef0e4']}
          onChange={v => setTweak('acento', v)}/>
      </TweaksPanel>
    </div>
  );
}
window.MenuInteractivo = MenuInteractivo;
