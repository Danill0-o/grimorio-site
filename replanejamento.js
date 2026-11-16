/* D061: conserva origens e projeta o histórico sem criar sessões ou saldos. */
(function () {
    'use strict';
    const storage = () => window.ProjetoStorage || localStorage;
    const ler = (chave, padrao) => JSON.parse(storage().getItem(chave) ?? JSON.stringify(padrao));
    function contextoRevisoes(dados) {
        const calendario = window.CalendarioJornada;
        return { dataInicioF: calendario.somarDias(dados.dataInicioF, 0), dataFinalF: calendario.somarDias(dados.dataFinalF, 0),
            listaDiaDaSemana: dados.listaDiaDaSemana || [], ...(dados.revisoesPolitica ? { revisoesPolitica: dados.revisoesPolitica } : {}) };
    }
    function assinaturaRevisoes(dados) {
        const calendario = window.CalendarioJornada;
        const politica = calendario.politicaProjeto(dados);
        return JSON.stringify([calendario.somarDias(dados.dataInicioF, 0), calendario.somarDias(dados.dataFinalF, 0),
            [...(dados.listaDiaDaSemana || [])].sort(), politica.ativadas ? politica.periodos.map(calendario.chavePeriodo).sort() : []]);
    }
    function capturar() {
        const base = ler('dadosExame', null);
        const efetivo = (campo, padrao) => {
            const raw = base && window.ReagendamentoStore?.lerPlanoEfetivo(base.projetoId, campo);
            return raw ? JSON.parse(raw) : ler(campo, padrao);
        };
        const dados = efetivo('dadosExame', null), plano = efetivo('materiaDoDia', {});
        if (!dados || !Object.keys(plano).length) return null;
        window.NotasBlocos.preservarLegadas(plano);
        const sessoes = window.EstudoStore.listarSessoes().filter(s => s.projetoId === dados.projetoId);
        const progresso = window.EstudoStore.calcularProgressoPlano({ dados, materiaDoDia: plano,
            sessoesProjeto: sessoes, distribuicaoMaterias: ler('lista_distribuicao_materias', []) });
        const revisoes = window.RevisoesStore.sincronizar({ dados, materiaDoDia: plano,
            revisoesDoDia: efetivo('revisoesDoDia', {}), dias: progresso.dias, sessoes });
        const anteriores = dados.replanejamento;
        const origens = { ...(anteriores?.origens || {}) };
        const metasAnteriores = { ...(anteriores?.metasAnteriores || {}) };
        const sessoesAnteriores = new Set(anteriores?.sessoesIds || []);
        const blocosConcluidos = new Set();
        // Concluir matéria abrange o grupo inteiro no dia, mesmo quando o lançamento
        // agregado não pode apontar para um único bloco.
        for (const sessao of sessoes) {
            if (sessao.origem !== 'conclusao-materia' || sessao.blocoId || !normal(sessao, dados.projetoId)
                || sessoesAnteriores.has(sessao.id) || !(sessao.duracaoSegundos > 0)) continue;
            for (const bloco of plano[sessao.diaJornada] || []) {
                if (bloco.projetoMateriaId === sessao.projetoMateriaId) blocosConcluidos.add(bloco.blocoId);
            }
        }
        progresso.dias.forEach(dia => dia.metasMaterias.forEach(meta => {
            const blocos = plano[dia.dia].filter(b => b.projetoMateriaId === meta.projetoMateriaId);
            blocos.forEach((b, i) => {
                origens[b.blocoId] = { ...b, diaOrigem: dia.dia, dataOrigem: dia.dataPrevista, numero: i + 1,
                    metaSegundos: b.metaSegundos ?? Math.round(meta.metaSegundos * (i + 1) / blocos.length) - Math.round(meta.metaSegundos * i / blocos.length) };
            });
        }));
        Object.values(progresso.materias).forEach(m => {
            metasAnteriores[m.projetoMateriaId] = { materia: m.nome, metaSegundos: m.metaTotalSegundos };
        });
        return { versao: 1, projetoId: dados.projetoId, planoFonteId: dados.planoVersaoId || null, origens, metasAnteriores,
            revisoesPlano: { ...contextoRevisoes(dados), blocosConcluidos: [...blocosConcluidos] },
            ...(anteriores?.politicasExtras ? { politicasExtras: anteriores.politicasExtras } : {}),
            revisoesIds: [...new Set([...(anteriores?.revisoesIds || []), ...revisoes.map(r => r.id)])] };
    }
    function normal(sessao, projetoId) {
        return sessao.projetoId === projetoId && !sessao.blocoExtraId && window.EstudoStore.sessaoEstudoElegivel(sessao);
    }
    function preparar(origem, dados) {
        if (!origem || origem.projetoId !== dados.projetoId) throw new Error('Origem do replanejamento inválida. Reabra a edição.');
        if ((origem.planoFonteId || null) !== (dados.planoVersaoId || null)) throw new Error('Outro replanejamento foi salvo. Recarregue a edição e revise suas escolhas antes de salvar novamente.');
        const { revisoesPlano, ...preparado } = origem;
        const sessoes = window.EstudoStore.listarSessoes().filter(s => s.projetoId === dados.projetoId);
        preparado.sessoesIds = sessoes.filter(s => normal(s, dados.projetoId)).map(s => s.id);
        if (revisoesPlano && (dados.cargaDiariaVersao === 1
            || ((revisoesPlano.revisoesPolitica || dados.revisoesPolitica)
                && assinaturaRevisoes(revisoesPlano) !== assinaturaRevisoes(dados)))) {
            preservarOrigensComRegistro(preparado, revisoesPlano, sessoes);
        }
        return preparado;
    }
    function preservarOrigensComRegistro(preparado, plano, sessoes) {
        const politica = window.CalendarioJornada.politicaProjeto(plano);
        const entidades = ler('revisoesEstadoV1', {}).entidades || {};
        const iniciados = new Set(plano.blocosConcluidos), extras = new Set();
        for (const [id, bloco] of Object.entries(preparado.origens)) {
            if (bloco.revisoesPolitica) iniciados.add(id);
        }
        for (const sessao of sessoes) {
            if (!(sessao.duracaoSegundos > 0)) continue;
            if (window.EstudoStore.sessaoEstudoElegivel(sessao)) {
                if (sessao.blocoExtraId) extras.add(sessao.blocoExtraId);
                else if (sessao.blocoId) iniciados.add(sessao.blocoId);
            } else if (sessao.tipo === 'revisao' && entidades[sessao.revisaoId]) {
                iniciados.add(entidades[sessao.revisaoId].blocoId);
            }
        }
        for (const id of preparado.revisoesIds) {
            const revisao = entidades[id];
            if (revisao?.estado === 'concluida' || revisao?.projecaoVersao === 3) iniciados.add(revisao.blocoId);
        }
        preparado.revisoesIds = preparado.revisoesIds.filter(id => {
            const revisao = entidades[id];
            return revisao && (iniciados.has(revisao.blocoId) || extras.has(revisao.blocoExtraId)
                || revisao.estado === 'dispensada' || revisao.estadoAlteradoManualmente);
        });
        preparado.origens = { ...preparado.origens };
        for (const id of iniciados) {
            const bloco = preparado.origens[id];
            if (bloco && !bloco.revisoesPolitica) preparado.origens[id] = { ...bloco, revisoesPolitica: politica };
        }
        if (extras.size) {
            preparado.politicasExtras = { ...preparado.politicasExtras };
            for (const id of extras) preparado.politicasExtras[id] ||= politica;
        }
    }
    function historicos(dados, plano, sessoes) {
        const r = dados.replanejamento;
        if (!r) return [];
        const ativas = new Set(Object.values(plano).flat().map(b => b.projetoMateriaId));
        const segundos = new Map();
        sessoes.filter(s => s.projetoId === dados.projetoId && window.EstudoStore.sessaoXpElegivel(s)).forEach(s => segundos.set(s.projetoMateriaId,
            (segundos.get(s.projetoMateriaId) || 0) + s.duracaoSegundos));
        return Object.entries(r.metasAnteriores).filter(([id]) => !ativas.has(id) && segundos.get(id) > 0
            && window.MateriasStore.obterProjetoMateria(id, dados.projetoId).removida)
            .map(([projetoMateriaId, meta]) => ({ ...meta, projetoMateriaId,
                segundos: segundos.get(projetoMateriaId), completo: segundos.get(projetoMateriaId) >= meta.metaSegundos }));
    }
    // Resumo visual compacto; origens, notas e fatos continuam preservados no armazenamento.
    function criarHistorico(dados, plano, sessoes, editavel = false) {
        if (!dados.replanejamento) return null;
        const materias = historicos(dados, plano, sessoes);
        if (!materias.length) return null;
        const secao = document.createElement('section'); secao.className = 'replanejamento-historico';
        const titulo = document.createElement('h4'); titulo.textContent = 'Histórico do replanejamento'; secao.append(titulo);
        const aviso = document.createElement('p');
        aviso.textContent = 'Matérias retiradas do planejamento. O total inclui estudo e revisão registrados.'; secao.append(aviso);
        materias.forEach(m => {
            const item = document.createElement('p'); item.dataset.historicoMateria = m.projetoMateriaId;
            item.textContent = `${m.materia} — ${(m.segundos / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} minutos concluídos`;
            secao.append(item);
        });
        return secao;
    }
    window.Replanejamento = Object.freeze({ capturar, preparar, historicos, criarHistorico });
})();
