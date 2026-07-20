/* ============================================================
   matriz.js — Mundial 2026
   Orquesta la vista Matriz de Enfrentamientos por Grupo.
   Técnica DOM: cuadrícula 4x4 interactiva cruzando tres
   recursos: /get/groups, /get/teams, /get/games.
   ============================================================ */

/* ── 1. Referencias al DOM ──────────────────────────────── */

const contenedor_tabs   = document.getElementById('grupos_tabs')
const contenedor_matriz = document.getElementById('contenedor_matriz')

/* ── 2. Estado de la vista ──────────────────────────────── */

/*
  grupos_data, equipos_data, partidos_data:
  datos crudos de la API guardados en el módulo.

  equipos_por_id: Map para acceso O(1) por team_id.
  resultado_por_par: Map con clave "idA_idB" → resultado.
    Se construye una sola vez y se consulta por cada celda.

  grupo_activo_id: id del grupo seleccionado actualmente.
  partidos_fallaron: bandera para el reto de resiliencia.
    Si true, la matriz se muestra completa con "Pendiente"
    en todas las celdas, sin bloquear la navegación de tabs.
*/
let grupos_data       = []
let equipos_data      = []
let partidos_data     = []
let equipos_por_id    = new Map()
let resultado_por_par = new Map()
let grupo_activo_id   = null
let partidos_fallaron = false

/* ── 3. Inicialización ──────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  document.addEventListener('ui:reintentar', async (e) => {
    const { endpoint } = e.detail
    if (endpoint === '/get/groups' || endpoint === '/get/teams') {
      await iniciarVista()
    } else if (endpoint === '/get/games') {
      /*
        Si solo falló partidos, reintentamos solo esa petición.
        Si funciona, actualizamos el mapa de resultados y
        repintamos solo las celdas afectadas — no reconstruimos
        toda la matriz.
      */
      await reintentarPartidos()
    }
  })

  document.addEventListener('ui:reautenticar', async () => {
    limpiarTodoElCache()
    await iniciarVista()
  })
})

/* ── 4. Carga inicial ───────────────────────────────────── */

async function iniciarVista() {
  mostrarSkeletons(contenedor_matriz, 1, 'celda')

  try {
    /*
      Los tres endpoints se piden en paralelo.
      Si partidos falla, lo capturamos por separado
      para cumplir el reto de resiliencia: la matriz
      se muestra completa con "Pendiente" en todas las celdas.
    */
    const [res_grupos, res_equipos] = await Promise.all([
      obtenerGrupos(),
      obtenerEquipos()
    ])

    grupos_data  = res_grupos.datos
    equipos_data = res_equipos.datos

    equipos_data.forEach(e => equipos_por_id.set(String(e.id), e))

    /* Intentar cargar partidos por separado */
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

    /* Seleccionar el primer grupo por defecto */
    if (grupos_data.length > 0) {
      seleccionarGrupo(grupos_data[0])
    }

  } catch (error) {
    mostrarError(
      contenedor_matriz,
      'No se pudieron cargar los grupos. Verificá tu conexión.',
      '/get/groups'
    )
  }
}

/* ── 5. Reintentar solo partidos ────────────────────────── */

async function reintentarPartidos() {
  try {
    const res_partidos = await obtenerPartidos()
    partidos_data      = res_partidos.datos
    partidos_fallaron  = false
    construirMapaResultados()

    /*
      Solo actualizar las celdas afectadas — no reconstruir
      la matriz completa. El enunciado lo exige explícitamente.
    */
    actualizarCeldasConResultados()

  } catch {
    /* Si sigue fallando, la matriz ya muestra "Pendiente" — no hacer nada */
  }
}

/* ── 6. Renderizar tabs de grupos ───────────────────────── */

function renderizarTabs(grupos) {
  if (!contenedor_tabs) return

  contenedor_tabs.innerHTML = ''

  grupos.forEach(grupo => {
    const tab = document.createElement('button')
    tab.className = 'grupo_tab'
    tab.textContent = `Grupo ${grupo.name ?? grupo.id}`
    tab.setAttribute('aria-label', `Ver matriz del Grupo ${grupo.name ?? grupo.id}`)
    tab.dataset.id = grupo.id

    tab.addEventListener('click', () => seleccionarGrupo(grupo))
    contenedor_tabs.appendChild(tab)
  })
}

/* ── 7. Seleccionar grupo ───────────────────────────────── */

function seleccionarGrupo(grupo) {
  grupo_activo_id = grupo.id

  /* Actualizar estado visual de los tabs */
  contenedor_tabs?.querySelectorAll('.grupo_tab').forEach(tab => {
    const es_activo = String(tab.dataset.id) === String(grupo.id)
    tab.classList.toggle('activo', es_activo)
    tab.setAttribute('aria-pressed', es_activo)
  })

  renderizarMatriz(grupo)
}

/* ── 8. Construir mapa de resultados ────────────────────── */

/*
  Construye un Map con clave "idA_idB" para acceso O(1)
  por par de equipos. Se crean dos entradas por partido:
  "local_visitante" y "visitante_local" para que la búsqueda
  funcione independientemente del orden fila/columna.
*/
function construirMapaResultados() {
  resultado_por_par = new Map()

  partidos_data.forEach(partido => {
    if (!partido.home_team_id || !partido.away_team_id) return

    const id_local     = String(partido.home_team_id)
    const id_visitante = String(partido.away_team_id)
    const jugado       = partido.home_score !== null && partido.away_score !== null

    const datos_partido = {
      jugado,
      home_score:   partido.home_score,
      away_score:   partido.away_score,
      home_team_id: id_local,
      away_team_id: id_visitante
    }

    /*
      Clave directa: fila=local, columna=visitante
      Clave inversa: fila=visitante, columna=local
      Ambas apuntan al mismo objeto de datos.
    */
    resultado_por_par.set(`${id_local}_${id_visitante}`, datos_partido)
    resultado_por_par.set(`${id_visitante}_${id_local}`, datos_partido)
  })
}

/* ── 9. Renderizar matriz 4x4 ───────────────────────────── */

function renderizarMatriz(grupo) {
  if (!contenedor_matriz) return

  /*
    Obtener los equipos del grupo cruzando con equipos_por_id.
    Los grupos tienen un array de team_ids o team objects.
  */
  const ids_equipos = obtenerIdsEquiposDelGrupo(grupo)

  if (ids_equipos.length === 0) {
    mostrarVacio(contenedor_matriz, `No hay equipos registrados para el Grupo ${grupo.name}.`)
    return
  }

  const equipos_grupo = ids_equipos
    .map(id => equipos_por_id.get(String(id)))
    .filter(Boolean)

  const tabla   = crearTablaMatriz(equipos_grupo)
  const leyenda = crearLeyenda()

  contenedor_matriz.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.className = 'matriz_wrap'
  wrap.appendChild(tabla)

  contenedor_matriz.appendChild(wrap)
  contenedor_matriz.appendChild(leyenda)

  /*
    Si partidos fallaron, mostrar advertencia encima de la matriz.
    La matriz se muestra completa con "Pendiente" — no en blanco.
  */
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

/* ── 10. Crear tabla ────────────────────────────────────── */

function crearTablaMatriz(equipos) {
  const tabla = document.createElement('table')
  tabla.className = 'matriz_tabla'
  tabla.setAttribute('role', 'grid')
  tabla.setAttribute('aria-label', `Matriz de enfrentamientos del Grupo ${
    grupos_data.find(g => String(g.id) === String(grupo_activo_id))?.name ?? ''
  }`)

  /* Encabezado */
  const thead = document.createElement('thead')
  const tr_header = document.createElement('tr')

  /* Celda vacía esquina superior izquierda */
  const th_vacio = document.createElement('th')
  th_vacio.className = 'matriz_th_vacio'
  th_vacio.setAttribute('scope', 'col')
  th_vacio.setAttribute('aria-label', 'Equipo local vs visitante')
  tr_header.appendChild(th_vacio)

  equipos.forEach(equipo => {
    const th = document.createElement('th')
    th.className = 'matriz_th_columna'
    th.setAttribute('scope', 'col')
    th.setAttribute('aria-label', `Columna: ${equipo.name}`)
    th.innerHTML = `<span class="matriz_th_nombre">${equipo.name ?? 'TBD'}</span>`
    tr_header.appendChild(th)
  })

  thead.appendChild(tr_header)
  tabla.appendChild(thead)

  /* Cuerpo: una fila por equipo local */
  const tbody = document.createElement('tbody')

  equipos.forEach(equipo_fila => {
    const tr = document.createElement('tr')

    /* Encabezado de fila */
    const th_fila = document.createElement('th')
    th_fila.className = 'matriz_th_fila'
    th_fila.setAttribute('scope', 'row')
    th_fila.innerHTML = `<span class="matriz_th_nombre">${equipo_fila.name ?? 'TBD'}</span>`
    tr.appendChild(th_fila)

    /* Celdas: una por cada equipo columna */
    equipos.forEach(equipo_col => {
      const td = crearCelda(equipo_fila, equipo_col)
      tr.appendChild(td)
    })

    tbody.appendChild(tr)
  })

  tabla.appendChild(tbody)
  return tabla
}

/* ── 11. Crear celda individual ─────────────────────────── */

function crearCelda(equipo_fila, equipo_col) {
  const td = document.createElement('td')
  td.dataset.fila = equipo_fila.id
  td.dataset.col  = equipo_col.id

  /* Diagonal: equipo contra sí mismo */
  if (String(equipo_fila.id) === String(equipo_col.id)) {
    td.className = 'matriz_td diagonal'
    td.setAttribute('aria-label', 'No aplica')
    td.innerHTML = `<span class="celda_diagonal" aria-hidden="true">—</span>`
    return td
  }

  const clave    = `${equipo_fila.id}_${equipo_col.id}`
  const partido  = resultado_por_par.get(clave)
  const jugado   = partido?.jugado ?? false

  td.className = `matriz_td ${jugado ? 'jugado' : 'pendiente'}`
  td.setAttribute('aria-label',
    `${equipo_fila.name} vs ${equipo_col.name}: ${
      jugado
        ? `${partido.home_score} - ${partido.away_score}`
        : 'Pendiente'
    }`
  )

  if (jugado) {
    /*
      Mostrar el marcador desde la perspectiva de la fila:
      si equipo_fila es el local, el marcador es home-away.
      Si es visitante, se invierte.
    */
    const es_local = String(partido.home_team_id) === String(equipo_fila.id)
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

/* ── 12. Actualizar solo celdas afectadas ───────────────── */

/*
  Cuando los partidos se recuperan después de un fallo,
  solo se actualizan las celdas que ahora tienen resultado.
  No se reconstruye toda la tabla.
*/
function actualizarCeldasConResultados() {
  if (!contenedor_matriz) return

  const celdas = contenedor_matriz.querySelectorAll('.matriz_td:not(.diagonal)')

  celdas.forEach(td => {
    const id_fila = td.dataset.fila
    const id_col  = td.dataset.col

    if (!id_fila || !id_col) return

    const clave   = `${id_fila}_${id_col}`
    const partido = resultado_por_par.get(clave)

    if (!partido?.jugado) return

    /* Solo actualizar si la celda estaba pendiente */
    if (td.classList.contains('pendiente')) {
      td.classList.remove('pendiente')
      td.classList.add('jugado')

      const es_local   = String(partido.home_team_id) === String(id_fila)
      const goles_fila = es_local ? partido.home_score : partido.away_score
      const goles_col  = es_local ? partido.away_score : partido.home_score

      td.innerHTML = `
        <span class="celda_resultado" aria-hidden="true">
          ${goles_fila} - ${goles_col}
        </span>
      `

      const nombre_fila = equipos_por_id.get(id_fila)?.name ?? id_fila
      const nombre_col  = equipos_por_id.get(id_col)?.name ?? id_col
      td.setAttribute('aria-label',
        `${nombre_fila} vs ${nombre_col}: ${goles_fila} - ${goles_col}`)
    }
  })

  /* Quitar el aviso de partidos fallidos si existía */
  contenedor_matriz.querySelector('.banner_cache')?.remove()
}

/* ── 13. Utilidades ─────────────────────────────────────── */

/*
  Los grupos pueden venir con diferentes estructuras de la API.
  Esta función normaliza la extracción de IDs de equipos.
*/
function obtenerIdsEquiposDelGrupo(grupo) {
  if (Array.isArray(grupo.teams)) {
    return grupo.teams.map(t => (typeof t === 'object' ? t.id : t))
  }

  if (Array.isArray(grupo.team_ids)) {
    return grupo.team_ids
  }

  return []
}

function crearLeyenda() {
  const leyenda = document.createElement('div')
  leyenda.className = 'matriz_leyenda'
  leyenda.setAttribute('aria-label', 'Leyenda de la matriz')

  leyenda.innerHTML = `
    <span class="leyenda_item">
      <span class="leyenda_muestra jugado" aria-hidden="true"></span>
      Partido jugado
    </span>
    <span class="leyenda_item">
      <span class="leyenda_muestra pendiente" aria-hidden="true"></span>
      Pendiente
    </span>
    <span class="leyenda_item">
      <span class="leyenda_muestra diagonal" aria-hidden="true"></span>
      No aplica
    </span>
  `

  return leyenda
}