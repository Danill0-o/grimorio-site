(function () {
    let estado = 'ocioso';
    let inicioContagem = 0;
    let inicioSessao = null;
    let tempoDecorridoMs = 0;
    let intervalo = null;
    let elementosAtivos = null;
    let contextoSessao = {};
    let ultimoSegundoEmitido = -1;
    let sessaoId = null;
    let contextoManual = null;
    let registroManualEmCurso = false;
    let registroPraticaEmCurso = false;
    let tentativaManual = null;
    let ultimoEstadoSinalizado = 'ocioso';
    let fimDestaque;
    let pronto = false;
    let liberarAba = null;
    const projetoId = () => window.EstudoStore.obterProjetoAtualId();
    const chaveTimer = () => 'cronometroV1:' + projetoId();
    const rotulo = select => select.selectedOptions[0]?.textContent || '';

    function salvarTimer() {
        if (!pronto || estado === 'ocioso') return;
        if (window.ProjetosStore && !window.ProjetoStorage.getItem('dadosExame')) throw new Error('Projeto removido');
        localStorage.setItem(chaveTimer(), JSON.stringify({ versao: 1, id: sessaoId,
            projetoId: projetoId(), materia: rotulo(elementosAtivos.materia), contexto: contextoSessao,
            inicio: inicioSessao.toISOString(), estado, tempoMs: tempoAtual(), salvoEm: Date.now() }));
    }
    function tempoAtual() {
        if (estado !== 'rodando') return tempoDecorridoMs;
        const delta = performance.now() - inicioContagem;
        // Retrocesso ou ausência prolongada: preservar o último checkpoint, sem inventar estudo.
        if (delta < tempoDecorridoMs || delta - tempoDecorridoMs > 12 * 3600000) {
            estado = 'parado'; window.clearInterval(intervalo); intervalo = null;
            atualizarControles(elementosAtivos);
            definirStatus(elementosAtivos, 'Contagem pausada por alteração de relógio ou ausência prolongada. Confira o tempo antes de continuar.');
            return tempoDecorridoMs;
        }
        tempoDecorridoMs = delta;
        return delta;
    }
    function falhaPersistencia() {
        pronto = false;
        if (estado === 'rodando') { tempoDecorridoMs = Math.max(tempoDecorridoMs, performance.now()-inicioContagem); estado = 'parado'; }
        window.clearInterval(intervalo); intervalo = null;
        atualizarControles(elementosAtivos);
        definirStatus(elementosAtivos, 'Não foi possível salvar o cronômetro. Os dados anteriores foram preservados. Libere armazenamento e recarregue para recuperar.', true);
    }
    async function assumirAba() {
        pronto = false;
        reiniciarEstado();
        atualizarDisplay(elementosAtivos);
        atualizarControles(elementosAtivos);
        if (!navigator.locks) {
            definirStatus(elementosAtivos, 'Este navegador precisa oferecer Web Locks para recuperar o cronômetro com segurança. Use localhost ou HTTPS.', true);
            return;
        }
        await navigator.locks.request('cronometro:' + projetoId(), { ifAvailable: true }, async lock => {
            if (!lock) { definirStatus(elementosAtivos, 'Cronômetro aberto em outra aba deste projeto. Feche essa aba e recarregue aqui.', true); return; }
            try {
                window.ProjetosStore?.validarAtual?.();
                window.EstudoStore.listarSessoes(); // recupera registro interrompido antes de ler o rascunho
                let raw = localStorage.getItem(chaveTimer());
                if (raw && JSON.parse(raw).contexto?.tipo !== 'pratica' && window.HistoricoRepository?.possuiRegistro(JSON.parse(raw).id)) {
                    localStorage.removeItem(chaveTimer()); raw = null;
                }
                if (raw && JSON.parse(raw).contexto?.tipo === 'pratica') {
                    const r = JSON.parse(raw), fatos = window.PraticasStore.obterEstado(projetoId());
                    if (r.versao !== 1 || r.projetoId !== projetoId() || r.contexto.projetoId !== r.projetoId
                        || Object.keys(r.contexto).some(k => !['tipo','projetoId','atividadeId','missaoId'].includes(k))
                        || !Number.isFinite(r.tempoMs) || r.tempoMs < 0 || !['rodando','parado'].includes(r.estado)
                        || !Number.isFinite(Date.parse(r.inicio)) || new Date(r.inicio).toISOString() !== r.inicio) throw new Error('Checkpoint prático inválido');
                    const gravada = fatos.sessoes[r.id];
                    if (gravada) {
                        if (gravada.missaoId !== r.contexto.missaoId || gravada.atividadeId !== r.contexto.atividadeId
                            || gravada.inicio !== r.inicio || gravada.duracaoSegundos !== Math.floor(r.tempoMs / 1000)
                            || gravada.origem !== 'cronometro') throw new Error('Checkpoint divergente do registro de prática');
                        localStorage.removeItem(chaveTimer()); raw = null; // inclusive tombstone: não ressuscitar
                    }
                }
                if (raw) {
                    const r = JSON.parse(raw);
                    if (r.versao !== 1 || typeof r.id !== 'string' || !r.id || r.projetoId !== projetoId()
                        || typeof r.materia !== 'string' || !r.materia.trim() || !r.contexto
                        || r.contexto.projetoId !== r.projetoId
                        || !['rodando','parado'].includes(r.estado) || !Number.isFinite(r.tempoMs) || r.tempoMs < 0
                        || !Number.isFinite(new Date(r.inicio).getTime())) throw new Error('Cronômetro inválido');
                    sessaoId = r.id; contextoSessao = r.contexto; inicioSessao = new Date(r.inicio);
                    tempoDecorridoMs = r.tempoMs; estado = 'parado';
                    if (r.contexto.tipo === 'pratica') {
                        const e = window.PraticasExecucao.consultar(r.contexto.missaoId);
                        if (e.missao.atividadeId !== r.contexto.atividadeId || !e.missao.usaCronometro || r.contexto.projetoMateriaId) throw new Error('Contexto de prática inválido');
                        selecionarPratica(e.missao);
                    } else {
                        window.MateriasStore.obterProjetoMateria(r.contexto.projetoMateriaId, r.projetoId);
                        if (![...elementosAtivos.materia.options].some(o => o.value === r.contexto.projetoMateriaId)) {
                            const option = document.createElement('option'); option.value = r.contexto.projetoMateriaId; option.textContent = r.materia;
                            elementosAtivos.materia.appendChild(option);
                        }
                        elementosAtivos.materia.value = r.contexto.projetoMateriaId;
                    }
                    definirStatus(elementosAtivos, 'Sessão recuperada e pausada. O período fora da página não foi somado. Continue, registre ou zere.');
                }
                pronto = true; salvarTimer(); atualizarDisplay(elementosAtivos); atualizarControles(elementosAtivos); emitirEstado();
                await new Promise(resolve => { liberarAba = resolve; });
            } catch (erro) { falhaPersistencia(); }
        }).catch(() => falhaPersistencia());
    }


    document.addEventListener('DOMContentLoaded', iniciarCronometro);

    function iniciarCronometro() {
        const elementos = obterElementos();
        if (!elementos.display || !window.EstudoStore) return;
        elementosAtivos = elementos;

        atualizarMaterias(elementos);
        renderizarTabelas(elementos);
        atualizarControles(elementos);
        assumirAba();

        elementos.iniciar.addEventListener('click', () => estado === 'parado' ? continuar() : iniciarMateria(elementos.materia.value));
        elementos.parar.addEventListener('click', () => estado === 'parado' ? zerar() : parar());
        elementos.registrar.addEventListener('click', registrarAtual);
        if (elementos.formManual) elementos.formManual.addEventListener('submit', registrarManual);
        if (elementos.dataManual) {
            elementos.dataManual.max = window.CalendarioJornada.dataLocal();
            const soltarContextoManual = () => {
                if (contextoManual && (elementos.materiaManual.value !== contextoManual.projetoMateriaId
                    || elementos.dataManual.value !== contextoManual.dataEstudo)) contextoManual = null;
            };
            elementos.materiaManual.addEventListener('change', soltarContextoManual);
            elementos.dataManual.addEventListener('input', soltarContextoManual);
            elementos.dataManual.addEventListener('change', soltarContextoManual);
            elementos.formManual.addEventListener('reset', () => { contextoManual = null; });
            const atualizarLimite = () => { elementos.dataManual.max = window.CalendarioJornada.dataLocal(); };
            elementos.dataManual.addEventListener('focus', atualizarLimite);
            window.addEventListener('focus', atualizarLimite);
            document.addEventListener('visibilitychange', atualizarLimite);
        }

        window.addEventListener('pagehide', () => {
            try { if (pronto) salvarTimer(); } catch (erro) { falhaPersistencia(); }
            pronto = false; window.clearInterval(intervalo); intervalo = null;
            if (liberarAba) liberarAba();
        });
        window.addEventListener('pageshow', event => { if (event.persisted) assumirAba(); });
        document.addEventListener('visibilitychange', () => { if (pronto) { try { salvarTimer(); } catch (erro) { falhaPersistencia(); } } });
        window.addEventListener('estudo:registrado', () => renderizarTabelas(elementos));
        window.addEventListener('estudo:excluido', () => renderizarTabelas(elementos));
        window.addEventListener('storage', function (event) {
            if (window.HistoricoRepository?.ehChave(event.key) || ['sessoesEstudo', 'materiasDominioV1'].includes(event.key)) renderizarTabelas(elementos);
            if (event.key === 'objetosSalvos') atualizarMaterias(elementos);
        });
    }

    function iniciarMateria(projetoMateriaId, opcoes = {}) {
        const elementos = elementosAtivos;
        if (!elementos || !pronto) return false;
        if (registroPraticaEmCurso || contextoSessao.tipo === 'pratica') {
            definirStatus(elementos, 'Registre ou zere a sessão prática antes de iniciar outra sessão.', true);
            return false;
        }
        if (!projetoMateriaId) {
            definirStatus(elementos, 'Selecione uma matéria antes de iniciar.', true);
            elementos.materia.focus();
            return false;
        }

        const p = window.MateriasStore.obterProjetoMateria(projetoMateriaId, projetoId());
        const novaMateria = p.nomeExibicao ?? window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).nomeCanonico;
        opcoes = { ...opcoes, ...window.IdentidadeStore.vinculosSessao({ ...opcoes, projetoMateriaId, projetoId: projetoId() }) };
        // A sessão já iniciada conserva continuação/recuperação mesmo após a virada de data.
        if (estado !== 'ocioso' && elementos.materia.value === projetoMateriaId && contextosIguais(contextoSessao, opcoes)) {
            return estado === 'parado' ? continuar() : false;
        }
        if (!novoInicioPermitido(opcoes)) {
            definirStatus(elementos, opcoes.tipo === 'revisao'
                ? 'Esta revisão ainda não está disponível para estudar.'
                : 'O cronômetro do card só pode iniciar estudo de hoje. Para um dia passado, registre o tempo manualmente.', true);
            return false;
        }
        if (estado !== 'ocioso') {
            const iniciarNova = window.confirm(
                `Há uma sessão de ${rotulo(elementos.materia)} em andamento.\n\n` +
                `Deseja registrar esse tempo e iniciar ${novaMateria}?\n` +
                'Escolha “Cancelar” para apenas registrar o tempo atual e zerar o cronômetro.'
            );
            if (estado === 'rodando') parar();
            if (!registrarAtual()) return false;
            if (!iniciarNova) return false;
        }

        if (!Array.from(elementos.materia.options).some((option) => option.value === projetoMateriaId)) return false;
        elementos.materia.value = projetoMateriaId;
        contextoSessao = { ...opcoes, projetoId: projetoId() };
        sessaoId = crypto.randomUUID();
        estado = 'rodando';
        inicioSessao = new Date();
        inicioContagem = performance.now();
        tempoDecorridoMs = 0;
        intervalo = window.setInterval(() => atualizarDisplay(elementos), 250);
        atualizarDisplay(elementos);
        if (!pronto) return false;
        atualizarControles(elementos);
        definirStatus(elementos, `Estudando ${novaMateria}.`);
        emitirEstado();
        return true;
    }

    function selecionarPratica(missao) {
        elementosAtivos.materia.querySelectorAll('option[data-pratica]').forEach(o => o.remove());
        const option = document.createElement('option');
        option.value = `pratica:${missao.missaoId}`; option.dataset.pratica = 'true';
        option.textContent = `Atividade prática · ${missao.nome}`;
        elementosAtivos.materia.append(option); elementosAtivos.materia.value = option.value;
    }
    async function iniciarPratica(missaoId) {
        if (!elementosAtivos || !pronto || registroPraticaEmCurso) return false;
        if (estado !== 'ocioso') {
            if (contextoSessao.tipo === 'pratica' && contextoSessao.missaoId === missaoId) return estado === 'parado' ? continuar() : false;
            definirStatus(elementosAtivos, 'Registre ou zere a sessão atual antes de iniciar outra sessão.', true);
            return false;
        }
        registroPraticaEmCurso = true; atualizarControles(elementosAtivos);
        try {
            const { missao } = await window.PraticasExecucao.preparar(missaoId);
            if (!missao.usaCronometro) throw new Error('TAF permite somente registro posterior de tempo.');
            selecionarPratica(missao);
            contextoSessao = { tipo: 'pratica', projetoId: projetoId(), atividadeId: missao.atividadeId, missaoId };
            sessaoId = crypto.randomUUID(); inicioSessao = new Date();
            tempoDecorridoMs = 0; inicioContagem = performance.now(); estado = 'rodando';
            intervalo = window.setInterval(() => atualizarDisplay(elementosAtivos), 250);
            atualizarDisplay(elementosAtivos); definirStatus(elementosAtivos, `Realizando ${missao.nome}. O tempo não conclui a atividade prática.`);
            return pronto;
        } catch (erro) { definirStatus(elementosAtivos, erro.message, true); return false; }
        finally { registroPraticaEmCurso = false; atualizarControles(elementosAtivos); emitirEstado(); }
    }

    function novoInicioPermitido(opcoes) {
        if (!opcoes.diaJornada && !opcoes.revisaoId) return true;
        const calendario = window.CalendarioJornada;
        if (!calendario?.projetarAcesso || !calendario?.dataLocal) return false;
        if (opcoes.tipo === 'revisao') {
            const revisao = window.RevisoesStore?.listar().find(r => r.id === opcoes.revisaoId);
            return Boolean(revisao && revisao.projetoId === opcoes.projetoId
                && revisao.projetoMateriaId === opcoes.projetoMateriaId
                && revisao.dataPrevista && calendario.somarDias(revisao.dataPrevista, 0) === revisao.dataPrevista
                && revisao.dataPrevista <= calendario.dataLocal());
        }
        const plano = lerJson('materiaDoDia', {});
        const dias = Object.keys(plano).sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
            .map(dia => ({ dia }));
        const acesso = calendario.projetarAcesso(lerJson('dadosExame', {}), dias)
            .find(dia => dia.dia === opcoes.diaJornada);
        return Boolean(acesso?.podeIniciar);
    }

    function abrirRegistroManual(projetoMateriaId, opcoes = {}) {
        const elementos = elementosAtivos;
        if (!elementos?.formManual || !elementos.dataManual || !projetoMateriaId) return false;
        try {
            window.MateriasStore.obterProjetoMateria(projetoMateriaId, projetoId());
            const dataEstudo = opcoes.dataEstudo || '';
            if (dataEstudo) window.EstudoStore.contextoDataEstudo(dataEstudo);
            if (opcoes.diaJornada) {
                const plano = lerJson('materiaDoDia', {});
                const dias = Object.keys(plano).sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
                    .map(dia => ({ dia }));
                const acesso = window.CalendarioJornada.projetarAcesso(lerJson('dadosExame', {}), dias)
                    .find(dia => dia.dia === opcoes.diaJornada);
                const blocos = plano[opcoes.diaJornada] || [];
                const extra = opcoes.blocoExtraId ? window.EstudoExtra.obter(opcoes.blocoExtraId, projetoId()) : null;
                const origemValida = extra ? extra.projetoMateriaId === projetoMateriaId
                    && extra.diaJornada === opcoes.diaJornada && extra.dataOrigem === dataEstudo
                    : blocos.some(b => b.projetoMateriaId === projetoMateriaId && (!opcoes.blocoId || b.blocoId === opcoes.blocoId));
                if (!acesso?.desbloqueado || acesso.dataPrevista !== dataEstudo || !origemValida) throw new Error('Contexto do estudo inválido');
            }
            if (!Array.from(elementos.materiaManual.options).some(o => o.value === projetoMateriaId)) return false;
            elementos.materiaManual.value = projetoMateriaId;
            elementos.dataManual.max = window.CalendarioJornada.dataLocal();
            elementos.dataManual.value = dataEstudo;
            contextoManual = opcoes.diaJornada && dataEstudo
                ? { projetoMateriaId, dataEstudo, diaJornada: opcoes.diaJornada, blocoId: opcoes.blocoId,
                    ...(opcoes.blocoExtraId ? { blocoExtraId: opcoes.blocoExtraId } : {}) } : null;
            elementos.formManual.closest('details').open = true;
            definirStatusManual(elementos, dataEstudo
                ? `Registre o estudo realizado em ${dataEstudo.split('-').reverse().join('/')}.` : 'Informe o tempo estudado.');
            elementos.minutosManual.focus();
            elementos.formManual.scrollIntoView({ block: 'nearest', behavior: 'instant' });
            return true;
        } catch (_) {
            definirStatusManual(elementos, 'Não foi possível abrir o registro deste dia. Confira a matéria e a data.', true);
            return false;
        }
    }

    function parar() {
        const elementos = elementosAtivos;
        if (!elementos || !pronto || registroPraticaEmCurso || estado !== 'rodando') return false;
        tempoDecorridoMs = tempoAtual();
        window.clearInterval(intervalo);
        intervalo = null;
        estado = 'parado';
        atualizarDisplay(elementos);
        if (!pronto) return false;
        atualizarControles(elementos);
        definirStatus(elementos, 'Cronômetro pausado. Continue, registre o tempo ou zere a sessão.');
        emitirEstado('pausar');
        return true;
    }

    function continuar() {
        if (!elementosAtivos || !pronto || registroPraticaEmCurso || estado !== 'parado') return false;
        // Deslocar a origem mantém o acumulado e exclui todo o período pausado.
        inicioContagem = performance.now() - tempoDecorridoMs;
        estado = 'rodando';
        intervalo = window.setInterval(() => atualizarDisplay(elementosAtivos), 250);
        atualizarDisplay(elementosAtivos);
        if (!pronto) return false;
        atualizarControles(elementosAtivos);
        definirStatus(elementosAtivos, `Estudando ${rotulo(elementosAtivos.materia)}.`);
        emitirEstado();
        return true;
    }

    function zerar() {
        if (!elementosAtivos || !pronto || registroPraticaEmCurso || estado !== 'parado') return false;
        if (!window.confirm('Zerar o cronômetro? O tempo desta sessão será descartado sem registrar progresso.')) return false;
        try { localStorage.removeItem(chaveTimer()); } catch (erro) { falhaPersistencia(); return false; }
        reiniciarEstado();
        atualizarDisplay(elementosAtivos);
        atualizarControles(elementosAtivos);
        definirStatus(elementosAtivos, 'Cronômetro zerado. Nenhum tempo foi registrado.');
        emitirEstado();
        return true;
    }

    function registrarAtual() {
        const elementos = elementosAtivos;
        if (!elementos || !pronto || estado !== 'parado' || !elementos.materia.value) return false;
        if (registroPraticaEmCurso) return false;
        if (contextoSessao.tipo === 'pratica') return registrarPraticaAtual();
        const materiaRegistrada = rotulo(elementos.materia);
        const duracaoSegundos = Math.max(1, Math.round(tempoDecorridoMs / 1000));
        try {
            salvarTimer();
            window.EstudoStore.registrarCronometro({
            id: sessaoId,
            materia: materiaRegistrada,
            projetoId: contextoSessao.projetoId,
            projetoMateriaId: contextoSessao.projetoMateriaId,
            blocoId: contextoSessao.blocoId,
            blocoExtraId: contextoSessao.blocoExtraId,
            revisaoId: contextoSessao.revisaoId,
            inicio: inicioSessao,
            duracaoSegundos,
            origem: contextoSessao.origem || 'cronometro',
            tipo: contextoSessao.tipo || 'estudo',
            diaJornada: contextoSessao.diaJornada,
            referenciaDia: contextoSessao.referenciaDia
        }); } catch (erro) { falhaPersistencia(); return false; }
        reiniciarEstado();
        atualizarDisplay(elementos);
        atualizarControles(elementos);
        definirStatus(elementos, `${formatarPontos(duracaoSegundos / 60)} registrados em ${materiaRegistrada}.`);
        emitirEstado();
        return true;
    }

    async function registrarPraticaAtual() {
        const duracaoSegundos = Math.floor(tempoDecorridoMs / 1000);
        if (duracaoSegundos <= 0) { definirStatus(elementosAtivos, 'Registre pelo menos um segundo de prática.', true); return false; }
        registroPraticaEmCurso = true; atualizarControles(elementosAtivos);
        let gravado = false;
        try {
            salvarTimer(); // checkpoint pausado antes do commit; ID e payload estáveis no retry/recovery
            await window.PraticasExecucao.registrarCronometro(contextoSessao.missaoId, {
                sessaoId, inicio: inicioSessao.toISOString(), duracaoSegundos
            });
            gravado = true;
            localStorage.removeItem(chaveTimer());
            reiniciarEstado(); atualizarDisplay(elementosAtivos);
            definirStatus(elementosAtivos, 'Tempo da prática registrado. Conclua a atividade prática quando a realizar.');
            return true;
        } catch (erro) {
            if (gravado) pronto = false;
            definirStatus(elementosAtivos, gravado ? 'Tempo salvo. Recarregue para finalizar a recuperação do cronômetro.'
                : `Não foi possível finalizar o registro. A sessão foi preservada para tentar novamente. ${erro.message}`, true);
            return false;
        } finally { registroPraticaEmCurso = false; atualizarControles(elementosAtivos); emitirEstado(); }
    }

    async function registrarManual(event) {
        event.preventDefault();
        if (registroManualEmCurso) return;
        const elementos = elementosAtivos;
        const projetoMateriaId = elementos.materiaManual.value;
        const materia = rotulo(elementos.materiaManual);
        const horas = Math.max(0, Number(elementos.horasManual.value) || 0);
        const minutos = Math.max(0, Number(elementos.minutosManual.value) || 0);
        const totalMinutos = horas * 60 + minutos;
        if (!projetoMateriaId || totalMinutos <= 0) {
            definirStatusManual(elementos, 'Escolha a matéria e informe um tempo maior que zero.', true);
            return;
        }

        const dataEstudo = elementos.dataManual?.value || '';
        if (dataEstudo && dataEstudo > window.CalendarioJornada.dataLocal()) {
            definirStatusManual(elementos, 'A data do estudo não pode estar no futuro.', true);
            return;
        }
        const contextual = contextoManual && contextoManual.projetoMateriaId === projetoMateriaId
            && contextoManual.dataEstudo === dataEstudo ? contextoManual : null;
        const anotacao = elementos.anotacaoManual?.value.trim().slice(0, 140) || '';
        const plano = lerJson('materiaDoDia', {});
        const dataAlvo = dataEstudo || window.CalendarioJornada.dataLocal();
        const diaAlvo = window.CalendarioJornada.mapear(lerJson('dadosExame', {}), Object.keys(plano).length).porData[dataAlvo];
        const materiaNoDia = (plano[diaAlvo] || []).some(b => b.projetoMateriaId === projetoMateriaId);
        const materiaNoProjeto = Object.values(plano).flat().some(b => b.projetoMateriaId === projetoMateriaId);
        const automatico = !contextual && diaAlvo && !materiaNoDia && materiaNoProjeto;
        const assinatura = JSON.stringify([projetoId(), projetoMateriaId, dataEstudo, totalMinutos, anotacao, contextual]);
        if (!tentativaManual || tentativaManual.assinatura !== assinatura) tentativaManual = { assinatura, id:crypto.randomUUID() };
        registroManualEmCurso = true;
        const enviar = elementos.formManual.querySelector('button[type="submit"]');
        enviar.disabled = true;
        try {
            const dados = {
            id: tentativaManual.id,
            materia,
            projetoMateriaId,
            projetoId: projetoId(),
            ...(dataEstudo ? window.EstudoStore.contextoDataEstudo(dataEstudo) : { inicio: new Date() }),
            ...(contextual ? { diaJornada: contextual.diaJornada, blocoId: contextual.blocoId,
                ...(contextual.blocoExtraId ? { blocoExtraId: contextual.blocoExtraId } : {}) } : automatico ? {diaJornada:diaAlvo} : {}),
            duracaoSegundos: Math.round(totalMinutos * 60),
            origem: 'manual', tipo: 'estudo',
            ...(anotacao ? {anotacao} : {})
            };
            // Conservar instante/ID entre tentativas, inclusive quando o tempo já foi gravado.
            tentativaManual.dados ||= dados;
            if (automatico) await window.EstudoExtra.registrarManual(tentativaManual.dados);
            else window.EstudoStore.registrarSessao(tentativaManual.dados);
        } catch (_) { definirStatusManual(elementos, 'Não foi possível salvar. Os campos foram preservados; confira o armazenamento e tente novamente.', true); return; }
        finally { registroManualEmCurso = false; enviar.disabled = false; }
        tentativaManual = null;
        elementos.formManual.reset();
        definirStatusManual(elementos, `${formatarPontos(totalMinutos)} adicionados em ${materia}.`);
    }

    function obterElementos() {
        return {
            materia: document.getElementById('cronometro-materia'),
            display: document.getElementById('cronometro-display'),
            iniciar: document.getElementById('cronometro-iniciar'),
            parar: document.getElementById('cronometro-parar'),
            registrar: document.getElementById('cronometro-registrar'),
            status: document.getElementById('cronometro-status'),
            sessoesBody: document.getElementById('sessoes-estudo-body'),
            formManual: document.getElementById('registro-manual-form'),
            materiaManual: document.getElementById('registro-manual-materia'),
            horasManual: document.getElementById('registro-manual-horas'),
            minutosManual: document.getElementById('registro-manual-minutos'),
            dataManual: document.getElementById('registro-manual-data'),
            anotacaoManual: document.getElementById('registro-manual-anotacao'),
            statusManual: document.getElementById('registro-manual-status')
        };
    }

    function atualizarMaterias(elementos) {
        const selecaoAtual = elementos.materia.value;
        const objetos = window.MateriasStore.listarProjetosMaterias(projetoId()).filter(p => !p.removida).map(p => ({
            projetoMateriaId: p.projetoMateriaId,
            Materia: p.nomeExibicao ?? window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).nomeCanonico
        }));
        const materias = objetos.map(objeto => {
            window.MateriasStore.obterProjetoMateria(objeto.projetoMateriaId, projetoId());
            return { id: objeto.projetoMateriaId, nome: objeto.Materia };
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        preencherSelect(elementos.materia, materias, 'Selecione uma matéria', selecaoAtual);
        if (contextoSessao.tipo === 'pratica') selecionarPratica(window.PraticasExecucao.consultar(contextoSessao.missaoId).missao);
        if (elementos.materiaManual) preencherSelect(elementos.materiaManual, materias, 'Selecione uma matéria');
        atualizarControles(elementos);
    }

    function preencherSelect(select, materias, placeholderTexto, selecaoAtual = '') {
        select.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = materias.length ? placeholderTexto : 'Cadastre uma matéria primeiro';
        select.appendChild(placeholder);
        materias.forEach((materia) => {
            const option = document.createElement('option');
            option.value = materia.id;
            option.textContent = materia.nome;
            select.appendChild(option);
        });
        if (materias.some(m => m.id === selecaoAtual)) select.value = selecaoAtual;
    }

    function atualizarControles(elementos) {
        const semMaterias = elementos.materia.options.length <= 1;
        elementos.materia.disabled = !pronto || registroPraticaEmCurso || estado !== 'ocioso' || semMaterias;
        elementos.iniciar.disabled = !pronto || registroPraticaEmCurso || estado === 'rodando' || semMaterias;
        elementos.iniciar.textContent = estado === 'parado' ? 'Continuar' : 'Iniciar';
        elementos.parar.disabled = !pronto || registroPraticaEmCurso || estado === 'ocioso';
        elementos.parar.textContent = estado === 'parado' ? 'Zerar' : 'Pausa';
        elementos.registrar.disabled = !pronto || registroPraticaEmCurso || estado !== 'parado';
    }

    function atualizarDisplay(elementos) {
        const milissegundos = tempoAtual();
        if (pronto && estado !== 'ocioso') { try { salvarTimer(); } catch (erro) { falhaPersistencia(); } }
        const segundos = Math.floor(milissegundos / 1000);
        elementos.display.textContent = formatarDuracao(segundos);
        if (estado === 'rodando' && segundos !== ultimoSegundoEmitido) {
            ultimoSegundoEmitido = segundos;
            emitirEstado();
        }
    }

    function renderizarTabelas() { window.HistoricoJornada?.atualizar(); }

    function adicionarLinhaVazia(tbody, colunas, mensagem) {
        const linha = document.createElement('tr');
        const celula = document.createElement('td');
        celula.colSpan = colunas;
        celula.className = 'text-center text-secondary py-3';
        celula.textContent = mensagem;
        linha.appendChild(celula);
        tbody.appendChild(linha);
    }

    function excluirSessao(sessao) {
        const pontos = formatarPontos(Number(sessao.duracaoSegundos || 0) / 60);
        const confirmado = window.confirm(
            `Excluir este registro de ${sessao.materia} (${pontos})?\n\n` +
            'O conhecimento, o nível e o progresso correspondentes serão recalculados.'
        );
        if (!confirmado) return;
        window.EstudoStore.excluirSessao(sessao.id);
        const destino = document.querySelector('.historico-expandir') || document.getElementById('cronometro-materia');
        destino?.focus();
    }

    function emitirEstado(acao) {
        if (pronto) { try { salvarTimer(); } catch (erro) { falhaPersistencia(); } }
        if (estado === 'rodando' && ultimoEstadoSinalizado !== 'rodando') {
            const visor = document.getElementById('cronometro-display');
            if (visor) {
                clearTimeout(fimDestaque);
                visor.classList.add('cronometro-em-destaque');
                fimDestaque = setTimeout(() => visor.classList.remove('cronometro-em-destaque'), 1600);
            }
        }
        ultimoEstadoSinalizado = estado;
        window.dispatchEvent(new CustomEvent('cronometro:estado', { detail: { ...obterEstado(), acao } }));
    }

    function obterEstado() {
        const duracaoSegundos = Math.floor(tempoAtual() / 1000);
        return {
            estado,
            sessaoId,
            pronto,
            materia: elementosAtivos ? rotulo(elementosAtivos.materia) : '',
            projetoMateriaId: contextoSessao.projetoMateriaId || '',
            missaoId: contextoSessao.missaoId || '',
            atividadeId: contextoSessao.atividadeId || '',
            registrando: registroPraticaEmCurso,
            duracaoSegundos,
            tipo: contextoSessao.tipo || 'estudo',
            diaJornada: contextoSessao.diaJornada || '',
            referenciaDia: contextoSessao.referenciaDia || '',
            revisaoId: contextoSessao.revisaoId || '',
            blocoExtraId: contextoSessao.blocoExtraId || ''
        };
    }

    function reiniciarEstado() {
        elementosAtivos?.materia.querySelectorAll('option[data-pratica]').forEach(o => o.remove());
        estado = 'ocioso';
        sessaoId = null;
        inicioContagem = 0;
        inicioSessao = null;
        tempoDecorridoMs = 0;
        if (intervalo) window.clearInterval(intervalo);
        intervalo = null;
        contextoSessao = {};
        ultimoSegundoEmitido = -1;
    }

    function definirStatus(elementos, mensagem, erro) {
        elementos.status.textContent = mensagem;
        elementos.status.classList.toggle('text-danger', Boolean(erro));
        elementos.status.classList.toggle('text-success', !erro && mensagem.includes('registrad'));
    }

    function definirStatusManual(elementos, mensagem, erro) {
        if (!elementos.statusManual) return;
        elementos.statusManual.textContent = mensagem;
        elementos.statusManual.classList.toggle('text-danger', Boolean(erro));
        elementos.statusManual.classList.toggle('text-success', !erro);
    }

    function formatarDuracao(totalSegundos) {
        const segundosSeguros = Math.max(0, Math.floor(Number(totalSegundos) || 0));
        const horas = Math.floor(segundosSeguros / 3600);
        const minutos = Math.floor((segundosSeguros % 3600) / 60);
        const segundos = segundosSeguros % 60;
        return [horas, minutos, segundos].map((valor) => String(valor).padStart(2, '0')).join(':');
    }

    function formatarPontos(valor) {
        const pontos = Math.max(0, Number(valor) || 0);
        const formatado = pontos >= 10 ? Math.round(pontos) : Math.round(pontos * 10) / 10;
        return `${formatado} ${formatado === 1 ? 'ponto de conhecimento' : 'pontos de conhecimento'}`;
    }

    function formatarMinutosResumo(totalSegundos) {
        const segundos = Math.max(0, Math.round(Number(totalSegundos) || 0));
        if (segundos > 0 && segundos < 60) return 'menos de 1 minuto';
        const minutos = Math.round(segundos / 60);
        return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
    }

    function contextosIguais(atual, novo) {
        return (atual.tipo || 'estudo') === (novo.tipo || 'estudo')
            && (atual.projetoId || '') === (novo.projetoId || '')
            && (atual.revisaoId || '') === (novo.revisaoId || '')
            && (atual.projetoMateriaId || '') === (novo.projetoMateriaId || '')
            && (atual.blocoId || '') === (novo.blocoId || '')
            && (atual.blocoExtraId || '') === (novo.blocoExtraId || '')
            && String(atual.diaJornada || '') === String(novo.diaJornada || '')
            && String(atual.referenciaDia || '') === String(novo.referenciaDia || '');
    }

    function lerJson(chave, valorPadrao) {
        try {
            const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
            return valor === null ? valorPadrao : valor;
        } catch (erro) {
            return valorPadrao;
        }
    }

    window.CronometroEstudos = { iniciarMateria, iniciarPratica, parar, continuar, zerar, registrarAtual, obterEstado, abrirRegistroManual };
})();
