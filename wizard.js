/* Navegação da criação; cálculos e cadastro continuam nos módulos existentes. */
(function () {
    const CHAVE = 'wizardProjeto';
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const campos = ['nome_exame', 'dataInicio', 'dataFinal', 'horas-por-dia', 'blocos-por-dia', 'materia', 'Nquestoes', 'peso', 'afinidade'];
    const el = (id) => document.getElementById(id);
    let etapa = 0;
    let blocosEscolhidos = null;
    let backupPendente = false;
    let sincronizarPraticasAposConfirmacao = false;
    let origemReplanejamento = null;
    let snapshotEdicao = null;
    let cancelandoEdicao = false;
    let revisoes;
    let inicioWizardMs = Date.now();
    let incluirPraticasLegado = true;

    function hojeLocalIso() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function atualizarBlocos() {
        function duracaoSessao(minutos) {
            const total = Math.round(minutos);
            const horas = Math.floor(total / 60), resto = total % 60;
            if (!horas) return `${resto} min`;
            if (!resto) return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
            return `${horas}h${resto ? (resto < 10 ? '0' + resto : resto) : ''}`;
        }
        const minutos = converterHorasParaMinutos(el('horas-por-dia').value);
        const seletor = el('blocos-por-dia');
        // Sem tempo diário não há como mostrar a duração de cada sessão.
        if (!(minutos > 0)) {
            const aviso = document.createElement('option');
            aviso.value = ''; aviso.textContent = 'Informe antes o tempo por dia';
            seletor.replaceChildren(aviso);
            seletor.disabled = true;
            return;
        }
        seletor.disabled = false;
        const maximo = Math.min(4, Math.max(1, Math.floor(minutos / 45)));
        const valor = Math.min(maximo, Math.max(1, blocosEscolhidos || Math.min(2, maximo)));
        seletor.replaceChildren(...Array.from({length:maximo}, (_,i) => {
            const opcao = document.createElement('option');
            opcao.value = String(i+1);
            opcao.textContent = `${i+1} (${duracaoSessao(minutos / (i+1))} por sessão)`;
            return opcao;
        }));
        seletor.value = String(valor);
        blocosEscolhidos = valor;
    }

    function selecionados() { return dias.filter((dia) => el(`btn-${dia}`).checked); }
    function sincronizarControles() {
        const quantidade = selecionados().length;
        el('btn-checkAll').checked = quantidade === 7;
        el('btn-checkAll').indeterminate = quantidade > 0 && quantidade < 7;
    }
    function atividadesAtivasProjeto(projetoId) {
        if (!projetoId || !window.PraticasStore?.obterEstado) return [];
        try {
            return Object.values(window.PraticasStore.obterEstado(projetoId).atividades || {})
                .filter(r => !r.removida);
        } catch (_) {
            return [];
        }
    }
    function resolverIncluirPraticas(projetoId = lerObjetoArmazenado('dadosExame')?.projetoId) {
        if (incluirPraticasLegado !== false) return true;
        return atividadesAtivasProjeto(projetoId).some(r => r.atividade.tipo !== 'taf' && r.atividade.incluirNaCarga === true);
    }
    function escolhasDeCarga() {
        return {
            incluirRevisoes: el('contar-revisoes-na-carga').checked,
            incluirPraticas: resolverIncluirPraticas()
        };
    }
    function capturingJsonStorage(storage, chave) {
        return storage.getItem(chave);
    }
    function capturarSnapshotEdicao(projetoId, planoFonteId) {
        const storage = window.ProjetoStorage || localStorage;
        const objetosSalvos = typeof lerArrayLocalStorage === 'function'
            ? lerArrayLocalStorage('objetosSalvos')
            : lerArrayArmazenado('objetosSalvos');
        return {
            projetoId: projetoId || null,
            planoFonteId: planoFonteId || null,
            objetosSalvos,
            objetosSalvosRaw: capturingJsonStorage(storage, 'objetosSalvos'),
            totalQuestoes: capturingJsonStorage(storage, 'totalQuestoes'),
            objetosNormalizados: capturingJsonStorage(storage, 'objetosNormalizados'),
            somaDasQuestoesNormalizadas: capturingJsonStorage(storage, 'somaDasQuestoesNormalizadas'),
            lista_distribuicao_materias: capturingJsonStorage(storage, 'lista_distribuicao_materias'),
            materiaDoDia: capturingJsonStorage(storage, 'materiaDoDia'),
            revisoesDoDia: capturingJsonStorage(storage, 'revisoesDoDia'),
            praticasJson: projetoId ? window.localStorage.getItem(`praticasProjetoV1:${projetoId}`) : null
        };
    }
    function guardarRascunho() {
        const valores = Object.fromEntries(campos.map((id) => [id, el(id).value]));
        valores['blocos-por-dia'] = blocosEscolhidos === null ? '' : String(blocosEscolhidos);
        (window.ProjetoStorage || localStorage).setItem(CHAVE, JSON.stringify({
            etapa, valores, dias: selecionados(), origemReplanejamento, snapshotEdicao, cargaDiaria: escolhasDeCarga(),
            iniciadoEmMs: inicioWizardMs, ...revisoes.rascunho()
        }));
    }
    function erro(texto, campo) {
        el('wizard-erro').textContent = texto;
        if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.setAttribute('aria-describedby', 'wizard-erro'); campo.focus(); }
        return false;
    }
    function validar(numero, exibir = true) {
        const falhar = (texto, campo) => exibir ? erro(texto, campo) : false;
        if (numero === 0) {
            if (!el('nome_exame').value.trim()) return falhar('Informe o nome do projeto.', el('nome_exame'));
            for (const id of ['dataInicio', 'dataFinal']) {
                if (!el(id).value || !el(id).checkValidity()) return falhar('Informe as duas datas válidas.', el(id));
            }
            if (el('dataFinal').value < el('dataInicio').value) return falhar('A data da prova não pode ser anterior à data de início.', el('dataFinal'));
        }
        if (numero === 1) {
            if (!selecionados().length) return falhar('Selecione pelo menos um dia da semana.', el('btn-Dom'));
            if (!el('horas-por-dia').checkValidity() || !(converterHorasParaMinutos(el('horas-por-dia').value) > 0)) return falhar('Informe um tempo diário maior que zero.', el('horas-por-dia'));
            const blocos = Number(el('blocos-por-dia').value);
            if (!Number.isInteger(blocos) || blocos < 1 || blocos > Math.min(4, Math.max(1, Math.floor(converterHorasParaMinutos(el('horas-por-dia').value) / 45)))) return falhar('Escolha quantas sessões você quer fazer por dia.', el('blocos-por-dia'));
            if (!quantosDiasTem(new Date(el('dataInicio').value + 'T12:00:00'), new Date(el('dataFinal').value + 'T12:00:00'), selecionados())) return falhar('Escolha pelo menos um dia de estudo entre o início do plano e a prova.', el('btn-Dom'));
            const problema = revisoes.problema();
            if (problema) return falhar(problema, revisoes.campoInvalido());
        }
        if (numero === 2) {
            if (!el('table-body').children.length) return falhar('Adicione pelo menos uma matéria.', el('materia'));
            if (!(Number(el('totalQuestoes').value) > 0)) return falhar('Informe ao menos uma questão para distribuir os pesos.', el('Nquestoes'));
        }
        return true;
    }
    function salvarProjeto(comRotina, confirmarPolitica = false) {
        const inicio = new Date(el('dataInicio').value + 'T12:00:00');
        const fim = new Date(el('dataFinal').value + 'T12:00:00');
        const dados = Object.assign({}, lerObjetoArmazenado('dadosExame') || {}, {
            nomeExame: el('nome_exame').value.trim(),
            dataInicioF: formatarData(inicio), dataFinalF: formatarData(fim)
        });
        if (comRotina) {
            const minutos = converterHorasParaMinutos(el('horas-por-dia').value);
            const quantidade = Number(el('blocos-por-dia').value);
            listaDiaDaSemana = selecionados();
            const diasEstudo = quantosDiasTem(new Date(inicio), new Date(fim), listaDiaDaSemana);
            carga_horaria_disponivel = diasEstudo * minutos;
            Object.assign(dados, new DadosExame(dados.nomeExame, minutos,
                Math.round((fim - inicio) / 86400000), dados.dataInicioF, dados.dataFinalF,
                listaDiaDaSemana, carga_horaria_disponivel, diasEstudo,
                el('horas-por-dia').value, quantidade, minutos / quantidade));
            dados.distribuicaoVersao = 3;
            dados.blocosPorDia = quantidade;
            delete dados.materiasPorDia;
            (window.ProjetoStorage || localStorage).setItem('listaDiaDaSemana', JSON.stringify(listaDiaDaSemana));
            (window.ProjetoStorage || localStorage).setItem('carga_horaria_disponivel', JSON.stringify(carga_horaria_disponivel));
        }
        if (confirmarPolitica) {
            const politica = revisoes.politicaConfirmada();
            if (politica) dados.revisoesPolitica = politica;
            else delete dados.revisoesPolitica;
            dados.cargaDiaria = escolhasDeCarga();
        }
        window.IdentidadeStore?.garantirProjeto(dados);
        (window.ProjetoStorage || localStorage).setItem('dadosExame', JSON.stringify(dados));
    }
    function calcularCargaDiaria(dados, materiasNormalizadas, origem) {
        const calendario = window.CalendarioJornada;
        const politica = calendario.politicaProjeto(dados);
        const inicio = calendario.somarDias(dados.dataInicioF, 0);
        const fim = calendario.somarDias(dados.dataFinalF, 0);
        const porIdAtividade = new Map(atividadesAtivasProjeto(dados.projetoId).map(r => [r.atividade.atividadeId, r.atividade]));
        const missoes = window.PraticasStore.projetarMissoesProjeto(dados.projetoId, { dados, materiasNormalizadas, base: true }).missoes
            .filter(missao => missao.dataPrevista >= inicio && missao.dataPrevista <= fim && missao.duracaoPlanejadaSegundos != null)
            .map(({ missaoId, atividadeId, dataPrevista, duracaoPlanejadaSegundos, consomeCargaEstudo }) => {
                const atividade = porIdAtividade.get(atividadeId);
                const legadoExterno = incluirPraticasLegado === false && atividade && typeof atividade.incluirNaCarga !== 'boolean';
                return {
                    missaoId,
                    dataPrevista,
                    duracaoPlanejadaSegundos,
                    consomeCargaEstudo: legadoExterno ? false : consomeCargaEstudo
                };
            });
        const disponibilidadeDiariaSegundos = Math.round(dados.minutosPorDia * 60);
        const carga = window.AtividadesPraticas.modelarCargaDiaria({
            dataInicio: inicio,
            dataFinal: fim,
            diasRotina: dados.listaDiaDaSemana,
            disponibilidadeDiariaSegundos,
            blocosPorDia: dados.blocosPorDia,
            cargaDiaria: dados.cargaDiaria,
            periodosRevisao: politica.ativadas ? politica.periodos.length : 0,
            missoes
        });
        const protegidas = origem ? window.RevisoesStore.reservasProtegidasParaPrevia(dados.projetoId,
            origem.revisoesPlano?.blocosConcluidos) : [];
        const projecao = window.RevisoesProjecao.projetar({
            carga,
            disponibilidadeDiariaSegundos,
            blocosPorDia: dados.blocosPorDia,
            incluirRevisoes: dados.cargaDiaria.incluirRevisoes,
            politica,
            protegidas
        });
        return { carga, projecao, missoes, politica };
    }
    function resumo() {
        const pares = [
            ['Projeto', el('nome_exame').value.trim()],
            ['Período', `${formatarData(new Date(el('dataInicio').value + 'T12:00:00'))} — ${formatarData(new Date(el('dataFinal').value + 'T12:00:00'))}`],
            ['Dias escolhidos', selecionados().map(d => d === 'Sab' ? 'Sáb' : d).join(', ')],
            ['Tempo de estudo por dia', el('horas-por-dia').value],
            ['Sessões por dia', el('blocos-por-dia').value],
            ['Duração padrão por sessão', `${(converterHorasParaMinutos(el('horas-por-dia').value) / Number(el('blocos-por-dia').value)).toLocaleString('pt-BR', {maximumFractionDigits:2})} min`],
            ['Revisões', revisoes.resumo()],
            ['Matérias cadastradas', el('table-body').children.length],
            ['Total de questões', el('totalQuestoes').value]
        ];
        el('wizard-resumo').replaceChildren(...pares.map(([rotulo, valor]) => {
            const linha = document.createElement('div');
            const dt = document.createElement('dt'); const dd = document.createElement('dd');
            dt.textContent = rotulo; dd.textContent = valor;
            linha.append(dt, dd); return linha;
        }));
        if (origemReplanejamento && window.ProjetosStore.temReagendamentoAtivo(lerObjetoArmazenado('dadosExame'))) {
            const aviso = document.createElement('div');
            const descricao = document.createElement('dt');
            const efeito = document.createElement('dd');
            descricao.textContent = 'Organização manual';
            efeito.textContent = 'O novo planejamento substituirá os movimentos manuais e preservará o histórico.';
            aviso.append(descricao, efeito);
            el('wizard-resumo').append(aviso);
        }
        const normalizadas = lerArrayArmazenado('objetosNormalizados');
        if (normalizadas.length) {
            const minutos = converterHorasParaMinutos(el('horas-por-dia').value);
            const blocos = Number(el('blocos-por-dia').value);
            const diasEstudo = quantosDiasTem(new Date(el('dataInicio').value + 'T12:00:00'), new Date(el('dataFinal').value + 'T12:00:00'), selecionados());
            const dadosResumo = {
                ...(lerObjetoArmazenado('dadosExame') || {}),
                distribuicaoVersao: 3,
                minutosPorDia: minutos,
                blocosPorDia: blocos,
                diasEstudoPraProva: diasEstudo,
                dataInicioF: formatarData(new Date(el('dataInicio').value + 'T12:00:00')),
                dataFinalF: formatarData(new Date(el('dataFinal').value + 'T12:00:00')),
                listaDiaDaSemana: selecionados(),
                revisoesPolitica: revisoes.politicaConfirmada(),
                cargaDiaria: escolhasDeCarga()
            };
            let cargaPlanejada, plano;
            try {
                cargaPlanejada = calcularCargaDiaria(dadosResumo, normalizadas, origemReplanejamento);
                plano = window.DistribuicaoEstudos.gerar(window.RevisoesProjecao.dadosDistribuicao({
                    dados: dadosResumo, ...cargaPlanejada
                }), normalizadas);
            } catch (erro) {
                console.error('Prévia da carga diária indisponível.', erro);
            }
            if (plano?.coberturaExtra) {
                const aviso = document.createElement('p');
                const grupos = new Map();
                Object.values(plano.materiaDoDia).forEach(sessoes => grupos.set(sessoes.length, (grupos.get(sessoes.length) || 0) + 1));
                const resumoDias = [...grupos].map(([quantidade, dias]) =>
                    `${dias} ${dias === 1 ? 'dia' : 'dias'} com ${quantidade} sessões de cerca de ${(minutos / quantidade).toLocaleString('pt-BR', {maximumFractionDigits:2})} min`
                ).join(' e ');
                aviso.textContent = `Para encaixar todas as matérias até a prova, o plano usa sessões mais curtas em alguns dias. O tempo total de estudo por dia continua igual. Você terá ${resumoDias}.`;
                el('wizard-resumo').append(aviso);
            } else if (plano?.semBlocosTeoricos) {
                const aviso = document.createElement('p');
                aviso.textContent = `Os treinos ocupam todo o tempo disponível. Nenhuma matéria teórica entrou no cronograma.`;
                el('wizard-resumo').append(aviso);
            } else if (plano?.capacidadeInsuficiente) {
                const aviso = document.createElement('p');
                aviso.textContent = `Depois de reservar tempo para os treinos, o plano prioriza as matérias de maior peso na prova. Algumas matérias ficarão fora do cronograma.`;
                el('wizard-resumo').append(aviso);
            }
        }
    }
    function mostrar(numero, foco = true) {
        etapa = numero;
        document.querySelectorAll('[data-painel]').forEach((painel) => { painel.hidden = Number(painel.dataset.painel) !== etapa; });
        document.querySelectorAll('[data-etapa]').forEach((botao) => {
            const n = Number(botao.dataset.etapa);
            botao.disabled = n > etapa;
            botao.classList.toggle('concluida', n < etapa);
            if (n === etapa) botao.setAttribute('aria-current', 'step');
            else botao.removeAttribute('aria-current');
        });
        el('wizard-voltar').hidden = etapa === 0;
        el('wizard-avancar').textContent = etapa === 3 ? 'Gerar cronograma' : 'Continuar ';
        if (etapa !== 3) el('wizard-avancar').append(window.IconesPixel.criar('direita'));
        document.querySelectorAll('.ajuda-contextual:popover-open').forEach(p => p.hidePopover());
        el('wizard-erro').textContent = '';
        if (etapa === 3) resumo();
        guardarRascunho();
        atualizarAtalhoPlanejamento();
        if (foco) document.querySelector(`[data-painel="${etapa}"] h2`).focus();
    }
    async function backupDaJornada(somenteDownload = false, exportarArquivo = true) {
        const painel = el('wizard-backup-pendente');
        const botoes = painel.querySelectorAll('button');
        botoes.forEach(b => { b.disabled = true; });
        el('wizard-backup-status').textContent = 'Salvando backup da jornada…';
        try {
            if (sincronizarPraticasAposConfirmacao) {
                await window.PraticasStore?.sincronizarMissoesProjeto?.();
                sincronizarPraticasAposConfirmacao = false;
            }
            if (exportarArquivo) {
                if (!window.BackupLocal?.salvarRapido) throw new Error('Backup indisponível nesta página.');
                const offline = !somenteDownload ? await window.ProjetosOffline?.salvar() : null;
                if (offline?.modo !== 'pasta') await window.BackupLocal.salvarRapido({ somenteDownload });
            }
            location.assign('pesomateria.html');
        } catch (e) {
            painel.hidden = false;
            el('wizard-backup-status').textContent = 'A jornada foi criada no navegador, mas o backup não foi salvo. Tente novamente ou baixe o JSON. ' + (e.message || '');
            el('wizard-backup-status').focus();
            console.error(e);
            botoes.forEach(b => { b.disabled = false; });
        }
    }
    async function avancar() {
        if (backupPendente || el('wizard-avancar').disabled || document.getElementById('cadastroForm').dataset.salvando || window.cadastroSalvando) return;
        el('wizard-avancar').disabled = true;
        try {
            if (etapa >= 2 && window.PraticasCadastro && !window.PraticasCadastro.podeAvancar()) return;
            if (!validar(etapa)) return;
            const editando = Boolean(origemReplanejamento);
            if (etapa === 1) {
                revisoes.fixar();
                try {
                    const hoje = hojeLocalIso();
                    window.SistemaIaStore?.atualizarTelemetria?.(t => {
                        const atual = t.edicoesRotinaHoje || { data: '', contagem: 0 };
                        t.edicoesRotinaHoje = atual.data === hoje
                            ? { data: hoje, contagem: Number(atual.contagem || 0) + 1 }
                            : { data: hoje, contagem: 1 };
                    });
                    window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
                } catch (_) {}
            }
            guardarRascunho();
            if (etapa === 0 && !editando) salvarProjeto(false);
            if (etapa === 1 && !editando) salvarProjeto(true);
            if (etapa === 2) await salvarObjetos();
            if (etapa < 3) return mostrar(etapa + 1);
            for (let n = 0; n < 3; n++) {
                if (!validar(n, false)) { mostrar(n); validar(n); return; }
            }
            if (!editando) salvarProjeto(true);
            await salvarObjetos();
            if (!editando && window.PraticasStore?.sincronizarMissoesProjeto) {
                await window.PraticasStore.sincronizarMissoesProjeto(lerObjetoArmazenado('dadosExame'), lerArrayArmazenado('objetosNormalizados'));
            }
            if (incluirPraticasLegado === false && resolverIncluirPraticas()) {
                const dadosAtuais = lerObjetoArmazenado('dadosExame');
                const pendentes = atividadesAtivasProjeto(dadosAtuais?.projetoId)
                    .filter(r => r.atividade.tipo !== 'taf' && typeof r.atividade.incluirNaCarga !== 'boolean');
                for (const registro of pendentes) {
                    await window.PraticasStore.editarAtividade(dadosAtuais.projetoId, registro.atividade.atividadeId, { incluirNaCarga: false }, registro.revisao);
                }
                incluirPraticasLegado = true;
            }
            await window.ProjetosStore.confirmarPlano(() => {
                if (editando) {
                    const origemAtual = window.Replanejamento.capturar();
                    if (origemAtual?.planoFonteId !== origemReplanejamento.planoFonteId) {
                        throw new Error('Outro planejamento foi salvo. Recarregue a edição antes de continuar.');
                    }
                    origemReplanejamento = origemAtual;
                }
                salvarProjeto(true, true);
                const dados = lerObjetoArmazenado('dadosExame');
                dados.cargaDiariaVersao = 1;
                if (editando) {
                    dados.replanejamento = window.Replanejamento.preparar(origemReplanejamento, dados);
                }
                dados.planoVersaoId = `plano-${crypto.randomUUID()}`;
                (window.ProjetoStorage || localStorage).setItem('dadosExame', JSON.stringify(dados));
                const cargaPlanejada = calcularCargaDiaria(dados, lerArrayArmazenado('objetosNormalizados'), origemReplanejamento);
                const plano = sortMaterias({ reconstruir: true, cargaPlanejada });
                if (!plano) throw new Error('Não foi possível gerar a jornada. Confira a rotina e as matérias.');
                window.RevisoesStore.sincronizarPlano({ dados: lerObjetoArmazenado('dadosExame'), ...plano });
                (window.ProjetoStorage || localStorage).removeItem(CHAVE);
            });
            try {
                if (!editando && inicioWizardMs > 0 && (Date.now() - inicioWizardMs) < 60000) {
                    if (window.SistemaIaCatalogo?.desbloquearComAviso) {
                        window.SistemaIaCatalogo.desbloquearComAviso('assinou_sem_ler');
                    } else {
                        window.SistemaIaStore?.registrarDesbloqueio?.('assinou_sem_ler');
                    }
                    window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
                }
            } catch (_) {}
            sincronizarPraticasAposConfirmacao = editando;
            backupPendente = true;
            document.querySelectorAll('.wizard-shell input, .wizard-shell select, .wizard-shell button').forEach(c => { c.disabled = true; });
            // Exportação automática ao sair do Wizard suspensa por solicitação do usuário.
            await backupDaJornada(false, false);
        } catch (e) {
            erro('Não foi possível salvar. ' + e.message);
            console.error(e);
        } finally { el('wizard-avancar').disabled = backupPendente; }
    }
    document.addEventListener('DOMContentLoaded', () => {
        if (window.ProjetosStore && !window.ProjetosStore.temAtual()) return;
        const dados = lerObjetoArmazenado('dadosExame');
        if (dados) {
            el('nome_exame').value = dados.nomeExame || '';
            el('dataInicio').value = converterDataBrasileiraParaISO(dados.dataInicioF);
            el('dataFinal').value = converterDataBrasileiraParaISO(dados.dataFinalF);
            el('horas-por-dia').value = dados.horasPorDia || converterMinutosParaHoras(dados.minutosPorDia || 0);
            dias.forEach(d => { el(`btn-${d}`).checked = (dados.listaDiaDaSemana || []).includes(d); });
        }
        const rascunho = lerObjetoArmazenado(CHAVE);
        const origemSalva = rascunho?.origemReplanejamento;
        const preparandoProjeto = origemSalva === null && !dados?.planoVersaoId && !dados?.revisoesPolitica;
        origemReplanejamento = preparandoProjeto || (origemSalva && (origemSalva.planoFonteId || null) === (dados?.planoVersaoId || null))
            ? origemSalva : window.Replanejamento.capturar();
        const projetoIdAtual = window.ProjetosStore?.idAtual?.() || dados?.projetoId || null;
        if (origemReplanejamento) {
            const planoFonteId = origemReplanejamento.planoFonteId || null;
            const salva = rascunho?.snapshotEdicao;
            snapshotEdicao = salva && (salva.projetoId || null) === projetoIdAtual && (salva.planoFonteId || null) === planoFonteId
                ? salva
                : capturarSnapshotEdicao(projetoIdAtual, planoFonteId);
        } else {
            snapshotEdicao = null;
        }
        if (el('wizard-cancelar')) el('wizard-cancelar').hidden = !origemReplanejamento;
        const cargaDiaria = rascunho?.cargaDiaria ?? dados?.cargaDiaria;
        el('contar-revisoes-na-carga').checked = cargaDiaria?.incluirRevisoes ?? !origemReplanejamento;
        incluirPraticasLegado = cargaDiaria?.incluirPraticas ?? true;
        blocosEscolhidos = Number(rascunho?.valores?.['blocos-por-dia']) || Number(dados?.blocosPorDia ?? dados?.materiasPorDia) || null;
        if (rascunho) {
            inicioWizardMs = Number.isFinite(Number(rascunho.iniciadoEmMs)) && Number(rascunho.iniciadoEmMs) > 0
                ? Number(rascunho.iniciadoEmMs)
                : 0;
            campos.forEach(id => { if (typeof rascunho.valores?.[id] === 'string') el(id).value = rascunho.valores[id]; });
            dias.forEach(d => { el(`btn-${d}`).checked = Array.isArray(rascunho.dias) && rascunho.dias.includes(d); });
            etapa = Math.min(3, Math.max(0, Math.floor(Number(rascunho.etapa) || 0)));
        }
        atualizarBlocos();
        revisoes = window.WizardRevisoes.iniciar({
            dados, rascunho, projetoExistente: Boolean(origemReplanejamento),
            calendarioAtual: () => ({ dataInicioF: el('dataInicio').value, dataFinalF: el('dataFinal').value, listaDiaDaSemana: selecionados() }),
            aoAlterar: () => {
                limparErros();
                guardarRascunho();
            }
        });
        for (let n = 0; n < etapa; n++) { if (!validar(n, false)) { etapa = n; break; } }
        sincronizarControles();
        mostrar(etapa, false);
        el('btn-checkAll').addEventListener('change', () => {
            dias.forEach(d => { el(`btn-${d}`).checked = el('btn-checkAll').checked; });
            revisoes.atualizar(); sincronizarControles(); guardarRascunho(); limparErros();
        });
        document.querySelector('.wizard-shell').addEventListener('input', (event) => {
            if (event.target.closest('#pratica-form, #wizard-revisoes')) return;
            if (event.target.id === 'btn-checkAll') return;
            if (event.target.id === 'blocos-por-dia') blocosEscolhidos = Number(el('blocos-por-dia').value);
            if (event.target.id === 'horas-por-dia') atualizarBlocos();
            if (['dataInicio', 'dataFinal'].includes(event.target.id) || event.target.closest('#btn-dia-semana')) revisoes.atualizar();
            limparErros(); sincronizarControles(); guardarRascunho();
        });
        document.querySelector('.wizard-shell').addEventListener('change', (event) => {
            if (event.target.id === 'horas-por-dia') {
                atualizarBlocos();
                guardarRascunho();
            }
        });
        el('nome_projetoForm').addEventListener('submit', (event) => { event.preventDefault(); avancar(); });
        el('cadastroForm').addEventListener('submit', guardarRascunho);
        function abrirAlertaGerenciarMaterias(evento) {
            guardarRascunho();
            if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return;
            const dialog = el('wizard-gerenciar-materias-dialog');
            if (!dialog) return;
            evento.preventDefault();
            const link = evento.currentTarget;
            const destino = link.getAttribute('href') || 'materias.html';
            const btnConfirmar = dialog.querySelector('[data-confirmar]');
            const btnsCancelar = [...dialog.querySelectorAll('[data-cancelar]')];
            const fecharDialogo = () => {
                if (dialog.open) dialog.close();
                limpar();
                link.focus();
            };
            const onCancel = e => {
                e.preventDefault();
                fecharDialogo();
            };
            const onConfirmar = () => {
                guardarRascunho();
                if (dialog.open) dialog.close();
                limpar();
                location.assign(destino);
            };
            function limpar() {
                btnConfirmar?.removeEventListener('click', onConfirmar);
                btnsCancelar.forEach(b => b.removeEventListener('click', fecharDialogo));
                dialog.removeEventListener('cancel', onCancel);
            }
            btnConfirmar?.addEventListener('click', onConfirmar);
            btnsCancelar.forEach(b => b.addEventListener('click', fecharDialogo));
            dialog.addEventListener('cancel', onCancel);
            dialog.showModal();
            const focoCancelar = dialog.querySelector('button[data-cancelar]:not(.pixel-fechar)') || btnsCancelar[0];
            focoCancelar?.focus();
        }
        async function cancelarEdicao() {
            if (cancelandoEdicao || backupPendente || el('cadastroForm')?.dataset.salvando || window.cadastroSalvando) return;
            cancelandoEdicao = true;
            const btnCancelar = el('wizard-cancelar');
            const btnAvancar = el('wizard-avancar');
            const btnVoltar = el('wizard-voltar');
            if (btnCancelar) btnCancelar.disabled = true;
            if (btnAvancar) btnAvancar.disabled = true;
            if (btnVoltar) btnVoltar.disabled = true;
            limparErros();
            try {
                const storage = window.ProjetoStorage || localStorage;
                const dados = lerObjetoArmazenado('dadosExame');
                if (snapshotEdicao) {
                    const projetoId = snapshotEdicao.projetoId || window.ProjetosStore?.idAtual?.() || dados?.projetoId;
                    const originais = Array.isArray(snapshotEdicao.objetosSalvos) ? snapshotEdicao.objetosSalvos : [];
                    if (window.MateriasStore && projetoId) {
                        const participacoes = window.MateriasStore.listarProjetosMaterias(projetoId);
                        const porId = new Map(participacoes.map(p => [p.projetoMateriaId, p]));
                        const idsOriginais = new Set(originais.map(m => m.projetoMateriaId));
                        const globaisAtivasExtras = new Set(
                            participacoes
                                .filter(p => !p.removida && !idsOriginais.has(p.projetoMateriaId))
                                .map(p => window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).materiaGlobalId)
                        );
                        const colisaoDuplicata = originais.some(m => {
                            const p = porId.get(m.projetoMateriaId);
                            if (!p?.removida) return false;
                            const globalId = window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).materiaGlobalId;
                            return globaisAtivasExtras.has(globalId);
                        });
                        if (colisaoDuplicata) {
                            const ativasAntes = participacoes.filter(p => !p.removida).map(p => ({
                                Materia: p.nomeExibicao ?? window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).nomeCanonico,
                                projetoMateriaId: p.projetoMateriaId,
                                Nquestoes: p.Nquestoes,
                                peso: p.peso,
                                afinidade: p.afinidade
                            }));
                            await window.MateriasStore.salvarCadastro(projetoId, []);
                            try {
                                await window.MateriasStore.salvarCadastro(projetoId, originais);
                            } catch (erroRestauracao) {
                                try { await window.MateriasStore.salvarCadastro(projetoId, ativasAntes); } catch (_) {}
                                throw erroRestauracao;
                            }
                        } else {
                            await window.MateriasStore.salvarCadastro(projetoId, originais);
                        }
                    }
                    const restaurarChaves = [
                        ['objetosSalvos', snapshotEdicao.objetosSalvosRaw],
                        ['totalQuestoes', snapshotEdicao.totalQuestoes],
                        ['objetosNormalizados', snapshotEdicao.objetosNormalizados],
                        ['somaDasQuestoesNormalizadas', snapshotEdicao.somaDasQuestoesNormalizadas],
                        ['lista_distribuicao_materias', snapshotEdicao.lista_distribuicao_materias],
                        ['materiaDoDia', snapshotEdicao.materiaDoDia],
                        ['revisoesDoDia', snapshotEdicao.revisoesDoDia]
                    ];
                    for (const [chave, valor] of restaurarChaves) {
                        if (valor === null || valor === undefined) storage.removeItem(chave);
                        else storage.setItem(chave, valor);
                    }
                    if (window.PraticasStore?.restaurarSnapshotCadastro && projetoId) {
                        await window.PraticasStore.restaurarSnapshotCadastro(projetoId, snapshotEdicao.praticasJson ?? null);
                    }
                }
                storage.removeItem(CHAVE);
                location.assign('home.html');
            } catch (e) {
                erro('Não foi possível cancelar a edição. ' + (e?.message || ''));
                console.error(e);
                cancelandoEdicao = false;
                if (btnCancelar) btnCancelar.disabled = false;
                if (btnAvancar) btnAvancar.disabled = false;
                if (btnVoltar) btnVoltar.disabled = false;
            }
        }
        el('atalho-gerenciar-materias')?.addEventListener('click', abrirAlertaGerenciarMaterias);
        el('wizard-cancelar')?.addEventListener('click', cancelarEdicao);
        el('wizard-avancar').addEventListener('click', avancar);
        el('wizard-backup-repetir').addEventListener('click', () => backupDaJornada());
        el('wizard-backup-baixar').addEventListener('click', () => backupDaJornada(true));
        el('wizard-backup-continuar').addEventListener('click', () => location.assign('pesomateria.html'));
        el('wizard-voltar').addEventListener('click', () => mostrar(etapa - 1));
        document.querySelectorAll('[data-etapa]').forEach(botao => botao.addEventListener('click', () => {
            const destino = Number(botao.dataset.etapa);
            if (destino < etapa) mostrar(destino);
        }));
    });

    function limparErros() {
        document.querySelectorAll('[aria-invalid="true"][aria-describedby="wizard-erro"]').forEach(campo => {
            campo.removeAttribute('aria-invalid'); campo.removeAttribute('aria-describedby');
        });
        el('wizard-erro').textContent = '';
    }
})();
