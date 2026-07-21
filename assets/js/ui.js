/* ============================================================
   ui.js — Mundial 2026
   Capa de DOM compartido entre todas las páginas.
   Escucha eventos de api.js y reacciona visualmente.
   No hace fetch, no conoce la red — solo manipula el DOM.
   ============================================================ */

/* ── 1. Referencias a elementos globales ────────────────── */

/*
  Estos elementos existen en el HTML base de cada página.
  ui.js los busca una sola vez al cargar y los reutiliza.
  Si un elemento no existe en una página particular,
  la función que lo usa verifica antes de actuar.
*/

const modalSesion     = document.getElementById('modal_sesion')
const overlayModal    = document.getElementById('modal_overlay')
const btnReautenticar = document.getElementById('btn_reautenticar')
const bannerCache     = document.getElementById('banner_cache')
const bannerCountdown = document.getElementById('banner_countdown')
const textoCountdown  = document.getElementById('texto_countdown')

/* ── 2. Estado interno ──────────────────────────────────── */

/*
  intervalCountdown guarda la referencia del setInterval
  del countdown para poder detenerlo cuando sea necesario.
  Si no se guarda la referencia, no hay forma de llamar
  clearInterval() después.
*/

let intervalCountdown = null

/* ── 3. Escucha de eventos de api.js ────────────────────── */

/*
  ui.js no importa funciones de api.js ni viceversa.
  La comunicación es únicamente a través de CustomEvents
  disparados en document. Esto desacopla completamente
  las dos capas: red y presentación.
*/

document.addEventListener('api:session-expired', () => {
  mostrarModalSesion()
})

document.addEventListener('api:rate-limited', (e) => {
  const { segundos } = e.detail
  iniciarCountdown(segundos)
})

document.addEventListener('api:serving-cache', () => {
  mostrarBannerCache()
})

document.addEventListener('api:retry', (e) => {
  const { intento, maxIntentos, esperaMs } = e.detail
  mostrarMensajeReintento(intento, maxIntentos, esperaMs)
})

/* ── 4. Modal de sesión expirada (401) ──────────────────── */

/*
  El modal se muestra cuando api.js detecta un 401.
  No recarga la página — el usuario puede reautenticarse
  desde el mismo modal sin perder el estado de la interfaz.
*/

function mostrarModalSesion() {
  if (!modalSesion || !overlayModal) return
  modalSesion.removeAttribute('hidden')
  overlayModal.removeAttribute('hidden')

  /*
    El foco se mueve al botón de reautenticación para que
    el usuario con teclado o lector de pantalla lo encuentre
    inmediatamente sin tener que navegar por el modal.
  */
  if (btnReautenticar) {
    btnReautenticar.focus()
  }

  /*
    aria-modal="true" le indica a los lectores de pantalla
    que el contenido detrás del modal no es interactuable.
  */
  modalSesion.setAttribute('aria-modal', 'true')
}

function ocultarModalSesion() {
  if (!modalSesion || !overlayModal) return
  modalSesion.setAttribute('hidden', '')
  overlayModal.setAttribute('hidden', '')
  modalSesion.removeAttribute('aria-modal')
}

/*
  El botón de reautenticación cierra el modal y dispara
  un evento para que la página correspondiente vuelva
  a intentar cargar sus datos.
*/
if (btnReautenticar) {
  btnReautenticar.addEventListener('click', () => {
    ocultarModalSesion()
    document.dispatchEvent(new CustomEvent('ui:reautenticar'))
  })
}

/*
  Cerrar el modal al hacer clic en el overlay
  es un patrón UX estándar.
*/
if (overlayModal) {
  overlayModal.addEventListener('click', ocultarModalSesion)
}

/* ── 5. Countdown visible (429) ─────────────────────────── */

/*
  Muestra una cuenta regresiva en pantalla indicando
  cuándo ocurrirá el siguiente reintento automático.
  El enunciado exige que sea visible — no basta con
  reintentar silenciosamente en segundo plano.
*/

function iniciarCountdown(segundos) {
  if (!bannerCountdown || !textoCountdown) return

  /*
    Si hay un countdown anterior corriendo, lo detenemos
    antes de iniciar uno nuevo para evitar múltiples
    intervalos ejecutándose en paralelo.
  */
  detenerCountdown()

  let restantes = segundos
  bannerCountdown.removeAttribute('hidden')
  textoCountdown.textContent = `Demasiadas solicitudes. Reintentando en ${restantes}s...`

  intervalCountdown = setInterval(() => {
    restantes -= 1
    textoCountdown.textContent = `Demasiadas solicitudes. Reintentando en ${restantes}s...`

    if (restantes <= 0) {
      detenerCountdown()
    }
  }, 1000)
}

function detenerCountdown() {
  if (intervalCountdown !== null) {
    clearInterval(intervalCountdown)
    intervalCountdown = null
  }

  if (bannerCountdown) {
    bannerCountdown.setAttribute('hidden', '')
  }
}

/* ── 6. Banner de datos no actualizados (caché) ─────────── */

/*
  Se muestra cuando api.js sirvió datos desde localStorage
  en lugar de la red. El usuario debe saber que lo que
  ve puede no ser la información más reciente.
*/

function mostrarBannerCache() {
  if (!bannerCache) return
  bannerCache.removeAttribute('hidden')
}

function ocultarBannerCache() {
  if (!bannerCache) return
  bannerCache.setAttribute('hidden', '')
}

/* ── 7. Skeletons de carga ──────────────────────────────── */

/*
  Los skeletons son placeholders visuales que se muestran
  mientras se espera la respuesta de la API.
  Evitan que el usuario vea una pantalla en blanco.

  contenedor: el elemento del DOM donde se insertan
  cantidad:   cuántos skeletons renderizar
  tipo:       'card' | 'fila' | 'celda' — forma visual del skeleton
*/

function mostrarSkeletons(contenedor, cantidad = 4, tipo = 'card') {
  if (!contenedor) return

  contenedor.innerHTML = ''

  for (let i = 0; i < cantidad; i++) {
    const skeleton = document.createElement('div')
    skeleton.classList.add('skeleton_base', `skeleton_${tipo}`)
    skeleton.setAttribute('aria-hidden', 'true')
    contenedor.appendChild(skeleton)
  }
}

function ocultarSkeletons(contenedor) {
  if (!contenedor) return

  contenedor.querySelectorAll('.skeleton_base').forEach(el => el.remove())
}

/* ── 8. Mensajes de error en pantalla ───────────────────── */

/*
  Muestra un mensaje de error dentro de un contenedor
  sin usar alert(). El mensaje incluye un botón de reintento
  que la página puede escuchar con el evento 'ui:reintentar'.

  contenedor: el elemento del DOM donde se muestra el error
  mensaje:    texto descriptivo del error para el usuario
  endpoint:   el endpoint que falló, para identificar el reintento
*/

function mostrarError(contenedor, mensaje, endpoint = '') {
  if (!contenedor) return

  contenedor.innerHTML = `
    <div class="estado_error" role="alert" aria-live="assertive">
      <span class="estado_error_icono" aria-hidden="true">⚠️</span>
      <p class="estado_error_mensaje">${mensaje}</p>
      <button
        class="btn btn_outline estado_error_btn"
        data-endpoint="${endpoint}"
        aria-label="Reintentar la carga de datos"
      >
        Reintentar
      </button>
    </div>
  `

  /*
    El botón de reintento dispara un evento con el endpoint
    que falló. La página escucha 'ui:reintentar' y vuelve
    a llamar a api.js con ese endpoint.
  */
  const btnReintentar = contenedor.querySelector('.estado_error_btn')

  if (btnReintentar) {
    btnReintentar.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('ui:reintentar', {
        detail: { endpoint },
        bubbles: true
      }))
    })
  }
}

/* ── 9. Mensajes de estado vacío ────────────────────────── */

/*
  Se usa cuando la API respondió correctamente pero
  no devolvió datos (array vacío o sin resultados
  para el filtro aplicado).
*/

function mostrarVacio(contenedor, mensaje = 'No hay datos disponibles.') {
  if (!contenedor) return

  contenedor.innerHTML = `
    <div class="estado_vacio" role="status">
      <span class="estado_vacio_icono" aria-hidden="true">📭</span>
      <p class="estado_vacio_mensaje">${mensaje}</p>
    </div>
  `
}

/* ── 10. Mensaje de reintento en curso ──────────────────── */

/*
  Se muestra en el banner de countdown cuando api.js
  está en medio del backoff exponencial para 500 o red.
*/

function mostrarMensajeReintento(intento, maxIntentos, esperaMs) {
  if (!bannerCountdown || !textoCountdown) return

  bannerCountdown.removeAttribute('hidden')
  textoCountdown.textContent =
    `Error de conexión. Reintento ${intento} de ${maxIntentos} en ${esperaMs / 1000}s...`
}