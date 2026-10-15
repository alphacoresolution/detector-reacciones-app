// Gestos faciales precisos: unidades de accion (FACS) a partir de los 52 gestos de MediaPipe, con intensidad,
// asimetria izquierda/derecha, inicio, apice y fin. Misma logica que gestos.py de la computadora.
// Las expresiones fingidas son mas asimetricas (Ekman, Hager y Friesen, 1981); la sonrisa sentida activa AU6
// (mejillas) ademas de AU12 (comisuras); AU24 y AU28 son supresion de la boca. Nada de esto prueba mentira:
// se compara con la linea base de la misma persona.
import { Serie, mediana } from "./senales.js";

export const AUS = {
  AU1:  ["Cejas internas arriba", ["browInnerUp"], null],
  AU2:  ["Cejas externas arriba", ["browOuterUpLeft"], ["browOuterUpRight"]],
  AU4:  ["Ceño fruncido", ["browDownLeft"], ["browDownRight"]],
  AU5:  ["Ojos muy abiertos", ["eyeWideLeft"], ["eyeWideRight"]],
  AU6:  ["Mejillas arriba (ojos)", ["cheekSquintLeft"], ["cheekSquintRight"]],
  AU7:  ["Párpados tensos", ["eyeSquintLeft"], ["eyeSquintRight"]],
  AU9:  ["Nariz arrugada", ["noseSneerLeft"], ["noseSneerRight"]],
  AU10: ["Labio superior arriba", ["mouthUpperUpLeft"], ["mouthUpperUpRight"]],
  AU12: ["Comisuras arriba", ["mouthSmileLeft"], ["mouthSmileRight"]],
  AU14: ["Hoyuelo (desprecio)", ["mouthDimpleLeft"], ["mouthDimpleRight"]],
  AU15: ["Comisuras abajo", ["mouthFrownLeft"], ["mouthFrownRight"]],
  AU16: ["Labio inferior abajo", ["mouthLowerDownLeft"], ["mouthLowerDownRight"]],
  AU17: ["Barbilla arriba", ["mouthShrugLower"], null],
  AU18: ["Labios fruncidos", ["mouthPucker"], null],
  AU20: ["Labios estirados", ["mouthStretchLeft"], ["mouthStretchRight"]],
  AU22: ["Labios en embudo", ["mouthFunnel"], null],
  AU24: ["Labios apretados", ["mouthPressLeft"], ["mouthPressRight"]],
  AU26: ["Mandíbula abierta", ["jawOpen"], null],
  AU28: ["Labios escondidos", ["mouthRollUpper", "mouthRollLower"], null],
  AD34: ["Mejillas infladas", ["cheekPuff"], null],
};
const PAREADAS = Object.keys(AUS).filter(k => AUS[k][2]);
const SUPRESION = ["AU24", "AU28"];
const UMBRAL = 0.15, MINIMO = 0.20;
const prom = (g, lista) => lista.reduce((s, k) => s + (g[k] || 0), 0) / lista.length;

export function intensidades(g) {
  const out = {};
  for (const [au, [, izq, der]] of Object.entries(AUS)) {
    const a = prom(g, izq);
    if (der) { const b = prom(g, der); out[au] = [(a + b) / 2, a, b]; } else out[au] = [a, null, null];
  }
  return out;
}

export function asimetriaDe(ints, minimo = 0.10) {
  const difs = [];
  for (const au of PAREADAS) { const [, i, d] = ints[au]; if (Math.max(i, d) > minimo) difs.push(Math.abs(i - d)); }
  return difs.length ? difs.reduce((s, x) => s + x, 0) / difs.length : 0;
}

export class AnalizadorGestos {
  constructor(umbral = UMBRAL) {
    this.umbral = umbral;
    this.historial = Object.fromEntries(Object.keys(AUS).map(au => [au, new Serie(10)]));
    this.asimetria = new Serie(900); this.supresion = new Serie(900);
    this.activas = {}; this.eventos = []; this.ints = {};
  }
  actualizar(g, t) {
    if (!g || !Object.keys(g).length) return [];
    const ints = this.ints = intensidades(g);
    this.asimetria.agregar(asimetriaDe(ints), t);
    this.supresion.agregar(SUPRESION.reduce((s, a) => s + ints[a][0], 0) / SUPRESION.length, t);
    const nuevos = [];
    for (const [au, [total, izq, der]] of Object.entries(ints)) {
      const [, previos] = this.historial[au].ultimos(10, t);
      const base = previos.length > 30 ? mediana(previos) : total;
      this.historial[au].agregar(total, t);
      const exceso = total - base, activo = this.activas[au];
      if (exceso > this.umbral && total > MINIMO) {
        const asim = izq !== null ? Math.abs(izq - der) : 0;
        if (!activo) this.activas[au] = { inicio: t, pico: exceso, tPico: t, asim, picoAbs: total, ojos: ints.AU6[0] };
        else if (exceso > activo.pico) Object.assign(activo, { pico: exceso, tPico: t, asim, picoAbs: total, ojos: ints.AU6[0] });
      } else if (activo && exceso < this.umbral * 0.5) {
        delete this.activas[au];
        const ev = this.cerrar(au, activo, t);
        if (ev) nuevos.push(ev);
      }
    }
    return nuevos;
  }
  cerrar(au, a, t) {
    const dur = t - a.inicio;
    if (dur < 0.03 || dur > 20) return null;
    let texto = AUS[au][0];
    if (au === "AU12") texto = a.ojos > 0.25 ? "Sonrisa con los ojos" : "Sonrisa solo con la boca";
    else if (au === "AU14" && a.asim > 0.25) texto = "Desprecio (un solo lado)";
    const clase = dur < 0.5 ? "micro" : dur < 2 ? "breve" : "sostenido";
    const ev = { t: a.inicio, au, texto, duracion: dur, pico: a.picoAbs, asimetria: a.asim, subida: a.tPico - a.inicio, bajada: t - a.tPico, clase };
    this.eventos.push(ev);
    return ev;
  }
  activasTexto(minimo = MINIMO) {
    const l = Object.entries(this.ints).filter(([, v]) => v[0] > minimo).map(([au]) => au);
    return l.length ? l.join(" · ") : "ninguna";
  }
  resumen(t0, t1, maximo = 4) {
    const c = {}, dur = {};
    for (const e of this.eventos) if (e.t >= t0 && e.t <= t1) { c[e.texto] = (c[e.texto] || 0) + 1; (dur[e.texto] ||= []).push(e.duracion); }
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, maximo)
      .map(([texto, n]) => `${texto} ×${n} (${(dur[texto].reduce((s, x) => s + x, 0) / dur[texto].length).toFixed(1)} s)`);
  }
}

// Tabla por AU para el reporte (sobre los eventos guardados). periodos: {nombre: [[t0, t1], ...]}
export function tablaGestos(eventos, periodos) {
  const filas = [];
  for (const [au, [nombre, , der]] of Object.entries(AUS)) {
    const fila = { au, nombre, pareada: !!der, periodos: {} };
    let total = 0;
    for (const [p, ventanas] of Object.entries(periodos)) {
      const evs = eventos.filter(e => e.au === au && ventanas.some(([a, b]) => e.t >= a && e.t <= b));
      const minutos = ventanas.reduce((s, [a, b]) => s + (b - a), 0) / 60 || 1e-9;
      total += evs.length;
      const m = (k) => evs.length ? evs.reduce((s, e) => s + e[k], 0) / evs.length : null;
      fila.periodos[p] = { n: evs.length, porMin: evs.length / minutos, duracion: m("duracion"), asimetria: der ? m("asimetria") : null,
        micro: evs.filter(e => e.clase === "micro").length };
    }
    if (total) filas.push(fila);
  }
  return filas;
}
