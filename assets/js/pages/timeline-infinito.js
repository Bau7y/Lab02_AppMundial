/* ============================================================
   timeline.js — Mundial 2026
   Orquesta la vista Timeline Infinito.
   Técnica DOM: IntersectionObserver sobre un centinela
   para insertar bloques de 10 partidos al hacer scroll.
   ============================================================ */

/* ── 1. Referencias al DOM ──────────────────────────────── */

const contenedor_timeline = document.getElementById('contenedor_timeline')
const centinela           = document.getElementById('timeline_centinela')
const indicador_cargando  = document.getElementById('timeline_cargando_mas')
const indicador_fin       = document.getElementById('timeline_fin')

/* ── 2. Configuración ───────────────────────────────────── */

const BLOQUE_SIZE = 10  /* partidos por bloque de inserción */

/* ── 3. Estado de la vista ──────────────────────────────── */

/*
  todos_los_partidos: array completo ordenado cronológicamente.
  partidos_insertados: cuántos ya están en el DOM.
  observer: referencia al IntersectionObserver activo.
  fecha_actual_separador: última fecha renderizada,
    para saber cuándo insertar un separador de día.
*/
let todos_los_partidos    = []
let partidos_insertados   = 0
let observer              = null
let fecha_actual_separador = ''

/* ── 4. Inicialización ──────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  document.addEventListener('ui:reintentar', async () => {
    /*
      Al reintentar se limpia el timeline para no duplicar
      los partidos que podrían haberse insertado parcialmente
      en un intento previo.
    */
    limpiarTimeline()
    await iniciarVista()
  })

  document.addEventListener('ui:reautenticar', async () => {
    limpiarTodoElCache()
    limpiarTimeline()
    await iniciarVista()
  })
})

/* ── 5. Carga inicial ───────────────────────────────────── */

async function iniciarVista() {
  mostrarSkeletons(contenedor_timeline, 5, 'fila')

  try {
    const resultado = await obtenerPartidos()

    /*
      Ordenar cronológicamente por local_date.
      localeCompare funciona para strings de fecha ISO
      porque el formato YYYY-MM-DD es lexicográficamente
      equivalente al orden cronológico.
    */
    todos_los_partidos = resultado.datos
      .filter(p => p.local_date)
      .sort((a, b) => a.local_date.localeCompare(b.local_date))

    ocultarSkeletons(contenedor_timeline)

    if (todos_los_partidos.length === 0) {
      mostrarVacio(contenedor_timeline, 'No hay partidos disponibles.')
      return
    }

    partidos_insertados    = 0
    fecha_actual_separador = ''

    /* Insertar el primer bloque antes de activar el observer */
    insertarBloque()

    /* Activar el observer solo si quedan más partidos */
    if (partidos_insertados < todos_los_partidos.length) {
      activarObserver()
    } else {
      mostrarFinDelTimeline()
    }

  } catch (error) {
    ocultarSkeletons(contenedor_timeline)
    mostrarError(
      contenedor_timeline,
      'No se pudo cargar el timeline. Verificá tu conexión.',
      '/get/games'
    )
  }
}

/* ── 6. IntersectionObserver ────────────────────────────── */

/*
  El observer vigila el elemento centinela al final de la lista.
  Cuando el centinela entra al viewport (threshold: 0.1 = 10%
  visible), se inserta el siguiente bloque de partidos.

  threshold: 0.1 — el callback dispara cuando el 10% del
  centinela es visible. Evita disparos prematuros cuando
  el centinela apenas aparece en el borde del viewport.
*/
function activarObserver() {
  if (!centinela) return

  /*
    Si ya había un observer activo de un intento anterior,
    lo desconectamos antes de crear uno nuevo.
    Sin esto, el observer viejo seguiría activo y podría
    insertar partidos en estados inconsistentes.
  */
  if (observer) {
    observer.disconnect()
    observer = null
  }

  observer = new IntersectionObserver((entradas) => {
    entradas.forEach(entrada => {
      if (!entrada.isIntersecting) return

      insertarBloque()

      if (partidos_insertados >= todos_los_partidos.length) {
        /*
          Ya se insertaron todos los partidos.
          Desconectamos el observer — no tiene nada más que observar.
        */
        observer.disconnect()
        observer = null
        mostrarFinDelTimeline()
      }
    })
  }, { threshold: 0.1 })

  observer.observe(centinela)
}

/* ── 7. Inserción de un bloque ──────────────────────────── */

/*
  Toma los siguientes BLOQUE_SIZE partidos desde
  todos_los_partidos y los inserta en el DOM.
  No reconstruye elementos ya insertados.
*/
function insertarBloque() {
  if (!contenedor_timeline) return

  const siguiente_bloque = todos_los_partidos.slice(
    partidos_insertados,
    partidos_insertados + BLOQUE_SIZE
  )

  siguiente_bloque.forEach(partido => {
    const fecha_partido = partido.local_date
      ? partido.local_date.split('T')[0]
      : ''

    /*
      Si el día cambió respecto al último partido insertado,
      añadimos un separador de fecha antes de la card.
    */
    if (fecha_partido && fecha_partido !== fecha_actual_separador) {
      fecha_actual_separador = fecha_partido
      const separador = crearSeparadorFecha(fecha_partido)
      contenedor_timeline.insertBefore(separador, centinela)
    }

    const item = crearItemTimeline(partido)
    contenedor_timeline.insertBefore(item, centinela)
  })

  partidos_insertados += siguiente_bloque.length

  if (indicador_cargando) {
    const quedan = todos_los_partidos.length - partidos_insertados
    if (quedan > 0) {
      indicador_cargando.removeAttribute('hidden')
      indicador_cargando.querySelector('.timeline_cargando_texto').textContent =
        `Cargando más partidos... (${partidos_insertados} de ${todos_los_partidos.length})`
    } else {
      indicador_cargando.setAttribute('hidden', '')
    }
  }
}

/* ── 8. Crear item del timeline ─────────────────────────── */

function crearItemTimeline(partido) {
  const item = document.createElement('div')
  item.className = 'timeline_item'

  const jugado = partido.home_score !== null && partido.away_score !== null
  const hora   = partido.local_date
    ? new Date(partido.local_date).toLocaleTimeString('es-CR', {
        hour:   '2-digit',
        minute: '2-digit'
      })
    : 'TBD'

  item.innerHTML = `
    <div class="timeline_punto" aria-hidden="true"></div>
    <div class="timeline_card_wrap">
      <article class="timeline_card"
        aria-label="Partido: ${partido.home_team ?? 'TBD'} vs ${partido.away_team ?? 'TBD'}">

        <div class="timeline_equipos">
          <span class="timeline_equipo">${partido.home_team ?? 'Por definir'}</span>

          ${jugado
            ? `<span class="timeline_resultado"
                aria-label="Resultado: ${partido.home_score} a ${partido.away_score}">
                ${partido.home_score} — ${partido.away_score}
               </span>`
            : `<span class="timeline_vs" aria-hidden="true">VS</span>`}

          <span class="timeline_equipo timeline_equipo_visitante">
            ${partido.away_team ?? 'Por definir'}
          </span>
        </div>

        <div class="timeline_meta">
          <span class="timeline_meta_item">🕐 ${hora}</span>
          ${partido.stadium
            ? `<span class="timeline_meta_item">🏟️ ${partido.stadium}</span>`
            : ''}
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

/* ── 9. Crear separador de fecha ────────────────────────── */

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

/* ── 10. Fin del timeline ───────────────────────────────── */

function mostrarFinDelTimeline() {
  if (indicador_cargando) {
    indicador_cargando.setAttribute('hidden', '')
  }

  if (indicador_fin) {
    indicador_fin.removeAttribute('hidden')
    indicador_fin.textContent =
      `✓ ${todos_los_partidos.length} partidos cargados`
  }
}

/* ── 11. Limpiar timeline ───────────────────────────────── */

/*
  Se llama antes de reintentar para no duplicar
  los partidos ya insertados en el DOM.
*/
function limpiarTimeline() {
  if (observer) {
    observer.disconnect()
    observer = null
  }

  todos_los_partidos    = []
  partidos_insertados   = 0
  fecha_actual_separador = ''

  if (contenedor_timeline) {
    contenedor_timeline.innerHTML = ''

    /* Restaurar el centinela y los indicadores */
    if (centinela) contenedor_timeline.appendChild(centinela)
  }

  if (indicador_fin) indicador_fin.setAttribute('hidden', '')
  if (indicador_cargando) indicador_cargando.setAttribute('hidden', '')
}

/* ── 12. Utilidades ─────────────────────────────────────── */

function formatearFecha(fechaStr) {
  if (!fechaStr) return ''
  try {
    const fecha = new Date(`${fechaStr}T00:00:00`)
    return new Intl.DateTimeFormat('es-CR', {
      weekday: 'long',
      day:     'numeric',
      month:   'long'
    }).format(fecha)
  } catch {
    return fechaStr
  }
}