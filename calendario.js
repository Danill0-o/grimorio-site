/* Consulta do cronograma existente: nenhuma ação de estudo ou edição nesta página. */
(function () {
    'use strict';
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const diasSemanaAbrev = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    let plano, dialogo, diaAberto = null, folgaAberta = null, dataRenderizada = null, atualizacaoPendente = false;
    let mesIndiceAtual = null, chavesMeses = [], touchInicioX = null, touchInicioY = null;

    function elemento(tag, classe, texto) {
        const no = document.createElement(tag);
        if (classe) no.className = classe;
        if (texto !== undefined) no.textContent = texto;
        return no;
    }
    function dataCivil(iso) { return iso ? iso.split('-').reverse().join('/') : 'Data indisponível'; }
    function dataCivilComSemana(iso) {
        if (!iso) return 'Data indisponível';
        const d = new Date(`${iso}T12:00:00Z`);
        const sem = Number.isNaN(d.getTime()) ? '' : ` ${diasSemanaAbrev[d.getUTCDay()]}`;
        return `${iso.slice(-2)}${sem}`;
    }
    function diaLinear(numero) { return `Dia ${String(numero).padStart(2, '0')}`; }
    function duracao(segundos) {
        const horas = Math.floor(segundos / 3600), minutos = Math.floor(segundos % 3600 / 60), resto = segundos % 60;
        return [horas ? `${horas}h` : '', minutos ? `${minutos} min` : '', resto ? `${resto} s` : ''].filter(Boolean).join(' ') || '0 min';
    }
    function resumirTexto(texto, limite = 22) {
        const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
        return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo;
    }
    function botaoDia(dia) {
        const botao = elemento('button', 'calendario-dia');
        botao.type = 'button';
        botao.dataset.calendarioDia = dia.dia;
        botao.setAttribute('aria-haspopup', 'dialog');
        botao.setAttribute('aria-controls', 'calendario-popup');

        const topo = elemento('span', 'calendario-dia-topo');
        const label = elemento('strong', 'calendario-dia-numero', diaLinear(dia.numero));
        const data = elemento('time', 'calendario-dia-data', dataCivilComSemana(dia.dataPrevista));
        if (dia.dataPrevista) data.dateTime = dia.dataPrevista;
        topo.append(label, data);
        if (dia.dataPrevista === window.CalendarioJornada.dataLocal()) {
            botao.dataset.hoje = 'true';
            topo.append(elemento('span', 'calendario-hoje', 'Hoje'));
        }
        botao.append(topo);

        const corpo = elemento('span', 'calendario-dia-corpo');
        const nomesMaterias = [...new Set([...dia.materias, ...dia.extras, ...(dia.missoes || [])].map(m => m.nome))];
        const resumoMaterias = nomesMaterias.map(nome => resumirTexto(nome, 24)).join(' · ') || 'Sem matéria prevista';
        const spanMaterias = elemento('span', 'calendario-dia-materias', resumirTexto(resumoMaterias, 44));
        spanMaterias.title = nomesMaterias.join(' · ');
        corpo.append(spanMaterias);
        botao.append(corpo);

        botao.addEventListener('click', () => abrirDia(dia.dia));
        return botao;
    }
    function atualizarVisibilidadeMeses() {
        const secoes = [...document.querySelectorAll('#calendario-dias .calendario-mes')];
        if (!secoes.length) return;
        mesIndiceAtual = Math.max(0, Math.min(mesIndiceAtual ?? 0, secoes.length - 1));
        secoes.forEach((secao, idx) => {
            const ativo = idx === mesIndiceAtual;
            secao.classList.toggle('calendario-mes-ativo', ativo);
            secao.classList.toggle('calendario-mes-oculto', !ativo);
            secao.dataset.mesAtivo = String(ativo);
        });
        const barra = document.getElementById('calendario-mes-nav');
        if (barra) {
            const tituloMes = secoes[mesIndiceAtual]?.querySelector('h2')?.textContent || '';
            const label = barra.querySelector('#calendario-mes-atual-label');
            const ant = barra.querySelector('#calendario-mes-anterior');
            const prox = barra.querySelector('#calendario-mes-proximo');
            if (label) label.textContent = `${tituloMes} (${mesIndiceAtual + 1}/${secoes.length})`;
            if (ant) ant.disabled = mesIndiceAtual <= 0;
            if (prox) prox.disabled = mesIndiceAtual >= secoes.length - 1;
            barra.hidden = secoes.length <= 1;
        }
    }
    function irParaMes(novoIndice) {
        const total = chavesMeses.length;
        if (!total) return;
        const destino = Math.max(0, Math.min(total - 1, novoIndice));
        if (destino === mesIndiceAtual) return;
        mesIndiceAtual = destino;
        atualizarVisibilidadeMeses();
    }
    function montarNavegacaoMeses() {
        const nav = elemento('nav', 'calendario-mes-nav');
        nav.id = 'calendario-mes-nav';
        nav.setAttribute('aria-label', 'Navegação entre meses');
        const btnAnt = elemento('button', 'btn btn-outline-secondary calendario-mes-seta', '◀');
        btnAnt.type = 'button';
        btnAnt.id = 'calendario-mes-anterior';
        btnAnt.setAttribute('aria-label', 'Mês anterior');
        btnAnt.addEventListener('click', () => irParaMes((mesIndiceAtual ?? 0) - 1));

        const centro = elemento('div', 'calendario-mes-nav-centro');
        const label = elemento('strong', 'calendario-mes-atual-label', '');
        label.id = 'calendario-mes-atual-label';
        const dica = elemento('small', 'calendario-mes-dica', 'Use as setas ◀ ▶ ou deslize para trocar de mês');
        centro.append(label, dica);

        const btnProx = elemento('button', 'btn btn-outline-secondary calendario-mes-seta', '▶');
        btnProx.type = 'button';
        btnProx.id = 'calendario-mes-proximo';
        btnProx.setAttribute('aria-label', 'Próximo mês');
        btnProx.addEventListener('click', () => irParaMes((mesIndiceAtual ?? 0) + 1));

        nav.append(btnAnt, centro, btnProx);
        return nav;
    }
    function montarMes(chave, dias) {
        const secao = elemento('section', 'calendario-mes');
        secao.dataset.calendarioMes = chave;
        const titulo = elemento('h2', '', chave === 'indisponivel' ? 'Datas indisponíveis'
            : `${meses[Number(chave.slice(5)) - 1]} de ${chave.slice(0, 4)}`);
        titulo.id = `calendario-mes-${chave}`;
        secao.setAttribute('aria-labelledby', titulo.id);
        secao.append(titulo);
        const grade = elemento('ol', 'calendario-grade');
        if (chave === 'indisponivel') {
            for (const dia of dias) { const li = elemento('li'); li.append(botaoDia(dia)); grade.append(li); }
        } else {
            const semana = elemento('div', 'calendario-semana');
            semana.setAttribute('aria-hidden', 'true');
            for (const nome of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) semana.append(elemento('span', '', nome));
            secao.append(semana);
            const primeiro = new Date(`${chave}-01T12:00:00Z`);
            for (let i = 0; i < primeiro.getUTCDay(); i++) {
                const li = elemento('li', 'calendario-celula-vazia'); li.setAttribute('aria-hidden', 'true'); grade.append(li);
            }
            const fim = new Date(primeiro); fim.setUTCMonth(fim.getUTCMonth() + 1, 0);
            const porData = new Map(dias.map(dia => [dia.dataPrevista, dia]));
            const folgasPraticas = new Map((plano?.folgasPraticas || []).map(f => [f.dataPrevista, f]));
            for (let numero = 1; numero <= fim.getUTCDate(); numero++) {
                const iso = `${chave}-${String(numero).padStart(2, '0')}`, dia = porData.get(iso);
                const li = elemento('li', dia ? '' : 'calendario-celula-folga');
                const rotuloFolga = `${String(numero).padStart(2, '0')} ${diasSemanaAbrev[new Date(`${iso}T12:00:00Z`).getUTCDay()]}`;
                if (dia) li.append(botaoDia(dia));
                else if (folgasPraticas.has(iso)) {
                    li.classList.add('calendario-celula-pratica');
                    // Folga teórica com TAF: consulta própria, fora dos dias lineares da jornada.
                    const nomes = [...new Set(folgasPraticas.get(iso).missoes.map(m => m.nome))];
                    const folga = elemento('button', 'calendario-folga calendario-folga-pratica', rotuloFolga);
                    folga.type = 'button';
                    folga.dataset.calendarioFolgaData = iso;
                    folga.setAttribute('aria-haspopup', 'dialog');
                    folga.setAttribute('aria-controls', 'calendario-popup');
                    folga.setAttribute('aria-label', `${dataCivil(iso)}: folga teórica com ${nomes.join(', ')}`);
                    const resumo = elemento('span', 'calendario-dia-materias', resumirTexto(nomes.join(' · '), 44));
                    resumo.title = nomes.join(' · ');
                    folga.append(resumo);
                    folga.addEventListener('click', () => abrirFolga(iso));
                    li.append(folga);
                } else {
                    const folga = elemento('div', 'calendario-folga', rotuloFolga);
                    folga.append(elemento('span', '', 'Sem estudo previsto'));
                    li.append(folga);
                }
                grade.append(li);
            }
        }
        secao.append(grade);
        return secao;
    }
    function renderizar() {
        const focoAnterior = document.activeElement?.dataset.calendarioDia;
        const grade = document.getElementById('calendario-dias'), status = document.getElementById('calendario-status');
        try {
            plano = window.CalendarioPlano.carregar();
            document.getElementById('calendario-projeto').textContent = plano.nome || 'Selecione um projeto em Meus projetos.';
            document.getElementById('calendario-resumo').textContent = plano.dias.length
                ? `${plano.dias.length} dias de estudo${plano.inicio && plano.fim ? ` · ${dataCivil(plano.inicio)} a ${dataCivil(plano.fim)}` : ''}` : '';
            status.textContent = plano.aviso || (plano.dias.length ? '' : 'Ainda não há cronograma para consultar. Salve o planejamento do projeto para criar sua jornada.');
            const grupos = new Map();
            for (const dia of plano.dias) {
                const chave = dia.dataPrevista?.slice(0, 7) || 'indisponivel';
                if (!grupos.has(chave)) grupos.set(chave, []);
                grupos.get(chave).push(dia);
            }
            for (const folga of plano.folgasPraticas || []) {
                const chave = folga.dataPrevista.slice(0, 7);
                if (!grupos.has(chave)) grupos.set(chave, []);
            }
            if ((plano.folgasPraticas || []).length) {
                const ordenados = [...grupos].sort(([a], [b]) => a === 'indisponivel' ? 1 : b === 'indisponivel' ? -1 : a.localeCompare(b));
                grupos.clear();
                ordenados.forEach(([k, v]) => grupos.set(k, v));
            }
            chavesMeses = [...grupos.keys()];
            if (mesIndiceAtual === null || mesIndiceAtual >= chavesMeses.length) {
                const mesHoje = window.CalendarioJornada.dataLocal().slice(0, 7);
                const idxHoje = chavesMeses.indexOf(mesHoje);
                mesIndiceAtual = idxHoje >= 0 ? idxHoje : 0;
            }
            const filhos = [];
            if (chavesMeses.length) filhos.push(montarNavegacaoMeses());
            filhos.push(...[...grupos].map(([chave, dias]) => montarMes(chave, dias)));
            grade.replaceChildren(...filhos);
            atualizarVisibilidadeMeses();

            const anteriores = plano.extrasForaPlano || [];
            document.getElementById('calendario-extras-anteriores').hidden = !anteriores.length;
            document.getElementById('calendario-extras-anteriores-lista').replaceChildren(...anteriores.map(extra => {
                const li = elemento('li', 'calendario-popup-item calendario-popup-extra livro-materia-card');
                li.dataset.blocoExtraId = extra.blocoId;
                li.append(elemento('strong', 'livro-card-nome', extra.nome), elemento('p', '', `${diaLinear(extra.numero)} · ${dataCivil(extra.dataOrigem)}`),
                    elemento('small', '', `Sem meta diária · ${extra.segundosRegistrados ? `Tempo registrado: ${duracao(extra.segundosRegistrados)}` : 'Ainda sem tempo registrado'}`));
                return li;
            }));
            dataRenderizada = window.CalendarioJornada.dataLocal();
            if (dialogo.open) {
                const dia = plano.dias.find(d => d.dia === diaAberto);
                const folga = folgaAberta && (plano.folgasPraticas || []).find(f => f.dataPrevista === folgaAberta);
                if (dia) preencherPopup(dia); else if (folga) preencherPopupFolga(folga); else dialogo.close();
            } else if (focoAnterior) encontrarBotao(focoAnterior)?.focus({ preventScroll: true });
        } catch (erro) {
            plano = null;
            grade.replaceChildren();
            document.getElementById('calendario-extras-anteriores').hidden = true;
            document.getElementById('calendario-resumo').textContent = '';
            status.textContent = 'Não foi possível carregar o calendário. Seus dados foram preservados. Confira o projeto e tente recarregar.';
            if (dialogo.open) dialogo.close();
            console.error(erro);
        }
    }
    function encontrarBotao(dia) {
        return [...document.querySelectorAll('[data-calendario-dia]')].find(botao => botao.dataset.calendarioDia === dia);
    }
    function criarBarraIndicador(rotuloTexto, valor, maximo, classeExtra = '') {
        const linha = elemento('div', `calendario-card-indicador ${classeExtra}`.trim());
        const rotulo = elemento('small', 'calendario-card-indicador-rotulo', rotuloTexto);
        const trilha = elemento('div', 'calendario-card-barra-trilha');
        trilha.setAttribute('aria-hidden', 'true');
        const preenchimento = elemento('span', 'calendario-card-barra-preenchimento');
        const pct = maximo > 0 ? Math.min(100, Math.max(0, (Number(valor) || 0) / maximo * 100)) : 0;
        preenchimento.style.width = `${pct.toFixed(1)}%`;
        trilha.append(preenchimento);
        linha.append(rotulo, trilha);
        return linha;
    }
    function criarLinkCardJornada(numeroDia) {
        const link = elemento('a', 'calendario-popup-card-link livro-materia-card');
        link.href = `agenda.html?dia=${numeroDia}`;
        link.setAttribute('aria-label', `Abrir ${diaLinear(numeroDia)} na Jornada`);
        return link;
    }
    function secaoPopup(titulo, itens, montar, vazio) {
        const secao = elemento('section', 'calendario-popup-secao');
        secao.append(elemento('h3', '', titulo));
        if (!itens.length) secao.append(elemento('p', 'calendario-popup-vazio', vazio));
        else {
            const lista = elemento('ul', 'calendario-popup-lista');
            for (const item of itens) lista.append(montar(item));
            secao.append(lista);
        }
        return secao;
    }
    function preencherPopup(dia) {
        document.getElementById('calendario-popup-titulo').textContent = diaLinear(dia.numero);
        const data = document.getElementById('calendario-popup-data');
        const semana = dia.dataPrevista ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${dia.dataPrevista}T12:00:00Z`)) : '';
        data.textContent = `${dataCivil(dia.dataPrevista)}${semana ? ` · ${semana}` : ''}`;

        const normais = secaoPopup('Estudos planejados', dia.materias, materia => {
            const li = elemento('li', 'calendario-popup-item');
            li.dataset.projetoMateriaId = materia.projetoMateriaId;
            if (materia.blocoId) li.dataset.blocoId = materia.blocoId;
            const cardLink = criarLinkCardJornada(dia.numero);
            const topo = elemento('div', 'livro-card-topo');
            const nome = elemento('strong', 'livro-card-nome', materia.nome);
            const nivelBadge = elemento('span', 'livro-card-nivel', `Nvl. ${materia.nivel || 1}`);
            topo.append(nome, nivelBadge);
            const metaLinha = elemento('p', 'calendario-card-meta', `Meta · ${duracao(materia.metaSegundos)}`);
            const barraMeta = criarBarraIndicador(
                `${duracao(materia.realizadosSegundos || 0)} / ${duracao(materia.metaSegundos)}`,
                materia.realizadosSegundos || 0,
                materia.metaSegundos || 1,
                'calendario-card-indicador-meta'
            );
            const barraNivel = criarBarraIndicador(
                `Nvl. ${materia.nivel || 1}`,
                materia.percentualNivel || 0,
                100,
                'calendario-card-indicador-nivel'
            );
            cardLink.append(topo, metaLinha, barraMeta, barraNivel);
            if (materia.nota) {
                const nota = elemento('small', 'calendario-card-nota', `» ${resumirTexto(materia.nota, 20)}`);
                nota.title = materia.nota;
                cardLink.append(nota);
            }
            const rodape = elemento('div', 'calendario-card-rodape');
            rodape.append(
                elemento('small', '', `Bloco ${materia.numero}`),
                elemento('small', 'calendario-card-ir', `Abrir ${diaLinear(dia.numero)} na Jornada →`)
            );
            cardLink.append(rodape);
            li.append(cardLink);
            return li;
        }, 'Nenhum estudo normal previsto neste dia.');

        const revisoes = secaoPopup('Revisões previstas', dia.revisoes, revisao => {
            const li = elemento('li', 'calendario-popup-item calendario-popup-revisao');
            li.dataset.revisaoId = revisao.id;
            const estado = ({ pendente: 'Pendente', concluida: 'Concluída', dispensada: 'Dispensada' })[revisao.estado] || revisao.estado;
            const cardLink = criarLinkCardJornada(dia.numero);
            const topo = elemento('div', 'livro-card-topo');
            const esquerda = elemento('div', 'calendario-revisao-cabecalho');
            esquerda.append(elemento('span', 'calendario-popup-etapa', revisao.etapa), elemento('strong', 'livro-card-nome', revisao.nome));
            const nivelBadge = elemento('span', 'livro-card-nivel', `Nvl. ${revisao.nivel || 1}`);
            topo.append(esquerda, nivelBadge);

            const sugestao = elemento('p', 'calendario-card-meta', `Tempo sugerido · ${duracao(revisao.sugestaoSegundos)}`);
            const barraMeta = criarBarraIndicador(
                revisao.estado === 'concluida' ? 'Revisão concluída' : `Sugerido: ${duracao(revisao.sugestaoSegundos)}`,
                revisao.estado === 'concluida' ? 100 : 0,
                100,
                'calendario-card-indicador-meta'
            );
            const barraNivel = criarBarraIndicador(
                `Nvl. ${revisao.nivel || 1}`,
                revisao.percentualNivel || 0,
                100,
                'calendario-card-indicador-nivel'
            );
            cardLink.append(topo, sugestao, barraMeta, barraNivel);
            if (revisao.nota) {
                const nota = elemento('small', 'calendario-card-nota', `» ${resumirTexto(revisao.nota, 20)}`);
                nota.title = revisao.nota;
                cardLink.append(nota);
            }
            cardLink.append(
                elemento('small', '', `Origem: ${diaLinear(revisao.origem.numero)} · ${dataCivil(revisao.origem.dataPrevista)}${revisao.origem.extra ? ' · estudo extra' : ''}${revisao.origem.foraPlano ? ' · cronograma anterior' : ''}`),
                elemento('small', '', estado),
                elemento('small', 'calendario-card-ir', `Abrir ${diaLinear(dia.numero)} na Jornada →`)
            );
            li.append(cardLink);
            return li;
        }, 'Nenhuma revisão prevista neste dia.');

        const extras = secaoPopup('Estudos extras', dia.extras, extra => {
            const li = elemento('li', 'calendario-popup-item calendario-popup-extra');
            li.dataset.blocoExtraId = extra.blocoId;
            const cardLink = criarLinkCardJornada(dia.numero);
            const topo = elemento('div', 'livro-card-topo');
            topo.append(elemento('strong', 'livro-card-nome', extra.nome), elemento('span', 'livro-card-nivel', `Nvl. ${extra.nivel || 1}`));
            const barraNivel = criarBarraIndicador(`Nvl. ${extra.nivel || 1}`, extra.percentualNivel || 0, 100, 'calendario-card-indicador-nivel');
            cardLink.append(
                topo,
                elemento('p', 'calendario-card-meta', 'Sem meta diária'),
                barraNivel
            );
            if (extra.nota) {
                const nota = elemento('small', 'calendario-card-nota', `» ${resumirTexto(extra.nota, 20)}`);
                nota.title = extra.nota;
                cardLink.append(nota);
            }
            cardLink.append(
                elemento('small', '', `Adicionado em ${dataCivil(extra.dataOrigem)}`),
                elemento('small', '', extra.segundosRegistrados ? `Tempo registrado · ${duracao(extra.segundosRegistrados)}` : 'Ainda sem tempo registrado'),
                elemento('small', 'calendario-card-ir', `Abrir ${diaLinear(dia.numero)} na Jornada →`)
            );
            li.append(cardLink);
            return li;
        }, 'Nenhum estudo extra adicionado neste dia.');
        const secoes = [normais, revisoes, extras];
        if ((dia.missoes || []).length) secoes.splice(1, 0, secaoMissoes(dia.missoes, dia.numero));
        document.getElementById('calendario-popup-conteudo').replaceChildren(...secoes);
    }
    const tiposPratica = { redacao: 'Redação', discursiva: 'Discursiva', 'estudo-caso': 'Estudo de caso', peca: 'Peça',
        sentenca: 'Sentença', parecer: 'Parecer', simulado: 'Simulado', taf: 'TAF', outra: 'Outra prática' };
    // Consulta: estado Concluída/Pendente, sem atraso punitivo e sem controles de execução.
    function secaoMissoes(missoes, numeroDia = null) {
        return secaoPopup('Atividades práticas', missoes, missao => {
            const li = elemento('li', 'calendario-popup-item calendario-popup-missao');
            li.dataset.missaoId = missao.missaoId;
            li.dataset.atividadeId = missao.atividadeId;
            const card = numeroDia ? criarLinkCardJornada(numeroDia) : elemento('a', 'calendario-popup-card-link livro-materia-card');
            card.href = `agenda.html?${numeroDia ? `dia=${numeroDia}&` : ''}missao=${encodeURIComponent(missao.missaoId)}`;
            const topo = elemento('div', 'livro-card-topo');
            topo.append(elemento('strong', 'livro-card-nome', missao.nome),
                elemento('span', 'livro-card-nivel', tiposPratica[missao.tipo] || missao.tipo));
            const meta = missao.consomeCargaEstudo
                ? `Duração planejada · ${duracao(missao.duracaoPlanejadaSegundos || 0)}`
                : `Externo à carga de estudo${missao.duracaoPlanejadaSegundos ? ` · estimativa ${duracao(missao.duracaoPlanejadaSegundos)}` : ''}`;
            card.append(topo, elemento('p', 'calendario-card-meta', meta),
                elemento('small', '', missao.tempoRegistradoSegundos ? `Tempo registrado · ${duracao(missao.tempoRegistradoSegundos)}` : 'Ainda sem tempo registrado'),
                elemento('small', '', `Atividade: ${missao.concluidasAtividade} de ${missao.planejadasAtividade} atividades práticas concluídas`),
                elemento('small', 'calendario-missao-estado', missao.concluida ? 'Concluída' : 'Pendente'));
            card.append(elemento('small', 'calendario-card-ir', 'Abrir atividade prática na Jornada →'));
            li.append(card);
            return li;
        }, 'Nenhuma atividade prática prática prevista neste dia.');
    }
    function abrirFolga(iso) {
        const folga = (plano?.folgasPraticas || []).find(f => f.dataPrevista === iso);
        if (!folga) return;
        diaAberto = null; folgaAberta = iso;
        preencherPopupFolga(folga);
        dialogo.showModal();
        dialogo.scrollTop = 0;
        document.getElementById('calendario-popup-fechar').focus({ preventScroll: true });
    }
    function preencherPopupFolga(folga) {
        document.getElementById('calendario-popup-titulo').textContent = 'Folga teórica';
        const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${folga.dataPrevista}T12:00:00Z`));
        document.getElementById('calendario-popup-data').textContent = `${dataCivil(folga.dataPrevista)} · ${semana}`;
        const aviso = elemento('p', 'calendario-popup-vazio', 'Sem estudo teórico previsto. A atividade abaixo não consome a carga de estudo.');
        document.getElementById('calendario-popup-conteudo').replaceChildren(aviso, secaoMissoes(folga.missoes));
    }
    function abrirDia(chave) {
        const dia = plano?.dias.find(d => d.dia === chave);
        if (!dia) return;
        const mesChave = dia.dataPrevista?.slice(0, 7) || 'indisponivel';
        const idxMes = chavesMeses.indexOf(mesChave);
        if (idxMes >= 0 && idxMes !== mesIndiceAtual) {
            mesIndiceAtual = idxMes;
            atualizarVisibilidadeMeses();
        }
        diaAberto = chave; folgaAberta = null;
        preencherPopup(dia);
        dialogo.showModal();
        dialogo.scrollTop = 0;
        document.getElementById('calendario-popup-fechar').focus({ preventScroll: true });
    }
    function solicitarAtualizacao() {
        if (atualizacaoPendente) return;
        atualizacaoPendente = true;
        window.requestAnimationFrame(() => { atualizacaoPendente = false; renderizar(); });
    }
    document.addEventListener('DOMContentLoaded', () => {
        dialogo = document.getElementById('calendario-popup');
        const grade = document.getElementById('calendario-dias');
        grade.addEventListener('touchstart', e => {
            if (e.touches.length !== 1) return;
            touchInicioX = e.touches[0].clientX;
            touchInicioY = e.touches[0].clientY;
        }, { passive: true });
        grade.addEventListener('touchend', e => {
            if (touchInicioX === null || !e.changedTouches.length) return;
            const dx = e.changedTouches[0].clientX - touchInicioX;
            const dy = e.changedTouches[0].clientY - touchInicioY;
            touchInicioX = null;
            touchInicioY = null;
            if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                irParaMes((mesIndiceAtual ?? 0) + (dx < 0 ? 1 : -1));
            }
        }, { passive: true });
        document.getElementById('calendario-popup-fechar').addEventListener('click', () => dialogo.close());
        dialogo.addEventListener('close', () => {
            const botao = encontrarBotao(diaAberto)
                || (folgaAberta && document.querySelector(`[data-calendario-folga-data="${folgaAberta}"]`));
            diaAberto = null; folgaAberta = null;
            (botao || document.querySelector('main')).focus({ preventScroll: true });
        });
        renderizar();
        for (const evento of ['estudo:registrado', 'estudo:excluido', 'extras:alterados', 'revisoes:alteradas', 'notas:alteradas', 'praticas:alteradas']) window.addEventListener(evento, solicitarAtualizacao);
        window.addEventListener('storage', evento => {
            const projetoAtual = plano?.projetoId || window.ProjetosStore.idAtual();
            if (window.HistoricoRepository.ehChave(evento.key) || evento.key === 'materiasDominioV1' || evento.key === 'notasBlocosV1'
                || evento.key === `praticasProjetoV1:${projetoAtual}`
                || evento.key?.startsWith(`projetoV1:${projetoAtual}:`)) solicitarAtualizacao();
        });
        window.addEventListener('focus', solicitarAtualizacao);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) solicitarAtualizacao(); });
        window.setInterval(() => { if (dataRenderizada !== window.CalendarioJornada.dataLocal()) solicitarAtualizacao(); }, 30000);
    });
})();
