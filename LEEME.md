# Detector de Reacciones · versión para iPhone

La app corre completa dentro del celular: cámara, análisis del rostro y la pupila, voz, conducta,
calibración personal, preguntas, índice y reporte. Nada sale del teléfono; las sesiones se guardan
en el propio iPhone.

## Cómo abrirla

**Por ahora (con la computadora como «servidor»):**
1. En la computadora, abre el Detector y presiona **App del celular**. Aparece un código QR.
2. Con el iPhone en el mismo Wi-Fi, escanea el código o escribe en Safari solo la dirección IP de la
   computadora (por ejemplo `10.0.0.105`): salta sola a la app. Si escribes la dirección completa,
   que empiece con `https://`.
3. Acepta el aviso de seguridad: toca **Mostrar detalles → visitar este sitio web**.
4. Para tenerla como app con ícono, primero haz que el iPhone confíe en la computadora (una sola vez):
   - En Safari abre `https://IP-de-la-computadora:8444/ca.crt` (el link aparece en la ventana del QR y en
     el aviso de la app) y toca **Permitir**.
   - Ve a **Ajustes → Perfil descargado → Instalar**.
   - Ve a **Ajustes → General → Información → Configuración de confianza de certificados** y activa
     **Detector de Reacciones CA**.
   - Vuelve a Safari, abre la app y toca **Compartir → Agregar a inicio**.

   Sin este paso, el ícono de inicio se queda en blanco: las apps agregadas a inicio no dejan aceptar
   certificados desconocidos. El certificado solo sirve para tu computadora en tu red; puedes quitarlo
   cuando quieras en Ajustes → General → VPN y gestión de dispositivos.

**Sin computadora:** hay que publicarla en internet, por ejemplo en GitHub Pages (gratis), y abrir
esa dirección una vez en Safari. Después, el ícono de inicio la abre incluso sin internet.

## Cómo se usa

- **Automático:** la app guía la calibración de 45 segundos, lee cada pregunta en voz alta y la
  persona responde tocando **Sí** o **No**, y también puede hacerlo en voz alta. La app avanza sola
  y al final muestra el reporte. El tiempo que tarda en tocar la respuesta es la señal con más
  respaldo científico en el Test de Información Oculta.
- **Con entrevistador:** alguien hace las preguntas y toca **Marcar pregunta** al terminar de
  formularlas, igual que en la computadora.

**Cámaras:**
- **Frontal:** la persona se ve en la pantalla. Activa «Ocultar resultados en vivo» para que no vea
  los números.
- **Trasera:** da mejor calidad de pupila, sobre todo en 4K. La sostiene otra persona o va en un soporte.

**Preguntas:** el juego del objeto escondido viene incluido (sus opciones se mezclan en cada sesión).
También puedes escribir tus propias preguntas, una por renglón; las que empiezan con `*` son neutrales.

## Qué mide

Usa los mismos métodos de la versión de computadora:
- **Pupila:** se mide en la imagen completa, con un filtro de reflejos.
- **Rostro y gestos:** 478 puntos y 52 gestos con MediaPipe.
- **Conducta:** microexpresiones, hacia dónde mira, toques de la cara, movimientos de cabeza y parpadeos.
- **Pulso:** por el color de la piel.
- **Voz:** tono, variación y volumen.
- **Lo que dice:** la transcripción usa el reconocimiento de voz del iPhone, y se analizan las palabras en español,
  incluidos los detalles comprobables (testigos, horas, lugares, mensajes, recibos).
- **Ritmo del habla:** arranques de voz por segundo, pausas y rango del tono: lo que más cambia con el estrés.
- **Respiración:** por los hombros (cámara) y, con audífonos con micrófono, por el sonido de las inhalaciones.
- **Malla facial:** sobre la boca o toda la cara, coloreada según el movimiento de la expresión.
- **Rondas del juego:** cada grupo del objeto escondido se pregunta 2 o 3 veces en orden distinto.
- **Pupila de cerca:** en la última ronda de cada grupo, la app pide acercar el celular hasta que el
  marco se ponga verde (unos 25–30 cm: el iris se ve 1.7 a 2.6 veces más grande que en la calibración),
  oscurece la pantalla para que su luz no mueva la pupila, espera 3.5 s a que la pupila se acostumbre
  y entonces hace las preguntas. Al terminar el grupo pide alejar el celular. Toda la ronda se mide de
  cerca, así cada opción se compara en las mismas condiciones. En el reporte esas preguntas aparecen
  como «medida de cerca». Baja el brillo del celular al mínimo antes de empezar.

Al arrancar, la app prueba si en ese teléfono es más rápido usar la gráfica o el procesador, y se
queda con el más rápido.

## Diferencias con la versión de computadora

- **Sin sensores Bluetooth:** el navegador del iPhone no los permite. El pulso sale solo de la piel.
- **Transcripción menos detallada:** el reconocimiento de voz del iPhone no da el tiempo exacto de
  cada palabra, y puede no funcionar mientras otra app usa el micrófono.
- **Sin análisis con Claude:** no se envía nada fuera del teléfono.

## Archivos

- `index.html`, `estilos.css`, `js/`: la app.
- `vendor/`: MediaPipe Tasks Vision 1.1.0 (Apache-2.0).
- `modelos/`: los modelos de rostro y manos.
- `sw.js`, `manifest.webmanifest`, `iconos/`: lo que permite instalarla y abrirla sin internet.
