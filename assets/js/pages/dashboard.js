/* ============================================================
   dashboard.js — Mundial 2026
   Campos API reales:
   - teams: id, name_en, flag, groups (letra del grupo)
   - groups: _id, name, teams:[{team_id,mp,w,d,l,gf,ga,pts,gd}]
   - games: home_team_id, away_team_id, home_team_name_en,
            away_team_name_en, finished:"TRUE",
            home_score, away_score, local_date:"MM/DD/YYYY HH:MM"
   ============================================================ */

const selector_equipo      = document.getElementById('selector_equipo')
const contenedor_dashboard = document.getElementById('contenedor_dashboard')
const contenedor_partidos  = document.getElementById('contenedor_partidos_equipo')
const contenedor_grupo     = document.getElementById('contenedor_grupo')

const KEY_EQUIPO_FAVORITO = 'wc26_equipo_favorito'

let todos_los_equipos  = []
let todos_los_partidos = []
let todos_los_grupos   = []

const COLORES_EQUIPOS = {
  'Mexico':          { primary: '#006847' },
  'Brazil':          { primary: '#009C3B' },
  'Argentina':       { primary: '#74ACDF' },
  'France':          { primary: '#002395' },
  'Germany':         { primary: '#333333' },
  'Spain':           { primary: '#AA151B' },
  'England':         { primary: '#CF081F' },
  'Portugal':        { primary: '#006600' },
  'Netherlands':     { primary: '#FF6600' },
  'United States':   { primary: '#002868' },
  'Canada':          { primary: '#FF0000' },
  'Morocco':         { primary: '#C1272D' },
  'Japan':           { primary: '#BC002D' },
  'Uruguay':         { primary: '#5EB6E4' },
  'Costa Rica':      { primary: '#002B7F' },
  'Croatia':         { primary: '#FF0000' },
  'South Africa':    { primary: '#007A4D' },
  'Ghana':           { primary: '#006B3F' },
  'Senegal':         { primary: '#00853F' },
  'Australia':       { primary: '#00843D' },
}

const COLOR_DEFAULT = { primary: '#02B906' }

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

  const ordenados = [...equipos].sort((a, b) =>
    (a.name_en ?? '').localeCompare(b.name_en ?? '', 'es')
  )

  ordenados.forEach(equipo => {
    const option = document.createElement('option')
    option.value       = equipo.id
    option.textContent = equipo.name_en ?? `Equipo ${equipo.id}`
    selector_equipo.appendChild(option)
  })
}

function renderizarDashboard(equipo) {
  ocultarSkeletons(contenedor_dashboard)
  aplicarTemaEquipo(equipo.name_en)
  renderizarHeaderEquipo(equipo)
  renderizarPosicionGrupo(equipo)

  const partidos_equipo = todos_los_partidos.filter(p =>
    String(p.home_team_id) === String(equipo.id) ||
    String(p.away_team_id) === String(equipo.id)
  )

  renderizarStatsEquipo(partidos_equipo, equipo)
  renderizarPartidosEquipo(partidos_equipo, equipo)
}

/* ── Tematización dinámica ── */
function aplicarTemaEquipo(nombre) {
  const colores = COLORES_EQUIPOS[nombre] ?? COLOR_DEFAULT
  document.documentElement.style.setProperty('--team_color_primary', colores.primary)
  document.documentElement.style.setProperty(
    '--team_color_secondary', hexAColor(colores.primary, 0.1)
  )
}

function hexAColor(hex, opacidad) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${opacidad})`
}

/* ── Header del equipo ── */
function renderizarHeaderEquipo(equipo) {
  const header = document.getElementById('dashboard_header')
  if (!header) return

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

/* ── Stats calculadas de los partidos ── */
function renderizarStatsEquipo(partidos, equipo) {
  if (!contenedor_dashboard) return

  const jugados = partidos.filter(p => p.finished === 'TRUE')
  let gf = 0, gc = 0, ganados = 0, perdidos = 0, empatados = 0

  jugados.forEach(p => {
    const es_local = String(p.home_team_id) === String(equipo.id)
    const mis_goles    = Number(es_local ? p.home_score : p.away_score) || 0
    const goles_rival  = Number(es_local ? p.away_score : p.home_score) || 0
    gf += mis_goles
    gc += goles_rival
    if (mis_goles > goles_rival) ganados++
    else if (mis_goles < goles_rival) perdidos++
    else empatados++
  })

  const pts = ganados * 3 + empatados

  contenedor_dashboard.innerHTML = `
    <div class="stat_card">
      <span class="stat_card_valor">${pts}</span>
      <span class="stat_card_label">Puntos</span>
    </div>
    <div class="stat_card">
      <span class="stat_card_valor">${jugados.length}</span>
      <span class="stat_card_label">Jugados</span>
    </div>
    <div class="stat_card">
      <span class="stat_card_valor">${gf}</span>
      <span class="stat_card_label">Goles a favor</span>
    </div>
    <div class="stat_card">
      <span class="stat_card_valor">${gc}</span>
      <span class="stat_card_label">Goles en contra</span>
    </div>
  `
}

/* ── Posición en el grupo ── */
function renderizarPosicionGrupo(equipo) {
  if (!contenedor_grupo) return

  const grupo = todos_los_grupos.find(g =>
    g.teams?.some(t => String(t.team_id) === String(equipo.id))
  )

  if (!grupo?.teams) {
    contenedor_grupo.innerHTML = `
      <p class="posicion_grupo_titulo">Posición en el grupo</p>
      <div style="padding:var(--spacing_md)"><p>No hay datos disponibles.</p></div>
    `
    return
  }

  const equipos_map = new Map(todos_los_equipos.map(e => [String(e.id), e]))

  const ordenados = [...grupo.teams].sort((a, b) => {
    const diff_pts = Number(b.pts) - Number(a.pts)
    if (diff_pts !== 0) return diff_pts
    return Number(b.gd ?? 0) - Number(a.gd ?? 0)
  })

  const filas = ordenados.map((t, i) => {
    const es_fav  = String(t.team_id) === String(equipo.id)
    const pos     = i + 1
    const nombre  = equipos_map.get(String(t.team_id))?.name_en ?? `Equipo ${t.team_id}`

    return `
      <tr class="${es_fav ? 'fila_favorito' : ''}">
        <td>
          <span class="posicion_num ${pos===1?'primero':pos===2?'segundo':''}">${pos}</span>
          ${nombre}
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
    <table class="posicion_tabla" aria-label="Tabla Grupo ${grupo.name}">
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

/* ── Partidos del equipo ── */
function renderizarPartidosEquipo(partidos, equipo) {
  if (!contenedor_partidos) return

  if (partidos.length === 0) {
    mostrarVacio(contenedor_partidos, 'No se encontraron partidos para este equipo.')
    return
  }

  const ordenados = [...partidos].sort((a, b) =>
    new Date(a.local_date ?? '') - new Date(b.local_date ?? '')
  )

  contenedor_partidos.innerHTML = `
    <p class="partidos_equipo_titulo">Partidos</p>
    <div class="partidos_equipo_lista">
      ${ordenados.map(p => crearCardPartido(p, equipo)).join('')}
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
         role="article" aria-label="vs ${rival}">
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

/* ── localStorage ── */
function guardarEquipoFavorito(equipo) {
  localStorage.setItem(KEY_EQUIPO_FAVORITO, JSON.stringify({
    id: equipo.id, name: equipo.name_en
  }))
}

function leerEquipoFavorito() {
  try {
    const g = localStorage.getItem(KEY_EQUIPO_FAVORITO)
    return g ? JSON.parse(g) : null
  } catch {
    localStorage.removeItem(KEY_EQUIPO_FAVORITO)
    return null
  }
}

/* ── Placeholder ── */
function mostrarPlaceholder() {
  if (!contenedor_dashboard) return
  contenedor_dashboard.innerHTML = `
    <div class="dashboard_placeholder" role="status">
      <span class="dashboard_placeholder_icono" aria-hidden="true">⚽</span>
      <p>Elegí tu equipo favorito para ver su dashboard.</p>
    </div>
  `
}