/* Página dedicada de Histórico de estudos: resumo global, filtros, gráficos, paginação e exclusão segura de sessões. */
(function () {
    'use strict';
    const TAMANHO_PAGINA = 10;
    let pagina = 0;
    let sessaoEmExclusao = null;

    const numero = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const dataHoraMedia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
    const camposResumo = ['historico-estudo', 'historico-revisao', 'historico-sessoes', 'historico-outros', 'historico-primeira', 'historico-recente'];
    const idsFiltros = ['historico-busca', 'historico-de', 'historico-ate', 'historico-materia', 'historico-projeto', 'historico-tipo', 'historico-agrupamento'];
    const el = id => document.getElementById(id);
    const dataLocal = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    const normalizar = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

    function duracao(segundos) {
        const total = Math.floor(Number(segundos) || 0);
        const horas = Math.floor(total / 3600), minutos = Math.floor(total % 3600 / 60), resto = total % 60;
        return [horas ? `${numero(horas)}h` : '', minutos ? `${minutos}min` : '', resto ? `${resto}s` : ''].filter(Boolean).join(' ') || '0h';
    }

    function tipo(sessao) {
        if (EstudoStore.sessaoEstudoElegivel(sessao)) return 'estudo';
        return sessao.tipo === 'revisao' || ['cronometro-revisao', 'conclusao-revisao'].includes(sessao.origem) ? 'revisao' : 'outros';
    }

    function rotuloTipo(registro) {
        if (registro.sessao.blocoExtraId) return registro.tipo === 'revisao' ? 'Revisão de extra' : 'Estudo extra';
        return { estudo: 'Estudo', revisao: 'Revisão', outros: 'Outro registro' }[registro.tipo];
    }

    function opcoes(select, valores, todos) {
        const selecionado = select.value, anterior = select.selectedOptions[0]?.textContent;
        if (selecionado && !valores.has(selecionado)) valores.set(selecionado, anterior || 'Sem sessões');
        const lista = [...valores].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR') || a[0].localeCompare(b[0]));
        select.replaceChildren(new Option(todos, ''), ...lista.map(([id, nome]) => new Option(nome, id)));
        select.value = selecionado;
    }

    function renderizarResumo(sessoes) {
        let estudo = 0, revisao = 0, outros = 0;
        let primeira = null, recente = null;
        for (const sessao of sessoes) {
            const segundos = Number(sessao.duracaoSegundos);
            if (EstudoStore.sessaoEstudoElegivel(sessao)) estudo += segundos;
            else if (sessao.tipo === 'revisao' || ['cronometro-revisao', 'conclusao-revisao'].includes(sessao.origem)) revisao += segundos;
            else outros += segundos;
            const inicio = new Date(sessao.inicio);
            if (primeira === null || inicio < primeira) primeira = inicio;
            if (recente === null || inicio > recente) recente = inicio;
        }
        el('historico-estudo').textContent = tempoResumo(estudo);
        el('historico-revisao').textContent = tempoResumo(revisao);
        el('historico-outros').textContent = tempoResumo(outros);
        el('historico-outros-item').hidden = outros === 0;
        el('historico-sessoes').textContent = numero(sessoes.length);
        for (const [id, data] of [['historico-primeira', primeira], ['historico-recente', recente]]) {
            const node = el(id);
            node.textContent = data ? dataHoraMedia.format(data) : 'Ainda sem sessões';
            if (data) node.dateTime = data.toISOString();
            else node.removeAttribute('datetime');
        }
        el('historico-global-status').textContent = sessoes.length ? '' : 'Registre sua primeira sessão em um projeto para começar sua trajetória.';
    }

    function tempoResumo(segundos) {
        return duracao(segundos);
    }

    function abrirExclusao(registro, botaoOrigem) {
        const dialogo = el('excluir-sessao-dialog');
        if (!dialogo) return;
        const dataTexto = registro.sessao.precisaoInicio === 'dia'
            ? registro.inicio.toLocaleDateString('pt-BR')
            : dataHora.format(registro.inicio);
        sessaoEmExclusao = { id: registro.sessao.id, botaoOrigem };
        el('excluir-sessao-descricao').textContent = `Registro de ${registro.nome} em ${dataTexto} (${duracao(registro.sessao.duracaoSegundos)}) no projeto ${registro.projeto}.`;
        el('excluir-sessao-erro').textContent = '';
        el('excluir-sessao-confirmar').disabled = false;
        el('excluir-sessao-cancelar').disabled = false;
        dialogo.showModal();
        el('excluir-sessao-cancelar').focus();
    }

    function renderizar() {
        const corpo = el('historico-global-body'), status = el('historico-consulta-status');
        if (!corpo || !status) return;
        try {
            const sessoes = EstudoStore.listarSessoes();
            renderizarResumo(sessoes);
            const projetos = new Map(ProjetosStore.listar().map(p => [p.id, p.dados.nomeExame || p.rascunho?.valores?.nome_exame || 'Projeto em preparação']));
            const materias = new Map(), projetosHistoricos = new Map();
            const registros = sessoes.map(s => {
                const id = EstudoStore.chaveGlobal(s);
                const g = MateriasStore.resolverMateriaGlobal(id);
                const nome = g.nomeCanonico + (g.status === 'excluida' ? ' (matéria excluída)' : '');
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

            const busca = normalizar(el('historico-busca').value.trim());
            const materia = el('historico-materia').value;
            const projeto = el('historico-projeto').value;
            const filtroTipo = el('historico-tipo').value;

            const filtrados = registros.filter(r => {
                if (busca && !normalizar(r.nome).includes(busca) && !normalizar(r.sessao.materia).includes(busca)) return false;
                if (materia && r.materiaGlobalId !== materia) return false;
                if (projeto && r.sessao.projetoId !== projeto) return false;
                if (filtroTipo) {
                    if (filtroTipo === 'extra') {
                        if (!r.sessao.blocoExtraId) return false;
                    } else if (r.tipo !== filtroTipo) {
                        return false;
                    }
                }
                if (de && dataLocal(r.inicio) < de) return false;
                if (ate && dataLocal(r.inicio) > ate) return false;
                return true;
            }).sort((a, b) => b.inicio - a.inicio || String(a.sessao.id).localeCompare(String(b.sessao.id)));

            RelatoriosUI.mostrar(
                el('relatorios-global'),
                RelatoriosEstudo.resumir(filtrados, { de, ate, grupo: el('historico-agrupamento').value }),
                JSON.stringify(idsFiltros.map(id => el(id).value))
            );

            const paginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA));
            pagina = Math.max(0, Math.min(pagina, paginas - 1));

            const linhas = filtrados.slice(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA).map(r => {
                const linha = document.createElement('tr');
                linha.dataset.sessaoId = r.sessao.id;
                const dataEstudo = r.sessao.precisaoInicio === 'dia'
                    ? `${r.inicio.toLocaleDateString('pt-BR')} · Horário não informado`
                    : dataHora.format(r.inicio);
                const tipoTexto = rotuloTipo(r);
                const duracaoTexto = duracao(r.sessao.duracaoSegundos);

                for (const texto of [dataEstudo, r.nome, r.projeto, tipoTexto, duracaoTexto]) {
                    const celula = document.createElement('td');
                    celula.textContent = texto;
                    linha.appendChild(celula);
                }

                const tempoEl = document.createElement('time');
                tempoEl.dateTime = r.sessao.precisaoInicio === 'dia' ? r.sessao.dataEstudo : r.inicio.toISOString();
                tempoEl.textContent = dataEstudo;
                if (r.sessao.registradoEm) tempoEl.title = `Registrado em ${dataHora.format(new Date(r.sessao.registradoEm))}`;
                linha.firstChild.replaceChildren(tempoEl);

                if (r.sessao.materia !== r.nome) {
                    const rotulo = document.createElement('small');
                    rotulo.textContent = `Registrada como: ${r.sessao.materia}`;
                    linha.children[1].appendChild(rotulo);
                }

                const acao = document.createElement('td');
                const botaoExcluir = document.createElement('button');
                botaoExcluir.type = 'button';
                botaoExcluir.className = 'btn btn-outline-secondary historico-excluir-sessao';
                botaoExcluir.textContent = 'Excluir';
                botaoExcluir.dataset.excluirSessao = r.sessao.id;
                botaoExcluir.setAttribute('aria-label', `Excluir registro de ${r.nome} em ${dataEstudo}`);
                botaoExcluir.addEventListener('click', () => abrirExclusao(r, botaoExcluir));
                acao.appendChild(botaoExcluir);
                linha.appendChild(acao);

                const rotulos = ['Data e hora', 'Matéria', 'Projeto', 'Tipo', 'Duração', 'Ações'];
                [...linha.children].forEach((td, i) => { td.dataset.rotulo = rotulos[i]; });
                return linha;
            });

            if (!linhas.length) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 6;
                td.className = 'historico-vazio';
                td.textContent = sessoes.length ? 'Nenhuma sessão corresponde aos filtros.' : 'Ainda não há sessões registradas.';
                tr.appendChild(td);
                corpo.replaceChildren(tr);
            } else {
                corpo.replaceChildren(...linhas);
            }

            const total = filtrados.reduce((s, r) => s + r.sessao.duracaoSegundos, 0);
            status.textContent = filtrados.length
                ? `${filtrados.length.toLocaleString('pt-BR')} sessões · ${duracao(total)} neste resultado.`
                : sessoes.length ? 'Nenhuma sessão corresponde aos filtros.' : 'Ainda não há sessões registradas.';
            el('historico-pagina').textContent = `Página ${pagina + 1} de ${paginas}`;
            el('historico-anterior').disabled = pagina === 0;
            el('historico-proximo').disabled = pagina === paginas - 1;
        } catch (erro) {
            corpo.replaceChildren();
            for (const id of camposResumo) {
                const node = el(id);
                if (node) {
                    node.textContent = '—';
                    node.removeAttribute('datetime');
                }
            }
            if (el('historico-outros-item')) el('historico-outros-item').hidden = true;
            if (el('historico-global-status')) {
                el('historico-global-status').textContent = 'Não foi possível carregar seu histórico. Os dados foram preservados; recarregue para tentar novamente.';
            }
            status.textContent = 'Não foi possível consultar as sessões. Os dados foram preservados; recarregue para tentar novamente.';
            RelatoriosUI.erro(el('relatorios-global'), status.textContent);
            el('historico-pagina').textContent = '—';
            el('historico-anterior').disabled = el('historico-proximo').disabled = true;
            console.error(erro);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        for (const id of idsFiltros) {
            const evento = id === 'historico-busca' ? 'input' : 'change';
            el(id)?.addEventListener(evento, () => { pagina = 0; renderizar(); });
        }
        el('historico-filtros')?.addEventListener('submit', event => { event.preventDefault(); pagina = 0; renderizar(); });
        el('historico-limpar')?.addEventListener('click', () => {
            for (const id of idsFiltros) el(id).value = id === 'historico-agrupamento' ? 'semana' : '';
            pagina = 0;
            renderizar();
        });
        for (const [id, delta] of [['historico-anterior', -1], ['historico-proximo', 1]]) {
            el(id)?.addEventListener('click', () => {
                pagina += delta;
                renderizar();
                if (el(id).disabled) el('historico-tabela-regiao').focus({ preventScroll: true });
            });
        }

        const dialogo = el('excluir-sessao-dialog');
        const cancelar = el('excluir-sessao-cancelar');
        const confirmar = el('excluir-sessao-confirmar');
        const erroBox = el('excluir-sessao-erro');

        cancelar?.addEventListener('click', () => dialogo.close());
        dialogo?.addEventListener('close', () => {
            const origem = sessaoEmExclusao?.botaoOrigem;
            sessaoEmExclusao = null;
            if (origem?.isConnected) {
                origem.focus();
            } else {
                const proximoBotao = el('historico-global-body')?.querySelector('.historico-excluir-sessao');
                (proximoBotao || el('historico-busca') || el('historico-consulta-status'))?.focus();
            }
        });
        confirmar?.addEventListener('click', () => {
            if (!sessaoEmExclusao) return;
            confirmar.disabled = true;
            cancelar.disabled = true;
            erroBox.textContent = '';
            try {
                EstudoStore.excluirSessao(sessaoEmExclusao.id);
                dialogo.close();
                renderizar();
            } catch (erro) {
                erroBox.textContent = `Não foi possível excluir o registro. ${erro.message || 'Tente novamente.'}`;
                confirmar.disabled = false;
                cancelar.disabled = false;
            }
        });

        renderizar();
    });

    for (const evento of ['estudo:registrado', 'estudo:excluido', 'dominio:reiniciado', 'materias:excluida', 'storage', 'pageshow']) {
        window.addEventListener(evento, () => {
            if (el('historico-global-body')) renderizar();
        });
    }
})();
