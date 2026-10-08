// Procesamiento de senales: series de tiempo, filtro One Euro, pulso (POS) y tono de voz (YIN).
// Sin dependencias del navegador, para poder probarlo tambien con Node.

export class Serie {
  constructor(segundos = 180) {
    this.segundos = segundos;
    this.t = [];
    this.v = [];
  }
  agregar(valor, t) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return;
    this.t.push(t);
    this.v.push(valor);
    if (this.t.length > 64 && t - this.t[0] > this.segundos) {
      let i = 0;
      while (i < this.t.length && t - this.t[i] > this.segundos) i++;
      this.t.splice(0, i);
      this.v.splice(0, i);
    }
  }
  ventana(desde, hasta = Infinity) {
    const t = [], v = [];
    // busqueda binaria del inicio: las series son largas y se consultan en cada cuadro
    let lo = 0, hi = this.t.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.t[m] < desde) lo = m + 1; else hi = m; }
    for (let i = lo; i < this.t.length && this.t[i] <= hasta; i++) { t.push(this.t[i]); v.push(this.v[i]); }
    return [t, v];
  }
  ultimos(segundos, ahora) { return this.ventana(ahora - segundos, ahora); }
  ultimo() { return this.v.length ? this.v[this.v.length - 1] : null; }
  tUltimo() { return this.t.length ? this.t[this.t.length - 1] : null; }
}

export const media = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
export const desviacion = (a) => {
  if (a.length < 2) return 0;
  const m = media(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
};
export function percentil(a, p) {
  if (!a.length) return NaN;
  const o = Float64Array.from(a).sort();
  const i = (o.length - 1) * p / 100, lo = Math.floor(i), hi = Math.ceil(i);
  return o[lo] + (o[hi] - o[lo]) * (i - lo);
}
export const mediana = (a) => percentil(a, 50);

// Filtro One Euro (Casiez et al., 2012): quita el temblor sin agregar retraso a los movimientos rapidos.
export class FiltroOneEuro {
  constructor(corteMin = 1.5, beta = 0.02, corteDerivada = 1.0) {
    Object.assign(this, { corteMin, beta, corteDerivada });
    this.reiniciar();
  }
  reiniciar() { this.x = null; this.dx = null; this.t = null; }
  static alfa(corte, dt) { const tau = 1 / (2 * Math.PI * corte); return 1 / (1 + tau / dt); }
  filtrar(x, t) {          // x: Float64Array o arreglo de numeros
    if (!this.x || this.x.length !== x.length) {
      this.x = Float64Array.from(x); this.dx = new Float64Array(x.length); this.t = t;
      return Float64Array.from(x);
    }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    const ad = FiltroOneEuro.alfa(this.corteDerivada, dt);
    for (let i = 0; i < x.length; i++) {
      this.dx[i] = ad * (x[i] - this.x[i]) / dt + (1 - ad) * this.dx[i];
      const a = FiltroOneEuro.alfa(this.corteMin + this.beta * Math.abs(this.dx[i]), dt);
      this.x[i] = a * x[i] + (1 - a) * this.x[i];
    }
    return Float64Array.from(this.x);
  }
}

function uniforme(t, x, fs) {
  const n = Math.floor((t[t.length - 1] - t[0]) * fs);
  const out = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const ti = t[0] + i / fs;
    while (j < t.length - 2 && t[j + 1] < ti) j++;
    const a = t[j], b = t[j + 1];
    const f = b > a ? (ti - a) / (b - a) : 0;
    out[i] = x[j] + (x[j + 1] - x[j]) * Math.min(Math.max(f, 0), 1);
  }
  return out;
}

// Frecuencia dominante (latidos por minuto) en la banda cardiaca y su calidad 0-1.
// DFT directa solo en la banda (0.7-3 Hz): con pocas muestras es rapida y precisa.
export function espectroPico(x, fs, fmin = 0.7, fmax = 3.0) {
  const n = x.length;
  if (n < fs * 4) return [null, 0];
  // quitar tendencia lineal y normalizar
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
  const pend = (n * sxy - sx * sy) / (n * sxx - sx * sx), orig = (sy - pend * sx) / n;
  const y = new Float64Array(n);
  let var_ = 0;
  for (let i = 0; i < n; i++) { y[i] = x[i] - (orig + pend * i); var_ += y[i] * y[i]; }
  if (var_ < 1e-12) return [null, 0];
  for (let i = 0; i < n; i++) y[i] *= 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));   // ventana de Hann
  const paso = 1 / 120;      // resolucion de 0.5 latidos por minuto
  const frecs = [], potencias = [];
  for (let f = fmin; f <= fmax + 1e-9; f += paso) {
    let re = 0, im = 0;
    const w = 2 * Math.PI * f / fs;
    for (let i = 0; i < n; i++) { re += y[i] * Math.cos(w * i); im -= y[i] * Math.sin(w * i); }
    frecs.push(f); potencias.push(re * re + im * im);
  }
  let k = 0;
  for (let i = 1; i < potencias.length; i++) if (potencias[i] > potencias[k]) k = i;
  let cerca = 0, total = 0;
  for (let i = 0; i < potencias.length; i++) {
    total += potencias[i];
    if (Math.abs(frecs[i] - frecs[k]) <= 0.1) cerca += potencias[i];
  }
  return [frecs[k] * 60, cerca / (total + 1e-12)];
}

// Pulso por el color de la piel: algoritmo POS (Wang et al., 2017). rgb: arreglo de [r, g, b].
export function posRppg(t, rgb, fs = 30) {
  if (t.length < 10 || t[t.length - 1] - t[0] < 6) return [null, 0];
  const canales = [0, 1, 2].map(c => uniforme(t, rgb.map(p => p[c]), fs));
  const n = canales[0].length, l = Math.round(1.6 * fs);
  const h = new Float64Array(n);
  for (let i = 0; i + l <= n; i++) {
    const m = [0, 1, 2].map(c => { let s = 0; for (let j = i; j < i + l; j++) s += canales[c][j]; return s / l + 1e-9; });
    const s1 = new Float64Array(l), s2 = new Float64Array(l);
    for (let j = 0; j < l; j++) {
      const r = canales[0][i + j] / m[0], g = canales[1][i + j] / m[1], b = canales[2][i + j] / m[2];
      s1[j] = g - b; s2[j] = -2 * r + g + b;
    }
    const a = desviacion(s1) / (desviacion(s2) + 1e-9);
    let mh = 0;
    const hh = new Float64Array(l);
    for (let j = 0; j < l; j++) { hh[j] = s1[j] + a * s2[j]; mh += hh[j]; }
    mh /= l;
    for (let j = 0; j < l; j++) h[i + j] += hh[j] - mh;
  }
  return espectroPico(h, fs);
}

// Tono de voz (frecuencia fundamental) con YIN. x: Float32Array de audio. Devuelve [f0 Hz, aperiodicidad].
export function f0Yin(x, fs, fmin = 70, fmax = 400, umbral = 0.15) {
  const tauMin = Math.floor(fs / fmax), tauMax = Math.floor(fs / fmin);
  const w = x.length - tauMax;
  if (w < tauMax) return [null, 1];
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length;
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) { const dif = (x[i] - m) - (x[i + tau] - m); s += dif * dif; }
    d[tau] = s;
  }
  const dn = new Float64Array(tauMax + 1);
  dn[0] = 1;
  let acumulado = 0;
  for (let tau = 1; tau <= tauMax; tau++) { acumulado += d[tau]; dn[tau] = d[tau] * tau / (acumulado + 1e-12); }
  let tau = -1;
  for (let k = tauMin; k < tauMax; k++) if (dn[k] < umbral) { tau = k; break; }
  if (tau < 0) return [null, 1];
  while (tau + 1 < tauMax && dn[tau + 1] < dn[tau]) tau++;
  const a = dn[tau - 1], b = dn[tau], c = dn[tau + 1];
  const den = a - 2 * b + c;
  const ajuste = den !== 0 ? 0.5 * (a - c) / den : 0;
  return [fs / (tau + ajuste), b];
}
