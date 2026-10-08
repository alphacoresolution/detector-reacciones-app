// Medicion fina del iris y la pupila (el mismo metodo de la version de computadora).
// Trabaja sobre una imagen en escala de grises: { datos: Float32Array, ancho, alto }.
// Sin dependencias del navegador, para poder probarlo con Node.

export const DIAMETRO_IRIS_MM = 11.7;   // el iris adulto mide casi lo mismo en todas las personas

function sectores(medio, ancho, n) {
  const a = [];
  for (const c of [0, Math.PI]) for (let i = 0; i < n; i++) a.push(c - medio + (2 * medio) * i / (n - 1));
  return a;
}
const ANGULOS = sectores(Math.PI / 3, 0, 14);         // +-60 grados a cada lado (los parpados tapan arriba y abajo)
const ANGULOS_IRIS = sectores(Math.PI / 5, 0, 12);    // +-36 grados: donde se ve lo blanco del ojo

export function aGris(rgba, ancho, alto) {
  const datos = new Float32Array(ancho * alto);
  for (let i = 0, j = 0; i < datos.length; i++, j += 4) datos[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return { datos, ancho, alto };
}

function suavizar(img) {        // gaussiano 3x3
  const { datos, ancho: w, alto: h } = img;
  const tmp = new Float32Array(datos.length), out = new Float32Array(datos.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = datos[y * w + Math.max(x - 1, 0)], b = datos[i], c = datos[y * w + Math.min(x + 1, w - 1)];
    tmp[i] = (a + 2 * b + c) / 4;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = tmp[Math.max(y - 1, 0) * w + x], b = tmp[y * w + x], c = tmp[Math.min(y + 1, h - 1) * w + x];
    out[y * w + x] = (a + 2 * b + c) / 4;
  }
  return { datos: out, ancho: w, alto: h };
}

function filtroExtremo(img, k, esMin) {   // minimo o maximo en un cuadrado k x k (separable, sin llamadas por pixel)
  const { datos, ancho: w, alto: h } = img, r = k >> 1;
  const tmp = new Float32Array(datos.length), out = new Float32Array(datos.length);
  for (let y = 0; y < h; y++) {
    const fila = y * w;
    for (let x = 0; x < w; x++) {
      const a = x - r < 0 ? 0 : x - r, b = x + r > w - 1 ? w - 1 : x + r;
      let v = datos[fila + a];
      if (esMin) { for (let i = a + 1; i <= b; i++) { const q = datos[fila + i]; if (q < v) v = q; } }
      else { for (let i = a + 1; i <= b; i++) { const q = datos[fila + i]; if (q > v) v = q; } }
      tmp[fila + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    const a = y - r < 0 ? 0 : y - r, b = y + r > h - 1 ? h - 1 : y + r;
    for (let x = 0; x < w; x++) {
      let v = tmp[a * w + x];
      if (esMin) { for (let i = a + 1; i <= b; i++) { const q = tmp[i * w + x]; if (q < v) v = q; } }
      else { for (let i = a + 1; i <= b; i++) { const q = tmp[i * w + x]; if (q > v) v = q; } }
      out[y * w + x] = v;
    }
  }
  return { datos: out, ancho: w, alto: h };
}

// Apertura morfologica: borra reflejos de luz (manchas claras pequenas) sin mover los bordes oscuros.
function sinReflejos(img, k) { return filtroExtremo(filtroExtremo(img, k, true), k, false); }

function bilineal(img, x, y) {
  const { datos, ancho: w, alto: h } = img;
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return datos[i] * (1 - fx) * (1 - fy) + datos[i + 1] * fx * (1 - fy) + datos[i + w] * (1 - fx) * fy + datos[i + w + 1] * fx * fy;
}

// Operador radial (idea de Daugman): el radio donde la imagen pasa de oscura a clara, con precision subpixel.
export function medirBorde(img, cx, cy, rb, { rango = [0.15, 0.85], angulos = ANGULOS, desplazamiento = 0.2,
  desplazamientoVertical = null, nRadios = 40, nCentros = 7, preparada = false } = {}) {
  if (rb < 4) return null;
  let im = img;
  if (!preparada) im = sinReflejos(suavizar(img), Math.max(3, Math.round(0.25 * rb) | 1));
  const radios = Array.from({ length: nRadios }, (_, j) => (rango[0] + (rango[1] - rango[0]) * j / (nRadios - 1)) * rb);
  const desp = Array.from({ length: nCentros }, (_, j) => (-desplazamiento + 2 * desplazamiento * j / (nCentros - 1)) * rb);
  const dv = desplazamientoVertical === null ? desplazamiento : desplazamientoVertical;
  const despV = Array.from({ length: nCentros }, (_, j) => (-dv + 2 * dv * j / (nCentros - 1)) * rb);
  const cos = angulos.map(Math.cos), sin = angulos.map(Math.sin);
  const muestra = new Float32Array(angulos.length), perfil = new Float32Array(nRadios);
  let mejor = { g: -Infinity };
  for (const dy of despV) for (const dx of desp) {
    let suma = 0;
    for (let j = 0; j < nRadios; j++) {
      for (let a = 0; a < angulos.length; a++) muestra[a] = bilineal(im, cx + dx + radios[j] * cos[a], cy + dy + radios[j] * sin[a]);
      muestra.sort();
      perfil[j] = (muestra[(muestra.length - 1) >> 1] + muestra[muestra.length >> 1]) / 2;   // mediana
      suma += perfil[j];
    }
    const fondo = suma / nRadios;
    for (let j = 1; j < nRadios - 2; j++) {
      // gradiente suavizado [1, 2, 1] / 4 entre el radio j y j+1
      const g = ((perfil[j] - perfil[j - 1]) + 2 * (perfil[j + 1] - perfil[j]) + (perfil[j + 2] - perfil[j + 1])) / 4;
      if (g > mejor.g) mejor = { g, j, dx, dy, fondo, p: Float32Array.from(perfil) };
    }
  }
  if (!Number.isFinite(mejor.g)) return null;
  const contraste = mejor.g / (mejor.fondo + 1);
  if (contraste < 0.008) return null;
  // interpolacion parabolica del maximo
  const gAt = (j) => {
    const p = mejor.p;
    if (j < 1 || j >= nRadios - 2) return -Infinity;
    return ((p[j] - p[j - 1]) + 2 * (p[j + 1] - p[j]) + (p[j + 2] - p[j + 1])) / 4;
  };
  const a = gAt(mejor.j - 1), b = mejor.g, c = gAt(mejor.j + 1);
  let ajuste = 0;
  if (Number.isFinite(a) && Number.isFinite(c) && a - 2 * b + c !== 0) ajuste = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / (a - 2 * b + c)));
  const paso = radios[1] - radios[0];
  const r = radios[mejor.j] + paso / 2 + ajuste * paso;
  return { r, contraste, x: cx + mejor.dx, y: cy + mejor.dy };
}

// Borde iris/esclerotica: solo hacia los lados, donde se ve lo blanco del ojo.
export function medirIris(img, cx, cy, rAprox) {
  // solo se ajusta en horizontal: arriba y abajo no se mide (parpados), asi que la altura de MediaPipe se respeta
  return medirBorde(img, cx, cy, rAprox, { rango: [0.7, 1.35], angulos: ANGULOS_IRIS, desplazamiento: 0.15,
    desplazamientoVertical: 0.03 });
}

// Borde pupila/iris. Primero se rellena lo que esta fuera del iris con el color del iris (asi el borde
// iris/esclerotica no se confunde con el de la pupila), luego una pasada amplia y una fina.
export function medirPupila(img, cx, cy, rIris) {
  if (rIris < 4) return null;
  const { datos, ancho: w, alto: h } = img;
  const copia = new Float32Array(datos);
  const anillo = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > 0.6 * rIris && d < 0.88 * rIris) anillo.push(datos[y * w + x]);
  }
  if (anillo.length < 10) return null;
  anillo.sort((p, q) => p - q);
  const colorIris = anillo[Math.floor(anillo.length * 0.8)];   // el percentil alto es iris aunque la pupila este dilatada
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - cx, y - cy) > 0.9 * rIris) copia[y * w + x] = colorIris;
  const preparada = sinReflejos(suavizar({ datos: copia, ancho: w, alto: h }), Math.max(3, Math.round(0.25 * rIris) | 1));
  const amplia = medirBorde(preparada, cx, cy, rIris, { rango: [0.12, 0.85], desplazamiento: 0.3, preparada: true });
  if (!amplia) return null;
  return medirBorde(preparada, amplia.x, amplia.y, rIris, { rango: [0.12, 0.85], desplazamiento: 0.07, preparada: true }) || amplia;
}
