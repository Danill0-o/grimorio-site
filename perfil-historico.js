/* Consulta do histórico bruto; filtros não alteram XP, domínio, metas ou armazenamento. */
(function () {
    'use strict';
    const TAMANHO_PAGINA = 10;
    let pagina = 0;
    const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const idsFiltros = ['historico-de', 'historico-ate', 'historico-materia', 'historico-projeto', 'historico-tipo', 'historico-agrupamento'];
    const el = id => document.getElementById(id);
    const dataLocal = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    function duracao(segundos) {
        const horas = Math.floor(segundos / 3600), minutos = Math.floor(segundos % 3600 / 60), resto = segundos % 60;
        return [horas ? `${horas.toLocaleString('pt-BR')}h` : '', minutos ? `${minutos}min` : '', resto ? `${resto}s` : ''].filter(Boolean).join(' ') || '0h';
    }
    function tipo(sessao) {
        if (EstudoStore.sessaoEstudoElegivel(sessao)) return 'estudo';
        return sessao.tipo === 'revisao' || ['cronometro-revisao', 'conclusao-revisao'].includes(sessao.origem) ? 'revisao' : 'outros';
    }
    function opcoes(select, valores, todos) {
        const selecionado = select.value, anterior = select.selectedOptions[0]?.textContent;
        if (selecionado && !valores.has(selecionado)) valores.set(selecionado, anterior || 'Sem sessões');
        const lista = [...valores].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR') || a[0].localeCompare(b[0]));
        select.replaceChildren(new Option(todos, ''), ...lista.map(([id, nome]) => new Option(nome, id)));
        select.value = selecionado;
    }
    function renderizar() {
        const corpo = el('historico-global-body'), status = el('historico-consulta-status');
        try {
            const sessoes = EstudoStore.listarSessoes();
            const projetos = new Map(ProjetosStore.listar().map(p => [p.id, p.dados.nomeExame || p.rascunho?.valores?.nome_exame || 'Projeto em preparação']));
            const materias = new Map(), projetosHistoricos = new Map();
            const registros = sessoes.map(s => {
                const id = EstudoStore.chaveGlobal(s);
                const g = MateriasStore.resolverMateriaGlobal(id); const nome = g.nomeCanonico + (g.status === 'excluida' ? ' (matéria excluída)' : '');
                const removido = JSON.parse(localStorage.getItem(`projetoV1:${s.projetoId}:registro`) || '{}');
                const projeto = projetos.get(s.projetoId) || `${removido.nome || 'Projeto'} · excluído`;
                materias.set(id, nome);
                projetosHistoricos.set(s.projetoId, projeto);
                return { sessao: s, materiaGlobalId: id, nome, projeto, tipo: tipo(s), inicio: new Date(s.inicio) };
            });
            opcoes(el('historico-materia'), materias, 'Todas as matérias');
            opcoes(el('historico-projeto'), projetosHistoricos, 'Todos os projetos');
            const de = el('historico-de').value, ate = el('historico-ate').value;
            if (de && ate && de > ate) {
                corpo.replaceChildren();
                status.textContent = 'A data inicial deve ser anterior ou igual à data final.';
                RelatoriosUI.erro(el('relatorios-global'), status.textContent);
                el('historico-anterior').disabled = el('historico-proximo').disabled = true;
                el('historico-pagina').textContent = '—';
                return;
            }
            const materia = el('historico-materia').value, projeto = el('historico-projeto').value, filtroTipo = el('historico-tipo').value;
            const filtrados = registros.filter(r => (!materia || r.materiaGlobalId === materia) && (!projeto || r.sessao.projetoId === projeto)
                && (!filtroTipo || r.tipo === filtroTipo) && (!de || dataLocal(r.inicio) >= de) && (!ate || dataLocal(r.inicio) <= ate))
                .sort((a, b) => b.inicio - a.inicio || a.sessao.id.localeCompare(b.sessao.id));
            RelatoriosUI.mostrar(el('relatorios-global'), RelatoriosEstudo.resumir(filtrados, { de, ate, grupo: el('historico-agrupamento').value }),
                JSON.stringify(idsFiltros.map(id => el(id).value)));
            const paginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA));
            pagina = Math.max(0, Math.min(pagina, paginas - 1));
            const linhas = filtrados.slice(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA).map(r => {
                const linha = document.createElement('tr');
                linha.dataset.sessaoId = r.sessao.id;
                const dataEstudo = r.sessao.precisaoInicio === 'dia'
                    ? `${r.inicio.toLocaleDateString('pt-BR')} · Horário não informado` : dataHora.format(r.inicio);
                for (const texto of [dataEstudo, r.nome, r.projeto, { estudo: 'Estudo', revisao: 'Revisão', outros: 'Outro registro' }[r.tipo], duracao(r.sessao.duracaoSegundos)]) {
                    const celula = document.createElement('td'); celula.textContent = texto; linha.appendChild(celula);
                }
                const tempo = document.createElement('time');
                tempo.dateTime = r.sessao.precisaoInicio === 'dia' ? r.sessao.dataEstudo : r.inicio.toISOString(); tempo.textContent = linha.firstChild.textContent;
                if (r.sessao.registradoEm) tempo.title = `Registrado em ${dataHora.format(new Date(r.sessao.registradoEm))}`;
                linha.firstChild.replaceChildren(tempo);
                if (r.sessao.materia !== r.nome) {
                    const rotulo = document.createElement('small'); rotulo.textContent = `Registrada como: ${r.sessao.materia}`;
                    linha.children[1].appendChild(rotulo);
                }
                return linha;
            });
            corpo.replaceChildren(...linhas);
            const total = filtrados.reduce((s, r) => s + r.sessao.duracaoSegundos, 0);
            status.textContent = filtrados.length ? `${filtrados.length.toLocaleString('pt-BR')} sessões · ${duracao(total)} neste resultado.`
                : sessoes.length ? 'Nenhuma sessão corresponde aos filtros.' : 'Ainda não há sessões registradas.';
            el('historico-pagina').textContent = `Página ${pagina + 1} de ${paginas}`;
            el('historico-anterior').disabled = pagina === 0;
            el('historico-proximo').disabled = pagina === paginas - 1;
        } catch (_) {
            corpo.replaceChildren();
            status.textContent = 'Não foi possível consultar as sessões. Os dados foram preservados; recarregue para tentar novamente.';
            RelatoriosUI.erro(el('relatorios-global'), status.textContent);
            el('historico-pagina').textContent = '—';
            el('historico-anterior').disabled = el('historico-proximo').disabled = true;
        }
    }
    document.addEventListener('DOMContentLoaded', () => {
        for (const id of idsFiltros) el(id).addEventListener('change', () => { pagina = 0; renderizar(); });
        el('historico-filtros').addEventListener('submit', event => { event.preventDefault(); pagina = 0; renderizar(); });
        el('historico-limpar').addEventListener('click', () => {
            for (const id of idsFiltros) el(id).value = id === 'historico-agrupamento' ? 'semana' : '';
            pagina = 0; renderizar();
        });
        for (const [id, delta] of [['historico-anterior', -1], ['historico-proximo', 1]]) {
            el(id).addEventListener('click', () => {
                pagina += delta; renderizar();
                if (el(id).disabled) el('historico-tabela-regiao').focus({ preventScroll: true });
            });
        }
        renderizar();
    });
    for (const evento of ['estudo:registrado', 'estudo:excluido', 'dominio:reiniciado', 'storage', 'pageshow']) window.addEventListener(evento, () => {
        if (el('historico-global-body')) renderizar();
    });
})();
