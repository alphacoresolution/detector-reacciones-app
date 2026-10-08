// Rostro: MediaPipe (478 puntos + 52 gestos), ojos medidos en la imagen completa, mirada, cabeza,
// tension facial y color de piel para el pulso. Version para el navegador del celular.
import { FaceLandmarker, HandLandmarker, FilesetResolver } from "../vendor/vision_bundle.mjs";
import { FiltroOneEuro, Serie, mediana } from "./senales.js";
import { aGris, medirIris, medirPupila, DIAMETRO_IRIS_MM } from "./ojo.js";

export const OJOS_EAR = [[33, 160, 158, 133, 153, 144], [362, 385, 387, 263, 373, 380]];
export const IRIS = [[468, [469, 470, 471, 472]], [473, [474, 475, 476, 477]]];
// Puntos de la mitad inferior del rostro (labios, mejillas bajas y menton)
export const BOCA = [0, 11, 12, 13, 14, 15, 16, 17, 18, 37, 39, 40, 41, 42, 57, 61, 62, 72, 73, 74, 76, 77, 78, 80, 81, 82, 84, 85,
  86, 87, 88, 89, 90, 91, 95, 96, 146, 178, 179, 180, 181, 182, 183, 184, 185, 191, 267, 269, 270, 271, 272, 287, 291, 292, 302,
  303, 304, 306, 307, 308, 310, 311, 312, 314, 315, 316, 317, 318, 319, 320, 321, 324, 325, 375, 402, 403, 404, 405, 406, 407,
  408, 409, 415, 152, 175, 199, 200, 201, 208, 421, 428, 262, 32, 194, 418, 170, 140, 171, 396, 369, 395, 211, 431, 204, 424,
  106, 335, 43, 273, 202, 422, 210, 430, 169, 394, 136, 365];
const BOCA_SET = new Set(BOCA);

// Triangulos de la malla facial a partir de las aristas de MediaPipe
function triangulosDe(conexiones) {
  const vecinos = new Map();
  for (const { start, end } of conexiones) {
    if (!vecinos.has(start)) vecinos.set(start, new Set());
    if (!vecinos.has(end)) vecinos.set(end, new Set());
    vecinos.get(start).add(end); vecinos.get(end).add(start);
  }
  const tri = [];
  for (const [a, vs] of vecinos) for (const b of vs) {
    if (b <= a) continue;
    for (const c of vs) if (c > b && vecinos.get(b).has(c)) tri.push([a, b, c]);
  }
  return tri;
}

export const OVALO = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const GESTOS_TENSION = ["browDownLeft", "browDownRight", "browInnerUp", "eyeSquintLeft", "eyeSquintRight",
  "mouthPressLeft", "mouthPressRight", "mouthRollLower", "mouthRollUpper", "mouthFrownLeft", "mouthFrownRight",
  "noseSneerLeft", "noseSneerRight", "cheekSquintLeft", "cheekSquintRight"];

let fileset = null;
async function obtenerFileset() {
  if (!fileset) fileset = await FilesetResolver.forVisionTasks(new URL("../vendor/wasm", import.meta.url).href);
  return fileset;
}

async function crear(Clase, opciones, delegado) {
  return Clase.createFromOptions(await obtenerFileset(), { ...opciones, baseOptions: { ...opciones.baseOptions, delegate: delegado } });
}

// Segun el telefono, la grafica (GPU) o el procesador (CPU) es mas rapido: se prueban los dos con una
// imagen de prueba y se queda el mas rapido. Devuelve [detector, delegado, ultima marca de tiempo usada].
async function crearMasRapido(Clase, opciones) {
  const prueba = lienzo(1280, 720);
  prueba.getContext("2d").fillRect(0, 0, 8, 8);
  let ts = Math.round(performance.now());
  const medir = (d) => {
    for (let i = 0; i < 3; i++) d.detectForVideo(prueba, ++ts);
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) d.detectForVideo(prueba, ++ts);
    return (performance.now() - t0) / 5;
  };
  const candidatos = [];
  for (const delegado of ["GPU", "CPU"]) {
    try { const d = await crear(Clase, opciones, delegado); candidatos.push({ d, delegado, ms: medir(d) }); } catch (e) {}
  }
  if (!candidatos.length) throw new Error("No se pudo cargar el análisis de rostro en este navegador");
  candidatos.sort((a, b) => a.ms - b.ms);
  candidatos.slice(1).forEach(c => { try { c.d.close(); } catch (e) {} });
  return [candidatos[0].d, candidatos[0].delegado, ts];
}

export async function crearManos(delegado = "GPU") {
  return crear(HandLandmarker, {
    baseOptions: { modelAssetPath: new URL("../modelos/hand_landmarker.task", import.meta.url).href },
    runningMode: "VIDEO", numHands: 2,
  }, delegado).catch(() => crear(HandLandmarker, {
    baseOptions: { modelAssetPath: new URL("../modelos/hand_landmarker.task", import.meta.url).href },
    runningMode: "VIDEO", numHands: 2,
  }, "CPU"));
}

function lienzo(w, h) {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  return c;
}

function angulosCabeza(m) {
  // matriz 4x4 de MediaPipe; solo se usan los cambios de angulo (asentir, negar, movimiento)
  const R = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  const giro = Math.atan2(-R[2][0], Math.hypot(R[2][1], R[2][2])) * 180 / Math.PI;
  const inclinacion = Math.atan2(R[2][1], R[2][2]) * 180 / Math.PI;
  const ladeo = Math.atan2(R[1][0], R[0][0]) * 180 / Math.PI;
  return [giro, inclinacion, ladeo];
}

export class AnalizadorRostro {
  async cargar() {
    [this.detector, this.delegado, this.tsInicial] = await crearMasRapido(FaceLandmarker, {
      baseOptions: { modelAssetPath: new URL("../modelos/face_landmarker.task", import.meta.url).href },
      runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
    });
    this.copia = lienzo(1280, 720);
    this.ctxCopia = this.copia.getContext("2d", { willReadFrequently: true });
    this.zona = lienzo(64, 64);
    this.ctxZona = this.zona.getContext("2d", { willReadFrequently: true });
    this.triangulos = triangulosDe(FaceLandmarker.FACE_LANDMARKS_TESSELATION);
    this.triangulosBoca = this.triangulos.filter(t => t.every(i => BOCA_SET.has(i)));
    this.mallaPrevia = null; this.mallaMov = null;
    this.filtro = new FiltroOneEuro(1.5, 0.02);
    this.filtroAngulos = new FiltroOneEuro(1.0, 0.05);
    this.iris = new Serie(1.5);
    this.reiniciar();
    this.ts = this.tsInicial;     // las marcas de tiempo deben seguir creciendo despues de la prueba
    this.cuadro = 0;
  }

  reiniciar() {
    this.filtro?.reiniciar(); this.filtroAngulos?.reiniciar();
    this.pupilas = [];
    this.mallaPrevia = null; this.mallaMov = null;
    this.ojosPrevios = {};
    this.ultimaRel = null;
    this.rechazos = 0;
    this.previo = null;
  }

  // Lee una zona del video (en pixeles de la imagen completa) ampliada a `escala`; devuelve gris.
  leerZona(fuente, x, y, w, h, escala = 1) {
    const ow = Math.max(1, Math.round(w * escala)), oh = Math.max(1, Math.round(h * escala));
    if (this.zona.width !== ow || this.zona.height !== oh) { this.zona.width = ow; this.zona.height = oh; }
    this.ctxZona.drawImage(fuente, x, y, w, h, 0, 0, ow, oh);
    return this.ctxZona.getImageData(0, 0, ow, oh);
  }

  medirOjo(video, cx, cy, rIris) {
    const lado = Math.ceil(rIris * 3.8) + 12;
    const escala = Math.max(1, Math.ceil(20 / rIris));         // ampliar si el ojo se ve pequeno
    const x0 = Math.round(cx - lado / 2), y0 = Math.round(cy - lado / 2);
    if (x0 < 0 || y0 < 0 || x0 + lado > video.videoWidth || y0 + lado > video.videoHeight) return null;
    const datos = this.leerZona(video, x0, y0, lado, lado, escala);
    const gris = aGris(datos.data, datos.width, datos.height);
    const lx = (cx - x0) * escala, ly = (cy - y0) * escala, r = rIris * escala;
    let iris = medirIris(gris, lx, ly, r);
    let rI = r, ix = lx, iy = ly;
    if (iris && iris.r / r > 0.8 && iris.r / r < 1.25) { rI = iris.r; ix = iris.x; iy = iris.y; }
    const pup = medirPupila(gris, ix, iy, rI);
    return {
      rIris: rI / escala, centro: [x0 + ix / escala, y0 + iy / escala],
      pupila: pup ? { r: pup.r / escala, contraste: pup.contraste, x: x0 + pup.x / escala, y: y0 + pup.y / escala } : null,
    };
  }

  // Cuanto se movio cada punto respecto al cuadro anterior, descontando el movimiento de toda la cabeza
  // (alineacion rigida en 2D: rotacion + escala). Queda solo la expresion. Devuelve el movimiento de la boca.
  movimientoMalla(crudo, dio) {
    const n = crudo.length / 2;
    let cx = 0, cy = 0, nc = 0;
    for (let i = 0; i < n; i++) { if (BOCA_SET.has(i)) continue; cx += crudo[2 * i]; cy += crudo[2 * i + 1]; nc++; }
    cx /= nc; cy /= nc;     // centro sin la boca: un gesto no desplaza al resto de la cara
    const rel = new Float64Array(2 * n);
    const k = 1 / Math.max(dio, 1);
    for (let i = 0; i < n; i++) { rel[2 * i] = (crudo[2 * i] - cx) * k; rel[2 * i + 1] = (crudo[2 * i + 1] - cy) * k; }
    const A = this.mallaPrevia;
    this.mallaPrevia = rel;
    if (!A) return null;
    // similitud 2D de A hacia rel por minimos cuadrados: [a -b; b a]
    let sxx = 0, sxy = 0, syx = 0, syy = 0, saa = 0;
    for (let i = 0; i < n; i++) {
      if (BOCA_SET.has(i)) continue;     // la alineacion de la cabeza se calcula sin la boca: asi un gesto no "mueve" el resto
      const ax = A[2 * i], ay = A[2 * i + 1], bx = rel[2 * i], by = rel[2 * i + 1];
      sxx += ax * bx; syy += ay * by; sxy += ax * by; syx += ay * bx; saa += ax * ax + ay * ay;
    }
    const a = (sxx + syy) / (saa + 1e-9), b = (sxy - syx) / (saa + 1e-9);
    const mov = new Float32Array(n);
    let boca = 0;
    for (let i = 0; i < n; i++) {
      const ax = A[2 * i], ay = A[2 * i + 1];
      const d = Math.hypot(rel[2 * i] - (a * ax - b * ay), rel[2 * i + 1] - (b * ax + a * ay));
      mov[i] = Math.min(1, d * 40);
      if (BOCA_SET.has(i)) boca += d;
    }
    this.mallaMov = mov;
    return boca / BOCA.length * 100;    // % de la distancia entre ojos, por cuadro
  }

  procesar(video, t) {
    const W = video.videoWidth, H = video.videoHeight;
    if (!W || !H) return null;
    // los puntos se buscan en una copia de 1280 px: rapido y estable; el ojo se mide en la imagen completa
    let fuente = video;
    if (W > 1280) {
      const h = Math.round(H * 1280 / W);
      if (this.copia.width !== 1280 || this.copia.height !== h) { this.copia.width = 1280; this.copia.height = h; }
      this.ctxCopia.drawImage(video, 0, 0, 1280, h);
      fuente = this.copia;
    }
    this.ts = Math.max(this.ts + 1, Math.round(performance.now()));
    const res = this.detector.detectForVideo(fuente, this.ts);
    if (!res.faceLandmarks || !res.faceLandmarks.length) { this.reiniciar(); return null; }
    const lm = res.faceLandmarks[0];
    const crudo = new Float64Array(lm.length * 2);
    lm.forEach((p, i) => { crudo[2 * i] = p.x * W; crudo[2 * i + 1] = p.y * H; });
    const F = this.filtro.filtrar(crudo, t);
    const P = (i) => [F[2 * i], F[2 * i + 1]];
    const PC = (i) => [crudo[2 * i], crudo[2 * i + 1]];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const gestos = {};
    (res.faceBlendshapes?.[0]?.categories || []).forEach(c => { gestos[c.categoryName] = c.score; });

    this.cuadro++;
    const medirAhora = W <= 2000 || this.cuadro % 2 === 0;    // en 4K, la medida fina del ojo en cuadros alternos
    const ojos = [];
    if (lm.length >= 478) {
      OJOS_EAR.forEach((idx, k) => {
        const e = idx.map(P);
        const medio = [(e[0][0] + e[3][0]) / 2, (e[0][1] + e[3][1]) / 2];
        const [centroK, bordeK] = IRIS.reduce((a, b) => dist(P(a[0]), medio) < dist(P(b[0]), medio) ? a : b);
        const c = P(centroK);
        let rIris = bordeK.reduce((s, i) => s + dist(P(i), c), 0) / 4;
        const ancho = dist(e[0], e[3]) + 1e-6;
        const ear = (dist(e[1], e[5]) + dist(e[2], e[4])) / (2 * ancho);
        const xmin = Math.min(e[0][0], e[3][0]), xmax = Math.max(e[0][0], e[3][0]);
        const sup = (e[1][1] + e[2][1]) / 2, inf = (e[4][1] + e[5][1]) / 2;
        const ojo = { centro: c, rIris, ear, miradaH: (c[0] - xmin) / (xmax - xmin + 1e-6),
          miradaV: (c[1] - sup) / (inf - sup + 1e-6), pupila: null };
        const previo = this.ojosPrevios[k];
        if (ear > 0.15) {
          if (medirAhora || !previo) {
            const m = this.medirOjo(video, PC(centroK)[0], PC(centroK)[1], rIris);
            if (m) { ojo.rIris = m.rIris; ojo.centroFino = m.centro; ojo.pupila = m.pupila; this.ojosPrevios[k] = m; }
          } else {
            ojo.rIris = previo.rIris; ojo.centroFino = previo.centro; ojo.pupila = previo.pupila;
          }
        }
        ojos.push(ojo);
      });
    }

    const out = { puntos: F, ancho: W, alto: H, gestos, ojos };
    if (ojos.length) this.iris.agregar(ojos.reduce((s, o) => s + o.rIris, 0) / ojos.length, t);
    const [, radios] = this.iris.ultimos(1.5, t);
    const rEstable = radios.length ? mediana(radios) : null;

    // pupila: promedio de ambos ojos pesado por la nitidez del borde, mediana movil y rechazo de saltos
    let rel = null;
    const medidas = medirAhora ? ojos.filter(o => o.pupila).map(o => o.pupila) : [];
    if (medidas.length && rEstable) {
      const peso = medidas.reduce((s, m) => s + m.contraste, 0);
      rel = medidas.reduce((s, m) => s + m.r * m.contraste, 0) / peso / rEstable;
      if (!(rel > 0.18 && rel < 0.8)) rel = null;
    }
    if (rel !== null) {
      const med = this.pupilas.length ? mediana(this.pupilas) : null;
      if (this.pupilas.length >= 3 && Math.abs(rel - med) > 0.12 * med) {
        // casi siempre es un reflejo, un parpado o desenfoque; si se repite 5 veces es un cambio real (luz)
        if (++this.rechazos >= 5) { this.pupilas = [rel]; this.rechazos = 0; } else rel = null;
      } else {
        this.rechazos = 0;
        this.pupilas.push(rel);
        if (this.pupilas.length > 7) this.pupilas.shift();
      }
    }
    if (rel !== null && this.pupilas.length) this.ultimaRel = mediana(this.pupilas);
    const hayPupila = ojos.some(o => o.pupila);
    out.pupilaRel = (rel !== null || hayPupila) ? this.ultimaRel : null;
    out.pupilaMm = out.pupilaRel ? out.pupilaRel * DIAMETRO_IRIS_MM : null;
    out.rIris = rEstable;
    out.ear = ojos.length ? ojos.reduce((s, o) => s + o.ear, 0) / ojos.length : null;
    out.parpadeoRed = gestos.eyeBlinkLeft !== undefined ? (gestos.eyeBlinkLeft + gestos.eyeBlinkRight) / 2 : null;
    out.miradaH = ojos.length ? ojos.reduce((s, o) => s + o.miradaH, 0) / ojos.length : null;
    out.miradaV = ojos.length ? ojos.reduce((s, o) => s + o.miradaV, 0) / ojos.length : null;

    let angulos = null;
    const mat = res.facialTransformationMatrixes?.[0]?.data;
    if (mat && mat.length >= 16) {
      angulos = this.filtroAngulos.filtrar(angulosCabeza(mat), t);
      [out.giro, out.inclinacion, out.ladeo] = angulos;
    }
    const dio = ojos.length === 2 ? dist(ojos[0].centro, ojos[1].centro) : dist(P(33), P(263));
    const nariz = P(1);
    out.movimiento = null;
    if (this.previo) {
      const dt = Math.max(t - this.previo.t, 1e-3);
      const desplazamiento = dist(nariz, this.previo.nariz) / dio * 63;   // ~63 mm entre pupilas
      const rotacion = angulos && this.previo.angulos ? Math.hypot(...angulos.map((a, i) => a - this.previo.angulos[i])) : 0;
      out.movimiento = (rotacion + desplazamiento) / dt;
    }
    this.previo = { t, nariz, angulos: angulos ? Array.from(angulos) : null };
    out.dio = dio;
    out.tension = GESTOS_TENSION.reduce((s, g) => s + (gestos[g] || 0), 0) / GESTOS_TENSION.length * 100;
    out.boca = this.movimientoMalla(crudo, dio);
    out.sonrisa = ((gestos.mouthSmileLeft || 0) + (gestos.mouthSmileRight || 0)) * 50;

    // piel (frente y mejillas) para el pulso, y luz sobre la cara
    const rgb = [0, 0, 0];
    let n = 0;
    for (const [k, lado] of [[151, 0.30], [50, 0.22], [280, 0.22]]) {
      const s = Math.max(4, dio * lado / 2);
      let [x, y] = P(k);
      if (k === 151) y -= s;
      if (x - s < 0 || y - s < 0 || x + s > W || y + s > H) continue;
      const d = this.leerZona(video, x - s, y - s, 2 * s, 2 * s, 8 / s).data;
      for (let i = 0; i < d.length; i += 4) { rgb[0] += d[i]; rgb[1] += d[i + 1]; rgb[2] += d[i + 2]; n++; }
    }
    if (n) out.pielRgb = rgb.map(v => v / n);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < lm.length; i++) { x0 = Math.min(x0, F[2 * i]); x1 = Math.max(x1, F[2 * i]); y0 = Math.min(y0, F[2 * i + 1]); y1 = Math.max(y1, F[2 * i + 1]); }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    if (x1 > x0 && y1 > y0) {
      const d = this.leerZona(video, x0, y0, x1 - x0, y1 - y0, 24 / Math.max(x1 - x0, y1 - y0)).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      out.luz = s / (d.length / 4);
    }
    out.caja = [x0, y0, x1, y1];
    return out;
  }
}
