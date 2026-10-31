/* Atividades extras independentes do plano; cada bloco é um commit atômico por ID. */
(function () {
    const prefixo = projetoId => `projetoV1:${projetoId}:estudoExtraV1:`;
    const chave = (projetoId, blocoId) => prefixo(projetoId) + blocoId;
    let recuperando = false;
    function validar(extra, projetoId, blocoId) {
        if (!extra || extra.versao !== 1 || extra.projetoId !== projetoId || extra.blocoId !== blocoId
            || !/^extra-[\w-]+$/.test(blocoId) || !/^dia[1-9]\d*$/.test(extra.diaJornada)
            || window.CalendarioJornada.somarDias(extra.dataOrigem, 0) !== extra.dataOrigem
            || !Number.isFinite(new Date(extra.criadoEm).getTime())
            || (extra.projetoMateriaId !== null && (typeof extra.projetoMateriaId !== 'string' || !extra.projetoMateriaId))) {
            throw new Error('Integridade: estudo extra inválido');
        }
        if (extra.projetoMateriaId) window.MateriasStore.obterProjetoMateria(extra.projetoMateriaId, projetoId);
        if (extra.registroManualPendente) {
            const s = extra.registroManualPendente;
            if (!s.id || s.blocoExtraId !== blocoId || s.blocoId !== blocoId || s.projetoId !== projetoId
                || s.projetoMateriaId !== extra.projetoMateriaId || s.diaJornada !== extra.diaJornada
                || !Number.isInteger(s.duracaoSegundos) || s.duracaoSegundos <= 0 || s.origem !== 'manual'
                || s.tipo !== 'estudo' || window.CalendarioJornada.dataLocal(s.inicio) !== extra.dataOrigem) {
                throw new Error('Integridade: registro manual extra inválido');
            }
        }
        return extra;
    }
    function obter(blocoId, projetoId = window.ProjetosStore.idAtual()) {
        const raw = localStorage.getItem(chave(projetoId, blocoId));
        if (raw === null) throw new Error('Integridade: estudo extra ausente');
        return validar(JSON.parse(raw), projetoId, blocoId);
    }
    const excluido=(blocoId,projetoId=window.ProjetosStore.idAtual())=>Boolean(window.HistoricoRepository?.extraExcluido(projetoId,blocoId));
    function exigirAtivo(blocoId,projetoId){if(excluido(blocoId,projetoId))throw new Error('Este estudo extra foi excluído.');}
    function listar(projetoId = window.ProjetosStore.idAtual()) {
        return Object.keys(localStorage).filter(k => k.startsWith(prefixo(projetoId)))
            .map(k => obter(k.slice(prefixo(projetoId).length), projetoId))
            .filter(e=>!excluido(e.blocoId,projetoId))
            .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.blocoId.localeCompare(b.blocoId));
    }
    function contextoDia(projetoId, diaJornada) {
        const dados = JSON.parse(localStorage.getItem(`projetoV1:${projetoId}:dadosExame`) || 'null');
        const plano = JSON.parse(localStorage.getItem(`projetoV1:${projetoId}:materiaDoDia`) || '{}');
        const dataOrigem = dados && Object.hasOwn(plano, diaJornada)
            ? window.CalendarioJornada.mapear(dados, Object.keys(plano).length).porDia[diaJornada] : null;
        if (!dataOrigem) throw new Error('Calendário indisponível para estudo extra');
        return { plano, dataOrigem };
    }
    async function escrever(projetoId, comando) {
        if (!navigator.locks) throw new Error('Web Locks indisponível para estudo extra');
        return navigator.locks.request('projetos:gestao', () => navigator.locks.request(`estudo-extra:${projetoId}`, () => {
            const projeto = JSON.parse(localStorage.getItem(`projetoV1:${projetoId}:registro`) || 'null');
            if (!projeto || projeto.id !== projetoId || projeto.removido || projeto.arquivado) throw new Error('Projeto indisponível');
            return comando();
        }));
    }
    function notificar() { window.dispatchEvent(new Event('extras:alterados')); }
    async function criar(diaJornada, blocoId = `extra-${crypto.randomUUID()}`, projetoId = window.ProjetosStore.idAtual()) {
        const resultado = await escrever(projetoId, () => {
            exigirAtivo(blocoId,projetoId);
            const { dataOrigem } = contextoDia(projetoId, diaJornada);
            if (localStorage.getItem(chave(projetoId, blocoId)) !== null) {
                const anterior = obter(blocoId, projetoId);
                if (anterior.diaJornada !== diaJornada || anterior.dataOrigem !== dataOrigem) throw new Error('Conflito no estudo extra');
                return anterior;
            }
            const extra = validar({ versao: 1, projetoId, blocoId, projetoMateriaId: null, diaJornada,
                dataOrigem, criadoEm: new Date().toISOString() }, projetoId, blocoId);
            localStorage.setItem(chave(projetoId, blocoId), JSON.stringify(extra));
            return extra;
        });
        notificar();
        return resultado;
    }
    async function escolherMateria(blocoId, projetoMateriaId, projetoId = window.ProjetosStore.idAtual()) {
        const resultado = await escrever(projetoId, () => {
            exigirAtivo(blocoId,projetoId);
            const extra = obter(blocoId, projetoId);
            if (extra.projetoMateriaId === projetoMateriaId) return extra;
            // A origem selecionada é imutável: notas, timer e sessões nunca mudam de matéria.
            if (extra.projetoMateriaId) throw new Error('A matéria deste extra já foi escolhida');
            const { plano, dataOrigem } = contextoDia(projetoId, extra.diaJornada);
            if (dataOrigem !== extra.dataOrigem || !Object.values(plano).flat().some(b => b.projetoMateriaId === projetoMateriaId)) {
                throw new Error('Escolha uma matéria planejada neste projeto');
            }
            window.MateriasStore.obterProjetoMateria(projetoMateriaId, projetoId);
            const selecionado = validar({ ...extra, projetoMateriaId }, projetoId, blocoId);
            localStorage.setItem(chave(projetoId, blocoId), JSON.stringify(selecionado));
            return selecionado;
        });
        notificar();
        return resultado;
    }
    function vinculosSessao(dados) {
        exigirAtivo(dados.blocoExtraId,dados.projetoId);
        const extra = obter(dados.blocoExtraId, dados.projetoId);
        const diaOrigem = dados.tipo === 'revisao' ? dados.referenciaDia : dados.diaJornada;
        if (!extra.projetoMateriaId || extra.projetoMateriaId !== dados.projetoMateriaId
            || (dados.blocoId && dados.blocoId !== extra.blocoId) || diaOrigem !== extra.diaJornada) {
            throw new Error('Integridade: contexto de estudo extra inválido');
        }
        return { projetoId: extra.projetoId, projetoMateriaId: extra.projetoMateriaId,
            blocoId: extra.blocoId, blocoExtraId: extra.blocoId };
    }
    function recuperarRegistro(extra) {
        if (excluido(extra.blocoId,extra.projetoId)||!extra.registroManualPendente) return null;
        const sessao = window.EstudoStore.prepararSessao(extra.registroManualPendente);
        if (!sessao) throw new Error('Registro manual inválido');
        if (sessao.anotacao) {
            const notas = JSON.parse(localStorage.getItem('notasBlocosV1') || '{}');
            if (!notas || typeof notas !== 'object' || Array.isArray(notas)) throw new Error('Notas inválidas');
            if (!Object.hasOwn(notas, extra.blocoId)) {
                notas[extra.blocoId] = { projetoId:extra.projetoId, projetoMateriaId:extra.projetoMateriaId,
                    blocoId:extra.blocoId, materia:sessao.materia, diaJornada:extra.diaJornada, numero:1,
                    texto:sessao.anotacao, atualizadoEm:extra.criadoEm };
                localStorage.setItem('notasBlocosV1', JSON.stringify(notas));
            }
        }
        // A sessão é o commit do tempo. Retry/recovery usa o mesmo ID e respeita tombstones.
        window.HistoricoRepository.adicionar([sessao]);
        const atual = obter(extra.blocoId, extra.projetoId);
        if (atual.registroManualPendente?.id === sessao.id) {
            delete atual.registroManualPendente;
            localStorage.setItem(chave(extra.projetoId, extra.blocoId), JSON.stringify(atual));
        }
        return sessao;
    }
    function recuperarRegistros() {
        if (recuperando || !window.EstudoStore || !window.HistoricoRepository) return;
        recuperando = true;
        try {
            for (const k of Object.keys(localStorage).filter(k => /^projetoV1:[^:]+:estudoExtraV1:/.test(k))) {
                const raw = localStorage.getItem(k);
                if (!raw || !raw.includes('"registroManualPendente"')) continue;
                const e = JSON.parse(raw);
                if (!e.registroManualPendente) continue;
                const partes = /^projetoV1:([^:]+):estudoExtraV1:(extra-[\w-]+)$/.exec(k);
                if (!partes) throw new Error('Chave de registro manual inválida');
                recuperarRegistro(validar(e, partes[1], partes[2]));
            }
        } finally { recuperando = false; }
    }
    async function registrarManual(dados) {
        const resultado = await escrever(dados.projetoId, () => {
            const { plano, dataOrigem } = contextoDia(dados.projetoId, dados.diaJornada);
            window.MateriasStore.obterProjetoMateria(dados.projetoMateriaId, dados.projetoId);
            if (!Object.values(plano).flat().some(b => b.projetoMateriaId === dados.projetoMateriaId)
                || (plano[dados.diaJornada] || []).some(b => b.projetoMateriaId === dados.projetoMateriaId)
                || window.CalendarioJornada.dataLocal(dados.inicio) !== dataOrigem) throw new Error('Contexto do extra manual inválido');
            const blocoId = `extra-${dados.id}`;
            exigirAtivo(blocoId,dados.projetoId);
            const pending = { ...dados, tipo:'estudo', origem:'manual', blocoId, blocoExtraId:blocoId };
            if (localStorage.getItem(chave(dados.projetoId, blocoId)) === null) {
                const e = validar({versao:1, projetoId:dados.projetoId, projetoMateriaId:dados.projetoMateriaId,
                    blocoId, diaJornada:dados.diaJornada, dataOrigem, criadoEm:new Date().toISOString(),
                    registroManualPendente:pending}, dados.projetoId, blocoId);
                // Origem e intenção são um único commit; falha posterior é recuperável.
                localStorage.setItem(chave(dados.projetoId, blocoId), JSON.stringify(e));
            }
            const extra = obter(blocoId, dados.projetoId);
            const sessao = window.EstudoStore.prepararSessao(pending);
            if (extra.registroManualPendente && JSON.stringify(extra.registroManualPendente) !== JSON.stringify(pending)) throw new Error('Conflito no registro manual');
            const recuperada = recuperarRegistro(extra);
            if (!recuperada) window.HistoricoRepository.adicionar([sessao]);
            return recuperada || sessao;
        });
        window.dispatchEvent(new CustomEvent('estudo:registrado', {detail:{sessoes:[resultado],pontosConhecimento:resultado.duracaoSegundos/60}}));
        return resultado;
    }
    async function excluir(blocoId,projetoId=window.ProjetosStore.idAtual()) {
        await escrever(projetoId,()=>{
            obter(blocoId,projetoId);
            const checkpoint=JSON.parse(localStorage.getItem('cronometroV1:'+projetoId)||'null');
            const journal=JSON.parse(localStorage.getItem('cronometroRegistroV1')||'null');
            const timer=window.CronometroEstudos?.obterEstado();
            if(checkpoint?.contexto?.blocoExtraId===blocoId||(journal?.sessao?.projetoId===projetoId&&journal.sessao.blocoExtraId===blocoId)||(window.ProjetosStore.idAtual()===projetoId&&timer?.blocoExtraId===blocoId&&timer.estado!=='ocioso'))
                throw new Error('Registre ou zere o cronômetro deste extra antes de excluí-lo.');
            window.HistoricoRepository.excluirExtra(projetoId,blocoId);
        });
        notificar();window.dispatchEvent(new Event('estudo:excluido'));
    }
    window.EstudoExtra = { excluir, excluido, criar, escolherMateria, listar, obter, vinculosSessao, registrarManual, recuperarRegistros };
})();
