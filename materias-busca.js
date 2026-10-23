/* Memórias de pesquisa são sugestões, nunca identidade ou equivalência automática. */
(function () {
    'use strict';
    const CHAVE = 'materiasBuscaV1';
    const dominio = () => window.MateriasStore;
    const normalizar = texto => dominio().normalizarNome(texto);
    const final = id => dominio().resolverMateriaGlobal(id);
    function ler() {
        const e = JSON.parse(localStorage.getItem(CHAVE) || '{"versao":1,"aliases":[],"termos":[],"recentes":{}}');
        if (!e || e.versao !== 1 || Object.keys(e).some(k => !['versao', 'aliases', 'termos', 'recentes'].includes(k)) || !Array.isArray(e.aliases) || !Array.isArray(e.termos) || !e.recentes || typeof e.recentes !== 'object' || Array.isArray(e.recentes)) throw new Error('Memórias de busca inválidas');
        for (const lista of [e.aliases, e.termos]) for (const m of lista) {
            if (!m || Object.keys(m).some(k => !['materiaGlobalId', 'texto', 'normalizado'].includes(k)) || typeof m.texto !== 'string' || !m.texto.trim() || m.texto.length > 120 || !m.normalizado || m.normalizado !== normalizar(m.texto)) throw new Error('Memória de busca inválida');
            final(m.materiaGlobalId);
        }
        for (const [id, data] of Object.entries(e.recentes)) {
            final(id);
            if (typeof data !== 'string' || !Number.isFinite(Date.parse(data))) throw new Error('Uso recente inválido');
        }
        return e;
    }
    async function escrever(comando) {
        if (!navigator.locks) throw new Error('Use HTTPS/localhost com Web Locks para salvar buscas.');
        return navigator.locks.request('materias:busca', () => {
            const e = ler(); comando(e);
            localStorage.setItem(CHAVE, JSON.stringify(e));
        });
    }
    function guardar(tipo, id, texto) {
        if (typeof texto !== 'string' || texto.length > 120) throw new Error('Use até 120 caracteres.');
        const original = texto.trim(), normalizado = normalizar(original);
        if (tipo === 'aliases' && !normalizado) throw new Error('Informe um nome alternativo.');
        return escrever(e => {
            const g = final(id);
            if (g.status !== 'ativa') throw new Error('Escolha uma matéria ativa.');
            if (normalizado && normalizado !== g.nomeNormalizado && !e[tipo].some(m => final(m.materiaGlobalId).materiaGlobalId === g.materiaGlobalId && m.normalizado === normalizado)) {
                e[tipo].push({ materiaGlobalId: g.materiaGlobalId, texto: original, normalizado });
            }
            if (tipo === 'termos') e.recentes[g.materiaGlobalId] = new Date().toISOString();
        });
    }
    function similaridade(a, b) {
        if (!a || !b) return 0;
        let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const atual = [i];
            for (let j = 1; j <= b.length; j++) atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            anterior = atual;
        }
        return 1 - anterior[b.length] / Math.max(a.length, b.length);
    }
    // Ranking puro e substituível. Token parcial não recebe confiança de nome/alias exato.
    function classificar(consulta, materias, memorias, estatisticas = {}) {
        const q = normalizar(consulta.slice(0, 120));
        const tokens = q.split(' ').filter(Boolean);
        return materias.map(m => {
            const n = m.nomeNormalizado, ts = n.split(' ');
            let tipoMatch = 'catalogo', score = 0;
            if (q) {
                if (n === q) { tipoMatch = 'nome-exato'; score = 600; }
                else if (memorias.aliases.some(a => a.materiaGlobalId === m.materiaGlobalId && a.normalizado === q)) { tipoMatch = 'alias-exato'; score = 500; }
                else if (memorias.termos.some(a => a.materiaGlobalId === m.materiaGlobalId && a.normalizado === q)) { tipoMatch = 'termo-aprendido'; score = 400; }
                else if (n.startsWith(q)) { tipoMatch = 'prefixo'; score = 300; }
                else if (n.includes(q) || tokens.every(t => ts.includes(t))) { tipoMatch = 'tokens'; score = 250; }
                else {
                    const cobertura = (a, b) => a.reduce((s, t) => s + Math.max(...b.map(u => similaridade(t, u))), 0) / a.length;
                    const aproximacao = Math.max(similaridade(q, n), Math.max(cobertura(tokens, ts), cobertura(ts, tokens)) * Math.sqrt(Math.min(tokens.length, ts.length) / Math.max(tokens.length, ts.length)));
                    const menores = tokens.length <= ts.length ? tokens : ts, maiores = tokens.length <= ts.length ? ts : tokens;
                    const tokensProximos = menores.every(t => maiores.some(u => similaridade(t, u) >= 0.6));
                    if (q.length >= 3 && aproximacao >= 0.6 && tokensProximos) { tipoMatch = 'aproximado'; score = 150 + aproximacao * 50; }
                    else if (tokens.some(t => ts.includes(t))) { tipoMatch = 'token-parcial'; score = 100; }
                    else return null;
                }
            }
            return { materiaGlobalId: m.materiaGlobalId, nomeCanonico: m.nomeCanonico, tipoMatch, score };
        }).filter(Boolean).sort((a, b) => b.score - a.score
            || (q ? 0 : (estatisticas[b.materiaGlobalId]?.recente || 0) - (estatisticas[a.materiaGlobalId]?.recente || 0))
            || (q ? 0 : (estatisticas[b.materiaGlobalId]?.segundos || 0) - (estatisticas[a.materiaGlobalId]?.segundos || 0))
            || a.nomeCanonico.localeCompare(b.nomeCanonico, 'pt-BR'));
    }
    function buscar(consulta = '') {
        const e = ler(), stats = {};
        for (const [id, data] of Object.entries(e.recentes)) {
            const g = final(id).materiaGlobalId;
            stats[g] = { recente: Math.max(stats[g]?.recente || 0, Date.parse(data)), segundos: 0 };
        }
        for (const s of window.HistoricoRepository?.listar() || []) {
            const g = final(dominio().obterProjetoMateria(s.projetoMateriaId, s.projetoId).materiaGlobalId).materiaGlobalId;
            stats[g] ||= { recente: 0, segundos: 0 };
            stats[g].segundos += Number(s.duracaoSegundos) || 0;
            stats[g].recente = Math.max(stats[g].recente, Date.parse(s.inicio) || 0);
        }
        const resolver = m => ({ ...m, materiaGlobalId: final(m.materiaGlobalId).materiaGlobalId });
        return classificar(consulta, dominio().listarMateriasGlobais(), { aliases: e.aliases.map(resolver), termos: e.termos.map(resolver) }, stats);
    }
    window.MateriasBusca = Object.freeze({ buscar, classificar,
        confirmarAlias: (id, texto) => guardar('aliases', id, texto),
        lembrarTermo: (id, texto) => guardar('termos', id, texto),
        listarMemorias(id) {
            const g = final(id).materiaGlobalId, e = ler();
            return ['aliases', 'termos'].flatMap(tipo => e[tipo].filter(m => final(m.materiaGlobalId).materiaGlobalId === g).map(m => ({ ...m, tipo })));
        },
        remover(tipo, id, normalizado) {
            if (!['aliases', 'termos'].includes(tipo)) throw new Error('Tipo de memória inválido');
            return escrever(e => { const g = final(id).materiaGlobalId; e[tipo] = e[tipo].filter(m => final(m.materiaGlobalId).materiaGlobalId !== g || m.normalizado !== normalizado); });
        }
    });
})();
