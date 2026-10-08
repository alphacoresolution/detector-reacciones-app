// Lo que dice la persona: reconocimiento de voz del sistema (en iPhone, el de Apple) y analisis en espanol.
// El analisis de palabras es el mismo de la version de computadora.

export class Transcriptor {
  constructor(reloj) {
    this.reloj = reloj;
    this.frases = [];          // { t, texto }
    this.activo = false;
    this.disponible = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    this.estado = this.disponible ? "Lista" : "Este navegador no transcribe";
  }
  iniciar() {
    if (!this.disponible) return false;
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.rec = new R();
    this.rec.lang = "es-MX";
    this.rec.continuous = true;
    this.rec.interimResults = false;
    this.rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          const texto = ev.results[i][0].transcript.trim();
          if (texto) this.frases.push({ t: this.reloj(), texto });
        }
      }
    };
    this.rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { this.estado = "Transcripción no permitida"; this.activo = false; }
      else if (ev.error === "audio-capture") this.estado = "El micrófono está ocupado";
    };
    // el sistema corta el reconocimiento tras un silencio: se reanuda solo mientras la sesion siga
    this.rec.onend = () => { if (this.activo) { try { this.rec.start(); } catch (e) {} } };
    this.activo = true;
    try { this.rec.start(); this.estado = "Transcribiendo"; } catch (e) { this.estado = "No se pudo iniciar la transcripción"; }
    return true;
  }
  detener() { this.activo = false; try { this.rec.stop(); } catch (e) {} }
  texto(t0, t1) { return this.frases.filter(f => f.t >= t0 && f.t <= t1).map(f => f.texto).join(" ").trim(); }
}

export function normalizar(texto) {
  return texto.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

const CATEGORIAS = {
  muletillas: ["eh", "ehh", "em", "emm", "mm", "mmm", "este", "o sea", "pues", "bueno", "digamos", "tipo", "osea", "ah"],
  dudas: ["creo", "creo que", "tal vez", "quizas", "quiza", "a lo mejor", "supongo", "puede ser", "no se", "no estoy seguro",
    "no estoy segura", "mas o menos", "posiblemente", "probablemente", "igual y", "no me acuerdo", "no recuerdo", "no lo recuerdo",
    "como que", "medio"],
  enfasis: ["te lo juro", "lo juro", "juro", "honestamente", "sinceramente", "la verdad", "de verdad", "en serio", "creeme",
    "te lo prometo", "para ser honesto", "para ser honesta", "sin mentirte", "neta", "palabra", "por dios", "francamente",
    "te soy sincero", "te soy sincera"],
  autocorreccion: ["digo", "perdon", "mejor dicho", "o sea no", "bueno no", "espera", "no espera"],
  negaciones: ["no", "nunca", "jamas", "nada", "nadie", "ninguno", "ninguna"],
  yo: ["yo", "me", "mi", "mis", "conmigo", "mio", "mia"],
  sensoriales: ["vi", "veia", "mire", "escuche", "oi", "olia", "olor", "sonido", "ruido", "color", "frio", "caliente", "senti",
    "sentia", "toque", "sabor", "brillante", "oscuro", "voz"],
  espaciales: ["aqui", "alli", "ahi", "alla", "aca", "cerca", "lejos", "al lado", "enfrente", "detras", "encima", "debajo", "abajo",
    "arriba", "adentro", "afuera", "izquierda", "derecha", "esquina", "junto a"],
  temporales: ["antes", "despues", "luego", "mientras", "entonces", "primero", "a las", "ayer", "hoy", "manana", "minutos", "horas",
    "rato", "noche", "tarde", "en cuanto", "de repente"],
};
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// las frases largas primero: "te lo juro" cuenta una vez, no tambien como "lo juro" y "juro"
const PATRONES = Object.fromEntries(Object.entries(CATEGORIAS).map(([k, frases]) =>
  [k, [...frases].sort((a, b) => b.length - a.length).map(f => new RegExp(`(?<![a-zñ])${escapar(f)}(?![a-zñ])`, "g"))]));
const VACIAS = new Set("el la los las un una unos unas de del al a en y o que se lo le les su sus es fue era por para con sin como mas muy tu te ti mi me yo usted ese esa eso este esta esto hay".split(" "));
const INTERROGATIVAS = ["que", "como", "donde", "cuando", "por que", "quien", "cual", "cuanto", "cuanta", "cuantos"];

// Detalles que alguien podria comprobar (enfoque de verificabilidad): testigos, horas exactas, lugares con
// nombre, registros (mensajes, fotos, recibos, camaras). Las personas sinceras dan mas (g = 0.42-0.49).
const VERIFICABLES = {
  testigos: ["estaba con", "estuve con", "me acompano", "me acompanaba", "lo vio", "la vio", "me vio", "nos vio", "testigo",
    "le puede preguntar", "preguntale", "preguntenle", "junto con", "mi esposa", "mi esposo", "mi mama", "mi papa", "mi hermano",
    "mi hermana", "mi amigo", "mi amiga", "mi jefe", "mi vecino", "mi vecina", "mi novia", "mi novio", "mis companeros", "mis amigos"],
  registros: ["mensaje", "whatsapp", "llamada", "llame", "me llamo", "foto", "video", "recibo", "ticket", "factura", "camara", "camaras",
    "correo", "transferencia", "pago", "tarjeta", "boleto", "ubicacion", "gps", "registro", "comprobante", "nota", "firma", "historial",
    "chat", "publique", "subi"],
  lugares: ["en la tienda", "en el oxxo", "en el super", "en la oficina", "en el trabajo", "en la escuela", "en el banco",
    "en el restaurante", "en casa de", "en el gimnasio", "en la farmacia", "en el hospital", "en la calle", "en la colonia",
    "en la plaza", "en el centro", "en el estacionamiento"],
};
const PATRONES_VERIF = Object.values(VERIFICABLES).flat().sort((a, b) => b.length - a.length).map(f => new RegExp(`(?<![a-zñ])${escapar(f)}(?![a-zñ])`, "g"));
const HORA = /(?<![a-z\d])(a las|como a las|tipo|alrededor de las|a la)\s+(\d{1,2}(:\d{2})?|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(\s+y\s+(media|cuarto))?|\d{1,2}:\d{2}|\d{1,2}\s*(am|pm|de la manana|de la tarde|de la noche)/g;
const NOMBRE = /\b(con|y|de|a)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/g;

export function detallesVerificables(texto) {
  const norm = normalizar(texto || "");
  const ejemplos = [];
  let total = 0;
  const anotar = (m) => { total++; if (ejemplos.length < 6) ejemplos.push(m); };
  for (const p of PATRONES_VERIF) for (const m of norm.matchAll(new RegExp(p.source, "g"))) anotar(m[0]);
  for (const m of norm.matchAll(new RegExp(HORA.source, "g"))) anotar(m[0]);
  for (const m of (texto || "").matchAll(new RegExp(NOMBRE.source, "g"))) anotar(m[2]);
  return [total, ejemplos];
}

export function esSiNo(pregunta) {
  const p = normalizar(pregunta || "").replace(/^[¿¡\s]+/, "").trim();
  if (p.includes("→")) return true;      // opciones del Test de Informacion Oculta
  return !!p && !INTERROGATIVAS.some(w => p.startsWith(w));
}

function contar(patrones, texto) {
  let total = 0;
  for (const p of patrones) texto = texto.replace(p, () => { total++; return " "; });
  return total;
}

// Senales verbales de una respuesta. `base` = como hablo la persona en reposo. `latencia` y `segundos`
// vienen del analisis de voz (el reconocimiento del sistema no da tiempos por palabra).
export function analizar(texto, { pregunta = null, base = null, latencia = null, segundosHabla = null } = {}) {
  const norm = normalizar(texto || "");
  const palabras = norm.match(/[a-zñ]+/g) || [];
  const n = palabras.length;
  const c = Object.fromEntries(Object.entries(PATRONES).map(([k, pats]) => [k, contar(pats, norm)]));
  let repeticiones = 0;
  for (let i = 1; i < palabras.length; i++) if (palabras[i] === palabras[i - 1] && !["no", "si"].includes(palabras[i])) repeticiones++;
  c.autocorreccion += repeticiones;
  const v = {
    texto: texto || "", palabras: n, latencia,
    ppm: segundosHabla && segundosHabla > 0.8 && n >= 3 ? Math.round(n / segundosHabla * 600) / 10 : null,
    directa: n > 0 && palabras.slice(0, 3).some(p => ["si", "no", "nunca", "jamas", "claro", "nop", "sip"].includes(p)),
    ...c,
  };
  v.detalles = v.sensoriales + v.espaciales + v.temporales;
  [v.verificables, v.ejemplosVerificables] = detallesVerificables(texto);
  v.muletillas100 = n ? Math.round(v.muletillas / n * 1000) / 10 : null;
  v.dudas100 = n ? Math.round(v.dudas / n * 1000) / 10 : null;
  v.repitePregunta = false;
  if (pregunta && n) {
    const clave = (normalizar(pregunta.split("→").pop()).match(/[a-zñ]+/g) || []).filter(w => w.length > 3 && !VACIAS.has(w));
    if (clave.length >= 2) {
      const inicio = new Set(palabras.slice(0, 12));
      v.repitePregunta = clave.filter(w => inicio.has(w)).length / clave.length >= 0.6 && !v.directa;
    }
  }
  const s = [];
  if (n === 0) s.push("No respondió en voz alta");
  else {
    if (v.muletillas >= 2) s.push(`${v.muletillas} muletillas`);
    if (v.dudas) s.push("Expresó dudas" + (v.dudas > 1 ? ` ×${v.dudas}` : ""));
    if (v.enfasis) s.push("Recalcó su honestidad");
    if (v.autocorreccion) s.push("Se corrigió o repitió palabras");
    if (v.repitePregunta) s.push("Repitió la pregunta antes de contestar");
    if (esSiNo(pregunta) && !v.directa) s.push("No empezó con sí o no");
    if (n >= 12 && !esSiNo(pregunta)) {
      if (v.verificables === 0) s.push("Sin detalles comprobables");
      else if (v.verificables >= 2) s.push(`${v.verificables} detalles comprobables`);
    }
  }
  if (base && n) {
    if (v.ppm && base.ppm) {
      const cambio = v.ppm / base.ppm - 1;
      if (cambio <= -0.25) s.push(`Habló ${Math.round(-cambio * 100)}% más lento que en reposo`);
      else if (cambio >= 0.25) s.push(`Habló ${Math.round(cambio * 100)}% más rápido que en reposo`);
      v.ppmRel = Math.round(v.ppm / base.ppm * 100) / 100;
    }
    if (v.muletillas100 !== null && base.muletillas100 !== null && v.muletillas100 >= base.muletillas100 + 4) s.push("Más muletillas que en reposo");
  }
  if (latencia !== null && base && base.latencia && latencia > base.latencia + 1) s.push(`Tardó ${(latencia - base.latencia).toFixed(1)} s más en responder que en reposo`);
  v.senales = s;
  return v;
}
