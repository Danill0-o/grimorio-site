/* Elegibilidade por fatos e atualização das reservas futuras dos planos integrados. */
(function () {
    'use strict';

    function identificarOrigens(dados, materiaDoDia, mapa, sessoes, hoje) {
        const origens = new Map(), porParticipacao = new Map();
        for (const [dia, blocos] of Object.entries(materiaDoDia)) {
            for (const bloco of blocos) {
                const origem = { ...bloco, dia, dataOrigem: mapa.porDia[dia], ativadaEm: null, registros: [] };
                origens.set(bloco.blocoId, origem);
                const chave = JSON.stringify([dia, bloco.projetoMateriaId]);
                if (!porParticipacao.has(chave)) porParticipacao.set(chave, []);
                porParticipacao.get(chave).push(origem);
            }
        }
        const anteriores = new Set(dados.replanejamento?.sessoesIds || []);
        for (const sessao of sessoes) {
            if (sessao.projetoId !== dados.projetoId || anteriores.has(sessao.id) || sessao.blocoExtraId
                || !window.EstudoStore.sessaoEstudoElegivel(sessao) || !(sessao.duracaoSegundos > 0)) continue;
            const civil = window.CalendarioJornada;
            const dataEstudo = sessao.dataEstudo || civil.dataLocal(sessao.inicio);
            const dataRegistro = civil.dataLocal(sessao.registradoEm || sessao.inicio);
            if (!dataEstudo || !dataRegistro || dataRegistro > hoje) continue;
            const conclusao = ['conclusao-materia', 'conclusao-dia'].includes(sessao.origem);
            const dia = sessao.diaJornada || mapa.porData[dataEstudo];
            const vinculada = origens.get(sessao.blocoId);
            const candidatas = sessao.blocoId ? (vinculada ? [vinculada] : [])
                : porParticipacao.get(JSON.stringify([dia, sessao.projetoMateriaId])) || [];
            if (!conclusao && candidatas.length !== 1) continue;
            for (const origem of candidatas) {
                if (origem.projetoMateriaId !== sessao.projetoMateriaId || (!sessao.blocoId && origem.dataOrigem !== dataEstudo)) continue;
                origem.registros.push({ dataRegistro, segundos: sessao.duracaoSegundos, conclusao });
            }
        }
        for (const origem of origens.values()) {
            let segundos = 0;
            for (const registro of origem.registros.sort((a, b) => a.dataRegistro.localeCompare(b.dataRegistro))) {
                segundos += registro.segundos;
                if (!registro.conclusao && segundos < Math.ceil(origem.metaSegundos / 2)) continue;
                origem.ativadaEm = registro.dataRegistro;
                break;
            }
        }
        return origens;
    }

    function chaveItem(blocoId, periodo) { return JSON.stringify([blocoId, periodo]); }

    function programacaoBase(dados, origens, mapa, revisoesDoDia) {
        const base = dados.cargaDiariaPlano.grupos.flatMap(({ itens, ...grupo }) => itens.map(item => ({ ...grupo, ...item })));
        if (!dados.datasReagendamento) return base;
        // O ledger fornece a data efetiva dos blocos movidos. Os demais usam a reserva confirmada.
        const preservadas = base.filter(revisao => origens.get(revisao.blocoId)?.dataOrigem === revisao.dataOrigem);
        const chaves = new Set(preservadas.map(r => chaveItem(r.blocoId, r.chavePeriodo)));
        for (const { blocoId, dataOrigem, metaNominalSegundos, metaSegundos } of origens.values()) {
            const diaOrigem = mapa.porData[dataOrigem];
            for (const { chavePeriodo, etapa, data } of window.CalendarioJornada.projetarPeriodosRevisao(dataOrigem, dados)) {
                const grupo = window.CalendarioJornada.grupoRevisao(chavePeriodo);
                if (chaves.has(chaveItem(blocoId, chavePeriodo)) ||
                    !revisoesDoDia[mapa.porData[data]]?.[grupo]?.[diaOrigem]?.some(b => b.blocoId === blocoId)) continue;
                preservadas.push({ dataOrigem, dataNominal: data, dataOperacional: data, chavePeriodo, etapa,
                    blocoId, id: JSON.stringify([dados.projetoId, blocoId, chavePeriodo]),
                    duracaoSegundos: Math.round((metaNominalSegundos ?? metaSegundos) / 8), estado: 'complementar' });
            }
        }
        return preservadas;
    }

    function calcular({ dados, materiaDoDia, mapa, sessoes, entidades, ativas = [], revisaoEmCurso, missoes, carga, revisoesDoDia = {},
        hoje = window.CalendarioJornada.dataLocal() }) {
        const origens = identificarOrigens(dados, materiaDoDia, mapa, sessoes, hoje);
        const base = programacaoBase(dados, origens, mapa, revisoesDoDia);
        const bloqueadas = new Map();
        const previamenteAtivas = new Set(ativas);
        const segundos = new Map();
        for (const sessao of sessoes) {
            if (sessao.projetoId === dados.projetoId && sessao.tipo === 'revisao' && sessao.revisaoId) {
                segundos.set(sessao.revisaoId, (segundos.get(sessao.revisaoId) ?? 0) + sessao.duracaoSegundos);
            }
        }
        for (const r of Object.values(entidades)) {
            if (r.projetoId !== dados.projetoId || r.blocoExtraId || !r.dataPrevista) continue;
            const ativada = origens.get(r.blocoId)?.ativadaEm;
            const temFato = segundos.has(r.id) || r.id === revisaoEmCurso || r.estado === 'dispensada'
                || r.estadoAlteradoManualmente || r.estado === 'concluida';
            if (temFato || dados.replanejamento?.revisoesIds?.includes(r.id) || (ativada && r.materializadaEm && previamenteAtivas.has(r.id))) {
                bloqueadas.set(chaveItem(r.blocoId, r.chavePeriodo || r.etapa), r);
            }
        }
        const saldoReserva = r => r.estado === 'pendente' && !r.foraDaReserva && r.dataPrevista >= hoje
            ? Math.max(0, r.sugeridaSegundos - (segundos.get(r.id) ?? 0)) : 0;
        const futuras = reprojetar({ dados, origens, hoje, base, bloqueadas, saldoReserva, missoes, carga });
        const cargasReservadas = dados.cargaDiaria.incluirRevisoes ? [
            ...base.filter(r => r.estado === 'reservada' && r.dataOperacional && r.dataOperacional < hoje)
                .map(r => ({ data: r.dataOperacional, segundos: r.duracaoSegundos })),
            ...futuras.filter(r => r.estado === 'reservada').map(r => ({ data: r.dataOperacional, segundos: r.duracaoSegundos })),
            ...[...bloqueadas.values()].map(r => ({ data: r.dataPrevista, segundos: saldoReserva(r) }))
        ] : [];
        const ocorrencias = [];
        const programadas = new Map();
        for (const item of [...base.filter(r => r.dataOperacional && r.dataOperacional < hoje), ...futuras]) {
            programadas.set(chaveItem(item.blocoId, item.chavePeriodo), item);
        }
        for (const [chave, r] of bloqueadas) {
            programadas.set(chave, { ...r, chavePeriodo: r.chavePeriodo || r.etapa,
                dataOperacional: r.dataPrevista, duracaoSegundos: r.sugeridaSegundos });
        }
        for (const item of programadas.values()) {
            const origem = origens.get(item.blocoId);
            const vinculada = bloqueadas.get(chaveItem(item.blocoId, item.chavePeriodo));
            if (!origem || (!origem.ativadaEm && !vinculada) || !item.dataOperacional) continue;
            const destino = vinculada?.dataPrevista || item.dataOperacional;
            const diaJornada = mapa.porData[destino];
            if (!diaJornada) continue;
            ocorrencias.push({ ...item, id: vinculada?.id || item.id, diaJornada, destino,
                origem, materializadaEm: vinculada?.materializadaEm || origem.ativadaEm || destino,
                foraDaReserva: vinculada?.foraDaReserva ?? (destino < origem.ativadaEm || !dados.cargaDiaria.incluirRevisoes) });
        }
        return { ocorrencias, reservas: futuras, cargasReservadas };
    }

    function reprojetar({ dados, origens, hoje, base, bloqueadas, saldoReserva, missoes, carga }) {
        const incluir = dados.cargaDiaria.incluirRevisoes;
        const elegivel = origem => origem && (origem.ativadaEm || origem.dataOrigem >= hoje);
        if (!incluir) {
            return base.filter(r => r.dataOperacional && r.dataOperacional >= hoje && elegivel(origens.get(r.blocoId)));
        }
        const civil = window.CalendarioJornada;
        const politica = civil.politicaProjeto(dados);
        const protegidas = [...bloqueadas.entries()].map(([vinculo, r]) => ({ vinculo, id: r.id,
            blocoId: r.blocoId, chavePeriodo: r.chavePeriodo || r.etapa, dataPrevista: r.dataPrevista, estado: r.estado,
            saldoSegundos: saldoReserva(r) }));
        // Etapas cujas datas passaram continuam ancorando as próximas. Sua reserva passada é zero.
        for (const r of base) {
            const vinculo = chaveItem(r.blocoId, r.chavePeriodo);
            if (!r.dataOperacional || r.dataOperacional >= hoje || bloqueadas.has(vinculo)) continue;
            protegidas.push({ id: r.id, blocoId: r.blocoId, chavePeriodo: r.chavePeriodo, dataPrevista: r.dataOperacional,
                estado: 'pendente', saldoSegundos: 0 });
        }
        const fim = civil.somarDias(dados.dataFinalF, 0);
        const fixas = [...bloqueadas.values()].filter(r => r.dataPrevista >= hoje && !r.foraDaReserva && origens.has(r.blocoId))
            .map(r => ({ ...r, chavePeriodo: r.chavePeriodo || r.etapa, dataOperacional: r.dataPrevista,
                duracaoSegundos: r.sugeridaSegundos }));
        if (hoje > fim) return fixas;
        const disponibilidadeDiariaSegundos = Math.round(dados.minutosPorDia * 60);
        if (!carga) {
            missoes ??= window.PraticasStore?.projetarMissoesProjeto?.(dados.projetoId, { dados })?.missoes
                ?? dados.cargaDiariaPlano.praticas;
            carga = window.AtividadesPraticas.modelarCargaDiaria({ dataInicio: civil.somarDias(dados.dataInicioF, 0), dataFinal: fim,
                diasRotina: dados.listaDiaDaSemana, disponibilidadeDiariaSegundos, blocosPorDia: dados.blocosPorDia,
                cargaDiaria: dados.cargaDiaria, periodosRevisao: politica.ativadas ? politica.periodos.length : 0,
                missoes: missoes.filter(m => m.duracaoPlanejadaSegundos != null) });
        }
        const teoriaConfirmadaPorData = {};
        for (const origem of origens.values()) {
            teoriaConfirmadaPorData[origem.dataOrigem] = (teoriaConfirmadaPorData[origem.dataOrigem] || 0) + origem.metaSegundos;
        }
        const resultado = window.RevisoesProjecao.projetar({ carga, disponibilidadeDiariaSegundos, politica, protegidas,
            primeiraDataReserva: hoje, teoriaConfirmadaPorData, blocosPorDia: dados.blocosPorDia,
            origens: [...origens.values()].filter(elegivel).map(o => ({ blocoId: o.blocoId, dataOrigem: o.dataOrigem,
                metaSegundos: o.metaNominalSegundos ?? o.metaSegundos, preservarOrigem: true })) });
        const novas = resultado.grupos.flatMap(({ itens, ...grupo }) => grupo.dataOperacional ? itens.map(item => ({ ...grupo, ...item,
            id: JSON.stringify([dados.projetoId, item.blocoId, grupo.chavePeriodo]) })) : []);
        return [...fixas, ...novas];
    }

    window.RevisoesMaterializacao = Object.freeze({ calcular });
})();
