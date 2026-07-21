/* ============================================================
   matriz.js — Mundial 2026
   Campos API: groups: name, teams: [{team_id, mp, w, d, l, gf, ga, pts}]
               teams: id, name_en
               games: home_team_id, away_team_id, finished: "TRUE"
   ============================================================ */

const contenedor_tabs   = document.getElementById('grupos_tabs')
const contenedor_matriz = document.getElementById('contenedor_matriz')

let grupos_data       = []
let equipos_data      = []
let partidos_data     = []
let equipos_por_id    = new Map()
let resultado_por_par = new Map()
let grupo_activo_id   = null
let partidos_fallaron = false

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  document.addEventListener('ui:reintentar', async (e) => {
    const { endpoint } = e.detail
    if (endpoint === '/get/groups' || endpoint === '/get/teams') {
      await iniciarVista()
    } else if (endpoint === '/get/games') {
      await reintentarPartidos()
    }
  })

  document.addEventListener('ui:reautenticar', async () => {
    limpiarTodoElCache()
    await iniciarVista()
  })
})

async function iniciarVista() {
  mostrarSkeletons(contenedor_matriz, 1, 'celda')

  try {
    const [res_grupos, res_equipos] = await Promise.all([
      obtenerGrupos(),
      obtenerEquipos()
    ])

    grupos_data  = res_grupos.datos
    equipos_data = res_equipos.datos

    /* Mapa de equipos por id usando name_en */
    equipos_data.forEach(e => equipos_por_id.set(String(e.id), e))

    try {
      const res_partidos = await obtenerPartidos()
      partidos_data     = res_partidos.datos
      partidos_fallaron = false
      construirMapaResultados()
    } catch {
      partidos_fallaron = true
      resultado_por_par = new Map()
    }

    ocultarSkeletons(contenedor_matriz)
    renderizarTabs(grupos_data)

    if (grupos_data.length > 0) {
      seleccionarGrupo(grupos_data[0])
    }

  } catch (error) {
    mostrarError(contenedor_matriz, 'No se pudieron cargar los grupos.', '/get/groups')
  }
}

async function reintentarPartidos() {
  try {
    const res_partidos = await obtenerPartidos()
    partidos_data      = res_partidos.datos
    partidos_fallaron  = false
    construirMapaResultados()
    actualizarCeldasConResultados()
  } catch {
    /* Si sigue fallando, la matriz ya muestra Pendiente */
  }
}

function renderizarTabs(grupos) {
  if (!contenedor_tabs) return
  contenedor_tabs.innerHTML = ''

  grupos.forEach(grupo => {
    const tab = document.createElement('button')
    tab.className = 'grupo_tab'
    tab.textContent = `Grupo ${grupo.name ?? grupo._id}`
    tab.setAttribute('aria-label', `Ver matriz del Grupo ${grupo.name}`)
    tab.dataset.id = grupo._id  /* usamos _id como identificador único */

    tab.addEventListener('click', () => seleccionarGrupo(grupo))
    contenedor_tabs.appendChild(tab)
  })
}

function seleccionarGrupo(grupo) {
  grupo_activo_id = grupo._id

  contenedor_tabs?.querySelectorAll('.grupo_tab').forEach(tab => {
    const es_activo = tab.dataset.id === String(grupo._id)
    tab.classList.toggle('activo', es_activo)
    tab.setAttribute('aria-pressed', es_activo)
  })

  renderizarMatriz(grupo)
}

function construirMapaResultados() {
  resultado_por_par = new Map()

  partidos_data.forEach(partido => {
    if (!partido.home_team_id || !partido.away_team_id) return

    const id_local     = String(partido.home_team_id)
    const id_visitante = String(partido.away_team_id)
    const jugado       = partido.finished === 'TRUE'

    const datos_partido = {
      jugado,
      home_score:   partido.home_score,
      away_score:   partido.away_score,
      home_team_id: id_local,
      away_team_id: id_visitante
    }

    resultado_por_par.set(`${id_local}_${id_visitante}`, datos_partido)
    resultado_por_par.set(`${id_visitante}_${id_local}`, datos_partido)
  })
}

function renderizarMatriz(grupo) {
  if (!contenedor_matriz) return

  /*
    grupos.teams tiene objetos {team_id, mp, w, ...}
    Extraemos los team_ids para cruzar con equipos_por_id
  */
  const ids_equipos = obtenerIdsEquiposDelGrupo(grupo)

  if (ids_equipos.length === 0) {
    mostrarVacio(contenedor_matriz, `No hay equipos en el Grupo ${grupo.name}.`)
    return
  }

  const equipos_grupo = ids_equipos
    .map(id => equipos_por_id.get(String(id)))
    .filter(Boolean)

  const tabla   = crearTablaMatriz(equipos_grupo, grupo)
  const leyenda = crearLeyenda()

  contenedor_matriz.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.className = 'matriz_wrap'
  wrap.appendChild(tabla)

  contenedor_matriz.appendChild(wrap)
  contenedor_matriz.appendChild(leyenda)

  if (partidos_fallaron) {
    const aviso = document.createElement('div')
    aviso.className = 'banner_cache'
    aviso.setAttribute('role', 'alert')
    aviso.innerHTML = `
      <span class="banner_cache_icono" aria-hidden="true">⚠️</span>
      <p>No se pudieron cargar los resultados. Mostrando estado pendiente.</p>
    `
    contenedor_matriz.insertBefore(aviso, wrap)
  }
}

function crearTablaMatriz(equipos, grupo) {
  const tabla = document.createElement('table')
  tabla.className = 'matriz_tabla'
  tabla.setAttribute('role', 'grid')
  tabla.setAttribute('aria-label', `Matriz del Grupo ${grupo.name}`)

  const thead      = document.createElement('thead')
  const tr_header  = document.createElement('tr')
  const th_vacio   = document.createElement('th')
  th_vacio.className = 'matriz_th_vacio'
  th_vacio.setAttribute('scope', 'col')
  tr_header.appendChild(th_vacio)

  equipos.forEach(equipo => {
    const th = document.createElement('th')
    th.className = 'matriz_th_columna'
    th.setAttribute('scope', 'col')
    th.innerHTML = `<span class="matriz_th_nombre">${equipo.name_en}</span>`
    tr_header.appendChild(th)
  })

  thead.appendChild(tr_header)
  tabla.appendChild(thead)

  const tbody = document.createElement('tbody')

  equipos.forEach(equipo_fila => {
    const tr      = document.createElement('tr')
    const th_fila = document.createElement('th')
    th_fila.className = 'matriz_th_fila'
    th_fila.setAttribute('scope', 'row')
    th_fila.innerHTML = `<span class="matriz_th_nombre">${equipo_fila.name_en}</span>`
    tr.appendChild(th_fila)

    equipos.forEach(equipo_col => {
      const td = crearCelda(equipo_fila, equipo_col)
      tr.appendChild(td)
    })

    tbody.appendChild(tr)
  })

  tabla.appendChild(tbody)
  return tabla
}

function crearCelda(equipo_fila, equipo_col) {
  const td = document.createElement('td')
  td.dataset.fila = equipo_fila.id
  td.dataset.col  = equipo_col.id

  if (String(equipo_fila.id) === String(equipo_col.id)) {
    td.className = 'matriz_td diagonal'
    td.setAttribute('aria-label', 'No aplica')
    td.innerHTML = `<span class="celda_diagonal" aria-hidden="true">—</span>`
    return td
  }

  const clave   = `${equipo_fila.id}_${equipo_col.id}`
  const partido = resultado_por_par.get(clave)
  const jugado  = partido?.jugado ?? false

  td.className = `matriz_td ${jugado ? 'jugado' : 'pendiente'}`
  td.setAttribute('aria-label',
    `${equipo_fila.name_en} vs ${equipo_col.name_en}: ${
      jugado ? `${partido.home_score} - ${partido.away_score}` : 'Pendiente'
    }`
  )

  if (jugado) {
    const es_local   = String(partido.home_team_id) === String(equipo_fila.id)
    const goles_fila = es_local ? partido.home_score : partido.away_score
    const goles_col  = es_local ? partido.away_score : partido.home_score

    td.innerHTML = `
      <span class="celda_resultado" aria-hidden="true">
        ${goles_fila} - ${goles_col}
      </span>
    `
  } else {
    td.innerHTML = `<span class="celda_pendiente" aria-hidden="true">Pendiente</span>`
  }

  return td
}

function actualizarCeldasConResultados() {
  if (!contenedor_matriz) return

  contenedor_matriz.querySelectorAll('.matriz_td:not(.diagonal)').forEach(td => {
    const id_fila = td.dataset.fila
    const id_col  = td.dataset.col
    if (!id_fila || !id_col) return

    const partido = resultado_por_par.get(`${id_fila}_${id_col}`)
    if (!partido?.jugado || !td.classList.contains('pendiente')) return

    td.classList.remove('pendiente')
    td.classList.add('jugado')

    const es_local   = String(partido.home_team_id) === String(id_fila)
    const goles_fila = es_local ? partido.home_score : partido.away_score
    const goles_col  = es_local ? partido.away_score : partido.home_score

    td.innerHTML = `<span class="celda_resultado" aria-hidden="true">${goles_fila} - ${goles_col}</span>`

    const nombre_fila = equipos_por_id.get(id_fila)?.name_en ?? id_fila
    const nombre_col  = equipos_por_id.get(id_col)?.name_en ?? id_col
    td.setAttribute('aria-label', `${nombre_fila} vs ${nombre_col}: ${goles_fila} - ${goles_col}`)
  })

  contenedor_matriz.querySelector('.banner_cache')?.remove()
}

/*
  Los grupos tienen teams: [{team_id, ...}]
  Extraemos team_id de cada objeto
*/
function obtenerIdsEquiposDelGrupo(grupo) {
  if (Array.isArray(grupo.teams)) {
    return grupo.teams.map(t => (typeof t === 'object' ? t.team_id : t))
  }
  return []
}

function crearLeyenda() {
  const leyenda = document.createElement('div')
  leyenda.className = 'matriz_leyenda'
  leyenda.setAttribute('aria-label', 'Leyenda')
  leyenda.innerHTML = `
    <span class="leyenda_item">
      <span class="leyenda_muestra jugado" aria-hidden="true"></span>Jugado
    </span>
    <span class="leyenda_item">
      <span class="leyenda_muestra pendiente" aria-hidden="true"></span>Pendiente
    </span>
    <span class="leyenda_item">
      <span class="leyenda_muestra diagonal" aria-hidden="true"></span>No aplica
    </span>
  `
  return leyenda
}