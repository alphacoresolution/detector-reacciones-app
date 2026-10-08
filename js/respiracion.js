// Respiracion por la camara: el subir y bajar de los hombros respecto a la cara (MediaPipe Pose).
// Se filtra entre 6 y 42 respiraciones por minuto y se busca la frecuencia dominante en 20 s.
import { PoseLandmarker, FilesetResolver } from "../vendor/vision_bundle.mjs";
import { Serie, espectroPico } from "./senales.js";

const HOMBRO_IZQ = 11, HOMBRO_DER = 12, NARIZ = 0;

export function frecuenciaRespiratoria(t, x) {
  if (t.length < 40 || t[t.length - 1] - t[0] < 12) return [null, 0];
  const fs = 10, n = Math.floor((t[t.length - 1] - t[0]) * fs), xu = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const ti = t[0] + i / fs;
    while (j < t.length - 2 && t[j + 1] < ti) j++;
    const f = t[j + 1] > t[j] ? (ti - t[j]) / (t[j + 1] - t[j]) : 0;
    xu[i] = x[j] + (x[j + 1] - x[j]) * Math.min(Math.max(f, 0), 1);
  }
  // espectroPico quita la tendencia, aplica Hann y busca el pico; aqui la banda es la respiratoria
  const [rpm, calidad] = espectroPico(xu, fs, 0.1, 0.7);
  return [rpm, calidad];
}

export class Respiracion {
  constructor() { this.movimiento = new Serie(60); this.rpm = null; this.calidad = 0; this.hombros = null; this.ts = 0; this.ultimoCalculo = 0; }

  async cargar(delegado = "GPU") {
    const fs = await FilesetResolver.forVisionTasks(new URL("../vendor/wasm", import.meta.url).href);
    const opciones = { baseOptions: { modelAssetPath: new URL("../modelos/pose_landmarker_lite.task", import.meta.url).href, delegate: delegado },
      runningMode: "VIDEO", numPoses: 1 };
    try { this.detector = await PoseLandmarker.createFromOptions(fs, opciones); }
    catch (e) { this.detector = await PoseLandmarker.createFromOptions(fs, { ...opciones, baseOptions: { ...opciones.baseOptions, delegate: "CPU" } }); }
  }

  procesar(fuente, t, ancho, alto) {
    this.ts = Math.max(this.ts + 1, Math.round(performance.now()) + 500000);
    const res = this.detector.detectForVideo(fuente, this.ts);
    const P = res.landmarks?.[0];
    if (!P) { this.hombros = null; return; }
    const izq = P[HOMBRO_IZQ], der = P[HOMBRO_DER], nariz = P[NARIZ];
    if (Math.min(izq.visibility ?? 1, der.visibility ?? 1) < 0.5) { this.hombros = null; return; }
    const anchoH = Math.abs(izq.x - der.x) + 1e-6;
    this.movimiento.agregar(((izq.y + der.y) / 2 - nariz.y) / anchoH, t);
    this.hombros = [[izq.x * ancho, izq.y * alto], [der.x * ancho, der.y * alto]];
    if (t - this.ultimoCalculo > 1) {
      this.ultimoCalculo = t;
      const [tt, vv] = this.movimiento.ultimos(20, t);
      const [rpm, cal] = frecuenciaRespiratoria(tt, vv);
      if (rpm && cal > 0.25) { this.rpm = rpm; this.calidad = cal; }
      else if (t - (this.movimiento.tUltimo() || 0) > 5) this.rpm = null;
    }
  }
}
