/* Consulta local do projeto selecionado; não gera plano nem altera sessões/metas. */
(function () {
    'use strict';
    const el = id => document.getElementById(id);
    const campos = ['relatorio-projeto-de', 'relatorio-projeto-ate', 'relatorio-projeto-grupo'];
    const ler = (chave, padrao) => JSON.parse(ProjetoStorage.getItem(chave) || JSON.stringify(padrao));
    function renderizar() {
        const tempo = el('relatorio-projeto-tempo'), metas = el('relatorio-projeto-metas');
        try {
            const projetoId = ProjetosStore.idAtual();
            const dados = ler('dadosExame', {}), plano = ler('materiaDoDia', {});
            const sessoesProjeto = EstudoStore.listarSessoes().filter(s => s.projetoId === projetoId);
            const registros = sessoesProjeto.map(sessao => {
                MateriasStore.obterProjetoMateria(sessao.projetoMateriaId, projetoId);
                return { sessao, id: sessao.projetoMateriaId, nome: IdentidadeStore.nomeMateria(sessao.projetoMateriaId) };
            });
            const progresso = EstudoStore.calcularProgressoPlano({ dados, materiaDoDia: plano, sessoesProjeto, distribuicaoMaterias: ler('lista_distribuicao_materias', []) });
            metas.replaceChildren();
            const materias = Object.values(progresso.materias).map(m => ({ id: m.projetoMateriaId, nome: m.nome,
                cumprido: m.segundosCreditados, falta: m.metaTotalSegundos - m.segundosCreditados, total: m.metaTotalSegundos }))
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
            RelatoriosUI.barras(metas, 'Metas por matéria', materias, true);
            const calendario = CalendarioJornada.mapear(dados, progresso.dias.length);
            const dias = progresso.dias.map(d => {
                const total = d.metasMaterias.reduce((s, m) => s + m.metaSegundos, 0);
                const cumprido = d.metasMaterias.reduce((s, m) => s + m.pontosAplicadosSegundos, 0);
                const data = calendario.porDia[d.dia];
                return { nome: `Dia ${d.indice + 1}${data ? ` · ${data.split('-').reverse().join('/')}` : ''}`, total, cumprido, falta: total - cumprido };
            });
            // A jornada pode ser longa: a visão por dia também é paginada em 12 metas.
            mostrarDias(metas, dias);
            const total = materias.reduce((s, m) => s + m.total, 0), cumprido = materias.reduce((s, m) => s + m.cumprido, 0);
            el('relatorio-projeto-metas-resumo').textContent = total ? `${Math.round(cumprido / total * 100)}% da carga planejada · ${RelatoriosUI.tempo(cumprido)} de ${RelatoriosUI.tempo(total)}.` : 'Ainda não há carga planejada neste projeto.';
            try {
                const de = el(campos[0]).value, ate = el(campos[1]).value, grupo = el(campos[2]).value;
                RelatoriosUI.mostrar(tempo, RelatoriosEstudo.resumir(registros, { de, ate, grupo }), JSON.stringify([projetoId, de, ate, grupo]));
                el('relatorio-projeto-status').textContent = '';
            } catch (erro) {
                if (el(campos[0]).value > el(campos[1]).value && el(campos[1]).value) {
                    RelatoriosUI.erro(tempo, 'A data inicial deve ser anterior ou igual à data final.');
                    el('relatorio-projeto-status').textContent = 'Ajuste o período para consultar as horas.';
                } else throw erro;
            }
        } catch (_) {
            const mensagem = 'Não foi possível carregar os gráficos. Os dados foram preservados; recarregue para tentar novamente.';
            RelatoriosUI.erro(tempo, mensagem); metas.replaceChildren();
            el('relatorio-projeto-metas-resumo').textContent = '';
            el('relatorio-projeto-status').textContent = mensagem;
        }
    }
    let paginaDias = 0;
    function mostrarDias(raiz, dias) {
        const container = document.createElement('div'); container.tabIndex = -1; raiz.append(container);
        const paginas = Math.max(1, Math.ceil(dias.length / 12)); paginaDias = Math.min(paginaDias, paginas - 1);
        function atualizar() {
            container.replaceChildren();
            RelatoriosUI.barras(container, 'Metas por dia da jornada', dias.slice(paginaDias * 12, (paginaDias + 1) * 12), true);
            if (paginas < 2) return;
            const nav = document.createElement('nav'); nav.className = 'relatorios-paginacao'; nav.setAttribute('aria-label', 'Páginas das metas por dia');
            for (const [rotulo, delta] of [['Dias anteriores', -1], ['Dias seguintes', 1]]) {
                const botao = document.createElement('button'); botao.className = 'btn'; botao.type = 'button'; botao.textContent = rotulo;
                botao.disabled = delta < 0 ? paginaDias === 0 : paginaDias === paginas - 1;
                botao.addEventListener('click', () => { paginaDias += delta; atualizar(); container.focus({ preventScroll: true }); }); nav.append(botao);
            }
            const texto = document.createElement('span'); texto.textContent = `Página ${paginaDias + 1} de ${paginas}`; nav.append(texto); container.append(nav);
        }
        atualizar();
    }
    document.addEventListener('DOMContentLoaded', () => {
        for (const id of campos) el(id).addEventListener('change', renderizar);
        el('relatorio-projeto-filtros').addEventListener('submit', event => { event.preventDefault(); renderizar(); });
        el('relatorio-projeto-limpar').addEventListener('click', () => {
            for (const id of campos) el(id).value = id === campos[2] ? 'semana' : ''; renderizar();
        });
        renderizar();
    });
    for (const evento of ['estudo:registrado', 'estudo:excluido', 'dominio:reiniciado', 'storage', 'pageshow']) window.addEventListener(evento, () => {
        if (el('relatorio-projeto-tempo')) renderizar();
    });
})();
