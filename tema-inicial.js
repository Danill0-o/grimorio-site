/* Aplica apenas a preferência visual antes dos estilos. Não grava dados nem
   inicializa stores; o bootstrap offline continua protegendo o acervo. */
(function () {
    'use strict';
    globalThis.fliperamaDesbloqueado = function () {
        try {
            const estado = JSON.parse(localStorage.getItem('grimorioSistemaIaV1') || 'null');
            return estado?.versao === 1 && ['konami_code', 'segredo_konami'].some(id =>
                Number.isFinite(Date.parse(estado.desbloqueadas?.[id]?.em)));
        } catch (_) { return false; }
    };
    let tema = 'arcano';
    try { tema = localStorage.getItem('grimorioTemaPixelV1') || tema; } catch (_) {}
    if (tema === 'reliquia') tema = 'floresta';
    if (!['taverna', 'arcano', 'floresta', 'fliperama'].includes(tema)) tema = 'arcano';
    if (tema === 'fliperama' && !globalThis.fliperamaDesbloqueado()) tema = 'arcano';
    document.documentElement.dataset.temaPixel = tema;
})();
