/* Auxiliar do cronômetro. Só sessões registradas governam tempo estudado/XP. */
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });

    function iniciar() {
        const botao = document.getElementById('pomodoro-alternar');
        if (!botao || !window.CronometroEstudos) return;
        const el = id => document.getElementById('pomodoro-' + id);
        const dialog = el('dialog'), foco = el('foco'), pausa = el('pausa'), padrao = el('padrao');
        const chave = 'projetoV1:' + window.EstudoStore.obterProjetoAtualId() + ':pomodoroV1';
        const formato = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
        let dados = { versao: 1, ativo: false, focoSegundos: 1500, pausaSegundos: 300,
            etapa: 'pronto', restanteSegundos: 0, sessaoId: null };
        let carregado = false, falhou = false, paginaAtiva = true, rodando = false;
        let anterior = 'ocioso', baseFoco = 0, restanteBase = 0, fimPausa = 0, ultimaObservacao = 0;
        let ultimoSalvo = null, audio = null;

        function erro(mensagem) { el('erro').hidden = false; el('erro').textContent = mensagem; }
        function salvar(timer) {
            if (!timer.pronto || !paginaAtiva || falhou) return;
            const raw = JSON.stringify(dados);
            if (raw === ultimoSalvo) return;
            try { localStorage.setItem(chave, raw); ultimoSalvo = raw; }
            catch (_) {
                falhou = true; rodando = false;
                erro('Não foi possível salvar o Pomodoro. A contagem auxiliar foi pausada. Libere armazenamento e recarregue; o cronômetro de estudos mantém seus próprios controles.');
            }
        }
        function preparar() {
            dados.etapa = 'pronto'; dados.restanteSegundos = dados.ativo ? dados.focoSegundos : 0;
            dados.sessaoId = null; rodando = false;
        }
        function iniciarFoco(timer, restante = dados.focoSegundos) {
            dados.etapa = 'foco'; dados.sessaoId = timer.sessaoId; dados.restanteSegundos = restante;
            restanteBase = restante; baseFoco = timer.duracaoSegundos; rodando = true;
        }
        function iniciarPausa(timer, restante = dados.pausaSegundos) {
            dados.etapa = 'pausa'; dados.sessaoId = timer.sessaoId; dados.restanteSegundos = restante;
            ultimaObservacao = performance.now(); fimPausa = ultimaObservacao + restante * 1000; rodando = true;
        }
        function habilitarAudio() {
            try {
                const Contexto = window.AudioContext || window.webkitAudioContext;
                if (!Contexto) return;
                audio ||= new Contexto();
                if (audio.state === 'suspended') audio.resume().catch(() => {});
            } catch (_) { /* O aviso visual funciona mesmo sem áudio disponível. */ }
        }
        function bip(quantidade) {
            if (!audio || audio.state !== 'running') return;
            try {
                for (let i = 0; i < quantidade; i++) {
                    const inicio = audio.currentTime + i * .24;
                    const oscilador = audio.createOscillator(), ganho = audio.createGain();
                    oscilador.frequency.value = 880;
                    ganho.gain.setValueAtTime(0, inicio);
                    ganho.gain.linearRampToValueAtTime(.12, inicio + .01);
                    ganho.gain.linearRampToValueAtTime(0, inicio + .15);
                    oscilador.connect(ganho); ganho.connect(audio.destination);
                    oscilador.onended = () => { oscilador.disconnect(); ganho.disconnect(); };
                    oscilador.start(inicio); oscilador.stop(inicio + .16);
                }
            } catch (_) { /* Áudio indisponível não interrompe o estudo. */ }
        }
        function contar(timer) {
            if (!rodando) return;
            if (dados.etapa === 'foco') {
                dados.restanteSegundos = Math.max(0, restanteBase - Math.max(0, timer.duracaoSegundos - baseFoco));
                if (timer.estado !== 'rodando') rodando = false;
            } else if (dados.etapa === 'pausa') {
                const agora = performance.now();
                if (agora < ultimaObservacao || agora - ultimaObservacao > 12 * 3600000) { rodando = false; return; }
                ultimaObservacao = agora;
                dados.restanteSegundos = Math.max(0, Math.ceil((fimPausa - agora) / 1000));
            }
            if (dados.restanteSegundos === 0) {
                const eraFoco = dados.etapa === 'foco';
                dados.etapa = eraFoco ? 'aguarda-pausa' : 'aguarda-foco';
                rodando = false; bip(eraFoco ? 2 : 1);
            }
        }
        function renderizar(timer) {
            botao.disabled = !timer.pronto || falhou || !paginaAtiva || timer.registrando;
            botao.setAttribute('aria-pressed', String(dados.ativo));
            const titulo = dados.ativo ? 'Desativar Pomodoro' : 'Ativar Pomodoro';
            botao.setAttribute('aria-label', titulo); botao.title = titulo;
            el('painel').hidden = !dados.ativo;
            el('tempo').textContent = formato(dados.restanteSegundos);
            el('painel').classList.toggle('pomodoro-aguardando', dados.etapa.startsWith('aguarda-'));
            const descansoPendente = dados.etapa === 'aguarda-pausa' && timer.estado === 'parado';
            el('retomar').hidden = (dados.etapa !== 'pausa' && !descansoPendente) || rodando || !dados.ativo;
            el('retomar').textContent = descansoPendente ? 'Iniciar descanso' : 'Retomar descanso';
            el('retomar').disabled = botao.disabled;
            const textos = {
                pronto: 'Foco pronto · inicie seu estudo.',
                foco: rodando ? 'Foco em andamento.' : 'Foco pausado · clique em Continuar.',
                'aguarda-pausa': descansoPendente ? 'Foco concluído · inicie o descanso.' : 'Foco concluído · clique em Pausa para descansar.',
                pausa: rodando ? 'Descanso em andamento.' : 'Descanso pausado · retome quando quiser.',
                'aguarda-foco': 'Descanso concluído · clique em Continuar.'
            };
            const mensagem = falhou ? 'Pomodoro pausado por falha de armazenamento.' : textos[dados.etapa];
            if (el('status').textContent !== mensagem) el('status').textContent = mensagem;
        }
        function atualizar(evento) {
            const timer = window.CronometroEstudos.obterEstado();
            if (!timer.pronto || !paginaAtiva || falhou) { rodando = false; renderizar(timer); return; }
            if (!carregado) {
                try {
                    const raw = localStorage.getItem(chave);
                    if (raw !== null) {
                        const valor = JSON.parse(raw);
                        if (!window.BackupLocal.validarPomodoro(valor)) throw new Error('Checkpoint inválido');
                        dados = valor; ultimoSalvo = raw;
                    } else ultimoSalvo = JSON.stringify(dados);
                    carregado = true; anterior = timer.estado;
                    // Recuperação nunca conta ausência. Checkpoint de sessão já encerrada é descartável.
                    if (dados.sessaoId && dados.sessaoId !== timer.sessaoId) preparar();
                    if (dados.ativo && dados.etapa === 'foco' && dados.sessaoId === timer.sessaoId && timer.estado === 'rodando') {
                        const ausencia = Number.isInteger(dados.observadoSegundos) ? Math.max(0, timer.duracaoSegundos - dados.observadoSegundos) : 0;
                        iniciarFoco(timer, Math.max(0, dados.restanteSegundos - ausencia));
                    }
                } catch (_) {
                    falhou = true;
                    erro('Não foi possível recuperar o Pomodoro. Os dados anteriores foram preservados. Confira o backup antes de tentar novamente.');
                    renderizar(timer); return;
                }
            }
            if (dados.ativo) {
                contar(timer);
                if (timer.estado === 'ocioso') preparar();
                else if (evento?.detail?.acao === 'pausar' && timer.estado === 'parado') iniciarPausa(timer);
                else if (timer.estado === 'rodando' && (anterior !== 'rodando' || dados.sessaoId !== timer.sessaoId)) {
                    if (dados.sessaoId === timer.sessaoId && dados.etapa === 'aguarda-pausa') rodando = false;
                    else iniciarFoco(timer, dados.sessaoId === timer.sessaoId && dados.etapa === 'foco' ? dados.restanteSegundos : dados.focoSegundos);
                }
            }
            if (dados.ativo) dados.observadoSegundos = timer.duracaoSegundos;
            anterior = timer.estado; salvar(timer); renderizar(timer);
        }
        botao.addEventListener('click', () => {
            habilitarAudio(); atualizar();
            if (botao.disabled) return;
            if (dados.ativo) {
                dados.ativo = false; preparar(); atualizar(); return;
            }
            foco.value = formato(dados.focoSegundos); pausa.value = formato(dados.pausaSegundos);
            padrao.checked = dados.focoSegundos === 1500 && dados.pausaSegundos === 300;
            foco.setCustomValidity(''); pausa.setCustomValidity('');
            dialog.showModal(); foco.focus();
        });
        padrao.addEventListener('change', () => {
            if (padrao.checked) { foco.value = '25:00'; pausa.value = '05:00'; }
            foco.setCustomValidity(''); pausa.setCustomValidity('');
        });
        for (const campo of [foco, pausa]) {
            const aplicar = digitos => {
                const n = digitos.replace(/\D/g, '').slice(0, 4).padStart(4, '0');
                campo.value = n.slice(0, 2) + ':' + String(Math.min(59, Number(n.slice(2)))).padStart(2, '0');
                campo.dispatchEvent(new Event('input', { bubbles: true }));
            };
            campo.addEventListener('beforeinput', event => {
                if (!event.inputType.startsWith('delete') && !(event.inputType === 'insertText' && event.data !== null)) return;
                event.preventDefault();
                const inicio = campo.selectionStart, fim = campo.selectionEnd;
                const indice = pos => Math.min(4, pos - (pos > 2 ? 1 : 0));
                let a = indice(inicio), b = indice(fim);
                const digitos = campo.value.replace(/\D/g, '').padStart(4, '0').split('');
                for (let i = a; i < b; i++) digitos[i] = '0';
                if (event.inputType.startsWith('delete')) {
                    if (a === b) { if (event.inputType.includes('Backward')) a = Math.max(0, a - 1); digitos[a] = '0'; }
                } else {
                    for (const d of event.data.replace(/\D/g, '')) { if (a < 4) digitos[a++] = d; }
                }
                aplicar(digitos.join(''));
                const cursor = a >= 2 ? a + 1 : a;
                campo.setSelectionRange(cursor, cursor);
            });
            campo.addEventListener('paste', event => {
                event.preventDefault(); aplicar(event.clipboardData.getData('text'));
                campo.setSelectionRange(5, 5);
            });
            campo.addEventListener('input', () => {
                const n = campo.value.replace(/\D/g, '').slice(0, 4).padStart(4, '0');
                campo.value = n.slice(0, 2) + ':' + String(Math.min(59, Number(n.slice(2)))).padStart(2, '0');
            campo.setCustomValidity(''); padrao.checked = foco.value === '25:00' && pausa.value === '05:00';
            });
        }
        el('cancelar').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => botao.focus());
        el('form').addEventListener('submit', event => {
            event.preventDefault(); habilitarAudio(); atualizar();
            if (botao.disabled) return;
            for (const campo of [foco, pausa]) {
                campo.setCustomValidity(campo.value === '00:00' ? 'Informe pelo menos um segundo.' : '');
                if (!campo.reportValidity()) return;
            }
            const segundos = campo => Number(campo.value.slice(0, 2)) * 60 + Number(campo.value.slice(3));
            dados.focoSegundos = segundos(foco); dados.pausaSegundos = segundos(pausa); dados.ativo = true;
            preparar();
            const timer = window.CronometroEstudos.obterEstado();
            if (timer.estado === 'rodando') iniciarFoco(timer);
            salvar(timer); renderizar(timer); dialog.close();
        });
        el('retomar').addEventListener('click', () => {
            habilitarAudio(); atualizar();
            const timer = window.CronometroEstudos.obterEstado();
            if (!botao.disabled && ['pausa', 'aguarda-pausa'].includes(dados.etapa) && !rodando && timer.estado === 'parado') {
                iniciarPausa(timer, dados.etapa === 'pausa' ? dados.restanteSegundos : dados.pausaSegundos); salvar(timer); renderizar(timer);
            }
        });
        // Desbloqueia áudio também após recuperação, pelo Play dos cards ou por Continuar.
        document.addEventListener('click', () => { if (dados.ativo) habilitarAudio(); }, true);
        window.addEventListener('cronometro:estado', atualizar);
        document.addEventListener('visibilitychange', () => atualizar());
        window.addEventListener('pagehide', () => { paginaAtiva = false; rodando = false; });
        window.addEventListener('pageshow', event => {
            if (event.persisted) { paginaAtiva = true; carregado = false; atualizar(); }
        });
        window.setInterval(atualizar, 250);
        atualizar();
    }
})();
