// Conducta observable: parpadeos, microexpresiones, mirada, toques de la cara, cabeza y gestos.
// Misma logica que la version de computadora. Sin dependencias del navegador.
import { Serie, mediana } from "./senales.js";

export class Parpadeos {
  constructor() { this.ears = new Serie(10); this.eventos = new Serie(900); this.cerradoDesde = null; }
  actualizar(ear, t, probCierre = null) {
    let cerrado;
    if (probCierre !== null && probCierre !== undefined) cerrado = probCierre > 0.5;
    else if (ear !== null && ear !== undefined) {
      this.ears.agregar(ear, t);
      const [, v] = this.ears.ultimos(10, t);
      const ordenados = Float64Array.from(v).sort();
      const abierto = v.length > 20 ? ordenados[Math.floor(v.length * 0.9)] : 0.3;
      cerrado = ear < abierto * 0.6;
    } else return false;
    if (cerrado) { if (this.cerradoDesde === null) this.cerradoDesde = t; return false; }
    if (this.cerradoDesde !== null) {
      const dur = t - this.cerradoDesde;
      this.cerradoDesde = null;
      if (dur >= 0.03 && dur <= 0.6) { this.eventos.agregar(1, t); return true; }
    }
    return false;
  }
  porMinuto(t, segundos = 60) { return this.eventos.ultimos(segundos, t)[0].length * 60 / segundos; }
}

const EXPRESIONES = {
  "alegría": [["mouthSmileLeft", "mouthSmileRight", "cheekSquintLeft", "cheekSquintRight"]],
  "sorpresa": [["browInnerUp", "browOuterUpLeft", "browOuterUpRight", "eyeWideLeft", "eyeWideRight", "jawOpen"]],
  "miedo": [["browInnerUp", "eyeWideLeft", "eyeWideRight", "mouthStretchLeft", "mouthStretchRight"]],
  "enojo": [["browDownLeft", "browDownRight", "mouthPressLeft", "mouthPressRight", "noseSneerLeft", "noseSneerRight"]],
  "tristeza": [["browInnerUp", "mouthFrownLeft", "mouthFrownRight", "mouthLowerDownLeft", "mouthLowerDownRight"]],
  "asco": [["noseSneerLeft", "noseSneerRight", "mouthUpperUpLeft", "mouthUpperUpRight"]],
  "desprecio": [null, ["mouthSmileLeft", "mouthSmileRight", "mouthDimpleLeft", "mouthDimpleRight"]],   // asimetrico
};

export class Microexpresiones {
  constructor(umbral = 0.18) {
    this.umbral = umbral;
    this.nombres = Object.keys(EXPRESIONES);
    this.historial = Object.fromEntries(this.nombres.map(n => [n, new Serie(10)]));
    this.eventos = new Serie(900);
    this.activa = {};
    this.lista = [];
  }
  puntaje(g, nombre) {
    const [juntos, asim] = EXPRESIONES[nombre];
    if (juntos) return juntos.reduce((s, k) => s + (g[k] || 0), 0) / juntos.length;
    const izq = (g[asim[0]] || 0) + (g[asim[2]] || 0), der = (g[asim[1]] || 0) + (g[asim[3]] || 0);
    return Math.abs(izq - der) / 2;
  }
  actualizar(g, t) {
    if (!g || !Object.keys(g).length) return null;
    let nuevo = null;
    for (const nombre of this.nombres) {
      const s = this.puntaje(g, nombre);
      const [, previos] = this.historial[nombre].ultimos(10, t);
      const base = previos.length > 30 ? mediana(previos) : s;
      this.historial[nombre].agregar(s, t);
      const exceso = s - base;
      if (exceso > this.umbral) {
        const [ini, pico] = this.activa[nombre] || [t, 0];
        this.activa[nombre] = [ini, Math.max(pico, exceso)];
      } else if (this.activa[nombre] && exceso < this.umbral * 0.5) {
        const [ini, pico] = this.activa[nombre];
        delete this.activa[nombre];
        const dur = t - ini;
        if (dur >= 0.035 && dur <= 0.5) { this.eventos.agregar(1, t); this.lista.push({ t, nombre, pico, dur }); nuevo = nombre; }
      }
    }
    return nuevo;
  }
  porMinuto(t, segundos = 60) { return this.eventos.ultimos(segundos, t)[0].length * 60 / segundos; }
}

export const ZONAS = {
  "la nariz": [1, 4, 5, 195, 45, 275], "la boca": [13, 14, 61, 291, 0, 17],
  "los ojos": [159, 145, 386, 374, 33, 263, 133, 362], "la frente": [10, 151, 67, 297, 109, 338],
  "la mejilla": [50, 280, 205, 425, 117, 346], "la barbilla": [152, 175, 199, 148, 377],
  "la oreja": [234, 454, 127, 356, 93, 323],
};
export const PUNTAS = [4, 8, 12, 16, 20];
export const CONEXIONES_MANO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const GESTOS = [
  ["Levantó las cejas", ["browInnerUp", "browOuterUpLeft", "browOuterUpRight"], 0.45],
  ["Frunció el ceño", ["browDownLeft", "browDownRight"], 0.40],
  ["Apretó los labios", ["mouthPressLeft", "mouthPressRight"], 0.40],
  ["Escondió los labios", ["mouthRollLower", "mouthRollUpper"], 0.40],
  ["Sonrió", ["mouthSmileLeft", "mouthSmileRight"], 0.50],
  ["Entrecerró los ojos", ["eyeSquintLeft", "eyeSquintRight"], 0.50],
  ["Arrugó la nariz", ["noseSneerLeft", "noseSneerRight"], 0.40],
];
const CATEGORIAS = ["mirada", "toque", "cabeza", "gesto", "micro"];

export function contarVaivenes(valores, amplitud = 4) {
  let cambios = 0, sentido = 0, pico = valores[0];
  for (const a of valores.slice(1)) {
    if (sentido === 0) { if (Math.abs(a - pico) > amplitud) { sentido = a > pico ? 1 : -1; pico = a; } }
    else if (sentido * (a - pico) > 0) pico = a;
    else if (Math.abs(a - pico) > amplitud) { cambios++; sentido = -sentido; pico = a; }
  }
  return cambios;
}

export class DetectorConducta {
  constructor() {
    this.eventos = [];
    this.series = Object.fromEntries(CATEGORIAS.map(c => [c, new Serie(900)]));
    this.miradaActual = "al centro";
    this.ref = { h: new Serie(25), v: new Serie(25), cabH: new Serie(25), cabV: new Serie(25) };
    this.miradaDesde = null; this.miradaDir = null;
    this.zona = null; this.zonaDesde = null; this.zonaUltimaVez = 0; this.ultimoToque = {};
    this.giro = []; this.incl = []; this.cabezaMoviendo = false;
    this.gestoDesde = {}; this.gestoUltimo = {};
  }
  evento(t, categoria, texto, duracion = null) {
    this.eventos.push({ t, categoria, texto, duracion });
    this.series[categoria].agregar(1, t);
  }
  recientes(t, n = 3, segundos = 12) { return this.eventos.slice(-n * 3).filter(e => t - e.t < segundos).slice(-n); }
  contar(categoria) { return this.eventos.filter(e => e.categoria === categoria).length; }
  resumen(t0, t1) {
    const c = {};
    for (const e of this.eventos) if (e.t >= t0 && e.t <= t1) c[e.texto] = (c[e.texto] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([texto, n]) => `${texto} ×${n}`);
  }
  actualizar(t, r, manos, microNueva) {
    if (microNueva) this.evento(t, "micro", `Microexpresión de ${microNueva}`);
    if (!r) return;
    const P = (i) => [r.puntos[2 * i], r.puntos[2 * i + 1]];
    this.mirada(t, r, P);
    this.toques(t, r, P, manos);
    this.cabeza(t, r);
    this.gestos(t, r.gestos);
  }
  mirada(t, r, P) {
    if (r.miradaH === null) return;
    const medio = [(P(33)[0] + P(263)[0]) / 2, (P(33)[1] + P(263)[1]) / 2];
    const cabH = (P(1)[0] - medio[0]) / r.dio, cabV = (P(1)[1] - medio[1]) / r.dio;
    const valores = { h: r.miradaH, v: r.miradaV, cabH, cabV };
    const ref = {};
    for (const [k, v] of Object.entries(valores)) {
      const [, hist] = this.ref[k].ultimos(25, t);
      ref[k] = hist.length > 30 ? mediana(hist) : v;
    }
    if (this.miradaActual === "al centro") for (const [k, v] of Object.entries(valores)) this.ref[k].agregar(v, t);
    const hor = (valores.h - ref.h) / 0.10 + (cabH - ref.cabH) / 0.22;
    const ver = (valores.v - ref.v) / 0.18 + (cabV - ref.cabV) / 0.20;
    let dir;
    if (Math.max(Math.abs(hor), Math.abs(ver)) < 1) dir = "al centro";
    else if (Math.abs(hor) >= Math.abs(ver)) dir = r.espejo === false ? (hor < 0 ? "a su derecha" : "a su izquierda") : (hor < 0 ? "a su izquierda" : "a su derecha");
    else dir = ver < 0 ? "hacia arriba" : "hacia abajo";
    if (dir !== this.miradaDir) {
      if (this.miradaDir && this.miradaDir !== "al centro" && this.miradaDesde !== null && t - this.miradaDesde >= 0.25)
        this.evento(this.miradaDesde, "mirada", `Miró ${this.miradaDir}`, t - this.miradaDesde);
      this.miradaDir = dir; this.miradaDesde = t;
    }
    if (dir === "al centro" || (this.miradaDesde !== null && t - this.miradaDesde >= 0.25)) this.miradaActual = dir;
  }
  toques(t, r, P, manos) {
    let zona = null;
    if (manos && manos.length) {
      let mejor = [Infinity, null];
      for (const mano of manos) for (const k of PUNTAS) {
        const punta = mano[k];
        for (const [z, idx] of Object.entries(ZONAS)) for (const i of idx) {
          const p = P(i), d = Math.hypot(p[0] - punta[0], p[1] - punta[1]);
          if (d < mejor[0]) mejor = [d, z];
        }
      }
      if (mejor[0] < 0.22 * r.dio) zona = mejor[1];
    }
    if (zona) {
      this.zonaUltimaVez = t;
      if (zona !== this.zona) { this.zona = zona; this.zonaDesde = t; }
      else if (t - this.zonaDesde >= 0.15 && (this.ultimoToque[zona] || 0) < this.zonaDesde) {
        this.ultimoToque[zona] = t;
        this.evento(this.zonaDesde, "toque", `Se tocó ${zona}`);
      }
    } else if (t - this.zonaUltimaVez > 0.3) this.zona = null;
  }
  cabeza(t, r) {
    if (r.giro === undefined) return;
    this.giro.push([t, r.giro]); this.incl.push([t, r.inclinacion]);
    while (this.giro.length && t - this.giro[0][0] > 2) this.giro.shift();
    while (this.incl.length && t - this.incl[0][0] > 2) this.incl.shift();
    if (this.cabezaMoviendo) {
      const g = this.giro.filter(([ti]) => t - ti <= 0.5).map(x => x[1]), i = this.incl.filter(([ti]) => t - ti <= 0.5).map(x => x[1]);
      const rango = (a) => Math.max(...a) - Math.min(...a);
      if (g.length >= 5 && rango(g) < 3 && rango(i) < 3) { this.cabezaMoviendo = false; this.giro = []; this.incl = []; }
      return;
    }
    const g = this.giro.filter(([ti]) => t - ti <= 1.5).map(x => x[1]), i = this.incl.filter(([ti]) => t - ti <= 1.5).map(x => x[1]);
    if (g.length < 10) return;
    const rango = (a) => Math.max(...a) - Math.min(...a);
    if (rango(g) > 1.5 * rango(i) && contarVaivenes(g) >= 2) { this.evento(t, "cabeza", "Negó con la cabeza"); this.cabezaMoviendo = true; }
    else if (rango(i) > 1.5 * rango(g) && contarVaivenes(i) >= 2) { this.evento(t, "cabeza", "Asintió con la cabeza"); this.cabezaMoviendo = true; }
  }
  gestos(t, g) {
    if (!g) return;
    for (const [texto, nombres, umbral] of GESTOS) {
      const v = nombres.reduce((s, n) => s + (g[n] || 0), 0) / nombres.length;
      if (v > umbral) { if (this.gestoDesde[texto] === undefined) this.gestoDesde[texto] = t; }
      else if (v < umbral * 0.7 && this.gestoDesde[texto] !== undefined) {
        const ini = this.gestoDesde[texto];
        delete this.gestoDesde[texto];
        if (t - ini >= 0.4 && t - (this.gestoUltimo[texto] || 0) > 2) { this.gestoUltimo[texto] = t; this.evento(ini, "gesto", texto, t - ini); }
      }
    }
  }
}
