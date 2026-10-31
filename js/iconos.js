// Iconos SVG en línea (sin peticiones externas). Siempre decorativos: el texto acompaña al icono.

const TRAZOS = {
  coincide: '<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/>',
  claro: '<circle cx="12" cy="12" r="9.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  dudoso: '<circle cx="12" cy="12" r="9.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17.2v.1"/>',
  reloj: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.5 2"/>',
  enlace: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  libro: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/>',
  banco: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  carpeta: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  descargar: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  imprimir: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  candado: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  prueba: '<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.3 1.3 0 0 0 1.1 2h11.8a1.3 1.3 0 0 0 1.1-2l-5.5-9.5v-6"/><path d="M7.5 15h9"/>',
  reiniciar: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.1"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>',
  euro: '<circle cx="12" cy="12" r="9.5"/><path d="M15.5 8.5a4.5 4.5 0 1 0 0 7M7 11h6M7 13.5h6"/>',
  calendario: '<rect x="4" y="5.5" width="16" height="15" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  error: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  letra: '<path d="M3 19l5-14 5 14M5.2 13.5h5.6"/><path d="M14 19l3.5-9 3.5 9M15.2 16h4.6"/>',
  cargando: '<path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/>',
};

/** Devuelve el marcado SVG del icono. */
export function svgIcono(nombre) {
  const t = TRAZOS[nombre] || '';
  return `<svg class="svg-icono" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${t}</svg>`;
}

/** Crea un <span class="icono"> con el icono dentro. */
export function icono(nombre) {
  const span = document.createElement('span');
  span.className = `icono icono--${nombre}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svgIcono(nombre);
  return span;
}

/** Rellena los <span data-icono="..."> del documento. */
export function pintarIconos(raiz = document) {
  for (const span of raiz.querySelectorAll('[data-icono]')) {
    span.innerHTML = svgIcono(span.dataset.icono);
    span.classList.add(`icono--${span.dataset.icono}`);
  }
}
