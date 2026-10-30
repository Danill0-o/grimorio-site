/* Projeção de práticas por atividade/projeto; nomes não unem históricos. */
(function () {
    'use strict';
    const numero = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    function elemento(tag, texto, classe = '') {
        const n = document.createElement(tag); n.textContent = texto; n.className = classe; return n;
    }
    function renderizar() {
        const secao = document.getElementById('perfil-praticas');
        if (!secao) return;
        const lista = document.getElementById('perfil-praticas-lista'), status = document.getElementById('perfil-praticas-status');
        try {
            const praticas = window.PraticasStore.listarProgressao();
            secao.hidden = praticas.length === 0; lista.replaceChildren(); status.textContent = '';
            for (const p of praticas) {
                const card = elemento('article', '', 'materia-level-card'); card.dataset.atividadeId = p.atividadeId; card.dataset.projetoId = p.projetoId;
                card.append(elemento('h3', p.nome), elemento('p', `${p.projetoNome}${p.projetoRemovido ? ' · excluído' : p.projetoArquivado ? ' · arquivado' : ''}`),
                    elemento('p', `${numero(p.xp)} XP`, 'perfil-nivel'),
                    elemento('p', `${p.concluidas} realizações · ${numero(p.tempoRegistradoSegundos / 60)} min registrados`));
                if (p.nivel) {
                    const barra = elemento('progress'); barra.max = 100; barra.value = p.percentual;
                    barra.setAttribute('aria-label', `Avanço de nível de ${p.nome}`);
                    card.append(elemento('p', `Nível ${p.nivel}`, 'perfil-nivel'), barra,
                        elemento('p', p.nivel === 100 ? 'Nível máximo · o XP continua acumulando'
                            : p.xpParaProximoNivel !== null ? `${numero(p.percentual)}% · faltam ${numero(p.xpParaProximoNivel)} XP para o nível ${p.nivel + 1}`
                            : `${numero(p.percentual)}% para o nível ${p.nivel+1}`));
                }
                lista.append(card);
            }
        } catch (erro) {
            secao.hidden = false; lista.replaceChildren();
            status.textContent = 'Não foi possível carregar a progressão das práticas. Seus dados foram preservados.';
            console.error(erro);
        }
    }
    document.addEventListener('DOMContentLoaded', renderizar);
    for (const evento of ['praticas:alteradas', 'storage', 'pageshow', 'focus']) window.addEventListener(evento, renderizar);
})();
