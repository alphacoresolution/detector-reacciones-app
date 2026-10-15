// Voz desde el microfono del celular: tono (F0, YIN), variacion, volumen, habla/silencio y latencia.
import { Serie, f0Yin, percentil } from "./senales.js";

const FS = 16000, SALTO = 640, VENTANA = 1024;

// Picos de cada ciclo de la voz (uno por periodo de ~tau muestras)
function marcasDePeriodo(x, tau) {
  tau = Math.round(tau);
  if (tau < 8 || x.length < 3 * tau) return [];
  let i = 0; for (let k = 1; k < tau; k++) if (x[k] > x[i]) i = k;
  const picos = [i];
  for (;;) {
    const a = i + Math.floor(0.8 * tau), b = i + Math.floor(1.25 * tau) + 1;
    if (b > x.length) break;
    let j = a; for (let k = a; k < b; k++) if (x[k] > x[j]) j = k;
    i = j; picos.push(i);
  }
  return picos;
}

// Jitter (%), shimmer (%) y HNR (dB, Boersma 1993) de una ventana con voz (conjunto eGeMAPS).
export function calidadVoz(x, f0, fs = FS) {
  if (!f0) return [null, null, null];
  const picos = marcasDePeriodo(x, fs / f0);
  let jitter = null, shimmer = null;
  if (picos.length >= 5) {
    const per = [], amp = [];
    for (let k = 1; k < picos.length; k++) { per.push(picos[k] - picos[k - 1]); amp.push(Math.abs(x[picos[k]]) + 1e-9); }
    const mp = per.reduce((s, v) => s + v, 0) / per.length, ma = amp.reduce((s, v) => s + v, 0) / amp.length;
    let dp = 0, da = 0;
    for (let k = 1; k < per.length; k++) { dp += Math.abs(per[k] - per[k - 1]); da += Math.abs(amp[k] - amp[k - 1]); }
    jitter = dp / (per.length - 1) / mp * 100; shimmer = da / (amp.length - 1) / ma * 100;
  }
  const tau = Math.round(fs / f0);
  let m = 0; for (let k = 0; k < x.length; k++) m += x[k]; m /= x.length;
  let e0 = 1e-12, r = 0;
  for (let k = 0; k < x.length; k++) e0 += (x[k] - m) ** 2;
  for (let k = 0; k + tau < x.length; k++) r += (x[k] - m) * (x[k + tau] - m);
  r = Math.min(0.9999, Math.max(1e-4, r / e0));
  return [jitter, shimmer, 10 * Math.log10(r / (1 - r))];
}

export class AnalizadorVoz {
  constructor() {
    this.f0 = new Serie(300); this.volumen = new Serie(300); this.voz = new Serie(300);
    this.nivel = new Serie(30); this.microvariacion = new Serie(300);
    // ritmo del habla (eGeMAPS): arranques de voz, pausas; e inhalaciones audibles entre frases
    this.arranques = new Serie(900); this.pausas = new Serie(900); this.respiraciones = new Serie(900);
    // calidad de la voz: jitter %, shimmer %, HNR dB y brillo dB (energia arriba de 1 kHz frente a abajo)
    this.jitter = new Serie(300); this.shimmer = new Serie(300); this.hnr = new Serie(300); this.brillo = new Serie(300);
    this.tramoDesde = null; this.silencioDesde = null; this.ePrev = [];
    this.buffer = new Float32Array(VENTANA);
    this.pendiente = [];
    this.f0Previo = null;
    this.activo = false;
    this.estado = "Sin micrófono";
  }

  async iniciar(reloj, contexto = null) {
    this.reloj = reloj;            // funcion que devuelve la hora de la sesion en segundos
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    } catch (e) {
      this.estado = "Micrófono no permitido";
      return false;
    }
    const Contexto = window.AudioContext || window.webkitAudioContext;
    this.contexto = contexto || new Contexto();      // en iPhone conviene crearlo dentro del toque del boton
    if (this.contexto.state === "suspended") await this.contexto.resume();
    const fuente = this.contexto.createMediaStreamSource(this.flujo);
    // ScriptProcessor funciona en todos los Safari; el audio se reduce a 16 kHz para el analisis
    this.nodo = this.contexto.createScriptProcessor(2048, 1, 1);
    const factor = this.contexto.sampleRate / FS;
    let fase = 0;
    this.nodo.onaudioprocess = (ev) => {
      const x = ev.inputBuffer.getChannelData(0);
      for (let i = 0; i < x.length; i++) {
        fase += 1;
        if (fase >= factor) { fase -= factor; this.pendiente.push(x[i]); }
      }
      while (this.pendiente.length >= SALTO) this.analizar(this.pendiente.splice(0, SALTO));
    };
    fuente.connect(this.nodo);
    const silencio = this.contexto.createGain();
    silencio.gain.value = 0;
    this.nodo.connect(silencio);
    silencio.connect(this.contexto.destination);
    this.activo = true;
    this.estado = "Escuchando";
    return true;
  }

  detener() {
    this.activo = false;
    try { this.nodo.disconnect(); } catch (e) {}
    try { this.flujo.getTracks().forEach(p => p.stop()); } catch (e) {}
    try { this.contexto.close(); } catch (e) {}
  }

  analizar(bloque) {
    const t = this.reloj();
    this.buffer.copyWithin(0, SALTO);
    this.buffer.set(bloque, VENTANA - SALTO);
    let s = 0;
    for (let i = 0; i < VENTANA; i++) s += this.buffer[i] * this.buffer[i];
    const db = 20 * Math.log10(Math.sqrt(s / VENTANA) + 1e-9);
    this.nivel.agregar(db, t);
    const [, niveles] = this.nivel.ultimos(30, t);
    const piso = niveles.length > 25 ? percentil(niveles, 10) : -60;
    let f0 = null, aper = 1;
    if (db > piso + 8) [f0, aper] = f0Yin(this.buffer, FS);
    const hablando = f0 !== null && aper < 0.25;
    this.voz.agregar(hablando ? 1 : 0, t);
    this.ritmo(hablando, t);
    if (!hablando) this.respiracion(db, piso, t);
    else this.ePrev.length = 0;
    if (hablando) {
      this.f0.agregar(f0, t);
      this.volumen.agregar(db, t);
      if (this.f0Previo) this.microvariacion.agregar(Math.abs(f0 - this.f0Previo) / this.f0Previo * 100, t);
      this.f0Previo = f0;
      this.calidad(f0, aper, t);
    } else this.f0Previo = null;
  }

  calidad(f0, aper, t) {
    const [jit, shim, hnr] = calidadVoz(this.buffer, f0);
    if (hnr !== null) this.hnr.agregar(hnr, t);
    if (aper < 0.12 && jit !== null) { this.jitter.agregar(jit, t); this.shimmer.agregar(shim, t); }
    let lp = 0, bajas = 0, altas = 0;
    const a = Math.exp(-2 * Math.PI * 1000 / FS);
    for (let i = 0; i < VENTANA; i++) { lp = a * lp + (1 - a) * this.buffer[i]; const hp = this.buffer[i] - lp; bajas += lp * lp; altas += hp * hp; }
    this.brillo.agregar(10 * Math.log10((altas + 1e-12) / (bajas + 1e-12)), t);
  }

  ritmo(hablando, t) {
    if (hablando) {
      if (this.tramoDesde === null) {
        this.tramoDesde = t;
        this.arranques.agregar(1, t);
        if (this.silencioDesde !== null && t - this.silencioDesde >= 0.25) this.pausas.agregar(t - this.silencioDesde, t);
        this.silencioDesde = null;
      }
    } else if (this.tramoDesde !== null) { this.tramoDesde = null; this.silencioDesde = t; }
  }

  // Inhalacion audible: ruido sin tono con energia sobre todo arriba de 1 kHz, 0.15-1.2 s, en un silencio.
  // Energia por bandas con un filtro de un polo (sin FFT: barato para el telefono).
  respiracion(db, piso, t) {
    let altas = 0, bajas = 0, lp = 0;
    const a = Math.exp(-2 * Math.PI * 1000 / FS);
    for (let i = 0; i < VENTANA; i++) {
      lp = a * lp + (1 - a) * this.buffer[i];          // paso bajo 1 kHz
      const hp = this.buffer[i] - lp;                    // lo que queda arriba de 1 kHz
      bajas += lp * lp; altas += hp * hp;
    }
    const ruidoso = db > piso + 4 && altas / (bajas + 1e-9) > 1.5;
    this.ePrev.push([t, ruidoso]);
    this.ePrev = this.ePrev.filter(([ti]) => t - ti <= 1.3);
    const activos = this.ePrev.filter(([, r]) => r).map(([ti]) => ti);
    if (activos.length >= 4 && !ruidoso && activos[activos.length - 1] >= t - 0.1) {
      const dur = activos[activos.length - 1] - activos[0], ultima = this.respiraciones.tUltimo();
      if (dur >= 0.15 && dur <= 1.2 && (ultima === null || t - ultima > 1)) this.respiraciones.agregar(dur, activos[0]);
      this.ePrev.length = 0;
    }
  }

  resumenRitmo(t0, t1) {
    const [, v] = this.voz.ventana(t0, t1);
    const segundosVoz = v.reduce((s, x) => s + x, 0) * SALTO / FS;
    const [ta] = this.arranques.ventana(t0, t1), [tp, p0] = this.pausas.ventana(t0, t1), [, f] = this.f0.ventana(t0, t1);
    const p = p0.filter((x, i) => tp[i] - x >= t0 - 0.5);     // solo pausas que empezaron dentro de la ventana
    let rango = null;
    if (f.length >= 10) rango = 12 * Math.log2(percentil(f, 90) / percentil(f, 10));   // semitonos: no depende de la voz de cada quien
    return { segundosVoz, arranquesS: segundosVoz > 0.8 ? ta.length / segundosVoz : null, pausas: p.length,
      pausaMedia: p.length ? p.reduce((s, x) => s + x, 0) / p.length : null, rangoTono: rango };
  }

  latencia(tMarca, maximo = 6) {
    const [t, v] = this.voz.ventana(tMarca, tMarca + maximo);
    let seguidos = 0;
    for (let i = 0; i < t.length; i++) {
      seguidos = v[i] > 0.5 ? seguidos + 1 : 0;
      if (seguidos === 3) return t[i] - tMarca - 0.08;
    }
    return null;
  }
}
