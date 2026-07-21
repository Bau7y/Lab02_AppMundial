/* ============================================================
   dashboard.js — Mundial 2026
   Campos API: teams: id, name_en, flag, groups (letra)
               groups: name, teams: [{team_id, mp, w, d, l, gf, ga, pts}]
               games: home_team_id, away_team_id, finished: "TRUE"
                      home_team_name_en, away_team_name_en
   ============================================================ */

const selector_equipo      = document.getElementById('selector_equipo')
const contenedor_dashboard = document.getElementById('contenedor_dashboard')
const contenedor_partidos  = document.getElementById('contenedor_partidos_equipo')
const contenedor_grupo     = document.getElementById('contenedor_grupo')

const KEY_EQUIPO_FAVORITO = 'wc26_equipo_favorito'

let todos_los_equipos  = []
let todos_los_partidos = []
let todos_los_grupos   = []
let equipo_activo      = null

const COLORES_EQUIPOS = {
  'Mexico':          { primary: '#006847', secondary: '#CE1126' },
  'South Africa':    { primary: '#007A4D', secondary: '#FFB612' },
  'Brazil':          { primary: '#009C3B', secondary: '#FDEF42' },
  'Argentina':       { primary: '#74ACDF', secondary: '#F6E01B' },
  'France':          { primary: '#002395', secondary: '#ED2939' },
  'Germany':         { primary: '#000000', secondary: '#DD0000' },
  'Spain':           { primary: '#AA151B', secondary: '#F1BF00' },
  'England':         { primary: '#CF081F', secondary: '#FFFFFF' },
  'Portugal':        { primary: '#006600', secondary: '#FF0000' },
  'Netherlands':     { primary: '#FF6600', secondary: '#FFFFFF' },
  'United States':   { primary: '#002868', secondary: '#BF0A30' },
  'Canada':          { primary: '#FF0000', secondary: '#FFFFFF' },
  'Morocco':         { primary: '#C1272D', secondary: '#006233' },
  'Japan':           { primary: '#BC002D', secondary: '#FFFFFF' },
  'Uruguay':         { primary: '#5EB6E4', secondary: '#FFFFFF' },
  'Costa Rica':      { primary: '#002B7F', secondary: '#CE1126' },
}

const COLOR_DEFAULT = { primary: '#02B906', secondary: '#E6FDE7' }

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  selector_equipo?.addEventListener('change', () => {
    const id = selector_equipo.value
    if (!id) return
    const equipo = todos_los_equipos.find(e => String(e.id) === String(id))
    if (equipo) {
      guardarEquipoFavorito(equipo)
      renderizarDashboard(equipo)
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
  mostrarSkeletons(contenedor_dashboard, 4, 'card')

  try {
    const [res_equipos, res_partidos, res_grupos] = await Promise.all([
      obtenerEquipos(),
      obtenerPartidos(),
      obtenerGrupos()
    ])

    todos_los_equipos  = res_equipos.datos
    todos_los_partidos = res_partidos.datos
    todos_los_grupos   = res_grupos.datos

    poblarSelectorEquipos(todos_los_equipos)

    const favorito_guardado = leerEquipoFavorito()

    if (favorito_guardado) {
      const equipo = todos_los_equipos.find(
        e => String(e.id) === String(favorito_guardado.id)
      )
      if (equipo) {
        selector_equipo.value = String(equipo.id)
        renderizarDashboard(equipo)
        return
      }
    }

    ocultarSkeletons(contenedor_dashboard)
    mostrarPlaceholder()

  } catch (error) {
    mostrarError(contenedor_dashboard, 'No se pudo cargar la información.', '/get/teams')
  }
}

function poblarSelectorEquipos(equipos) {
  if (!selector_equipo) return

  selector_equipo.innerHTML = '<option value="">Elegí tu equipo favorito</option>'

  const equipos_ordenados = [...equipos].sort((a, b) =>
    (a.name_en ?? '').localeCompare(b.name_en ?? '', 'es')
  )

  equipos_ordenados.forEach(equipo => {
    const option = document.createElement('option')
    option.value       = equipo.id
    option.textContent = equipo.name_en ?? `Equipo ${equipo.id}`
    selector_equipo.appendChild(option)
  })
}

function renderizarDashboard(equipo) {
  equipo_activo = equipo
  ocultarSkeletons(contenedor_dashboard)
  aplicarTemaEquipo(equipo.name_en)
  renderizarHeaderEquipo(equipo)

  const partidos_equipo = todos_los_partidos.filter(p =>
    String(p.home_team_id) === String(equipo.id) ||
    String(p.away_team_id) === String(equipo.id)
  )

  renderizarPartidosEquipo(partidos_equipo, equipo)
  renderizarPosicionGrupo(equipo)
}

function aplicarTemaEquipo(nombre_equipo) {
  const colores = COLORES_EQUIPOS[nombre_equipo] ?? COLOR_DEFAULT

  document.documentElement.style.setProperty('--team_color_primary', colores.primary)
  document.documentElement.style.setProperty(
    '--team_color_secondary',
    hexAColor(colores.primary, 0.12)
  )
}

function hexAColor(hex, opacidad) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacidad})`
}

function renderizarHeaderEquipo(equipo) {
  const header = document.getElementById('dashboard_header')
  if (!header) return

  /*
    El campo del grupo en teams es 'groups' (letra: "A", "B", etc.)
  */
  header.innerHTML = `
    <div>
      <h2 class="dashboard_equipo_nombre">${equipo.name_en ?? 'Equipo'}</h2>
      <p class="dashboard_equipo_grupo">
        ${equipo.groups ? `Grupo ${equipo.groups}` : 'Grupo por confirmar'}
      </p>
    </div>
    <span class="badge badge_pendiente">⭐ Favorito</span>
  `
}

function renderizarPosicionGrupo(equipo) {
  if (!contenedor_grupo) return

  /*
    En groups, cada grupo tiene teams: [{team_id, mp, w, d, l, gf, ga, pts}]
    Buscamos el grupo que contiene el team_id de nuestro equipo
  */
  const grupo = todos_los_grupos.find(g =>
    g.teams?.some(t => String(t.team_id) === String(equipo.id))
  )

  if (!grupo || !grupo.teams) {
    contenedor_grupo.innerHTML = `
      <p class="posicion_grupo_titulo">Posición en el grupo</p>
      <div style="padding: var(--spacing_md)">
        <p>No hay datos de grupo disponibles.</p>
      </div>
    `
    return
  }

  /* Ordenar por puntos, luego por diferencia de goles */
  const equipos_grupo = [...grupo.teams].sort((a, b) => {
    const pts_diff = (Number(b.pts) ?? 0) - (Number(a.pts) ?? 0)
    if (pts_diff !== 0) return pts_diff
    const dif_a = (Number(a.gf) ?? 0) - (Number(a.ga) ?? 0)
    const dif_b = (Number(b.gf) ?? 0) - (Number(b.ga) ?? 0)
    return dif_b - dif_a
  })

  /*
    Para mostrar el nombre necesitamos cruzar team_id con todos_los_equipos
  */
  const equipos_map = new Map(todos_los_equipos.map(e => [String(e.id), e]))

  const filas = equipos_grupo.map((t, index) => {
    const es_favorito  = String(t.team_id) === String(equipo.id)
    const pos          = index + 1
    const nombre_equipo = equipos_map.get(String(t.team_id))?.name_en ?? `Equipo ${t.team_id}`

    return `
      <tr class="${es_favorito ? 'fila_favorito' : ''}">
        <td>
          <span class="posicion_num ${pos === 1 ? 'primero' : pos === 2 ? 'segundo' : ''}">
            ${pos}
          </span>
          ${nombre_equipo}
        </td>
        <td>${t.mp ?? 0}</td>
        <td>${t.w  ?? 0}</td>
        <td>${t.d  ?? 0}</td>
        <td>${t.l  ?? 0}</td>
        <td>${t.gf ?? 0}</td>
        <td>${t.ga ?? 0}</td>
        <td><strong>${t.pts ?? 0}</strong></td>
      </tr>
    `
  }).join('')

  contenedor_grupo.innerHTML = `
    <p class="posicion_grupo_titulo">Grupo ${grupo.name ?? ''}</p>
    <table class="posicion_tabla" aria-label="Tabla del grupo ${grupo.name ?? ''}">
      <thead>
        <tr>
          <th scope="col">Equipo</th>
          <th scope="col">PJ</th>
          <th scope="col">G</th>
          <th scope="col">E</th>
          <th scope="col">P</th>
          <th scope="col">GF</th>
          <th scope="col">GC</th>
          <th scope="col">Pts</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `
}

function renderizarPartidosEquipo(partidos, equipo) {
  if (!contenedor_partidos) return

  if (partidos.length === 0) {
    mostrarVacio(contenedor_partidos, 'No se encontraron partidos para este equipo.')
    return
  }

  const partidos_ordenados = [...partidos].sort((a, b) =>
    new Date(a.local_date ?? '') - new Date(b.local_date ?? '')
  )

  contenedor_partidos.innerHTML = `
    <p class="partidos_equipo_titulo">Partidos</p>
    <div class="partidos_equipo_lista">
      ${partidos_ordenados.map(p => crearCardPartido(p, equipo)).join('')}
    </div>
  `
}

function crearCardPartido(partido, equipo) {
  const es_local = String(partido.home_team_id) === String(equipo.id)
  const jugado   = partido.finished === 'TRUE'

  const rival = es_local
    ? (partido.away_team_name_en ?? 'Por definir')
    : (partido.home_team_name_en ?? 'Por definir')

  const marcador = jugado
    ? `${partido.home_score} - ${partido.away_score}`
    : 'Pendiente'

  return `
    <div class="partido_equipo_card ${es_local ? 'es_local' : 'es_visitante'}"
         role="article"
         aria-label="Partido vs ${rival}">
      <div class="partido_equipo_rivales">
        ${es_local
          ? `<strong>${equipo.name_en}</strong> vs ${rival}`
          : `${rival} vs <strong>${equipo.name_en}</strong>`}
      </div>
      <span class="partido_equipo_marcador">${marcador}</span>
      <span class="partido_equipo_fecha">${partido.local_date ?? 'TBD'}</span>
    </div>
  `
}

function guardarEquipoFavorito(equipo) {
  localStorage.setItem(KEY_EQUIPO_FAVORITO, JSON.stringify({
    id:   equipo.id,
    name: equipo.name_en
  }))
}

function leerEquipoFavorito() {
  try {
    const guardado = localStorage.getItem(KEY_EQUIPO_FAVORITO)
    return guardado ? JSON.parse(guardado) : null
  } catch {
    localStorage.removeItem(KEY_EQUIPO_FAVORITO)
    return null
  }
}

function mostrarPlaceholder() {
  if (!contenedor_dashboard) return
  contenedor_dashboard.innerHTML = `
    <div class="dashboard_placeholder" role="status">
      <span class="dashboard_placeholder_icono" aria-hidden="true">⚽</span>
      <p>Elegí tu equipo favorito para ver su dashboard.</p>
    </div>
  `
}