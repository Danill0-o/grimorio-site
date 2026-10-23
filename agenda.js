(function () {
    const CHAVE_SESSOES = 'sessoesEstudo';
    let indiceSelecionado = null;
    let indiceAtual = 0;
    let indiceProximo = null;
    let avisoCalendario = '';
    let dataRenderizada = '';
    let projetoSelecionado = null;
    let restaurandoFoco = false;
    let todasMetasConcluidas = false;

    document.addEventListener('DOMContentLoaded', iniciarJornada);
    window.addEventListener('estudo:registrado', iniciarJornada);
    window.addEventListener('estudo:excluido', iniciarJornada);
    window.addEventListener('dominio:reiniciado', iniciarJornada);
    window.addEventListener('notas:alteradas', iniciarJornada);
    window.addEventListener('extras:alterados', iniciarJornada);
    window.addEventListener('revisoes:alteradas', iniciarJornada);
    window.addEventListener('storage', (event) => {
        if (window.HistoricoRepository?.ehChave(event.key) || ['reiniciosDominio', 'sessoesEstudo', 'notasBlocosV1', 'materiasDominioV1'].includes(event.key) || event.key?.endsWith(':revisoesEstadoV1') || event.key?.includes(':estudoExtraV1:')) iniciarJornada();
    });
    window.addEventListener('cronometro:estado', atualizarAtalhosCronometro);
    document.addEventListener('DOMContentLoaded', iniciarControlesCartas);

    function iniciarJornada() {
        const dadosExame = lerObjeto('dadosExame');
        const materiasPlano = lerArray('objetosNormalizados');
        if (!dadosExame || !materiasPlano.length) return mostrarJornadaVazia();

        // Preserve os tópicos legados antes de regenerar a projeção do plano.
        window.NotasBlocos.preservarLegadas(lerObjeto('materiaDoDia'));
        if (typeof sortMaterias === 'function') sortMaterias();
        const materiaDoDia = lerObjeto('materiaDoDia');
        const revisoesDoDia = lerObjeto('revisoesDoDia') || {};
        if (!materiaDoDia || !Object.keys(materiaDoDia).length) return mostrarJornadaVazia();

        const projetoId = obterProjetoId(dadosExame);
        let extras;
        try { extras = window.EstudoExtra.listar(projetoId); }
        catch (erro) {
            document.getElementById('cronometro-status').textContent = 'Não foi possível carregar os estudos extras. Seus dados foram preservados.';
            console.error(erro); return;
        }
        if (projetoSelecionado !== projetoId) { indiceSelecionado = null; projetoSelecionado = projetoId; }
        const paramsUrl = new URLSearchParams(window.location?.search || '');
        const parametroDia = paramsUrl.get('dia');
        if (parametroDia !== null) {
            const numeroDia = Number(String(parametroDia).replace(/\D/g, ''));
            if (Number.isInteger(numeroDia) && numeroDia >= 1 && numeroDia <= Object.keys(materiaDoDia).length) {
                indiceSelecionado = numeroDia - 1;
            }
            if (window.history?.replaceState) {
                paramsUrl.delete('dia');
                const buscaLimpa = paramsUrl.toString();
                window.history.replaceState(null, '', `${window.location.pathname}${buscaLimpa ? `?${buscaLimpa}` : ''}${window.location.hash || ''}`);
            }
        }
        const sessoes = window.EstudoStore ? window.EstudoStore.listarSessoes() : lerArray(CHAVE_SESSOES);
        const sessoesProjeto = sessoes.filter((sessao) => pertenceAoProjeto(sessao, projetoId));
        const segundosProjeto = sessoesProjeto.reduce((total, sessao) => total + Number(sessao.duracaoSegundos), 0);
        const anotacoesSessoes = new Map();
        const datasParaNotas = window.CalendarioJornada.mapear(dadosExame, Object.keys(materiaDoDia).length).porData;
        sessoesProjeto.filter(s => s.anotacao && window.EstudoStore.sessaoEstudoElegivel(s)).forEach(s => {
            const dia = s.diaJornada || datasParaNotas[window.CalendarioJornada.dataLocal(s.inicio)];
            const chave = JSON.stringify([s.projetoMateriaId, dia, s.blocoExtraId || '']);
            if (!anotacoesSessoes.has(chave)) anotacoesSessoes.set(chave, []);
            anotacoesSessoes.get(chave).push(s);
        });
        const segundosExtrasPorBloco = new Map();
        sessoesProjeto.filter(s => s.blocoExtraId && window.EstudoStore.sessaoEstudoElegivel(s)).forEach(s =>
            segundosExtrasPorBloco.set(s.blocoExtraId, (segundosExtrasPorBloco.get(s.blocoExtraId) || 0) + s.duracaoSegundos));
        const minutosProjeto = segundosProjeto / 60;
        const minutosHoje = somarMinutos(sessoesProjeto.filter((sessao) => mesmaData(new Date(sessao.inicio), new Date())));
        const minutosPorDia = Math.max(1, Number(dadosExame.minutosPorDia) || 1);
        const progressoPlano = window.EstudoStore.calcularProgressoPlano({
            dados: dadosExame,
            materiaDoDia,
            sessoesProjeto,
            distribuicaoMaterias: lerArray('lista_distribuicao_materias')
        });
        const estadoDias = progressoPlano.dias;
        const globaisPorParticipacao = new Map(Object.keys(progressoPlano.materias).map(id => {
            const participacao = window.MateriasStore.obterProjetoMateria(id, projetoId);
            return [id, window.MateriasStore.resolverMateriaGlobal(participacao.materiaGlobalId).materiaGlobalId];
        }));
        const dominioMaterias = window.EstudoStore.obterDominioMaterias([...globaisPorParticipacao.values()]);
        let revisoes = [];
        let mostrarRevisoes = false;
        try {
            revisoes = window.RevisoesStore.sincronizar({ dados: dadosExame, materiaDoDia, revisoesDoDia, dias: estadoDias, sessoes: sessoesProjeto });
            mostrarRevisoes = window.RevisoesStore.habilitadas();
            document.getElementById('revisoes-status').textContent = mostrarRevisoes
                ? 'Revisões opcionais e adicionais. Registrar o tempo sugerido conclui a revisão; você pode estudar além dele.'
                : 'Sugestões ocultas. Histórico, notas e estados das revisões foram preservados.';
        } catch (erro) {
            document.getElementById('revisoes-status').textContent = 'Não foi possível carregar as revisões. Seus dados foram preservados; tente recarregar.';
            console.error(erro);
        }
        document.getElementById('revisoes-habilitadas').checked = mostrarRevisoes;
        const calendario = window.CalendarioJornada.calcular(dadosExame, estadoDias.length);
        indiceAtual = calendario.indice;
        avisoCalendario = calendario.aviso;
        indiceProximo = estadoDias.find(dia => dia.desbloqueado && !dia.concluido)?.indice ?? null;
        todasMetasConcluidas = estadoDias.every(dia => dia.concluido);
        dataRenderizada = new Date().toDateString();

        renderizarCabecalho(dadosExame, estadoDias, minutosProjeto, minutosHoje);
        // A faixa mede dedicação total, sem transferir crédito entre as metas dos cards.
        const cargaPlanejadaSegundos = Math.round(progressoPlano.cargaPlanejada * 60);
        const percentualReal = cargaPlanejadaSegundos ? segundosProjeto / cargaPlanejadaSegundos * 100 : 0;
        renderizarProgresso(dadosExame, percentualReal, estadoDias);
        renderizarCards({
            extras, segundosExtrasPorBloco, anotacoesSessoes,
            materiaDoDia,
            revisoesDoDia,
            revisoes: mostrarRevisoes ? revisoes : [],
            mostrarRevisoes,
            estadoDias,
            progressoMaterias: progressoPlano.materias,
            globaisPorParticipacao,
            dominioMaterias,
            projetoId,
            minutosProjeto,
            minutosPorDia,
            sessoesProjeto,
            estudoPorBloco: Math.max(1, Number(dadosExame.estudoPorBloco) || 1)
        });
        renderizarRevisoesAtrasadas(mostrarRevisoes ? revisoes : [], projetoId, anotacoesSessoes);

    }

    function renderizarCabecalho(dadosExame, estadoDias, minutosProjeto, minutosHoje) {
        const atual = estadoDias[indiceAtual];
        const concluidos = estadoDias.filter((estado) => estado.concluido).length;
        document.getElementById('jornada-titulo').textContent = dadosExame.nomeExame || 'Sua campanha de estudos';
        document.getElementById('jornada-status').textContent = concluidos >= estadoDias.length
            ? 'Campanha concluída. Você completou todos os dias planejados!'
            : `${concluidos} de ${estadoDias.length} dias concluídos. Continue acumulando conhecimento.`;
        document.getElementById('stat-dia').textContent = atual ? formatarDia(atual.indice + 1) : '--';
        document.getElementById('stat-xp').textContent = `${Math.floor(minutosProjeto)} pts`;
        document.getElementById('stat-hoje').textContent = formatarMinutos(minutosHoje);
    }

    function renderizarProgresso(dadosExame, percentualGeral, estadoDias) {
        const totalDias = estadoDias.length;
        const atual = limitarPercentual(percentualGeral);
        const ideal = limitarPercentual((calcularDiasIdeais(dadosExame) / Math.max(1, totalDias)) * 100);
        const barra = document.getElementById('progresso-atual');
        barra.setAttribute('aria-valuenow', atual.toFixed(2));
        document.getElementById('progresso-atual-label').textContent = `${Number(atual.toFixed(2)).toLocaleString('pt-BR')}%`;
        document.getElementById('jornada-faixa').style.setProperty('--total-dias', totalDias);
        const preenchimento = document.createElement('span');
        preenchimento.className = 'jornada-preenchimento';
        preenchimento.style.width = `${atual}%`;
        barra.replaceChildren(preenchimento);
        document.getElementById('jornada-marcos').replaceChildren(...estadoDias.map(dia => {
            const marco = document.createElement('button');
            marco.type = 'button';
            marco.textContent = formatarDia(dia.indice + 1);
            marco.title = `${formatarDia(dia.indice + 1)}: ${Number(dia.percentual.toFixed(2))}% realizado`;
            marco.addEventListener('click', () => centralizarCarta(dia.indice));
            return marco;
        }));
        definirBarra('progresso-ideal', 'progresso-ideal-label', ideal);

        const diferenca = atual - ideal;
        const status = document.getElementById('comparacao-status');
        status.className = 'badge rounded-pill align-self-center ';
        if (diferenca >= 5) {
            status.className += 'text-bg-success';
            status.textContent = 'Adiantado';
        } else if (diferenca <= -5) {
            status.className += 'text-bg-warning';
            status.textContent = 'Atrasado';
        } else {
            status.className += 'text-bg-primary';
            status.textContent = 'Em dia';
        }
    }

    function renderizarCards(contexto) {
        const container = document.getElementById('jornada-cards');
        const foco = document.activeElement;
        const cartaFocada = foco?.closest('.dia-card');
        const focoIndice = cartaFocada?.dataset.indice;
        const focoNota = foco?.dataset.notaBloco;
        const focoRotulo = foco?.getAttribute('aria-label');
        const focoLinha = foco?.closest('[data-cronometro-materia]');
        const focoMateria = focoLinha?.dataset.projetoMateriaId;
        const focoRevisao = focoLinha?.dataset.revisaoId;
        const focoExtra = foco?.closest('[data-bloco-extra-id]')?.dataset.blocoExtraId;
        clearTimeout(esperaRolagem);
        cancelAnimationFrame(frameCentralizacao);
        const selecaoPreservada = indiceSelecionado;
        indiceSelecionado = Math.min(indiceSelecionado ?? indiceAtual, contexto.estadoDias.length - 1);
        // A atualização das sessões não deve apagar a escolha de expansão do usuário.
        const revisoesAbertas = new Set(Array.from(
            container.querySelectorAll('.revisao-grupo[open]'),
            (grupo) => grupo.dataset.revisaoChave
        ));
        container.replaceChildren();

        contexto.estadoDias.forEach((estado) => {
            const card = document.createElement('article');
            card.className = 'dia-card';
            card.dataset.indice = estado.indice;
            card.dataset.situacaoTemporal = estado.situacaoTemporal;
            if (estado.dataPrevista) card.dataset.dataPrevista = estado.dataPrevista;
            card.tabIndex = 0;
            card.addEventListener('focusin', event => {
                // Um clique não pode deslocar seu botão entre pointerdown e pointerup.
                if (!restaurandoFoco && event.target.matches(':focus-visible') && indiceSelecionado !== estado.indice) centralizarCarta(estado.indice, false);
            });
            card.addEventListener('click', event => {
                if (!event.target.closest('button, input, select, a, summary, textarea')) centralizarCarta(estado.indice);
            });
            card.addEventListener('keydown', event => {
                if (event.target === card && ['Enter', ' '].includes(event.key)) {
                    event.preventDefault(); centralizarCarta(estado.indice);
                }
            });
            card.setAttribute('aria-label', formatarDia(estado.indice + 1));
            if (!estado.desbloqueado) card.classList.add('dia-card-bloqueado');
            else if (estado.concluido) card.classList.add('dia-card-concluido');
            if (estado.atual) card.classList.add('dia-card-disponivel');
            if (estado.indice === indiceAtual) card.classList.add('dia-card-atual');

            const badge = document.createElement('span');
            badge.className = 'dia-card-badge';
            const rotuloEstado = !estado.desbloqueado
                ? estado.dataPrevista ? `Bloqueado até ${estado.dataPrevista.split('-').reverse().join('/')}` : 'Calendário indisponível'
                : estado.concluido ? 'Concluído' : estado.atual ? 'Disponível hoje' : 'Meta pendente; registro retrospectivo';
            badge.title = rotuloEstado;
            badge.setAttribute('role', 'img');
            badge.setAttribute('aria-label', rotuloEstado);
            badge.append(criarIcone(!estado.desbloqueado ? 'bloqueado' : estado.concluido ? 'concluir' : 'proximo'));
            if (!estado.desbloqueado && estado.concluido) badge.append(criarIcone('concluir'));
            const titulo = document.createElement('h3');
            titulo.textContent = formatarDia(estado.indice + 1);
            const cabecalho = document.createElement('div');
            cabecalho.className = 'dia-card-cabecalho';
            cabecalho.append(titulo, badge);
            if (estado.indice === indiceAtual) {
                const calendario = document.createElement('span');
                calendario.className = 'dia-card-calendario';
                calendario.title = avisoCalendario ? 'Referência do calendário' : 'Hoje';
                calendario.setAttribute('role', 'img');
                calendario.setAttribute('aria-label', calendario.title);
                calendario.append(criarIcone('calendario'));
                cabecalho.append(calendario);
            }
            const adicionar = document.createElement('button');
            adicionar.type = 'button';
            adicionar.className = 'dia-extra-adicionar';
            adicionar.textContent = '+';
            adicionar.title = `Adicionar estudo extra no ${formatarDia(estado.indice + 1)}`;
            adicionar.setAttribute('aria-label', adicionar.title);
            adicionar.disabled = !estado.dataPrevista;
            adicionar.addEventListener('click', async () => {
                adicionar.disabled = true;
                try {
                    const extra = await window.EstudoExtra.criar(estado.dia, undefined, contexto.projetoId);
                    document.querySelector(`[data-bloco-extra-id="${extra.blocoId}"] select`)?.focus({ preventScroll: true });
                } catch (erro) { document.getElementById('cronometro-status').textContent = erro.message; adicionar.disabled = false; }
            });
            cabecalho.append(adicionar);
            card.append(cabecalho);

            if (!estado.desbloqueado) {
                const aviso = document.createElement('p');
                aviso.className = 'text-secondary dia-bloqueio-aviso';
                aviso.textContent = estado.dataPrevista
                    ? `Disponível em ${estado.dataPrevista.split('-').reverse().join('/')}.`
                    : 'Calendário indisponível. Confira as datas do projeto.';
                card.appendChild(aviso);
            }

            adicionarMateriasComCronometro(card, estado.metasMaterias, {
                projetoId: contexto.projetoId,
                diaJornada: estado.dia,
                dataPrevista: estado.dataPrevista,
                situacaoTemporal: estado.situacaoTemporal,
                progressoMaterias: contexto.progressoMaterias,
                globaisPorParticipacao: contexto.globaisPorParticipacao,
                dominioMaterias: contexto.dominioMaterias,
                blocosIndependentes: lerObjeto('dadosExame')?.distribuicaoVersao === 3,
                sessoesProjeto: contexto.sessoesProjeto,
                anotacoesSessoes: contexto.anotacoesSessoes,
                blocos: contexto.materiaDoDia[estado.dia] || []
            });
            const revisoes = contexto.revisoes.filter(r => r.diaJornada === estado.dia);
            adicionarEstudosExtras(card, contexto.extras.filter(e => e.diaJornada === estado.dia), { ...contexto, estado });
            if (contexto.mostrarRevisoes) adicionarRevisoesComCronometro(card, revisoes, {
                projetoId: contexto.projetoId,
                diaJornada: estado.dia,
                sessoesProjeto: contexto.sessoesProjeto,
                anotacoesSessoes: contexto.anotacoesSessoes,
                revisoesAbertas,
                estudoPorBloco: contexto.estudoPorBloco
            });
            if (!estado.desbloqueado) {
                // A carta futura é uma prévia legível, sem ações de estudo antecipadas.
                card.querySelectorAll('.materia-cronometro-acoes .materia-cronometro-botao').forEach((botao) => { if (!botao.closest('.estudo-extra')) botao.remove(); });
            }

            if (estado.atual) {
                const progressoDia = estado.percentual;
                const bloco = document.createElement('div');
                bloco.className = 'dia-progresso-resumo';
                bloco.innerHTML = `<div class="d-flex justify-content-between small mb-1"><span>Progresso do dia</span><span>${Math.round(progressoDia)}%</span></div><div class="progresso-trilho"><div class="progresso-barra progresso-barra-atual" style="width:${progressoDia}%"></div></div>`;
                card.appendChild(bloco);

            }
            container.appendChild(card);
        });

        atualizarAtalhosCronometro();

        const seletor = document.getElementById('carta-seletor');
        if (seletor) {
            seletor.replaceChildren(...contexto.estadoDias.map((estado) => {
                const option = document.createElement('option');
                option.value = estado.indice;
                option.textContent = `${formatarDia(estado.indice + 1)}${estado.indice === indiceAtual ? ' · calendário' : ''}${estado.indice === indiceProximo ? ' · próximo a estudar' : estado.concluido ? ' · concluído' : ''}`;
                return option;
            }));
        }
        // Atualizar o destaque sincronamente impede que um scroll antigo selecione outro dia.
        destacarCarta(selecaoPreservada ?? indiceSelecionado);
        if (focoIndice !== undefined) {
            const novaCarta = container.querySelector(`[data-indice="${focoIndice}"]`);
            const novoFoco = [...(novaCarta?.querySelectorAll('button, summary, select') || [])].find(el => {
                if (focoNota) return el.dataset.notaBloco === focoNota;
                const linha = el.closest('[data-cronometro-materia]');
                return focoRotulo && el.getAttribute('aria-label') === focoRotulo && linha?.dataset.projetoMateriaId === focoMateria && linha?.dataset.revisaoId === focoRevisao && el.closest('[data-bloco-extra-id]')?.dataset.blocoExtraId === focoExtra && !el.disabled;
            });
            restaurandoFoco = true;
            (novoFoco || novaCarta)?.focus({preventScroll:true});
            restaurandoFoco = false;
        }
        const destino = indiceSelecionado;
        frameCentralizacao = requestAnimationFrame(() => centralizarCarta(destino, false));
        document.getElementById('carta-proximo').disabled = indiceProximo === null;
        document.getElementById('carta-proximo').textContent = indiceProximo === null ? textoSemPendencia() : 'Ir ao próximo dia a estudar';
    }

    function centralizarCarta(indice, animar = true) {
        cancelAnimationFrame(frameCentralizacao);
        const container = document.getElementById('jornada-viewport');
        const card = container?.querySelector(`[data-indice="${Number(indice)}"]`);
        if (!card) return;
        clearTimeout(esperaRolagem);
        container.scrollTo({
            left: card.offsetLeft + card.offsetWidth / 2 - container.clientWidth / 2,
            behavior: animar && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant'
        });
        destacarCarta(Number(indice));
    }

    function destacarCarta(indice) {
        indiceSelecionado = indice;
        document.querySelectorAll('#jornada-cards .dia-card').forEach(card => {
            const selecionado = Number(card.dataset.indice) === indice;
            card.classList.toggle('dia-card-selecionado', selecionado);
            card.tabIndex = selecionado ? 0 : -1;
            if (Number(card.dataset.indice) === indiceAtual) card.setAttribute('aria-current', 'date');
            else card.removeAttribute('aria-current');
            card.setAttribute('aria-label', `${formatarDia(Number(card.dataset.indice) + 1)}${selecionado ? ', em destaque' : ''}${Number(card.dataset.indice) === indiceAtual ? ', dia atual' : ''}${card.classList.contains('dia-card-bloqueado') ? ', bloqueado' : card.classList.contains('dia-card-concluido') ? ', concluído' : ', disponível'}`);
        });
        const seletor = document.getElementById('carta-seletor');
        if (seletor) seletor.value = indice;
        document.getElementById('carta-em-foco').textContent = `Em destaque: ${formatarDia(indice + 1)} · Calendário: ${formatarDia(indiceAtual + 1)} · ${indiceProximo === null ? textoSemPendencia() : `Próximo a estudar: ${formatarDia(indiceProximo + 1)}`}${avisoCalendario ? ` · ${avisoCalendario}` : ''}`;
    }

    function textoSemPendencia() {
        return todasMetasConcluidas ? 'Todas as metas concluídas' : 'Sem metas pendentes disponíveis';
    }

    function centralizarCartaAtual(animar = true) {
        if (dataRenderizada !== new Date().toDateString()) iniciarJornada();
        centralizarCarta(indiceAtual, animar);
    }

    let esperaRolagem, frameCentralizacao;
    function iniciarControlesCartas() {
        const viewport = document.getElementById('jornada-viewport');
        viewport.addEventListener('scroll', () => {
            clearTimeout(esperaRolagem);
            esperaRolagem = setTimeout(() => {
                const centro = viewport.scrollLeft + viewport.clientWidth / 2;
                const cartas = Array.from(viewport.querySelectorAll('.dia-card'));
                const proxima = cartas.reduce((melhor, card) => !melhor || Math.abs(card.offsetLeft + card.offsetWidth / 2 - centro) < Math.abs(melhor.offsetLeft + melhor.offsetWidth / 2 - centro) ? card : melhor, null);
                if (proxima) destacarCarta(Number(proxima.dataset.indice));
            }, 120);
        }, { passive: true });
        viewport.addEventListener('keydown', event => {
            if (event.target.closest('button, input, select, a, summary, textarea')) return;
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const ultimo = viewport.querySelectorAll('.dia-card').length - 1;
            const destino = event.key === 'Home' ? 0 : event.key === 'End' ? ultimo : (indiceSelecionado ?? indiceAtual) + (event.key === 'ArrowRight' ? 1 : -1);
            centralizarCarta(Math.max(0, Math.min(ultimo, destino)));
            viewport.querySelector(`[data-indice="${indiceSelecionado}"]`)?.focus({preventScroll:true});
        });
        const seletor = document.getElementById('carta-seletor');
        seletor?.addEventListener('change', () => centralizarCarta(seletor.value));
        document.getElementById('carta-atual')?.addEventListener('click', () => centralizarCartaAtual());
        document.getElementById('revisoes-habilitadas').addEventListener('change', event => {
            try { window.RevisoesStore.definirHabilitadas(event.target.checked); }
            catch (_) { document.getElementById('revisoes-status').textContent = 'Não foi possível salvar a preferência. Tente novamente.'; }
        });
        document.getElementById('carta-proximo')?.addEventListener('click', () => {
            if (indiceProximo !== null) centralizarCarta(indiceProximo);
        });
        const atualizarData = () => {
            if (dataRenderizada && dataRenderizada !== new Date().toDateString()) iniciarJornada();
        };
        window.addEventListener('focus', atualizarData);
        document.addEventListener('visibilitychange', atualizarData);
        setInterval(atualizarData, 30000);
        document.querySelectorAll('[data-carta-passo]').forEach((botao) => botao.addEventListener('click', () => {
            const indice = Math.max(0, Math.min(seletor.options.length - 1, Number(seletor.value) + Number(botao.dataset.cartaPasso)));
            centralizarCarta(indice);
        }));
        window.addEventListener('resize', () => centralizarCarta(seletor?.value || 0, false));
    }

    function adicionarMateriasComCronometro(card, metasMaterias, contexto) {
        const titulo = document.createElement('h4');
        titulo.className = 'visually-hidden';
        titulo.textContent = 'Matérias de hoje';
        const lista = document.createElement('ul');
        lista.className = 'dia-lista dia-materias';

        metasMaterias.forEach((meta) => {
            const item = document.createElement('li');
            item.className = 'dia-materia-item';
            item.classList.toggle('dia-materia-concluida', meta.completo);
            item.dataset.cronometroMateria = meta.materia;
            item.dataset.projetoMateriaId = meta.projetoMateriaId;
            item.dataset.cronometroTipo = 'estudo';
            item.dataset.diaJornada = contexto.diaJornada;
            item.dataset.faltamSegundos = meta.faltamSegundos;
            const identificacao = document.createElement('span');
            identificacao.className = 'dia-materia-identificacao';
            const nome = document.createElement('strong');
            nome.textContent = meta.materia;
            const estadoMateria = document.createElement('small');
            estadoMateria.className = 'visually-hidden';
            estadoMateria.textContent = meta.completo ? 'Meta concluída' : 'Meta pendente';
            if (meta.completo) nome.append(criarIcone('concluir'));
            const progresso = criarIndicadorProgresso('dia', textoTempoRegistrado(meta), meta.pontosAplicadosSegundos,
                meta.metaSegundos, `Estudo normal registrado de ${meta.materia} neste dia: ${textoTempoRegistrado(meta)}`);
            identificacao.append(nome, estadoMateria, progresso);
            const blocos = contexto.blocos.filter(bloco => bloco.projetoMateriaId === meta.projetoMateriaId);
            const notas = document.createElement('span');
            notas.className = 'nota-botoes';
            const textosNotas = document.createElement('span');
            textosNotas.className = 'materia-notas';
            const limitePreviewNota = 20;
            const resumirTextoNota = texto => {
                const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
                return limpo.length > limitePreviewNota ? `${limpo.slice(0, limitePreviewNota)}…` : limpo;
            };
            blocos.forEach((bloco, indice) => {
                const botao = window.NotasBlocos.criarBotao(bloco, {
                    diaJornada: contexto.diaJornada, numero: indice + 1,
                    metaOriginalSegundos: bloco.metaSegundos ?? (Math.round(meta.metaSegundos * (indice + 1) / blocos.length) - Math.round(meta.metaSegundos * indice / blocos.length))
                });
                if (blocos.length > 1) {
                    const acaoNota = document.createElement('span');
                    acaoNota.className = 'nota-acao';
                    const numero = document.createElement('small');
                    numero.textContent = indice + 1;
                    numero.setAttribute('aria-hidden', 'true');
                    acaoNota.append(numero, botao);
                    notas.append(acaoNota);
                } else notas.append(botao);
                const textoNota = window.NotasBlocos.texto(bloco);
                if (textoNota) {
                    const topico = document.createElement('span');
                    topico.className = 'bloco-topico';
                    topico.dataset.notaBlocoOrigem = bloco.blocoId;
                    if (blocos.length > 1) {
                        const numero = document.createElement('strong');
                        numero.textContent = `Bloco ${indice + 1} · `;
                        topico.append(numero);
                    }
                    const texto = document.createElement('span');
                    texto.className = 'nota-texto';
                    texto.textContent = resumirTextoNota(textoNota);
                    texto.title = textoNota;
                    topico.append(texto);
                    textosNotas.append(topico);
                }
            });
            adicionarAnotacoesSessoes(textosNotas, contexto.anotacoesSessoes, meta.projetoMateriaId, contexto.diaJornada, '', '', null, limitePreviewNota);
            textosNotas.hidden = !textosNotas.childElementCount;
            if (contexto.blocosIndependentes) {
                item.classList.add('materia-com-blocos');
                // Detalhar cada bloco sem mudar o crédito sequencial nem a conclusão por matéria.
                const progressoBlocos = window.EstudoStore.projetarProgressoBlocos(meta, blocos);
                identificacao.replaceChildren(nome, estadoMateria, ...blocos.map((bloco, indice) => {
                    const linha = document.createElement('span');
                    linha.className = 'dia-bloco-item';
                    linha.dataset.blocoId = bloco.blocoId;
                    const nomeBloco = document.createElement('strong');
                    nomeBloco.className = blocos.length > 1 ? 'bloco-nome' : 'bloco-nome visually-hidden';
                    nomeBloco.textContent = `Bloco ${indice + 1}`;
                    const progressoBloco = progressoBlocos[indice];
                    const aplicado = progressoBloco.pontosAplicadosSegundos;
                    linha.dataset.faltamSegundos = progressoBloco.faltamSegundos;
                    linha.dataset.metaSegundos = bloco.metaSegundos;
                    const concluido = progressoBloco.completo;
                    linha.classList.toggle('bloco-concluido', concluido);
                    const estadoBloco = document.createElement('small');
                    estadoBloco.className = 'bloco-estado visually-hidden';
                    estadoBloco.textContent = concluido ? '✓ Concluído' : aplicado > 0 ? 'Em andamento' : 'A estudar';
                    const indicador = criarIndicadorProgresso('bloco', textoTempoRegistrado(progressoBloco), aplicado,
                        bloco.metaSegundos, `Estudo normal registrado de ${meta.materia}, bloco ${indice + 1}: ${textoTempoRegistrado(progressoBloco)}`);
                    indicador.querySelector('small').classList.add('bloco-tempo-restante');
                    indicador.querySelector('progress').classList.add('bloco-progresso');
                    linha.append(nomeBloco, estadoBloco, indicador);
                    return linha;
                }));
            }
            const projeto = contexto.progressoMaterias[meta.projetoMateriaId];
            const materiaGlobalId = contexto.globaisPorParticipacao.get(meta.projetoMateriaId);
            const dominio = contexto.dominioMaterias.get(materiaGlobalId);
            const percentualProjeto = projeto.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
            identificacao.append(
                criarIndicadorProgresso('projeto', `${percentualProjeto}%`, projeto.segundosCreditados,
                    projeto.metaTotalSegundos, `Progresso de ${meta.materia} neste projeto: ${percentualProjeto}%; ${textoTempoRegistrado({ pontosAplicadosSegundos: projeto.segundos, metaSegundos: projeto.metaTotalSegundos })} de estudo normal registrado`),
                criarIndicadorProgresso('nivel', `Nvl. ${dominio.nivel}`, dominio.percentual, 100,
                    `Nível global de ${dominio.nomeCanonico}: ${dominio.nivel}. ${dominio.nivel === 100 ? 'Nível máximo' : `${dominio.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% até o próximo nível; faltam ${dominio.pontosParaProximoNivel.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} min`}`)
            );
            item.append(identificacao, textosNotas, criarAcoesCronometro(meta.materia, {
                tipo: 'estudo',
                projetoMateriaId: meta.projetoMateriaId,
                diaJornada: contexto.diaJornada,
                registroManual: contexto.situacaoTemporal === 'passado',
                dataEstudo: contexto.dataPrevista
            }, meta.completo ? null : () => concluirMateria(meta, contexto)));
            {
                const acoes = item.querySelector('.materia-cronometro-acoes');
                const rodape = document.createElement('span');
                rodape.className = 'blocos-acoes';
                const conclusao = acoes.querySelector('.materia-acao-concluir');
                if (conclusao && blocos.length > 1) {
                    conclusao.title = `Concluir os ${blocos.length} blocos de ${meta.materia} neste dia`;
                    conclusao.setAttribute('aria-label', conclusao.title);
                }
                acoes.prepend(...notas.childNodes);
                rodape.append(acoes);
                item.append(rodape);
            }
            lista.appendChild(item);
        });
        card.append(titulo, lista);
    }

    function adicionarEstudosExtras(card, extras, contexto) {
        if (!extras.length) return;
        const lista = document.createElement('ul');
        lista.className = 'dia-lista dia-extras';
        lista.setAttribute('aria-label', 'Estudos extras');
        extras.forEach(extra => {
            const item = document.createElement('li');
            item.className = 'dia-materia-item materia-com-blocos estudo-extra';
            item.dataset.blocoExtraId = extra.blocoId;
            const identificacao = document.createElement('span');
            identificacao.className = 'dia-materia-identificacao';
            const titulo = document.createElement('strong');
            titulo.textContent = 'Estudo extra';
            identificacao.append(titulo);
            if (!extra.projetoMateriaId) {
                const seletor = document.createElement('select');
                seletor.className = 'extra-materia-seletor';
                seletor.setAttribute('aria-label', 'Matéria do estudo extra');
                const placeholder = document.createElement('option');
                placeholder.value = ''; placeholder.textContent = 'Escolha a matéria';
                seletor.append(placeholder);
                Object.keys(contexto.progressoMaterias).forEach(id => {
                    const option = document.createElement('option');
                    option.value = id; option.textContent = window.IdentidadeStore.nomeMateria(id);
                    seletor.append(option);
                });
                seletor.addEventListener('change', async () => {
                    if (!seletor.value) return;
                    seletor.disabled = true;
                    try {
                        await window.EstudoExtra.escolherMateria(extra.blocoId, seletor.value, contexto.projetoId);
                        document.querySelector(`.estudo-extra[data-bloco-extra-id="${extra.blocoId}"] [data-nota-bloco]`)?.focus({ preventScroll: true });
                    } catch (erro) { document.getElementById('cronometro-status').textContent = erro.message; seletor.disabled = false; }
                });
                identificacao.append(seletor);
                item.append(identificacao); lista.append(item); return;
            }
            const materia = window.IdentidadeStore.nomeMateria(extra.projetoMateriaId);
            titulo.textContent = `${materia} · extra`;
            item.dataset.cronometroMateria = materia;
            item.dataset.projetoMateriaId = extra.projetoMateriaId;
            item.dataset.cronometroTipo = 'estudo';
            item.dataset.diaJornada = extra.diaJornada;
            item.dataset.execucaoBloqueada = String(!contexto.estado.desbloqueado || contexto.estado.dataPrevista !== extra.dataOrigem);
            const projeto = contexto.progressoMaterias[extra.projetoMateriaId];
            const dominio = contexto.dominioMaterias.get(contexto.globaisPorParticipacao.get(extra.projetoMateriaId));
            const percentual = projeto.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
            identificacao.append(
                criarIndicadorProgresso('projeto', `${percentual}%`, projeto.segundosCreditados, projeto.metaTotalSegundos,
                    `Progresso de ${materia} neste projeto: ${percentual}%`),
                criarIndicadorProgresso('nivel', `Nvl. ${dominio.nivel}`, dominio.percentual, 100,
                    `Nível global de ${dominio.nomeCanonico}: ${dominio.nivel}`)
            );
            const acoes = criarAcoesCronometro(materia, { tipo: 'estudo', projetoId: contexto.projetoId,
                projetoMateriaId: extra.projetoMateriaId, blocoId: extra.blocoId, blocoExtraId: extra.blocoId,
                diaJornada: extra.diaJornada, registroManual: contexto.estado.situacaoTemporal === 'passado', dataEstudo: extra.dataOrigem });
            const bloco = { ...extra, materia };
            acoes.prepend(window.NotasBlocos.criarBotao(bloco, { diaJornada: extra.diaJornada, numero: 1 }));
            const textoNota = window.NotasBlocos.texto(bloco);
            const tempo = document.createElement('small'); tempo.className = 'extra-tempo-registrado';
            tempo.textContent = ((contexto.segundosExtrasPorBloco.get(extra.blocoId) || 0) / 60).toLocaleString('pt-BR', {maximumFractionDigits:2}) + ' min estudados';
            const anotacoes = document.createElement('span'); anotacoes.className = 'materia-notas';
            if (textoNota) {
                const nota = document.createElement('span');
                nota.className = 'bloco-topico';
                nota.dataset.notaBlocoOrigem = extra.blocoId;
                const texto = document.createElement('span');
                texto.className = 'nota-texto';
                const limpo = String(textoNota).replace(/\s+/g, ' ').trim();
                texto.textContent = limpo.length > 20 ? `${limpo.slice(0, 20)}…` : limpo;
                texto.title = textoNota;
                nota.append(texto);
                anotacoes.append(nota);
            }
            adicionarAnotacoesSessoes(anotacoes, contexto.anotacoesSessoes, extra.projetoMateriaId, extra.diaJornada, extra.blocoId, textoNota, null, 20);
            anotacoes.hidden = !anotacoes.childElementCount;
            const rodape = document.createElement('span'); rodape.className = 'blocos-acoes'; rodape.append(acoes);
            item.append(identificacao, tempo, anotacoes, rodape); lista.append(item);
        });
        card.append(lista);
    }

    function adicionarAnotacoesSessoes(destino, anotacoes, materiaId, dia, extraId = '', notaAtual = '', blocoId = null, limite = 0) {
        (anotacoes?.get(JSON.stringify([materiaId, dia, extraId])) || [])
            .filter(s => s.anotacao !== notaAtual && (!blocoId || s.blocoId === blocoId)).forEach(s => {
                const texto = document.createElement('span');
                texto.className = 'bloco-topico sessao-anotacao'; texto.dataset.sessaoAnotacao = s.id;
                const limpo = String(s.anotacao || '').replace(/\s+/g, ' ').trim();
                texto.textContent = limite > 0 && limpo.length > limite ? `${limpo.slice(0, limite)}…` : s.anotacao;
                if (limite > 0) texto.title = s.anotacao;
                destino.append(texto);
            });
    }

    function textoTempoRegistrado(meta) {
        const minutos = segundos => (segundos / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
        return `${minutos(meta.pontosAplicadosSegundos)} / ${minutos(meta.metaSegundos)} min`;
    }

    function criarIndicadorProgresso(tipo, texto, valor, maximo, descricao) {
        const linha = document.createElement('span');
        linha.className = `materia-indicador materia-indicador-${tipo}`;
        const rotulo = document.createElement('small');
        rotulo.textContent = texto;
        const barra = document.createElement('progress');
        barra.className = 'materia-indicador-barra';
        barra.max = maximo;
        barra.value = valor;
        barra.setAttribute('aria-label', descricao);
        linha.title = descricao;
        linha.append(rotulo, barra);
        return linha;
    }

    function adicionarRevisoesComCronometro(card, revisoes, contexto) {
        const planoOrigem = lerObjeto('materiaDoDia') || {};
        const titulo = document.createElement('h4');
        titulo.className = revisoes.length ? 'dia-revisoes-titulo' : 'visually-hidden';
        titulo.textContent = 'Revisões';
        const lista = document.createElement('div');
        lista.className = 'revisoes-grupos';

        if (!revisoes.length) {
            const vazia = document.createElement('p');
            vazia.className = 'visually-hidden';
            vazia.textContent = 'Nenhuma revisão programada';
            lista.appendChild(vazia);
        } else {
            const grupos = revisoes.reduce((acc, revisao) => {
                if (!acc.has(revisao.diaOrigem)) acc.set(revisao.diaOrigem, []);
                acc.get(revisao.diaOrigem).push(revisao);
                return acc;
            }, new Map());
            grupos.forEach((itens, diaOrigem) => {
                const grupo = document.createElement('details');
                grupo.className = 'revisao-grupo';
                grupo.dataset.revisaoChave = JSON.stringify([contexto.projetoId, contexto.diaJornada, diaOrigem]);
                grupo.open = contexto.revisoesAbertas.has(grupo.dataset.revisaoChave);
                const resumo = document.createElement('summary');
                const quantidadeConcluida = itens.filter((revisao) => revisao.estado === 'concluida').length;
                resumo.setAttribute('aria-label', `Revisões do ${formatarDia(numeroDoDia(diaOrigem))}, ${quantidadeConcluida} de ${itens.length} concluídas`);
                resumo.innerHTML = `<strong>${formatarDia(numeroDoDia(diaOrigem))}</strong><span aria-hidden="true">${quantidadeConcluida}/${itens.length}</span>`;
                const sublista = document.createElement('ul');
                sublista.className = 'dia-lista dia-revisoes revisao-grupo-lista';
                itens.forEach((revisao) => {
                    const concluida = revisao.estado === 'concluida';
                const item = document.createElement('li');
                item.className = 'dia-materia-item';
                item.classList.toggle('dia-materia-concluida', concluida);
                item.dataset.cronometroMateria = revisao.materia;
                item.dataset.projetoMateriaId = revisao.projetoMateriaId;
                item.dataset.cronometroTipo = 'revisao';
                item.dataset.diaJornada = contexto.diaJornada;
                item.dataset.referenciaDia = revisao.diaOrigem;
                item.dataset.revisaoId = revisao.id;
                if (revisao.blocoExtraId) item.dataset.blocoExtraId = revisao.blocoExtraId;
                item.classList.toggle('revisao-dispensada', revisao.estado === 'dispensada');
                const rotulo = document.createElement('span');
                rotulo.className = 'dia-materia-identificacao';
                const texto = document.createElement('strong');
                const blocosOrigem = (planoOrigem[revisao.diaOrigem] || []).filter(b => b.projetoMateriaId === revisao.projetoMateriaId);
                texto.textContent = revisao.materia + (revisao.blocoExtraId ? ' · extra' : blocosOrigem.length > 1 ? ` · bloco ${revisao.numero}` : '');
                if (concluida) texto.append(criarIcone('concluir'));
                rotulo.appendChild(texto);
                const situacao = document.createElement('small');
                situacao.textContent = `${revisao.estado === 'pendente' ? 'Pendente' : concluida ? 'Concluída' : 'Dispensada'} · Sugestão: ${formatarDuracaoRevisao(revisao.sugeridaSegundos)} · ${revisao.etapa} · D+${revisao.intervalo}`;
                situacao.className = 'visually-hidden';
                const sugestao = document.createElement('small');
                sugestao.className = 'revisao-sugestao';
                sugestao.textContent = `${revisao.etapa} · ${formatarDuracaoRevisao(revisao.sugeridaSegundos)}${revisao.estado === 'dispensada' ? ' · Dispensada' : ''}`;
                sugestao.setAttribute('aria-hidden', 'true');
                rotulo.append(situacao, sugestao);
                for (const bloco of [revisao]) {
                    const nota = window.NotasBlocos.texto(bloco);
                    if (!nota) continue;
                    const topico = document.createElement('small');
                    topico.className = 'nota-revisao';
                    topico.textContent = `» ${nota}`;
                    rotulo.appendChild(topico);
                }
                adicionarAnotacoesSessoes(rotulo, contexto.anotacoesSessoes, revisao.projetoMateriaId, revisao.diaOrigem,
                    revisao.blocoExtraId || '', window.NotasBlocos.texto(revisao), revisao.blocoId);
                item.append(rotulo);
                if (revisao.estado !== 'dispensada') item.append(criarAcoesCronometro(revisao.materia, {
                    tipo: 'revisao',
                    origem: 'cronometro-revisao',
                    projetoMateriaId: revisao.projetoMateriaId,
                    blocoId: revisao.blocoId,
                    ...(revisao.blocoExtraId ? { blocoExtraId: revisao.blocoExtraId } : {}),
                    revisaoId: revisao.id,
                    projetoId: revisao.projetoId,
                    diaJornada: revisao.diaJornada,
                    referenciaDia: revisao.diaOrigem
                }, concluida ? null : () => executarAcaoRevisao(revisao, 'concluir')));
                if (!concluida) {
                    const dispensar = document.createElement('button');
                    dispensar.type = 'button';
                    dispensar.className = 'btn btn-sm btn-outline-secondary materia-cronometro-botao revisao-dispensar';
                    const rotuloDispensa = revisao.estado === 'dispensada' ? 'Reativar revisão' : 'Dispensar revisão';
                    dispensar.title = rotuloDispensa;
                    dispensar.setAttribute('aria-label', rotuloDispensa);
                    dispensar.append(criarIcone(revisao.estado === 'dispensada' ? 'reativar' : 'dispensar'));
                    dispensar.addEventListener('click', () => executarAcaoRevisao(revisao, revisao.estado === 'dispensada' ? 'reabrir' : 'dispensar'));
                    item.append(dispensar);
                }
                    sublista.appendChild(item);
                });
                grupo.append(resumo, sublista);
                lista.appendChild(grupo);
            });
        }
        card.append(titulo, lista);
    }

    function formatarDuracaoRevisao(segundos) {
        const minutos = Math.floor(segundos / 60), resto = segundos % 60;
        return `${minutos}min${resto ? ` ${resto}s` : ''}`;
    }

    async function executarAcaoRevisao(revisao, acao) {
        const timer = window.CronometroEstudos?.obterEstado();
        if (timer?.revisaoId === revisao.id && timer.estado !== 'ocioso') {
            document.getElementById('revisoes-status').textContent = 'Registre ou zere o cronômetro desta revisão antes de alterar seu estado.';
            return;
        }
        try {
            await window.RevisoesStore[acao](revisao.id);
            const linha = [...document.querySelectorAll('[data-revisao-id]')].find(el => el.dataset.revisaoId === revisao.id);
            (linha?.querySelector('button') || document.getElementById('revisoes-habilitadas')).focus({preventScroll:true});
        } catch (_) { document.getElementById('revisoes-status').textContent = 'Não foi possível salvar a revisão. Tente novamente.'; }
    }

    function renderizarRevisoesAtrasadas(revisoes, projetoId, anotacoesSessoes) {
        const hoje = window.RevisoesStore.dataLocal();
        const atrasadas = revisoes.filter(r => r.estado === 'pendente' && r.dataPrevista && r.dataPrevista < hoje);
        const container = document.getElementById('revisoes-atrasadas-lista');
        const abertas = new Set([...container.querySelectorAll('.revisao-grupo[open]')].map(el => el.dataset.revisaoChave));
        container.replaceChildren();
        document.getElementById('revisoes-atrasadas').hidden = !atrasadas.length;
        document.getElementById('revisoes-atrasadas-titulo').textContent = `Revisões atrasadas (${atrasadas.length})`;
        const dias = [...new Set(atrasadas.map(r=>r.diaJornada))];
        dias.forEach(dia => {
            const secao = document.createElement('section');
            const titulo = document.createElement('h3');
            const revisoesDia = atrasadas.filter(r=>r.diaJornada===dia);
            titulo.textContent = `${formatarDia(numeroDoDia(dia))} · prevista para ${revisoesDia[0].dataPrevista.split('-').reverse().join('/')}`;
            secao.append(titulo);
            adicionarRevisoesComCronometro(secao,revisoesDia,{projetoId,diaJornada:dia,revisoesAbertas:abertas,anotacoesSessoes});
            container.append(secao);
        });
        atualizarAtalhosCronometro();
    }

    function criarAcoesCronometro(materia, opcoes = {}, aoConcluir = null) {
        const acoes = document.createElement('span');
        acoes.className = 'materia-cronometro-acoes';
        const inicio = opcoes.registroManual
            ? criarBotaoCronometro('manual', `Registrar tempo passado de ${materia}`, () => window.CronometroEstudos?.abrirRegistroManual(opcoes.projetoMateriaId, opcoes))
            : criarBotaoCronometro('play', `Iniciar cronômetro para ${materia}`, () => window.CronometroEstudos?.iniciarMateria(opcoes.projetoMateriaId, opcoes));
        acoes.append(
            inicio,
            criarBotaoCronometro('stop', `Parar cronômetro de ${materia}`, () => window.CronometroEstudos?.parar()),
            criarBotaoCronometro('registrar', `Registrar tempo de ${materia}`, () => window.CronometroEstudos?.registrarAtual())
        );
        if (aoConcluir) {
            acoes.appendChild(criarBotaoCronometro('concluir', `Marcar ${materia} como concluída`, aoConcluir));
        }
        return acoes;
    }

    function criarIcone(nome) {
        const desenhos = {
            play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
            stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
            registrar: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
            manual: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
            concluir: '<path d="m5 12 4 4L19 6"/>',
            bloqueado: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
            proximo: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
            calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3"/>',
            dispensar: '<path d="m6 6 12 12M6 18 18 6"/>',
            reativar: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>'
        };
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('jornada-icone');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.innerHTML = desenhos[nome];
        return svg;
    }

    function criarBotaoCronometro(acao, rotulo, aoClicar) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = `btn btn-sm materia-cronometro-botao materia-acao-${acao}`;
        botao.classList.add(acao === 'play' ? 'btn-outline-primary' : acao === 'stop' ? 'btn-outline-danger' : 'btn-outline-success');
        botao.append(criarIcone(acao));
        botao.title = rotulo;
        botao.setAttribute('aria-label', rotulo);
        botao.addEventListener('click', aoClicar);
        return botao;
    }

    function atualizarAtalhosCronometro() {
        const estado = window.CronometroEstudos?.obterEstado() || { estado: 'ocioso', materia: '' };
        document.querySelectorAll('[data-cronometro-materia]').forEach((item) => {
            const mesmaMateria = item.dataset.projetoMateriaId === estado.projetoMateriaId;
            const mesmoTipo = (item.dataset.cronometroTipo || 'estudo') === (estado.tipo || 'estudo');
            const mesmaReferencia = (item.dataset.referenciaDia || '') === (estado.referenciaDia || '');
            const mesmoDia = !item.dataset.diaJornada || !estado.diaJornada || item.dataset.diaJornada === estado.diaJornada;
            const mesmaRevisao = (item.dataset.revisaoId || '') === (estado.revisaoId || '');
            const mesmoExtra = (item.dataset.blocoExtraId || '') === (estado.blocoExtraId || '');
            const ativa = mesmaMateria && mesmoTipo && mesmaReferencia && mesmoDia && mesmaRevisao && mesmoExtra && estado.estado !== 'ocioso';
            const play = item.querySelector('.materia-acao-play');
            const stop = item.querySelector('.materia-acao-stop');
            const registrar = item.querySelector('.materia-acao-registrar');
            if (play) {
                play.disabled = estado.pronto === false || item.dataset.execucaoBloqueada === 'true';
                play.classList.toggle('d-none', ativa && estado.estado === 'rodando');
                const rotulo = `${ativa && estado.estado === 'parado' ? 'Continuar' : 'Iniciar'} cronômetro para ${item.dataset.cronometroMateria}`;
                play.title = rotulo;
                play.setAttribute('aria-label', rotulo);
            }
            if (stop) stop.classList.toggle('d-none', !(ativa && estado.estado === 'rodando'));
            if (registrar) registrar.classList.toggle('d-none', !(ativa && estado.estado === 'parado'));
        });
    }

    async function concluirMateria(meta, contexto) {
        const salvarConclusao = () => {
            const progresso = window.EstudoStore.calcularProgressoPlano({
                dados: lerObjeto('dadosExame'), materiaDoDia: lerObjeto('materiaDoDia'),
                distribuicaoMaterias: lerArray('lista_distribuicao_materias'),
                sessoesProjeto: window.EstudoStore.listarSessoes().filter(s => s.projetoId === contexto.projetoId)
            });
            const dia = progresso.dias.find(d => d.dia === contexto.diaJornada);
            const atual = dia?.metasMaterias.find(m => m.chave === meta.chave);
            if (dia?.desbloqueado && atual) concluirMateriaAtual(atual, { ...contexto,
                dataPrevista: dia.dataPrevista, situacaoTemporal: dia.situacaoTemporal });
        };
        if (window.HistoricoRepository) {
            try {
                await window.HistoricoRepository.executarExclusivo(`concluir-estudo:${contexto.projetoId}`, salvarConclusao);
            } catch (_) { document.getElementById('cronometro-status').textContent = 'Não foi possível salvar a conclusão. Tente novamente.'; }
            return;
        }
        salvarConclusao();
    }
    function concluirMateriaAtual(meta, contexto) {
        if (!window.EstudoStore || meta.faltamSegundos <= 0) return;
        window.EstudoStore.registrarSessao({
            projetoId: contexto.projetoId,
            materia: meta.materia,
            projetoMateriaId: meta.projetoMateriaId,
            ...(contexto.situacaoTemporal === 'passado'
                ? window.EstudoStore.contextoDataEstudo(contexto.dataPrevista) : { inicio: new Date() }),
            duracaoSegundos: meta.faltamSegundos,
            origem: 'conclusao-materia',
            tipo: 'estudo',
            diaJornada: contexto.diaJornada
        });
    }

    function pertenceAoProjeto(sessao, projetoId) {
        if (!sessao.projetoId || !sessao.projetoMateriaId) throw new Error('Integridade: sessão sem identidade');
        return sessao.projetoId === projetoId;
    }

    function calcularDiasIdeais(dadosExame) {
        const inicio = dataBrasileira(dadosExame.dataInicioF);
        const fim = dataBrasileira(dadosExame.dataFinalF);
        if (!inicio || !fim) return 0;
        const limite = new Date(Math.min(new Date().setHours(23, 59, 59, 999), fim.getTime()));
        if (limite < inicio) return 0;
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        const selecionados = new Set(dadosExame.listaDiaDaSemana || []);
        let total = 0;
        for (const data = new Date(inicio); data <= limite; data.setDate(data.getDate() + 1)) {
            if (selecionados.has(diasSemana[data.getDay()])) total++;
        }
        return total;
    }

    function formatarPontosCompacto(valor) {
        const pontos = Math.max(0, Number(valor) || 0);
        return pontos >= 10 ? String(Math.round(pontos)) : String(Math.round(pontos * 10) / 10);
    }

    function formatarTempoRestante(segundos) {
        const restantes = Math.max(0, Math.ceil(Number(segundos) || 0));
        if (!restantes) return '0 minutos restantes';
        const minutos = Math.ceil(restantes / 60);
        return `${minutos} ${minutos === 1 ? 'minuto restante' : 'minutos restantes'}`;
    }

    function mostrarJornadaVazia() {
        document.getElementById('jornada-vazia').classList.remove('d-none');
        document.getElementById('painel-progresso').classList.add('d-none');
        document.getElementById('jornada-status').textContent = 'Complete as configurações para gerar os cards.';
    }

    function obterProjetoId(dados) {
        if (!dados.projetoId) throw new Error('Integridade: projetoId obrigatório');
        return dados.projetoId;
    }

    function definirBarra(idBarra, idLabel, percentual) {
        document.getElementById(idBarra).style.width = `${percentual}%`;
        document.getElementById(idLabel).textContent = `${Math.round(percentual)}%`;
    }

    function somarMinutos(sessoes) {
        return sessoes.reduce((total, sessao) => total + Number(sessao.duracaoSegundos || 0) / 60, 0);
    }

    function formatarMinutos(minutos) {
        const total = Math.max(0, Math.floor(minutos));
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }

    function formatarDia(numero) {
        return `Dia ${String(Math.max(1, numero)).padStart(2, '0')}`;
    }

    function numeroDoDia(chave) {
        return Number(String(chave).replace(/\D/g, '')) || 0;
    }

    function limitarPercentual(valor) {
        return Math.min(100, Math.max(0, Number.isFinite(valor) ? valor : 0));
    }

    function mesmaData(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function dataBrasileira(valor) {
        if (typeof valor !== 'string') return null;
        const partes = valor.split('/').map(Number);
        if (partes.length !== 3 || partes.some((parte) => !parte)) return null;
        const data = new Date(partes[2], partes[1] - 1, partes[0]);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    function lerArray(chave) {
        try {
            const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
            return Array.isArray(valor) ? valor : [];
        } catch (erro) {
            return [];
        }
    }

    function lerObjeto(chave) {
        try {
            const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
            return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
        } catch (erro) {
            return null;
        }
    }
})();
