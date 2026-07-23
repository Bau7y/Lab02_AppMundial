/* Referencias a elementos globales */


const modalSesion     = document.getElementById('modal_sesion')
const overlayModal    = document.getElementById('modal_overlay')
const btnReautenticar = document.getElementById('btn_reautenticar')
const bannerCache     = document.getElementById('banner_cache')
const bannerCountdown = document.getElementById('banner_countdown')
const textoCountdown  = document.getElementById('texto_countdown')

/* Estado interno */

let intervalCountdown = null

/* Escucha de eventos de api.js */

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

/* Modal de sesión expirada (401) */

function mostrarModalSesion() {
  if (!modalSesion || !overlayModal) return
  modalSesion.removeAttribute('hidden')
  overlayModal.removeAttribute('hidden')

  if (btnReautenticar) {
    btnReautenticar.focus()
  }

  modalSesion.setAttribute('aria-modal', 'true')
}

function ocultarModalSesion() {
  if (!modalSesion || !overlayModal) return
  modalSesion.setAttribute('hidden', '')
  overlayModal.setAttribute('hidden', '')
  modalSesion.removeAttribute('aria-modal')
}

if (btnReautenticar) {
  btnReautenticar.addEventListener('click', () => {
    ocultarModalSesion()
    document.dispatchEvent(new CustomEvent('ui:reautenticar'))
  })
}

if (overlayModal) {
  overlayModal.addEventListener('click', ocultarModalSesion)
}

/* Countdown visible (429) */

function iniciarCountdown(segundos) {
  if (!bannerCountdown || !textoCountdown) return

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

/* Banner de datos no actualizados (caché) */

function mostrarBannerCache() {
  if (!bannerCache) return
  bannerCache.removeAttribute('hidden')
}

function ocultarBannerCache() {
  if (!bannerCache) return
  bannerCache.setAttribute('hidden', '')
}

/* Skeletons de carga */

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

/* Mensajes de error en pantalla */


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

/* Mensajes de estado vacío */

function mostrarVacio(contenedor, mensaje = 'No hay datos disponibles.') {
  if (!contenedor) return

  contenedor.innerHTML = `
    <div class="estado_vacio" role="status">
      <span class="estado_vacio_icono" aria-hidden="true">📭</span>
      <p class="estado_vacio_mensaje">${mensaje}</p>
    </div>
  `
}

/* Mensaje de reintento en curso */

function mostrarMensajeReintento(intento, maxIntentos, esperaMs) {
  if (!bannerCountdown || !textoCountdown) return

  bannerCountdown.removeAttribute('hidden')
  textoCountdown.textContent =
    `Error de conexión. Reintento ${intento} de ${maxIntentos} en ${esperaMs / 1000}s...`
}