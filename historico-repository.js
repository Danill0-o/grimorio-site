/* Repositório de operações imutáveis. O adaptador local é substituível pela futura API. */
(function () {
    const PREFIXO = 'historicoOperacaoV1:';
    const storage = window.localStorage;
    function ler(chave, padrao) {
        const valor = storage.getItem(chave);
        return valor === null ? padrao : JSON.parse(valor);
    }
    function validarSessao(s) {
        if (!s || typeof s.id !== 'string' || !s.id || !s.materia || !s.projetoId || !Number.isInteger(s.duracaoSegundos) || s.duracaoSegundos <= 0 || !Number.isFinite(Date.parse(s.inicio))) throw new Error('Sessão inválida para persistência');
        if (!s.projetoMateriaId || Object.hasOwn(s, 'materiaGlobalId') || Object.hasOwn(s, 'materiaId')) throw new Error('Identidade de sessão inválida');
        window.MateriasStore.obterProjetoMateria(s.projetoMateriaId, s.projetoId);
    }
    function canonico(valor) {
        if (Array.isArray(valor)) return '[' + valor.map(canonico).join(',') + ']';
        if (valor && typeof valor === 'object') return '{' + Object.keys(valor).sort().filter(k => valor[k] !== undefined).map(k => JSON.stringify(k)+':'+canonico(valor[k])).join(',') + '}';
        return JSON.stringify(valor);
    }
    function operacoes() {
        return Object.keys(storage).filter(k => k.startsWith(PREFIXO)).sort().map(k => {
            const op = ler(k);
            if (!op || op.versao !== 1 || !op.id || PREFIXO + op.id !== k || !['adicionar','excluir','excluir-extra','reiniciar-dominio'].includes(op.tipo)) throw new Error('Operação de histórico inválida; dados preservados');
            return op;
        });
    }
    function estado() {
        // O array legado permanece preservado e somente serve como base de leitura.
        const legado = ler('sessoesEstudo', []);
        const dominio = ler('reiniciosDominio', {});
        if (!Array.isArray(legado) || !dominio || Array.isArray(dominio) || typeof dominio !== 'object') throw new Error('Histórico legado inválido; dados preservados');
        const sessoes = new Map(legado.map(s => { validarSessao(s); return [s.id, s]; }));
        const excluidas = new Set(), extrasExcluidos = new Set();
        for (const op of operacoes()) {
            if (op.tipo === 'adicionar') {
                if (!Array.isArray(op.sessoes)) throw new Error('Lote inválido');
                for (const s of op.sessoes) {
                    validarSessao(s);
                    const anterior = sessoes.get(s.id);
                    if (anterior && canonico(anterior) !== canonico(s)) throw new Error('Conflito de identidade no histórico');
                    sessoes.set(s.id, s);
                }
            } else if (op.tipo === 'excluir') {
                if (typeof op.sessaoId !== 'string') throw new Error('Exclusão inválida');
                excluidas.add(op.sessaoId);
            } else if (op.tipo === 'excluir-extra') {
                if(typeof op.projetoId!=='string'||!op.projetoId||!/^extra-[\w-]+$/.test(op.blocoExtraId))throw new Error('Exclusão de extra inválida');
                extrasExcluidos.add(JSON.stringify([op.projetoId,op.blocoExtraId]));
            } else {
                if (!op.grupos || typeof op.grupos !== 'object') throw new Error('Reset inválido');
                for (const [chave, ids] of Object.entries(op.grupos)) {
                    if (!Array.isArray(ids)) throw new Error('Reset inválido');
                    dominio[chave] = [...new Set([...(dominio[chave] || []), ...ids])];
                }
            }
        }
        return { sessoes: [...sessoes.values()].filter(s => !excluidas.has(s.id)&&!extrasExcluidos.has(JSON.stringify([s.projetoId,s.blocoExtraId]))).sort((a,b) => Date.parse(a.inicio)-Date.parse(b.inicio) || String(a.id).localeCompare(String(b.id))), dominio, excluidas, extrasExcluidos, registrados: new Set(sessoes.keys()) };
    }
    function gravar(tipo, conteudo, id = crypto.randomUUID()) {
        // Uma única setItem é o commit; nenhuma lista/índice compartilhado é regravado.
        const op = { versao:1, id, tipo, ...conteudo };
        const chave = PREFIXO + id;
        const existente = ler(chave, null);
        if (existente && canonico(existente) !== canonico(op)) throw new Error('ID de operação reutilizado com outro conteúdo');
        if (!existente) storage.setItem(chave, JSON.stringify(op));
        return op;
    }
    function adicionar(sessoes) {
        const atual = estado();
        const existentes = new Map(atual.sessoes.map(s => [s.id,s]));
        const novas = [];
        for (const s of sessoes) {
            validarSessao(s);
            if (atual.excluidas.has(s.id)||atual.extrasExcluidos.has(JSON.stringify([s.projetoId,s.blocoExtraId]))) continue; // exclusão prevalece sobre retry/replay
            const anterior = existentes.get(s.id);
            if (anterior) { if (canonico(anterior) !== canonico(s)) throw new Error('Sessão já registrada com outro conteúdo'); continue; }
            existentes.set(s.id,s); novas.push(s);
        }
        if (novas.length) gravar('adicionar', {sessoes:novas});
        return novas;
    }
    const repositorio = {
        listar: () => estado().sessoes,
        possuiRegistro: id => { const atual=estado(); return atual.registrados.has(id) || atual.excluidas.has(id); },
        dominio: () => estado().dominio,
        adicionar,
        excluir(id) {
            const sessao = estado().sessoes.find(s => s.id === id);
            if (sessao) gravar('excluir', {sessaoId:id}, `excluir:${id}`);
            return sessao || null;
        },
        extraExcluido: (projetoId,blocoId)=>estado().extrasExcluidos.has(JSON.stringify([projetoId,blocoId])),
        excluirExtra(projetoId,blocoExtraId) { if(!projetoId||!/^extra-[\w-]+$/.test(blocoExtraId))throw new Error('Identidade do extra inválida');estado();gravar('excluir-extra',{projetoId,blocoExtraId},`excluir-extra:${projetoId}:${blocoExtraId}`); },
        reiniciarDominio(grupos) { estado(); gravar('reiniciar-dominio', {grupos}); },
        // Contrato assíncrono de comandos condicionais, compatível com API transacional.
        async executarExclusivo(chave, comando) {
            if (!navigator.locks) throw new Error('Operação indisponível: use HTTPS/localhost e navegador com Web Locks');
            return navigator.locks.request(`historico:${chave}`, comando);
        },
        exportarOperacoes: () => ({versao:1, base:ler('sessoesEstudo',[]), dominioBase:ler('reiniciosDominio',{}), operacoes:operacoes()}),
        ehChave: chave => chave === null || chave === 'sessoesEstudo' || chave === 'reiniciosDominio' || chave.startsWith(PREFIXO)
    };
    window.HistoricoRepository = repositorio;
})();
