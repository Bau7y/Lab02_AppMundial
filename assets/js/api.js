/* ============================================================
   api.js — Mundial 2026
   Capa de red: toda llamada HTTP del proyecto pasa por aquí.
   - async/await exclusivo, sin .then() ni .catch()
   - Backoff exponencial para 429 y 500
   - Caché en localStorage por endpoint
   - Detección de 401 sin reload()
   ============================================================ */

/* ── 1. Configuración base ──────────────────────────────── */

const API_BASE    = 'https://worldcup26.ir'
const MAX_RETRIES = 4          // intentos máximos antes de rendirse
const CACHE_PREFIX = 'wc26_'  // prefijo de todas las claves en localStorage

/*
  Tiempos de espera del backoff exponencial en milisegundos.
  Intento 0 → 1000ms (1s)
  Intento 1 → 2000ms (2s)
  Intento 2 → 4000ms (4s)
  Intento 3 → 8000ms (8s)
*/
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000]

/* ── 2. Eventos personalizados ──────────────────────────── */

/*
  En lugar de llamar directamente a ui.js desde aquí,
  api.js dispara eventos personalizados en el documento.
  ui.js los escucha y reacciona visualmente.
  Esto mantiene api.js completamente desacoplado del DOM.

  Eventos que puede disparar api.js:
  - 'api:session-expired'  → el servidor respondió 401
  - 'api:rate-limited'     → el servidor respondió 429 (incluye segundos de espera)
  - 'api:serving-cache'    → se está sirviendo datos del localStorage
  - 'api:retry'            → se va a reintentar una petición (incluye intento actual)
*/

function dispararEvento(nombre, detalle = {}) {
  const evento = new CustomEvent(nombre, { detail: detalle, bubbles: true })
  document.dispatchEvent(evento)
}

/* ── 3. Caché en localStorage ───────────────────────────── */

/*
  Cada endpoint tiene su propia clave en localStorage.
  La clave se construye como: wc26_/get/stadiums → wc26_get_stadiums
  Se guarda el objeto completo de la respuesta JSON.
*/

function guardarEnCache(endpoint, datos) {
  const clave = CACHE_PREFIX + endpoint.replace(/\//g, '_')
  localStorage.setItem(clave, JSON.stringify(datos))
}

function leerDeCache(endpoint) {
  const clave = CACHE_PREFIX + endpoint.replace(/\//g, '_')
  const guardado = localStorage.getItem(clave)

  /*
    JSON.parse() puede lanzar un error si el string guardado
    está corrupto. Lo manejamos con try/catch para no romper
    la aplicación por un dato malo en localStorage.
  */
  try {
    return guardado ? JSON.parse(guardado) : null
  } catch {
    localStorage.removeItem(clave)
    return null
  }
}

/* ── 4. Espera controlada ───────────────────────────────── */

/*
  Devuelve una Promise que se resuelve después de 'ms' milisegundos.
  Se usa dentro del backoff: await esperar(1000) pausa 1 segundo
  sin bloquear el hilo principal del navegador.
*/

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/* ── 5. Función base de fetch ───────────────────────────── */

/*
  peticionBase() es la función que hace el fetch real.
  Recibe el endpoint (ej: '/get/stadiums') y devuelve los datos
  o lanza un error con información del código HTTP.

  No tiene reintentos — eso lo maneja fetchConBackoff().
  Esta separación permite testear cada responsabilidad por separado.
*/

async function peticionBase(endpoint) {
  const url = `${API_BASE}${endpoint}`

  /*
    fetch() puede lanzar un TypeError si no hay conexión a internet
    (sin respuesta del servidor). Ese error se deja burbujear hacia
    fetchConBackoff() que lo trata como fallo de red.
  */
  /*
    mode: 'cors' indica explícitamente que esta es una petición
    cross-origin. Es el valor por defecto de fetch pero se
    declara para claridad.
    Se omite Content-Type en GET porque genera un preflight
    OPTIONS innecesario que algunas APIs públicas rechazan.
  */
  const respuesta = await fetch(url, {
    method: 'GET',
    mode:   'cors',
    headers: {
      'Accept': 'application/json'
    }
  })

  /*
    fetch() NO lanza error por códigos 4xx o 5xx.
    Hay que revisar respuesta.ok (true si status 200–299)
    y lanzar el error manualmente para que fetchConBackoff()
    pueda capturarlo.
  */
  if (!respuesta.ok) {
    const error = new Error(`HTTP ${respuesta.status}`)
    error.status = respuesta.status

    /*
      Para el 429, el servidor puede incluir el header Retry-After
      indicando cuántos segundos esperar. Lo guardamos en el error.
    */
    if (respuesta.status === 429) {
      const retryAfter = respuesta.headers.get('Retry-After')
      error.retryAfter = retryAfter ? parseInt(retryAfter) : null
    }

    throw error
  }

  return await respuesta.json()
}

/* ── 6. Fetch con backoff exponencial ───────────────────── */

/*
  fetchConBackoff() envuelve peticionBase() y agrega:
  - Reintentos automáticos con espera creciente para 429 y 500
  - Detección de 401 para disparar el evento de sesión expirada
  - Fallback al caché de localStorage si todos los reintentos fallan
*/

async function fetchConBackoff(endpoint) {
  let ultimoError = null

  for (let intento = 0; intento < MAX_RETRIES; intento++) {

    try {
      const datos = await peticionBase(endpoint)

      /*
        Si llegamos aquí, la petición fue exitosa.
        Guardamos los datos en caché y los devolvemos.
      */
      guardarEnCache(endpoint, datos)
      return { datos, desdeCache: false }

    } catch (error) {

      ultimoError = error

      /* ── Error 401 ── */
      /*
        La API worldcup26.ir es pública y no requiere token.
        Un 401 aquí indica un rechazo temporal del servidor
        (puede ocurrir por CORS o configuración del servidor),
        no una sesión expirada del usuario.
        Se trata igual que un 500: backoff exponencial y
        fallback a caché. El modal de sesión expirada queda
        como código de defensa para contextos con JWT real.
      */
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

      /* ── Error 429: límite de tasa ── */
      if (error.status === 429) {
        /*
          Usamos el tiempo del header Retry-After si existe,
          o el tiempo del backoff exponencial si no.
        */
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

      /* ── Error 500 o fallo de red ── */
      if (error.status === 500 || !error.status) {
        /*
          Para 500 y errores de red (sin status) aplicamos
          backoff exponencial y avisamos que vamos a reintentar.
        */
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

      /*
        Cualquier otro error (403, 404, etc.) no se reintenta.
        Salimos del loop y caemos al fallback de caché.
      */
      break
    }
  }

  /* ── Fallback: intentar servir desde caché ── */
  const datosCache = leerDeCache(endpoint)

  if (datosCache) {
    dispararEvento('api:serving-cache', { endpoint })
    return { datos: datosCache, desdeCache: true }
  }

  /*
    Si no hay caché y todos los reintentos fallaron,
    lanzamos el error para que la página lo maneje
    y muestre el estado de error correspondiente.
  */
  throw ultimoError ?? new Error('Error desconocido al conectar con la API')
}

/* ── 7. Endpoints públicos ──────────────────────────────── */

/*
  Cada función de endpoint es un wrapper simple sobre fetchConBackoff().
  Esto permite llamar a obtenerSedes() en lugar de
  fetchConBackoff('/get/stadiums') desde las páginas,
  haciendo el código más legible y el refactor más fácil.
*/
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
/* ── 8. Limpiar caché de un endpoint ────────────────────── */

/*
  Se usa cuando queremos forzar una petición fresca,
  por ejemplo al reautenticarse después de un 401.
*/

function limpiarCache(endpoint) {
  const clave = CACHE_PREFIX + endpoint.replace(/\//g, '_')
  localStorage.removeItem(clave)
}

function limpiarTodoElCache() {
  Object.keys(localStorage)
    .filter(clave => clave.startsWith(CACHE_PREFIX))
    .forEach(clave => localStorage.removeItem(clave))
}