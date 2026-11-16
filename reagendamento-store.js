/* R2: confirmação atômica da ordem civil simulada pela R1. */
(function () {
    'use strict';
    const abertos = new WeakMap();
    const antecipacoes = new WeakMap();
    let confirmando = false;
    const erro = mensagem => { throw new Error(`Reagendamento: ${mensagem}`); };
    const prefixo = id => `projetoV1:${id}:`;
    const chave = id => prefixo(id) + 'reagendamentoV1';
    const raw = k => window.localStorage.getItem(k);
    const json = (k, padrao = null) => JSON.parse(raw(k) ?? JSON.stringify(padrao));
    const assinatura = valor => JSON.stringify(valor);
    const hoje = () => window.CalendarioJornada.dataLocal(new Date());
    const chaveItem = item => `${item.tipo}:${item.id}`;
    const contextoVazio = () => ({ extras: [], revisoes: [], realizadoSegundos: 0 });

    function projetoAtual() {
        window.BackupLocal.garantirDisponivel();
        const id = window.ProjetosStore.idAtual();
        const registro = id && json(prefixo(id) + 'registro');
        if (!registro || registro.id !== id || registro.removido || registro.arquivado) erro('projeto ativo indisponível');
        return id;
    }

    function lerLedger(id, fontes) {
        const bruto = raw(chave(id));
        if (bruto === null) return null;
        const registro = JSON.parse(bruto);
        window.ReagendamentoSchema.validar(registro, id, fontes);
        return registro;
    }

    function ler() { return lerLedger(projetoAtual()); }

    function conferirPendencias(id, extras, confirmar) {
        const p = prefixo(id);
        if (raw('projetosTransacaoV1') !== null || raw(`projetosTransacaoV2:${id}`) !== null
            || raw(p + 'revisoesTransacaoV1') !== null || extras.some(e => e.registroManualPendente)) {
            erro('há recuperação pendente no projeto. Recarregue após concluir a recuperação');
        }
        const journal = json('cronometroRegistroV1');
        if (journal && (!journal.sessao?.projetoId || journal.sessao.projetoId === id)) erro('há registro pendente do cronômetro');
        if (confirmar && raw(`cronometroV1:${id}`) !== null) erro('há tempo pendente no cronômetro');
    }

    function snapshotPratica(m) {
        return { missaoId: m.missaoId, atividadeId: m.atividadeId, projetoId: m.projetoId, tipo: m.tipo,
            dataPrevista: m.dataPrevista, duracaoPlanejadaSegundos: m.duracaoPlanejadaSegundos,
            presetXpId: m.presetXpId ?? null, perfilXp: m.perfilXp ?? null };
    }

    function recuperarPraticas(missoes, praticas, operacoes) {
        const porId = new Map(missoes.map(m => [m.missaoId, m]));
        for (const op of operacoes) for (const s of op.praticas) {
            if (porId.has(s.missaoId)) continue;
            const cadastro = praticas?.atividades[s.atividadeId];
            if (!cadastro || cadastro.removida) continue;
            // Uma frequência recalculada pode deixar de emitir a ocorrência confirmada.
            porId.set(s.missaoId, { ...s, nome: cadastro.atividade.nome, concluida: false, tempoRegistradoSegundos: 0 });
        }
        return [...porId.values()];
    }

    function aplicar(fonte, operacoes) {
        const dias = new Map(fonte.dias.map(d => [d.data, d]));
        const itens = new Map(fonte.dias.flatMap(d => d.itens.map(item => [chaveItem(item), item])));
        for (const op of operacoes) {
            const movidos = new Set(op.antes.flat());
            for (const s of op.praticas) {
                const item = itens.get(`pratica:${s.missaoId}`);
                if (!item) continue; // Uma atividade removida sem fatos permanece no histórico da operação.
                if (item.atividadeId !== s.atividadeId || item.snapshot.tipo !== s.tipo) erro('ocorrência confirmada diverge do cadastro');
                item.metaSegundos = s.duracaoPlanejadaSegundos;
                Object.assign(item.snapshot, s);
            }
            for (const dia of dias.values()) dia.itens = dia.itens.filter(item => !movidos.has(chaveItem(item)));
            op.datas.forEach((data, i) => {
                if (!dias.has(data)) dias.set(data, { data, diaJornada: null, itens: [], contexto: contextoVazio() });
                const dia = dias.get(data);
                dia.itens = [...op.depois[i].map(k => itens.get(k)).filter(Boolean), ...dia.itens];
            });
        }
        fonte.dias = [...dias.values()].sort((a, b) => a.data.localeCompare(b.data));
        return fonte;
    }

    function capturar(id, confirmar = false) {
        conferirPendencias(id, [], confirmar);
        const p = prefixo(id);
        const dados = json(p + 'dadosExame'), materiaDoDia = json(p + 'materiaDoDia');
        if (dados?.projetoId !== id || !materiaDoDia) erro('plano vigente indisponível');
        const extras = window.EstudoExtra.listar(id);
        conferirPendencias(id, extras, confirmar);
        const praticas = window.PraticasStore.obterEstado(id);
        const ledger = lerLedger(id, { dados, materiaDoDia, praticas });
        const operacoes = (ledger?.operacoes || []).filter(op => op.planoVersaoId === (dados.planoVersaoId ?? null));
        const materiasNormalizadas = json(p + 'objetosNormalizados', []);
        const { missoes } = window.PraticasStore.projetarMissoesProjeto(id, { dados, materiaDoDia, materiasNormalizadas, base: true });
        const sessoes = window.HistoricoRepository.listar().filter(s => s.projetoId === id);
        const fontesRevisoes = dados.cargaDiariaVersao === 1 ? window.RevisoesStore.fontesParaCarga(id) : null;
        const fonte = window.ReagendamentoFontes.preparar({ dados, materiaDoDia, praticas, extras,
            missoes: recuperarPraticas(missoes, praticas, operacoes),
            distribuicaoMaterias: json(p + 'lista_distribuicao_materias', []),
            sessoesProjeto: sessoes,
            checkpoint: json(`cronometroV1:${id}`), revisoes: window.RevisoesStore.listar() });
        aplicar(fonte, operacoes);
        const revisao = assinatura({ dados, materiaDoDia, materiasNormalizadas, praticas, ledger, fonte,
            ...(fontesRevisoes ? { sessoes, fontesRevisoes } : {}) });
        return { fonte, revisao, ledger, dados, materiaDoDia, praticas, sessoes, fontesRevisoes };
    }

    function projetar() { return capturar(projetoAtual()).fonte; }

    let cachePlano;
    function lerPlanoEfetivo(id, campo) {
        const p = prefixo(id);
        const ledgerRaw = raw(chave(id));
        if (!ledgerRaw) return undefined;
        const fontes = [ledgerRaw, raw(p + 'dadosExame'), raw(p + 'materiaDoDia'),
            raw(p + 'lista_distribuicao_materias'), raw(p + 'revisoesDoDia'), raw(`praticasProjetoV1:${id}`)];
        if (cachePlano?.id === id && fontes.every((v, i) => v === cachePlano.fontes[i])) return cachePlano.valores[campo];
        const [ledger, dados, materiaDoDia, distribuicao, revisoes, praticas] = fontes.map(v => JSON.parse(v));
        window.ReagendamentoSchema.validar(ledger, id, { dados, materiaDoDia, praticas });
        const operacoes = ledger.operacoes.filter(op => op.planoVersaoId === (dados.planoVersaoId ?? null));
        if (!operacoes.length) return undefined;
        const fonte = aplicar(window.ReagendamentoFontes.preparar({ dados, materiaDoDia,
            distribuicaoMaterias: distribuicao || [] }), operacoes);
        const calendario = window.CalendarioJornada;
        const rotina = calendario.mapear(dados, Object.keys(materiaDoDia).length);
        const datas = { ...rotina.porDia }, finais = new Map();
        for (const op of operacoes) op.datas.forEach((data, i) => finais.set(data, op.depois[i]));
        const atividades = new Map(operacoes.flatMap(op => op.praticas.map(m => [m.missaoId, m.atividadeId])));
        const comFatos = new Set(['sessoes', 'conclusoes', 'avaliacoes'].flatMap(campo =>
            Object.values(praticas?.[campo] || {}).map(fato => fato.missaoId)));
        for (const [data, itens] of finais) {
            if (rotina.porData[data]) continue;
            if (itens.some(item => {
                if (item.startsWith('materia:')) return true;
                const missao = item.slice('pratica:'.length);
                return comFatos.has(missao) || praticas?.atividades[atividades.get(missao)]?.removida === false;
            })) datas['folga-' + data] = data;
        }
        const porData = new Map(fonte.dias.map(d => [d.data, d]));
        const plano = {}, origens = new Map(), revisoesEfetivas = {};
        for (const [dia, data] of Object.entries(datas)) {
            plano[dia] = (porData.get(data)?.itens || []).map(item => ({ ...item.snapshot, metaSegundos: item.metaSegundos }));
            plano[dia].forEach(b => origens.set(b.blocoId, dia));
            revisoesEfetivas[dia] = {};
        }
        function adicionar(destino, etapa, origem, bloco) {
            if (!revisoesEfetivas[destino]) revisoesEfetivas[destino] = {};
            const grupo = revisoesEfetivas[destino][etapa] ||= {};
            const lista = (grupo[origem] ||= []);
            if (!lista.some(item => item.blocoId === bloco.blocoId)) lista.push(bloco);
        }
        const movidos = new Set();
        for (const [dia, blocos] of Object.entries(materiaDoDia)) for (const b of blocos) {
            if (origens.get(b.blocoId) !== dia) movidos.add(b.blocoId);
        }
        for (const [destino, grupos] of Object.entries(revisoes || {})) {
            for (const [etapa, grupo] of Object.entries(grupos)) for (const [origem, blocos] of Object.entries(grupo || {})) {
                for (const b of blocos) if (!movidos.has(b.blocoId)) adicionar(destino, etapa, origem, b);
            }
        }
        for (const [origem, blocos] of Object.entries(plano)) for (const b of blocos) {
            if (revisoes && !movidos.has(b.blocoId)) continue;
            for (const { chavePeriodo, data } of calendario.projetarPeriodosRevisao(datas[origem], dados)) {
                const destino = rotina.porData[data];
                if (destino) adicionar(destino, calendario.grupoRevisao(chavePeriodo), origem, b);
            }
        }
        cachePlano = { id, fontes, valores: { dadosExame: assinatura({ ...dados, datasReagendamento: datas }),
            materiaDoDia: assinatura(plano), revisoesDoDia: assinatura(revisoesEfetivas) } };
        return cachePlano.valores[campo];
    }

    async function abrir(datas) {
        const captura = capturar(projetoAtual());
        const token = window.Reagendamento.criarRascunho(captura.fonte, { datas, hoje: hoje() });
        abertos.set(token, captura);
        return token;
    }

    function simularAntecipacao(comando) {
        const captura = capturar(projetoAtual());
        const simulacao = window.Reagendamento.antecipar(captura.fonte, comando, hoje());
        abertos.set(simulacao.base, captura);
        antecipacoes.set(simulacao.rascunho, simulacao);
        return simulacao;
    }

    const cargasCalculadas = new WeakMap();
    function projetarCarga(rascunho) {
        if (cargasCalculadas.has(rascunho)) return cargasCalculadas.get(rascunho);
        const captura = abertos.get(window.Reagendamento.origem(rascunho));
        if (!captura?.fontesRevisoes) return null;
        const { dados, sessoes, praticas, fontesRevisoes } = captura;
        const materiaDoDia = {}, porDia = {}, porData = {}, missoes = [];
        for (const dia of window.Reagendamento.diasDoPlano(rascunho)) {
            const chave = dia.diaJornada || 'folga-' + dia.data;
            porDia[chave] = dia.data;
            porData[dia.data] = chave;
            materiaDoDia[chave] = [];
            for (const item of dia.itens) {
                if (item.tipo === 'materia') materiaDoDia[chave].push(item.snapshot);
                else missoes.push({ ...item.snapshot, dataPrevista: dia.data, duracaoPlanejadaSegundos: item.metaSegundos,
                    consomeCargaEstudo: !item.externo });
            }
            missoes.push(...dia.contexto.extras.filter(e => e.extraAvulsa));
        }
        const carga = window.CargaDiaria.calcular({ dados: { ...dados, datasReagendamento: porDia }, materiaDoDia,
            mapa: { porDia, porData }, sessoes, missoes, praticas, fontesRevisoes, hoje: rascunho.hojeCriacao });
        cargasCalculadas.set(rascunho, carga);
        return carga;
    }

    function prever(rascunho, dataHoje = hoje()) {
        const previa = window.Reagendamento.projetar(rascunho, dataHoje);
        const carga = projetarCarga(rascunho);
        if (!carga) return previa;
        const anterior = projetarCarga(window.Reagendamento.origem(rascunho));
        return { ...previa, dias: previa.dias.map(dia => ({ ...dia, ...carga.get(dia.data), cargaIntegrada: true })),
            outrosDias: [...carga.values()].filter(dia => !rascunho.datas.includes(dia.data) &&
                dia.revisoesSegundos !== anterior.get(dia.data).revisoesSegundos) };
    }

    function prepararFato(id, operacao, declaracao, origem) {
        const { item, segundos, diaJornada } = declaracao;
        const data = operacao.datas[1], registradoEm = operacao.confirmadoEm;
        if (item.tipo === 'pratica') return window.PraticasStore.prepararAntecipacao(id,
            snapshotPratica(item.snapshot), data, segundos, operacao.id, registradoEm);
        const sessao = window.EstudoStore.prepararSessao({
            id: 'antecipacao-' + operacao.id, projetoId: id, projetoMateriaId: item.projetoMateriaId,
            blocoId: item.id, materia: item.nome, origem: 'manual', tipo: 'estudo',
            diaJornada: origem.diaJornada || 'folga-' + origem.data,
            inicio: new Date(data + 'T12:00:00').toISOString(), dataEstudo: data,
            precisaoInicio: 'dia', registradoEm, duracaoSegundos: segundos
        });
        return window.HistoricoRepository.prepararAdicao({ ...sessao, diaJornada }, 'antecipacao-' + operacao.id);
    }

    async function confirmar(rascunho, operacaoId) {
        if (confirmando) erro('já há uma confirmação em andamento nesta aba');
        if (typeof operacaoId !== 'string' || !/^[\w-]+$/.test(operacaoId)) erro('ID de operação inválido');
        const origem = window.Reagendamento.origem(rascunho);
        if (!abertos.has(origem)) erro('abra uma nova simulação com as fontes do projeto');
        const id = projetoAtual();
        if (id !== origem.projetoId) erro('o projeto selecionado mudou');
        const antes = window.Reagendamento.projetar(origem, origem.hojeCriacao);
        const depois = window.Reagendamento.projetar(rascunho, origem.hojeCriacao);
        const declaracao = antecipacoes.get(rascunho);
        if (!declaracao && origem.datas.some(d => d < origem.hojeCriacao)) erro('declaração retrospectiva obrigatória');
        if (!depois.alterado) return null;
        const intencao = { id: operacaoId, planoVersaoId: origem.planoVersaoId, datas: origem.datas,
            antes: antes.dias.map(d => d.itens.map(chaveItem)), depois: depois.dias.map(d => d.itens.map(chaveItem)),
            praticas: antes.dias.flatMap(d => d.itens.filter(i => i.tipo === 'pratica').map(i => snapshotPratica(i.snapshot))) };
        if (declaracao) intencao.antecipacao = { item: chaveItem(declaracao.item), modo: declaracao.modo, segundos: declaracao.segundos };
        confirmando = true;
        try {
            const publicar = () => {
                if (projetoAtual() !== id) erro('o projeto selecionado mudou');
                if (declaracao) window.ProjetosStore.recuperarAntecipacao(id);
                const ledger = lerLedger(id) || { versao: 1, projetoId: id, operacoes: [] };
                const existente = ledger.operacoes.find(op => op.id === operacaoId);
                if (existente) {
                    if (Object.keys(intencao).some(k => assinatura(existente[k]) !== assinatura(intencao[k]))) erro('ID de operação reutilizado com outro conteúdo');
                    return existente;
                }
                const atual = capturar(id, true);
                if (atual.revisao !== abertos.get(origem).revisao) erro('as fontes do plano mudaram. Abra uma nova simulação');
                const confirmadoEm = new Date();
                if (window.CalendarioJornada.dataLocal(confirmadoEm) !== origem.hojeCriacao) erro('a data civil mudou. Abra uma nova simulação');
                const operacao = { ...intencao, confirmadoEm: confirmadoEm.toISOString() };
                const proximo = { ...ledger, operacoes: [...ledger.operacoes, operacao] };
                window.ReagendamentoSchema.validar(proximo, id, atual);
                if (declaracao) {
                    const [campo, valor] = prepararFato(id, operacao, declaracao, antes.dias[0]);
                    window.ProjetosStore.publicarAntecipacao(id, { [campo]: valor, [chave(id)]: assinatura(proximo) });
                } else window.localStorage.setItem(chave(id), assinatura(proximo));
                return operacao;
            };
            const resultado = await window.BackupLocal.executarExclusivo(() => navigator.locks.request('projetos:gestao', () => {
                const cronometro = window.CronometroEstudos;
                if (cronometro?.executarComTravaOciosa) return cronometro.executarComTravaOciosa(id, publicar);
                return navigator.locks.request(`cronometro:${id}`, { ifAvailable: true }, lock => {
                    if (!lock) erro('o cronômetro está em uso. Encerre a sessão antes de confirmar');
                    return publicar();
                });
            }));
            window.dispatchEvent(new CustomEvent('reagendamento:alterado'));
            return resultado;
        } finally { confirmando = false; }
    }

    window.ReagendamentoStore = Object.freeze({ ler, projetar, abrir, prever, confirmar, lerPlanoEfetivo, simularAntecipacao });
})();
