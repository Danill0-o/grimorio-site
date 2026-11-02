/* D040/E3–E8: cadastro, agendamento/capacidade, referências de duração e presets de XP. */
(function () {
    'use strict';
    const tipos = { peca: 'Peça prática (cadastro existente)', redacao: 'Redação', discursiva: 'Questões discursivas', 'estudo-caso': 'Estudo de caso',
        sentenca: 'Sentença', parecer: 'Parecer', simulado: 'Simulado', taf: 'TAF', outra: 'Outra atividade prática' };
    const nomesPeriodicidade = { semanal: 'Semanal', quinzenal: 'Quinzenal (14 dias)', mensal: 'Mensal (28 dias)' };
    const ordemDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const rotuloDia = dia => dia === 'Sab' ? 'Sáb' : dia;
    const el = id => document.getElementById(id);
    let projetoId, estado, edicao = null, novoId = null, ocupado = false, leituraValida = false;
    let diasSelecionados = new Set(), materiasEstagioSelecionadas = new Set();
    let modoAnterior = '', referenciaAnterior = false, duracaoManualAnterior = '';
    const visivel = elemento => elemento && !elemento.closest('[hidden]');
    const focar = elemento => { if (visivel(elemento)) elemento.focus(); };

    function mensagem(textoMsg, campo) {
        el('pratica-erro').textContent = textoMsg;
        if (!visivel(el('praticas-cadastro'))) el('wizard-erro').textContent = textoMsg;
        if (campo) {
            campo.setAttribute('aria-invalid', 'true');
            campo.setAttribute('aria-describedby', [...new Set((campo.getAttribute('aria-describedby') || '').split(' ').filter(Boolean).concat('pratica-erro'))].join(' '));
        }
        focar(campo || el('pratica-erro'));
        return false;
    }
    function limparErro() {
        el('pratica-erro').textContent = '';
        el('pratica-form').querySelectorAll('[aria-invalid]').forEach(campo => {
            campo.removeAttribute('aria-invalid');
            const descricao = (campo.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== 'pratica-erro').join(' ');
            if (descricao) campo.setAttribute('aria-describedby', descricao); else campo.removeAttribute('aria-describedby');
        });
    }
    function texto(tag, conteudo) {
        const elemento = document.createElement(tag); elemento.textContent = conteudo; return elemento;
    }
    function alternarSubgrupo(grupo, mostrar) {
        if (!grupo) return;
        grupo.hidden = !mostrar;
        grupo.disabled = !mostrar || ocupado || !leituraValida;
        grupo.querySelectorAll('button, input, select').forEach(c => {
            c.disabled = !mostrar || ocupado || !leituraValida;
        });
    }
    function lerJsonProjeto(chave, padrao) {
        try {
            const raw = (window.ProjetoStorage || localStorage).getItem(chave);
            return raw ? JSON.parse(raw) : padrao;
        } catch (_) { return padrao; }
    }
    function obterDiasRotina() {
        const marcados = ordemDias.filter(d => el(`btn-${d}`)?.checked);
        if (marcados.length) return marcados;
        const dados = lerJsonProjeto('dadosExame', null);
        return Array.isArray(dados?.listaDiaDaSemana) ? ordemDias.filter(d => dados.listaDiaDaSemana.includes(d)) : [];
    }
    function obterDatasProjeto() {
        const dados = lerJsonProjeto('dadosExame', null);
        const converter = br => typeof br === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(br) ? br.split('/').reverse().join('-') : '';
        return {
            dataInicio: el('dataInicio')?.value || converter(dados?.dataInicioF) || '',
            dataFinal: el('dataFinal')?.value || converter(dados?.dataFinalF) || ''
        };
    }
    function obterMinutosEBlocosRotina() {
        const dados = lerJsonProjeto('dadosExame', null);
        const horasTexto = el('horas-por-dia')?.value || dados?.horasPorDia || '';
        let minutosPorDia = Number(dados?.minutosPorDia) || 0;
        if (/^\d{2}:\d{2}$/.test(horasTexto)) {
            const [h, m] = horasTexto.split(':').map(Number);
            minutosPorDia = h * 60 + m;
        }
        const blocosPorDia = Number(el('blocos-por-dia')?.value) || Number(dados?.blocosPorDia ?? dados?.materiasPorDia) || 1;
        return { minutosPorDia, blocosPorDia };
    }
    function obterMateriasProjeto() {
        const linhas = [...(el('table-body')?.querySelectorAll('tr') || [])];
        if (linhas.length) {
            return linhas.map(linha => {
                const celulas = linha.querySelectorAll('td');
                const afTexto = celulas[4]?.textContent || 'Média';
                const afinidade = afTexto === 'Baixa' ? 0.5 : afTexto === 'Alta' ? 1.5 : 1.0;
                return {
                    projetoMateriaId: linha.dataset.projetoMateriaId || '',
                    Materia: celulas[1]?.textContent?.trim() || '',
                    Nquestoes: Number(celulas[2]?.textContent) || 0,
                    peso: Number(celulas[3]?.textContent) || 1,
                    afinidade
                };
            }).filter(m => m.projetoMateriaId && m.Materia);
        }
        const salvas = lerJsonProjeto('objetosSalvos', []);
        return Array.isArray(salvas) ? salvas.filter(m => m?.projetoMateriaId && m?.Materia) : [];
    }
    function gerarPlanoTeoricoBaseEmMemoria(dataInicio, dataFinal, diasRotina, minutosPorDia, blocosPorDia, materias) {
        if (!window.DistribuicaoEstudos?.gerar || !materias.length) return null;
        const normalizadas = materias.map(m => {
            const n = Number(m.Nquestoes) || 0, p = Number(m.peso) || 1, af = Number(m.afinidade) || 1;
            const pesoQuestoes = af === 0.5 ? Math.ceil(n * p + n * 0.5)
                : af === 1.5 ? Math.ceil(n * p - n / 2) : Math.ceil(n * p);
            return { Materia: m.Materia, projetoMateriaId: m.projetoMateriaId, pesoQuestoes };
        }).sort((a, b) => b.pesoQuestoes - a.pesoQuestoes);
        if (!normalizadas.some(m => m.pesoQuestoes > 0)) return null;
        const rotinaSet = new Set(diasRotina);
        const inicio = new Date(`${dataInicio}T12:00:00.000Z`), fim = new Date(`${dataFinal}T12:00:00.000Z`);
        let diasEstudoPraProva = 0;
        for (const d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
            if (rotinaSet.has(ordemDias[d.getUTCDay()])) diasEstudoPraProva++;
        }
        if (diasEstudoPraProva < 1) return null;
        return window.DistribuicaoEstudos.gerar({
            distribuicaoVersao: 3,
            minutosPorDia,
            blocosPorDia,
            diasEstudoPraProva
        }, normalizadas).materiaDoDia;
    }
    function renderizarBotoesDias() {
        const container = el('pratica-dias-semana');
        if (!container) return;
        const taf = el('pratica-tipo')?.value === 'taf';
        const rotinaSet = new Set(obterDiasRotina());

        const agendamentoAtivo = Boolean(el('pratica-periodicidade')?.value);
        if (container.children.length !== ordemDias.length) {
            container.replaceChildren(...ordemDias.map(dia => {
                const botao = texto('button', rotuloDia(dia));
                botao.type = 'button';
                botao.className = 'btn btn-outline-secondary pratica-dia-btn';
                botao.dataset.praticaDia = dia;
                botao.addEventListener('click', () => {
                    if (botao.disabled) return;
                    if (diasSelecionados.has(dia)) diasSelecionados.delete(dia);
                    else diasSelecionados.add(dia);
                    limparErro();
                    renderizarBotoesDias();
                });
                return botao;
            }));
        }
        Array.from(container.children).forEach((botao, idx) => {
            const dia = ordemDias[idx];
            const permitido = true;
            const ativo = permitido && diasSelecionados.has(dia);
            botao.setAttribute('aria-pressed', String(ativo));
            botao.disabled = el('pratica-periodicidade').value === 'automatica' || !agendamentoAtivo || ocupado || !leituraValida || !permitido;
        });
        if (el('pratica-dias-ajuda')) {
            el('pratica-dias-ajuda').textContent = taf
                ? 'O TAF pode ser agendado em qualquer dia da semana, inclusive em folgas da rotina teórica.'
                : 'Você também pode escolher dias de folga das matérias.';
        }
    }
    function renderizarBotoesMateriasEstagio() {
        const container = el('pratica-estagio-materias');
        if (!container) return;
        const materias = obterMateriasProjeto();
        const idsDisponiveis = new Set(materias.map(m => m.projetoMateriaId));
        const agendamentoAtivo = Boolean(el('pratica-periodicidade')?.value);
        const modoEstagio = agendamentoAtivo && el('pratica-inicio-modo')?.value === 'estagio';
        const chaveAtual = Array.from(container.children).map(b => b.dataset?.projetoMateriaId || '').join('|');
        const chaveNova = materias.map(m => m.projetoMateriaId).join('|');
        if (chaveAtual !== chaveNova || container.children.length !== materias.length) {
            container.replaceChildren(...materias.map(m => {
                const botao = texto('button', m.Materia);
                botao.type = 'button';
                botao.className = 'btn btn-outline-secondary pratica-materia-btn';
                botao.dataset.projetoMateriaId = m.projetoMateriaId;
                botao.addEventListener('click', () => {
                    if (botao.disabled) return;
                    if (materiasEstagioSelecionadas.has(m.projetoMateriaId)) materiasEstagioSelecionadas.delete(m.projetoMateriaId);
                    else materiasEstagioSelecionadas.add(m.projetoMateriaId);
                    limparErro();
                    renderizarBotoesMateriasEstagio();
                });
                return botao;
            }));
        }
        Array.from(container.children).forEach((botao, idx) => {
            const m = materias[idx];
            if (!m) return;
            const selecionado = materiasEstagioSelecionadas.has(m.projetoMateriaId);
            botao.textContent = m.Materia;
            botao.setAttribute('aria-pressed', String(selecionado));
            botao.disabled = !modoEstagio || ocupado || !leituraValida;
        });
        if (el('pratica-estagio-ajuda')) {
            const orfas = [...materiasEstagioSelecionadas].filter(id => !idsDisponiveis.has(id));
            el('pratica-estagio-ajuda').textContent = !materias.length
                ? 'Adicione as matérias acima e escolha quais deseja estudar antes de iniciar a atividade.'
                : orfas.length
                    ? 'Alguma matéria selecionada anteriormente não está mais no projeto; confirme as matérias de referência.'
                    : 'Exemplo: 50% significa começar na data em que você terá estudado metade do conteúdo planejado das matérias escolhidas, se seguir o cronograma. A data não muda automaticamente com seu progresso real.';
        }
    }
    function atualizarAgendamentoUI() {
        const taf = el('pratica-tipo').value === 'taf';
        el('pratica-periodicidade').querySelector('[value="automatica"]').disabled = taf;
        if (taf && el('pratica-periodicidade').value === 'automatica') el('pratica-periodicidade').value = '';
        const periodicidade = el('pratica-periodicidade')?.value || '', automatico = periodicidade === 'automatica';
        if (automatico && modoAnterior !== periodicidade) {
            el('pratica-duracao-referencia').checked = el('pratica-tipo').value !== 'simulado';
            if (!el('pratica-preset-xp').value) {
                const sugeridos = {redacao:'redacao-dissertativa-v2',discursiva:'discursiva-curta-v2','estudo-caso':'estudo-caso-parecer-v2',parecer:'estudo-caso-parecer-v2',peca:'peca-pratica-v2',sentenca:'peca-pratica-v2'};
                el('pratica-preset-xp').value = sugeridos[el('pratica-tipo').value] || '';
            }
        }
        modoAnterior = periodicidade;
        el('pratica-automatico-ajuda').hidden = !automatico;
        el('pratica-dias-semana').closest('.pratica-dias-bloco').hidden = automatico;
        el('pratica-total-grupo').hidden = automatico;
        el('pratica-total').disabled = ocupado || !leituraValida || automatico;
        el('pratica-pontos').required = automatico;
        el('pratica-importancia-ajuda').textContent = automatico
            ? 'Informe os pontos totais desta atividade na prova. O denominador será calculado com todas as matérias e práticas na revisão; não é necessário informar o total.'
            : 'Informe os dois valores ou deixe ambos em branco. A pontuação não define o tempo de estudo.';
        const agendamentoAtivo = Boolean(periodicidade);
        const modoInicio = el('pratica-inicio-modo')?.value || 'inicio';
        const { dataInicio, dataFinal } = obterDatasProjeto();
        if (el('pratica-inicio-data')) {
            if (dataInicio) el('pratica-inicio-data').min = dataInicio; else el('pratica-inicio-data').removeAttribute('min');
            if (dataFinal) el('pratica-inicio-data').max = dataFinal; else el('pratica-inicio-data').removeAttribute('max');
        }
        alternarSubgrupo(el('pratica-agendamento-detalhes'), agendamentoAtivo);
        alternarSubgrupo(el('pratica-inicio-data-grupo'), agendamentoAtivo && modoInicio === 'data');
        alternarSubgrupo(el('pratica-inicio-estagio-grupo'), agendamentoAtivo && modoInicio === 'estagio');
        el('pratica-estagio-percentual-grupo').hidden = el('pratica-estagio-preset').value !== 'personalizado';
        renderizarBotoesDias();
        renderizarBotoesMateriasEstagio();
    }
    function controles() {
        const editorAberto = !el('pratica-editor').hidden;
        el('pratica-campos').disabled = ocupado || !leituraValida;
        el('pratica-adicionar').disabled = ocupado || !leituraValida || editorAberto;
        el('praticas-lista').querySelectorAll('button').forEach(b => { b.disabled = ocupado || !leituraValida || editorAberto; });
        el('pratica-adicionar').setAttribute('aria-expanded', String(editorAberto));
        el('pratica-form').setAttribute('aria-busy', String(ocupado));
        atualizarAgendamentoUI();
        atualizarPresetUI();
        atualizarDuracaoReferencia();
    }
    function dadosReferencia() {
        const valor = el('pratica-preset-xp').value;
        return {tipo:el('pratica-tipo').value,...(['linhas','tempo-ideal'].includes(valor) ? {perfilXp:perfilDoFormulario()}
            : valor ? {presetXpId:valor} : {})};
    }
    function atualizarDuracaoReferencia() {
        const check = el('pratica-duracao-referencia'), input = el('pratica-duracao'), taf = el('pratica-tipo').value === 'taf';
        check.disabled = ocupado || !leituraValida || taf;
        if (taf) check.checked = false;
        if (check.checked && !referenciaAnterior) duracaoManualAnterior = input.value;
        if (!check.checked && referenciaAnterior) input.value = duracaoManualAnterior;
        referenciaAnterior = check.checked;
        input.disabled = ocupado || !leituraValida || check.checked;
        if (!check.checked) return;
        try {
            input.value = String(window.PraticasRecomendacoes.duracaoReferencia(dadosReferencia())/60);
            el('pratica-duracao-ajuda').textContent = 'Duração ideal aplicada à reserva de capacidade. O tempo real será registrado separadamente; desmarque para ajustar a estimativa.';
        } catch (_) { input.value = ''; el('pratica-duracao-ajuda').textContent = 'Escolha uma referência de linhas ou tempo ideal abaixo para aplicar a duração da tabela.'; }
    }
    function atualizarPresetUI() {
        const select = el('pratica-preset-xp');
        const semRegra = ['taf','simulado'].includes(el('pratica-tipo').value);
        if (semRegra) select.value = '';
        select.disabled = ocupado || !leituraValida || semRegra;
        const personalizado = ['linhas','tempo-ideal'].includes(select.value);
        el('pratica-xp-personalizado').hidden = !personalizado;
        el('pratica-xp-linhas-grupo').hidden = select.value !== 'linhas';
        el('pratica-xp-tempo-grupo').hidden = select.value !== 'tempo-ideal';
        el('pratica-xp-linhas').disabled = ocupado || !leituraValida || select.value !== 'linhas';
        el('pratica-xp-tempo').disabled = ocupado || !leituraValida || select.value !== 'tempo-ideal';
        let p = null;
        try { p = personalizado ? window.PraticasProgressao.resolverPerfil(perfilDoFormulario())
            : select.value ? window.PraticasProgressao.obterPreset(select.value) : null; } catch (_) {}
        el('pratica-preset-xp-ajuda').textContent = p
            ? p.extensao + '. Escolha a referência que melhor corresponde à atividade.'
            : el('pratica-tipo').value === 'taf' ? 'Registre o tempo após o treinamento.'
            : semRegra ? 'Informe acima a duração da prova que deseja simular.'
            : 'Escolha uma referência de extensão ou informe o tempo estimado.';
    }
    function perfilDoFormulario() {
        return el('pratica-preset-xp').value === 'linhas'
            ? {versao:2,base:'linhas',linhas:Number(el('pratica-xp-linhas').value)}
            : {versao:2,base:'tempo-ideal',tempoIdealSegundos:Math.round(Number(el('pratica-xp-tempo').value)*60)};
    }
    function atualizarTipo() {
        const tipoEscolhido=el('pratica-tipo').value;
        const nomeLivre=tipoEscolhido==='outra';
        el('pratica-detalhes').hidden=!tipoEscolhido;
        el('pratica-nome-grupo').hidden=!nomeLivre;
        el('pratica-nome').required=nomeLivre;
        el('pratica-nome').disabled=!nomeLivre;
        el('pratica-salvar').hidden=!tipoEscolhido;
        el('pratica-preset-xp').closest('label').hidden=['taf','simulado'].includes(tipoEscolhido);
        el('pratica-duracao-referencia').closest('label').hidden=['taf','simulado'].includes(tipoEscolhido);
        el('pratica-pontos').closest('fieldset').hidden=tipoEscolhido==='taf';
        if(tipoEscolhido==='taf') { el('pratica-pontos').value=''; el('pratica-total').value=''; }
        if(tipoEscolhido==='simulado') { el('pratica-duracao-referencia').checked=false; }

        const taf = el('pratica-tipo').value === 'taf';
        el('pratica-duracao').required = !taf;
        el('pratica-duracao-rotulo').textContent = taf ? 'Duração estimada (minutos, opcional)' : 'Duração planejada (minutos)';
        el('pratica-duracao-ajuda').textContent = taf
            ? 'O TAF é externo à carga de estudo. A estimativa é opcional e não ativa cronômetro.'
            : 'Informe sua estimativa. Na prévia de capacidade, práticas internas reservam tempo antes dos blocos teóricos.';
        const possuiMissoes = edicao && Object.values(estado?.missoes || {}).some(m => m.atividadeId === edicao.atividade.atividadeId);
        el('pratica-tipo').disabled = Boolean(possuiMissoes);
        el('pratica-tipo-ajuda').textContent = possuiMissoes ? 'O tipo é preservado porque esta atividade já possui atividades práticas.' : '';
        atualizarAgendamentoUI();
        atualizarPresetUI();
        atualizarDuracaoReferencia();
        atualizarTempoProva();
    }
    function atualizarTempoProva() {
        const check = el('pratica-tempo-prova'), grupo = el('pratica-tempo-prova-grupo');
        const simulado = el('pratica-tipo').value === 'simulado';
        grupo.hidden = !simulado;
        const minutos = Number(el('duracao-prova').value);
        const valido = Number.isSafeInteger(minutos * 60) && minutos > 0 && el('duracao-prova').checkValidity();
        check.disabled = ocupado || !leituraValida || !valido;
        check.title = valido ? '' : 'Informe a duração da prova na etapa Projeto para usar esta opção.';
        if (!simulado || !valido) check.checked = false;
        if (check.checked) el('pratica-duracao').value = String(minutos);
        el('pratica-duracao').readOnly = check.checked;
    }
    function duracaoTexto(segundos) {
        if (segundos === null) return 'Duração não informada';
        return `${Math.floor(segundos / 60)} min${segundos % 60 ? ` ${segundos % 60} s` : ''}`;
    }
    function dataTextoBR(iso) {
        return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : String(iso || '');
    }
    function textoAgendamento(atividade) {
        const ag = atividade.agendamento;
        if (!ag) return '';
        const dias = (ag.diasSemana || []).map(rotuloDia).join(', ');
        const inicio = ag.inicio.modo === 'inicio' ? 'início do projeto'
            : ag.inicio.modo === 'data' ? `a partir de ${dataTextoBR(ag.inicio.dataInicio)}`
            : `após ${ag.inicio.percentual.toLocaleString('pt-BR')}% do estágio planejado`;
        return ag.modo === 'automatico' ? ` · Automática pelo peso na prova (${inicio})` : ` · ${nomesPeriodicidade[ag.periodicidade] || ag.periodicidade} (${dias}; ${inicio})`;
    }
    function detalhe(atividade) {
        const importancia = atividade.importanciaProva;
        return `${tipos[atividade.tipo]} · ${duracaoTexto(atividade.duracaoPlanejadaSegundos)}${atividade.tipo === 'taf' ? ' · Externo à carga de estudo' : ''}`
            + (importancia ? ` · ${importancia.pontos.toLocaleString('pt-BR')} / ${importancia.total.toLocaleString('pt-BR')} pontos na prova` : '')
            + textoAgendamento(atividade);
    }
    function calcularPreviaCapacidadeAtual(atividadesAtivas) {
        const lista = atividadesAtivas || Object.values(estado?.atividades || {}).filter(r => !r.removida).map(r => r.atividade);
        if (!lista.some(a => a.agendamento) || !window.AtividadesPraticas?.planejarCapacidadePraticas) return null;
        const { dataInicio, dataFinal } = obterDatasProjeto();
        const diasRotina = obterDiasRotina();
        const { minutosPorDia, blocosPorDia } = obterMinutosEBlocosRotina();
        if (!dataInicio || !dataFinal || dataInicio > dataFinal || !diasRotina.length || !(minutosPorDia > 0)) return null;
        const materias = obterMateriasProjeto();
        const precisaEstagio = lista.some(a => a.agendamento?.inicio?.modo === 'estagio');
        const planoTeoricoBase = precisaEstagio || materias.length
            ? gerarPlanoTeoricoBaseEmMemoria(dataInicio, dataFinal, diasRotina, minutosPorDia, blocosPorDia, materias)
            : undefined;
        if (precisaEstagio && !planoTeoricoBase) {
            return { erro: 'Adicione as matérias teóricas com questões válidas para calcular a data de início por estágio planejado.' };
        }
        try {
            return {
                previa: window.AtividadesPraticas.planejarCapacidadePraticas({
                    projetoId,
                    dataInicio,
                    dataFinal,
                    diasRotina,
                    disponibilidadeDiariaSegundos: Math.round(minutosPorDia * 60),
                    blocosPorDia,
                    atividades: lista,
                    ...(lista.some(a=>a.agendamento?.modo==='automatico') ? {missoesPreservadas:window.PraticasStore.obterMissoesProtegidas(projetoId,lista)} : {}),
                    ...(materias.length ? {materiasProva:materias} : {}),
                    ...(planoTeoricoBase ? { planoTeoricoBase } : {}),
                    totalMaterias: materias.length
                })
            };
        } catch (erro) {
            return { erro: erro.message.replace(/^Atividades práticas:\s*/, '') };
        }
    }
    function renderizarBlocoPrevia(container, resultado) {
        if (!container) return;
        if (!resultado) {
            container.hidden = true;
            container.replaceChildren();
            return;
        }
        container.hidden = false;
        if (resultado.erro) {
            container.replaceChildren(
                texto('h4', 'Como ficam suas atividades'),
                texto('p', `Não foi possível calcular a prévia: ${resultado.erro}`)
            );
            return;
        }
        const { previa } = resultado;
        const r = previa.resumo;
        const itens = previa.atividades.filter(a => a.agendada).map(a => {
            const inicioInfo = a.diaJornadaInicio
                ? `${dataTextoBR(a.dataInicioAtiva)} (${a.diaJornadaInicio.replace('dia', 'Dia ')})`
                : dataTextoBR(a.dataInicioAtiva);
            const cargaInfo = a.consomeCargaEstudo
                ? ` · reserva ${duracaoTexto(a.tempoPlanejadoTotalSegundos)}`
                : ' · externo à carga teórica';
            const rec = a.recomendacao;
            const comparacao = rec?.manual ? ` · sugestão: ${rec.quantidade} vezes no período` : '';
            return texto('li', `${a.nome}: ${a.totalMissoes} ${a.totalMissoes === 1 ? 'atividade prevista' : 'atividades previstas'} a partir de ${inicioInfo}${cargaInfo}${comparacao}`);
        });
        const listaMissoes = document.createElement('ul');
        listaMissoes.append(...itens);
        const elementos = [
            texto('h4', 'Como ficam suas atividades'),
            texto('p', `Tempo reservado para atividades no período: ${duracaoTexto(r.tempoTotalReservadoPraticasSegundos)}. Os demais horários serão usados para as matérias.`),
            listaMissoes
        ];
        if (r.diasComExcessoPraticas > 0) {
            elementos.push(texto('p', `Aviso de capacidade: em ${r.diasComExcessoPraticas} ${r.diasComExcessoPraticas === 1 ? 'dia' : 'dias'}, as práticas internas ultrapassam a disponibilidade diária em ${duracaoTexto(r.tempoTotalExcessoPraticasSegundos)} e zeram os blocos teóricos da data.`));
        }
        if (r.capacidadeInsuficiente) {
            elementos.push(texto('p', r.semBlocosTeoricos
                ? 'Capacidade teórica insuficiente: não restam blocos teóricos disponíveis no período após reservar as práticas internas.'
                : `Capacidade teórica insuficiente: restam ${r.totalBlocosNormaisRestantes} blocos teóricos para ${r.totalMaterias} matérias cadastradas.`));
        }
        container.replaceChildren(...elementos);
    }
    function renderizar() {
        const registros = Object.values(estado.atividades).filter(r => !r.removida);
        el('praticas-lista').replaceChildren(...registros.map(registro => {
            const a = registro.atividade, item = document.createElement('li');
            item.className = 'pratica-cartao'; item.dataset.atividadeId = a.atividadeId;
            const etiqueta = texto('span', a.agendamento ? 'Agendada' : 'Sem frequência');
            etiqueta.className = 'pratica-etiqueta';
            const acoes = document.createElement('div'); acoes.className = 'pratica-acoes';
            for (const [rotulo, acao] of [['Editar', () => abrir(registro)], ['Remover', () => remover(registro)]]) {
                const botao = texto('button', rotulo); botao.type = 'button'; botao.className = 'btn btn-outline-secondary';
                botao.setAttribute('aria-label', `${rotulo} atividade ${a.nome}`); botao.addEventListener('click', acao); acoes.append(botao);
            }
            item.append(texto('h4', a.nome), etiqueta, texto('p', detalhe(a)), acoes); return item;
        }));
        el('pratica-status').textContent = registros.length
            ? `${registros.length} ${registros.length === 1 ? 'atividade prática salva.' : 'atividades práticas salvas.'}` : 'Nenhuma atividade prática cadastrada.';
        el('praticas-resumo').hidden = registros.length === 0;
        el('praticas-resumo-lista').replaceChildren(...registros.map(r => texto('li', `${r.atividade.nome} — ${detalhe(r.atividade)}`)));
        const previa = calcularPreviaCapacidadeAtual(registros.map(r => r.atividade));
        renderizarBlocoPrevia(el('praticas-previa-capacidade'), previa);
        renderizarBlocoPrevia(el('praticas-resumo-capacidade'), previa);
        atualizarTipo(); controles();
    }
    function carregar() {
        try {
            if (!window.PraticasStore) throw new Error('Armazenamento de atividades práticas indisponível.');
            estado = window.PraticasStore.obterEstado(projetoId);
            leituraValida = true; renderizar();
            el('pratica-recarregar').hidden = true;
            return true;
        } catch (_) {
            leituraValida = false; controles();
            el('pratica-recarregar').hidden = false;
            el('pratica-status').textContent = '';
            mensagem('Não foi possível ler as atividades práticas. Os dados foram preservados. Tente recarregar o cadastro.');
            return false;
        }
    }
    function abrir(registro = null) {
        if (ocupado || !leituraValida) return;
        if (!carregar()) return;
        if (registro) {
            registro = estado.atividades[registro.atividade.atividadeId];
            if (!registro || registro.removida) return mensagem('Esta atividade não está mais disponível no cadastro.');
        }
        limparErro();
        edicao = registro;
        novoId = registro ? null : `atividade-${window.crypto.randomUUID()}`;
        const a = registro?.atividade;
        if(a?.tipo!=='peca') el('pratica-tipo').querySelector('[value=peca]')?.remove();
        const ag = a?.agendamento || null;
        el('pratica-form').reset();
        el('pratica-nome').value = a?.nome || '';
        if (a?.tipo === 'peca' && !el('pratica-tipo').querySelector('[value=peca]')) { const legada=texto('option','Peça prática (cadastro existente)'); legada.value='peca'; el('pratica-tipo').append(legada); }
        el('pratica-tipo').value = a?.tipo || '';
        if (a?.presetXpId && ![...el('pratica-preset-xp').options].some(o=>o.value===a.presetXpId)) {
            const p = window.PraticasProgressao.obterPreset(a.presetXpId), option = texto('option',`${p.nome} (parâmetros anteriores)`);
            option.value = a.presetXpId; el('pratica-preset-xp').append(option);
        }
        el('pratica-preset-xp').value = a?.presetXpId || '';
        if (a?.perfilXp) {
            el('pratica-preset-xp').value = a.perfilXp.base;
            el('pratica-xp-linhas').value = a.perfilXp.linhas ?? '';
            el('pratica-xp-tempo').value = a.perfilXp.tempoIdealSegundos ? a.perfilXp.tempoIdealSegundos/60 : '';
        }
        el('pratica-duracao').value = a?.duracaoPlanejadaSegundos == null ? '' : String(a.duracaoPlanejadaSegundos / 60);
        el('pratica-pontos').value = a?.pesoProva ?? a?.importanciaProva?.pontos ?? '';
        el('pratica-total').value = a?.importanciaProva?.total ?? '';
        el('pratica-periodicidade').value = ag?.modo === 'automatico' ? 'automatica' : ag?.periodicidade || '';
        modoAnterior = el('pratica-periodicidade').value;
        el('pratica-duracao-referencia').checked = a?.duracaoModo === 'referencia';
        referenciaAnterior = el('pratica-duracao-referencia').checked; duracaoManualAnterior = el('pratica-duracao').value;
        diasSelecionados = new Set(ag?.diasSemana || []);
        const modoInicio = ag?.inicio?.modo || 'inicio';
        el('pratica-inicio-modo').value = modoInicio;
        el('pratica-inicio-data').value = ag?.inicio?.modo === 'data' ? ag.inicio.dataInicio : (obterDatasProjeto().dataInicio || '');
        const pct = ag?.inicio?.modo === 'estagio' ? ag.inicio.percentual : 50;
        el('pratica-estagio-percentual').value = String(pct);
        el('pratica-estagio-preset').value = ['25', '50', '75'].includes(String(pct)) ? String(pct) : 'personalizado';
        materiasEstagioSelecionadas = new Set(ag?.inicio?.modo === 'estagio' ? ag.inicio.projetoMateriaIds : []);
        el('pratica-editor-titulo').textContent = registro ? 'Editar atividade prática' : 'Nova atividade prática';
        el('pratica-editor').hidden = false;
        atualizarTipo(); controles(); focar(el('pratica-tipo'));
    }
    function fechar() {
        edicao = null; novoId = null;
        diasSelecionados.clear(); materiasEstagioSelecionadas.clear();
        el('pratica-form').reset(); el('pratica-editor').hidden = true;
        modoAnterior = ''; referenciaAnterior = false; duracaoManualAnterior = '';
        atualizarTipo(); controles();
    }
    function dadosDoFormulario() {
        const automatico = el('pratica-periodicidade').value === 'automatica';
        const referencia = el('pratica-duracao-referencia').checked;
        if (referencia) {
            try { el('pratica-duracao').value = String(window.PraticasRecomendacoes.duracaoReferencia(dadosReferencia())/60); }
            catch (erro) { return mensagem(erro.message,el('pratica-preset-xp')); }
        }
        for (const campo of el('pratica-form').querySelectorAll('input, select')) {
            if (!campo.disabled && !campo.checkValidity()) return mensagem('Confira o valor deste campo.', campo);
        }
        const tipo = el('pratica-tipo').value;
        const nome = tipo === 'outra' ? el('pratica-nome').value.trim() : (tipos[tipo] || edicao?.atividade.nome);
        if (!tipo) return mensagem('Escolha a atividade.',el('pratica-tipo'));
        if (!nome) return mensagem('Informe o nome da atividade.', el('pratica-nome'));
        const valor = el('pratica-duracao').value;
        let duracaoPlanejadaSegundos = null;
        if (valor !== '') {
            const segundos = Number(valor) * 60, inteiro = Math.round(segundos);
            if (!Number.isSafeInteger(inteiro) || inteiro <= 0 || Math.abs(segundos - inteiro) > 1e-7) {
                return mensagem('Informe uma duração positiva que corresponda a segundos inteiros.', el('pratica-duracao'));
            }
            duracaoPlanejadaSegundos = inteiro;
        } else if (tipo !== 'taf') return mensagem('Informe a duração planejada.', el('pratica-duracao'));
        const pontos = el('pratica-pontos').value, total = el('pratica-total').value;
        let importanciaProva = null;
        if (automatico) {
            if (pontos === '' || !Number.isFinite(Number(pontos)) || Number(pontos)<0) return mensagem('Informe os pontos da atividade na prova.',el('pratica-pontos'));
        } else if (pontos !== '' || total !== '') {
            if (pontos === '' || total === '') return mensagem('Preencha os pontos da atividade e o total da prova, ou deixe ambos em branco.', el(pontos === '' ? 'pratica-pontos' : 'pratica-total'));
            importanciaProva = { pontos: Number(pontos), total: Number(total) };
            if (!Number.isFinite(importanciaProva.pontos) || !Number.isFinite(importanciaProva.total)
                || importanciaProva.total <= 0 || importanciaProva.pontos < 0 || importanciaProva.pontos > importanciaProva.total) {
                return mensagem('Os pontos devem estar entre zero e o total da prova, e o total deve ser maior que zero.', el('pratica-pontos'));
            }
        }
        const periodicidade = el('pratica-periodicidade').value;
        if (!el('pratica-periodicidade').value) return mensagem('Escolha a frequência da atividade.', el('pratica-periodicidade'));
        let agendamento = null;
        if (periodicidade) {
            const diasRotina = obterDiasRotina();
            const diasSemana = ordemDias.filter(d => diasSelecionados.has(d));
            if (!automatico && !diasSemana.length) {
                return mensagem('Selecione pelo menos um dia da semana para o agendamento.',
                    el('pratica-dias-semana').querySelector('button:not(:disabled)') || el('pratica-periodicidade'));
            }
            const modoInicio = el('pratica-inicio-modo').value;
            let inicio = { modo: 'inicio' };
            if (modoInicio === 'data') {
                const dataEscolhida = el('pratica-inicio-data').value;
                if (!dataEscolhida) return mensagem('Informe a data planejada de início da atividade.', el('pratica-inicio-data'));
                const { dataInicio, dataFinal } = obterDatasProjeto();
                if ((dataInicio && dataEscolhida < dataInicio) || (dataFinal && dataEscolhida > dataFinal)) {
                    return mensagem('A data planejada de início deve estar dentro do período do projeto.', el('pratica-inicio-data'));
                }
                inicio = { modo: 'data', dataInicio: dataEscolhida };
            } else if (modoInicio === 'estagio') {
                const percentual = Number(el('pratica-estagio-percentual').value);
                if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 100) {
                    return mensagem('Informe um percentual de estágio planejado entre 1 e 100.', el('pratica-estagio-percentual'));
                }
                const materiasValidas = obterMateriasProjeto().map(m => m.projetoMateriaId).filter(id => materiasEstagioSelecionadas.has(id));
                if (!materiasValidas.length) {
                    return mensagem('Selecione ao menos uma matéria de referência para o estágio planejado.',
                        el('pratica-estagio-materias').querySelector('button:not(:disabled)') || el('pratica-inicio-modo'));
                }
                inicio = { modo: 'estagio', percentual, projetoMateriaIds: materiasValidas };
            }
            try {
                agendamento = window.AtividadesPraticas.validarAgendamento(automatico ? {modo:'automatico',inicio} : { periodicidade, diasSemana, inicio });
            } catch (erro) {
                return mensagem(erro.message.replace(/^Atividades práticas:\s*/, ''), el('pratica-periodicidade'));
            }
        }
        const valorXp = el('pratica-preset-xp').value;
        let perfilXp;
        if (['linhas','tempo-ideal'].includes(valorXp)) {
            try { perfilXp = window.PraticasProgressao.validarPerfil(perfilDoFormulario(),tipo); window.PraticasProgressao.resolverPerfil(perfilXp); }
            catch (erro) { return mensagem(erro.message,el(valorXp === 'linhas' ? 'pratica-xp-linhas' : 'pratica-xp-tempo')); }
        }
        return {
            nome,
            tipo,
            duracaoPlanejadaSegundos,
            importanciaProva,
            ...(pontos !== '' ? {pesoProva:Number(pontos)} : edicao?.atividade?.pesoProva !== undefined ? {pesoProva:null} : {}),
            ...(referencia ? {duracaoModo:'referencia'} : edicao?.atividade?.duracaoModo ? {duracaoModo:'manual'} : {}),
            ...(perfilXp ? {perfilXp,...(edicao?.atividade?.presetXpId ? {presetXpId:null} : {})}
                : {...(valorXp ? {presetXpId:valorXp} : edicao?.atividade?.presetXpId ? {presetXpId:null} : {}),
                    ...(edicao?.atividade?.perfilXp ? {perfilXp:null} : {})}),
            ...(agendamento ? { agendamento } : (edicao?.atividade?.agendamento ? { agendamento: null } : {}))
        };
    }
    async function gravar(operacao, sucesso) {
        ocupado = true; controles(); limparErro();
        try {
            await operacao();
            fechar();
            if (carregar()) el('pratica-status').textContent = sucesso;
            focar(el('pratica-adicionar'));
        } catch (erro) {
            carregar();
            mensagem(/conflito de revisão/.test(erro.message)
                ? 'Esta atividade foi alterada em outra aba. Suas alterações não foram salvas. Cancele e abra Editar novamente para conferir a versão atual.'
                : 'Não foi possível salvar a alteração. Confira se o projeto está ativo e o armazenamento disponível. Seus dados anteriores foram preservados; tente novamente.');
        } finally { ocupado = false; controles(); }
    }
    async function salvar(evento) {
        evento.preventDefault();
        if (ocupado || !leituraValida) return;
        limparErro(); const dados = dadosDoFormulario();
        if (!dados) return;
        const registro = edicao, atividadeId = novoId;
        await gravar(() => registro
            ? window.PraticasStore.editarAtividade(projetoId, registro.atividade.atividadeId, dados, registro.revisao)
            : window.PraticasStore.criarAtividade({ ...dados, atividadeId, projetoId }),
            dados.agendamento ? 'Atividade salva. Confira abaixo as datas previstas.' : 'Atividade salva. Escolha uma frequência para incluí-la no calendário.');
    }
    function remover(registro) {
        if (ocupado || !leituraValida) return;
        if (!window.confirm(`Remover a atividade ${registro.atividade.nome} do cadastro? Seu histórico será preservado.`)) return;
        return gravar(() => window.PraticasStore.removerAtividade(projetoId, registro.atividade.atividadeId, registro.revisao), 'Atividade removida do cadastro. Histórico preservado.');
    }
    window.PraticasCadastro = Object.freeze({
        podeAvancar() {
            if (!leituraValida) return mensagem('Confira o cadastro de atividades práticas antes de continuar.');
            if (ocupado) return mensagem('Aguarde o salvamento da atividade prática.');
            if (!el('pratica-editor').hidden) return mensagem('Salve ou cancele a edição da atividade prática antes de continuar.');
            if (!document.querySelector('[data-painel="3"]').hidden && Object.values(estado?.atividades || {}).some(r=>!r.removida&&r.atividade.agendamento?.modo==='automatico')) {
                try { const resultado = calcularPreviaCapacidadeAtual(); if (!resultado) return mensagem('Complete a rotina e as matérias comuns para calcular a distribuição automática.'); if (resultado.erro) return mensagem(resultado.erro); }
                catch (erro) { return mensagem(erro.message); }
            }
            if (estado) renderizar();
            return true;
        },
        obterPreviaCapacidade() {
            return calcularPreviaCapacidadeAtual();
        }
    });
    document.addEventListener('DOMContentLoaded', async () => {
        if (!el('praticas-cadastro') || !window.ProjetosStore?.temAtual()) return;
        projetoId = window.ProjetosStore.idAtual();
        const escolha=texto('option','Escolha a atividade'); escolha.value=''; escolha.disabled=true;
        el('pratica-tipo').replaceChildren(escolha,...Object.entries(tipos).filter(([valor]) => valor !== 'peca').map(([valor, rotulo]) => {
            const opcao = texto('option', rotulo); opcao.value = valor; return opcao;
        }));
        const semPreset = texto('option', 'Escolha uma referência (opcional)'); semPreset.value = '';
        el('pratica-preset-xp').replaceChildren(semPreset, ...window.PraticasProgressao.listarPresets().map(p => {
            const opcao = texto('option', `${p.nome} · ${p.extensao}`); opcao.value = p.presetId; return opcao;
        }));
        for (const [value,label] of [['linhas','Personalizar pelo número de linhas'],['tempo-ideal','Personalizar pelo tempo ideal']]) {
            const opcao = texto('option',label); opcao.value = value; el('pratica-preset-xp').append(opcao);
        }
        el('pratica-adicionar').addEventListener('click', () => abrir());
        el('pratica-cancelar').addEventListener('click', () => { if (!ocupado) { fechar(); limparErro(); focar(el('pratica-adicionar')); } });
        el('pratica-recarregar').addEventListener('click', () => { limparErro(); carregar(); });
        el('pratica-form').addEventListener('submit', salvar);
        el('duracao-prova').addEventListener('input', atualizarTempoProva);
        el('pratica-form').addEventListener('input', evento => {
            limparErro();
            if (evento.target.id === 'pratica-estagio-preset' && evento.target.value !== 'personalizado') {
                el('pratica-estagio-percentual').value = evento.target.value;
            } else if (evento.target.id === 'pratica-estagio-percentual') {
                const v = el('pratica-estagio-percentual').value;
                el('pratica-estagio-preset').value = ['25', '50', '75'].includes(v) ? v : 'personalizado';
            }
            atualizarTipo();
        });
        el('pratica-form').addEventListener('change', () => { limparErro(); atualizarTipo(); });
        window.addEventListener('catalogo:atualizado', () => { if (leituraValida && !ocupado) renderizar(); });
        window.addEventListener('storage', evento => { if (evento.key === `praticasProjetoV1:${projetoId}` || evento.key === null) carregar(); });
        window.addEventListener('focus', () => { if (!ocupado) carregar(); });
        try { if (window.BackupLocal?.pronta) await window.BackupLocal.pronta; carregar(); }
        catch (_) { mensagem('Aguarde a recuperação do armazenamento e recarregue a página.'); }
    });
})();
