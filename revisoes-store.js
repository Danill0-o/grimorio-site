/* Entidades por etapa, derivadas do calendário civil sem alterar a distribuição. */
(function () {
    const CHAVE = 'revisoesEstadoV1';
    const JOURNAL = 'revisoesTransacaoV1';
    const storage = () => window.ProjetoStorage || localStorage;
    const numero = dia => Number(String(dia).replace(/\D/g, ''));
    function recuperar() {
        const raw = storage().getItem(JOURNAL);
        if (!raw) return;
        Object.entries(JSON.parse(raw)).forEach(([k,v]) => {
            if (k === 'sessoesEstudo' && window.HistoricoRepository) window.HistoricoRepository.adicionar(JSON.parse(v));
            else storage().setItem(k,v);
        });
        storage().removeItem(JOURNAL);
    }
    function ler() {
        recuperar();
        const registro = JSON.parse(storage().getItem(CHAVE) || '{"versao":1,"habilitadas":true,"entidades":{},"ativas":[]}');
        if (registro.versao !== 1 || !registro.entidades || !Array.isArray(registro.ativas)) throw new Error('Registro de revisões inválido');
        return registro;
    }
    function salvar(registro, sessoes) {
        const valores = { [CHAVE]: JSON.stringify(registro) };
        if (sessoes) valores.sessoesEstudo = JSON.stringify(sessoes);
        const mudancas = Object.fromEntries(Object.entries(valores).filter(([k,v]) => storage().getItem(k) !== v));
        if (!Object.keys(mudancas).length) return;
        storage().setItem(JOURNAL, JSON.stringify(mudancas));
        recuperar();
    }
    function calcularSugestoes(metas, minutosPorDia) {
        const ideais = metas.map(meta => Math.max(0, Number(meta) || 0) / 8);
        const total = ideais.reduce((a,b) => a+b,0);
        const teto = Math.max(0, Math.floor(Number(minutosPorDia) * 30) || 0);
        const fator = total ? Math.min(1, teto / total) : 1;
        const reais = ideais.map(v => v * fator);
        const inteiros = reais.map(Math.floor);
        let resto = Math.min(teto, Math.round(total)) - inteiros.reduce((a,b) => a+b,0);
        const ordem = reais.map((v,i) => ({ i, fracao: v-inteiros[i] })).sort((a,b) => b.fracao-a.fracao || a.i-b.i);
        for (const { i } of ordem) { if (resto-- <= 0) break; inteiros[i]++; }
        return inteiros;
    }
    function dataLocal(data = new Date()) {
        return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
    }
    function reconciliar(r, sessoes) {
        if (r.estado === 'dispensada') return;
        // Mudar a programação não desfaz uma conclusão já registrada. Exclusão
        // de suas sessões devolve a entidade à reconciliação normal, sem crédito novo.
        if (r.conclusaoPreservada) {
            if (r.conclusaoPreservada.length && r.conclusaoPreservada.every(id => sessoes.some(s=>s.id===id))) return;
            delete r.conclusaoPreservada;
        }
        const vinculadas = sessoes.filter(s => s.projetoId === r.projetoId && s.tipo === 'revisao'
            && s.revisaoId === r.id && Number.isFinite(s.duracaoSegundos) && s.duracaoSegundos > 0);
        const total = vinculadas.reduce((soma,s) => soma+s.duracaoSegundos,0);
        if (vinculadas.length && total >= r.sugeridaSegundos) {
            r.estado='concluida'; r.conclusao='tempo'; r.sessoesConclusao=vinculadas.map(s=>s.id);
        } else if (r.estado === 'concluida' && (r.conclusao === 'tempo'
            || r.sessoesConclusao?.some(id => !sessoes.some(s=>s.id===id)))) {
            r.estado='pendente'; delete r.conclusao; delete r.sessoesConclusao;
        }
    }
    function fontesParaCarga(projetoId, registro = ler()) {
        const checkpoint = JSON.parse(window.localStorage.getItem(`cronometroV1:${projetoId}`) || 'null');
        return { entidades: registro.entidades, ativas: registro.ativas,
            revisaoEmCurso: checkpoint?.contexto?.tipo === 'revisao' ? checkpoint.contexto.revisaoId : null };
    }
    function sincronizar({ dados, materiaDoDia, revisoesDoDia, dias, sessoes = [], missoes }) {
        const registro = ler();
        // O journal pode ter recuperado uma sessão desde a leitura do chamador.
        sessoes = window.EstudoStore.listarSessoes();
        const origens = new Map();
        const civil = window.CalendarioJornada;
        const mapa = civil.mapear(dados, Object.keys(materiaDoDia).length);
        const calendario = mapa.porDia;
        const destinoProgramado = data => mapa.porData[data]?.startsWith('dia') ? mapa.porData[data] : null;
        const chave = (bloco, periodo) => JSON.stringify([dados.projetoId, bloco, periodo]);
        const periodoDaEntidade = r => r.chavePeriodo || r.etapa;
        const existentes = new Map();
        Object.values(registro.entidades).forEach(r => {
            if (r.projetoId !== dados.projetoId) return;
            const periodo = periodoDaEntidade(r);
            if (!periodo) return;
            const k = chave(r.blocoId, periodo);
            // Dados ambíguos ficam preservados; não atribuir sessões por adivinhação.
            if (!existentes.has(k)) existentes.set(k,r);
            else existentes.set(k,null);
        });
        dias.forEach(dia => dia.metasMaterias.forEach(meta => {
            const blocos = (materiaDoDia[dia.dia] || []).filter(b => b.projetoMateriaId === meta.projetoMateriaId);
            blocos.forEach((b,i) => origens.set(b.blocoId, { ...b, diaOrigem: dia.dia, numero: i+1,
                metaOriginalSegundos: b.metaSegundos ?? (Math.round(meta.metaSegundos*(i+1)/blocos.length)-Math.round(meta.metaSegundos*i/blocos.length)) }));
        }));
        const ativas = [];
        const preservadas = new Set(dados.replanejamento?.revisoesIds || []);
        const sessoesAnteriores = new Set(dados.replanejamento?.sessoesIds || []);
        const creditoAnterior = new Map();
        sessoes.filter(s => s.projetoId === dados.projetoId && sessoesAnteriores.has(s.id)
            && !s.blocoExtraId && window.EstudoStore.sessaoEstudoElegivel(s)).forEach(s =>
            creditoAnterior.set(s.projetoMateriaId, (creditoAnterior.get(s.projetoMateriaId) || 0) + s.duracaoSegundos));
        // Crédito herdado não cria outra revisão do mesmo estudo. A parte ainda
        // não estudada do bloco novo conserva a programação normal.
        for (const origem of origens.values()) {
            const herdado = Math.min(origem.metaOriginalSegundos, creditoAnterior.get(origem.projetoMateriaId) || 0);
            creditoAnterior.set(origem.projetoMateriaId, (creditoAnterior.get(origem.projetoMateriaId) || 0) - herdado);
            origem.metaOriginalSegundos -= herdado;
        }
        const porDestino = new Map(), etapasPorOrigem = new Map();
        const integrada = dados.cargaDiariaVersao === 1;
        function etapaDaProjecao(dia, periodo) {
            if (!dados.revisoesPolitica) return periodo;
            if (!etapasPorOrigem.has(dia)) {
                etapasPorOrigem.set(dia, new Map(civil.projetarPeriodosRevisao(calendario[dia], dados)
                    .map(({ chavePeriodo, etapa }) => [chavePeriodo, etapa])));
            }
            return etapasPorOrigem.get(dia).get(periodo);
        }
        if (!integrada) Object.entries(revisoesDoDia).forEach(([diaJornada, grupos]) => {
            const dia = new Map();
            Object.entries(grupos || {}).forEach(([grupoPeriodo, grupo]) => Object.entries(grupo || {}).forEach(([diaOrigem, blocos]) => {
                const chavePeriodo = civil.chavePeriodoDoGrupo(grupoPeriodo);
                const etapa = etapaDaProjecao(diaOrigem, chavePeriodo);
                if (!etapa) return;
                blocos.forEach(bloco => {
                    const origem = origens.get(bloco.blocoId);
                    if (!origem || origem.metaOriginalSegundos <= 0 || !calendario[diaJornada] || !calendario[diaOrigem]) return;
                    const k = chave(bloco.blocoId, chavePeriodo);
                    const id = existentes.get(k)?.id || k;
                    dia.set(id, { id, projetoId: dados.projetoId, projetoMateriaId: bloco.projetoMateriaId, blocoId: bloco.blocoId,
                        materia: bloco.materia, numero: origem.numero, diaOrigem, diaJornada, etapa, projecaoVersao:2,
                        ...(dados.revisoesPolitica ? { chavePeriodo } : {}),
                        intervalo: civil.diferencaDias(calendario[diaOrigem],calendario[diaJornada]), metaOriginalSegundos: origem.metaOriginalSegundos,
                        dataPrevista: calendario[diaJornada] || null });
                });
            }));
            porDestino.set(diaJornada, [...dia.values()]);
        });
        if (integrada) {
            const calculo = window.RevisoesMaterializacao.calcular({ dados, materiaDoDia, mapa, sessoes, missoes, revisoesDoDia,
                ...fontesParaCarga(dados.projetoId, registro) });
            for (const item of calculo.ocorrencias) {
                const origem = item.origem;
                const id = existentes.get(chave(origem.blocoId, item.chavePeriodo))?.id || item.id;
                const r = registro.entidades[id] ||= {
                    id, projetoId: dados.projetoId, projetoMateriaId: origem.projetoMateriaId, blocoId: origem.blocoId,
                    materia: origem.materia, numero: origens.get(origem.blocoId)?.numero ?? 1, diaOrigem: origem.dia,
                    dataOrigem: origem.dataOrigem, etapa: item.etapa, chavePeriodo: item.chavePeriodo, projecaoVersao: 3,
                    metaOriginalSegundos: origem.metaNominalSegundos ?? origem.metaSegundos,
                    idealSegundos: item.duracaoSegundos, sugeridaSegundos: item.duracaoSegundos,
                    estado: 'pendente', criadaEm: new Date().toISOString()
                };
                Object.assign(r, { diaJornada: item.diaJornada, dataPrevista: item.destino,
                    dataNominal: item.dataNominal ?? null, intervalo: civil.diferencaDias(origem.dataOrigem, item.destino),
                    materializadaEm: item.materializadaEm, foraDaReserva: item.foraDaReserva });
                reconciliar(r, sessoes);
                if (!ativas.includes(id)) ativas.push(id);
            }
        }
        const segundosExtras = new Map();
        sessoes.filter(s => s.projetoId === dados.projetoId && s.blocoExtraId && window.EstudoStore.sessaoEstudoElegivel(s))
            .forEach(s => segundosExtras.set(s.blocoExtraId, (segundosExtras.get(s.blocoExtraId) || 0) + s.duracaoSegundos));
        for (const extra of window.EstudoExtra?.listar(dados.projetoId) || []) {
            const segundos = segundosExtras.get(extra.blocoId) || 0;
            if (!extra.projetoMateriaId || segundos <= 0 || dados.replanejamento?.politicasExtras?.[extra.blocoId]) continue;
            const materia = window.IdentidadeStore.nomeMateria(extra.projetoMateriaId);
            for (const { etapa, chavePeriodo, data } of civil.projetarPeriodosRevisao(extra.dataOrigem, dados)) {
                const diaJornada = destinoProgramado(data);
                if (!diaJornada) continue;
                const k = chave(extra.blocoId, chavePeriodo);
                const id = existentes.get(k)?.id || k;
                if (preservadas.has(id)) continue;
                if (!porDestino.has(diaJornada)) porDestino.set(diaJornada, []);
                if (!porDestino.get(diaJornada).some(item => item.id === id)) {
                    porDestino.get(diaJornada).push({ id, projetoId: dados.projetoId, projetoMateriaId: extra.projetoMateriaId,
                        blocoId: extra.blocoId, blocoExtraId: extra.blocoId, materia, numero: 1,
                        diaOrigem: extra.diaJornada, diaJornada, etapa: dados.revisoesPolitica ? etapa : chavePeriodo, projecaoVersao: 2,
                        ...(dados.revisoesPolitica ? { chavePeriodo } : {}),
                        intervalo: civil.diferencaDias(extra.dataOrigem, data),
                        metaOriginalSegundos: segundos, dataPrevista: data });
                }
            }
        }
        porDestino.forEach(previstas => {
            const idsNovos = new Set(previstas.map(r => r.id));
            const data = previstas[0]?.dataPrevista;
            const reservadoHistorico = [...preservadas].map(id => registro.entidades[id]).filter(r => r && !idsNovos.has(r.id)
                && (!dados.replanejamento || !window.MateriasStore.obterProjetoMateria(r.projetoMateriaId, dados.projetoId).removida)
                && r.dataPrevista === data && (!r.blocoExtraId || !window.EstudoExtra?.excluido(r.blocoExtraId, r.projetoId)))
                .reduce((s, r) => s + r.sugeridaSegundos, 0);
            const capacidade = Math.max(0, Number(dados.minutosPorDia) - reservadoHistorico / 30);
            const sugestoes = calcularSugestoes(previstas.map(r => r.metaOriginalSegundos), capacidade);
            previstas.forEach((prevista,i) => {
                const r = registro.entidades[prevista.id] ||= { ...prevista, idealSegundos: Math.round(prevista.metaOriginalSegundos/8),
                    sugeridaSegundos: sugestoes[i], estado: 'pendente', criadaEm: new Date().toISOString() };
                if (r.projecaoVersao !== 2 || r.dataPrevista !== prevista.dataPrevista || r.diaJornada !== prevista.diaJornada
                    || r.diaOrigem !== prevista.diaOrigem || r.intervalo !== prevista.intervalo || r.sugeridaSegundos !== sugestoes[i]) {
                    const {projecoesAnteriores, ...anterior} = r;
                    r.projecoesAnteriores = [...(projecoesAnteriores || []), anterior];
                    if (r.estado==='concluida' && r.sessoesConclusao?.length) r.conclusaoPreservada = [...r.sessoesConclusao];
                }
                Object.assign(r,prevista,{idealSegundos:Math.round(prevista.metaOriginalSegundos/8),sugeridaSegundos:sugestoes[i]});
                reconciliar(r, sessoes);
                if (!ativas.includes(r.id)) ativas.push(r.id);
            });
        });
        for (const id of preservadas) {
            const r = registro.entidades[id];
            if (!r || r.projetoId !== dados.projetoId || ativas.includes(id)) continue;
            if (r.blocoExtraId && window.EstudoExtra?.excluido(r.blocoExtraId, r.projetoId)) continue;
            const origem = dados.replanejamento?.origens?.[r.blocoId];
            // A origem civil permanece estável para blocos normais e extras.
            const extra = r.blocoExtraId ? window.EstudoExtra?.listar(dados.projetoId).find(e => e.blocoId === r.blocoExtraId) : null;
            if (!origem && !extra) continue;
            r.origemHistorica = true;
            r.dataOrigem = (origem || extra).dataOrigem;
            const destinoCivil = destinoProgramado(r.dataPrevista);
            const novoJaPrevisto = destinoCivil && (porDestino.get(destinoCivil) || [])
                .some(p => p.projetoMateriaId === r.projetoMateriaId && periodoDaEntidade(p) === periodoDaEntidade(r));
            const preservaOcorrencia = origem?.revisoesPolitica || dados.replanejamento?.politicasExtras?.[r.blocoId]
                || r.estadoAlteradoManualmente || r.estado === 'concluida' || r.estado === 'dispensada'
                || sessoes.some(s => s.revisaoId === r.id && s.duracaoSegundos > 0);
            r.diaJornada = novoJaPrevisto && !preservaOcorrencia ? null : destinoCivil;
            reconciliar(r, sessoes);
            if (!ativas.includes(id)) ativas.push(id);
        }
        registro.ativas = [...new Set(ativas)].filter(id => !dados.replanejamento || !window.MateriasStore.obterProjetoMateria(registro.entidades[id].projetoMateriaId, dados.projetoId).removida);
        salvar(registro);
        return registro.ativas.map(id => registro.entidades[id]);
    }
    function sincronizarPlano({ dados, materiaDoDia, revisoesDoDia }) {
        const progresso = window.EstudoStore.calcularProgressoPlano({ dados, materiaDoDia,
            distribuicaoMaterias: JSON.parse(storage().getItem('lista_distribuicao_materias') || '[]'),
            sessoesProjeto: window.EstudoStore.listarSessoes().filter(s => s.projetoId === dados.projetoId) });
        return sincronizar({ dados, materiaDoDia, revisoesDoDia, dias: progresso.dias });
    }
    function listar() { const reg=ler(); return reg.ativas.map(id=>reg.entidades[id]).filter(r=>!r.blocoExtraId||!window.EstudoExtra?.excluido(r.blocoExtraId,r.projetoId)); }
    function reservasProtegidasParaPrevia(projetoId, blocosConcluidos = []) {
        const raw = storage().getItem(CHAVE);
        if (!raw) return [];
        const registro = JSON.parse(raw);
        if (registro.versao !== 1 || !registro.entidades || !Array.isArray(registro.ativas)) throw new Error('Registro de revisões inválido');
        const blocosComEstudo = new Set(blocosConcluidos);
        const segundosPorRevisao = new Map();
        for (const sessao of window.HistoricoRepository.listar()) {
            const segundos = Number(sessao.duracaoSegundos);
            if (sessao.projetoId !== projetoId || sessao.blocoExtraId || !Number.isFinite(segundos) || segundos <= 0) continue;
            if (sessao.tipo === 'revisao' && sessao.revisaoId) {
                segundosPorRevisao.set(sessao.revisaoId, (segundosPorRevisao.get(sessao.revisaoId) ?? 0) + segundos);
                const origem = registro.entidades[sessao.revisaoId];
                if (origem?.projetoId === projetoId && origem.blocoId && !origem.blocoExtraId) blocosComEstudo.add(origem.blocoId);
            } else if (sessao.blocoId && window.EstudoStore.sessaoEstudoElegivel(sessao)) {
                blocosComEstudo.add(sessao.blocoId);
            }
        }
        return [...new Set(registro.ativas)].map(id => registro.entidades[id]).filter(revisao => {
            if (!revisao || revisao.projetoId !== projetoId || !revisao.dataPrevista || revisao.blocoExtraId) return false;
            return revisao.estado === 'concluida' || revisao.estado === 'dispensada' || revisao.estadoAlteradoManualmente
                || blocosComEstudo.has(revisao.blocoId) || segundosPorRevisao.has(revisao.id);
        }).map(({ id, blocoId, chavePeriodo, etapa, dataPrevista, estado, sugeridaSegundos }) => ({
            id, blocoId, chavePeriodo: chavePeriodo || etapa, dataPrevista, estado,
            saldoSegundos: estado === 'pendente' ? Math.max(0, sugeridaSegundos - (segundosPorRevisao.get(id) ?? 0)) : 0
        }));
    }
    function notificar() { window.dispatchEvent(new Event('revisoes:alteradas')); }
    function alterar(id, estado) {
        const reg=ler(); const r=reg.entidades[id];
        if (r?.blocoExtraId&&window.EstudoExtra?.excluido(r.blocoExtraId,r.projetoId))throw new Error('O extra desta revisão foi excluído.');
        if (!r || !reg.ativas.includes(id) || r.estado==='concluida') return;
        if (r.estado !== estado) r.estadoAlteradoManualmente = true;
        r.estado=estado; reconciliar(r, window.EstudoStore.listarSessoes()); salvar(reg); notificar();
    }
    function concluir(id) {
        if (window.HistoricoRepository) return window.HistoricoRepository.executarExclusivo(`concluir-revisao:${id}`, () => concluirInterno(id));
        return concluirInterno(id);
    }
    function concluirInterno(id) {
        const reg=ler(); const r=reg.entidades[id];
        if (!r || !reg.ativas.includes(id) || r.estado!=='pendente') return;
        const sessoes=window.EstudoStore.listarSessoes();
        if (!Array.isArray(sessoes)) throw new Error('Histórico de sessões inválido');
        const vinculadas=sessoes.filter(s=>s.projetoId===r.projetoId && s.tipo==='revisao' && s.revisaoId===id);
        const registrado=vinculadas.reduce((total,s)=>total+s.duracaoSegundos,0);
        const faltam=Math.max(0,r.sugeridaSegundos-registrado);
        const nova=faltam ? window.EstudoStore.prepararSessao({ projetoId:r.projetoId, materia:r.materia,
            projetoMateriaId:r.projetoMateriaId, blocoId:r.blocoId,
            ...(r.blocoExtraId ? { blocoExtraId:r.blocoExtraId } : {}), revisaoId:id, diaJornada:r.diaJornada, referenciaDia:r.diaOrigem,
            tipo:'revisao',origem:'conclusao-revisao',duracaoSegundos:faltam }) : null;
        if (nova) sessoes.push(nova);
        r.estado='concluida'; r.sessoesConclusao=[...vinculadas.map(s=>s.id), ...(nova ? [nova.id] : [])];
        if (window.HistoricoRepository) {
            // O tempo é o commit durável; a conclusão é uma projeção recalculável.
            if (nova) window.HistoricoRepository.adicionar([nova]);
            r.conclusao = 'tempo';
            salvar(reg);
        } else salvar(reg,nova ? sessoes : undefined);
        if (nova) window.dispatchEvent(new CustomEvent('estudo:registrado',{detail:{sessoes:[nova],pontosConhecimento:faltam/60}}));
        else notificar();
    }
    window.RevisoesStore = { sincronizar, sincronizarPlano, listar, fontesParaCarga, reservasProtegidasParaPrevia, calcularSugestoes, concluir,
        dispensar: id=>alterar(id,'dispensada'), reabrir: id=>alterar(id,'pendente'),
        habilitadas: ()=>ler().habilitadas,
        definirHabilitadas(valor) { const reg=ler(); reg.habilitadas=Boolean(valor); salvar(reg); notificar(); },
        atrasadas: (hoje=dataLocal())=>listar().filter(r=>r.estado==='pendente' && r.dataPrevista && r.dataPrevista<hoje), dataLocal };
    // Recuperar antes que os painéis de histórico leiam as sessões ao carregar a página.
    try { recuperar(); } catch (erro) { console.error(erro); }
})();
