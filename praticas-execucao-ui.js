(function () {
    'use strict';
    let dialogo, dialogoOcorrencias, painel, conteudo, missaoAtual = null, atividadeAtual = null, contexto, ocupado = false, origemFoco, origemFocoOcorrencias;
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
    function descricaoParametros(p) {
        if (!p) return '';
        const n = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
        return `${p.nome} · ${p.extensao} · duração de referência: ${n(p.alvoSegundos / 60)} min`;
    }
    function perfilFormularioMissao(form) {
        return form.querySelector('select').value === 'linhas'
            ? { versao: 2, base: 'linhas', linhas: Number(form.querySelector('#pratica-missao-linhas').value) }
            : { versao: 2, base: 'tempo-ideal', tempoIdealSegundos: Math.round(Number(form.querySelector('#pratica-missao-ideal').value) * 60) };
    }
    function previaPerfilMissao() {
        const form = dialogo?.querySelector('#pratica-form-preset');
        if (!form) return;
        const valor = form.querySelector('select').value;
        const linhas = form.querySelector('#pratica-missao-linhas'), ideal = form.querySelector('#pratica-missao-ideal');
        linhas.closest('label').hidden = valor !== 'linhas'; ideal.closest('label').hidden = valor !== 'tempo-ideal';
        linhas.disabled = valor !== 'linhas'; ideal.disabled = valor !== 'tempo-ideal';
        linhas.required = valor === 'linhas'; ideal.required = valor === 'tempo-ideal';
        try {
            form.querySelector('[data-previa-preset]').textContent = descricaoParametros(['linhas', 'tempo-ideal'].includes(valor)
                ? window.PraticasProgressao.resolverPerfil(perfilFormularioMissao(form)) : valor ? window.PraticasProgressao.obterPreset(valor) : null);
        } catch (_) { form.querySelector('[data-previa-preset]').textContent = ''; }
    }
    function botao(texto, acao, classe = 'btn btn-outline-primary') {
        const b = el('button', texto, classe); b.type = 'button'; b.addEventListener('click', acao); return b;
    }
    function botaoAbrir(missao) {
        const b = botao('Abrir atividade prática', () => abrir(missao.missaoId));
        window.QuestMarcadores?.vincular(b, 'Missao', missao.missaoId);
        b.setAttribute('aria-label', `Abrir atividade prática ${missao.nome} de ${data(missao.dataPrevista)}`); return b;
    }
    function campo(form, id, rotulo, tipo, atributos = {}) {
        const label = el('label', rotulo, 'pratica-campo'); label.htmlFor = id;
        const input = el(tipo === 'textarea' ? 'textarea' : 'input');
        input.id = id; input.name = id; input.className = 'form-control';
        if (tipo !== 'textarea') input.type = tipo;
        Object.assign(input, atributos); label.append(input); form.append(label); return input;
    }
    function formulario(titulo, nome, campos, enviar, destino = conteudo) {
        const form = el('form', '', 'pratica-form'); form.id = `pratica-form-${nome}`;
        const fs = el('fieldset'); fs.append(el('legend', titulo)); form.append(fs); campos(fs);
        const submit = el('button', 'Salvar', 'btn btn-primary'); submit.type = 'submit'; fs.append(submit);
        form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) executar(nome, () => enviar(form)); });
        destino.append(form); return form;
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
            atualizar(); status('Registro salvo.');
        } catch (erro) { status(erro.message, true); }
        finally { ocupado = false; atualizarControles(); }
    }
    function status(texto, erro = false) {
        if (!dialogo) return;
        const n = dialogo.querySelector('[data-status]');
        n.textContent = texto;
        n.classList.toggle('text-danger', erro);
        n.classList.toggle('text-success', !erro && Boolean(texto) && texto !== 'Salvando…');
    }
    function criarDialogoOcorrencias() {
        dialogoOcorrencias = el('dialog', '', 'pratica-dialogo pratica-ocorrencias-dialogo');
        dialogoOcorrencias.id = 'praticas-ocorrencias-dialog';
        dialogoOcorrencias.setAttribute('aria-labelledby', 'pratica-ocorrencias-titulo');
        const corpo = el('div', '', 'pratica-dialogo-conteudo');
        const topo = el('div', '', 'pratica-topo');
        const titulo = el('h2'); titulo.id = 'pratica-ocorrencias-titulo';
        const fechar = botao('Fechar', () => dialogoOcorrencias.close(), 'btn btn-outline-secondary');
        fechar.dataset.fecharOcorrencias = '';
        topo.append(titulo, fechar);
        const resumo = el('p', '', 'form-text mb-3'); resumo.dataset.ocorrenciasResumo = '';
        const lista = el('ul', '', 'pratica-missoes'); lista.dataset.listaOcorrencias = '';
        corpo.append(topo, resumo, lista);
        dialogoOcorrencias.append(corpo);
        document.body.append(dialogoOcorrencias);
        dialogoOcorrencias.addEventListener('close', () => {
            if (dialogoOcorrencias.open) return;
            atividadeAtual = null;
            origemFocoOcorrencias?.isConnected && origemFocoOcorrencias.focus();
        });
    }
    function criarDialogo() {
        dialogo = el('dialog', '', 'pratica-dialogo'); dialogo.setAttribute('aria-labelledby', 'pratica-titulo');
        conteudo = el('div', '', 'pratica-dialogo-conteudo'); dialogo.append(conteudo);
        const topo = el('div', '', 'pratica-topo'), titulo = el('h2'); titulo.id = 'pratica-titulo';
        const fechar = botao('Fechar', () => dialogo.close(), 'btn btn-outline-secondary'); fechar.dataset.fechar = '';
        topo.append(titulo, fechar); conteudo.append(topo);

        const mensagem = el('p'); mensagem.dataset.status = ''; mensagem.setAttribute('role', 'status'); mensagem.setAttribute('aria-live', 'polite');
        conteudo.append(mensagem);

        const secaoResumo = el('section', '', 'pratica-resumo-dia');
        const grade = el('dl', '', 'pratica-dia-grade');
        for (const [rotulo, chave] of [
            ['Data prevista', 'data'],
            ['Situação', 'situacao'],
            ['Duração prevista', 'previsto'],
            ['Tempo utilizado', 'utilizado']
        ]) {
            const bloco = el('div', '', 'pratica-dia-item');
            const dt = el('dt', rotulo);
            const dd = el('dd', '—'); dd.setAttribute(`data-dia-${chave}`, '');
            bloco.append(dt, dd); grade.append(bloco);
        }
        const resumo = el('p', '', 'visually-hidden'); resumo.dataset.resumo = '';
        const xp = el('p', '', 'pratica-xp-linha mb-1'); xp.dataset.xp = '';
        const aviso = el('p', '', 'form-text mb-0'); aviso.dataset.aviso = '';
        secaoResumo.append(grade, resumo, xp, aviso);
        conteudo.append(secaoResumo);

        const acoesPrincipais = el('div', '', 'pratica-acoes-principais');
        const btnAbrirCronometro = botao('Abrir cronômetro', () => {
            const idAlvo = missaoAtual;
            if (!idAlvo) return;
            if (dialogo?.open) dialogo.close();
            if (dialogoOcorrencias?.open) dialogoOcorrencias.close();
            const painelModal = document.getElementById('praticas-painel-dialog');
            if (painelModal?.open) painelModal.close();
            timer()?.abrirPraticaNoCronometro?.(idAlvo);
        }, 'btn btn-primary');
        btnAbrirCronometro.id = 'pratica-abrir-cronometro';
        btnAbrirCronometro.dataset.abrirCronometro = '';

        const btnConcluir = botao('Concluir atividade', () => {
            executar('conclusao', () => {
                const t = tentativa('conclusao', { missaoId: missaoAtual });
                return api().concluir(missaoAtual, { conclusaoId: t.id, registradoEm: t.registradoEm });
            });
        }, 'btn btn-success');
        btnConcluir.id = 'pratica-concluir';
        btnConcluir.dataset.concluirPratica = '';

        acoesPrincipais.append(btnAbrirCronometro, btnConcluir);
        conteudo.append(acoesPrincipais);

        formulario('Classificar XP desta atividade prática', 'preset', fs => {
            const label = el('label', 'Tipo de produção escrita', 'pratica-campo'); label.htmlFor = 'pratica-missao-preset';
            const select = el('select'); select.id = 'pratica-missao-preset'; select.className = 'form-select'; select.required = true;
            const vazio = el('option', 'Escolha o preset'); vazio.value = ''; select.append(vazio);
            for (const p of window.PraticasProgressao.listarPresets()) {
                const option = el('option', `${p.nome} · ${p.extensao}`); option.value = p.presetId; select.append(option);
            }
            for (const [value, labelTexto] of [['linhas', 'Personalizar pelo número de linhas'], ['tempo-ideal', 'Personalizar pelo tempo ideal']]) {
                const option = el('option', labelTexto); option.value = value; select.append(option);
            }
            const previa = el('p', '', 'form-text'); previa.dataset.previaPreset = '';
            select.addEventListener('change', previaPerfilMissao);
            label.append(select); fs.append(label);
            campo(fs, 'pratica-missao-linhas', 'Extensão de referência (linhas)', 'number', { min: '0.5', step: 'any' }).addEventListener('input', previaPerfilMissao);
            campo(fs, 'pratica-missao-ideal', 'Tempo ideal de referência (minutos)', 'number', { min: '0.0166666667', step: 'any' }).addEventListener('input', previaPerfilMissao);
            fs.append(previa, el('p', 'Para atividade prática já registrada e sem perfil. A escolha é preservada no histórico. Para as próximas, configure o cadastro da atividade.', 'form-text'));
        }, form => ['linhas', 'tempo-ideal'].includes(form.querySelector('select').value)
            ? api().definirPerfil(missaoAtual, perfilFormularioMissao(form)) : api().definirPreset(missaoAtual, form.querySelector('select').value));

        const gavetaAvaliacao = el('details', '', 'pratica-gaveta');
        gavetaAvaliacao.id = 'pratica-gaveta-avaliacao';
        const resumoAvaliacao = el('summary', 'Autoavaliação opcional');
        resumoAvaliacao.dataset.tituloAvaliacao = '';
        gavetaAvaliacao.append(resumoAvaliacao);
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
        }, gavetaAvaliacao);
        conteudo.append(gavetaAvaliacao);

        const historico = el('section', '', 'pratica-historico-secao');
        historico.append(el('h3', 'Histórico de entradas'));
        const lista = el('ul', '', 'pratica-historico'); lista.dataset.historico = ''; historico.append(lista); conteudo.append(historico);
        document.body.append(dialogo);
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
        dialogo.querySelector('[data-abrir-cronometro]').disabled = ocupado || somenteConsulta;
        dialogo.querySelector('[data-concluir-pratica]').disabled = ocupado || somenteConsulta || contexto.missao.concluida;
        dialogo.querySelectorAll('fieldset').forEach(f => { f.disabled = ocupado || somenteConsulta; });
        dialogo.querySelector('#pratica-form-avaliacao fieldset').disabled ||= !contexto.missao.concluida;
        const formPreset = dialogo.querySelector('#pratica-form-preset');
        formPreset.hidden = ['taf', 'simulado'].includes(contexto.missao.tipo) || Boolean(contexto.missao.presetXpId || contexto.missao.perfilXp);
        formPreset.querySelector('fieldset').disabled ||= !contexto.conclusoes.length && !contexto.sessoes.length;
        dialogo.querySelectorAll('[data-excluir]').forEach(b => { b.disabled = ocupado; });
    }
    function atualizar() {
        if (!missaoAtual) return;
        contexto = api().consultar(missaoAtual);
        const m = contexto.missao;
        const p = m.progressao;
        const zonas = {
            'abaixo-piso': 'Tempo abaixo do piso: 1 XP por minuto real.',
            'faixa-operacional': 'Faixa operacional: XP nominal integral.',
            'acima-teto': 'Tempo acima do teto: XP limitado ao nominal.',
            'aguardando-conclusao': 'O XP será calculado após a realização.',
            'sem-preset': 'Sem preset de XP.',
            'tempo-taf': 'TAF: 1 XP por minuto de treinamento registrado.'
        };
        dialogo.querySelector('[data-xp]').textContent = p ? `${p.xp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP · ${zonas[p.zona]}` : '';
        previaPerfilMissao();
        dialogo.querySelector('h2').textContent = m.nome;
        dialogo.querySelector('[data-dia-data]').textContent = data(m.dataPrevista);
        dialogo.querySelector('[data-dia-situacao]').textContent = m.concluida ? 'Concluída' : 'Pendente';
        dialogo.querySelector('[data-dia-previsto]').textContent = m.duracaoPlanejadaSegundos ? tempo(m.duracaoPlanejadaSegundos) : 'Livre / externa';
        dialogo.querySelector('[data-dia-utilizado]').textContent = tempo(m.tempoRegistradoSegundos);
        dialogo.querySelector('[data-resumo]').textContent = `${data(m.dataPrevista)} · ${m.concluida ? 'Concluída' : 'Pendente'} · ${tempo(m.tempoRegistradoSegundos)} registrados${m.duracaoPlanejadaSegundos ? ` · previsão ${tempo(m.duracaoPlanejadaSegundos)}` : ''}`;
        dialogo.querySelector('[data-aviso]').textContent = contexto.removida ? 'Atividade removida. Histórico preservado para consulta e retificação.'
            : m.dataPrevista > api().hoje() ? 'Atividade prática futura: consulta disponível. A realização abre na data prevista.'
            : '';
        const tituloAvaliacao = m.tipo === 'simulado' ? 'Resultado do simulado (opcional)' : 'Autoavaliação opcional';
        dialogo.querySelector('[data-titulo-avaliacao]').textContent = tituloAvaliacao;
        dialogo.querySelector('#pratica-form-avaliacao legend').textContent = tituloAvaliacao;
        dialogo.querySelector('#pratica-gaveta-avaliacao').open = Boolean(m.concluida);
        dialogo.querySelector('[data-concluir-pratica]').textContent = m.concluida ? 'Atividade concluída' : 'Concluir atividade';

        const lista = dialogo.querySelector('[data-historico]'); lista.replaceChildren();
        const entradas = [];
        for (const c of contexto.conclusoes) entradas.push({
            colecao: 'conclusoes', id: c.conclusaoId, instante: c.registradoEm,
            texto: `Concluída em ${data(c.dataRealizacao || window.CalendarioJornada.dataLocal(c.registradoEm))}`
        });
        for (const s of contexto.sessoes) entradas.push({
            colecao: 'sessoes', id: s.sessaoId, instante: s.registradoEm || s.inicio,
            texto: `${tempo(s.duracaoSegundos)} · ${s.origem === 'manual' ? `${data(s.dataEstudo)} · horário não informado` : new Date(s.inicio).toLocaleString('pt-BR')}${s.anotacao ? ` · ${s.anotacao}` : ''}`
        });
        for (const a of contexto.avaliacoes) entradas.push({
            colecao: 'avaliacoes', id: a.avaliacaoId, instante: a.registradoEm,
            texto: `Avaliação${a.nota ? ` · ${a.nota.obtida}/${a.nota.maxima}` : ''}${a.anotacao ? ` · ${a.anotacao}` : ''}`
        });
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
    function atualizarOcorrencias() {
        if (!atividadeAtual || !dialogoOcorrencias) return;
        const proj = window.PraticasStore.projetarMissoesProjeto(window.EstudoStore.obterProjetoAtualId());
        const a = proj.atividades[atividadeAtual];
        if (!a) { dialogoOcorrencias.close(); return; }
        dialogoOcorrencias.querySelector('#pratica-ocorrencias-titulo').textContent = a.nome;
        dialogoOcorrencias.querySelector('[data-ocorrencias-resumo]').textContent =
            `${a.planejadas} ${a.planejadas === 1 ? 'ocorrência prevista' : 'ocorrências previstas'} · ${a.concluidas} ${a.concluidas === 1 ? 'concluída' : 'concluídas'} · ${a.pendentes} ${a.pendentes === 1 ? 'pendente' : 'pendentes'} · ${tempo(a.tempoRegistradoSegundos)} registrados`;
        const lista = dialogoOcorrencias.querySelector('[data-lista-ocorrencias]');
        lista.replaceChildren();
        const missoesDaAtividade = proj.missoes.filter(m => m.atividadeId === atividadeAtual);
        for (const m of missoesDaAtividade) {
            const item = el('li');
            item.dataset.missaoId = m.missaoId;
            const info = el('div', '', 'pratica-ocorrencia-info');
            const cabecalho = el('div', '', 'pratica-ocorrencia-topo');
            cabecalho.append(
                el('strong', `${data(m.dataPrevista)}${m.diaJornada ? ` · Dia ${m.diaJornada.replace(/\D/g, '').padStart(2, '0')}` : ' · Dia de folga'}`),
                el('span', m.concluida ? 'Concluída' : 'Pendente', `pratica-status-badge ${m.concluida ? 'pratica-status-concluida' : 'pratica-status-pendente'}`)
            );
            const detalhes = el('small', `${m.duracaoPlanejadaSegundos ? `Previsão: ${tempo(m.duracaoPlanejadaSegundos)} · ` : ''}Utilizado: ${tempo(m.tempoRegistradoSegundos)}${m.progressao ? ` · ${m.progressao.xp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP` : ''}`);
            info.append(cabecalho, detalhes);
            item.append(info, botaoAbrir(m));
            lista.append(item);
        }
        if (!missoesDaAtividade.length) {
            lista.append(el('li', 'Nenhuma ocorrência agendada para esta atividade.'));
        }
    }
    function abrirOcorrencias(atividadeId, origem = document.activeElement) {
        if (!dialogoOcorrencias) criarDialogoOcorrencias();
        atividadeAtual = atividadeId;
        origemFocoOcorrencias = origem;
        atualizarOcorrencias();
        if (!dialogoOcorrencias.open) dialogoOcorrencias.showModal();
        dialogoOcorrencias.querySelector('[data-fechar-ocorrencias]')?.focus();
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
            else { painel.hidden = false; painel.textContent = erro.message; const lista = document.getElementById('praticas-painel-dialog'); if (lista && !lista.open) lista.showModal(); }
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
            const atividades = Object.values(proj.atividades || {});
            if (!atividades.length && !proj.missoes.length) { painel.append(el('p', 'Nenhuma atividade prática agendada neste projeto.')); return; }
            const grid = el('div', '', 'praticas-tipos-grid');
            for (const a of atividades) {
                const card = el('article', '', 'pratica-tipo-card');
                card.dataset.atividadeCard = a.atividadeId;
                card.tabIndex = 0;
                card.setAttribute('role', 'button');
                card.setAttribute('aria-label', `Ver ocorrências de ${a.nome}`);

                const topo = el('div', '', 'pratica-tipo-card-topo');
                const p = a.progressao;
                topo.append(
                    el('h3', a.nome),
                    el('span', p?.nivel ? `Nível ${p.nivel}` : 'Nível 1', 'pratica-card-nivel')
                );

                const ocorrenciasTexto = `${a.planejadas} ${a.planejadas === 1 ? 'ocorrência' : 'ocorrências'} (${a.concluidas} ${a.concluidas === 1 ? 'concluída' : 'concluídas'} · ${a.pendentes} ${a.pendentes === 1 ? 'pendente' : 'pendentes'})`;
                const meta = el('p', `${ocorrenciasTexto} · ${tempo(a.tempoRegistradoSegundos)} registrados`, 'pratica-tipo-card-meta');

                const blocoNivel = el('div', '', 'pratica-tipo-card-progresso');
                const barra = el('progress', '', 'materia-indicador-barra');
                barra.max = 100;
                barra.value = p?.percentual || 0;
                barra.dataset.barraNivelPratica = '';
                barra.setAttribute('aria-label', `Avanço de nível de ${a.nome}`);

                const textoNivel = p?.nivel
                    ? `Atividade · nível ${p.nivel} · ${p.xp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP${p.nivel === 100 ? ' · nível máximo' : p.xpParaProximoNivel !== null ? ` · faltam ${p.xpParaProximoNivel.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} XP para o próximo nível` : ` · ${p.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% para o próximo nível`}`
                    : '0 XP';
                const xpEl = el('p', textoNivel, 'pratica-tipo-card-xp');
                xpEl.dataset.nivelPratica = '';
                blocoNivel.append(barra, xpEl);

                const acao = el('span', 'Ver ocorrências previstas ', 'pratica-tipo-card-acao');
                acao.append(window.IconesPixel.criar('direita'));
                window.QuestMarcadores?.vincular(acao, 'Atividade', a.atividadeId);
                card.append(topo, meta, blocoNivel, acao);

                const acionar = () => abrirOcorrencias(a.atividadeId, card);
                card.addEventListener('click', acionar);
                card.addEventListener('keydown', event => {
                    if (['Enter', ' '].includes(event.key)) {
                        event.preventDefault();
                        acionar();
                    }
                });
                grid.append(card);
            }
            painel.append(grid);
        } catch (erro) { painel.hidden = false; painel.textContent = `Não foi possível carregar as atividades práticas. ${erro.message}`; }
    }
    function recarregar() {
        renderizarPainel();
        if (dialogoOcorrencias?.open) { try { atualizarOcorrencias(); } catch (_) {} }
        if (dialogo?.open) { try { atualizar(); } catch (erro) { status(erro.message, true); } }
    }
    document.addEventListener('DOMContentLoaded', () => {
        const url = new URL(window.location.href), missao = url.searchParams.get('missao');
        if (missao) { url.searchParams.delete('missao'); history.replaceState(null, '', url); }
        queueMicrotask(() => {
            renderizarPainel();
            if (missao) abrir(missao);
            if (url.searchParams.get('praticas') === '1') {
                document.getElementById('abrir-praticas')?.click();
                url.searchParams.delete('praticas'); history.replaceState(null, '', url);
            }
        });
    });
    window.addEventListener('praticas:alteradas', recarregar);
    window.addEventListener('storage', e => { if (e.key?.startsWith('praticasProjetoV1:')) recarregar(); });
    window.addEventListener('focus', recarregar);
    window.addEventListener('cronometro:estado', atualizarControles);
    window.PraticasExecucaoUI = Object.freeze({ abrir, abrirOcorrencias, botaoAbrir });
})();
