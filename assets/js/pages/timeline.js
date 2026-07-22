/* ============================================================
   timeline.js — Mundial 2026
   Campos API: home_team_name_en, away_team_name_en,
               finished: "TRUE", local_date: "06/11/2026 13:00"
   ============================================================ */

const contenedor_timeline = document.getElementById('contenedor_timeline')
let   centinela           = document.getElementById('timeline_centinela')
const indicador_cargando  = document.getElementById('timeline_cargando_mas')
const indicador_fin       = document.getElementById('timeline_fin')

const BLOQUE_SIZE = 10

let todos_los_partidos    = []
let partidos_insertados   = 0
let observer              = null
let fecha_actual_separador = ''

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  document.addEventListener('ui:reintentar', async () => {
    limpiarTimeline()
    await iniciarVista()
  })

  document.addEventListener('ui:reautenticar', async () => {
    limpiarTodoElCache()
    limpiarTimeline()
    await iniciarVista()
  })
})

async function iniciarVista() {
  mostrarSkeletons(contenedor_timeline, 5, 'fila')

  try {
    const resultado = await obtenerPartidos()

    /*
      local_date: "06/11/2026 13:00" — formato MM/DD/YYYY HH:MM
      new Date() lo parsea correctamente para ordenar cronológicamente
    */
    todos_los_partidos = resultado.datos
      .filter(p => p.local_date)
      .sort((a, b) => new Date(a.local_date) - new Date(b.local_date))

    ocultarSkeletons(contenedor_timeline)

    if (todos_los_partidos.length === 0) {
      mostrarVacio(contenedor_timeline, 'No hay partidos disponibles.')
      return
    }

    partidos_insertados    = 0
    fecha_actual_separador = ''

    // Si el centinela no existe, crearlo
    if (!centinela) {
      centinela = document.createElement('div')
      centinela.id = 'timeline_centinela'
      centinela.className = 'timeline_centinela'
      centinela.setAttribute('aria-hidden', 'true')
      contenedor_timeline.appendChild(centinela)
    }
    insertarBloque()

    centinela = document.createElement('div')
    centinela.id = 'timeline_centinela'
    centinela.className = 'timeline_centinela'
    centinela.setAttribute('aria-hidden', 'true')
    contenedor_timeline.appendChild(centinela)

    if (partidos_insertados < todos_los_partidos.length) {
      activarObserver()
    } else {
      mostrarFinDelTimeline()
    }

  } catch (error) {
    console.error('ERROR EN TIMELINE:', error.message, error.stack) 
    ocultarSkeletons(contenedor_timeline)
    mostrarError(contenedor_timeline, 'No se pudo cargar el timeline.', '/get/games')
  }
}

function activarObserver() {
  if (!centinela || !contenedor_timeline.contains(centinela)) {
    centinela = document.createElement('div')
    centinela.id = 'timeline_centinela'
    centinela.className = 'timeline_centinela'
    centinela.setAttribute('aria-hidden', 'true')
    contenedor_timeline.appendChild(centinela)
  }

  if (observer) {
    observer.disconnect()
    observer = null
  }

  observer = new IntersectionObserver((entradas) => {
    entradas.forEach(entrada => {
      if (!entrada.isIntersecting) return
      insertarBloque()
      if (partidos_insertados >= todos_los_partidos.length) {
        observer.disconnect()
        observer = null
        mostrarFinDelTimeline()
      }
    })
  }, { threshold: 0.1 })

  observer.observe(centinela)
}

function insertarBloque() {
  if (!contenedor_timeline) return

  const siguiente_bloque = todos_los_partidos.slice(
    partidos_insertados,
    partidos_insertados + BLOQUE_SIZE
  )

  const centinela_valido = centinela && contenedor_timeline.contains(centinela)

  siguiente_bloque.forEach(partido => {
    const fecha_partido = partido.local_date
      ? partido.local_date.split(' ')[0]
      : ''

    if (fecha_partido && fecha_partido !== fecha_actual_separador) {
      fecha_actual_separador = fecha_partido
      const separador = crearSeparadorFecha(fecha_partido)
      if (centinela_valido) {
        contenedor_timeline.insertBefore(separador, centinela)
      } else {
        contenedor_timeline.appendChild(separador)
      }
    }

    const item = crearItemTimeline(partido)
    if (centinela_valido) {
      contenedor_timeline.insertBefore(item, centinela)
    } else {
      contenedor_timeline.appendChild(item)
    }
  })

  partidos_insertados += siguiente_bloque.length

  if (indicador_cargando) {
    const quedan = todos_los_partidos.length - partidos_insertados
    if (quedan > 0) {
      indicador_cargando.removeAttribute('hidden')
      const texto = indicador_cargando.querySelector('.timeline_cargando_texto')
      if (texto) {
        texto.textContent =
          `Cargando... (${partidos_insertados} de ${todos_los_partidos.length})`
      }
    } else {
      indicador_cargando.setAttribute('hidden', '')
    }
  }
}

function crearItemTimeline(partido) {
  const item   = document.createElement('div')
  item.className = 'timeline_item'

  const jugado          = partido.finished === 'TRUE'
  const nombre_local    = partido.home_team_name_en ?? 'Por definir'
  const nombre_visitante = partido.away_team_name_en ?? 'Por definir'

  /* Hora: "06/11/2026 13:00" → "13:00" */
  const hora = partido.local_date
    ? partido.local_date.split(' ')[1]
    : 'TBD'

  item.innerHTML = `
    <div class="timeline_punto" aria-hidden="true"></div>
    <div class="timeline_card_wrap">
      <article class="timeline_card"
        aria-label="${nombre_local} vs ${nombre_visitante}">

        <div class="timeline_equipos">
          <span class="timeline_equipo">${nombre_local}</span>

          ${jugado
            ? `<span class="timeline_resultado"
                aria-label="${partido.home_score} a ${partido.away_score}">
                ${partido.home_score} — ${partido.away_score}
               </span>`
            : `<span class="timeline_vs" aria-hidden="true">VS</span>`}

          <span class="timeline_equipo timeline_equipo_visitante">
            ${nombre_visitante}
          </span>
        </div>

        <div class="timeline_meta">
          <span class="timeline_meta_item">🕐 ${hora}</span>
          ${partido.group
            ? `<span class="timeline_meta_item badge badge_pendiente">Grupo ${partido.group}</span>`
            : ''}
          <span class="badge ${jugado ? 'badge_jugado' : 'badge_pendiente'}">
            ${jugado ? 'Jugado' : 'Pendiente'}
          </span>
        </div>

      </article>
    </div>
  `

  return item
}

function crearSeparadorFecha(fechaStr) {
  const separador = document.createElement('div')
  separador.className = 'timeline_separador'
  separador.setAttribute('aria-hidden', 'true')
  separador.innerHTML = `
    <span class="timeline_separador_fecha">${formatearFecha(fechaStr)}</span>
    <span class="timeline_separador_linea"></span>
  `
  return separador
}

function mostrarFinDelTimeline() {
  if (indicador_cargando) indicador_cargando.setAttribute('hidden', '')
  if (indicador_fin) {
    indicador_fin.removeAttribute('hidden')
    indicador_fin.textContent = `✓ ${todos_los_partidos.length} partidos cargados`
  }
}

function limpiarTimeline() {
  if (observer) {
    observer.disconnect()
    observer = null
  }

  todos_los_partidos    = []
  partidos_insertados   = 0
  fecha_actual_separador = ''

  if (contenedor_timeline) {
    /*
      Eliminamos todos los hijos EXCEPTO el centinela.
      No usamos innerHTML = '' porque destruiría la referencia
      al centinela que el IntersectionObserver necesita.
    */
    Array.from(contenedor_timeline.children).forEach(hijo => {
      if (hijo !== centinela) hijo.remove()
    })
  }

  if (indicador_fin) indicador_fin.setAttribute('hidden', '')
  if (indicador_cargando) indicador_cargando.setAttribute('hidden', '')
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return ''
  try {
    const fecha = new Date(fechaStr)
    return new Intl.DateTimeFormat('es-CR', {
      weekday: 'long',
      day:     'numeric',
      month:   'long'
    }).format(fecha)
  } catch {
    return fechaStr
  }
}