/* Projeção de práticas por atividade/projeto; nomes não unem históricos. */
(function () {
    'use strict';
    const numero = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const TIPOS_PRATICA = Object.freeze({
        redacao: { sigla: 'RED', rotulo: 'Redação' },
        discursiva: { sigla: 'DIS', rotulo: 'Discursiva' },
        'estudo-caso': { sigla: 'CAS', rotulo: 'Estudo de caso' },
        peca: { sigla: 'PEÇ', rotulo: 'Peça prática' },
        sentenca: { sigla: 'SEN', rotulo: 'Sentença' },
        parecer: { sigla: 'PAR', rotulo: 'Parecer' },
        simulado: { sigla: 'SIM', rotulo: 'Simulado' },
        taf: { sigla: 'TAF', rotulo: 'TAF' },
        outra: { sigla: 'PRT', rotulo: 'Atividade prática' }
    });
    function elemento(tag, texto, classe = '') {
        const n = document.createElement(tag);
        if (texto !== undefined) n.textContent = texto;
        if (classe) n.className = classe;
        return n;
    }
    function renderizar() {
        const secao = document.getElementById('perfil-praticas');
        if (!secao) return;
        const lista = document.getElementById('perfil-praticas-lista');
        const status = document.getElementById('perfil-praticas-status');
        const resumo = document.getElementById('perfil-praticas-resumo');
        try {
            const praticas = window.PraticasStore.listarProgressao();
            secao.hidden = praticas.length === 0;
            lista.replaceChildren();
            status.textContent = '';
            if (resumo) {
                const totalXp = praticas.reduce((acc, p) => acc + Number(p.xp || 0), 0);
                resumo.textContent = praticas.length
                    ? `${praticas.length} ${praticas.length === 1 ? 'atividade' : 'atividades'} · ${numero(totalXp)} XP`
                    : '0 atividades';
            }
            for (const p of praticas) {
                const infoTipo = TIPOS_PRATICA[p.tipo] || TIPOS_PRATICA.outra;
                const card = elemento('article', '', `materia-level-card${p.nivel === 100 ? ' is-max' : ''}`);
                card.dataset.atividadeId = p.atividadeId;
                card.dataset.projetoId = p.projetoId;

                const topo = elemento('div', '', 'perfil-card-topo');
                const brasao = elemento('span', infoTipo.sigla, 'perfil-card-brasao is-pratica');
                brasao.setAttribute('aria-hidden', 'true');
                const posto = elemento('div', '', 'perfil-card-posto');
                if (p.nivel) posto.append(elemento('p', `Nível ${p.nivel}`, 'perfil-nivel'));
                posto.append(elemento('p', infoTipo.rotulo, 'perfil-pratica-tipo'));
                topo.append(brasao, posto);

                const subtitulo = elemento('p', `${p.projetoNome}${p.projetoRemovido ? ' · excluído' : p.projetoArquivado ? ' · arquivado' : ''}`, 'perfil-card-subtitulo');
                const metricas = elemento('div', '', 'perfil-card-metricas');
                metricas.append(
                    elemento('p', `${numero(p.xp)} XP`, 'perfil-nivel perfil-pratica-xp'),
                    elemento('p', `${p.concluidas} realizações · ${numero(p.tempoRegistradoSegundos / 60)} min registrados`)
                );

                card.append(topo, elemento('h3', p.nome), subtitulo, metricas);
                if (p.nivel) {
                    const avanco = elemento('div', '', 'perfil-avanco');
                    const barra = elemento('progress', '', 'perfil-barra-rpg');
                    barra.max = 100;
                    barra.value = p.percentual;
                    barra.setAttribute('aria-label', `Avanço de nível de ${p.nome}`);
                    avanco.append(
                        barra,
                        elemento('p', p.nivel === 100 ? 'Nível máximo · o XP continua acumulando'
                            : p.xpParaProximoNivel !== null ? `${numero(p.percentual)}% · faltam ${numero(p.xpParaProximoNivel)} XP para o nível ${p.nivel + 1}`
                            : `${numero(p.percentual)}% para o nível ${p.nivel + 1}`)
                    );
                    card.append(avanco);
                }
                lista.append(card);
            }
        } catch (erro) {
            secao.hidden = false;
            lista.replaceChildren();
            if (resumo) resumo.textContent = '—';
            status.textContent = 'Não foi possível carregar a progressão das práticas. Seus dados foram preservados.';
            console.error(erro);
        }
    }
    document.addEventListener('DOMContentLoaded', renderizar);
    for (const evento of ['praticas:alteradas', 'storage', 'pageshow', 'focus']) window.addEventListener(evento, renderizar);
})();
