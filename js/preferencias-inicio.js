// Se carga antes de pintar la página para aplicar el tamaño de letra y el tema guardados.
// Es lo único que esta web guarda en el ordenador (localStorage), nunca datos de los archivos.
(function () {
  var raiz = document.documentElement;
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('conciliador-preferencias') || '{}') || {}; } catch (e) { prefs = {}; }
  var letras = ['normal', 'grande', 'muy-grande'];
  var temas = ['auto', 'claro', 'oscuro', 'contraste'];
  raiz.setAttribute('data-letra', letras.indexOf(prefs.letra) >= 0 ? prefs.letra : 'normal');
  raiz.setAttribute('data-tema', temas.indexOf(prefs.tema) >= 0 ? prefs.tema : 'auto');
})();
