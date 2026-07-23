/* Configuración base */

const API_BASE    = 'https://worldcup26.ir'
const MAX_RETRIES = 4          // intentos máximos antes de rendirse
const CACHE_PREFIX = 'wc26_'  // prefijo de todas las claves en localStorage

/*
  Tiempos de espera del backoff exponencial en milisegundos.
  Intento 0 -> 1000ms (1s)
  Intento 1 -> 2000ms (2s)
  Intento 2 -> 4000ms (4s)
  Intento 3 -> 8000ms (8s)
*/
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000]

/* Eventos personalizados */

/*
  Eventos que puede disparar api.js:
  - 'api:session-expired'  -> el servidor respondió 401
  - 'api:rate-limited'     -> el servidor respondió 429 (incluye segundos de espera)
  - 'api:serving-cache'    -> se está sirviendo datos del localStorage
  - 'api:retry'            -> se va a reintentar una petición (incluye intento actual)
*/

function dispararEvento(nombre, detalle = {}) {
  const evento = new CustomEvent(nombre, { detail: detalle, bubbles: true })
  document.dispatchEvent(evento)
}

/* Caché en localStorage */

function guardarEnCache(endpoint, datos) {
  const clave = CACHE_PREFIX + endpoint.replace(/\//g, '_')
  localStorage.setItem(clave, JSON.stringify(datos))
}

function leerDeCache(endpoint) {
  const clave = CACHE_PREFIX + endpoint.replace(/\//g, '_')
  const guardado = localStorage.getItem(clave)

  /* Bloque try/catch para evitar que un JSON corrupto rompa la app */
  try {
    return guardado ? JSON.parse(guardado) : null
  } catch {
    localStorage.removeItem(clave)
    return null
  }
}

/* Espera controlada */

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/* Función base de fetch */

async function peticionBase(endpoint) {
  const url = `${API_BASE}${endpoint}`

  const respuesta = await fetch(url, {
    method: 'GET',
    mode:   'cors',
    headers: {
      'Accept': 'application/json'
    }
  })

  if (!respuesta.ok) {
    const error = new Error(`HTTP ${respuesta.status}`)
    error.status = respuesta.status

    if (respuesta.status === 429) {
      const retryAfter = respuesta.headers.get('Retry-After')
      error.retryAfter = retryAfter ? parseInt(retryAfter) : null
    }

    throw error
  }

  return await respuesta.json()
}

/* Fetch con backoff exponencial */

async function fetchConBackoff(endpoint) {
  let ultimoError = null

  for (let intento = 0; intento < MAX_RETRIES; intento++) {

    try {
      const datos = await peticionBase(endpoint)

      guardarEnCache(endpoint, datos)
      return { datos, desdeCache: false }

    } catch (error) {

      ultimoError = error

      /* Error 401 */
      if (error.status === 401) {
        if (intento < MAX_RETRIES - 1) {
          const espera = BACKOFF_DELAYS[intento] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]

          dispararEvento('api:retry', {
            intento: intento + 1,
            maxIntentos: MAX_RETRIES,
            esperaMs: espera,
            endpoint
          })

          await esperar(espera)
          continue
        }
        break
      }

      /* Error 429: límite de tasa */
      if (error.status === 429) {

        const espera = error.retryAfter
          ? error.retryAfter * 1000
          : BACKOFF_DELAYS[intento] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]

        dispararEvento('api:rate-limited', {
          segundos: Math.ceil(espera / 1000),
          intento: intento + 1,
          maxIntentos: MAX_RETRIES
        })

        await esperar(espera)
        continue
      }

      /* Error 500 o fallo de red */
      if (error.status === 500 || !error.status) {
        
        if (intento < MAX_RETRIES - 1) {
          const espera = BACKOFF_DELAYS[intento] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]

          dispararEvento('api:retry', {
            intento: intento + 1,
            maxIntentos: MAX_RETRIES,
            esperaMs: espera,
            endpoint
          })

          await esperar(espera)
          continue
        }
      }
      break
    }
  }

  const datosCache = leerDeCache(endpoint)

  if (datosCache) {
    dispararEvento('api:serving-cache', { endpoint })
    return { datos: datosCache, desdeCache: true }
  }

  throw ultimoError ?? new Error('Error desconocido al conectar con la API')
}

/* Endpoints públicos */

async function obtenerSedes() {
  const resultado = await fetchConBackoff('/get/stadiums')
  return { ...resultado, datos: resultado.datos.stadiums ?? [] }
}

async function obtenerPartidos() {
  const resultado = await fetchConBackoff('/get/games')
  return { ...resultado, datos: resultado.datos.games ?? [] }
}

async function obtenerEquipos() {
  const resultado = await fetchConBackoff('/get/teams')
  return { ...resultado, datos: resultado.datos.teams ?? [] }
}

async function obtenerGrupos() {
  const resultado = await fetchConBackoff('/get/groups')
  return { ...resultado, datos: resultado.datos.groups ?? [] }
}
/* Limpiar caché de un endpoint */

function limpiarCache(endpoint) {
  const clave = CACHE_PREFIX + endpoint.replace(/\//g, '_')
  localStorage.removeItem(clave)
}

function limpiarTodoElCache() {
  Object.keys(localStorage)
    .filter(clave => clave.startsWith(CACHE_PREFIX))
    .forEach(clave => localStorage.removeItem(clave))
}