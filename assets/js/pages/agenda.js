const contenedor_agenda   = document.getElementById('contenedor_agenda')
const btn_fecha_anterior  = document.getElementById('btn_fecha_anterior')
const btn_fecha_siguiente = document.getElementById('btn_fecha_siguiente')
const titulo_fecha        = document.getElementById('titulo_fecha')
const contador_fecha      = document.getElementById('contador_fecha')

let fechas_con_simultaneos = []
let indice_fecha_actual    = 0
let partidos_por_fecha     = new Map()
let equipos_por_id         = new Map()

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

async function iniciarVista() {
  mostrarSkeletons(contenedor_agenda, 2, 'fila')

  try {
    const [resultado_partidos, resultado_equipos] = await Promise.all([
      obtenerPartidos(),
      obtenerEquipos()
    ])

    resultado_equipos.datos.forEach(equipo => {
      equipos_por_id.set(String(equipo.id), equipo)
    })

    procesarPartidos(resultado_partidos.datos)

  } catch (error) {
    mostrarError(contenedor_agenda, 'No se pudo cargar la agenda.', '/get/games')
  }
}

function procesarPartidos(partidos) {
  partidos_por_fecha = new Map()

  partidos.forEach(partido => {
    /*
      de "06/11/2026 13:00"
      a usar .split(' ')[0] para dar como resultado "06/11/2026"
    */
    const fecha = partido.local_date
      ? partido.local_date.split(' ')[0]
      : 'sin_fecha'

    if (!partidos_por_fecha.has(fecha)) {
      partidos_por_fecha.set(fecha, [])
    }
    partidos_por_fecha.get(fecha).push(partido)
  })

  fechas_con_simultaneos = [...partidos_por_fecha.entries()]
    .filter(([, lista]) => lista.length >= 2)
    .map(([fecha]) => fecha)
    .sort((a, b) => {

      return new Date(a) - new Date(b)
    })

  if (fechas_con_simultaneos.length === 0) {
    mostrarVacio(contenedor_agenda, 'No se encontraron fechas con partidos simultáneos.')
    return
  }

  indice_fecha_actual = 0
  renderizarFechaActual()
}

function renderizarFechaActual() {
  const fecha    = fechas_con_simultaneos[indice_fecha_actual]
  const partidos = partidos_por_fecha.get(fecha) ?? []

  if (titulo_fecha) {
    titulo_fecha.textContent = formatearFecha(fecha)
  }

  if (contador_fecha) {
    contador_fecha.textContent =
      `${indice_fecha_actual + 1} de ${fechas_con_simultaneos.length} fechas`
  }

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

  partidos.forEach(partido => {
    const columna = crearColumnaPartido(partido)
    grid.appendChild(columna)
  })

  contenedor_agenda.appendChild(grid)
}

function crearColumnaPartido(partido) {
  const columna = document.createElement('article')
  columna.className = 'agenda_columna'
  columna.setAttribute('role', 'listitem')

  const jugado          = partido.finished === 'TRUE'
  const nombre_local    = partido.home_team_name_en ?? 'Por definir'
  const nombre_visitante = partido.away_team_name_en ?? 'Por definir'

  const hora = partido.local_date
    ? partido.local_date.split(' ')[1]
    : 'TBD'

  columna.innerHTML = `
    <div class="agenda_columna_header">
      <span class="agenda_columna_hora" aria-label="Hora: ${hora}">🕐 ${hora}</span>
      <span class="badge ${jugado ? 'badge_jugado' : 'badge_pendiente'}">
        ${jugado ? 'Jugado' : 'Pendiente'}
      </span>
    </div>

    <div class="agenda_partido" aria-label="${nombre_local} vs ${nombre_visitante}">
      <div class="agenda_partido_equipos">
        <div class="agenda_equipo">
          <span class="agenda_equipo_nombre">${nombre_local}</span>
        </div>
        <div>
          ${jugado
            ? `<div class="agenda_marcador">${partido.home_score} - ${partido.away_score}</div>`
            : `<div class="agenda_vs" aria-hidden="true">VS</div>`}
        </div>
        <div class="agenda_equipo">
          <span class="agenda_equipo_nombre">${nombre_visitante}</span>
        </div>
      </div>

      <div class="agenda_partido_footer">
        <span class="agenda_partido_sede">
          ${partido.group ? `* Grupo ${partido.group}` : ''}
        </span>
        <span class="badge badge_pendiente">${partido.type ?? ''}</span>
      </div>
    </div>
  `

  return columna
}

function formatearFecha(fechaStr) {
  if (!fechaStr || fechaStr === 'sin_fecha') return 'Fecha por confirmar'
  try {
    const fecha = new Date(fechaStr)
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