/* Domínio de matérias (D027). Sem migração textual ou projeções de tempo.
 * Cadastro e consumidores usam exclusivamente a participação local.
 */
(function () {
    'use strict';
    const CHAVE = 'materiasDominioV1';
    const storage = window.localStorage;
    const camposGlobal = ['materiaGlobalId', 'nomeCanonico', 'nomeNormalizado', 'status', 'mescladaEm', 'criadoEm', 'atualizadoEm'];
    const camposLocal = ['projetoMateriaId', 'projetoId', 'materiaGlobalId', 'nomeExibicao', 'Nquestoes', 'peso', 'afinidade', 'criadoEm', 'removida'];
    const falhar = mensagem => { throw new Error(`Integridade de matérias: ${mensagem}`); };
    const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    const texto = valor => typeof valor === 'string' && valor.trim().length > 0;
    const idValido = (id, prefixo) => typeof id === 'string' && new RegExp(`^${prefixo}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i').test(id);
    const novoId = prefixo => `${prefixo}-${window.crypto.randomUUID()}`;
    const normalizarNome = nome => nome.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').replace(/[.,;:!?\-–—_/\\()]/g, ' ').replace(/\s+/g, ' ').trim();
    function validarNomeNovo(nome) {
        if (!texto(nome) || nome.trim().length > 60) falhar('o nome da matéria deve ter entre 1 e 60 caracteres');
    }

    function campos(valor, permitidos, obrigatorios = permitidos) {
        if (!objeto(valor) || Object.keys(valor).some(k => !permitidos.includes(k)) || obrigatorios.some(k => !Object.hasOwn(valor, k))) falhar('campos inválidos');
    }
    function resolver(estado, id) {
        if (!texto(id)) falhar('materiaGlobalId obrigatório');
        const visitados = new Set();
        while (true) {
            if (visitados.has(id)) falhar('ciclo de mesclagem');
            visitados.add(id);
            const materia = estado.materiasGlobais[id];
            if (!Object.hasOwn(estado.materiasGlobais, id) || !materia) falhar('matéria global inexistente');
            if (materia.status !== 'mesclada') return materia;
            id = materia.mescladaEm;
        }
    }
    function validar(estado) {
        campos(estado, ['versao', 'materiasGlobais', 'projetosMaterias']);
        if (estado.versao !== 1 || !objeto(estado.materiasGlobais) || !objeto(estado.projetosMaterias)) falhar('esquema inválido');
        const nomes = new Set();
        for (const [id, m] of Object.entries(estado.materiasGlobais)) {
            campos(m, camposGlobal);
            if (!idValido(id, 'materia-global') || id !== m.materiaGlobalId || !texto(m.nomeCanonico) || m.nomeNormalizado !== normalizarNome(m.nomeCanonico) || !texto(m.nomeNormalizado)) falhar('matéria global inválida');
            if (!['ativa', 'arquivada', 'mesclada'].includes(m.status) || !Number.isFinite(Date.parse(m.criadoEm)) || !Number.isFinite(Date.parse(m.atualizadoEm))) falhar('estado global inválido');
            if (m.status === 'mesclada' ? !idValido(m.mescladaEm, 'materia-global') : m.mescladaEm !== null) falhar('redirecionamento inválido');
            if (m.status === 'ativa') {
                if (nomes.has(m.nomeNormalizado)) falhar('nome normalizado já existe');
                nomes.add(m.nomeNormalizado);
            }
        }
        Object.keys(estado.materiasGlobais).forEach(id => resolver(estado, id));
        const participacoes = new Set();
        for (const [id, p] of Object.entries(estado.projetosMaterias)) {
            campos(p, camposLocal);
            if (!idValido(id, 'projeto-materia') || id !== p.projetoMateriaId || !texto(p.projetoId) || typeof p.removida !== 'boolean' || !Number.isFinite(Date.parse(p.criadoEm))) falhar('participação inválida');
            if (p.nomeExibicao !== null && !texto(p.nomeExibicao)) falhar('nome de exibição inválido');
            if (!Number.isInteger(p.Nquestoes) || p.Nquestoes < 0 || !Number.isFinite(p.peso) || p.peso < 0 || ![0.5, 1, 1.5].includes(p.afinidade)) falhar('campos de planejamento inválidos');
            const final = resolver(estado, p.materiaGlobalId);
            const chave = JSON.stringify([p.projetoId, final.materiaGlobalId]);
            if (!p.removida) {
                if (participacoes.has(chave)) falhar('participação ativa duplicada');
                participacoes.add(chave);
            }
        }
        return estado;
    }
    function ler() {
        const raw = storage.getItem(CHAVE);
        return validar(raw === null ? { versao: 1, materiasGlobais: {}, projetosMaterias: {} } : JSON.parse(raw));
    }
    async function escrever(comando, projeto = false) {
        if (!window.navigator?.locks) falhar('escrita exige Web Locks em HTTPS/localhost');
        const executar = () => window.navigator.locks.request('materias:dominio', () => {
            const estado = ler();
            const antes = JSON.stringify(estado);
            const resultado = comando(estado);
            validar(estado);
            const depois = JSON.stringify(estado);
            // Um único commit atômico: falha preserva integralmente o snapshot anterior.
            // Nenhum journal de múltiplas chaves ou espelho do histórico é necessário.
            if (depois !== antes) storage.setItem(CHAVE, depois);
            return resultado;
        });
        // Mesma ordem das operações de gestão; validação do projeto ocorre no lock.
        return projeto ? window.navigator.locks.request('projetos:gestao', executar) : executar();
    }
    function conferirRetry(anterior, entrada) {
        if (Object.keys(entrada).some(k => anterior[k] !== entrada[k])) falhar('ID reutilizado com outro conteúdo');
        return anterior;
    }
    function criarMateriaGlobal(dados) {
        campos(dados, ['materiaGlobalId', 'nomeCanonico'], ['nomeCanonico']);
        if (!texto(dados.nomeCanonico)) falhar('nome canônico obrigatório');
        const entrada = { materiaGlobalId: dados.materiaGlobalId ?? novoId('materia-global'), nomeCanonico: dados.nomeCanonico.trim() };
        if (!idValido(entrada.materiaGlobalId, 'materia-global')) falhar('materiaGlobalId inválido');
        return escrever(estado => {
            const anterior = estado.materiasGlobais[entrada.materiaGlobalId];
            if (anterior) return conferirRetry(anterior, entrada);
            validarNomeNovo(entrada.nomeCanonico);
            const agora = new Date().toISOString();
            const materia = { ...entrada, nomeNormalizado: normalizarNome(entrada.nomeCanonico), status: 'ativa', mescladaEm: null, criadoEm: agora, atualizadoEm: agora };
            estado.materiasGlobais[materia.materiaGlobalId] = materia;
            return materia;
        });
    }
    function criarProjetoMateria(dados) {
        campos(dados, ['projetoMateriaId', 'projetoId', 'materiaGlobalId', 'nomeExibicao', 'Nquestoes', 'peso', 'afinidade'], ['projetoId', 'materiaGlobalId', 'Nquestoes', 'peso', 'afinidade']);
        const entrada = { projetoMateriaId: dados.projetoMateriaId ?? novoId('projeto-materia'), projetoId: dados.projetoId, materiaGlobalId: dados.materiaGlobalId, nomeExibicao: dados.nomeExibicao ?? null, Nquestoes: dados.Nquestoes, peso: dados.peso, afinidade: dados.afinidade };
        if (!idValido(entrada.projetoMateriaId, 'projeto-materia') || !texto(entrada.projetoId)) falhar('IDs de participação obrigatórios');
        return escrever(estado => {
            const final = resolver(estado, entrada.materiaGlobalId);
            entrada.materiaGlobalId = final.materiaGlobalId;
            const anterior = estado.projetosMaterias[entrada.projetoMateriaId];
            if (anterior) {
                if (anterior.removida) falhar('participação removida não pode ser recriada');
                return conferirRetry(anterior, entrada);
            }
            if (final.status !== 'ativa') falhar('novo vínculo exige matéria global ativa');
            if (entrada.nomeExibicao !== null && entrada.nomeExibicao !== final.nomeCanonico) validarNomeNovo(entrada.nomeExibicao);
            const registro = JSON.parse(storage.getItem(`projetoV1:${entrada.projetoId}:registro`) || 'null');
            if (!registro || registro.id !== entrada.projetoId || registro.removido || registro.arquivado) falhar('novo vínculo exige projeto ativo existente');
            const participacao = { ...entrada, criadoEm: new Date().toISOString(), removida: false };
            estado.projetosMaterias[participacao.projetoMateriaId] = participacao;
            return participacao;
        }, true);
    }
    function obterProjetoMateria(id, projetoId) {
        const estado = ler();
        if (!texto(id) || !Object.hasOwn(estado.projetosMaterias, id)) falhar('projetoMateriaId inexistente');
        const participacao = estado.projetosMaterias[id];
        if (projetoId !== undefined && participacao.projetoId !== projetoId) falhar('participação pertence a outro projeto');
        return participacao;
    }
    function corrigirVinculo(dados) {
        campos(dados, ['projetoMateriaId', 'projetoId', 'materiaGlobalIdAnterior', 'novoMateriaGlobalId'], ['projetoMateriaId', 'projetoId', 'materiaGlobalIdAnterior', 'novoMateriaGlobalId']);
        const entrada = structuredClone(dados);
        return escrever(estado => {
            const p = estado.projetosMaterias[entrada.projetoMateriaId];
            if (!p || p.projetoId !== entrada.projetoId) falhar('participação inexistente ou de outro projeto');
            const destino = resolver(estado, entrada.novoMateriaGlobalId);
            if (destino.status !== 'ativa') falhar('correção exige matéria global ativa');
            if (p.materiaGlobalId === destino.materiaGlobalId) return p;
            if (p.materiaGlobalId !== entrada.materiaGlobalIdAnterior) falhar('vínculo alterado em outra aba; confira novamente');
            if (Object.values(estado.projetosMaterias).some(outro => outro.projetoMateriaId !== p.projetoMateriaId && outro.projetoId === p.projetoId && !outro.removida && resolver(estado, outro.materiaGlobalId).materiaGlobalId === destino.materiaGlobalId)) falhar('outra participação ativa deste projeto já usa a matéria de destino');
            // Preservar o rótulo local e os desempates textuais do planejamento.
            if (p.nomeExibicao === null) p.nomeExibicao = resolver(estado, p.materiaGlobalId).nomeCanonico;
            p.materiaGlobalId = destino.materiaGlobalId;
            return p;
        }, true);
    }
    function cadastro(estado, projetoId, itens, preservarNomes = false) {
        const ids = new Set();
        const saida = itens.map(item => {
            const id = item.projetoMateriaId;
            if (!idValido(id, 'projeto-materia') || ids.has(id)) falhar('ID local ausente ou repetido no cadastro');
            ids.add(id);
            let p = estado.projetosMaterias[id];
            const nomeAnterior = p ? (p.nomeExibicao ?? resolver(estado, p.materiaGlobalId).nomeCanonico)
                : estado.materiasGlobais[item.materiaGlobalId]?.nomeCanonico;
            if (!preservarNomes && item.Materia !== nomeAnterior) validarNomeNovo(item.Materia);
            if (p && p.projetoId !== projetoId) falhar('participação pertence a outro projeto');
            if (p && item.materiaGlobalId !== undefined && resolver(estado, item.materiaGlobalId).materiaGlobalId !== resolver(estado, p.materiaGlobalId).materiaGlobalId) falhar('cadastro não pode alterar vínculo global');
            if (p?.removida && resolver(estado, p.materiaGlobalId).status !== 'ativa') falhar('reativação exige matéria global ativa');
            if (!p) {
                const globalId = item.materiaGlobalId;
                if (!idValido(globalId, 'materia-global')) falhar('ID global obrigatório na criação');
                if (!estado.materiasGlobais[globalId]) {
                    const agora = new Date().toISOString();
                    estado.materiasGlobais[globalId] = { materiaGlobalId: globalId, nomeCanonico: item.Materia,
                        nomeNormalizado: normalizarNome(item.Materia), status: 'ativa', mescladaEm: null, criadoEm: agora, atualizadoEm: agora };
                }
                const final = resolver(estado, globalId);
                if (final.status !== 'ativa') falhar('novo vínculo exige matéria global ativa');
                p = { projetoMateriaId: id, projetoId, materiaGlobalId: final.materiaGlobalId, criadoEm: new Date().toISOString(), removida: false };
                estado.projetosMaterias[id] = p;
            }
            Object.assign(p, { nomeExibicao: item.Materia, Nquestoes: item.Nquestoes, peso: item.peso, afinidade: item.afinidade, removida: false });
            return { Materia: item.Materia, projetoMateriaId: id, Nquestoes: p.Nquestoes, peso: p.peso, afinidade: p.afinidade };
        });
        Object.values(estado.projetosMaterias).filter(p => p.projetoId === projetoId && !ids.has(p.projetoMateriaId)).forEach(p => { p.removida = true; });
        return saida;
    }
    function salvarCadastro(projetoId, itens) {
        // Capturar entradas antes de aguardar locks: alterações posteriores da UI não mudam o comando.
        const entradas = structuredClone(itens);
        return escrever(estado => {
            const registro = JSON.parse(storage.getItem(`projetoV1:${projetoId}:registro`) || 'null');
            if (!registro || registro.id !== projetoId || registro.removido || registro.arquivado) falhar('cadastro exige projeto ativo');
            return cadastro(estado, projetoId, entradas);
        }, true);
    }
    // Chamado pela gestão já dentro de projetos:gestao; não readquirir o mesmo lock.
    function prepararCopia(origemId, destinoId, itens) {
        return escrever(estado => {
            if (!texto(destinoId) || destinoId === origemId) falhar('destino da cópia inválido');
            const entradas = itens.map(item => {
                const p = estado.projetosMaterias[item.projetoMateriaId];
                if (!p || p.projetoId !== origemId) falhar('origem da cópia inválida');
                if (item.Materia !== (p.nomeExibicao ?? resolver(estado, p.materiaGlobalId).nomeCanonico)) validarNomeNovo(item.Materia);
                const globalId = resolver(estado, p.materiaGlobalId).materiaGlobalId;
                const anterior = Object.values(estado.projetosMaterias).find(x => x.projetoId === destinoId && x.materiaGlobalId === globalId);
                return { ...item, projetoMateriaId: anterior?.projetoMateriaId || novoId('projeto-materia'), materiaGlobalId: globalId };
            });
            return cadastro(estado, destinoId, entradas, true);
        });
    }
    window.MateriasStore = Object.freeze({
        criarMateriaGlobal, criarProjetoMateria, obterProjetoMateria, salvarCadastro, prepararCopia, corrigirVinculo,
        normalizarNome,
        listarMateriasGlobais() {
            return Object.values(ler().materiasGlobais).filter(m => m.status === 'ativa')
                .sort((a, b) => a.nomeCanonico.localeCompare(b.nomeCanonico, 'pt-BR'));
        },
        resolverMateriaGlobal: id => resolver(ler(), id),
        listarProjetosMaterias(projetoId) {
            if (!texto(projetoId)) falhar('projetoId obrigatório');
            return Object.values(ler().projetosMaterias).filter(p => p.projetoId === projetoId);
        },
        validarIntegridade: () => { ler(); return true; }
    });
})();
