// Protocolo: calibracion personal (linea base), preguntas, indice de activacion y Test de Informacion Oculta.
// Misma logica que la version de computadora. Los tiempos son segundos desde que empezo la sesion.
import { Serie, media, desviacion, percentil, mediana } from "./senales.js";
import { analizar as analizarHabla } from "./habla.js";

export const DURACION_BASE = 45;
export const ESPERA_MARCA = 15;

export const METRICAS = {
  pupila:     { nombre: "Pupila", post: [0.5, 4], pre: [-1, 0], agg: "media", peso: 0.28, signo: 1, piso: 0.04 },
  pulso:      { nombre: "Pulso", post: [2, 10], pre: [-3, 0], agg: "media", peso: 0.12, signo: 1, piso: 1.0 },
  tension:    { nombre: "Tensión facial", post: [0, 4], pre: [-2, 0], agg: "p90", peso: 0.12, signo: 1, piso: 1.0 },
  parpadeo:   { nombre: "Parpadeos", post: [0, 6], pre: null, agg: "conteo", peso: 0.08, signo: 0, piso: 0.7 },
  mirada:     { nombre: "Mirada desviada", post: [0, 5], pre: null, agg: "media", peso: 0.03, signo: 1, piso: 0.01 },
  movimiento: { nombre: "Movimiento", post: [0, 5], pre: null, agg: "media", peso: 0.07, signo: 1, piso: 1.0 },
  micro:      { nombre: "Microexpresiones", post: [0, 5], pre: null, agg: "conteo", peso: 0.02, signo: 1, piso: 0.5 },
  toques:     { nombre: "Toques de la cara", post: [0, 8], pre: null, agg: "conteo", peso: 0.02, signo: 1, piso: 0.5 },
  miradas:    { nombre: "Miradas al lado", post: [0, 6], pre: null, agg: "conteo", peso: 0.02, signo: 1, piso: 0.5 },
  tono:       { nombre: "Tono de voz", post: [0, 8], pre: null, agg: "media", peso: 0.10, signo: 1, piso: 4.0 },
  var_tono:   { nombre: "Variación del tono", post: [0, 8], pre: null, agg: "std", peso: 0.04, signo: 0, piso: 2.0 },
  volumen:    { nombre: "Volumen de voz", post: [0, 8], pre: null, agg: "media", peso: 0.04, signo: 0, piso: 1.0 },
  // tiempo hasta tocar Si o No (modo automatico): el indicador con mas respaldo en el Test de Informacion
  // Oculta (d = 1.05, Suchotzki 2017). Se compara con las demas respuestas de la misma sesion.
  rt:         { nombre: "Tiempo de respuesta", post: [0, 0], pre: null, agg: "rt", peso: 0.15, signo: 1, piso: 0.08 },
  // Ritmo del habla (eGeMAPS): con estres suben los arranques de voz por segundo (d = 1.03), cambian las pausas
  arranques:  { nombre: "Ritmo del habla", post: [0, 10], pre: null, agg: "ritmo", peso: 0.08, signo: 1, piso: 0.3 },
  pausa:      { nombre: "Pausas al hablar", post: [0, 10], pre: null, agg: "ritmo", peso: 0.05, signo: 1, piso: 0.15 },
  rango_tono: { nombre: "Rango del tono", post: [0, 10], pre: null, agg: "ritmo", peso: 0.04, signo: 0, piso: 1.0 },
  respiracion: { nombre: "Respiración", post: [0, 12], pre: [-12, 0], agg: "media", peso: 0.06, signo: 0, piso: 1.5 },
  resp_audio: { nombre: "Inhalaciones oídas", post: [0, 10], pre: null, agg: "conteo", peso: 0.03, signo: 1, piso: 0.7 },
  boca:       { nombre: "Movimiento boca", post: [0, 5], pre: null, agg: "media", peso: 0.03, signo: 1, piso: 0.5 },
};
const RAPIDAS = ["pupila", "tension", "mirada", "movimiento", "parpadeo", "micro", "toques", "miradas", "boca"];
const LENTAS = ["pulso", "tono", "volumen", "arranques", "pausa", "rango_tono", "respiracion", "resp_audio"];

export function indiceDesdeZ(zs) {
  let total = 0, peso = 0;
  for (const [k, z] of Object.entries(zs)) {
    if (z === null || z === undefined || !Number.isFinite(z)) continue;
    const m = METRICAS[k];
    const zz = m.signo === 0 ? Math.abs(z) : m.signo * z;
    total += m.peso * Math.max(-3, Math.min(4, zz));
    peso += m.peso;
  }
  return peso ? 100 / (1 + Math.exp(-0.9 * total / peso)) : null;
}
export function nivelTexto(i) {
  if (i === null || i === undefined) return "Sin datos";
  return i < 62 ? "Similar al reposo" : i < 78 ? "Reacción moderada" : "Reacción alta";
}

function mezclar(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Cada grupo del Test de Informacion Oculta se pregunta `rondas` veces con las opciones en orden distinto:
// repetir y mezclar quita el efecto de "la primera opcion sorprende" y promedia el ruido.
// `cerca`: la ultima ronda de cada grupo se hace con el celular acercado (pupila mas grande en la imagen y
// pantalla oscura). Siempre es una ronda completa, para que todas las opciones se midan en las mismas condiciones.
export function expandirPreguntas(datos, rondas = 1, cerca = false) {
  const items = [];
  for (const p of datos.preguntas || []) {
    if (p.opciones) {
      for (let r = 1; r <= rondas; r++) {
        const orden = datos.mezclar === false ? [...p.opciones] : mezclar([...p.opciones]);
        for (const op of orden) items.push({ texto: `${p.grupo}  →  ${op}`, tipo: "cit", grupo: p.grupo, opcion: op, clave: op === p.clave, ronda: r,
          cerca: cerca && r === rondas });
      }
    } else items.push({ texto: p.texto, tipo: p.tipo || "pregunta", grupo: null, opcion: null, clave: false });
  }
  return items;
}

export class Sesion {
  constructor({ titulo = "Sesión", items = [], modo = "Celular" } = {}) {
    this.titulo = titulo; this.modo = modo; this.items = items;
    this.itemActual = items.length ? 0 : null;
    this.fecha = new Date().toISOString();
    this.series = Object.fromEntries(["pupila", "pulso", "tension", "miradaH", "miradaV", "movimiento", "luz", "respiracion", "boca", "rIris"].map(k => [k, new Serie(240)]));
    this.conteos = {};
    this.base = null; this.baseInicio = null;
    this.baseVerbal = null;
    this.marcas = [];
    this.filas = [];            // valores cada 0.25 s para las graficas del reporte
    this.ultimaFila = -1;
    this.voz = null; this.transcriptor = null; this.conducta = null; this.modelo = null;
  }

  registrar(t, v) {
    for (const [k, x] of Object.entries(v)) if (this.series[k] && x !== null && x !== undefined) this.series[k].agregar(x, t);
    if (t - this.ultimaFila >= 0.25) {
      this.ultimaFila = t;
      this.filas.push({ t: Math.round(t * 100) / 100, pupila: v.pupilaMm ?? null, pulso: v.pulso ?? null, tono: v.tono ?? null,
        tension: v.tension ?? null, indice: v.indice ?? null, respiracion: v.respiracion ?? null, boca: v.boca ?? null });
    }
  }

  iniciarBase(t) { this.baseInicio = t; this.base = null; }
  progresoBase(t) { return this.baseInicio === null || this.base ? null : Math.min(1, (t - this.baseInicio) / DURACION_BASE); }

  serieDe(clave) {
    if (clave === "tono" || clave === "var_tono") return this.voz?.f0;
    if (clave === "volumen") return this.voz?.volumen;
    return this.series[clave];
  }

  estadistico(clave, tm, centro) {
    const m = METRICAS[clave], a = tm + m.post[0], b = tm + m.post[1];
    if (m.agg === "rt") return null;      // no depende de una ventana de tiempo: se calcula al evaluar
    if (m.agg === "ritmo") {
      if (!this.voz) return null;
      const r = this.voz.resumenRitmo(a, b);
      if (clave === "arranques") return r.arranquesS;
      if (clave === "pausa") return r.pausas ? r.pausaMedia : (r.segundosVoz > 1.5 ? 0 : null);
      return r.rangoTono;
    }
    if (m.agg === "conteo") { const s = this.conteos[clave]; return s ? s.ventana(a, b)[0].length : null; }
    if (clave === "mirada") {
      if (!centro) return null;
      const [, h] = this.series.miradaH.ventana(a, b), [, v] = this.series.miradaV.ventana(a, b);
      const n = Math.min(h.length, v.length);
      if (n < 5) return null;
      let s = 0;
      for (let i = 0; i < n; i++) s += Math.hypot(h[i] - centro[0], v[i] - centro[1]);
      return s / n;
    }
    const serie = this.serieDe(clave);
    if (!serie) return null;
    const [, v] = serie.ventana(a, b);
    if (v.length < 3) return null;
    let valor = m.agg === "p90" ? percentil(v, 90) : m.agg === "std" ? desviacion(v) : media(v);
    if (m.pre) {
      const [, vp] = serie.ventana(tm + m.pre[0], tm + m.pre[1]);
      if (vp.length < 2) return null;
      valor -= media(vp);
    }
    return valor;
  }

  actualizar(t) {
    if (this.baseInicio !== null && !this.base && t - this.baseInicio >= DURACION_BASE) this.cerrarBase(this.baseInicio, t);
    for (const mk of this.marcas) if (mk.estado === "midiendo" && t - mk.t >= ESPERA_MARCA) this.evaluar(mk);
  }

  cerrarBase(t0, t1) {
    const [, h] = this.series.miradaH.ventana(t0, t1), [, v] = this.series.miradaV.ventana(t0, t1);
    const centro = h.length > 10 && v.length > 10 ? [mediana(h), mediana(v)] : null;
    const [, luz] = this.series.luz.ventana(t0, t1);
    const base = { centroMirada: centro, luz: luz.length ? media(luz) : null, metricas: {}, mediasCrudas: {} };
    for (const k of ["pupila", "pulso"]) { const [, x] = this.series[k].ventana(t0, t1); base.mediasCrudas[k] = x.length ? media(x) : null; }
    const [, ri] = this.series.rIris.ventana(t0, t1);
    base.rIris = ri.length > 10 ? mediana(ri) : null;      // tamano del iris en pixeles a la distancia normal
    for (const [clave, m] of Object.entries(METRICAS)) {
      const valores = [];
      const ini = t0 + Math.max(3, m.pre ? -m.pre[0] : 0), fin = t1 - m.post[1];
      for (let tv = ini; tv < fin; tv += 0.5) { const x = this.estadistico(clave, tv, centro); if (x !== null && Number.isFinite(x)) valores.push(x); }
      if (valores.length >= 6) {
        const med = media(valores);
        base.metricas[clave] = { media: med, desv: Math.max(desviacion(valores), m.piso, m.pre ? 0 : 0.1 * Math.abs(med)) };
      }
    }
    this.base = base;
    // como habla en reposo (palabras por minuto y muletillas), si hubo transcripcion
    if (this.transcriptor) {
      const texto = this.transcriptor.texto(t0, t1 + 2);
      const habla = this.segundosHablados(t0, t1);
      if (texto) {
        const a = analizarHabla(texto, { segundosHabla: habla });
        this.baseVerbal = { ppm: a.ppm, muletillas100: a.muletillas100, dudas100: a.dudas100, texto, latencia: null };
      }
    }
  }

  segundosHablados(t0, t1) {
    if (!this.voz) return null;
    const [, v] = this.voz.voz.ventana(t0, t1);
    return v.reduce((s, x) => s + x, 0) * 0.04;
  }

  zScores(tm) {
    if (!this.base) return {};
    const zs = {};
    for (const [clave, est] of Object.entries(this.base.metricas)) {
      const x = this.estadistico(clave, tm, this.base.centroMirada);
      zs[clave] = x === null || !Number.isFinite(x) ? null : (x - est.media) / est.desv;
    }
    return zs;
  }

  indiceEnVivo(t) {
    if (!this.base) return [null, {}];
    const zs = {};
    const rapidas = this.zScores(t - 4.5), lentas = this.zScores(t - 10.5);
    for (const k of RAPIDAS) if (k in rapidas) zs[k] = rapidas[k];
    for (const k of LENTAS) if (k in lentas) zs[k] = lentas[k];
    return [indiceDesdeZ(zs), zs];
  }

  itemSiguiente() { return this.itemActual !== null && this.itemActual < this.items.length ? this.items[this.itemActual] : null; }

  marcar(t, acercamiento = null) {
    const item = this.itemSiguiente();
    const mk = { n: this.marcas.length + 1, t, texto: item ? item.texto : `Pregunta ${this.marcas.length + 1}`,
      tipo: item ? item.tipo : "pregunta", grupo: item?.grupo || null, opcion: item?.opcion || null, clave: !!item?.clave,
      estado: "midiendo", indice: null, zs: {}, etiqueta: null, latencia: null, conducta: [], verbal: null, avisoLuz: false,
      rt: null, respuesta: null, ronda: item?.ronda || null, cerca: !!item?.cerca, acercamiento: null };
    if (acercamiento) mk.acercamiento = acercamiento;     // cuantas veces mas grande se veia el iris que en reposo
    this.marcas.push(mk);
    return mk;
  }
  siguienteItem() { if (this.itemActual !== null && this.itemActual < this.items.length) this.itemActual++; }
  etiquetarUltima(e) { if (this.marcas.length) this.marcas[this.marcas.length - 1].etiqueta = e; }
  marcaPendiente(t) {
    for (let i = this.marcas.length - 1; i >= 0; i--) if (this.marcas[i].estado === "midiendo") return [this.marcas[i], Math.max(0, ESPERA_MARCA - (t - this.marcas[i].t))];
    return [null, 0];
  }

  responder(respuesta, t) {
    // la respuesta tocada (Si / No) va a la ultima pregunta que aun no tiene respuesta
    const mk = [...this.marcas].reverse().find(m => m.respuesta === null && t - m.t < ESPERA_MARCA);
    if (!mk) return null;
    mk.respuesta = respuesta; mk.rt = t - mk.t;
    return mk;
  }

  zTiempoRespuesta(mk) {
    const otros = this.marcas.filter(m => m !== mk && m.rt !== null).map(m => m.rt);
    if (mk.rt === null || otros.length < 4) return null;
    return (mk.rt - media(otros)) / Math.max(desviacion(otros), METRICAS.rt.piso);
  }

  evaluar(mk) {
    mk.zs = this.zScores(mk.t);
    const zrt = this.zTiempoRespuesta(mk);
    if (zrt !== null) mk.zs.rt = zrt;
    mk.indice = indiceDesdeZ(mk.zs);
    if (this.voz) mk.latencia = this.voz.latencia(mk.t);
    if (this.conducta) mk.conducta = this.conducta.resumen(mk.t - 0.5, mk.t + ESPERA_MARCA);
    if (this.base?.luz) {
      const [, luz] = this.series.luz.ventana(mk.t, mk.t + 5);
      if (luz.length && Math.abs(media(luz) - this.base.luz) / this.base.luz > 0.12) mk.avisoLuz = true;
    }
    if (this.transcriptor && (this.transcriptor.activo || this.transcriptor.frases.length)) {
      const siguiente = this.marcas.find(m => m.t > mk.t);
      const fin = Math.min(mk.t + ESPERA_MARCA, siguiente ? siguiente.t - 0.3 : Infinity);
      const texto = this.transcriptor.texto(mk.t - 0.2, fin + 1.5);
      // latencia en reposo: la de las preguntas neutrales ya respondidas
      const neutras = this.marcas.filter(m => m.tipo === "neutral" && m.latencia !== null && m !== mk).map(m => m.latencia);
      const base = this.baseVerbal ? { ...this.baseVerbal, latencia: neutras.length ? mediana(neutras) : null } : null;
      mk.verbal = analizarHabla(texto, { pregunta: mk.texto, base, latencia: mk.latencia, segundosHabla: this.segundosHablados(mk.t, fin) });
    }
    mk.estado = "lista";
  }

  terminar(t) {
    for (const mk of this.marcas) if (mk.estado === "midiendo") this.evaluar(mk);
    // con la sesion completa, el tiempo de respuesta de cada pregunta se compara con todas las demas
    for (const mk of this.marcas) {
      const z = this.zTiempoRespuesta(mk);
      if (z !== null) { mk.zs.rt = z; mk.indice = indiceDesdeZ(mk.zs); }
    }
    this.duracion = t;
  }

  // Resultado por grupo: el indice de cada opcion promediado entre rondas y comparado con las demas
  // opciones del grupo (z dentro del grupo). Asi la pregunta se evalua contra sus propios controles.
  resultadosCit() {
    const grupos = {};
    for (const mk of this.marcas) if (mk.grupo && mk.indice !== null) (grupos[mk.grupo] ||= []).push(mk);
    return Object.entries(grupos).map(([grupo, mks]) => {
      const porOpcion = {};
      for (const mk of mks) {
        const o = (porOpcion[mk.opcion] ||= { opcion: mk.opcion, clave: mk.clave, valores: [], rts: [] });
        o.valores.push(mk.indice);
        if (mk.rt !== null) o.rts.push(mk.rt);
      }
      const opciones = Object.values(porOpcion).map(o => ({ ...o, indice: media(o.valores), rt: o.rts.length ? media(o.rts) : null, rondas: o.valores.length }));
      const todos = opciones.map(o => o.indice), m = media(todos), sd = Math.max(desviacion(todos), 2);
      for (const o of opciones) o.zGrupo = (o.indice - m) / sd;
      const orden = opciones.sort((a, b) => b.indice - a.indice);
      const separacion = orden.length > 1 ? (orden[0].indice - orden[1].indice) / sd : 0;   // cuanto destaca la primera
      return { grupo, orden, clave: opciones.find(o => o.clave) || null, separacion, rondas: Math.max(...opciones.map(o => o.rondas)) };
    });
  }

  aJSON() {
    return { titulo: this.titulo, modo: this.modo, fecha: this.fecha, duracion: this.duracion ?? null, base: this.base,
      baseVerbal: this.baseVerbal, baseInicio: this.baseInicio, filas: this.filas,
      marcas: this.marcas.map(({ ...m }) => m), eventos: this.conducta ? this.conducta.eventos : [] };
  }
}
