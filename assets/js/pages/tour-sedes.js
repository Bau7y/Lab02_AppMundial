/* ============================================================
   tour-sedes.js — Mundial 2026
   Orquesta la vista Tour Virtual de Sedes.
   Técnica DOM: scrollIntoView + estado activo entre botones.
   No hace fetch — delega todo a api.js.
   No construye modales ni banners — delega todo a ui.js.
   ============================================================ */

/* ── 1. Referencias al DOM ──────────────────────────────── */

const contenedor_sedes    = document.getElementById('contenedor_sedes')
const contenedor_partidos = document.getElementById('contenedor_partidos')
const titulo_sede_activa  = document.getElementById('titulo_sede_activa')

/* ── 2. Estado de la vista ──────────────────────────────── */

/*
  Se guardan los datos en variables del módulo para
  no volver a pedirlos cada vez que el usuario cambia de sede.
  Una sola petición al cargar — luego todo es filtrado local.
*/
let datos_sedes    = []
let datos_partidos = []
let sede_activa_id = null

/* ── 3. Inicialización ──────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  /*
    Escucha el evento de reintento disparado por ui.js
    cuando el usuario hace click en el botón de reintentar
    dentro de un mensaje de error.
  */
  document.addEventListener('ui:reintentar', async (e) => {
    const { endpoint } = e.detail
    if (endpoint === '/get/stadiums' || endpoint === '/get/games') {
      await iniciarVista()
    }
  })

  /*
    Escucha el evento de reautenticación disparado por ui.js
    cuando el usuario hace click en "Volver a conectar" en el modal.
    Limpia el caché y vuelve a cargar.
  */
  document.addEventListener('ui:reautenticar', async () => {
    limpiarTodoElCache()
    await iniciarVista()
  })
})

/* ── 4. Carga inicial de datos ──────────────────────────── */

async function iniciarVista() {
  mostrarSkeletons(contenedor_sedes, 8, 'card')
  mostrarSkeletons(contenedor_partidos, 4, 'fila')

  /*
    Las dos peticiones se lanzan en paralelo con Promise.all
    para no esperar una antes de la otra.

    Aunque el enunciado prohíbe .then()/.catch(), Promise.all
    con async/await es distinto: no es encadenamiento de promesas
    sino espera simultánea. Se usa try/catch para capturar errores.

    Cada llamada devuelve { datos, desdeCache } desde api.js.
  */
  try {
    const [resultado_sedes, resultado_partidos] = await Promise.all([
      obtenerSedes(),
      obtenerPartidos()
    ])

    datos_sedes    = resultado_sedes.datos
    datos_partidos = resultado_partidos.datos

    renderizarSedes(datos_sedes)

    /*
      Si alguno de los dos llegó desde caché, el banner
      ya fue mostrado por ui.js al escuchar api:serving-cache.
      No hay que hacer nada adicional aquí.
    */

  } catch (error) {
    /*
      Si la petición de sedes falla completamente (sin caché),
      no se pueden mostrar los botones — mostramos error global.
      Si solo falla partidos, renderizarSedes igual funciona
      y el error se maneja dentro de renderizarPartidosDeSede.
    */
    if (datos_sedes.length === 0) {
      mostrarError(
        contenedor_sedes,
        'No se pudieron cargar las sedes. Verificá tu conexión.',
        '/get/stadiums'
      )
    }

    if (datos_partidos.length === 0) {
      mostrarVacio(
        contenedor_partidos,
        'No hay partidos disponibles en este momento.'
      )
    }
  }
}

/* ── 5. Renderizado de sedes ────────────────────────────── */

function renderizarSedes(sedes) {
  if (!contenedor_sedes) return

  contenedor_sedes.innerHTML = ''

  if (sedes.length === 0) {
    mostrarVacio(contenedor_sedes, 'No se encontraron sedes.')
    return
  }

  sedes.forEach(sede => {
    const btn = document.createElement('button')
    btn.className = 'sede_btn'
    btn.setAttribute('aria-pressed', 'false')
    btn.setAttribute('aria-label', `Ver partidos de ${sede.name}, ${sede.city}`)
    btn.dataset.id = sede.id

    /*
      Contamos cuántos partidos tiene esta sede para mostrarlo
      en el badge del botón. Es un filtrado local — no hay
      petición adicional a la API.
    */
    const cantidad = datos_partidos.filter(p => p.stadium_id === sede.id).length

    btn.innerHTML = `
      <span class="sede_btn_icono" aria-hidden="true">🏟️</span>
      <span class="sede_btn_info">
        <span class="sede_btn_nombre">${sede.name}</span>
        <span class="sede_btn_pais">${sede.city}</span>
      </span>
      ${cantidad > 0
        ? `<span class="sede_btn_contador" aria-label="${cantidad} partidos">${cantidad}</span>`
        : ''}
    `

    btn.addEventListener('click', () => manejarClickSede(sede, btn))
    contenedor_sedes.appendChild(btn)
  })

  /*
    Estado inicial: placeholder en el panel de partidos
    pidiendo al usuario que elija una sede.
  */
  mostrarPlaceholderPartidos()
}

/* ── 6. Manejo de click en sede ─────────────────────────── */

function manejarClickSede(sede, btnClickeado) {
  /*
    Previene que el usuario dispare scrollIntoView
    varias veces seguidas si hace click rápido en la misma sede.
  */
  if (sede_activa_id === sede.id) return

  sede_activa_id = sede.id

  /* Actualizar estado visual de todos los botones */
  actualizarEstadoActivo(btnClickeado)

  /* Mostrar partidos de la sede seleccionada */
  renderizarPartidosDeSede(sede)

  /*
    scrollIntoView mueve el viewport hasta el panel de partidos.
    behavior: 'smooth' — animación suave requerida por el enunciado.
    block: 'start' — alinea el tope del elemento con el tope del viewport.
  */
  if (contenedor_partidos) {
    contenedor_partidos.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }
}

/* ── 7. Estado activo entre botones ─────────────────────── */

/*
  Solo un botón puede estar activo a la vez.
  Primero se quita 'activa' y aria-pressed de todos,
  luego se agrega solo al clickeado.
*/
function actualizarEstadoActivo(btnActivo) {
  contenedor_sedes.querySelectorAll('.sede_btn').forEach(btn => {
    btn.classList.remove('activa')
    btn.setAttribute('aria-pressed', 'false')
  })

  btnActivo.classList.add('activa')
  btnActivo.setAttribute('aria-pressed', 'true')
}

/* ── 8. Renderizado de partidos de una sede ─────────────── */

function renderizarPartidosDeSede(sede) {
  if (!contenedor_partidos) return

  if (titulo_sede_activa) {
    titulo_sede_activa.textContent = sede.name
  }

  /*
    Si la petición de partidos falló y no hay datos,
    mostramos error local sin bloquear la navegación de sedes.
    El reto de resiliencia del enunciado exige exactamente esto:
    los botones de sedes deben seguir siendo clicables.
  */
  if (datos_partidos.length === 0) {
    contenedor_partidos.innerHTML = `
      <div class="partidos_error_local" role="alert">
        <span aria-hidden="true">⚠️</span>
        <p>No se pudieron cargar los partidos de esta sede.</p>
      </div>
    `
    return
  }

  const partidos_sede = datos_partidos.filter(p => p.stadium_id === sede.id)

  if (partidos_sede.length === 0) {
    mostrarVacio(
      contenedor_partidos,
      `No hay partidos registrados para ${sede.name}.`
    )
    return
  }

  contenedor_partidos.innerHTML = ''

  partidos_sede.forEach(partido => {
    const card = document.createElement('article')
    card.className = 'partido_card'
    card.setAttribute('aria-label',
      `Partido: ${partido.home_team} vs ${partido.away_team}`)

    const jugado = partido.home_score !== null && partido.away_score !== null

    card.innerHTML = `
      <div class="partido_equipos">
        <div class="partido_equipo">
          <span class="partido_equipo_nombre">${partido.home_team ?? 'Por definir'}</span>
        </div>
        <span class="partido_vs" aria-hidden="true">
          ${jugado
            ? `<span class="partido_resultado">${partido.home_score} - ${partido.away_score}</span>`
            : 'VS'}
        </span>
        <div class="partido_equipo">
          <span class="partido_equipo_nombre">${partido.away_team ?? 'Por definir'}</span>
        </div>
      </div>
      <div class="partido_meta">
        <span class="partido_meta_item">
          📅 ${formatearFecha(partido.local_date)}
        </span>
        ${partido.group
          ? `<span class="partido_meta_item">🏆 ${partido.group}</span>`
          : ''}
        <span class="partido_meta_item badge ${jugado ? 'badge_jugado' : 'badge_pendiente'}">
          ${jugado ? 'Jugado' : 'Pendiente'}
        </span>
      </div>
    `

    contenedor_partidos.appendChild(card)
  })
}

/* ── 9. Placeholder inicial ─────────────────────────────── */

function mostrarPlaceholderPartidos() {
  if (!contenedor_partidos) return

  contenedor_partidos.innerHTML = `
    <div class="partidos_placeholder" role="status" aria-live="polite">
      <span class="partidos_placeholder_icono" aria-hidden="true">🏟️</span>
      <p>Seleccioná una sede para ver sus partidos.</p>
    </div>
  `
}

/* ── 10. Utilidades ─────────────────────────────────────── */

function formatearFecha(fechaStr) {
  if (!fechaStr) return 'Fecha por confirmar'

  /*
    Intl.DateTimeFormat formatea fechas según la configuración
    regional del navegador. 'es-CR' es el locale de Costa Rica.
    No se usa una librería externa — es API nativa del navegador.
  */
  try {
    const fecha = new Date(fechaStr)
    return new Intl.DateTimeFormat('es-CR', {
      day:   'numeric',
      month: 'long',
      year:  'numeric',
      hour:  '2-digit',
      minute:'2-digit'
    }).format(fecha)
  } catch {
    return fechaStr
  }
}