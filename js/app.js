// Detector de Reacciones para el celular: pantallas, camara, ciclo de analisis y protocolo.
import { AnalizadorRostro, crearManos, OVALO } from "./rostro.js";
import { Respiracion } from "./respiracion.js";
import { Parpadeos, Microexpresiones, DetectorConducta, CONEXIONES_MANO, PUNTAS } from "./conducta.js";
import { AnalizadorVoz } from "./voz.js";
import { Transcriptor } from "./habla.js";
import { Sesion, expandirPreguntas, nivelTexto, DURACION_BASE, ESPERA_MARCA } from "./protocolo.js";
import { posRppg, mediana } from "./senales.js";
import { cuerpoReporte, archivoReporte, CSS_REPORTE } from "./reporte.js";
import { guardarSesion, listarSesiones, borrarSesion } from "./almacen.js";

const $ = (id) => document.getElementById(id);

const EJEMPLO = {
  titulo: "Juego del objeto escondido",
  preguntas: [
    { texto: "¿Estamos en el año 2026?", tipo: "neutral" },
    { texto: "¿Estás sentado en este momento?", tipo: "neutral" },
    { grupo: "¿Qué objeto escondiste?", opciones: ["Un reloj", "Un anillo", "Unas llaves", "Una moneda", "Un control remoto"], clave: null },
    { texto: "¿Hay luz encendida en este cuarto?", tipo: "neutral" },
    { grupo: "¿Dónde lo escondiste?", opciones: ["En la cocina", "En un cajón", "Debajo de un cojín", "En un zapato", "Detrás de un libro"], clave: null },
  ],
};
const INDICACIONES_CALIBRACION = [
  "Di en voz alta tu nombre completo.", "Di qué día es hoy.", "Cuenta en voz alta del 1 al 10.",
  "Describe qué desayunaste hoy.", "Di tu color favorito y por qué.", "Respira normal y mira a la cámara.",
];

// ---------------------------------------------------------------- preferencias
const PREDETERMINADAS = { modo: "auto", camara: "user", calidad: "1920x1080", preguntas: "ejemplo", transcribir: true,
  manos: true, ocultar: false, leer: true, mias: "", respiracion: true, malla: "boca", rondas: "2", cerca: true };
function cargarPref() {
  try { return { ...PREDETERMINADAS, ...JSON.parse(localStorage.getItem("detector-pref") || "{}") }; }
  catch (e) { return { ...PREDETERMINADAS }; }
}
const pref = cargarPref();
function guardarPref() { try { localStorage.setItem("detector-pref", JSON.stringify(pref)); } catch (e) {} }

function prepararInicio() {
  document.querySelectorAll(".segmentos[data-grupo]").forEach(grupo => {
    const clave = grupo.dataset.grupo;
    const marcar = () => grupo.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.valor === pref[clave])));
    grupo.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { pref[clave] = b.dataset.valor; marcar(); visibilidad(); guardarPref(); }));
    marcar();
  });
  for (const [id, clave] of [["op-transcribir", "transcribir"], ["op-manos", "manos"], ["op-ocultar", "ocultar"], ["op-leer", "leer"], ["op-respiracion", "respiracion"], ["op-cerca", "cerca"]]) {
    $(id).checked = !!pref[clave];
    $(id).addEventListener("change", () => { pref[clave] = $(id).checked; guardarPref(); });
  }
  $("mis-preguntas").value = pref.mias;
  $("mis-preguntas").addEventListener("input", () => { pref.mias = $("mis-preguntas").value; guardarPref(); });
  const visibilidad = () => { $("caja-mias").hidden = pref.preguntas !== "mias"; $("caja-leer").hidden = pref.modo !== "auto"; $("caja-rondas").hidden = pref.preguntas !== "ejemplo"; $("caja-cerca").hidden = pref.preguntas !== "ejemplo"; };
  visibilidad();
  const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  $("aviso-instalar").hidden = !(esIOS && !navigator.standalone);
  // servida desde la computadora (direccion IP): el icono de inicio solo abre si el iPhone confia en su certificado
  if (esIOS && !navigator.standalone && /^d+.d+.d+.d+$/.test(location.hostname)) {
    const enlace = document.createElement("a");
    enlace.href = location.origin + "/ca.crt";
    enlace.textContent = "Instalar el certificado";
    enlace.style.cssText = "color:var(--acento);font-weight:600";
    const nota = document.createElement("div");
    nota.style.cssText = "margin-top:6px;font-size:13px";
    nota.append("Para que el ícono de inicio abra: ", enlace, " (toca Permitir), luego Ajustes → Perfil descargado → Instalar, y en Ajustes → General → Información → Config. de confianza de certificados activa «Detector de Reacciones CA». Después vuelve a agregar la app a inicio.");
    $("aviso-instalar").appendChild(nota);
  }
  if (!window.isSecureContext) estadoCarga("Esta página necesita abrirse con https:// para usar la cámara.", true);
  pintarSesiones();
}

function estadoCarga(texto, error = false) { $("estado-carga").textContent = texto; $("estado-carga").style.color = error ? "var(--alta)" : ""; }

async function pintarSesiones() {
  const lista = await listarSesiones();
  $("caja-sesiones").hidden = !lista.length;
  $("lista-sesiones").innerHTML = "";
  for (const s of lista) {
    const listas = s.marcas.filter(m => m.indice !== null);
    const mayor = listas.length ? Math.round(Math.max(...listas.map(m => m.indice))) : "--";
    const b = document.createElement("button");
    b.className = "sesion-guardada";
    b.type = "button";
    const fecha = new Date(s.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
    b.innerHTML = `<b>${mayor}</b><div><div></div><small></small></div>`;
    b.querySelector("div div").textContent = s.titulo;
    b.querySelector("small").textContent = `${fecha} · ${s.marcas.length} preguntas`;
    b.addEventListener("click", () => mostrarReporte(s));
    $("lista-sesiones").appendChild(b);
  }
}

function preguntasElegidas() {
  if (pref.preguntas === "ejemplo") {
    return [EJEMPLO.titulo, expandirPreguntas(EJEMPLO, Number(pref.rondas) || 1, !!pref.cerca)];
  }
  if (pref.preguntas === "mias") {
    const items = pref.mias.split("\n").map(l => l.trim()).filter(Boolean)
      .map(l => l.startsWith("*") ? { texto: l.slice(1).trim(), tipo: "neutral", grupo: null, opcion: null, clave: false }
        : { texto: l, tipo: "pregunta", grupo: null, opcion: null, clave: false });
    return ["Mis preguntas", items];
  }
  return ["Preguntas libres", []];
}

// ---------------------------------------------------------------- sesion
let t0 = 0;
const reloj = () => (performance.now() - t0) / 1000;
const S = {};                    // estado de la sesion en curso

async function empezar() {
  guardarPref();
  $("empezar").disabled = true;
  t0 = performance.now();
  // en iPhone el audio, la voz y el reconocimiento deben arrancar dentro del toque del boton
  const Contexto = window.AudioContext || window.webkitAudioContext;
  const contextoAudio = Contexto ? new Contexto() : null;
  S.transcriptor = pref.transcribir ? new Transcriptor(reloj) : null;
  if (S.transcriptor) S.transcriptor.iniciar();
  S.leer = pref.modo === "auto" && pref.leer && "speechSynthesis" in window;
  if (S.leer) speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
  try {
    estadoCarga("Abriendo la cámara…");
    const [w, h] = pref.calidad.split("x").map(Number);
    S.flujo = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: pref.camara }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } } });
    const video = $("video");
    video.srcObject = S.flujo;
    await video.play();
    S.voz = new AnalizadorVoz();
    await S.voz.iniciar(reloj, contextoAudio);
    estadoCarga("Cargando el análisis de rostro (la primera vez descarga unos 20 MB)…");
    S.rostro = new AnalizadorRostro();
    await S.rostro.cargar();
    S.manos = null;
    if (pref.manos) { try { S.manos = await crearManos(S.rostro.delegado); } catch (e) { S.manos = null; } }
    S.respiracion = null;
    if (pref.respiracion) { try { S.respiracion = new Respiracion(); await S.respiracion.cargar(S.rostro.delegado); } catch (e) { S.respiracion = null; } }
  } catch (e) {
    $("empezar").disabled = false;
    estadoCarga(e && e.name === "NotAllowedError" ? "Permite el acceso a la cámara y al micrófono para empezar."
      : `No se pudo iniciar: ${e && e.message ? e.message : e}`, true);
    detenerMedios();
    return;
  }
  let [titulo, items] = preguntasElegidas();
  if (pref.modo === "auto" && !items.length) {
    // en modo automatico la app necesita una lista para preguntar: se usa el juego de ejemplo
    [titulo, items] = (() => { const p = pref.preguntas; pref.preguntas = "ejemplo"; const r = preguntasElegidas(); pref.preguntas = p; return r; })();
  }
  S.sesion = new Sesion({ titulo, items, modo: pref.modo === "auto" ? "Celular · automático" : "Celular · con entrevistador" });
  S.parpadeos = new Parpadeos(); S.micro = new Microexpresiones(); S.conducta = new DetectorConducta();
  Object.assign(S.sesion, { voz: S.voz, transcriptor: S.transcriptor, conducta: S.conducta });
  S.sesion.conteos = { parpadeo: S.parpadeos.eventos, micro: S.micro.eventos, toques: S.conducta.series.toque, miradas: S.conducta.series.mirada,
    resp_audio: S.voz.respiraciones };
  Object.assign(S, { piel: [], pulsos: [], bpm: null, tRppg: 0, listaManos: [], cuadros: 0, tiempos: [], ultimaUI: 0,
    fase: "inicio", faseDesde: 0, indicacion: 0, activo: true, ultimo: null, indice: null, zs: {}, cercaActiva: false,
    cercaDesde: null, acercamientoActual: null, terminando: false });
  window.__detector = S;     // para pruebas
  S.cuadro = analizarCuadro; S.reloj = reloj;
  $("sesion").querySelector(".visor").classList.toggle("espejo", pref.camara === "user");
  $("resultados").classList.toggle("oculto", !!pref.ocultar);
  $("respuestas").hidden = true;
  $("saltar").hidden = $("verdad").hidden = $("mentira").hidden = pref.modo === "auto";
  mostrar("sesion");
  estadoCarga("");
  try { S.bloqueo = await navigator.wakeLock?.request("screen"); } catch (e) {}
  vigilarCamara();
  siguienteCuadro();
}

function vigilarCamara() {
  const video = $("video");
  S.ultimoCuadroVideo = performance.now();
  clearInterval(S.vigilante);
  S.vigilante = setInterval(async () => {
    if (!S.activo) { clearInterval(S.vigilante); return; }
    const pista = S.flujo?.getVideoTracks?.()[0];
    const muerta = !pista || pista.readyState === "ended" || pista.muted;
    const congelada = performance.now() - S.ultimoCuadroVideo > 3000 && document.visibilityState === "visible";
    if (!muerta && video.paused) { try { await video.play(); } catch (e) {} return; }
    if ((muerta || congelada) && !S.reabriendo) {
      S.reabriendo = true;
      try {
        const [w, h] = pref.calidad.split("x").map(Number);
        const nuevo = await navigator.mediaDevices.getUserMedia({ audio: false,
          video: { facingMode: { ideal: pref.camara }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } } });
        try { S.flujo?.getTracks().forEach(p => p.stop()); } catch (e) {}
        S.flujo = nuevo;
        video.srcObject = nuevo;
        await video.play();
        S.ultimoCuadroVideo = performance.now();
        avisar("Se reabrió la cámara");
      } catch (e) {
        avisar("La cámara se cerró y no se pudo reabrir");
      }
      S.reabriendo = false;
    }
  }, 2000);
}

function detenerMedios() {
  clearInterval(S.vigilante);
  try { S.flujo?.getTracks().forEach(p => p.stop()); } catch (e) {}
  try { S.voz?.detener(); } catch (e) {}
  try { S.transcriptor?.detener(); } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
  try { S.bloqueo?.release(); } catch (e) {}
}

function siguienteCuadro() {
  if (!S.activo) return;
  const video = $("video");
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(analizarCuadro);
  else requestAnimationFrame(analizarCuadro);
}

function analizarCuadro() {
  if (!S.activo) return;
  S.ultimoCuadroVideo = performance.now();
  const t = reloj();
  const video = $("video");
  const inicio = performance.now();
  let r = null;
  try { r = S.rostro.procesar(video, t); } catch (e) { r = null; }
  if (r) r.espejo = false;     // la imagen de la camara llega sin espejo (el espejo es solo visual)
  S.cuadros++;
  if (S.manos && S.cuadros % 3 === 0) {
    try {
      // las manos se buscan en la copia reducida (si la hay): para saber si tocan la cara sobra
      const fuente = video.videoWidth > 1280 ? S.rostro.copia : video;
      S.ts = Math.max((S.ts || 0) + 1, Math.round(performance.now()));
      const res = S.manos.detectForVideo(fuente, S.ts);
      S.listaManos = (res.landmarks || []).map(m => m.map(p => [p.x * video.videoWidth, p.y * video.videoHeight]));
    } catch (e) { S.listaManos = []; }
  }
  let micro = null;
  if (r) {
    S.parpadeos.actualizar(r.ear, t, r.parpadeoRed);
    micro = S.micro.actualizar(r.gestos, t);
    if (r.pielRgb) S.piel.push([t, ...r.pielRgb]);
  }
  S.conducta.actualizar(t, r, S.listaManos, micro);
  // respiracion por los hombros: 1 de cada 3 cuadros (la copia reducida basta)
  if (S.respiracion && S.cuadros % 3 === 1) {
    try { S.respiracion.procesar(video.videoWidth > 1280 ? S.rostro.copia : video, t, video.videoWidth, video.videoHeight); } catch (e) {}
  }
  while (S.piel.length && t - S.piel[0][0] > 12) S.piel.shift();
  if (t - S.tRppg > 1 && S.piel.length > 60 && t - S.piel[S.piel.length - 1][0] < 0.5) {
    S.tRppg = t;
    const [bpm, calidad] = posRppg(S.piel.map(p => p[0]), S.piel.map(p => p.slice(1)));
    if (bpm && calidad > 0.2) { S.pulsos.push(bpm); if (S.pulsos.length > 5) S.pulsos.shift(); S.bpm = mediana(S.pulsos); }
  }
  if (!S.piel.length || t - S.piel[S.piel.length - 1][0] > 5) { S.bpm = null; S.pulsos = []; }
  const tf = S.voz.f0.tUltimo();
  const valores = { pupila: r?.pupilaMm ?? null, pupilaMm: r?.pupilaMm ?? null, pulso: S.bpm, tension: r?.tension ?? null,
    miradaH: r?.miradaH ?? null, miradaV: r?.miradaV ?? null, movimiento: r?.movimiento ?? null, luz: r?.luz ?? null,
    tono: tf !== null && t - tf < 0.1 ? S.voz.f0.ultimo() : null, indice: S.indice, rIris: r?.rIris ?? null,
    respiracion: S.respiracion ? S.respiracion.rpm : null, boca: r?.boca ?? null };
  S.sesion.registrar(t, valores);
  S.sesion.actualizar(t);
  if (t - (S.tIndice || 0) > 0.5) { S.tIndice = t; [S.indice, S.zs] = S.sesion.indiceEnVivo(t); }
  S.ultimo = r;
  pasoProtocolo(t);
  S.tiempos.push(performance.now() - inicio);
  if (S.tiempos.length > 30) S.tiempos.shift();
  dibujarCapa(r);
  if (t - S.ultimaUI > 0.1) { S.ultimaUI = t; actualizarPantalla(t, r); }
  siguienteCuadro();
}

// ---------------------------------------------------------------- protocolo (botones y modo automatico)
function decir(texto) {
  return new Promise(resolver => {
    if (!S.leer) return resolver();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-MX";
    u.rate = 1;
    u.onend = u.onerror = () => { $("video").play().catch(() => {}); resolver(); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setTimeout(resolver, 8000);   // por si el sistema no avisa al terminar
  });
}

// --------- pupila de cerca: el celular se acerca para las preguntas marcadas `cerca`
const CERCA_MIN = 1.7, CERCA_MAX = 2.6, LEJOS_MAX = 1.3;   // iris respecto a su tamano en la calibracion

function acercamiento() {
  // cuantas veces mas grande se ve el iris que en la calibracion (mediana de los ultimos cuadros)
  const base = S.sesion.base?.rIris;
  if (!base) return null;
  const [, v] = S.sesion.series.rIris.ultimos(0.6, reloj());
  return v.length >= 3 ? mediana(v) / base : null;
}

function activarCerca(activo) {
  S.cercaActiva = activo;
  document.body.classList.toggle("cerca", activo);
  $("aviso-oscuro").hidden = !activo;
}

async function hacerPregunta() {
  const s = S.sesion;
  const item = s.itemSiguiente();
  if (!item) { S.fase = "fin"; return; }
  if (item.cerca && !S.cercaActiva && pref.modo === "auto") { S.fase = "acercar"; S.cercaDesde = null; return; }
  if (!item.cerca && S.cercaActiva && pref.modo === "auto") { S.fase = "alejar"; return; }
  await lanzarPregunta();
}

async function lanzarPregunta() {
  const s = S.sesion;
  S.fase = "leyendo";
  await decir(s.items[s.itemActual].texto);
  if (!S.activo) return;
  const mk = s.marcar(reloj(), S.cercaActiva ? acercamiento() : null);
  s.siguienteItem();
  S.marcaActual = mk;
  S.fase = "esperando";
  $("respuestas").hidden = false;
}

function pasoProtocolo(t) {
  const s = S.sesion;
  if (S.fase === "calibrando" && s.base) {
    S.fase = pref.modo === "auto" ? "lista" : "preguntas";
  }
  if (S.fase === "esperando" && t - S.marcaActual.t >= ESPERA_MARCA) {
    $("respuestas").hidden = true;
    if (pref.modo === "auto") hacerPregunta(); else S.fase = "preguntas";
  }
  if (S.fase === "acercar" || S.fase === "alejar") {
    const a = acercamiento();
    S.acercamientoActual = a;
    if (S.fase === "acercar") {
      if (!S.cercaActiva) activarCerca(true);              // pantalla oscura desde que empieza a acercar
      const enRango = a !== null && a >= CERCA_MIN && a <= CERCA_MAX && S.ultimo;
      if (enRango) {
        if (S.cercaDesde === null) S.cercaDesde = t;
        // 1.5 s quieto en el rango + 2 s para que la pupila se acostumbre a la distancia y a la pantalla oscura
        if (t - S.cercaDesde >= 3.5) { S.fase = "leyendo"; lanzarPregunta(); }
      } else S.cercaDesde = null;
    } else if (a !== null && a <= LEJOS_MAX) {
      activarCerca(false);
      hacerPregunta();
    }
  }
  if (S.fase === "fin" && pref.modo === "auto" && !S.terminando) {
    S.terminando = true;
    setTimeout(terminar, 600);
  }
}

function accion() {
  const s = S.sesion, t = reloj();
  if (S.fase === "inicio") { s.iniciarBase(t); S.fase = "calibrando"; return; }
  if (S.fase === "lista") { hacerPregunta(); return; }
  if (S.fase === "preguntas" || (pref.modo !== "auto" && S.fase === "esperando")) {
    const item = s.itemSiguiente();
    const a = acercamiento();
    const mk = s.marcar(t, item?.cerca && a !== null && a >= 1.5 ? a : null);
    s.siguienteItem();
    S.marcaActual = mk;
    S.fase = "esperando";
    avisar(`Pregunta #${mk.n} marcada`);
  }
}

function responder(respuesta) {
  const mk = S.sesion.responder(respuesta, reloj());
  if (mk) { avisar(`Respuesta: ${respuesta === "si" ? "Sí" : "No"} (${mk.rt.toFixed(2)} s)`); $("respuestas").hidden = true; }
}

function avisar(texto) { S.aviso = { texto, hasta: reloj() + 2.5 }; }

async function terminar() {
  if (!S.activo) return;
  S.activo = false;
  activarCerca(false);
  const t = reloj();
  detenerMedios();
  S.sesion.terminar(t);
  const datos = S.sesion.aJSON();
  try { datos.id = await guardarSesion(datos); } catch (e) {}
  mostrarReporte(datos);
  pintarSesiones();
  $("empezar").disabled = false;
}

// ---------------------------------------------------------------- dibujo
function dibujarCapa(r) {
  const video = $("video"), capa = $("capa");
  const W = video.videoWidth, H = video.videoHeight;
  if (!W) return;
  const ancho = 960, alto = Math.round(960 * H / W), k = ancho / W;
  if (capa.width !== ancho || capa.height !== alto) { capa.width = ancho; capa.height = alto; }
  const c = capa.getContext("2d");
  c.clearRect(0, 0, ancho, alto);
  if (S.cercaActiva) {
    if (r) {
      c.lineWidth = 2; c.strokeStyle = "rgba(140,140,140,.55)";
      c.beginPath();
      OVALO.forEach((i, j) => { const x = r.puntos[2 * i] * k, y = r.puntos[2 * i + 1] * k; j ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.closePath(); c.stroke();
      for (const o of r.ojos) { const [cx, cy] = o.centroFino || o.centro; c.beginPath(); c.arc(cx * k, cy * k, o.rIris * k, 0, 2 * Math.PI); c.stroke(); }
    }
    return;
  }
  if (r) {
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(76,201,240,.75)";
    c.beginPath();
    OVALO.forEach((i, j) => { const x = r.puntos[2 * i] * k, y = r.puntos[2 * i + 1] * k; j ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.closePath(); c.stroke();
    if (pref.malla !== "no" && S.rostro.mallaMov) {
      const tri = pref.malla === "boca" ? S.rostro.triangulosBoca : S.rostro.triangulos, mov = S.rostro.mallaMov;
      c.lineWidth = 1;
      for (const [a, b, d] of tri) {
        const m = (mov[a] + mov[b] + mov[d]) / 3;
        // azul (quieto) -> naranja -> rojo (moviendose)
        const col = m < 0.5 ? `rgba(${76 + (244 - 76) * m * 2},${201 + (183 - 201) * m * 2},${240 + (64 - 240) * m * 2},0.7)`
                            : `rgba(${244 + (255 - 244) * (m - 0.5) * 2},${183 + (93 - 183) * (m - 0.5) * 2},${64 + (93 - 64) * (m - 0.5) * 2},0.8)`;
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(r.puntos[2 * a] * k, r.puntos[2 * a + 1] * k); c.lineTo(r.puntos[2 * b] * k, r.puntos[2 * b + 1] * k); c.lineTo(r.puntos[2 * d] * k, r.puntos[2 * d + 1] * k);
        c.closePath(); c.stroke();
        if (m > 0.35) { c.fillStyle = "rgba(255,93,93,0.35)"; c.fill(); }
      }
      c.lineWidth = 1.5;
    }
  }
  if (S.respiracion && S.respiracion.hombros) {
    const [[ax, ay], [bx, by]] = S.respiracion.hombros;
    c.strokeStyle = "#A78BFA"; c.lineWidth = 2; c.beginPath(); c.moveTo(ax * k, ay * k); c.lineTo(bx * k, by * k); c.stroke();
    c.fillStyle = "#A78BFA";
    for (const [hx, hy] of S.respiracion.hombros) { c.beginPath(); c.arc(hx * k, hy * k, 5, 0, 2 * Math.PI); c.fill(); }
  }
  if (r) {
    for (const o of r.ojos) {
      const [cx, cy] = o.centroFino || o.centro;
      c.strokeStyle = "#34D399"; c.beginPath(); c.arc(cx * k, cy * k, o.rIris * k, 0, 2 * Math.PI); c.stroke();
      if (o.pupila) { c.strokeStyle = "#4CC9F0"; c.lineWidth = 2; c.beginPath(); c.arc(o.pupila.x * k, o.pupila.y * k, Math.max(1, o.pupila.r * k), 0, 2 * Math.PI); c.stroke(); c.lineWidth = 1.5; }
    }
  }
  if (S.listaManos.length) {
    c.strokeStyle = "#F4B740"; c.lineWidth = 2;
    for (const m of S.listaManos) {
      for (const [a, b] of CONEXIONES_MANO) { c.beginPath(); c.moveTo(m[a][0] * k, m[a][1] * k); c.lineTo(m[b][0] * k, m[b][1] * k); c.stroke(); }
      c.fillStyle = "#FF5D73";
      for (const p of PUNTAS) { c.beginPath(); c.arc(m[p][0] * k, m[p][1] * k, 4, 0, 2 * Math.PI); c.fill(); }
    }
  }
}

function actualizarPantalla(t, r) {
  const s = S.sesion, video = $("video");
  const ms = S.tiempos.length ? S.tiempos.reduce((a, b) => a + b) / S.tiempos.length : 0;
  $("chip-fps").textContent = `${video.videoWidth}×${video.videoHeight} · ${ms.toFixed(0)} ms · ${S.rostro.delegado}`;
  $("chip-rostro").textContent = r ? "Rostro detectado" : "Buscando rostro…";
  $("chip-rostro").classList.toggle("ok", !!r);
  $("m-pupila").textContent = r?.pupilaMm ? r.pupilaMm.toFixed(2) : "--";
  const bp = s.base?.mediasCrudas?.pupila;
  $("m-pupila-d").textContent = bp && r?.pupilaMm ? `mm · ${((r.pupilaMm / bp - 1) * 100).toFixed(1)}% vs base` : "mm";
  $("m-pulso").textContent = S.bpm ? Math.round(S.bpm) : "--";
  const [, f2] = S.voz.f0.ultimos(2, t), [, f8] = S.voz.f0.ultimos(8, t);
  $("m-tono").textContent = f2.length ? Math.round(mediana(f2)) : "--";
  $("m-tono-d").textContent = f8.length > 5 ? `Hz · ±${Math.round(Math.sqrt(f8.reduce((a, x) => a + (x - f8.reduce((p, q) => p + q) / f8.length) ** 2, 0) / f8.length))}` : (S.voz.voz.ultimo() ? "Hz · hablando" : "Hz");
  const tarjeta = $("m-indice").parentElement;
  $("m-indice").textContent = S.indice !== null && S.indice !== undefined ? Math.round(S.indice) : "--";
  $("m-nivel").textContent = s.base ? nivelTexto(S.indice) : "sin calibrar";
  tarjeta.classList.toggle("media", S.indice >= 62 && S.indice < 78);
  tarjeta.classList.toggle("alta", S.indice >= 78);
  $("m-parpadeos").textContent = Math.round(S.parpadeos.porMinuto(t));
  $("m-tension").textContent = r ? `${Math.round(r.tension)}%` : "--";
  $("m-mirada").textContent = r ? S.conducta.miradaActual.replace(/^./, c => c.toUpperCase()) : "--";
  $("m-toques").textContent = S.manos ? S.conducta.contar("toque") : "apagado";
  $("m-micro").textContent = S.conducta.contar("micro");
  $("m-resp").textContent = S.respiracion ? (S.respiracion.rpm ? `${Math.round(S.respiracion.rpm)}/min` : "midiendo…") : "apagada";
  $("m-boca").textContent = r && r.boca !== null && r.boca !== undefined ? r.boca.toFixed(2) : "--";
  const rit = S.voz.resumenRitmo(t - 20, t);
  const inh = S.voz.respiraciones.ultimos(60, t)[0].length;
  $("m-ritmo").textContent = rit.arranquesS ? `${rit.arranquesS.toFixed(1)}/s · ${inh} inh` : (inh ? `${inh} inh/min` : "--");
  $("m-cabeza").textContent = r && r.giro !== undefined ? `${r.giro >= 0 ? "+" : ""}${Math.round(r.giro)}° ${r.inclinacion >= 0 ? "+" : ""}${Math.round(r.inclinacion)}°` : "--";

  const ev = S.conducta.recientes(t, 3);
  $("eventos").innerHTML = "";
  for (const e of ev) {
    const d = document.createElement("div");
    d.textContent = e.texto;
    const sm = document.createElement("small");
    sm.textContent = `hace ${Math.round(t - e.t)} s`;
    d.appendChild(sm);
    $("eventos").appendChild(d);
  }

  // protocolo
  const estado = $("estado-protocolo"), texto = $("texto-protocolo"), pregunta = $("pregunta"), boton = $("accion");
  const prog = s.progresoBase(t);
  $("barra-calibracion").hidden = prog === null;
  estado.className = "pastilla";
  pregunta.hidden = true;
  boton.hidden = false;
  if (S.fase === "inicio") {
    estado.textContent = "Sin calibrar"; estado.classList.add("aviso-c");
    texto.innerHTML = "Primero se mide tu estado de calma: <b>45 segundos</b> mirando a la cámara y respondiendo en voz alta lo que aparezca.";
    boton.textContent = "Empezar calibración";
  } else if (S.fase === "calibrando") {
    estado.textContent = `Calibrando · ${Math.ceil(DURACION_BASE * (1 - prog))} s`; estado.classList.add("aviso-c");
    $("barra-calibracion").firstElementChild.style.width = `${Math.round(prog * 100)}%`;
    const i = Math.min(INDICACIONES_CALIBRACION.length - 1, Math.floor(prog * INDICACIONES_CALIBRACION.length));
    texto.textContent = "Calibración personal: responde con calma.";
    pregunta.hidden = false; pregunta.textContent = INDICACIONES_CALIBRACION[i];
    boton.hidden = true;
  } else if (S.fase === "lista") {
    estado.textContent = "Calibrado"; estado.classList.add("ok");
    texto.textContent = `Ahora vienen ${s.items.length || "las"} preguntas. Responde tocando Sí o No y, si quieres, también en voz alta.`;
    boton.textContent = "Comenzar preguntas";
  } else if (S.fase === "preguntas") {
    estado.textContent = "Listo para preguntar"; estado.classList.add("ok");
    const item = s.itemActual !== null && s.itemActual < s.items.length ? s.items[s.itemActual] : null;
    texto.textContent = item ? `Pregunta ${s.itemActual + 1} de ${s.items.length}. Hazla y toca Marcar al terminar de formularla.` : "Haz tu pregunta y toca Marcar al terminar de formularla.";
    if (item?.cerca) {
      const a = acercamiento();
      activarCerca(true);
      texto.textContent = a !== null && a >= CERCA_MIN && a <= CERCA_MAX ? "Distancia correcta (marco verde). Haz la pregunta y toca Marcar."
        : "Pregunta de cerca: acerca el celular hasta que el marco se ponga verde, espera 3 s y marca.";
    } else if (S.cercaActiva) activarCerca(false);
    if (item) { pregunta.hidden = false; pregunta.textContent = item.texto; }
    boton.textContent = "Marcar pregunta";
  } else if (S.fase === "acercar" || S.fase === "alejar") {
    const a = S.acercamientoActual;
    const acercar = S.fase === "acercar";
    estado.textContent = acercar ? "Acerca el celular" : "Aleja el celular"; estado.classList.add("midiendo");
    pregunta.hidden = false;
    if (!r) pregunta.textContent = "No veo la cara: mantenla dentro de la imagen.";
    else if (a === null) pregunta.textContent = "Midiendo la distancia…";
    else if (acercar && a < CERCA_MIN) pregunta.textContent = "Acércalo más, hasta que el marco se ponga verde.";
    else if (acercar && a > CERCA_MAX) pregunta.textContent = "Demasiado cerca: aléjalo un poco.";
    else if (acercar) pregunta.textContent = `Así. Quieto ${Math.max(0, Math.ceil(3.5 - (t - (S.cercaDesde ?? t))))} s…`;
    else pregunta.textContent = "Vuelve a la distancia normal.";
    texto.textContent = acercar ? "Pupila de cerca: la pantalla se oscurece y la pupila se mide más grande. Mantén la cara centrada."
                               : "Ya terminó la parte de cerca.";
    boton.hidden = true;
  } else if (S.fase === "leyendo" || S.fase === "esperando") {
    const mk = S.marcaActual;
    const resta = mk && S.fase === "esperando" ? Math.max(0, ESPERA_MARCA - (t - mk.t)) : ESPERA_MARCA;
    estado.textContent = S.fase === "leyendo" ? "Leyendo la pregunta…" : `Midiendo #${mk.n} · ${Math.ceil(resta)} s`;
    estado.classList.add("midiendo");
    pregunta.hidden = false;
    pregunta.textContent = S.fase === "leyendo" ? s.items[s.itemActual]?.texto || "" : mk.texto;
    texto.textContent = pref.modo === "auto" ? (mk?.respuesta ? "Respuesta registrada. Espera a la siguiente." : "Responde Sí o No.") : "Espera a que termine la medición antes de la siguiente pregunta.";
    if (pref.modo === "auto") boton.hidden = true; else boton.textContent = "Marcar pregunta";
  } else if (S.fase === "fin") {
    estado.textContent = "Terminado"; texto.textContent = "Preparando el reporte…"; boton.hidden = true;
  }
  const avisos = [];
  if (S.aviso && t < S.aviso.hasta) avisos.push(S.aviso.texto);
  if (r && r.rIris && r.rIris < 7) avisos.push("Acércate: el ojo se ve pequeño");
  if (r && r.luz !== undefined && r.luz < 55) avisos.push("Poca luz en la cara");
  if (!S.cercaActiva && s.base?.luz && r?.luz && Math.abs(r.luz - s.base.luz) / s.base.luz > 0.12) avisos.push("Cambió la luz");
  // marco guia de distancia (verde en el rango de "cerca")
  const guia = $("guia-cerca"), ac = S.acercamientoActual ?? acercamiento();
  const mostrarGuia = S.fase === "acercar" || S.fase === "alejar" || (S.fase === "preguntas" && s.itemSiguiente()?.cerca);
  guia.hidden = !mostrarGuia;
  if (mostrarGuia) {
    const enRango = ac !== null && ac >= CERCA_MIN && ac <= CERCA_MAX;
    guia.classList.toggle("ok", enRango && S.fase !== "alejar");
    guia.classList.toggle("lejos", S.fase === "alejar" && ac !== null && ac <= LEJOS_MAX);
    const pos = ac === null ? 0 : Math.min(1, Math.max(0, (ac - 1) / 2));
    guia.querySelector("i").style.left = `${pos * 100}%`;
    guia.querySelector("b").textContent = ac === null ? "--" : `${ac.toFixed(1)}×`;
  }
  if (S.transcriptor && S.transcriptor.estado !== "Transcribiendo" && S.transcriptor.estado !== "Lista") avisos.push(S.transcriptor.estado);
  $("aviso").textContent = avisos[0] || "";
}

// ---------------------------------------------------------------- reporte
let reporteActual = null;
function mostrarReporte(d) {
  reporteActual = d;
  $("contenido-reporte").innerHTML = `<style>${CSS_REPORTE}</style>${cuerpoReporte(d)}`;
  mostrar("reporte");
  window.scrollTo(0, 0);
}

async function compartir() {
  if (!reporteActual) return;
  const html = archivoReporte(reporteActual);
  const nombre = `reporte-${(reporteActual.fecha || "").slice(0, 16).replace(/[:T]/g, "-")}.html`;
  const archivo = new File([html], nombre, { type: "text/html" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) { await navigator.share({ files: [archivo], title: "Reporte de reacciones" }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

function mostrar(id) { for (const p of ["inicio", "sesion", "reporte"]) $(p).hidden = p !== id; }

// ---------------------------------------------------------------- arranque
$("empezar").addEventListener("click", empezar);
$("accion").addEventListener("click", accion);
$("r-si").addEventListener("click", () => responder("si"));
$("r-no").addEventListener("click", () => responder("no"));
$("saltar").addEventListener("click", () => S.sesion?.siguienteItem());
$("verdad").addEventListener("click", () => { S.sesion?.etiquetarUltima("verdad"); avisar("Marcada como verdad"); });
$("mentira").addEventListener("click", () => { S.sesion?.etiquetarUltima("mentira"); avisar("Marcada como mentira"); });
$("terminar").addEventListener("click", terminar);
$("volver").addEventListener("click", () => mostrar("inicio"));
$("compartir").addEventListener("click", compartir);
$("borrar").addEventListener("click", async () => {
  if (!reporteActual?.id) { mostrar("inicio"); return; }
  if ($("borrar").dataset.confirmar !== "1") { $("borrar").dataset.confirmar = "1"; $("borrar").textContent = "Toca otra vez para borrar"; return; }
  await borrarSesion(reporteActual.id);
  $("borrar").dataset.confirmar = ""; $("borrar").textContent = "Borrar esta sesión";
  await pintarSesiones();
  mostrar("inicio");
});
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && S.activo) { try { S.bloqueo = await navigator.wakeLock?.request("screen"); } catch (e) {} }
});
if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(() => {});
prepararInicio();
