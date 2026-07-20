/* ============================================================
   agenda.js — Mundial 2026
   Orquesta la vista Agenda Simultánea.
   Técnica DOM: agrupación por fecha, layout dividido
   en columnas, navegación anterior/siguiente.
   ============================================================ */

/* ── 1. Referencias al DOM ──────────────────────────────── */

const contenedor_agenda  = document.getElementById('contenedor_agenda')
const btn_fecha_anterior = document.getElementById('btn_fecha_anterior')
const btn_fecha_siguiente = document.getElementById('btn_fecha_siguiente')
const titulo_fecha       = document.getElementById('titulo_fecha')
const contador_fecha     = document.getElementById('contador_fecha')

/* ── 2. Estado de la vista ──────────────────────────────── */

/*
  fechas_con_simultaneos: array de strings de fecha
  que tienen 2 o más partidos en el mismo día.
  indice_fecha_actual: posición en ese array.
  partidos_por_fecha: Map donde la clave es la fecha
  y el valor es el array de partidos de ese día.
  equipos_por_id: Map para cruzar team_id con nombre real.
*/
let fechas_con_simultaneos = []
let indice_fecha_actual    = 0
let partidos_por_fecha     = new Map()
let equipos_por_id         = new Map()

/* ── 3. Inicialización ──────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  btn_fecha_anterior?.addEventListener('click', () => {
    if (indice_fecha_actual > 0) {
      indice_fecha_actual--
      renderizarFechaActual()
    }
  })

  btn_fecha_siguiente?.addEventListener('click', () => {
    if (indice_fecha_actual < fechas_con_simultaneos.length - 1) {
      indice_fecha_actual++
      renderizarFechaActual()
    }
  })

  document.addEventListener('ui:reintentar', async () => {
    await iniciarVista()
  })

  document.addEventListener('ui:reautenticar', async () => {
    limpiarTodoElCache()
    await iniciarVista()
  })
})

/* ── 4. Carga inicial ───────────────────────────────────── */

async function iniciarVista() {
  mostrarSkeletons(contenedor_agenda, 2, 'fila')

  try {
    const [resultado_partidos, resultado_equipos] = await Promise.all([
      obtenerPartidos(),
      obtenerEquipos()
    ])

    /* Construir Map de equipos para cruce por id */
    resultado_equipos.datos.forEach(equipo => {
      equipos_por_id.set(equipo.id, equipo)
    })

    procesarPartidos(resultado_partidos.datos)

  } catch (error) {
    mostrarError(
      contenedor_agenda,
      'No se pudo cargar la agenda. Verificá tu conexión.',
      '/get/games'
    )
  }
}

/* ── 5. Procesamiento de partidos ───────────────────────── */

/*
  Agrupa los partidos por local_date y detecta
  los días con 2 o más partidos simultáneos.
*/
function procesarPartidos(partidos) {
  partidos_por_fecha = new Map()

  partidos.forEach(partido => {
    /*
      local_date puede venir como string ISO completo.
      Extraemos solo la parte de la fecha (YYYY-MM-DD)
      para agrupar sin importar la hora.
    */
    const fecha = partido.local_date
      ? partido.local_date.split('T')[0]
      : 'sin_fecha'

    if (!partidos_por_fecha.has(fecha)) {
      partidos_por_fecha.set(fecha, [])
    }

    partidos_por_fecha.get(fecha).push(partido)
  })

  /*
    Filtramos solo las fechas con 2 o más partidos
    y las ordenamos cronológicamente.
  */
  fechas_con_simultaneos = [...partidos_por_fecha.entries()]
    .filter(([, lista]) => lista.length >= 2)
    .map(([fecha]) => fecha)
    .sort()

  if (fechas_con_simultaneos.length === 0) {
    mostrarVacio(
      contenedor_agenda,
      'No se encontraron fechas con partidos simultáneos.'
    )
    return
  }

  indice_fecha_actual = 0
  renderizarFechaActual()
}

/* ── 6. Renderizado de la fecha actual ──────────────────── */

function renderizarFechaActual() {
  const fecha   = fechas_con_simultaneos[indice_fecha_actual]
  const partidos = partidos_por_fecha.get(fecha) ?? []

  /* Actualizar título y contador */
  if (titulo_fecha) {
    titulo_fecha.textContent = formatearFecha(fecha)
  }

  if (contador_fecha) {
    contador_fecha.textContent =
      `${indice_fecha_actual + 1} de ${fechas_con_simultaneos.length} fechas con partidos simultáneos`
  }

  /* Actualizar estado de los botones de navegación */
  if (btn_fecha_anterior) {
    btn_fecha_anterior.disabled = indice_fecha_actual === 0
    btn_fecha_anterior.setAttribute('aria-disabled', indice_fecha_actual === 0)
  }

  if (btn_fecha_siguiente) {
    const es_ultima = indice_fecha_actual === fechas_con_simultaneos.length - 1
    btn_fecha_siguiente.disabled = es_ultima
    btn_fecha_siguiente.setAttribute('aria-disabled', es_ultima)
  }

  renderizarColumnas(partidos)
}

/* ── 7. Renderizado del layout dividido ─────────────────── */

/*
  Cada partido del día recibe su propia columna.
  El CSS con auto-fit y minmax distribuye las columnas
  automáticamente según el espacio disponible.
*/
function renderizarColumnas(partidos) {
  if (!contenedor_agenda) return

  contenedor_agenda.innerHTML = ''

  if (partidos.length < 2) {
    contenedor_agenda.innerHTML = `
      <div class="agenda_un_partido" role="status">
        <p>Este día tiene menos de 2 partidos simultáneos.</p>
      </div>
    `
    return
  }

  const grid = document.createElement('div')
  grid.className = 'agenda_columnas'
  grid.setAttribute('role', 'list')
  grid.setAttribute('aria-label', `Partidos del ${formatearFecha(fechas_con_simultaneos[indice_fecha_actual])}`)

  partidos.forEach(partido => {
    const columna = crearColumnaPartido(partido)
    grid.appendChild(columna)
  })

  contenedor_agenda.appendChild(grid)
}

/* ── 8. Crear columna individual ────────────────────────── */

function crearColumnaPartido(partido) {
  const columna = document.createElement('article')
  columna.className = 'agenda_columna'
  columna.setAttribute('role', 'listitem')

  /*
    Cruzamos team_id con el Map de equipos para obtener
    el nombre real. Si el equipo aún no está definido
    (partidos de fases eliminatorias sin equipos asignados),
    mostramos "Por definir".
  */
  const equipo_local    = equipos_por_id.get(partido.home_team_id)
  const equipo_visitante = equipos_por_id.get(partido.away_team_id)

  const nombre_local    = equipo_local?.name     ?? partido.home_team    ?? 'Por definir'
  const nombre_visitante = equipo_visitante?.name ?? partido.away_team   ?? 'Por definir'
  const pais_local      = equipo_local?.country  ?? ''
  const pais_visitante  = equipo_visitante?.country ?? ''

  const jugado = partido.home_score !== null && partido.away_score !== null
  const hora   = partido.local_date
    ? new Date(partido.local_date).toLocaleTimeString('es-CR', {
        hour:   '2-digit',
        minute: '2-digit'
      })
    : 'Hora TBD'

  columna.innerHTML = `
    <div class="agenda_columna_header">
      <span class="agenda_columna_hora" aria-label="Hora del partido: ${hora}">
        🕐 ${hora}
      </span>
      <span class="badge ${jugado ? 'badge_jugado' : 'badge_pendiente'}">
        ${jugado ? 'Jugado' : 'Pendiente'}
      </span>
    </div>

    <div class="agenda_partido" aria-label="Partido: ${nombre_local} vs ${nombre_visitante}">
      <div class="agenda_partido_equipos">

        <div class="agenda_equipo">
          <span class="agenda_equipo_nombre">${nombre_local}</span>
          ${pais_local
            ? `<span class="agenda_equipo_pais">${pais_local}</span>`
            : ''}
        </div>

        <div>
          ${jugado
            ? `<div class="agenda_marcador" aria-label="Resultado: ${partido.home_score} a ${partido.away_score}">
                ${partido.home_score} - ${partido.away_score}
               </div>`
            : `<div class="agenda_vs" aria-hidden="true">VS</div>`}
        </div>

        <div class="agenda_equipo">
          <span class="agenda_equipo_nombre">${nombre_visitante}</span>
          ${pais_visitante
            ? `<span class="agenda_equipo_pais">${pais_visitante}</span>`
            : ''}
        </div>

      </div>

      <div class="agenda_partido_footer">
        <span class="agenda_partido_sede">
          🏟️ ${partido.stadium ?? 'Sede por confirmar'}
        </span>
        ${partido.group
          ? `<span class="badge badge_pendiente">Grupo ${partido.group}</span>`
          : ''}
      </div>
    </div>
  `

  return columna
}

/* ── 9. Utilidades ──────────────────────────────────────── */

function formatearFecha(fechaStr) {
  if (!fechaStr || fechaStr === 'sin_fecha') return 'Fecha por confirmar'

  try {
    /*
      Al parsear solo la fecha (YYYY-MM-DD) sin hora,
      JavaScript la interpreta en UTC. Añadir T00:00:00
      fuerza la interpretación local y evita que el día
      aparezca un día antes por diferencia de zona horaria.
    */
    const fecha = new Date(`${fechaStr}T00:00:00`)
    return new Intl.DateTimeFormat('es-CR', {
      weekday: 'long',
      day:     'numeric',
      month:   'long',
      year:    'numeric'
    }).format(fecha)
  } catch {
    return fechaStr
  }
}