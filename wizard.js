/* Navegação da criação; cálculos e cadastro continuam nos módulos existentes. */
(function () {
    const CHAVE = 'wizardProjeto';
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const campos = ['nome_exame', 'dataInicio', 'dataFinal', 'horas-por-dia', 'blocos-por-dia', 'materia', 'Nquestoes', 'peso', 'afinidade'];
    const el = (id) => document.getElementById(id);
    let etapa = 0;
    let blocosEscolhidos = null;
    let backupPendente = false;

    function atualizarBlocos() {
        const minutos = converterHorasParaMinutos(el('horas-por-dia').value);
        const maximo = Math.min(4, Math.max(1, Math.floor(minutos / 30)));
        const valor = Math.min(maximo, Math.max(1, blocosEscolhidos || Math.min(2, maximo)));
        el('blocos-por-dia').replaceChildren(...Array.from({length:maximo}, (_,i) => {
            const opcao = document.createElement('option');
            opcao.value = String(i+1); opcao.textContent = String(i+1); return opcao;
        }));
        el('blocos-por-dia').value = String(valor);
        if (minutos > 0) blocosEscolhidos = valor;
    }

    function selecionados() { return dias.filter((dia) => el(`btn-${dia}`).checked); }
    function sincronizarControles() {
        const quantidade = selecionados().length;
        el('btn-checkAll').checked = quantidade === 7;
        el('btn-checkAll').indeterminate = quantidade > 0 && quantidade < 7;
    }
    function guardarRascunho() {
        const valores = Object.fromEntries(campos.map((id) => [id, el(id).value]));
        valores['blocos-por-dia'] = blocosEscolhidos === null ? '' : String(blocosEscolhidos);
        (window.ProjetoStorage || localStorage).setItem(CHAVE, JSON.stringify({ etapa, valores, dias: selecionados() }));
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
            if (el('dataFinal').value < el('dataInicio').value) return falhar('A data da prova deve ser igual ou posterior ao início.', el('dataFinal'));
        }
        if (numero === 1) {
            if (!selecionados().length) return falhar('Selecione pelo menos um dia da semana.', el('btn-Dom'));
            if (!el('horas-por-dia').checkValidity() || !(converterHorasParaMinutos(el('horas-por-dia').value) > 0)) return falhar('Informe um tempo diário maior que zero.', el('horas-por-dia'));
            const blocos = Number(el('blocos-por-dia').value);
            if (!Number.isInteger(blocos) || blocos < 1 || blocos > Math.min(4, Math.max(1, Math.floor(converterHorasParaMinutos(el('horas-por-dia').value) / 30)))) return falhar('Escolha a quantidade de blocos de estudo.', el('blocos-por-dia'));
            if (!quantosDiasTem(new Date(el('dataInicio').value + 'T12:00:00'), new Date(el('dataFinal').value + 'T12:00:00'), selecionados())) return falhar('O período precisa conter pelo menos um dos dias de estudo selecionados.', el('btn-Dom'));
        }
        if (numero === 2) {
            if (!el('table-body').children.length) return falhar('Adicione pelo menos uma matéria.', el('materia'));
            if (!(Number(el('totalQuestoes').value) > 0)) return falhar('Informe ao menos uma questão para distribuir os pesos.', el('Nquestoes'));
        }
        return true;
    }
    function salvarProjeto(comRotina) {
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
        window.IdentidadeStore?.garantirProjeto(dados);
        (window.ProjetoStorage || localStorage).setItem('dadosExame', JSON.stringify(dados));
    }
    function resumo() {
        const pares = [
            ['Projeto', el('nome_exame').value.trim()],
            ['Período', `${formatarData(new Date(el('dataInicio').value + 'T12:00:00'))} — ${formatarData(new Date(el('dataFinal').value + 'T12:00:00'))}`],
            ['Dias escolhidos', selecionados().map(d => d === 'Sab' ? 'Sáb' : d).join(', ')],
            ['Estudo diário, sem revisões', el('horas-por-dia').value],
            ['Blocos de estudo por dia', el('blocos-por-dia').value],
            ['Duração normal dos blocos', `${(converterHorasParaMinutos(el('horas-por-dia').value) / Number(el('blocos-por-dia').value)).toLocaleString('pt-BR', {maximumFractionDigits:2})} min`],
            ['Revisões', 'Opcionais e adicionais ao tempo de estudo informado.'],
            ['Matérias cadastradas', el('table-body').children.length],
            ['Total de questões', el('totalQuestoes').value]
        ];
        el('wizard-resumo').replaceChildren(...pares.map(([rotulo, valor]) => {
            const linha = document.createElement('div');
            const dt = document.createElement('dt'); const dd = document.createElement('dd');
            dt.textContent = rotulo; dd.textContent = valor;
            linha.append(dt, dd); return linha;
        }));
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
                listaDiaDaSemana: selecionados()
            };
            let cap = null;
            try { cap = window.PraticasStore?.planejarProjeto?.(dadosResumo, normalizadas) || null; } catch (_) {}
            const plano = window.DistribuicaoEstudos.gerar(cap ? cap.dadosDistribuicao : {
                distribuicaoVersao: 3,
                minutosPorDia: minutos,
                blocosPorDia: blocos,
                diasEstudoPraProva: diasEstudo
            }, normalizadas);
            if (plano.coberturaExtra) {
                const aviso = document.createElement('p');
                const grupos = new Map();
                Object.values(plano.materiaDoDia).forEach(blocos => grupos.set(blocos.length, (grupos.get(blocos.length) || 0) + 1));
                const resultado = [...grupos].map(([n, dias]) => `${dias} ${dias === 1 ? 'dia com' : 'dias com'} ${n} blocos de aproximadamente ${(minutos/n).toLocaleString('pt-BR', {maximumFractionDigits:2})} min`).join('; ');
                aviso.textContent = `Para incluir todas as ${normalizadas.length} matérias no período disponível, serão usados mais blocos que os ${el('blocos-por-dia').value} escolhidos por dia: ${resultado}. O tempo diário permanece igual.`;
                el('wizard-resumo').append(aviso);
            } else if (plano.semBlocosTeoricos) {
                const aviso = document.createElement('p');
                aviso.textContent = `Atenção: as atividades práticas agendadas ocupam toda a capacidade diária de estudo (0 blocos teóricos restantes para ${normalizadas.length} matérias). Nenhum bloco teórico será alocado neste período.`;
                el('wizard-resumo').append(aviso);
            } else if (plano.capacidadeInsuficiente) {
                const aviso = document.createElement('p');
                aviso.textContent = `Atenção: restam ${cap?.previa?.resumo?.totalBlocosNormaisRestantes ?? 0} blocos teóricos para ${normalizadas.length} matérias após reservar as atividades práticas. Os blocos de tamanho fixo serão distribuídos entre as matérias de maior peso.`;
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
        el('wizard-avancar').textContent = etapa === 3 ? 'Criar jornada' : 'Continuar →';
        el('wizard-erro').textContent = '';
        if (etapa === 3) resumo();
        guardarRascunho();
        atualizarAtalhoPlanejamento();
        if (foco) document.querySelector(`[data-painel="${etapa}"] h2`).focus();
    }
    async function backupDaJornada(somenteDownload = false) {
        const painel = el('wizard-backup-pendente');
        const botoes = painel.querySelectorAll('button');
        botoes.forEach(b => { b.disabled = true; });
        el('wizard-backup-status').textContent = 'Salvando backup da jornada…';
        try {
            if (!window.BackupLocal?.salvarRapido) throw new Error('Backup indisponível nesta página.');
            const offline = !somenteDownload ? await window.ProjetosOffline?.salvar() : null;
            if (offline?.modo !== 'pasta') await window.BackupLocal.salvarRapido({ somenteDownload });
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
            guardarRascunho();
            if (etapa === 0) salvarProjeto(false);
            if (etapa === 1) salvarProjeto(true);
            if (etapa === 2) await salvarObjetos();
            if (etapa < 3) return mostrar(etapa + 1);
            for (let n = 0; n < 3; n++) {
                if (!validar(n, false)) { mostrar(n); validar(n); return; }
            }
            salvarProjeto(true);
            await salvarObjetos();
            if (window.PraticasStore?.sincronizarMissoesProjeto) {
                await window.PraticasStore.sincronizarMissoesProjeto(lerObjetoArmazenado('dadosExame'), lerArrayArmazenado('objetosNormalizados'));
            }
            distribui_materias();
            if (!sortMaterias()) return erro('Não foi possível gerar a jornada. Confira a rotina e as matérias.');
            (window.ProjetoStorage || localStorage).removeItem(CHAVE);
            backupPendente = true;
            document.querySelectorAll('.wizard-shell input, .wizard-shell select, .wizard-shell button').forEach(c => { c.disabled = true; });
            await backupDaJornada();
        } catch (e) {
            erro('Não foi possível salvar. Verifique o armazenamento do navegador e tente novamente.');
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
        blocosEscolhidos = Number(rascunho?.valores?.['blocos-por-dia']) || Number(dados?.blocosPorDia ?? dados?.materiasPorDia) || null;
        if (rascunho) {
            campos.forEach(id => { if (typeof rascunho.valores?.[id] === 'string') el(id).value = rascunho.valores[id]; });
            dias.forEach(d => { el(`btn-${d}`).checked = Array.isArray(rascunho.dias) && rascunho.dias.includes(d); });
            etapa = Math.min(3, Math.max(0, Math.floor(Number(rascunho.etapa) || 0)));
        }
        atualizarBlocos();
        for (let n = 0; n < etapa; n++) { if (!validar(n, false)) { etapa = n; break; } }
        sincronizarControles();
        mostrar(etapa, false);
        el('btn-checkAll').addEventListener('change', () => {
            dias.forEach(d => { el(`btn-${d}`).checked = el('btn-checkAll').checked; });
            sincronizarControles(); guardarRascunho();
        });
        document.querySelector('.wizard-shell').addEventListener('input', (event) => {
            if (event.target.closest('#pratica-form')) return;
            if (event.target.id === 'btn-checkAll') return;
            if (event.target.id === 'blocos-por-dia') blocosEscolhidos = Number(el('blocos-por-dia').value);
            if (event.target.id === 'horas-por-dia') atualizarBlocos();
            document.querySelectorAll('[aria-invalid="true"]').forEach(campo => { campo.removeAttribute('aria-invalid'); campo.removeAttribute('aria-describedby'); });
            sincronizarControles(); guardarRascunho(); el('wizard-erro').textContent = '';
        });
        el('nome_projetoForm').addEventListener('submit', (event) => { event.preventDefault(); avancar(); });
        el('cadastroForm').addEventListener('submit', guardarRascunho);
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
})();
