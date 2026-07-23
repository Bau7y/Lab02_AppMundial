/* Navbar Component */

class NavBar extends HTMLElement {

  connectedCallback() {
    this.innerHTML = `
      <nav class="navbar" role="navigation" aria-label="Navegación principal">
        <div class="container navbar_inner">

          <!-- Logo -->
          <a href="/index.html" class="navbar_logo" aria-label="Mundial 2026 - Inicio">
            Mundial <span>2026</span>
          </a>

          <!-- Links desktop - Flexbox -->
          <ul class="navbar_links" role="list">
            <li><a href="/pages/tour-sedes.html">Tour de Sedes</a></li>
            <li><a href="/pages/agenda-simultanea.html">Agenda</a></li>
            <li><a href="/pages/timeline-infinito.html">Timeline</a></li>
            <li><a href="/pages/dashboard-fanatico.html">Dashboard</a></li>
            <li><a href="/pages/matriz-enfrentamientos.html">Matriz</a></li>
          </ul>

          <!-- Botón hamburger (visible en móvil) -->
          <button
            class="btn_menu"
            id="menu_toggle"
            aria-label="Abrir menú de navegación"
            aria-expanded="false"
            aria-controls="mobile_menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

        </div>

        <!-- Menú móvil -->
        <div
          class="navbar_mobile"
          id="mobile_menu"
          role="menu"
          aria-label="Menú móvil"
        >
          <a href="/index.html" role="menuitem">Inicio</a>
          <a href="/pages/tour-sedes.html" role="menuitem">Tour de Sedes</a>
          <a href="/pages/agenda-simultanea.html" role="menuitem">Agenda</a>
          <a href="/pages/timeline-infinito.html" role="menuitem">Timeline</a>
          <a href="/pages/dashboard-fanatico.html" role="menuitem">Dashboard</a>
          <a href="/pages/matriz-enfrentamientos.html" role="menuitem">Matriz</a>
        </div>
      </nav>
    `

    this._initScrollEffect()
    this._initMobileMenu()
    this._initActiveLink()
  }

  /* Sombra al hacer scroll */
  _initScrollEffect() {
    const navbar = this.querySelector('.navbar')

    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        navbar.classList.add('scrolled')
      } else {
        navbar.classList.remove('scrolled')
      }
    }, { passive: true })
  }

  /* Hamburger menu toggle */
  _initMobileMenu() {
    const menuBtn    = this.querySelector('#menu_toggle')
    const mobileMenu = this.querySelector('#mobile_menu')

    menuBtn.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open')
      menuBtn.classList.toggle('open', isOpen)
      menuBtn.setAttribute('aria-expanded', isOpen)
    })

    /* Cerrar al hacer click en un link */
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open')
        menuBtn.classList.remove('open')
        menuBtn.setAttribute('aria-expanded', 'false')
      })
    })

    /* Cerrar al hacer click fuera */
    document.addEventListener('click', (e) => {
      if (!this.contains(e.target)) {
        mobileMenu.classList.remove('open')
        menuBtn.classList.remove('open')
        menuBtn.setAttribute('aria-expanded', 'false')
      }
    })
  }

  /* Marcar el link activo según la URL actual */
  _initActiveLink() {
    const currentPath = window.location.pathname

    this.querySelectorAll('a').forEach(link => {
      const linkPath = new URL(link.href).pathname

      if (
        linkPath === currentPath ||
        (currentPath === '/' && linkPath.endsWith('index.html'))
      ) {
        link.classList.add('active')
        link.setAttribute('aria-current', 'page')
      }
    })
  }
}

/* Footer Component */

class SiteFooter extends HTMLElement {

  connectedCallback() {
    const year = new Date().getFullYear()

    this.innerHTML = `
      <footer class="footer" role="contentinfo">
        <div class="container">

          <div class="footer_grid">

            <!-- Columna brand -->
            <div class="footer_brand">
              <a href="/index.html" class="navbar_logo" aria-label="Mundial 2026 - Inicio">
                Mundial <span>2026</span>
              </a>
              <p>
                Aplicación interactiva del Mundial 2026.
                Laboratorio #2 — ISW-521, UTN San Carlos.
              </p>
            </div>

            <!-- Columna navegación -->
            <div class="footer_col">
              <h4>Vistas</h4>
              <ul role="list">
                <li><a href="/pages/tour-sedes.html">Tour de Sedes</a></li>
                <li><a href="/pages/agenda-simultanea.html">Agenda Simultánea</a></li>
                <li><a href="/pages/timeline-infinito.html">Timeline Infinito</a></li>
                <li><a href="/pages/dashboard-fanatico.html">Dashboard</a></li>
                <li><a href="/pages/matriz-enfrentamientos.html">Matriz</a></li>
              </ul>
            </div>

            <!-- Columna API -->
            <div class="footer_col">
              <h4>Fuente de datos</h4>
              <ul role="list">
                <li>
                  <a
                    href="https://worldcup26.ir"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Ir al sitio de la API del Mundial 2026"
                  >
                    worldcup26.ir ↗
                  </a>
                </li>
              </ul>
            </div>

          </div>

          <!-- Barra inferior -->
          <div class="footer_bottom">
            <p>© ${year} ISW-521 — UTN San Carlos</p>
            <p>Datos provistos por la API pública del Mundial 2026</p>
          </div>

        </div>
      </footer>
    `
  }
}

/* Registro de componentes */

customElements.define('nav-bar', NavBar)
customElements.define('site-footer', SiteFooter)