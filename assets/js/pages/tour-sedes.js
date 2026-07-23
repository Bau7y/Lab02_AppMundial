const contenedor_sedes    = document.getElementById('contenedor_sedes')
const contenedor_partidos = document.getElementById('contenedor_partidos')
const titulo_sede_activa  = document.getElementById('titulo_sede_activa')

let datos_sedes    = []
let datos_partidos = []
let sede_activa_id = null

document.addEventListener('DOMContentLoaded', () => {
  iniciarVista()

  document.addEventListener('ui:reintentar', async (e) => {
    const { endpoint } = e.detail
    if (endpoint === '/get/stadiums' || endpoint === '/get/games') {
      await iniciarVista()
    }
  })

  document.addEventListener('ui:reautenticar', async () => {
    limpiarTodoElCache()
    await iniciarVista()
  })
})

async function iniciarVista() {
  mostrarSkeletons(contenedor_sedes, 8, 'card')
  mostrarSkeletons(contenedor_partidos, 4, 'fila')

  try {
    const [resultado_sedes, resultado_partidos] = await Promise.all([
      obtenerSedes(),
      obtenerPartidos()
    ])

    datos_sedes    = resultado_sedes.datos
    datos_partidos = resultado_partidos.datos

    renderizarSedes(datos_sedes)

  } catch (error) {
    if (datos_sedes.length === 0) {
      mostrarError(contenedor_sedes, 'No se pudieron cargar las sedes.', '/get/stadiums')
    }
    if (datos_partidos.length === 0) {
      mostrarVacio(contenedor_partidos, 'No hay partidos disponibles.')
    }
  }
}

function renderizarSedes(sedes) {
  if (!contenedor_sedes) return
  contenedor_sedes.innerHTML = ''

  if (sedes.length === 0) {
    mostrarVacio(contenedor_sedes, 'No se encontraron sedes.')
    return
  }

  sedes.forEach(sede => {
    const cantidad = datos_partidos.filter(p =>
      String(p.stadium_id) === String(sede.id)
    ).length

    const btn = document.createElement('button')
    btn.className = 'sede_btn'
    btn.setAttribute('aria-pressed', 'false')
    btn.setAttribute('aria-label', `Ver partidos de ${sede.name_en}, ${sede.city_en}`)
    btn.dataset.id = sede.id

    btn.innerHTML = `
      <span class="sede_btn_icono" aria-hidden="true">🏟️</span>
      <span class="sede_btn_info">
        <span class="sede_btn_nombre">${sede.name_en}</span>
        <span class="sede_btn_pais">${sede.city_en} / ${sede.country_en}</span>
      </span>
      ${cantidad > 0
        ? `<span class="sede_btn_contador" aria-label="${cantidad} partidos">${cantidad}</span>`
        : ''}
    `

    btn.addEventListener('click', () => manejarClickSede(sede, btn))
    contenedor_sedes.appendChild(btn)
  })

  mostrarPlaceholderPartidos()
}

function manejarClickSede(sede, btnClickeado) {
  if (sede_activa_id === sede.id) return
  sede_activa_id = sede.id
  actualizarEstadoActivo(btnClickeado)
  renderizarPartidosDeSede(sede)

  if (contenedor_partidos) {
    contenedor_partidos.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function actualizarEstadoActivo(btnActivo) {
  contenedor_sedes.querySelectorAll('.sede_btn').forEach(btn => {
    btn.classList.remove('activa')
    btn.setAttribute('aria-pressed', 'false')
  })
  btnActivo.classList.add('activa')
  btnActivo.setAttribute('aria-pressed', 'true')
}

function renderizarPartidosDeSede(sede) {
  if (!contenedor_partidos) return

  if (titulo_sede_activa) {
    titulo_sede_activa.textContent = sede.name_en
  }

  if (datos_partidos.length === 0) {
    contenedor_partidos.innerHTML = `
      <div class="partidos_error_local" role="alert">
        <span aria-hidden="true">!</span>
        <p>No se pudieron cargar los partidos de esta sede.</p>
      </div>
    `
    return
  }

  const partidos_sede = datos_partidos.filter(p =>
    String(p.stadium_id) === String(sede.id)
  )

  if (partidos_sede.length === 0) {
    mostrarVacio(contenedor_partidos, `No hay partidos registrados para ${sede.name_en}.`)
    return
  }

  contenedor_partidos.innerHTML = ''

  partidos_sede.forEach(partido => {
    const jugado = partido.finished === 'TRUE'
    const card   = document.createElement('article')
    card.className = 'partido_card'
    card.setAttribute('aria-label',
      `${partido.home_team_name_en} vs ${partido.away_team_name_en}`)

    card.innerHTML = `
      <div class="partido_equipos">
        <div class="partido_equipo">
          <span class="partido_equipo_nombre">${partido.home_team_name_en ?? 'Por definir'}</span>
        </div>
        <div>
          ${jugado
            ? `<span class="partido_resultado">${partido.home_score} - ${partido.away_score}</span>`
            : `<span class="partido_vs" aria-hidden="true">VS</span>`}
        </div>
        <div class="partido_equipo">
          <span class="partido_equipo_nombre">${partido.away_team_name_en ?? 'Por definir'}</span>
        </div>
      </div>
      <div class="partido_meta">
        <span class="partido_meta_item">${partido.local_date ?? 'Fecha TBD'}</span>
        ${partido.group
          ? `<span class="partido_meta_item">Grupo ${partido.group}</span>`
          : ''}
        <span class="badge ${jugado ? 'badge_jugado' : 'badge_pendiente'}">
          ${jugado ? 'Jugado' : 'Pendiente'}
        </span>
      </div>
    `
    contenedor_partidos.appendChild(card)
  })
}

function mostrarPlaceholderPartidos() {
  if (!contenedor_partidos) return
  contenedor_partidos.innerHTML = `
    <div class="partidos_placeholder" role="status" aria-live="polite">
      <span class="partidos_placeholder_icono" aria-hidden="true">🏟️</span>
      <p>Selecciona una sede para ver sus partidos.</p>
    </div>
  `
}