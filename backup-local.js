/* Exportação, pasta fixa (File System Access API), restauração local e solicitação de persistência do navegador. */
(function () {
    'use strict';
    const chaves = new Set(['materiasDominioV1', 'materiasBuscaV1', 'notasBlocosV1', 'sessoesEstudo',
        'reiniciosDominio', 'projetoSelecionadoV1', 'projetosBackupV1', 'projetosTransacaoV1',
        'cronometroRegistroV1', 'progressoProjetos', 'identidadesV1', 'identidadesTransacaoV1',
        'dadosExame', 'wizardProjeto', 'listaDiaDaSemana', 'carga_horaria_disponivel',
        'lista_distribuicao_materias', 'totalQuestoes', 'objetosSalvos', 'objetosNormalizados',
        'somaDasQuestoesNormalizadas', 'materiaDoDia', 'revisoesDoDia', 'planosIdentidadeV1',
        'revisoesEstadoV1', 'revisoesTransacaoV1', 'grimorioTemaPixelV1', 'grimorioScanlinesPixelV1',
        'grimorioBackupAnteriorV1']);
    const prefixos = ['projetoV1:', 'historicoOperacaoV1:', 'cronometroV1:', 'projetosTransacaoV2:'];
    const DB_NOME = 'grimorioBackupPastaV1';
    const STORE_NOME = 'diretorio';
    const CHAVE_HANDLE = 'pastaFixa';
    const ANTERIOR = 'grimorioBackupAnteriorV1', JOURNAL = 'grimorioRestauracaoV1';
    const storageNativo = window.localStorage;
    let bloqueado = false, restaurando = false, liberarUso = null, pronta = Promise.resolve(), usoPedido = Promise.resolve();
    const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const texto = v => typeof v === 'string' && v.trim().length > 0;
    const falhar = mensagem => { throw new Error(`Backup inválido: ${mensagem}`); };
    const exigir = (condicao, mensagem) => { if (!condicao) falhar(mensagem); };
    const internas = k => k === ANTERIOR || k === JOURNAL;

    // Persistência de armazenamento do navegador (temporária até implantação de backend/nuvem; documentada para futura remoção se necessário).
    async function solicitarPersistencia() {
        try {
            if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
                return await navigator.storage.persist();
            }
        } catch (_) {}
        return false;
    }

    function ehChaveGrimorio(nome) {
        return nome !== null && (chaves.has(nome) || prefixos.some(p => nome.startsWith(p)));
    }

    function capturar(storage) {
        const nomes = [];
        for (let i = 0; i < storage.length; i++) {
            const nome = storage.key(i);
            if (ehChaveGrimorio(nome) && !internas(nome)) nomes.push(nome);
        }
        return Object.fromEntries(nomes.sort().map(nome => [nome, storage.getItem(nome)]));
    }

    function exportar(storage = storageNativo) {
        for (let tentativa = 0; tentativa < 3; tentativa++) {
            const antes = capturar(storage), depois = capturar(storage);
            if (JSON.stringify(antes) === JSON.stringify(depois) && Object.values(antes).every(v => typeof v === 'string')) {
                return { formato: 'grimorio-backup', versao: 1, exportadoEm: new Date().toISOString(),
                    origem: window.location.origin, armazenamento: { localStorage: antes } };
            }
        }
        throw new Error('Os dados estão mudando em outra aba. Tente baixar novamente.');
    }

    function validarBackup(dados) {
        const obj = typeof dados === 'string' ? (() => {
            try { return JSON.parse(dados); } catch (_) { throw new Error('O arquivo selecionado não é um JSON válido.'); }
        })() : dados;
        if (!obj || typeof obj !== 'object' || obj.formato !== 'grimorio-backup' || obj.versao !== 1) {
            throw new Error('Formato de backup inválido. Selecione um arquivo gerado pelo Grimório.');
        }
        const mapa = obj.armazenamento?.localStorage;
        if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) {
            throw new Error('Estrutura de armazenamento ausente ou inválida no backup.');
        }
        const entradas = Object.create(null);
        for (const [k, v] of Object.entries(mapa)) {
            if (!ehChaveGrimorio(k)) throw new Error(`Chave não reconhecida no backup: ${k}`);
            if (typeof v !== 'string') throw new Error(`Valor inválido para a chave ${k} no backup.`);
            // Cópias antigas podem conter safety: ele nunca substitui a proteção atual.
            if (k === ANTERIOR) continue;
            entradas[k] = v;
        }
        exigir(Object.keys(entradas).length > 0, 'o arquivo não contém dados para restaurar.');
        validarConteudo(entradas);
        return entradas;
    }

    function validarConteudo(entradas) {
        const efetivo = { ...entradas }, parsed = Object.create(null);
        const json = (k, raw = efetivo[k]) => {
            try { return JSON.parse(raw); } catch (_) { falhar(`JSON interno inválido em ${k}.`); }
        };
        // Valide também o resultado dos journals vigentes, sem executá-los no navegador.
        for (const k of Object.keys(efetivo).filter(k => /^projetosTransacaoV[12](?::.+)?$/.test(k))) {
            const journal = json(k); exigir(objeto(journal), `journal ${k}.`);
            for (const [destino, valor] of Object.entries(journal)) {
                exigir(ehChaveGrimorio(destino) && !internas(destino) && !/Transacao/.test(destino), `destino do journal ${k}.`);
                exigir(valor === null || typeof valor === 'string', `valor do journal ${k}.`);
                if (valor === null) delete efetivo[destino]; else efetivo[destino] = valor;
            }
        }
        for (const k of Object.keys(efetivo).filter(k => /(?:^|:)revisoesTransacaoV1$/.test(k))) {
            const journal = json(k), prefixo = k.slice(0, -'revisoesTransacaoV1'.length);
            exigir(objeto(journal), `journal ${k}.`);
            for (const [destino, valor] of Object.entries(journal)) {
                exigir(['revisoesEstadoV1', 'sessoesEstudo'].includes(destino) && typeof valor === 'string', `destino do journal ${k}.`);
                // O journal de revisão envia sessões ao repositório; validação abaixo conserva ambos os lotes.
                if (destino !== 'sessoesEstudo') efetivo[prefixo + destino] = valor;
            }
        }
        for (const [k, valor] of Object.entries(efetivo)) {
            if (['projetoSelecionadoV1', 'grimorioTemaPixelV1', 'grimorioScanlinesPixelV1'].includes(k)) continue;
            parsed[k] = json(k, valor);
        }
        const dominio = parsed.materiasDominioV1 === undefined ? { versao: 1, materiasGlobais: {}, projetosMaterias: {} } : parsed.materiasDominioV1;
        exigir(objeto(dominio) && Object.keys(dominio).every(k => ['versao', 'materiasGlobais', 'projetosMaterias'].includes(k))
            && dominio.versao === 1 && objeto(dominio.materiasGlobais) && objeto(dominio.projetosMaterias), 'domínio de matérias.');
        const globais = dominio.materiasGlobais, participacoes = dominio.projetosMaterias;
        const normalizar = s => s.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').replace(/[.,;:!?\-–—_/\\()]/g, ' ').replace(/\s+/g, ' ').trim();
        const idValido = (id, prefixo) => typeof id === 'string' && new RegExp(`^${prefixo}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i').test(id);
        const instante = s => texto(s) && Number.isFinite(Date.parse(s));
        const civil = s => {
            if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
            const [ano, mes, dia] = s.split('-').map(Number), d = new Date(0);
            d.setUTCFullYear(ano, mes - 1, dia); d.setUTCHours(0, 0, 0, 0);
            return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
        };
        const resolver = id => {
            const visitados = new Set();
            while (globais[id]?.status === 'mesclada') { exigir(!visitados.has(id), 'ciclo de matérias.'); visitados.add(id); id = globais[id].mescladaEm; }
            exigir(objeto(globais[id]), 'referência de matéria global.'); return id;
        };
        const nomes = new Set(), unicas = new Set();
        for (const [id, g] of Object.entries(globais)) {
            exigir(objeto(g) && Object.keys(g).every(k => ['materiaGlobalId', 'nomeCanonico', 'nomeNormalizado', 'status', 'mescladaEm', 'criadoEm', 'atualizadoEm'].includes(k))
                && idValido(id, 'materia-global') && g.materiaGlobalId === id && texto(g.nomeCanonico)
                && g.nomeNormalizado === normalizar(g.nomeCanonico) && ['ativa', 'arquivada', 'mesclada'].includes(g.status)
                && instante(g.criadoEm) && instante(g.atualizadoEm) && (g.status === 'mesclada' ? idValido(g.mescladaEm, 'materia-global') : g.mescladaEm === null), 'matéria global.');
            if (g.status === 'ativa') { exigir(!nomes.has(g.nomeNormalizado), 'nome global ativo duplicado.'); nomes.add(g.nomeNormalizado); }
            resolver(id);
        }
        for (const [id, p] of Object.entries(participacoes)) {
            exigir(objeto(p) && Object.keys(p).every(k => ['projetoMateriaId', 'projetoId', 'materiaGlobalId', 'nomeExibicao', 'Nquestoes', 'peso', 'afinidade', 'criadoEm', 'removida'].includes(k))
                && idValido(id, 'projeto-materia') && p.projetoMateriaId === id && texto(p.projetoId)
                && (p.nomeExibicao === null || texto(p.nomeExibicao)) && typeof p.removida === 'boolean' && instante(p.criadoEm)
                && Number.isInteger(p.Nquestoes) && p.Nquestoes >= 0 && Number.isFinite(p.peso) && p.peso >= 0 && [0.5, 1, 1.5].includes(p.afinidade), 'participação.');
            const chave = JSON.stringify([p.projetoId, resolver(p.materiaGlobalId)]);
            if (!p.removida) { exigir(!unicas.has(chave), 'participação ativa duplicada.'); unicas.add(chave); }
        }
        function vinculo(id, projetoId) { exigir(texto(id) && participacoes[id]?.projetoId === projetoId, 'projetoMateriaId ausente ou pertencente a outro projeto.'); }
        const sessoes = new Map();
        const canonico = v => Array.isArray(v) ? `[${v.map(canonico)}]` : objeto(v) ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',')}}` : JSON.stringify(v);
        function sessao(s) {
            exigir(objeto(s) && texto(s.id) && texto(s.projetoId) && texto(s.materia) && instante(s.inicio)
                && Number.isInteger(s.duracaoSegundos) && s.duracaoSegundos > 0 && !Object.hasOwn(s, 'materiaId') && !Object.hasOwn(s, 'materiaGlobalId'), 'sessão.');
            vinculo(s.projetoMateriaId, s.projetoId);
            for (const campo of ['blocoId', 'blocoExtraId', 'revisaoId', 'tipo', 'origem']) if (s[campo] != null) exigir(texto(s[campo]), `campo ${campo} da sessão.`);
            for (const campo of ['diaJornada', 'referenciaDia']) if (s[campo] != null) exigir(/^dia[1-9]\d*$/.test(s[campo]), `campo ${campo} da sessão.`);
            if (s.blocoExtraId) exigir(s.blocoId === s.blocoExtraId && /^extra-[\w-]+$/.test(s.blocoExtraId), 'bloco extra da sessão.');
            if (s.anotacao !== undefined) exigir(typeof s.anotacao === 'string' && s.anotacao.length <= 140, 'anotação da sessão.');
            if (s.dataEstudo !== undefined) exigir(civil(s.dataEstudo) && s.precisaoInicio === 'dia' && instante(s.registradoEm), 'data estudada da sessão.');
            const anterior = sessoes.get(s.id); exigir(!anterior || canonico(anterior) === canonico(s), 'sessões conflitantes para o mesmo ID.'); sessoes.set(s.id, s);
        }
        function lote(lista) { exigir(Array.isArray(lista), 'lista de sessões.'); lista.forEach(sessao); }
        function resets(grupos) { exigir(objeto(grupos), 'reinícios de domínio.'); for (const [id, ids] of Object.entries(grupos)) { resolver(id); exigir(Array.isArray(ids) && ids.every(texto), 'IDs de reinício.'); } }
        if (parsed.sessoesEstudo !== undefined) lote(parsed.sessoesEstudo);
        if (parsed.reiniciosDominio !== undefined) resets(parsed.reiniciosDominio);
        for (const [k, v] of Object.entries(parsed)) {
            if (k.startsWith('historicoOperacaoV1:')) {
                exigir(objeto(v) && v.versao === 1 && texto(v.id) && k === `historicoOperacaoV1:${v.id}` && ['adicionar', 'excluir', 'reiniciar-dominio'].includes(v.tipo), 'operação de histórico.');
                if (v.tipo === 'adicionar') lote(v.sessoes);
                if (v.tipo === 'excluir') exigir(texto(v.sessaoId), 'tombstone.');
                if (v.tipo === 'reiniciar-dominio') resets(v.grupos);
            }
            if (k === 'cronometroRegistroV1') { exigir(objeto(v) && v.chave === `cronometroV1:${v.sessao?.projetoId}`, 'journal do cronômetro.'); sessao(v.sessao); }
            if (/(?:^|:)revisoesTransacaoV1$/.test(k) && v.sessoesEstudo) lote(json(k, v.sessoesEstudo));
            if (k.startsWith('cronometroV1:')) {
                exigir(objeto(v) && v.versao === 1 && texto(v.id) && k === `cronometroV1:${v.projetoId}` && texto(v.materia)
                    && objeto(v.contexto) && v.contexto.projetoId === v.projetoId && ['rodando', 'parado'].includes(v.estado)
                    && Number.isFinite(v.tempoMs) && v.tempoMs >= 0 && instante(v.inicio), 'checkpoint de cronômetro.');
                vinculo(v.contexto.projetoMateriaId, v.projetoId);
            }
            const p = /^projetoV1:([^:]+):(.+)$/.exec(k), nome = p ? p[2] : k, projetoId = p?.[1];
            if (p) exigir(chaves.has(nome) || nome === 'registro' || /^estudoExtraV1:extra-[\w-]+$/.test(nome), `chave de projeto ${k}.`);
            if (nome === 'registro') exigir(objeto(v) && v.id === projetoId && instante(v.criadoEm), 'registro de projeto.');
            if (nome === 'dadosExame') exigir(objeto(v) && texto(v.projetoId) && (!projetoId || v.projetoId === projetoId), 'dados de projeto.');
            if (['objetosSalvos', 'objetosNormalizados', 'lista_distribuicao_materias'].includes(nome)) { exigir(Array.isArray(v), `lista ${k}.`); v.forEach(b => { exigir(objeto(b), `matéria em ${k}.`); vinculo(b.projetoMateriaId, projetoId || participacoes[b.projetoMateriaId]?.projetoId); }); }
            if (nome === 'materiaDoDia') {
                exigir(objeto(v), 'plano diário.');
                exigir(objeto(parsed[(projetoId ? `projetoV1:${projetoId}:` : '') + 'dadosExame']), 'dados do plano diário ausentes.');
                const ids = new Set();
                Object.entries(v).forEach(([dia, blocos]) => { exigir(/^dia[1-9]\d*$/.test(dia) && Array.isArray(blocos), 'dia do plano.'); blocos.forEach(b => {
                    exigir(objeto(b) && texto(b.blocoId) && !ids.has(b.blocoId) && b.projetoId === (projetoId || b.projetoId), 'bloco do plano.'); ids.add(b.blocoId); vinculo(b.projetoMateriaId, b.projetoId);
                    if (b.metaSegundos !== undefined) exigir(Number.isInteger(b.metaSegundos) && b.metaSegundos >= 0, 'meta do plano.');
                }); });
            }
            if (nome === 'revisoesDoDia') {
                exigir(objeto(v), 'programação de revisões.');
                const plano = parsed[(projetoId ? `projetoV1:${projetoId}:` : '') + 'materiaDoDia'] || {};
                for (const [dia, etapas] of Object.entries(v)) {
                    exigir(Object.hasOwn(plano, dia) && objeto(etapas), 'destino de revisão.');
                    for (const [etapa, grupo] of Object.entries(etapas)) {
                        exigir(['revisao1', 'revisao2', 'revisao3'].includes(etapa) && (grupo === null || objeto(grupo)), 'etapa de revisão.');
                        for (const [origem, blocos] of Object.entries(grupo || {})) { exigir(Array.isArray(blocos), 'blocos de revisão.'); blocos.forEach(b => {
                            exigir(objeto(b) && (plano[origem] || []).some(x => x.blocoId === b.blocoId && x.projetoMateriaId === b.projetoMateriaId && x.projetoId === b.projetoId), 'origem de revisão.');
                        }); }
                    }
                }
            }
            if (nome === 'planosIdentidadeV1') { exigir(Array.isArray(v), 'versões de blocos.'); v.forEach(versao => exigir(objeto(versao) && texto(versao.assinatura) && objeto(versao.blocos) && Object.values(versao.blocos).every(texto), 'versão de blocos.')); }
            if (nome === 'revisoesEstadoV1') {
                exigir(objeto(v) && v.versao === 1 && typeof v.habilitadas === 'boolean' && objeto(v.entidades) && Array.isArray(v.ativas) && v.ativas.every(id => Object.hasOwn(v.entidades, id)), 'estados de revisão.');
                for (const [id, r] of Object.entries(v.entidades)) { exigir(objeto(r) && r.id === id && texto(r.projetoId) && (!projetoId || r.projetoId === projetoId) && texto(r.blocoId)
                    && ['R1', 'R2', 'R3'].includes(r.etapa) && ['pendente', 'concluida', 'dispensada'].includes(r.estado) && Number.isInteger(r.sugeridaSegundos) && r.sugeridaSegundos >= 0, 'revisão.'); vinculo(r.projetoMateriaId, r.projetoId); }
            }
            if (nome.startsWith('estudoExtraV1:')) {
                exigir(objeto(v) && v.versao === 1 && v.projetoId === projetoId && nome === `estudoExtraV1:${v.blocoId}` && /^dia[1-9]\d*$/.test(v.diaJornada)
                    && civil(v.dataOrigem) && instante(v.criadoEm), 'atividade extra.');
                if (v.projetoMateriaId !== null) vinculo(v.projetoMateriaId, projetoId);
                if (v.registroManualPendente) { sessao(v.registroManualPendente); exigir(v.registroManualPendente.blocoExtraId === v.blocoId && v.registroManualPendente.projetoMateriaId === v.projetoMateriaId, 'registro pendente do extra.'); }
            }
            if (nome === 'notasBlocosV1') { exigir(objeto(v), 'notas.'); for (const [id, nota] of Object.entries(v)) { exigir(objeto(nota) && nota.blocoId === id && typeof nota.texto === 'string' && nota.texto.length <= 140, 'nota de bloco.'); vinculo(nota.projetoMateriaId, nota.projetoId); } }
            if (nome === 'listaDiaDaSemana') exigir(Array.isArray(v) && v.every(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].includes(d)), 'dias da semana.');
            if (['wizardProjeto', 'projetosBackupV1', 'identidadesV1', 'identidadesTransacaoV1', 'progressoProjetos'].includes(nome)) exigir(objeto(v), `estrutura ${nome}.`);
            if (['carga_horaria_disponivel', 'totalQuestoes', 'somaDasQuestoesNormalizadas'].includes(nome)) exigir(Number.isFinite(Number(v)) && Number(v) >= 0, `número ${nome}.`);
        }
        if (parsed.materiasBuscaV1 !== undefined) {
            const m = parsed.materiasBuscaV1; exigir(objeto(m) && Object.keys(m).every(k => ['versao', 'aliases', 'termos', 'recentes'].includes(k))
                && m.versao === 1 && Array.isArray(m.aliases) && Array.isArray(m.termos) && objeto(m.recentes), 'memórias de busca.');
            [...m.aliases, ...m.termos].forEach(b => { exigir(objeto(b) && Object.keys(b).every(k => ['materiaGlobalId', 'texto', 'normalizado'].includes(k))
                && texto(b.texto) && b.texto.length <= 120 && b.normalizado === normalizar(b.texto), 'memória de busca.'); resolver(b.materiaGlobalId); });
            Object.entries(m.recentes).forEach(([id, data]) => { resolver(id); exigir(instante(data), 'data da memória.'); });
        }
    }

    function verificarTimerAtivo(storage) {
        if (window.CronometroEstudos && typeof window.CronometroEstudos.obterEstado === 'function') {
            if (window.CronometroEstudos.obterEstado().estado !== 'ocioso') {
                throw new Error('Registre ou zere o cronômetro ativo antes de restaurar um backup.');
            }
        }
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k && (k.startsWith('cronometroV1:') || k === 'cronometroRegistroV1')) {
                throw new Error('Há um cronômetro ou registro pendente, inclusive pausado. Registre ou zere antes de restaurar.');
            }
        }
    }

    function garantirDisponivel() {
        if (bloqueado || storageNativo.getItem(JOURNAL)) throw new Error('Restauração pendente. Aguarde a recuperação e recarregue a página.');
    }
    function iguais(a, b) { return JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort()); }
    function substituir(storage, mapa) {
        for (const k of Object.keys(capturar(storage))) storage.removeItem(k);
        for (const [k, v] of Object.entries(mapa)) storage.setItem(k, v);
        if (!iguais(capturar(storage), mapa)) throw new Error('A conferência dos dados gravados falhou.');
    }
    function recuperarRestauracao(storage = storageNativo) {
        const raw = storage.getItem(JOURNAL);
        if (!raw) return false;
        const journal = JSON.parse(raw), copia = JSON.parse(storage.getItem(ANTERIOR) || 'null');
        if (!journal || journal.versao !== 1 || !copia || copia.versao !== 1 || copia.id !== journal.backupId || !objeto(copia.localStorage)
            || !Object.entries(copia.localStorage).every(([k, v]) => ehChaveGrimorio(k) && !internas(k) && typeof v === 'string')) {
            throw new Error('A cópia de recuperação está inválida. Exporte os dados e solicite recuperação; nenhuma substituição foi iniciada.');
        }
        // A cópia anterior pode conter dados inválidos: recovery é restituição exata, não importação.
        substituir(storage, copia.localStorage);
        storage.removeItem(JOURNAL);
        if (storage.getItem(JOURNAL) !== null) throw new Error('Não foi possível finalizar a recuperação.');
        return true;
    }
    function restaurarExclusivo(entradas, storage) {
        verificarTimerAtivo(storage);
        if (storage.getItem(JOURNAL)) recuperarRestauracao(storage);
        const snapshotAnterior = capturar(storage);
        const id = window.crypto.randomUUID();
        // Falha na reserva não remove nem regrava os dados vigentes.
        storage.setItem(ANTERIOR, JSON.stringify({ versao: 1, id, salvoEm: new Date().toISOString(), localStorage: snapshotAnterior }));
        const copia = JSON.parse(storage.getItem(ANTERIOR) || 'null');
        if (!copia || copia.id !== id || !iguais(copia.localStorage, snapshotAnterior)) throw new Error('Não foi possível conferir a cópia anterior. Nenhum dado foi substituído.');
        storage.setItem(JOURNAL, JSON.stringify({ versao: 1, backupId: id }));
        try {
            substituir(storage, entradas);
            storage.removeItem(JOURNAL);
            if (storage.getItem(JOURNAL) !== null) throw new Error('O commit da restauração não foi confirmado.');
            try {
                if (typeof sessionStorage !== 'undefined') {
                    if (entradas.projetoSelecionadoV1) sessionStorage.setItem('projetoSelecionadoV1', entradas.projetoSelecionadoV1);
                    else sessionStorage.removeItem('projetoSelecionadoV1');
                }
            } catch (_) {}
            return { restauradas: Object.keys(entradas).length, anteriorPreservado: true };
        } catch (erro) {
            try {
                recuperarRestauracao(storage);
            } catch (recuperacao) {
                bloquearPagina('A recuperação do backup ainda está pendente. Baixe a cópia anterior para protegê-la, libere espaço e tente recuperar novamente.');
                window.setTimeout(() => window.location.reload(), 0);
                throw new Error(`Restauração interrompida e recuperação ainda pendente. A cópia anterior e o journal foram mantidos; não utilize o app até recuperar. (${recuperacao.message})`);
            }
            throw new Error(`Não foi possível concluir a restauração. O estado anterior foi recuperado e conferido. (${erro.message || 'Erro de escrita'})`);
        }
    }
    async function manterUso() {
        if (!window.navigator?.locks || typeof window.addEventListener !== 'function') return;
        let resolver;
        const adquirida = new Promise(resolve => { resolver = resolve; });
        usoPedido = window.navigator.locks.request('grimorio:uso', { mode: 'shared' }, async () => {
            resolver(); await new Promise(resolve => { liberarUso = resolve; }); liberarUso = null;
        }).catch(() => resolver());
        await adquirida;
    }
    async function exclusivo(comando) {
        if (!window.navigator?.locks) throw new Error('Restauração exige Web Locks em localhost/HTTPS. A exportação continua disponível.');
        await pronta;
        if (liberarUso) { const liberar = liberarUso; liberarUso = null; liberar(); await usoPedido; }
        try {
            return await window.navigator.locks.request('grimorio:uso', { ifAvailable: true }, lock => {
                if (!lock) throw new Error('Feche as outras abas do Grimório antes de restaurar o backup.');
                return comando();
            });
        } finally { if (!bloqueado) { pronta = manterUso(); await pronta; } }
    }
    async function restaurar(dados, storage = storageNativo) {
        if (restaurando) throw new Error('Uma restauração já está em andamento. Aguarde sua conclusão.');
        restaurando = true;
        try {
            garantirDisponivel(); verificarTimerAtivo(storage);
            const entradas = validarBackup(dados);
            return await exclusivo(() => restaurarExclusivo(entradas, storage));
        } finally { restaurando = false; }
    }
    function exportarAnterior() {
        const copia = JSON.parse(storageNativo.getItem(ANTERIOR) || 'null');
        if (!copia || copia.versao !== 1 || !texto(copia.id) || !objeto(copia.localStorage)
            || !Object.entries(copia.localStorage).every(([k, v]) => ehChaveGrimorio(k) && !internas(k) && typeof v === 'string')) {
            throw new Error('Não há uma cópia anterior válida para exportar.');
        }
        return { formato: 'grimorio-backup', versao: 1, exportadoEm: new Date().toISOString(),
            origem: window.location.origin, armazenamento: { localStorage: copia.localStorage } };
    }

    function abrirBancoPasta() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível.'));
            const req = indexedDB.open(DB_NOME, 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE_NOME)) req.result.createObjectStore(STORE_NOME);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('Falha ao acessar banco local de pasta.'));
        });
    }

    async function obterPastaSalva() {
        try {
            const db = await abrirBancoPasta();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NOME, 'readonly');
                const req = tx.objectStore(STORE_NOME).get(CHAVE_HANDLE);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch (_) {
            return null;
        }
    }

    async function salvarPastaNoBanco(handle) {
        const db = await abrirBancoPasta();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NOME, 'readwrite');
            tx.objectStore(STORE_NOME).put(handle, CHAVE_HANDLE);
            tx.oncomplete = () => resolve(handle);
            tx.onerror = () => reject(tx.error || new Error('Não foi possível memorizar a pasta.'));
        });
    }

    async function configurarPastaFixa() {
        if (typeof window.showDirectoryPicker !== 'function') {
            throw new Error('Seu navegador não suporta pasta fixa direta. Use o botão "Baixar backup completo".');
        }
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await salvarPastaNoBanco(handle);
        return handle;
    }

    function nomesArquivosDia(isoString) {
        const dataDia = isoString.slice(0, 10);
        return [`grimorio-backup-${dataDia}.json`, 'grimorio-backup-ultimo.json'];
    }

    async function gravarEmPasta(handle, dados) {
        if (typeof handle.queryPermission === 'function') {
            let perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted' && typeof handle.requestPermission === 'function') {
                perm = await handle.requestPermission({ mode: 'readwrite' });
            }
            if (perm !== 'granted') throw new Error('Permissão negada para gravar na pasta escolhida.');
        }
        const conteudo = JSON.stringify(dados, null, 2);
        const arquivos = nomesArquivosDia(dados.exportadoEm);
        for (const nome of arquivos) {
            const fileHandle = await handle.getFileHandle(nome, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(conteudo);
            await writable.close();
        }
        return { pasta: handle.name || 'pasta selecionada', arquivo: arquivos[0] };
    }

    function dispararDownload(dados) {
        let url;
        try {
            url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json;charset=utf-8' }));
            const link = document.createElement('a');
            link.setAttribute('data-backup-recuperacao', '');
            link.href = url;
            link.download = `grimorio-backup-${dados.exportadoEm.replace(/[:.]/g, '-')}.json`;
            document.body.appendChild(link);
            try { link.click(); } finally { link.remove(); }
        } finally {
            if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    async function salvarRapido(opcoes = {}) {
        const dados = exportar(opcoes.storage || window.localStorage);
        let handle = await obterPastaSalva();
        if (!handle && opcoes.escolherPastaSeAusente && typeof window.showDirectoryPicker === 'function') {
            handle = await configurarPastaFixa();
        }
        if (handle) {
            const res = await gravarEmPasta(handle, dados);
            return { modo: 'pasta', ...res, exportadoEm: dados.exportadoEm };
        }
        dispararDownload(dados);
        return { modo: 'download', exportadoEm: dados.exportadoEm };
    }

    window.BackupLocal = {
        exportar,
        restaurar,
        validarBackup,
        solicitarPersistencia,
        configurarPastaFixa,
        obterPastaSalva,
        salvarRapido,
        exportarAnterior,
        garantirDisponivel,
        get pronta() { return pronta; }
    };

    function bloquearPagina(mensagem) {
        bloqueado = true;
        for (const evento of ['click', 'submit', 'keydown', 'input', 'change']) document.addEventListener(evento, e => {
            if (!e.target?.closest?.('[data-backup-recuperacao]')) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
        // Somente a recuperação usa o storage nativo capturado acima. Os módulos
        // carregados depois não podem ler um estado parcial nem iniciar gravações.
        const indisponivel = new Proxy(storageNativo, { get(alvo, campo) {
            if (['getItem', 'setItem', 'removeItem', 'clear'].includes(campo)) return () => { throw new Error('Armazenamento bloqueado até concluir a recuperação do backup.'); };
            return Reflect.get(alvo, campo, alvo);
        } });
        try { Object.defineProperty(window, 'localStorage', { value: indisponivel, configurable: true }); } catch (_) {}
        const mostrar = () => {
            if (!document.body) return;
            const aviso = document.createElement('p'); aviso.setAttribute('role', 'alert'); aviso.textContent = mensagem;
            const recarregar = document.createElement('button'); recarregar.textContent = 'Tentar recuperar novamente';
            recarregar.setAttribute('data-backup-recuperacao', '');
            recarregar.addEventListener('click', () => window.location.reload());
            const baixar = document.createElement('button'); baixar.textContent = 'Baixar cópia anterior para recuperação';
            baixar.setAttribute('data-backup-recuperacao', '');
            baixar.addEventListener('click', () => { try { dispararDownload(exportarAnterior()); } catch (erro) { aviso.textContent = erro.message; } });
            document.body.replaceChildren(aviso, baixar, recarregar);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.setTimeout(mostrar, 0));
        mostrar();
    }
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', () => { if (liberarUso) { liberarUso(); liberarUso = null; } });
        window.addEventListener('pageshow', evento => {
            if (evento.persisted) { if (storageNativo.getItem(JOURNAL)) window.location.reload(); else pronta = manterUso(); }
        });
        if (storageNativo.getItem(JOURNAL)) {
            bloquearPagina('Há uma restauração interrompida. Feche as outras abas do Grimório e aguarde a recuperação. Seus dados não serão usados enquanto ela estiver pendente.');
            pronta = (async () => {
                if (!window.navigator?.locks) throw new Error('Recuperação exige Web Locks em localhost/HTTPS.');
                await window.navigator.locks.request('grimorio:uso', () => recuperarRestauracao(storageNativo));
                window.location.reload();
            })().catch(erro => bloquearPagina(`Recuperação pendente: ${erro.message}. A cópia anterior foi mantida. Libere espaço e recarregue.`));
        } else pronta = manterUso();
    }

    solicitarPersistencia();

    document.addEventListener('DOMContentLoaded', () => {
        for (const botao of document.querySelectorAll('[data-backup-exportar]')) {
            botao.addEventListener('click', () => {
                const status = document.getElementById(botao.dataset.backupStatus);
                try {
                    const dados = exportar();
                    dispararDownload(dados);
                    if (status) status.textContent = 'Backup preparado para download. Guarde o arquivo em um local seguro.';
                } catch (erro) {
                    if (status) status.textContent = `Não foi possível preparar o backup. ${erro.message || 'Tente novamente.'}`;
                }
            });
        }

        for (const botao of document.querySelectorAll('[data-backup-pasta]')) {
            obterPastaSalva().then(handle => {
                if (handle?.name) botao.title = `Pasta atual: ${handle.name}`;
            }).catch(() => {});
            botao.addEventListener('click', async () => {
                const status = document.getElementById(botao.dataset.backupStatus);
                try {
                    const resultado = await salvarRapido({ escolherPastaSeAusente: true });
                    if (status) {
                        status.textContent = resultado.modo === 'pasta'
                            ? `Backup do dia salvo em "${resultado.pasta}" (${resultado.arquivo}).`
                            : 'Backup preparado para download. Guarde o arquivo em um local seguro.';
                    }
                } catch (erro) {
                    if (erro?.name === 'AbortError') return;
                    if (status) status.textContent = `Não foi possível salvar na pasta. ${erro.message || 'Tente usar o download padrão.'}`;
                }
            });
        }

        for (const botao of document.querySelectorAll('[data-backup-trocar-pasta]')) {
            botao.addEventListener('click', async () => {
                const status = document.getElementById(botao.dataset.backupStatus);
                try {
                    const handle = await configurarPastaFixa();
                    const res = await gravarEmPasta(handle, exportar());
                    if (status) status.textContent = `Pasta fixa definida para "${res.pasta}" e backup de hoje atualizado (${res.arquivo}).`;
                } catch (erro) {
                    if (erro?.name === 'AbortError') return;
                    if (status) status.textContent = `Não foi possível definir a pasta fixa. ${erro.message || 'Tente novamente.'}`;
                }
            });
        }

        for (const botao of document.querySelectorAll('[data-backup-restaurar]')) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.hidden = true;
            botao.after(input);
            botao.addEventListener('click', () => {
                input.value = '';
                input.click();
            });
            input.addEventListener('change', async () => {
                const arquivo = input.files?.[0];
                if (!arquivo) return;
                const status = document.getElementById(botao.dataset.backupStatus);
                try {
                    const texto = await arquivo.text();
                    const entradas = validarBackup(texto);
                    const qtd = Object.keys(entradas).length;
                    const confirmar = window.confirm(
                        `Restaurar backup de "${arquivo.name}" (${qtd} registros de armazenamento)?\n\n` +
                        'Os dados atuais do Grimório neste navegador serão substituídos pelos dados do arquivo (uma cópia de segurança do estado anterior será mantida localmente).'
                    );
                    if (!confirmar) {
                        if (status) status.textContent = 'Restauração cancelada. Nenhum dado foi alterado.';
                        return;
                    }
                    await restaurar(texto);
                    if (status) status.textContent = 'Backup restaurado com sucesso. Recarregando...';
                    window.location.reload();
                } catch (erro) {
                    if (status) status.textContent = `Não foi possível restaurar o backup. ${erro.message || 'Verifique o arquivo.'}`;
                }
            });
        }
    });
})();
