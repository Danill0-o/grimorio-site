(function () {
    'use strict';
    const store = () => window.PraticasStore;
    const projetoAtual = () => window.EstudoStore.obterProjetoAtualId();
    const hoje = () => window.CalendarioJornada.dataLocal();
    const novoId = () => window.crypto.randomUUID();
    function consultar(missaoId, projetoId = projetoAtual()) {
        const estado = store().obterEstado(projetoId);
        const projecao = store().projetarMissoesProjeto(projetoId);
        const missao = projecao.missoes.find(m => m.missaoId === missaoId);
        if (!missao) throw new Error('Atividade prática não encontrada neste projeto.');
        const registro = estado.atividades[missao.atividadeId];
        const fatos = {};
        for (const [colecao, campo] of [['conclusoes','conclusaoId'], ['sessoes','sessaoId'], ['avaliacoes','avaliacaoId']]) {
            fatos[colecao] = Object.values(estado[colecao]).filter(f => f.missaoId === missaoId && !Object.hasOwn(estado.exclusoes[colecao], f[campo]));
        }
        return { missao, atividade: registro.atividade, removida: registro.removida,
            progressaoAtividade: projecao.atividades[missao.atividadeId].progressao, ...fatos };
    }
    function verificarRealizacao(contexto, data = hoje()) {
        if (contexto.removida) throw new Error('A atividade foi removida. Seu histórico foi preservado.');
        if (contexto.missao.dataPrevista > hoje()) throw new Error('Esta atividade prática está prevista para uma data futura.');
        if (window.CalendarioJornada.somarDias(data, 0) !== data || data < contexto.missao.dataPrevista || data > hoje()) {
            throw new Error('Informe uma data entre a previsão da atividade prática e hoje.');
        }
    }
    async function preparar(missaoId) {
        const contexto = consultar(missaoId);
        verificarRealizacao(contexto);
        const { missao, atividade } = contexto;
        // Materializa somente a atividade prática já projetada pela E5. Não regenera distribuição ou agenda.
        const existente = store().obterEstado(missao.projetoId).missoes[missaoId];
        if (existente && (existente.atividadeId !== atividade.atividadeId || existente.dataPrevista !== missao.dataPrevista
            || existente.duracaoPlanejadaSegundos !== missao.duracaoPlanejadaSegundos
            || (existente.presetXpId ?? null) !== (missao.presetXpId ?? null)
            || JSON.stringify(existente.perfilXp ?? null) !== JSON.stringify(missao.perfilXp ?? null))) throw new Error('O plano foi alterado. Recarregue antes de registrar a atividade prática.');
        if (!existente) await store().criarMissao(missao.projetoId, atividade.atividadeId, { missaoId, dataPrevista: missao.dataPrevista });
        return contexto;
    }
    async function concluir(missaoId, dados = {}) {
        dados = { ...dados };
        const contexto = await preparar(missaoId);
        const dataRealizacao = dados.dataRealizacao || hoje();
        verificarRealizacao(contexto, dataRealizacao);
        return store().concluirMissao(contexto.missao.projetoId, missaoId, {
            conclusaoId: dados.conclusaoId || novoId(), registradoEm: dados.registradoEm || new Date().toISOString(), dataRealizacao
        });
    }
    async function registrarManual(missaoId, dados) {
        dados = { ...dados };
        const contexto = await preparar(missaoId);
        if (!dados.dataEstudo) throw new Error('Informe a data da atividade.');
        verificarRealizacao(contexto, dados.dataEstudo);
        // Meio-dia é apenas representação técnica da data civil, sem inventar horário no histórico.
        const inicio = new Date(`${dados.dataEstudo}T12:00:00`).toISOString();
        return store().registrarSessao(contexto.missao.projetoId, missaoId, {
            sessaoId: dados.sessaoId || novoId(), inicio, duracaoSegundos: dados.duracaoSegundos,
            origem: 'manual', dataEstudo: dados.dataEstudo, precisaoInicio: 'dia',
            registradoEm: dados.registradoEm || new Date().toISOString(), anotacao: dados.anotacao || ''
        });
    }
    async function registrarCronometro(missaoId, dados) {
        dados = { ...dados };
        const contexto = await preparar(missaoId);
        if (!contexto.missao.usaCronometro) throw new Error('TAF permite somente registro posterior de tempo.');
        verificarRealizacao(contexto, window.CalendarioJornada.dataLocal(dados.inicio));
        return store().registrarSessao(contexto.missao.projetoId, missaoId, {
            sessaoId: dados.sessaoId, inicio: dados.inicio, duracaoSegundos: dados.duracaoSegundos, origem: 'cronometro'
        });
    }
    async function avaliar(missaoId, dados) {
        dados = { ...dados, nota: dados.nota == null ? null : { ...dados.nota } };
        const contexto = await preparar(missaoId);
        return store().registrarAvaliacao(contexto.missao.projetoId, missaoId, {
            avaliacaoId: dados.avaliacaoId || novoId(), registradoEm: dados.registradoEm || new Date().toISOString(),
            nota: dados.nota ?? null, anotacao: dados.anotacao || ''
        });
    }
    async function definirPreset(missaoId, presetXpId) {
        const contexto = await preparar(missaoId);
        return store().definirPresetMissao(contexto.missao.projetoId, missaoId, presetXpId);
    }
    async function definirPerfil(missaoId,perfilXp) {
        perfilXp = {...perfilXp};
        const contexto = await preparar(missaoId);
        return store().definirPerfilMissao(contexto.missao.projetoId,missaoId,perfilXp);
    }
    async function excluir(missaoId, colecao, fatoId) {
        const contexto = consultar(missaoId);
        const campo = { conclusoes: 'conclusaoId', sessoes: 'sessaoId', avaliacoes: 'avaliacaoId' }[colecao];
        if (!campo || !contexto[colecao].some(f => f[campo] === fatoId)) throw new Error('Registro não encontrado nesta atividade prática.');
        return store()[{ conclusoes: 'excluirConclusao', sessoes: 'excluirSessao', avaliacoes: 'excluirAvaliacao' }[colecao]](contexto.missao.projetoId, fatoId);
    }
    window.PraticasExecucao = Object.freeze({ consultar, preparar, concluir, registrarManual, registrarCronometro, avaliar, definirPreset, definirPerfil, excluir, hoje });
})();
