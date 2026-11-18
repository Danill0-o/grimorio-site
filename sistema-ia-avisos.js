/* Motor global de avisos não bloqueantes, sineta de histórico, falas contextuais e combos de teclado (Etapa 3). */
(function (escopo) {
    'use strict';

    const CHAVE_FALA_SESSAO = 'grimorioSistemaIaFalaSessaoV1';
    const CHAVE_HIST_SESSAO = 'grimorioSistemaIaHistoricoSessaoV1';
    const KONAMI_SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let efeitoHadouken = null;
    let timerHadouken = null;

    let dockEl = null;
    let sinetaBtn = null;
    let sinetaBadge = null;
    let toastEl = null;
    let toastTagEl = null;
    let toastFecharBtn = null;
    let toastTituloEl = null;
    let toastMensagemEl = null;
    let toastRodapeEl = null;
    let dialogEl = null;
    let abasAvisos = [];
    let dialogFecharBtn = null;
    let dialogLimparBtn = null;

    let avisoExibidoId = null;
    let avisoExibidoEmMs = 0;
    let timerAutoHide = null;
    let restanteToastMs = 0;
    let fimToastMs = 0;
    let audioConquista = null;
    let timerTravaPulador = null;
    let travaPuladorAtiva = false;
    const avisosApresentados = new Set();
    const travasPuladorAplicadas = new Set();

    function ehCampoDigitacao(alvo) {
        if (!alvo || typeof alvo !== 'object') return false;
        const tag = String(alvo.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (alvo.isContentEditable) return true;
        if (typeof alvo.closest === 'function' && alvo.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return true;
        return false;
    }

    function cronometroRodando() {
        try {
            const est = escopo.CronometroEstudos?.obterEstado?.();
            return Boolean(est && est.estado && est.estado !== 'ocioso');
        } catch (_) {
            return false;
        }
    }

    function existeModalOuPopoverAberto() {
        try {
            if (document.querySelector('dialog[open]')) return true;
            if (document.querySelector('[popover]:popover-open')) return true;
        } catch (_) {}
        return false;
    }

    function lerFalaSessao() {
        try {
            const raw = escopo.sessionStorage?.getItem(CHAVE_FALA_SESSAO);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function salvarFalaSessao(dados) {
        try {
            if (!dados) escopo.sessionStorage?.removeItem(CHAVE_FALA_SESSAO);
            else escopo.sessionStorage?.setItem(CHAVE_FALA_SESSAO, JSON.stringify(dados));
        } catch (_) {}
    }

    function lerHistoricoSessao() {
        try {
            const raw = escopo.sessionStorage?.getItem(CHAVE_HIST_SESSAO);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function registrarHistoricoSessao(item) {
        try {
            const atual = lerHistoricoSessao().filter(x => x && x.id !== item.id);
            atual.unshift(item);
            escopo.sessionStorage?.setItem(CHAVE_HIST_SESSAO, JSON.stringify(atual.slice(0, 10)));
        } catch (_) {}
    }

    function obterAvisosPendentes() {
        const estado = escopo.SistemaIaStore?.ler?.() || { filaAvisos: [], historicoAvisos: [] };
        const filaStore = Array.isArray(estado.filaAvisos) ? estado.filaAvisos : [];
        const falaSessao = lerFalaSessao();
        const incluirFala = falaSessao && !falaSessao.dispensado && !cronometroRodando();
        return incluirFala ? [...filaStore, falaSessao] : [...filaStore];
    }

    function obterProximoParaToast() {
        const pendentes = obterAvisosPendentes();
        return pendentes.find(item => item.id === avisoExibidoId)
            || pendentes.find(item => !item.exibido && !avisosApresentados.has(item.id)) || null;
    }

    function prepararAudioConquista() {
        try {
            const Contexto = escopo.AudioContext || escopo.webkitAudioContext;
            if (!Contexto || !escopo.navigator.userActivation?.isActive) return;
            audioConquista ||= new Contexto();
            if (audioConquista.state === 'suspended') audioConquista.resume().catch(() => {});
        } catch (_) { /* O card continua disponível sem áudio. */ }
    }

    function tocarSomConquista() {
        try {
            const Contexto = escopo.AudioContext || escopo.webkitAudioContext;
            if (!Contexto || (!audioConquista && !escopo.navigator.userActivation?.hasBeenActive)) return;
            audioConquista ||= new Contexto();
            const audio = audioConquista;
            const tocar = () => {
                if (audio.state !== 'running') return;
                [523.25, 783.99].forEach((frequencia, ordem) => {
                    const inicio = audio.currentTime + ordem * 0.095;
                    const nota = audio.createOscillator();
                    const volume = audio.createGain();
                    nota.frequency.value = frequencia;
                    volume.gain.setValueAtTime(0, inicio);
                    volume.gain.linearRampToValueAtTime(0.095, inicio + 0.02);
                    volume.gain.linearRampToValueAtTime(0, inicio + 0.16);
                    nota.connect(volume).connect(audio.destination);
                    nota.onended = () => { nota.disconnect(); volume.disconnect(); };
                    nota.start(inicio);
                    nota.stop(inicio + 0.16);
                });
            };
            if (audio.state === 'suspended' && escopo.navigator.userActivation?.isActive) audio.resume().then(tocar).catch(() => {});
            else tocar();
        } catch (_) { /* O card continua disponível sem áudio. */ }
    }

    function retomarTempoToast() {
        if (!avisoExibidoId || timerAutoHide || toastEl.matches(':hover')) return;
        fimToastMs = performance.now() + restanteToastMs;
        timerAutoHide = setTimeout(() => {
            timerAutoHide = null;
            avisoExibidoId = null;
            sincronizarDom();
        }, restanteToastMs);
    }

    function limparTimersToast() {
        if (timerAutoHide) {
            clearTimeout(timerAutoHide);
            timerAutoHide = null;
        }
        if (timerTravaPulador) {
            clearTimeout(timerTravaPulador);
            timerTravaPulador = null;
        }
        travaPuladorAtiva = false;
        if (toastFecharBtn) toastFecharBtn.disabled = false;
    }

    function sincronizarDialogoHistorico() {
        if (!dialogEl) return;
        const estado = escopo.SistemaIaStore?.ler?.() || { filaAvisos: [], historicoAvisos: [] };
        const pendentes = obterAvisosPendentes();
        const histStore = Array.isArray(estado.historicoAvisos) ? estado.historicoAvisos : [];
        const idsPendentes = new Set(pendentes.map(item => item.id));
        const lidos = [...new Map([...lerHistoricoSessao(), ...histStore]
            .filter(item => item && !idsPendentes.has(item.id)).map(item => [item.id, item])).values()];
        dialogLimparBtn.hidden = pendentes.length === 0;
        renderizarListaAvisos(abasAvisos[0], pendentes, 'Nenhum aviso pendente.');
        renderizarListaAvisos(abasAvisos[1], lidos, 'Nenhum aviso lido.');
    }

    function renderizarListaAvisos({ lista, resumo }, avisos, vazio) {
        resumo.textContent = avisos.length ? `${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}` : vazio;
        lista.replaceChildren();
        for (const item of avisos) {
            const li = document.createElement('li');
            li.className = 'sistema-ia-historico-item';

            const topo = document.createElement('div');
            topo.className = 'sistema-ia-historico-item-topo';

            const tag = document.createElement('span');
            tag.className = 'sistema-ia-historico-tag';
            tag.textContent = item.tipo === 'conquista' ? '[CONQUISTA OCULTA]' : '[SISTEMA]';

            topo.append(tag);

            const titulo = document.createElement('p');
            titulo.className = 'sistema-ia-historico-titulo';
            titulo.textContent = item.titulo || 'Aviso do Sistema';

            const msg = document.createElement('p');
            msg.className = 'sistema-ia-historico-mensagem';
            msg.textContent = item.texto || item.mensagem || '';

            li.append(topo, titulo, msg);
            lista.append(li);
        }
    }

    function selecionarAbaAvisos(selecionada, focar = false) {
        for (const aba of abasAvisos) {
            const ativa = aba === selecionada;
            aba.botao.setAttribute('aria-selected', String(ativa));
            aba.botao.tabIndex = ativa ? 0 : -1;
            aba.painel.hidden = !ativa;
        }
        if (focar) selecionada.botao.focus();
    }

    function sincronizarDom() {
        if (!dockEl || !sinetaBtn || !sinetaBadge || !toastEl) return;
        const pendentes = obterAvisosPendentes();
        const totalPendentes = pendentes.length;
        sinetaBadge.textContent = String(totalPendentes);
        sinetaBtn.setAttribute('aria-label', `Avisos do Sistema (${totalPendentes})`);

        if (existeModalOuPopoverAberto()) {
            limparTimersToast();
            avisoExibidoId = null;
            toastEl.hidden = true;
            if (dialogEl?.open) sincronizarDialogoHistorico();
            return;
        }

        const proximo = obterProximoParaToast();
        if (!proximo) {
            limparTimersToast();
            avisoExibidoId = null;
            toastEl.hidden = true;
            if (dialogEl?.open) sincronizarDialogoHistorico();
            return;
        }

        const mudouAviso = avisoExibidoId !== proximo.id;
        toastEl.hidden = false;
        toastTagEl.textContent = proximo.tipo === 'conquista' ? '[CONQUISTA OCULTA]' : '[SISTEMA]';
        toastTituloEl.textContent = proximo.titulo || '[SISTEMA]';
        toastMensagemEl.textContent = proximo.texto || proximo.mensagem || '';

        if (mudouAviso) {
            limparTimersToast();
            avisoExibidoId = proximo.id;
            avisoExibidoEmMs = Date.now();
            avisosApresentados.add(proximo.id);
            if (proximo.tipo === 'fala') salvarFalaSessao({ ...proximo, exibido: true });
            else escopo.SistemaIaStore?.marcarAvisoExibido?.(proximo.id);
            if (proximo.tipo === 'conquista') tocarSomConquista();

            if ((proximo.id === 'pulador_de_dialogos' || proximo.id === 'conquista:pulador_de_dialogos') && !travasPuladorAplicadas.has(proximo.id)) {
                travasPuladorAplicadas.add(proximo.id);
                const duracaoTrava = Number.isFinite(escopo.__sistemaIaTravaPuladorMs)
                    ? Math.max(0, Number(escopo.__sistemaIaTravaPuladorMs))
                    : 10000;
                if (duracaoTrava > 0) {
                    travaPuladorAtiva = true;
                    toastFecharBtn.disabled = true;
                    toastRodapeEl.hidden = false;
                    toastRodapeEl.textContent = 'Botão travado por 10s (leia até o fim desta vez!).';
                    timerTravaPulador = setTimeout(() => {
                        travaPuladorAtiva = false;
                        if (toastFecharBtn) toastFecharBtn.disabled = false;
                        if (toastRodapeEl) {
                            if (proximo.tituloRecompensa) {
                                toastRodapeEl.hidden = false;
                                toastRodapeEl.textContent = `Título desbloqueado: [${proximo.tituloRecompensa}]`;
                            } else {
                                toastRodapeEl.hidden = true;
                                toastRodapeEl.textContent = '';
                            }
                        }
                    }, duracaoTrava);
                }
            } else if (proximo.tituloRecompensa) {
                toastRodapeEl.hidden = false;
                toastRodapeEl.textContent = `Título desbloqueado: [${proximo.tituloRecompensa}]`;
            } else {
                toastRodapeEl.hidden = true;
                toastRodapeEl.textContent = '';
            }

            const duracaoAutoHide = Number.isFinite(escopo.__sistemaIaAutoHideMs)
                ? Math.max(50, Number(escopo.__sistemaIaAutoHideMs))
                : 10000;
            restanteToastMs = travaPuladorAtiva ? Math.max(duracaoAutoHide, 14000) : duracaoAutoHide;
            retomarTempoToast();
        }

        if (dialogEl?.open) sincronizarDialogoHistorico();
    }

    function dispensarAvisoAtual(opcoes = {}) {
        if (travaPuladorAtiva) return false;
        const proximo = obterProximoParaToast();
        if (!proximo) return false;

        const foiCliquePonteiro = Boolean(opcoes.porPonteiro);
        const decorridoMs = Date.now() - avisoExibidoEmMs;
        const fechadoRapido = foiCliquePonteiro && avisoExibidoEmMs > 0 && decorridoMs < 2000;

        const falaSessao = lerFalaSessao();
        if (falaSessao && falaSessao.id === proximo.id) {
            const atualizado = { ...falaSessao, dispensado: true };
            salvarFalaSessao(atualizado);
            registrarHistoricoSessao(atualizado);
        } else {
            escopo.SistemaIaStore?.consumirProximoAviso?.(undefined, proximo.id);
        }

        limparTimersToast();
        avisoExibidoId = null;

        if (fechadoRapido) {
            try {
                escopo.SistemaIaStore?.incrementarTelemetria?.('disparosToastRapidos', 1);
                avaliarAgora();
                return true;
            } catch (_) {}
        }

        sincronizarDom();
        return true;
    }

    function avaliarAgora(entrada = {}) {
        try {
            escopo.SistemaIaCatalogo?.avaliarOcultas?.(entrada);
        } catch (_) {}
        sincronizarDom();
        try {
            escopo.dispatchEvent(new CustomEvent('sistema-ia:atualizado'));
        } catch (_) {}
    }

    function avaliarContextualAgora(entrada = {}) {
        try {
            if (cronometroRodando()) return null;
            const jaNaSessao = lerFalaSessao();
            if (jaNaSessao && !entrada.forcar) return null;
            const estadoCronometro = escopo.CronometroEstudos?.obterEstado?.()?.estado || 'ocioso';
            const fala = escopo.SistemaIaCatalogo?.avaliarFalaContextual?.({
                estadoCronometro,
                ...entrada
            });
            if (!fala) return null;
            const item = {
                id: fala.id,
                tipo: 'fala',
                titulo: fala.titulo || '[SISTEMA]',
                mensagem: fala.mensagem,
                criadoEm: new Date().toISOString(),
                dispensado: false
            };
            salvarFalaSessao(item);
            sincronizarDom();
            return item;
        } catch (_) {
            return null;
        }
    }

    function montarDom() {
        if (document.getElementById('sistema-ia-dock')) return;

        dockEl = document.createElement('div');
        dockEl.id = 'sistema-ia-dock';
        dockEl.className = 'sistema-ia-dock';
        dockEl.setAttribute('role', 'region');
        dockEl.setAttribute('aria-label', 'Avisos do Sistema');

        sinetaBtn = document.createElement('button');
        sinetaBtn.type = 'button';
        sinetaBtn.id = 'sistema-ia-sineta-btn';
        sinetaBtn.className = 'sistema-ia-sineta-btn';
        sinetaBtn.setAttribute('aria-haspopup', 'dialog');
        sinetaBtn.setAttribute('aria-label', 'Avisos do Sistema (0)');

        const rotulo = document.createElement('span');
        rotulo.className = 'sistema-ia-sineta-rotulo';
        rotulo.textContent = '[SISTEMA] Avisos';

        sinetaBadge = document.createElement('span');
        sinetaBadge.id = 'sistema-ia-sineta-badge';
        sinetaBadge.className = 'sistema-ia-sineta-badge';
        sinetaBadge.textContent = '0';

        sinetaBtn.append(rotulo, sinetaBadge);

        toastEl = document.createElement('div');
        toastEl.id = 'sistema-ia-toast';
        toastEl.className = 'sistema-ia-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        toastEl.setAttribute('aria-atomic', 'true');
        toastEl.hidden = true;

        const topo = document.createElement('div');
        topo.className = 'sistema-ia-toast-topo';

        toastTagEl = document.createElement('span');
        toastTagEl.id = 'sistema-ia-toast-tag';
        toastTagEl.className = 'sistema-ia-toast-tag';
        toastTagEl.textContent = '[SISTEMA]';

        toastFecharBtn = document.createElement('button');
        toastFecharBtn.type = 'button';
        toastFecharBtn.id = 'sistema-ia-toast-fechar';
        toastFecharBtn.className = 'sistema-ia-toast-fechar';
        toastFecharBtn.setAttribute('aria-label', 'Dispensar aviso do Sistema');
        toastFecharBtn.textContent = 'OK';

        topo.append(toastTagEl, toastFecharBtn);

        toastTituloEl = document.createElement('p');
        toastTituloEl.id = 'sistema-ia-toast-titulo';
        toastTituloEl.className = 'sistema-ia-toast-titulo';

        toastMensagemEl = document.createElement('p');
        toastMensagemEl.id = 'sistema-ia-toast-mensagem';
        toastMensagemEl.className = 'sistema-ia-toast-mensagem';

        toastRodapeEl = document.createElement('div');
        toastRodapeEl.id = 'sistema-ia-toast-rodape';
        toastRodapeEl.className = 'sistema-ia-toast-rodape';
        toastRodapeEl.hidden = true;

        toastEl.append(topo, toastTituloEl, toastMensagemEl, toastRodapeEl);
        toastEl.addEventListener('mouseenter', () => {
            if (!timerAutoHide) return;
            restanteToastMs = Math.max(0, fimToastMs - performance.now());
            clearTimeout(timerAutoHide);
            timerAutoHide = null;
        });
        toastEl.addEventListener('mouseleave', retomarTempoToast);
        dockEl.append(sinetaBtn);

        const menu = document.querySelector('.jornada-menu');
        if (menu) menu.append(dockEl);
        else document.body.append(dockEl);
        document.body.append(toastEl);

        dialogEl = document.createElement('dialog');
        dialogEl.id = 'sistema-ia-historico-dialog';
        dialogEl.className = 'sistema-ia-dialog';
        dialogEl.setAttribute('aria-labelledby', 'sistema-ia-dialog-titulo');

        const dialogConteudo = document.createElement('div');
        dialogConteudo.className = 'sistema-ia-dialog-conteudo';

        const dialogTopo = document.createElement('div');
        dialogTopo.className = 'sistema-ia-dialog-topo';

        const dialogTitulo = document.createElement('h2');
        dialogTitulo.id = 'sistema-ia-dialog-titulo';
        dialogTitulo.textContent = '[SISTEMA] Histórico de Avisos';

        dialogFecharBtn = document.createElement('button');
        dialogFecharBtn.type = 'button';
        dialogFecharBtn.id = 'sistema-ia-dialog-fechar';
        dialogFecharBtn.className = 'sistema-ia-btn-secundario';
        dialogFecharBtn.textContent = 'Fechar';

        dialogTopo.append(dialogTitulo, dialogFecharBtn);

        const barraAbas = document.createElement('div');
        barraAbas.className = 'sistema-ia-abas';
        barraAbas.setAttribute('role', 'tablist');
        barraAbas.setAttribute('aria-label', 'Estado dos avisos');
        abasAvisos = [['pendentes', 'Pendentes'], ['lidos', 'Lidos']].map(([id, rotuloAba]) => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.id = `sistema-ia-aba-${id}`;
            botao.className = 'sistema-ia-btn-secundario';
            botao.setAttribute('role', 'tab');
            botao.textContent = rotuloAba;
            const painel = document.createElement('section');
            painel.id = `sistema-ia-painel-${id}`;
            painel.tabIndex = 0;
            painel.setAttribute('role', 'tabpanel');
            painel.setAttribute('aria-labelledby', botao.id);
            botao.setAttribute('aria-controls', painel.id);
            const resumo = document.createElement('p');
            resumo.className = 'sistema-ia-dialog-resumo';
            resumo.setAttribute('role', 'status');
            const lista = document.createElement('ul');
            lista.className = 'sistema-ia-historico-lista';
            painel.append(resumo, lista);
            barraAbas.append(botao);
            const aba = { botao, painel, resumo, lista };
            botao.addEventListener('click', () => selecionarAbaAvisos(aba));
            return aba;
        });
        barraAbas.addEventListener('keydown', event => {
            const indice = abasAvisos.findIndex(aba => aba.botao === event.target);
            const { key } = event;
            if (indice < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
            event.preventDefault();
            const destino = key === 'Home' ? 0 : key === 'End' ? abasAvisos.length - 1 : 1 - indice;
            selecionarAbaAvisos(abasAvisos[destino], true);
        });

        const dialogAcoes = document.createElement('div');
        dialogAcoes.className = 'sistema-ia-dialog-acoes';

        dialogLimparBtn = document.createElement('button');
        dialogLimparBtn.type = 'button';
        dialogLimparBtn.id = 'sistema-ia-limpar-fila';
        dialogLimparBtn.className = 'sistema-ia-btn-secundario';
        dialogLimparBtn.textContent = 'Marcar pendentes como lidos';

        dialogAcoes.append(dialogLimparBtn);
        abasAvisos[0].painel.append(dialogAcoes);
        selecionarAbaAvisos(abasAvisos[0]);
        dialogConteudo.append(dialogTopo, barraAbas, ...abasAvisos.map(aba => aba.painel));
        dialogEl.append(dialogConteudo);
        document.body.append(dialogEl);

        toastFecharBtn.addEventListener('click', e => {
            const porPonteiro = Number(e.detail || 0) > 0;
            dispensarAvisoAtual({ porPonteiro });
        });

        sinetaBtn.addEventListener('click', () => {
            selecionarAbaAvisos(abasAvisos[0]);
            sincronizarDialogoHistorico();
            if (!dialogEl.open) {
                dialogEl.showModal();
                dialogFecharBtn.focus();
            }
            sincronizarDom();
        });

        dialogFecharBtn.addEventListener('click', () => {
            dialogEl.close();
            sinetaBtn.focus();
            sincronizarDom();
        });

        dialogEl.addEventListener('cancel', () => {
            requestAnimationFrame(() => {
                sinetaBtn.focus();
                sincronizarDom();
            });
        });

        dialogLimparBtn.addEventListener('click', () => {
            try {
                for (const { id } of escopo.SistemaIaStore?.ler?.()?.filaAvisos || []) {
                    if (!escopo.SistemaIaStore.consumirProximoAviso(undefined, id).ok) break;
                }
                const falaSessao = lerFalaSessao();
                if (falaSessao && !falaSessao.dispensado) {
                    const lida = { ...falaSessao, dispensado: true };
                    salvarFalaSessao(lida);
                    registrarHistoricoSessao(lida);
                }
            } catch (_) {}
            abasAvisos[0].botao.focus();
            sincronizarDialogoHistorico();
            sincronizarDom();
        });
    }

    document.addEventListener('click', prepararAudioConquista, { capture: true });
    document.addEventListener('keydown', prepararAudioConquista, { capture: true });

    function desbloquearCodigo(id, legado) {
        let resultado;
        if (!escopo.SistemaIaStore?.estaDesbloqueada?.(legado)) {
            if (escopo.SistemaIaCatalogo?.desbloquearComAviso) resultado = escopo.SistemaIaCatalogo.desbloquearComAviso(id);
            else resultado = escopo.SistemaIaStore?.registrarDesbloqueio?.(id);
        }
        avaliarAgora();
        return resultado?.ok && resultado.nova;
    }

    function dispararKonami() {
        if (desbloquearCodigo('konami_code', 'segredo_konami')) escopo.dispatchEvent(new Event('sistema-ia:konami-desbloqueado'));
    }

    function dispararHadouken() {
        desbloquearCodigo('combo_street_fighter', 'hadouken');
        clearTimeout(timerHadouken);
        efeitoHadouken?.remove();
        const efeito = document.createElement('div');
        efeito.className = 'sistema-ia-hadouken';
        efeito.setAttribute('aria-hidden', 'true');
        document.body.append(efeito);
        efeitoHadouken = efeito;
        timerHadouken = setTimeout(() => {
            efeito.remove();
            efeitoHadouken = null;
        }, 850);
    }

    function iniciarGestosSecretos() {
        const avatar = document.getElementById('perfil-avatar-btn');
        if (!avatar) return;
        const combos = [
            { passos: [...KONAMI_SEQ.slice(0, -2), 'toque', 'toque'], janela: 1500, ativar: dispararKonami },
            { passos: ['ArrowDown', 'ArrowRight', 'toque', 'toque'], janela: 1500, ativar: dispararHadouken }
        ];
        let inicio;
        let ultimoGesto = 0;
        let bloquearCliqueAte = 0;
        avatar.classList.add('sistema-ia-avatar-gestos');
        avatar.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch' || !event.isPrimary) return;
            bloquearCliqueAte = 0;
            inicio = { id: event.pointerId, x: event.clientX, y: event.clientY, em: performance.now() };
        });
        const limpar = () => {
            inicio = null;
            for (const combo of combos) combo.indice = 0;
        };
        avatar.addEventListener('pointercancel', limpar);
        escopo.addEventListener('blur', limpar);
        avatar.addEventListener('pointerup', event => {
            if (!inicio || event.pointerId !== inicio.id) return;
            const agora = performance.now();
            const dx = event.clientX - inicio.x, dy = event.clientY - inicio.y;
            const distancia = Math.max(Math.abs(dx), Math.abs(dy));
            if (agora - inicio.em > 550 || (distancia > 12 && distancia < 24) || existeModalOuPopoverAberto()) {
                limpar();
                return;
            }
            inicio = null;
            const gesto = distancia <= 12 ? 'toque' : Math.abs(dx) > Math.abs(dy)
                ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
            for (const combo of combos) {
                let indice = combo.indice || 0;
                const duplo = indice === combo.passos.length - 1;
                if (agora - ultimoGesto > (duplo ? 350 : combo.janela)) indice = 0;
                combo.indice = gesto === combo.passos[indice] ? indice + 1 : Number(gesto === combo.passos[0]);
                if (combo.indice === combo.passos.length) {
                    bloquearCliqueAte = agora + 450;
                    combo.indice = 0;
                    combo.ativar();
                }
            }
            if (gesto !== 'toque') bloquearCliqueAte = agora + 450;
            ultimoGesto = agora;
        });
        avatar.addEventListener('click', event => {
            if (!event.detail || performance.now() >= bloquearCliqueAte) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, { capture: true });
    }

    function iniciarTecladoSecreto() {
        let idxKonami = 0;
        let ultimoKonamiMs = 0;

        let bufferIddqd = '';
        let ultimoIddqdMs = 0;
        let etapaHadouken = 0;
        let inicioHadoukenMs = 0;
        const limparCodigos = () => {
            idxKonami = 0;
            bufferIddqd = '';
            etapaHadouken = 0;
        };
        document.addEventListener('focusin', limparCodigos);
        escopo.addEventListener('blur', limparCodigos);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && toastEl && !toastEl.hidden && !existeModalOuPopoverAberto()) {
                dispensarAvisoAtual({ porPonteiro: false });
                return;
            }
            if (ehCampoDigitacao(e.target) || existeModalOuPopoverAberto()) {
                limparCodigos();
                return;
            }
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || typeof e.key !== 'string') return;

            const agora = Date.now();
            const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;

            // 1. Konami Code
            if (agora - ultimoKonamiMs > 1500) idxKonami = 0;
            ultimoKonamiMs = agora;
            if (tecla === KONAMI_SEQ[idxKonami]) {
                idxKonami++;
                if (idxKonami === KONAMI_SEQ.length) {
                    idxKonami = 0;
                    dispararKonami();
                }
            } else {
                idxKonami = tecla === KONAMI_SEQ[0] ? 1 : 0;
            }

            // 2. IDDQD (restrito à página de Perfil e fora de campos de digitação — Etapa 3.1)
            if (paginaAtual === 'perfil.html' && tecla.length === 1) {
                if (agora - ultimoIddqdMs > 1500) bufferIddqd = '';
                ultimoIddqdMs = agora;
                bufferIddqd += tecla;
                if (!'iddqd'.startsWith(bufferIddqd)) {
                    bufferIddqd = tecla === 'i' ? 'i' : '';
                }
                if (bufferIddqd === 'iddqd') {
                    bufferIddqd = '';
                    if (typeof escopo.AtivarEfeitoIddqdPerfil === 'function') {
                        escopo.AtivarEfeitoIddqdPerfil();
                    } else {
                        if (escopo.SistemaIaCatalogo?.desbloquearComAviso) {
                            escopo.SistemaIaCatalogo.desbloquearComAviso('modo_deus_iddqd');
                        } else {
                            escopo.SistemaIaStore?.registrarDesbloqueio?.('modo_deus_iddqd');
                        }
                        avaliarAgora();
                    }
                }
            } else {
                bufferIddqd = '';
            }

            // 3. Hadouken: ArrowDown -> ArrowRight -> P em < 1s
            if (tecla === 'ArrowDown') {
                etapaHadouken = 1;
                inicioHadoukenMs = agora;
            } else if (etapaHadouken === 1 && tecla === 'ArrowRight' && (agora - inicioHadoukenMs) <= 1000) {
                etapaHadouken = 2;
            } else if (etapaHadouken === 2 && tecla === 'p' && (agora - inicioHadoukenMs) <= 1000) {
                etapaHadouken = 0;
                dispararHadouken();
            } else if (tecla !== 'Shift') {
                etapaHadouken = 0;
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        montarDom();
        iniciarTecladoSecreto();
        iniciarGestosSecretos();
        avaliarContextualAgora();
        sincronizarDom();
    });

    const paginaAtual = (escopo.location?.pathname || '').split('/').pop();
    for (const evento of ['estudo:registrado', 'estudo:excluido', 'dominio:reiniciado', 'materias:excluida', 'revisoes:alteradas', 'perfil:identidade-alterada', 'sistema-ia:telemetria']) {
        escopo.addEventListener(evento, e => {
            if (evento === 'estudo:registrado') {
                const sessoes = e?.detail?.sessoes;
                const ultimaSessao = Array.isArray(sessoes) && sessoes.length ? sessoes[sessoes.length - 1] : null;
                avaliarAgora();
                if (ultimaSessao) avaliarContextualAgora({ ultimaSessao });
                return;
            }
            avaliarAgora();
        });
    }
    if (paginaAtual !== 'index.html') {
        escopo.addEventListener('praticas:alteradas', () => avaliarAgora());
    }
    escopo.addEventListener('cronometro:alterado', () => sincronizarDom());
    document.addEventListener('toggle', () => sincronizarDom(), true);
    escopo.addEventListener('storage', e => {
        if (!e.key || e.key === escopo.SistemaIaStore?.CHAVE) {
            sincronizarDom();
        }
    });

    const api = {
        sincronizarDom,
        avaliarAgora,
        avaliarContextualAgora,
        dispensarAvisoAtual,
        ehCampoDigitacao
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    escopo.SistemaIaAvisos = api;
})(typeof window !== 'undefined' ? window : globalThis);
