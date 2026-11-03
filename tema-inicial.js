/* Aplica apenas a preferência visual antes dos estilos. Não grava dados nem
   inicializa stores; o bootstrap offline continua protegendo o acervo. */
(function () {
    'use strict';
    let tema = 'taverna';
    try { tema = localStorage.getItem('grimorioTemaPixelV1') || tema; } catch (_) {}
    if (tema === 'reliquia') tema = 'floresta';
    if (!['taverna', 'arcano', 'floresta'].includes(tema)) tema = 'taverna';
    document.documentElement.dataset.temaPixel = tema;
})();
