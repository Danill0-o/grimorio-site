/* Artes compartilhadas; o nome acessível pertence ao botão, não à imagem. */
(function () {
    'use strict';
    const arquivos = Object.freeze({ esquerda: 'seta-esquerda.png', direita: 'seta-direita.png',
        cima: 'seta-cima.png', baixo: 'seta-baixo.png', salvar: 'disquete.png',
        anotar: 'pena.png', excluir: 'lixeira-magnific.png' });
    function criar(nome) {
        if (!arquivos[nome]) throw new Error('Ícone pixel desconhecido: ' + nome);
        const img = document.createElement('img'); img.src = 'img/icons/' + arquivos[nome];
        img.alt = ''; img.setAttribute('aria-hidden', 'true');
        img.className = 'icone-pixel icone-pixel-' + nome; img.width = 24; img.height = 24;
        return img;
    }
    function ajuda(botao, popup) {
        const posicionar = () => {
            if (!popup.matches(':popover-open')) return;
            const r = botao.getBoundingClientRect();
            popup.style.left = Math.max(8, Math.min(r.right - popup.offsetWidth, innerWidth - popup.offsetWidth - 8)) + 'px';
            popup.style.top = Math.max(8, r.bottom + 8 + popup.offsetHeight > innerHeight ? r.top - popup.offsetHeight - 8 : r.bottom + 8) + 'px';
        };
        popup.addEventListener('toggle', posicionar);
        botao.addEventListener('click', event => { event.preventDefault(); popup.togglePopover(); posicionar(); });
        addEventListener('resize', posicionar); addEventListener('scroll', posicionar, true);
    }
    document.addEventListener('DOMContentLoaded', () => {
        for (const b of document.querySelectorAll('[data-ajuda-contextual]')) ajuda(b, document.getElementById(b.getAttribute('popovertarget')));
    });
    window.IconesPixel = Object.freeze({ criar, ajuda });
})();
