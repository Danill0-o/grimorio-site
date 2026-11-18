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
        const checkProximo = el('revisoes-intervalo-proximo');
        const check7d = el('revisoes-intervalo-7d');
        const check28d = el('revisoes-intervalo-28d');
        const check84d = el('revisoes-intervalo-84d');
        const rotuloProximo = el('revisoes-rotulo-proximo');
        const rotulo7d = el('revisoes-rotulo-7d');
        const botaoSim = el('revisoes-sim');
        const botaoNao = el('revisoes-nao');
        const chavesCatalogoPadrao = new Set(['R1', 'R2', 'semanasAposOrigem:1', 'R3', 'semanasAposOrigem:12']);

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
            const chaves = new Set(calendario.catalogoRevisoes(dadosCalendario,
                exibida.periodos.filter(p => p.tipo === 'proximoEstudo')).opcoes
                .concat(catalogo.opcoes)
                .map(({ periodo }) => calendario.chavePeriodo(periodo)));
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
            const temProximo = exibida.periodos.some(p => p.tipo === 'proximoEstudo');
            const tem7dAposProximo = exibida.periodos.some(p => p.tipo === 'semanasAposProximo' && p.semanas === 1);
            const tem7dAposOrigem = exibida.periodos.some(p => p.tipo === 'semanasAposOrigem' && p.semanas === 1);
            const tem28d = exibida.periodos.some(p => p.tipo === 'semanasAposOrigem' && p.semanas === 4);
            const tem84d = exibida.periodos.some(p => p.tipo === 'semanasAposOrigem' && p.semanas === 12);
            const foraCatalogo = exibida.periodos.filter(p => !chavesCatalogoPadrao.has(calendario.chavePeriodo(p)));

            rotuloProximo.textContent = catalogo.diaria ? 'No dia seguinte' : 'No próximo dia de estudo';
            rotulo7d.textContent = temProximo
                ? '7 dias após a primeira revisão'
                : (tem7dAposProximo ? '7 dias após o próximo dia de estudo' : '7 dias após o estudo de origem');
            checkProximo.checked = temProximo;
            check7d.checked = tem7dAposProximo || tem7dAposOrigem;
            check28d.checked = tem28d;
            check84d.checked = tem84d;
            [checkProximo, check7d, check28d, check84d].forEach(c => { c.disabled = foraCatalogo.length > 0; });

            const selecionadosLegados = foraCatalogo.map(periodo => {
                const unica = calendario.criarPolitica('personalizado', [periodo]);
                const data = calendario.projetarPeriodosRevisao(catalogo.origem, dadosCalendario, unica)[0]?.data;
                return { periodo, data };
            }).sort((a, b) => (a.data ?? '9999-99-99').localeCompare(b.data ?? '9999-99-99'));
            el('revisoes-selecionadas').replaceChildren(...selecionadosLegados.map(({ periodo, data }) => {
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
                    (el('revisoes-selecionadas').querySelector('button') || checkProximo).focus();
                });
                li.append(nome, remover);
                return li;
            }));
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
                if (periodo.tipo === 'semanasAposOrigem') {
                    intervalo = periodo.semanas === 1
                        ? '7 dias após o estudo de origem'
                        : `daqui a ${periodo.semanas * 7} dias`;
                }
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
            const temOpcoes = exibida.ativadas && Boolean(catalogo.origem);
            el('revisoes-opcoes').hidden = !temOpcoes;
            const cargaRevisoes = el('contar-revisoes-na-carga');
            const cargaBloco = el('wizard-revisoes-carga') || cargaRevisoes.labels[0];
            cargaBloco.hidden = !temOpcoes;
            cargaRevisoes.disabled = !temOpcoes;
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
            if (temOpcoes && personalizada) mostrarPeriodos();
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
        el('contar-revisoes-na-carga').addEventListener('change', () => aoAlterar());
        seletorModalidade.addEventListener('change', () => {
            const modalidade = seletorModalidade.value;
            if (!catalogo.origem) return;
            mudar(calendario.criarPolitica(modalidade, exibida.periodos));
        });
        function aplicarIntervalosPersonalizados() {
            const foraCatalogo = exibida.periodos.filter(p => !chavesCatalogoPadrao.has(calendario.chavePeriodo(p)));
            if (foraCatalogo.length) return;
            const proximo = checkProximo.checked;
            const novos = [];
            if (proximo) novos.push({ tipo: 'proximoEstudo' });
            if (check7d.checked) novos.push(proximo ? { tipo: 'semanasAposProximo', semanas: 1 } : { tipo: 'semanasAposOrigem', semanas: 1 });
            if (check28d.checked) novos.push({ tipo: 'semanasAposOrigem', semanas: 4 });
            if (check84d.checked) novos.push({ tipo: 'semanasAposOrigem', semanas: 12 });
            mudar(calendario.criarPolitica('personalizado', novos));
        }
        [checkProximo, check7d, check28d, check84d].forEach(check => check.addEventListener('change', aplicarIntervalosPersonalizados));
        atualizar();
        return {
            atualizar,
            problema,
            campoInvalido: () => {
                if (!catalogo.opcoes.length) return botaoNao;
                return !exibida.periodos.length ? (checkProximo || seletorModalidade) : seletorModalidade;
            },
            fixar() { politica ??= exibida; },
            rascunho: () => ({ ...(politica ? { revisoesPolitica: politica } : {}), ...(alterada ? { revisoesAlteradas: true } : {}) }),
            politicaConfirmada: () => legadoConservado() ? undefined : exibida,
            resumo() {
                if (!exibida.ativadas) return 'Desativadas';
                const cargaTexto = el('contar-revisoes-na-carga')?.checked ? 'na carga diária' : 'fora da carga diária';
                const quantidade = exibida.periodos.length;
                if (legadoConservado() && !catalogo.modalidades.padrao) return `Padrão do projeto · Datas limitadas pelo prazo · ${cargaTexto}`;
                const periodo = exibida.modalidade === 'personalizado' ? 'período selecionado' : 'revisão selecionada';
                const plural = exibida.modalidade === 'personalizado' ? 'períodos selecionados' : 'revisões selecionadas';
                return `${modalidades[exibida.modalidade]} · ${quantidade} ${quantidade === 1 ? periodo : plural} · ${cargaTexto}`;
            }
        };
    }

    window.WizardRevisoes = { iniciar };
})();
