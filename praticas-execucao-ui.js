(function () {
    'use strict';
    let dialogo, painel, conteudo, missaoAtual = null, contexto, ocupado = false, origemFoco;
    const tentativas = new Map();
    const api = () => window.PraticasExecucao;
    const timer = () => window.CronometroEstudos;
    const el = (tag, texto = '', classe = '') => {
        const n = document.createElement(tag); n.textContent = texto; n.className = classe; return n;
    };
    const data = iso => iso.split('-').reverse().join('/');
    const tempo = segundos => {
        const h = Math.floor(segundos / 3600), m = Math.floor(segundos % 3600 / 60), s = segundos % 60;
        return `${h ? `${h}h ` : ''}${m}min${s ? ` ${s}s` : ''}`;
    };
    function descricaoPreset(presetId) {
        if (!presetId) return '';
        return descricaoParametros(window.PraticasProgressao.obterPreset(presetId));
    }
    function descricaoParametros(p) {
        if (!p) return '';
        const n = v => v.toLocaleString('pt-BR',{maximumFractionDigits:2});
        return `${p.nome} · ${p.extensao} · duração de referência: ${n(p.alvoSegundos/60)} min`;
    }
    function perfilFormularioMissao(form) {
        return form.querySelector('select').value === 'linhas'
            ? {versao:2,base:'linhas',linhas:Number(form.querySelector('#pratica-missao-linhas').value)}
            : {versao:2,base:'tempo-ideal',tempoIdealSegundos:Math.round(Number(form.querySelector('#pratica-missao-ideal').value)*60)};
    }
    function previaPerfilMissao() {
        const form = dialogo.querySelector('#pratica-form-preset'), valor = form.querySelector('select').value;
        const linhas = form.querySelector('#pratica-missao-linhas'),ideal = form.querySelector('#pratica-missao-ideal');
        linhas.closest('label').hidden = valor !== 'linhas'; ideal.closest('label').hidden = valor !== 'tempo-ideal';
        linhas.disabled = valor !== 'linhas'; ideal.disabled = valor !== 'tempo-ideal';
        linhas.required = valor === 'linhas'; ideal.required = valor === 'tempo-ideal';
        try { form.querySelector('[data-previa-preset]').textContent = descricaoParametros(['linhas','tempo-ideal'].includes(valor)
            ? window.PraticasProgressao.resolverPerfil(perfilFormularioMissao(form)) : valor ? window.PraticasProgressao.obterPreset(valor) : null); }
        catch (_) { form.querySelector('[data-previa-preset]').textContent = ''; }
    }
    function botao(texto, acao, classe = 'btn btn-outline-primary') {
        const b = el('button', texto, classe); b.type = 'button'; b.addEventListener('click', acao); return b;
    }
    function botaoAbrir(missao) {
        const b = botao('Abrir atividade prática', () => abrir(missao.missaoId));
        b.setAttribute('aria-label', `Abrir atividade prática ${missao.nome} de ${data(missao.dataPrevista)}`); return b;
    }
    function campo(form, id, rotulo, tipo, atributos = {}) {
        const label = el('label', rotulo, 'pratica-campo'); label.htmlFor = id;
        const input = el(tipo === 'textarea' ? 'textarea' : 'input');
        input.id = id; input.name = id; input.className = 'form-control';
        if (tipo !== 'textarea') input.type = tipo;
        Object.assign(input, atributos); label.append(input); form.append(label); return input;
    }
    function formulario(titulo, nome, campos, enviar) {
        const form = el('form', '', 'pratica-form'); form.id = `pratica-form-${nome}`;
        const fs = el('fieldset'); fs.append(el('legend', titulo)); form.append(fs); campos(fs);
        const submit = el('button', 'Salvar', 'btn btn-primary'); submit.type = 'submit'; fs.append(submit);
        form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) executar(nome, () => enviar(form)); });
        conteudo.append(form); return form;
    }
    function tentativa(nome, payload) {
        const chave = `${missaoAtual}:${nome}`, assinatura = JSON.stringify(payload);
        let t = tentativas.get(chave);
        if (!t || t.assinatura !== assinatura) {
            t = { assinatura, id: crypto.randomUUID(), registradoEm: new Date().toISOString() }; tentativas.set(chave, t);
        }
        return t;
    }
    async function executar(nome, fn) {
        if (ocupado) return;
        ocupado = true; atualizarControles(); status('Salvando…');
        try {
            const resultado = await fn();
            if (resultado === false) throw new Error(document.getElementById('cronometro-status').textContent);
            tentativas.delete(`${missaoAtual}:${nome}`);
            const form = document.getElementById(`pratica-form-${nome}`);
            if (form && nome !== 'conclusao') form.reset();
            atualizar(); status(nome === 'timer' ? document.getElementById('cronometro-status').textContent : 'Registro salvo.');
        } catch (erro) { status(erro.message, true); }
        finally { ocupado = false; atualizarControles(); }
    }
    function status(texto, erro = false) {
        const n = dialogo.querySelector('[data-status]'); n.textContent = texto; n.classList.toggle('text-danger', erro);
    }
    function criarDialogo() {
        dialogo = el('dialog', '', 'pratica-dialogo'); dialogo.setAttribute('aria-labelledby', 'pratica-titulo');
        conteudo = el('div', '', 'pratica-dialogo-conteudo'); dialogo.append(conteudo);
        const topo = el('div', '', 'pratica-topo'), titulo = el('h2'); titulo.id = 'pratica-titulo';
        const fechar = botao('Fechar', () => dialogo.close(), 'btn btn-outline-secondary'); fechar.dataset.fechar = '';
        topo.append(titulo, fechar); conteudo.append(topo);
        const resumo = el('p'); resumo.dataset.resumo = ''; conteudo.append(resumo);
        const aviso = el('p', '', 'form-text'); aviso.dataset.aviso = ''; conteudo.append(aviso);
        const xp = el('p'); xp.dataset.xp = ''; conteudo.append(xp);
        const parametros = el('p', '', 'form-text'); parametros.dataset.presetDetalhe = ''; conteudo.append(parametros);
        const nivel = el('p'); nivel.dataset.nivelPratica = ''; conteudo.append(nivel);
        const barraNivel = el('progress'); barraNivel.max = 100; barraNivel.dataset.barraNivelPratica = '';
        barraNivel.setAttribute('aria-label', 'Avanço de nível desta atividade'); conteudo.append(barraNivel);
        formulario('Classificar XP desta atividade prática', 'preset', fs => {
            const label = el('label', 'Tipo de produção escrita', 'pratica-campo'); label.htmlFor = 'pratica-missao-preset';
            const select = el('select'); select.id = 'pratica-missao-preset'; select.className = 'form-select'; select.required = true;
            const vazio = el('option', 'Escolha o preset'); vazio.value = ''; select.append(vazio);
            for (const p of window.PraticasProgressao.listarPresets()) {
                const option = el('option', `${p.nome} · ${p.extensao}`); option.value = p.presetId; select.append(option);
            }
            for (const [value,label] of [['linhas','Personalizar pelo número de linhas'],['tempo-ideal','Personalizar pelo tempo ideal']]) {
                const option = el('option',label); option.value = value; select.append(option);
            }
            const previa = el('p', '', 'form-text'); previa.dataset.previaPreset = '';
            select.addEventListener('change', previaPerfilMissao);
            label.append(select); fs.append(label);
            campo(fs,'pratica-missao-linhas','Extensão de referência (linhas)','number',{min:'0.5',step:'any'}).addEventListener('input',previaPerfilMissao);
            campo(fs,'pratica-missao-ideal','Tempo ideal de referência (minutos)','number',{min:'0.0166666667',step:'any'}).addEventListener('input',previaPerfilMissao);
            fs.append(previa, el('p', 'Para atividade prática já registrada e sem perfil. A escolha é preservada no histórico. Para as próximas, configure o cadastro da atividade.', 'form-text'));
        }, form => ['linhas','tempo-ideal'].includes(form.querySelector('select').value)
            ? api().definirPerfil(missaoAtual,perfilFormularioMissao(form)) : api().definirPreset(missaoAtual,form.querySelector('select').value));
        const acoesTimer = el('section', '', 'pratica-timer'); acoesTimer.dataset.timer = '';
        acoesTimer.append(el('h3', 'Cronômetro da atividade prática'));
        const visor = el('p'); visor.dataset.visor = ''; acoesTimer.append(visor);
        for (const [id, texto, fn] of [
            ['iniciar','Iniciar', () => timer().iniciarPratica(missaoAtual)],
            ['parar','Pausar', () => timer().parar()], ['continuar','Continuar', () => timer().continuar()],
            ['registrar','Registrar tempo', () => timer().registrarAtual()], ['zerar','Zerar', () => timer().zerar()]
        ]) {
            const b = botao(texto, () => executar('timer', fn)); b.dataset.timerAcao = id; acoesTimer.append(b);
        }
        conteudo.append(acoesTimer);
        formulario('Realização', 'conclusao', fs => {
            campo(fs, 'pratica-data-conclusao', 'Data de realização', 'date', { required: true });
            fs.append(el('p', 'Concluir registra a realização. Nenhum tempo será acrescentado.', 'form-text'));
        }, form => {
            const payload = { dataRealizacao: form.elements['pratica-data-conclusao'].value }, t = tentativa('conclusao', payload);
            return api().concluir(missaoAtual, { ...payload, conclusaoId: t.id, registradoEm: t.registradoEm });
        });
        formulario('Registrar tempo manualmente', 'tempo', fs => {
            campo(fs, 'pratica-data-tempo', 'Data da atividade', 'date', { required: true });
            campo(fs, 'pratica-minutos', 'Duração real em minutos', 'number', { min: '0.0166666667', step: 'any', required: true });
            campo(fs, 'pratica-nota-tempo', 'Anotação opcional (até 140 caracteres)', 'textarea', { maxLength: 140, rows: 2 });
            fs.append(el('p', 'Informe o tempo efetivamente dedicado. Registrar tempo não conclui a atividade prática.', 'form-text'));
        }, form => {
            const valor = Number(form.elements['pratica-minutos'].value), segundos = Math.round(valor * 60);
            if (!Number.isSafeInteger(segundos) || segundos <= 0) throw new Error('Informe uma duração positiva em segundos inteiros.');
            const payload = { dataEstudo: form.elements['pratica-data-tempo'].value, duracaoSegundos: segundos,
                anotacao: form.elements['pratica-nota-tempo'].value.trim() }, t = tentativa('tempo', payload);
            return api().registrarManual(missaoAtual, { ...payload, sessaoId: t.id, registradoEm: t.registradoEm });
        });
        formulario('Autoavaliação opcional', 'avaliacao', fs => {
            campo(fs, 'pratica-nota-obtida', 'Nota obtida (opcional)', 'number', { min: '0', step: 'any' });
            campo(fs, 'pratica-nota-maxima', 'Nota máxima', 'number', { min: '0.000001', step: 'any' });
            campo(fs, 'pratica-anotacao', 'Anotação opcional (até 140 caracteres)', 'textarea', { maxLength: 140, rows: 2 });
            fs.append(el('p', 'Disponível após a conclusão. A avaliação não altera progresso, XP ou distribuição.', 'form-text'));
        }, form => {
            const obtida = form.elements['pratica-nota-obtida'].value, maxima = form.elements['pratica-nota-maxima'].value;
            if (Boolean(obtida) !== Boolean(maxima)) throw new Error('Preencha nota obtida e máxima juntas.');
            const payload = { nota: obtida ? { obtida: Number(obtida), maxima: Number(maxima) } : null,
                anotacao: form.elements['pratica-anotacao'].value.trim() }, t = tentativa('avaliacao', payload);
            return api().avaliar(missaoAtual, { ...payload, avaliacaoId: t.id, registradoEm: t.registradoEm });
        });
        const historico = el('section'); historico.append(el('h3', 'Histórico desta atividade prática'));
        const lista = el('ul', '', 'pratica-historico'); lista.dataset.historico = ''; historico.append(lista); conteudo.append(historico);
        const mensagem = el('p'); mensagem.dataset.status = ''; mensagem.setAttribute('role', 'status'); mensagem.setAttribute('aria-live', 'polite');
        aviso.after(mensagem); document.body.append(dialogo);
        dialogo.addEventListener('cancel', event => { if (ocupado) event.preventDefault(); });
        dialogo.addEventListener('close', () => {
            if (dialogo.open) return; // um novo abrir pode ocorrer antes da entrega do evento close anterior
            missaoAtual = null; origemFoco?.isConnected && origemFoco.focus();
        });
    }
    function atualizarControles() {
        if (!dialogo?.open || !contexto) return;
        const futuro = contexto.missao.dataPrevista > api().hoje(), somenteConsulta = futuro || contexto.removida;
        dialogo.querySelector('[data-fechar]').disabled = ocupado;
        dialogo.querySelectorAll('fieldset').forEach(f => { f.disabled = ocupado || somenteConsulta; });
        dialogo.querySelector('#pratica-form-conclusao fieldset').disabled ||= contexto.missao.concluida;
        dialogo.querySelector('#pratica-form-avaliacao fieldset').disabled ||= !contexto.missao.concluida;
        const formPreset = dialogo.querySelector('#pratica-form-preset');
        formPreset.hidden = ['taf','simulado'].includes(contexto.missao.tipo) || Boolean(contexto.missao.presetXpId || contexto.missao.perfilXp);
        formPreset.querySelector('fieldset').disabled ||= !contexto.conclusoes.length && !contexto.sessoes.length;
        const atual = timer().obterEstado(), desta = atual.tipo === 'pratica' && atual.missaoId === missaoAtual;
        dialogo.querySelector('[data-timer]').hidden = !contexto.missao.usaCronometro;
        dialogo.querySelector('[data-visor]').textContent = desta ? `${tempo(atual.duracaoSegundos)} · ${atual.estado}` : 'Use o mesmo cronômetro da Jornada para esta atividade prática.';
        dialogo.querySelectorAll('[data-timer-acao]').forEach(b => {
            const acao = b.dataset.timerAcao;
            b.disabled = ocupado || somenteConsulta || !atual.pronto || atual.registrando || (acao === 'iniciar'
                ? atual.estado !== 'ocioso' : !desta || (acao === 'parar' ? atual.estado !== 'rodando' : atual.estado !== 'parado'));
        });
        dialogo.querySelectorAll('[data-excluir]').forEach(b => { b.disabled = ocupado; });
    }
    function atualizar() {
        if (!missaoAtual) return;
        contexto = api().consultar(missaoAtual);
        const m = contexto.missao;
        const p = m.progressao;
        const zonas = { 'abaixo-piso': 'Tempo abaixo do piso: 1 XP por minuto real.', 'faixa-operacional': 'Faixa operacional: XP nominal integral.',
            'acima-teto': 'Tempo acima do teto: XP limitado ao nominal.', 'aguardando-conclusao': 'O XP será calculado após a realização.', 'sem-preset': 'Sem preset de XP.',
            'tempo-taf': 'TAF: 1 XP por minuto de treinamento registrado.' };
        dialogo.querySelector('[data-xp]').textContent = p ? `${p.xp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP · ${zonas[p.zona]}` : '';
        dialogo.querySelector('[data-preset-detalhe]').textContent = descricaoParametros(window.PraticasProgressao.obterParametros(m));
        previaPerfilMissao();
        const progressao = contexto.progressaoAtividade;
        dialogo.querySelector('[data-nivel-pratica]').textContent = progressao?.nivel
            ? `Atividade · nível ${progressao.nivel} · ${progressao.xp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP${progressao.nivel === 100 ? ' · nível máximo' : progressao.xpParaProximoNivel !== null ? ` · faltam ${progressao.xpParaProximoNivel.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP para o próximo nível` : ` · ${progressao.percentual.toLocaleString('pt-BR',{maximumFractionDigits:2})}% para o próximo nível`}` : '';
        dialogo.querySelector('[data-barra-nivel-pratica]').hidden = !progressao?.nivel;
        dialogo.querySelector('[data-barra-nivel-pratica]').value = progressao?.percentual || 0;
        dialogo.querySelector('h2').textContent = m.nome;
        dialogo.querySelector('[data-resumo]').textContent = `${data(m.dataPrevista)} · ${m.concluida ? 'Concluída' : 'Pendente'} · ${tempo(m.tempoRegistradoSegundos)} registrados${m.duracaoPlanejadaSegundos ? ` · previsão ${tempo(m.duracaoPlanejadaSegundos)}` : ''}`;
        dialogo.querySelector('[data-aviso]').textContent = contexto.removida ? 'Atividade removida. Histórico preservado para consulta e retificação.'
            : m.dataPrevista > api().hoje() ? 'Atividade prática futura: consulta disponível. A realização abre na data prevista.'
            : m.tipo === 'taf' ? 'TAF é externo à carga teórica. Registre o tempo após o treinamento.' : 'Realização e tempo são independentes. Não há duração mínima para concluir.';
        dialogo.querySelector('#pratica-form-avaliacao legend').textContent = m.tipo === 'simulado' ? 'Resultado do simulado (opcional)' : 'Autoavaliação opcional';
        dialogo.querySelector('#pratica-form-conclusao button').textContent = m.concluida ? 'Atividade prática concluída' : 'Concluir atividade prática';
        for (const id of ['pratica-data-conclusao', 'pratica-data-tempo']) {
            const input = dialogo.querySelector(`#${id}`); input.min = m.dataPrevista; input.max = api().hoje();
            if (!input.value) input.value = api().hoje();
        }
        const lista = dialogo.querySelector('[data-historico]'); lista.replaceChildren();
        const entradas = [];
        for (const c of contexto.conclusoes) entradas.push({ colecao: 'conclusoes', id: c.conclusaoId, instante: c.registradoEm,
            texto: `Realização em ${data(c.dataRealizacao || window.CalendarioJornada.dataLocal(c.registradoEm))}` });
        for (const s of contexto.sessoes) entradas.push({ colecao: 'sessoes', id: s.sessaoId, instante: s.registradoEm || s.inicio,
            texto: `${tempo(s.duracaoSegundos)} · ${s.origem === 'manual' ? `${data(s.dataEstudo)} · horário não informado` : new Date(s.inicio).toLocaleString('pt-BR')}${s.anotacao ? ` · ${s.anotacao}` : ''}` });
        for (const a of contexto.avaliacoes) entradas.push({ colecao: 'avaliacoes', id: a.avaliacaoId, instante: a.registradoEm,
            texto: `Avaliação${a.nota ? ` · ${a.nota.obtida}/${a.nota.maxima}` : ''}${a.anotacao ? ` · ${a.anotacao}` : ''}` });
        entradas.sort((a, b) => b.instante.localeCompare(a.instante) || a.id.localeCompare(b.id));
        for (const entrada of entradas) {
            const item = el('li'), excluir = botao('Excluir', () => {
                if (window.confirm('Excluir este registro? A conclusão e o tempo serão recalculados a partir dos registros restantes.')) {
                    executar('excluir', () => api().excluir(missaoAtual, entrada.colecao, entrada.id));
                }
            }, 'btn btn-outline-danger'); excluir.dataset.excluir = entrada.colecao;
            item.append(el('span', entrada.texto), excluir); lista.append(item);
        }
        if (!entradas.length) lista.append(el('li', 'Nenhum registro nesta atividade prática.'));
        atualizarControles();
    }
    function abrir(missaoId) {
        if (ocupado) return;
        if (!dialogo) criarDialogo();
        const anterior = missaoAtual; missaoAtual = missaoId;
        try {
            if (anterior !== missaoId) { dialogo.querySelectorAll('form').forEach(f => f.reset()); status(''); }
            atualizar(); origemFoco = document.activeElement;
            if (!dialogo.open) dialogo.showModal(); atualizarControles();
        } catch (erro) {
            missaoAtual = anterior;
            if (dialogo.open) status(erro.message, true);
            else { painel.hidden = false; painel.textContent = erro.message; const lista=document.getElementById('praticas-painel-dialog');if(lista&&!lista.open)lista.showModal(); }
        }
    }
    function renderizarPainel() {
        if (!painel) {
            painel = el('section', '', 'praticas-painel'); painel.id = 'praticas-historico';
            document.getElementById('praticas-modal-conteudo').append(painel);
        }
        try {
            const proj = window.PraticasStore.projetarMissoesProjeto(window.EstudoStore.obterProjetoAtualId());
            painel.replaceChildren(); painel.hidden = false;
            if (!proj.missoes.length) { painel.append(el('p','Nenhuma atividade prática agendada neste projeto.')); return; }
            painel.append(el('h2', 'Atividades práticas e histórico'), el('p', 'Atividades práticas previstas, realizações e tempo registrado. Inclui treinamentos em dias de folga.'));
            const lista = el('ul', '', 'pratica-missoes');
            for (const m of proj.missoes) {
                const item = el('li'); item.dataset.missaoId = m.missaoId;
                item.append(el('span', `${data(m.dataPrevista)} · ${m.nome} · ${m.concluida ? 'Concluída' : 'Pendente'} · ${tempo(m.tempoRegistradoSegundos)}${m.progressao ? ` · ${m.progressao.xp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP` : ''}`), botaoAbrir(m)); lista.append(item);
            }
            painel.append(lista);
        } catch (erro) { painel.hidden = false; painel.textContent = `Não foi possível carregar as atividades práticas. ${erro.message}`; }
    }
    function recarregar() {
        renderizarPainel();
        if (dialogo?.open) { try { atualizar(); } catch (erro) { status(erro.message, true); } }
    }
    document.addEventListener('DOMContentLoaded', () => {
        const url = new URL(window.location.href), missao = url.searchParams.get('missao');
        if (missao) { url.searchParams.delete('missao'); history.replaceState(null, '', url); }
        queueMicrotask(() => {
            renderizarPainel();
            if (missao) abrir(missao);
        });
    });
    window.addEventListener('praticas:alteradas', recarregar);
    window.addEventListener('storage', e => { if (e.key?.startsWith('praticasProjetoV1:')) recarregar(); });
    window.addEventListener('focus', recarregar);
    window.addEventListener('cronometro:estado', atualizarControles);
    window.PraticasExecucaoUI = Object.freeze({ abrir, botaoAbrir });
})();
