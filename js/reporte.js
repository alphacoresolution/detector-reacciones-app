// Reporte de la sesion (a partir de los datos guardados): dentro de la app y como archivo para compartir.
import { METRICAS, nivelTexto, DURACION_BASE, ESPERA_MARCA, Sesion } from "./protocolo.js";

// Agrupa las preguntas del Test de Informacion Oculta (misma logica que Sesion.resultadosCit, sobre datos guardados)
function resultadosCit(marcas) { return Sesion.prototype.resultadosCit.call({ marcas }); }

const e = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clase = (i) => i === null || i === undefined ? "" : i >= 78 ? "alta" : i >= 62 ? "media" : "baja";

export const CSS_REPORTE = `
.rep{--r-fondo:#0B0E13;--r-tarjeta:#141922;--r-campo:#1B212C;--r-borde:#252C38;--r-tinta:#E9EDF2;--r-suave:#9AA4B2;--r-acento:#4CC9F0;
--r-ok:#34D399;--r-aviso:#F4B740;--r-alta:#FF5D5D;color:var(--r-tinta);font:15px/1.5 -apple-system,system-ui,"Segoe UI",sans-serif}
.rep h2{font-size:17px;margin:26px 0 8px;font-weight:650}.rep h3{font-size:15px;margin:0 0 6px}
.rep .sub{color:var(--r-suave);font-size:13px;margin:0 0 10px}
.rep .kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}
.rep .kpis div{background:var(--r-tarjeta);border:1px solid var(--r-borde);border-radius:12px;padding:12px 14px;min-width:0}
.rep .kpis span{display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--r-suave)}
.rep .kpis b{font-size:26px;font-weight:650;font-variant-numeric:tabular-nums}
.rep .kpis small{display:block;color:var(--r-suave);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rep .aviso{background:var(--r-tarjeta);border:1px solid var(--r-borde);border-left:4px solid var(--r-acento);border-radius:12px;padding:12px 14px;font-size:14px}
.rep .tarjeta{background:var(--r-tarjeta);border:1px solid var(--r-borde);border-radius:14px;padding:12px 14px;margin:10px 0}
.rep .fila{display:flex;align-items:center;gap:10px}
.rep .nota{font-size:22px;font-weight:700;min-width:54px;text-align:center;border-radius:12px;padding:4px 0;background:var(--r-campo);font-variant-numeric:tabular-nums}
.rep .nota.alta{color:var(--r-alta);background:rgba(255,93,93,.14)}.rep .nota.media{color:var(--r-aviso);background:rgba(244,183,64,.14)}
.rep .nota.baja{color:var(--r-ok);background:rgba(52,211,153,.12)}
.rep .preg{font-weight:600;min-width:0}.rep .nivel{font-size:12px;color:var(--r-suave)}
.rep .tag{display:inline-block;background:var(--r-campo);border-radius:8px;padding:2px 8px;margin:6px 6px 0 0;font-size:12px}
.rep .tag.c{color:#F4B740}.rep .tag.v{color:#A78BFA}
.rep blockquote{margin:8px 0 0;padding:6px 10px;border-left:3px solid #A78BFA;background:var(--r-campo);border-radius:0 8px 8px 0;font-size:14px}
.rep .zs{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;margin-top:8px;font-size:12px;color:var(--r-suave);align-items:center}
.rep .barra{height:6px;background:var(--r-campo);border-radius:3px;position:relative}
.rep .barra i{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--r-aviso)}
.rep .barra i.neg{background:var(--r-acento)}
.rep figure{margin:10px 0;background:var(--r-tarjeta);border:1px solid var(--r-borde);border-radius:12px;padding:8px 10px}
.rep figcaption{font-size:12px;font-weight:600;color:var(--r-suave);margin-bottom:4px}.rep svg{width:100%;height:auto;display:block}
.rep .cit li{display:grid;grid-template-columns:minmax(0,1fr) 90px 34px;gap:8px;align-items:center;margin:4px 0;font-size:14px}
.rep .cit ul{list-style:none;padding:0;margin:8px 0}
.rep .cit .op{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rep table{width:100%;border-collapse:collapse;font-size:13px}.rep td,.rep th{padding:6px 4px;border-bottom:1px solid var(--r-borde);text-align:left}
.rep th{color:var(--r-suave);font-weight:600}.rep td.n{text-align:right;font-variant-numeric:tabular-nums}
`;

function grafica(filas, clave, titulo, unidad, color, datos) {
  const pts = filas.filter(f => f[clave] !== null && f[clave] !== undefined);
  if (pts.length < 8) return "";
  const t = pts.map(p => p.t), v = pts.map(p => p[clave]);
  const orden = [...v].sort((a, b) => a - b);
  let lo = orden[Math.floor(orden.length * 0.02)], hi = orden[Math.floor(orden.length * 0.98)];
  if (hi - lo < 1e-6) hi = lo + 1;
  const W = 640, H = 150, iz = 40, ab = 20;
  const X = (s) => iz + (s - t[0]) / Math.max(t[t.length - 1] - t[0], 1e-6) * (W - iz - 8);
  const Y = (x) => 8 + (1 - (Math.min(Math.max(x, lo), hi) - lo) / (hi - lo)) * (H - ab - 8);
  const linea = pts.map(p => `${X(p.t).toFixed(1)},${Y(p[clave]).toFixed(1)}`).join(" ");
  let marcas = "";
  if (datos.baseInicio !== null && datos.baseInicio !== undefined) {
    const a = X(Math.max(datos.baseInicio, t[0])), b = X(Math.min(datos.baseInicio + DURACION_BASE, t[t.length - 1]));
    if (b > a) marcas += `<rect x="${a}" y="8" width="${b - a}" height="${H - ab - 8}" fill="#4CC9F0" opacity=".08"/>`;
  }
  for (const mk of datos.marcas) if (mk.t >= t[0] && mk.t <= t[t.length - 1])
    marcas += `<line x1="${X(mk.t)}" x2="${X(mk.t)}" y1="8" y2="${H - ab}" stroke="#5F6979" stroke-dasharray="3 3"/><text x="${X(mk.t) + 3}" y="18" font-size="10" fill="#9AA4B2">${mk.n}</text>`;
  return `<figure><figcaption>${e(titulo)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(titulo)}">${marcas}
    <polyline points="${linea}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <text x="2" y="14" font-size="11" fill="#9AA4B2">${hi.toFixed(1)}</text><text x="2" y="${H - ab}" font-size="11" fill="#9AA4B2">${lo.toFixed(1)}</text>
    <text x="2" y="${H - 4}" font-size="11" fill="#9AA4B2">${e(unidad)}</text>
    <text x="${W - 8}" y="${H - 4}" font-size="11" fill="#9AA4B2" text-anchor="end">${Math.round(t[t.length - 1])} s</text></svg></figure>`;
}

function tarjetaPregunta(mk) {
  const ind = mk.indice === null ? "--" : Math.round(mk.indice);
  // solo las senales que se alejaron de verdad del reposo (media desviacion o mas)
  const zs = Object.entries(mk.zs || {}).filter(([, z]) => z !== null && Number.isFinite(z) && Math.abs(z) >= 0.5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
  const barras = zs.map(([k, z]) => {
    const largo = Math.min(Math.abs(z), 3) / 3 * 50;
    const pos = z >= 0 ? `left:50%;width:${largo}%` : `left:${50 - largo}%;width:${largo}%`;
    return `<span>${e(METRICAS[k]?.nombre || k)}</span><div class="barra"><i class="${z < 0 ? "neg" : ""}" style="${pos}"></i></div><span>${z >= 0 ? "+" : ""}${z.toFixed(1)}</span>`;
  }).join("");
  const conducta = (mk.conducta || []).map(c => `<span class="tag c">${e(c)}</span>`).join("");
  const v = mk.verbal;
  const senalesV = (v?.senales || []).filter(s => s !== "No respondió en voz alta");
  const dicho = v ? `<blockquote>${v.texto ? e(v.texto) : "<i>No respondió en voz alta</i>"}</blockquote>${senalesV.map(s => `<span class="tag v">${e(s)}</span>`).join("")}` : "";
  const extra = [mk.acercamiento ? `medida de cerca (iris ${mk.acercamiento.toFixed(1)}× más grande)` : (mk.cerca ? "pensada para medirse de cerca" : null),
    mk.respuesta ? `tocó «${mk.respuesta === "si" ? "Sí" : "No"}» en ${mk.rt.toFixed(2)} s` : null,
    mk.latencia !== null && mk.latencia !== undefined ? `empezó a hablar a los ${mk.latencia.toFixed(1)} s` : null,
    mk.etiqueta ? `marcada como ${mk.etiqueta}` : null, mk.avisoLuz ? "cambió la luz" : null].filter(Boolean).join(" · ");
  return `<div class="tarjeta"><div class="fila"><div class="nota ${clase(mk.indice)}">${ind}</div><div style="min-width:0">
    <div class="preg">#${mk.n} ${e(mk.texto)}</div><div class="nivel">${nivelTexto(mk.indice)}${extra ? " · " + e(extra) : ""}</div></div></div>
    ${barras ? `<div class="zs">${barras}</div>` : ""}${conducta}${dicho}</div>`;
}

export function cuerpoReporte(d) {
  const listas = d.marcas.filter(m => m.indice !== null);
  const altas = listas.filter(m => m.indice >= 78).length;
  const mayor = listas.reduce((a, b) => (!a || b.indice > a.indice ? b : a), null);
  const fecha = new Date(d.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  const citHtml = resultadosCit(listas).map(({ grupo, orden, clave, separacion, rondas }) => {
    const top = orden[0];
    let txt = clave ? (top.opcion === clave.opcion ? "La opción clave tuvo la mayor reacción." : `La mayor reacción fue para «${e(top.opcion)}», no para la opción clave.`)
      : `Mayor reacción: «${e(top.opcion)}».`;
    txt += separacion >= 1 ? " Destaca con claridad sobre las demás." : separacion >= 0.5 ? " Destaca poco sobre la siguiente." : " Casi empatada con las demás: no hay una opción clara.";
    return `<div class="tarjeta cit"><h3>${e(grupo)}</h3><ul>${orden.map(m => `<li><span class="op">${e(m.opcion)}${m.clave ? " (clave)" : ""}${m.rt ? ` · ${m.rt.toFixed(2)} s` : ""}</span>
      <div class="barra"><i style="left:0;width:${Math.round(m.indice)}%;background:#4CC9F0"></i></div><b>${Math.round(m.indice)}</b></li>`).join("")}</ul>
      <div class="sub">${txt} ${rondas > 1 ? `Promedio de ${rondas} rondas. ` : ""}Al azar se acertaría 1 de cada ${orden.length} veces.</div></div>`;
  }).join("");
  const conteo = {};
  for (const ev of d.eventos || []) {
    const enBase = d.baseInicio !== null && ev.t >= d.baseInicio && ev.t <= d.baseInicio + DURACION_BASE;
    const enPreg = d.marcas.some(m => ev.t >= m.t - 0.5 && ev.t <= m.t + ESPERA_MARCA);
    const c = (conteo[ev.texto] ||= [0, 0, 0]);
    c[enBase ? 0 : enPreg ? 1 : 2]++;
  }
  const conducta = Object.entries(conteo).sort((a, b) => (b[1][0] + b[1][1] + b[1][2]) - (a[1][0] + a[1][1] + a[1][2]));
  return `<div class="rep">
    <div class="sub">${e(d.titulo)} · ${e(fecha)}${d.duracion ? ` · ${(d.duracion / 60).toFixed(1)} min` : ""}</div>
    <div class="kpis"><div><span>Preguntas</span><b>${listas.length}</b></div><div><span>Reacción alta</span><b>${altas}</b></div>
      <div><span>Mayor reacción</span><b>${mayor ? Math.round(mayor.indice) : "—"}</b><small>${mayor ? e("#" + mayor.n + " " + mayor.texto) : ""}</small></div>
      <div><span>Conductas</span><b>${(d.eventos || []).length}</b></div></div>
    <div class="aviso"><b>Cómo leer esto.</b> El índice va de 0 a 100 y 50 es «igual que en tu reposo». Mide activación y esfuerzo mental,
      no mentiras: nervios, sorpresa o una pregunta incómoda también lo suben.</div>
    <h2>Preguntas</h2>${d.marcas.length ? d.marcas.map(tarjetaPregunta).join("") : `<div class="sub">No se marcaron preguntas.</div>`}
    ${citHtml ? `<h2>Test de Información Oculta</h2>${citHtml}` : ""}
    ${conducta.length ? `<h2>Conducta observada</h2><div class="tarjeta"><table><tr><th>Conducta</th><th>Reposo</th><th>Preguntas</th><th>Fuera</th></tr>
      ${conducta.map(([k, c]) => `<tr><td>${e(k)}</td><td class="n">${c[0]}</td><td class="n">${c[1]}</td><td class="n">${c[2]}</td></tr>`).join("")}</table></div>` : ""}
    <h2>Señales</h2><div class="sub">La franja azul es la calibración; las líneas punteadas son las preguntas.</div>
    ${grafica(d.filas, "pupila", "Pupila (mm)", "mm", "#4CC9F0", d)}${grafica(d.filas, "pulso", "Pulso estimado por la piel", "lpm", "#FF5D73", d)}
    ${grafica(d.filas, "tono", "Tono de voz", "Hz", "#A78BFA", d)}${grafica(d.filas, "tension", "Tensión facial", "%", "#F4B740", d)}
    ${grafica(d.filas, "respiracion", "Respiración (por los hombros)", "resp/min", "#A78BFA", d)}${grafica(d.filas, "boca", "Movimiento de la boca", "%", "#4CC9F0", d)}
    ${d.baseVerbal?.texto ? `<h2>Lo que dijo en la calibración</h2><blockquote>${e(d.baseVerbal.texto)}</blockquote>` : ""}
  </div>`;
}

export function archivoReporte(d) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte · ${e(d.titulo)}</title><style>body{margin:0;padding:16px;background:#0B0E13}main{max-width:760px;margin:0 auto}
h1{color:#E9EDF2;font:650 22px -apple-system,system-ui,sans-serif;margin:8px 0}${CSS_REPORTE}</style></head>
<body><main><h1>Reporte de reacciones</h1>${cuerpoReporte(d)}</main></body></html>`;
}
