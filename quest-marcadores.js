/* Projeção visual descartável: não grava fatos, alertas ou planejamento. */
(function () {
    'use strict';
    let pendente = false, ajuda, origem;
    function situacao(missao, hoje) {
        if (!missao || missao.concluida || missao.removida) return null;
        if (missao.dataPrevista === hoje) return 'atividade disponível';
        if (missao.dataPrevista === window.CalendarioJornada.somarDias(hoje, 1)) return 'atividade próxima';
        return null;
    }
    function fecharAjuda() {
        if (ajuda?.matches(':popover-open')) ajuda.hidePopover();
        origem?.removeAttribute('aria-describedby'); origem = null;
    }
    function mostrarAjuda(marcador) {
        fecharAjuda();
        if (!ajuda) {
            ajuda = document.createElement('span'); ajuda.id = 'quest-ajuda';
            ajuda.className = 'quest-ajuda'; ajuda.setAttribute('popover', 'manual');
            ajuda.setAttribute('role', 'tooltip'); document.body.append(ajuda);
        }
        origem = marcador; ajuda.textContent = marcador.getAttribute('aria-label');
        marcador.setAttribute('aria-describedby', ajuda.id); ajuda.showPopover();
        const r = marcador.getBoundingClientRect();
        ajuda.style.left = Math.max(8, Math.min(r.left, innerWidth - ajuda.offsetWidth - 8)) + 'px';
        ajuda.style.top = Math.max(8, r.bottom + ajuda.offsetHeight + 8 > innerHeight ? r.top - ajuda.offsetHeight - 8 : r.bottom + 8) + 'px';
    }
    function criar(rotulo) {
        const marcador = document.createElement('span'); marcador.className = 'quest-marcador';
        marcador.tabIndex = 0; marcador.setAttribute('role', 'img');
        marcador.setAttribute('aria-label', rotulo); marcador.title = rotulo;
        const imagem = document.createElement('img'); imagem.src = 'img/icons/quest-available.png';
        imagem.alt = ''; imagem.width = 32; imagem.height = 32; marcador.append(imagem);
        marcador.addEventListener('pointerenter', () => mostrarAjuda(marcador));
        marcador.addEventListener('pointerleave', () => { if (document.activeElement !== marcador) fecharAjuda(); });
        marcador.addEventListener('focus', () => mostrarAjuda(marcador));
        marcador.addEventListener('blur', fecharAjuda);
        marcador.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation();
            if (marcador.parentElement.matches('#jornada-menu-aberto > summary')) document.getElementById('jornada-menu-aberto').open = true;
            mostrarAjuda(marcador);
        });
        marcador.addEventListener('keydown', event => {
            if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); marcador.click(); }
        });
        return marcador;
    }
    function atualizar() {
        pendente = false;
        if (origem && !origem.isConnected) fecharAjuda();
        if (!window.PraticasStore || !window.ProjetosStore?.temAtual()) return;
        let missoes;
        try {
            const id = window.ProjetosStore.idAtual();
            const removidas = new Set(window.PraticasStore.listarAtividades(id, { incluirRemovidas: true }).filter(r => r.removida).map(r => r.atividade.atividadeId));
            missoes = window.PraticasStore.projetarMissoesProjeto(id).missoes.filter(m => !removidas.has(m.atividadeId));
        } catch (_) { missoes = []; } // Retira alertas se não for possível confirmar sua elegibilidade.
        const hoje = window.CalendarioJornada.dataLocal();
        for (const alvo of document.querySelectorAll('[data-quest-missao], [data-quest-atividade], [data-quest-agregado]')) {
            const elegiveis = missoes.filter(m => (!alvo.dataset.questMissao || m.missaoId === alvo.dataset.questMissao)
                && (!alvo.dataset.questAtividade || m.atividadeId === alvo.dataset.questAtividade)).map(m => situacao(m, hoje));
            const rotulo = elegiveis.includes('atividade disponível') ? 'atividade disponível' : elegiveis.includes('atividade próxima') ? 'atividade próxima' : null;
            const atual = [...alvo.children].find(n => n.classList.contains('quest-marcador'));
            if (atual?.getAttribute('aria-label') === rotulo) continue;
            if (atual === origem) fecharAjuda();
            atual?.remove();
            if (rotulo) alvo.append(criar(rotulo));
        }
    }
    function agendar() { if (!pendente) { pendente = true; queueMicrotask(atualizar); } }
    function vincular(alvo, tipo, id = '') {
        alvo.dataset['quest' + tipo] = id; agendar(); return alvo;
    }
    document.addEventListener('DOMContentLoaded', () => {
        const botao = document.getElementById('abrir-praticas') || document.getElementById('atalho-praticas');
        if (botao) {
            vincular(botao, 'Agregado');
            vincular(document.querySelector('#jornada-menu-aberto > summary'), 'Agregado');
        }
        agendar(); window.setInterval(agendar, 30000);
    });
    for (const evento of ['praticas:alteradas', 'projetos:alterados', 'storage', 'focus', 'pageshow']) window.addEventListener(evento, agendar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) agendar(); });
    document.addEventListener('click', event => { if (!event.target.closest('.quest-marcador')) fecharAjuda(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && origem) { event.preventDefault(); event.stopImmediatePropagation(); fecharAjuda(); } }, true);
    window.addEventListener('scroll', fecharAjuda, { passive: true });
    window.addEventListener('resize', fecharAjuda);
    window.QuestMarcadores = Object.freeze({ vincular, atualizar, situacao });
})();
