/* ============================================================
   dashboard.js — Mundial 2026
   Orquesta la vista Dashboard del Fanático Incondicional.
   Técnica DOM: tematización dinámica con variables CSS y
   persistencia del equipo favorito en localStorage.
   ============================================================ */

/* ── 1. Referencias al DOM ──────────────────────────────── */

const selector_equipo       = document.getElementById('selector_equipo')
const contenedor_dashboard  = document.getElementById('contenedor_dashboard')
const contenedor_partidos   = document.getElementById('contenedor_partidos_equipo')
const contenedor_grupo      = document.getElementById('contenedor_grupo')

/* ── 2. Clave de localStorage ───────────────────────────── */

const KEY_EQUIPO_FAVORITO = 'wc26_equipo_favorito'

/* ── 3. Estado de la vista ──────────────────────────────── */

let todos_los_equipos  = []
let todos_los_partidos = []
let todos_los_grupos   = []
let equipo_activo      = null

/* ── 4. Colores por selección de equipo ─────────────────── */

/*
  Mapa de colores representativos por nombre de equipo.
  Se usa para repintar las variables CSS del dashboard.
  Si el equipo no está en el mapa se usan los colores
  del sistema (verde FIFA por defecto).
*/
const COLORES_EQUIPOS = {
  'Brazil':        { primary: '#009C3B', secondary: '#FDEF42' },
  'Argentina':     { primary: '#74ACDF', secondary: '#F6E01B' },
  'France':        { primary: '#002395', secondary: '#ED2939' },
  'Germany':       { primary: '#000000', secondary: '#DD0000' },
  'Spain':         { primary: '#AA151B', secondary: '#F1BF00' },
  'England':       { primary: '#CF081F', secondary: '#FFFFFF' },
  'Portugal':      { primary: '#006600', secondary: '#FF0000' },
  'Netherlands':   { primary: '#FF6600', secondary: '#FFFFFF' },
  'United States': { primary: '#002868', secondary: '#BF0A30' },
  'Mexico':        { primary: '#006847', secondary: '#CE1126' },
  'Canada':        { primary: '#FF0000', secondary: '#FFFFFF' },
  'Morocco':       { primary: '#C1272D', secondary: '#006233' },
  'Japan':         { primary: '#BC002D', secondary: '#FFFFFF' },
  'Uruguay':       { primary: '#5EB6E4', secondary: '#FFFFFF' },
  'Costa Rica':    { primary: '#002B7F', secondary: '#CE1126' },
}

const COLOR_DEFAULT = { primary: '#02B906', secondary: '#E6FDE7' }

/* ── 5. Inicialización ──────────────────────────────────── */

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

/* ── 6. Carga inicial ───────────────────────────────────── */

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

    /*
      Recuperar el equipo favorito guardado en localStorage.
      El enunciado exige que sobreviva a un refresco completo.
    */
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

    /* Sin favorito guardado: mostrar placeholder */
    ocultarSkeletons(contenedor_dashboard)
    mostrarPlaceholder()

  } catch (error) {
    mostrarError(
      contenedor_dashboard,
      'No se pudo cargar la información. Verificá tu conexión.',
      '/get/teams'
    )
  }
}

/* ── 7. Poblar selector de equipos ──────────────────────── */

function poblarSelectorEquipos(equipos) {
  if (!selector_equipo) return

  selector_equipo.innerHTML = '<option value="">Elegí tu equipo favorito</option>'

  /*
    Ordenar alfabéticamente para facilitar la búsqueda.
    localeCompare maneja correctamente caracteres especiales.
  */
  const equipos_ordenados = [...equipos].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', 'es')
  )

  equipos_ordenados.forEach(equipo => {
    const option = document.createElement('option')
    option.value       = equipo.id
    option.textContent = equipo.name ?? `Equipo ${equipo.id}`
    selector_equipo.appendChild(option)
  })
}

/* ── 8. Renderizado del dashboard ───────────────────────── */

async function renderizarDashboard(equipo) {
  equipo_activo = equipo

  ocultarSkeletons(contenedor_dashboard)

  /* Repintar variables CSS con los colores del equipo */
  aplicarTemaEquipo(equipo.name)

  /* Renderizar header del equipo */
  renderizarHeaderEquipo(equipo)

  /* Filtrar y renderizar partidos del equipo */
  const partidos_equipo = todos_los_partidos.filter(p =>
    p.home_team_id === equipo.id || p.away_team_id === equipo.id
  )
  renderizarPartidosEquipo(partidos_equipo, equipo)

  /* Renderizar posición en el grupo */
  renderizarPosicionGrupo(equipo)
}

/* ── 9. Tematización dinámica con variables CSS ─────────── */

/*
  Modifica las variables CSS del :root en tiempo real.
  Cada elemento del dashboard que usa --team_color_primary
  o --team_color_secondary se repinta automáticamente.
  Es la técnica de tematización dinámica del enunciado.
*/
function aplicarTemaEquipo(nombre_equipo) {
  const colores = COLORES_EQUIPOS[nombre_equipo] ?? COLOR_DEFAULT

  document.documentElement.style.setProperty(
    '--team_color_primary', colores.primary
  )

  document.documentElement.style.setProperty(
    '--team_color_secondary',
    hexAColor(colores.primary, 0.12)
  )
}

/*
  Convierte un color hex a rgba para el fondo secundario.
  Permite usar el color primario del equipo con opacidad
  reducida sin necesitar un segundo color hardcodeado.
*/
function hexAColor(hex, opacidad) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacidad})`
}

/* ── 10. Header del equipo ──────────────────────────────── */

function renderizarHeaderEquipo(equipo) {
  const header = document.getElementById('dashboard_header')
  if (!header) return

  header.innerHTML = `
    <div>
      <h2 class="dashboard_equipo_nombre">${equipo.name ?? 'Equipo'}</h2>
      <p class="dashboard_equipo_grupo">
        ${equipo.group ? `Grupo ${equipo.group}` : 'Grupo por confirmar'}
      </p>
    </div>
    <span class="badge badge_pendiente" aria-label="Equipo favorito seleccionado">
        Favorito!
    </span>
  `
}

/* ── 11. Posición en el grupo ───────────────────────────── */

function renderizarPosicionGrupo(equipo) {
  if (!contenedor_grupo) return

  /*
    Buscamos el grupo del equipo en los datos de /get/groups.
    Los grupos tienen una lista de equipos con sus stats.
  */
  const grupo = todos_los_grupos.find(g =>
    g.teams?.some(t => String(t.id) === String(equipo.id))
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

  /* Ordenar equipos del grupo por puntos, luego por diferencia de goles */
  const equipos_grupo = [...grupo.teams].sort((a, b) => {
    const pts_diff = (b.points ?? 0) - (a.points ?? 0)
    if (pts_diff !== 0) return pts_diff
    const dif_a = (a.goals_for ?? 0) - (a.goals_against ?? 0)
    const dif_b = (b.goals_for ?? 0) - (b.goals_against ?? 0)
    return dif_b - dif_a
  })

  const filas = equipos_grupo.map((t, index) => {
    const es_favorito = String(t.id) === String(equipo.id)
    const pos         = index + 1

    return `
      <tr class="${es_favorito ? 'fila_favorito' : ''}"
          aria-label="${t.name ?? 'Equipo'}, posición ${pos}">
        <td>
          <span class="posicion_num ${pos === 1 ? 'primero' : pos === 2 ? 'segundo' : ''}">
            ${pos}
          </span>
          ${t.name ?? 'Equipo'}
        </td>
        <td>${t.played ?? 0}</td>
        <td>${t.wins ?? 0}</td>
        <td>${t.draws ?? 0}</td>
        <td>${t.losses ?? 0}</td>
        <td>${t.goals_for ?? 0}</td>
        <td>${t.goals_against ?? 0}</td>
        <td><strong>${t.points ?? 0}</strong></td>
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

/* ── 12. Partidos del equipo ────────────────────────────── */

function renderizarPartidosEquipo(partidos, equipo) {
  if (!contenedor_partidos) return

  if (partidos.length === 0) {
    mostrarVacio(contenedor_partidos, 'No se encontraron partidos para este equipo.')
    return
  }

  const partidos_ordenados = [...partidos].sort((a, b) =>
    (a.local_date ?? '').localeCompare(b.local_date ?? '')
  )

  contenedor_partidos.innerHTML = `
    <p class="partidos_equipo_titulo">Partidos</p>
    <div class="partidos_equipo_lista">
      ${partidos_ordenados.map(p => crearCardPartido(p, equipo)).join('')}
    </div>
  `
}

function crearCardPartido(partido, equipo) {
  const es_local  = String(partido.home_team_id) === String(equipo.id)
  const jugado    = partido.home_score !== null && partido.away_score !== null

  const rival = es_local
    ? (partido.away_team ?? 'Por definir')
    : (partido.home_team ?? 'Por definir')

  const marcador = jugado
    ? `${partido.home_score} - ${partido.away_score}`
    : 'Pendiente'

  const fecha = partido.local_date
    ? new Date(partido.local_date).toLocaleDateString('es-CR', {
        day: 'numeric', month: 'short', year: 'numeric'
      })
    : 'Fecha TBD'

  return `
    <div class="partido_equipo_card ${es_local ? 'es_local' : 'es_visitante'}"
         role="article"
         aria-label="Partido vs ${rival}">
      <div class="partido_equipo_rivales">
        ${es_local
          ? `<strong>${equipo.name}</strong> vs ${rival}`
          : `${rival} vs <strong>${equipo.name}</strong>`}
      </div>
      <span class="partido_equipo_marcador">${marcador}</span>
      <span class="partido_equipo_fecha">${fecha}</span>
    </div>
  `
}

/* ── 13. localStorage del equipo favorito ───────────────── */

function guardarEquipoFavorito(equipo) {
  localStorage.setItem(KEY_EQUIPO_FAVORITO, JSON.stringify({
    id:   equipo.id,
    name: equipo.name
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

/* ── 14. Placeholder inicial ────────────────────────────── */

function mostrarPlaceholder() {
  if (!contenedor_dashboard) return

  contenedor_dashboard.innerHTML = `
    <div class="dashboard_placeholder" role="status">
      <span class="dashboard_placeholder_icono" aria-hidden="true">⚽</span>
      <p>Elegí tu equipo favorito para ver su dashboard.</p>
    </div>
  `
}