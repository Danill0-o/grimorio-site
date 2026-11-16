/* Edição da política de revisões. Datas e validade são calculadas por CalendarioJornada. */
(function () {
    'use strict';
    const modalidades = { padrao: 'Padrão', simplificado: 'Simplificada', estendida: 'Estendida', personalizado: 'Personalizada' };
    const el = id => document.getElementById(id);

    function iniciar({ dados, rascunho, projetoExistente, calendarioAtual, aoAlterar }) {
        const calendario = window.CalendarioJornada;
        const politicaAntiga = projetoExistente ? calendario.politicaProjeto(dados) : null;
        const legado = politicaAntiga !== null && dados.revisoesPolitica === undefined;
        let politica = rascunho?.revisoesPolitica ?? politicaAntiga;
        let alterada = rascunho?.revisoesAlteradas === true;
        let exibida, catalogo, chaveCalendario, dadosCalendario;
        const seletorModalidade = el('revisoes-modalidade');
        const seletorPeriodo = el('revisoes-periodo');
        const abrirCatalogo = el('revisoes-adicionar');
        const catalogoVisivel = el('revisoes-catalogo');
        const botaoSim = el('revisoes-sim');
        const botaoNao = el('revisoes-nao');

        function legadoConservado() {
            return legado && !alterada;
        }

        function politicaInicial() {
            if (!catalogo.origem || catalogo.modalidades.padrao) return calendario.criarPolitica('padrao');
            if (catalogo.modalidades.simplificado) return calendario.criarPolitica('simplificado');
            const primeiraDisponivel = catalogo.opcoes.find(opcao => opcao.data);
            if (primeiraDisponivel) return calendario.criarPolitica('personalizado', [primeiraDisponivel.periodo]);
            return { ...calendario.criarPolitica('padrao'), ativadas: false };
        }

        function problema() {
            if (calendario.validarPoliticaRevisoes(dadosCalendario, exibida) || legadoConservado()) return '';
            if (!exibida.periodos.length) return 'Escolha pelo menos um período para revisar.';
            const chaves = new Set(catalogo.opcoes.map(({ periodo }) => calendario.chavePeriodo(periodo)));
            if (calendario.politicaRevisoesValida(exibida)
                && exibida.periodos.every(periodo => chaves.has(calendario.chavePeriodo(periodo)))) return '';
            if (!catalogo.origem) return 'Selecione um dia de estudo dentro do prazo do projeto.';
            return 'Revise os períodos escolhidos. O calendário atual não comporta essa seleção.';
        }

        function avisoAtual() {
            if (!catalogo.origem) return '';
            if (exibida.ativadas && problema()) return problema();
            if (!catalogo.modalidades.personalizado) return 'O período deste projeto não comporta revisões.';
            if (exibida.ativadas && calendario.projetarPeriodosRevisao(catalogo.origem, dadosCalendario, exibida).length < exibida.periodos.length) {
                return 'O cronograma só inclui revisões que couberem no prazo do projeto.';
            }
            if (politica || catalogo.modalidades.padrao) return '';
            return exibida.modalidade === 'simplificado'
                ? 'O prazo comporta as duas revisões da modalidade Simplificada.'
                : 'O prazo comporta uma configuração personalizada. Confira ou ajuste o período sugerido.';
        }

        function rotulo(periodo) {
            if (periodo.tipo === 'proximoEstudo') return catalogo.diaria ? 'No dia seguinte' : 'No próximo dia de estudo';
            const ancora = periodo.tipo === 'semanasAposProximo' ? 'o próximo dia de estudo' : 'o estudo inicial';
            return `${periodo.semanas * 7} dias após ${ancora}`;
        }

        function mostrarPeriodos() {
            const selecionados = exibida.periodos.map(periodo => {
                const unica = calendario.criarPolitica('personalizado', [periodo]);
                const data = calendario.projetarPeriodosRevisao(catalogo.origem, dadosCalendario, unica)[0]?.data;
                return { periodo, data };
            }).sort((a, b) => (a.data ?? '9999-99-99').localeCompare(b.data ?? '9999-99-99'));
            el('revisoes-selecionadas').replaceChildren(...selecionados.map(({ periodo, data }) => {
                const li = document.createElement('li');
                const nome = document.createElement('span');
                nome.textContent = rotulo(periodo) + (data ? '' : ' (fora do prazo)');
                const remover = document.createElement('button');
                remover.type = 'button';
                remover.textContent = 'Remover';
                remover.setAttribute('aria-label', `Remover ${nome.textContent}`);
                remover.addEventListener('click', () => {
                    const restante = exibida.periodos.filter(p => calendario.chavePeriodo(p) !== calendario.chavePeriodo(periodo));
                    mudar(calendario.criarPolitica('personalizado', restante));
                    if (!abrirCatalogo.hidden) abrirCatalogo.focus();
                    else (el('revisoes-selecionadas').querySelector('button') || seletorModalidade).focus();
                });
                li.append(nome, remover);
                return li;
            }));
        }

        function fecharCatalogo() {
            abrirCatalogo.setAttribute('aria-expanded', 'false');
            catalogoVisivel.hidden = true;
        }

        function mostrarPrevia() {
            const previa = exibida.ativadas ? [...exibida.periodos] : [];
            const proximo = catalogo.opcoes[0]?.data ?? calendario.somarDias(catalogo.origem, 7);
            const alvo = periodo => calendario.alvoPeriodoRevisao(periodo, catalogo.origem, proximo);
            previa.sort((a, b) => (alvo(a) ?? '').localeCompare(alvo(b) ?? ''));
            el('revisoes-exemplo').hidden = !previa.length;
            const primeiraNoProximoEstudo = previa[0]?.tipo === 'proximoEstudo';
            const linhas = previa.map((periodo, i) => {
                let intervalo = rotulo(periodo).toLowerCase();
                if (periodo.tipo === 'semanasAposOrigem') intervalo = `daqui a ${periodo.semanas * 7} dias`;
                if (periodo.tipo === 'semanasAposProximo' && primeiraNoProximoEstudo) intervalo = `${periodo.semanas * 7} dias após a primeira revisão`;
                return `${i + 1}ª revisão ${intervalo}.`;
            });
            el('revisoes-previa').replaceChildren(...linhas.map(texto => {
                const li = document.createElement('li');
                li.textContent = texto;
                return li;
            }));
        }

        function atualizar() {
            dadosCalendario = calendarioAtual();
            const chave = JSON.stringify(dadosCalendario);
            if (chaveCalendario !== chave) {
                catalogo = calendario.catalogoRevisoes(dadosCalendario);
                chaveCalendario = chave;
            }
            exibida = politica ?? politicaInicial();
            botaoSim.checked = exibida.ativadas;
            botaoNao.checked = !exibida.ativadas;
            const cargaRevisoes = el('contar-revisoes-na-carga');
            cargaRevisoes.labels[0].hidden = !exibida.ativadas;
            cargaRevisoes.disabled = !exibida.ativadas;
            const temOpcoes = exibida.ativadas && Boolean(catalogo.origem);
            el('revisoes-opcoes').hidden = !temOpcoes;
            const personalizada = exibida.modalidade === 'personalizado';
            el('revisoes-personalizar').hidden = !personalizada;
            const aviso = el('revisoes-aviso');
            const mensagem = avisoAtual();
            if (aviso.textContent !== mensagem) aviso.textContent = mensagem;
            aviso.hidden = !mensagem;
            seletorModalidade.replaceChildren(...Object.entries(modalidades).flatMap(([id, nome]) => {
                const viavel = Boolean(catalogo.origem);
                if (!viavel && id !== exibida.modalidade) return [];
                const opcao = new Option(viavel ? nome : `${nome} (atual)`, id);
                opcao.disabled = !viavel;
                return [opcao];
            }));
            seletorModalidade.value = exibida.modalidade;
            fecharCatalogo();
            if (temOpcoes && personalizada) {
                mostrarPeriodos();
                abrirCatalogo.hidden = !calendario.catalogoRevisoes(dadosCalendario, exibida.periodos).opcoes.length;
            }
            mostrarPrevia();
        }

        function mudar(escolha) {
            politica = escolha;
            alterada = true;
            atualizar();
            aoAlterar();
        }

        botaoSim.addEventListener('change', () => mudar({ ...exibida, ativadas: true }));
        botaoNao.addEventListener('change', () => mudar({ ...exibida, ativadas: false }));
        seletorModalidade.addEventListener('change', () => {
            const modalidade = seletorModalidade.value;
            if (!catalogo.origem) return;
            mudar(calendario.criarPolitica(modalidade, exibida.periodos));
        });
        abrirCatalogo.addEventListener('click', () => {
            if (!catalogoVisivel.hidden) return fecharCatalogo();
            const { opcoes } = calendario.catalogoRevisoes(dadosCalendario, exibida.periodos);
            seletorPeriodo.replaceChildren(...opcoes.map(({ periodo }) =>
                new Option(rotulo(periodo), calendario.chavePeriodo(periodo))));
            abrirCatalogo.setAttribute('aria-expanded', 'true');
            catalogoVisivel.hidden = false;
            seletorPeriodo.focus();
        });
        el('revisoes-confirmar-periodo').addEventListener('click', () => {
            const { opcoes } = calendario.catalogoRevisoes(dadosCalendario, exibida.periodos);
            const opcao = opcoes.find(({ periodo }) => calendario.chavePeriodo(periodo) === seletorPeriodo.value);
            if (!opcao) return;
            mudar(calendario.criarPolitica('personalizado', [...exibida.periodos, opcao.periodo]));
            if (!abrirCatalogo.hidden) abrirCatalogo.focus();
            else el('revisoes-selecionadas').querySelector('button')?.focus();
        });
        catalogoVisivel.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            fecharCatalogo();
            abrirCatalogo.focus();
        });
        atualizar();
        return {
            atualizar,
            problema,
            campoInvalido: () => {
                if (!catalogo.opcoes.length) return botaoNao;
                return !exibida.periodos.length ? abrirCatalogo : seletorModalidade;
            },
            fixar() { politica ??= exibida; },
            rascunho: () => ({ ...(politica ? { revisoesPolitica: politica } : {}), ...(alterada ? { revisoesAlteradas: true } : {}) }),
            politicaConfirmada: () => legadoConservado() ? undefined : exibida,
            resumo() {
                if (!exibida.ativadas) return 'Desativadas';
                const quantidade = exibida.periodos.length;
                if (legadoConservado() && !catalogo.modalidades.padrao) return 'Padrão do projeto · Datas limitadas pelo prazo';
                const periodo = exibida.modalidade === 'personalizado' ? 'período selecionado' : 'revisão selecionada';
                const plural = exibida.modalidade === 'personalizado' ? 'períodos selecionados' : 'revisões selecionadas';
                return `${modalidades[exibida.modalidade]} · ${quantidade} ${quantidade === 1 ? periodo : plural}`;
            }
        };
    }

    window.WizardRevisoes = { iniciar };
})();
