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
        'grimorioPerfilV1', 'grimorioSistemaIaV1', 'grimorioBackupAnteriorV1']);
    const prefixos = ['projetoV1:', 'historicoOperacaoV1:', 'cronometroV1:', 'projetosTransacaoV2:', 'praticasProjetoV1:'];
    const DB_NOME = 'grimorioBackupPastaV1';
    const STORE_NOME = 'diretorio';
    const CHAVE_HANDLE = 'pastaFixa';
    const ANTERIOR = 'grimorioBackupAnteriorV1', JOURNAL = 'grimorioRestauracaoV1';
    const storageNativo = window.localStorage;
    let bloqueado = false, restaurando = false, liberarUso = null, pronta = Promise.resolve(), usoPedido = Promise.resolve();
    let operacaoExclusiva = false;
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

    // Preferência/checkpoint auxiliar: nunca representa tempo estudado ou XP.
    function validarPomodoro(v) {
        if (objeto(v) && v.observadoSegundos !== undefined && (!Number.isInteger(v.observadoSegundos) || v.observadoSegundos < 0)) return false;
        if (!objeto(v) || v.versao !== 1 || typeof v.ativo !== 'boolean'
            || ![v.focoSegundos, v.pausaSegundos].every(n => Number.isInteger(n) && n >= 1 && n <= 5999)
            || !['pronto', 'foco', 'aguarda-pausa', 'pausa', 'aguarda-foco'].includes(v.etapa)
            || !Number.isInteger(v.restanteSegundos) || v.restanteSegundos < 0
            || !(v.sessaoId === null || texto(v.sessaoId))) return false;
        if (!v.ativo) return v.etapa === 'pronto' && v.restanteSegundos === 0 && v.sessaoId === null;
        if (v.etapa === 'pronto') return v.restanteSegundos === v.focoSegundos && v.sessaoId === null;
        if (!texto(v.sessaoId)) return false;
        if (v.etapa.startsWith('aguarda-')) return v.restanteSegundos === 0;
        return v.restanteSegundos > 0 && v.restanteSegundos <= (v.etapa === 'foco' ? v.focoSegundos : v.pausaSegundos);
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
        for (const k of Object.keys(parsed).filter(k => k.startsWith('praticasProjetoV1:'))) {
            const partes = /^praticasProjetoV1:([^:]+)$/.exec(k);
            exigir(partes && objeto(parsed[`projetoV1:${partes[1]}:registro`])
                && parsed[`projetoV1:${partes[1]}:registro`].id === partes[1], `projeto das atividades práticas em ${k}.`);
            exigir(typeof window.PraticasSchema?.validar === 'function', 'validador das atividades práticas indisponível. Recarregue o aplicativo.');
            try { window.PraticasSchema.validar(parsed[k], partes[1]); }
            catch (erro) { falhar(`atividades práticas em ${k}: ${erro.message}`); }
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
                && g.nomeNormalizado === normalizar(g.nomeCanonico) && ['ativa', 'arquivada', 'mesclada', 'excluida'].includes(g.status)
                && instante(g.criadoEm) && instante(g.atualizadoEm) && (g.status === 'mesclada' ? idValido(g.mescladaEm, 'materia-global') : g.mescladaEm === null), 'matéria global.');
            if (g.status === 'ativa') { exigir(!nomes.has(g.nomeNormalizado), 'nome global ativo duplicado.'); nomes.add(g.nomeNormalizado); }
            resolver(id);
        }
        for (const [id, p] of Object.entries(participacoes)) {
            exigir(objeto(p) && Object.keys(p).every(k => ['projetoMateriaId', 'projetoId', 'materiaGlobalId', 'nomeExibicao', 'Nquestoes', 'peso', 'afinidade', 'criadoEm', 'removida'].includes(k))
                && idValido(id, 'projeto-materia') && p.projetoMateriaId === id && texto(p.projetoId)
                && (p.nomeExibicao === null || texto(p.nomeExibicao)) && typeof p.removida === 'boolean' && instante(p.criadoEm)
                && Number.isInteger(p.Nquestoes) && p.Nquestoes >= 0 && Number.isFinite(p.peso) && p.peso >= 0 && [0.5, 1, 1.5].includes(p.afinidade), 'participação.');
            resolver(p.materiaGlobalId);
            const chave = JSON.stringify([p.projetoId, p.materiaGlobalId]);
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
            for (const campo of ['diaJornada', 'referenciaDia']) if (s[campo] != null) exigir(/^dia[1-9]\d*$/.test(s[campo])
                || (String(s[campo]).startsWith('folga-') && civil(s[campo].slice(6))), `campo ${campo} da sessão.`);
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
                exigir(objeto(v) && v.versao === 1 && texto(v.id) && k === `historicoOperacaoV1:${v.id}` && ['adicionar', 'excluir', 'excluir-extra', 'reiniciar-dominio'].includes(v.tipo), 'operação de histórico.');
                if (v.tipo === 'adicionar') lote(v.sessoes);
                if(v.tipo === 'excluir-extra') exigir(texto(v.projetoId)&&/^extra-[\w-]+$/.test(v.blocoExtraId), 'tombstone de extra.');
                if (v.tipo === 'excluir') exigir(texto(v.sessaoId), 'tombstone.');
                if (v.tipo === 'reiniciar-dominio') resets(v.grupos);
            }
            if (k === 'cronometroRegistroV1') { exigir(objeto(v) && v.chave === `cronometroV1:${v.sessao?.projetoId}`, 'journal do cronômetro.'); sessao(v.sessao); }
            if (/(?:^|:)revisoesTransacaoV1$/.test(k) && v.sessoesEstudo) lote(json(k, v.sessoesEstudo));
            if (k.startsWith('cronometroV1:')) {
                if (v.contagemContinua !== undefined) exigir(v.contagemContinua === true && Number.isFinite(v.salvoEm) && v.salvoEm >= 0, 'referência do cronômetro contínuo.');
                exigir(objeto(v) && v.versao === 1 && texto(v.id) && k === `cronometroV1:${v.projetoId}` && texto(v.materia)
                    && objeto(v.contexto) && v.contexto.projetoId === v.projetoId && ['rodando', 'parado'].includes(v.estado)
                    && Number.isFinite(v.tempoMs) && v.tempoMs >= 0 && instante(v.inicio), 'checkpoint de cronômetro.');
                if (v.contexto.tipo === 'pratica') {
                    const estado = parsed[`praticasProjetoV1:${v.projetoId}`];
                    const missao = estado?.missoes?.[v.contexto.missaoId];
                    const atividade = estado?.atividades?.[v.contexto.atividadeId]?.atividade;
                    exigir(missao && atividade && missao.atividadeId === atividade.atividadeId
                        && missao.projetoId === v.projetoId && atividade.tipo !== 'taf'
                        && Object.keys(v.contexto).every(k => ['tipo','projetoId','atividadeId','missaoId'].includes(k)),
                    'checkpoint de atividade prática.');
                } else vinculo(v.contexto.projetoMateriaId, v.projetoId);
            }
            if (k === 'grimorioPerfilV1') {
                exigir(objeto(v) && v.versao === 1
                    && Object.keys(v).every(c => ['versao', 'nomeExibicao', 'avatarId', 'tituloEquipadoId'].includes(c))
                    && (v.nomeExibicao === undefined || typeof v.nomeExibicao === 'string')
                    && (v.avatarId === undefined || typeof v.avatarId === 'string')
                    && (v.tituloEquipadoId === undefined || v.tituloEquipadoId === null || typeof v.tituloEquipadoId === 'string'),
                    'dados do perfil.');
            }
            if (k === 'grimorioSistemaIaV1') {
                const camposIa = ['versao', 'desbloqueadas', 'telemetria', 'filaAvisos', 'historicoAvisos', 'ultimaFalaDia'];
                exigir(objeto(v) && v.versao === 1 && Object.keys(v).every(c => camposIa.includes(c)), 'dados de conquistas do sistema.');
                if (v.desbloqueadas !== undefined) {
                    exigir(objeto(v.desbloqueadas), 'desbloqueios do sistema.');
                    for (const [id, reg] of Object.entries(v.desbloqueadas)) {
                        exigir(texto(id) && objeto(reg) && reg.id === id && instante(reg.em), `conquista inválida ${id}.`);
                    }
                }
                if (v.telemetria !== undefined) exigir(objeto(v.telemetria), 'telemetria do sistema.');
                for (const listaNome of ['filaAvisos', 'historicoAvisos']) {
                    if (v[listaNome] !== undefined) {
                        exigir(Array.isArray(v[listaNome]) && v[listaNome].every(a => objeto(a) && texto(a.id) && instante(a.criadaEm)), `${listaNome} inválida.`);
                    }
                }
                if (v.ultimaFalaDia !== undefined) exigir(objeto(v.ultimaFalaDia), 'estado de falas do sistema.');
            }
            const p = /^projetoV1:([^:]+):(.+)$/.exec(k), nome = p ? p[2] : k, projetoId = p?.[1];
            if (p) exigir(chaves.has(nome) || ['registro', 'pomodoroV1', 'reagendamentoV1'].includes(nome) || /^estudoExtraV1:extra-[\w-]+$/.test(nome), `chave de projeto ${k}.`);
            if (nome === 'reagendamentoV1') {
                const prefixo = `projetoV1:${projetoId}:`, registro = parsed[prefixo + 'registro'];
                exigir(Boolean(p) && registro?.id === projetoId && !registro.removido, 'projeto do reagendamento ausente.');
                exigir(typeof window.ReagendamentoSchema?.validar === 'function', 'validador de reagendamento indisponível.');
                try {
                    window.ReagendamentoSchema.validar(v, projetoId, { dados: parsed[prefixo + 'dadosExame'],
                        materiaDoDia: parsed[prefixo + 'materiaDoDia'], praticas: parsed[`praticasProjetoV1:${projetoId}`] });
                } catch (erro) { falhar(erro.message); }
            }
            if (nome === 'pomodoroV1') exigir(Boolean(p) && validarPomodoro(v), 'configuração/checkpoint do Pomodoro.');
            if (nome === 'registro') exigir(objeto(v) && v.id === projetoId && instante(v.criadoEm), 'registro de projeto.');
            if (nome === 'dadosExame') {
                exigir(objeto(v) && texto(v.projetoId) && (!projetoId || v.projetoId === projetoId), 'dados de projeto.');
                if (v.duracaoProvaSegundos !== undefined) exigir(Number.isSafeInteger(v.duracaoProvaSegundos) && v.duracaoProvaSegundos > 0 && v.duracaoProvaSegundos % 60 === 0, 'duração da prova.');
                validarCargaDiaria(v.cargaDiaria);
                if (Object.hasOwn(v, 'cargaDiariaVersao') || Object.hasOwn(v, 'cargaDiariaPlano')) {
                    const chavePlano = (projetoId ? `projetoV1:${projetoId}:` : '') + 'materiaDoDia';
                    validarPlanoCargaDiaria(v, parsed[chavePlano]);
                }
                if (v.revisoesPolitica !== undefined) validarPoliticaRevisao(v.revisoesPolitica);
                if (v.replanejamento !== undefined) validarReplanejamento(v.replanejamento, v.projetoId);
            }
            if (nome === 'wizardProjeto') {
                validarCargaDiaria(v?.cargaDiaria);
                if (v?.origemReplanejamento) validarReplanejamento(v.origemReplanejamento, projetoId);
                if (v?.revisoesPolitica !== undefined) validarPoliticaRevisao(v.revisoesPolitica, true);
            }
            if (['objetosSalvos', 'objetosNormalizados', 'lista_distribuicao_materias'].includes(nome)) { exigir(Array.isArray(v), `lista ${k}.`); v.forEach(b => { exigir(objeto(b), `matéria em ${k}.`); vinculo(b.projetoMateriaId, projetoId || participacoes[b.projetoMateriaId]?.projetoId); }); }
            if (nome === 'materiaDoDia') {
                exigir(objeto(v), 'plano diário.');
                exigir(objeto(parsed[(projetoId ? `projetoV1:${projetoId}:` : '') + 'dadosExame']), 'dados do plano diário ausentes.');
                const ids = new Set();
                Object.entries(v).forEach(([dia, blocos]) => { exigir(/^dia[1-9]\d*$/.test(dia) && Array.isArray(blocos), 'dia do plano.'); blocos.forEach(b => {
                    exigir(objeto(b) && texto(b.blocoId) && !ids.has(b.blocoId) && b.projetoId === (projetoId || b.projetoId), 'bloco do plano.'); ids.add(b.blocoId); vinculo(b.projetoMateriaId, b.projetoId);
                    if (b.metaSegundos !== undefined) exigir(Number.isInteger(b.metaSegundos) && b.metaSegundos >= 0, 'meta do plano.');
                    if (b.metaNominalSegundos !== undefined) exigir(Number.isSafeInteger(b.metaNominalSegundos) && b.metaNominalSegundos > 0, 'meta nominal do plano.');
                }); });
            }
            if (nome === 'revisoesDoDia') {
                exigir(objeto(v), 'programação de revisões.');
                const plano = parsed[(projetoId ? `projetoV1:${projetoId}:` : '') + 'materiaDoDia'] || {};
                for (const [dia, etapas] of Object.entries(v)) {
                    exigir(Object.hasOwn(plano, dia) && objeto(etapas), 'destino de revisão.');
                    for (const [etapa, grupo] of Object.entries(etapas)) {
                        exigir((/^revisao[1-3]$/.test(etapa) || window.CalendarioJornada?.chavePeriodoDoGrupo(etapa))
                            && (grupo === null || objeto(grupo)), 'período de revisão.');
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
                    && /^R[1-4]$/.test(r.etapa) && ['pendente', 'concluida', 'dispensada'].includes(r.estado) && Number.isInteger(r.sugeridaSegundos) && r.sugeridaSegundos >= 0, 'revisão.');
                    if (r.chavePeriodo !== undefined || r.etapa === 'R4') exigir(window.CalendarioJornada?.periodoDaChave(r.chavePeriodo), 'identidade do período de revisão.');
                    if (r.estadoAlteradoManualmente !== undefined) exigir(r.estadoAlteradoManualmente === true, 'alteração manual de revisão.');
                    if (r.materializadaEm !== undefined) exigir(civil(r.materializadaEm), 'data de materialização da revisão.');
                    if (r.dataNominal !== undefined) exigir(r.dataNominal === null || civil(r.dataNominal), 'data nominal da revisão.');
                    if (r.foraDaReserva !== undefined) exigir(typeof r.foraDaReserva === 'boolean', 'classificação da reserva da revisão.');
                    vinculo(r.projetoMateriaId, r.projetoId); }
            }
            if (nome.startsWith('estudoExtraV1:')) {
                exigir(objeto(v) && v.versao === 1 && v.projetoId === projetoId && nome === `estudoExtraV1:${v.blocoId}`
                    && (/^dia[1-9]\d*$/.test(v.diaJornada) || v.diaJornada === 'folga-' + v.dataOrigem)
                    && civil(v.dataOrigem) && instante(v.criadoEm), 'atividade extra.');
                if (v.projetoMateriaId !== null) vinculo(v.projetoMateriaId, projetoId);
                if (v.registroManualPendente) { sessao(v.registroManualPendente); exigir(v.registroManualPendente.blocoExtraId === v.blocoId && v.registroManualPendente.projetoMateriaId === v.projetoMateriaId, 'registro pendente do extra.'); }
            }
            if (nome === 'notasBlocosV1') { exigir(objeto(v), 'notas.'); for (const [id, nota] of Object.entries(v)) { exigir(objeto(nota) && nota.blocoId === id && typeof nota.texto === 'string' && nota.texto.length <= 140, 'nota de bloco.'); vinculo(nota.projetoMateriaId, nota.projetoId); } }
            if (nome === 'listaDiaDaSemana') exigir(Array.isArray(v) && v.every(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].includes(d)), 'dias da semana.');
            if (['wizardProjeto', 'projetosBackupV1', 'identidadesV1', 'identidadesTransacaoV1', 'progressoProjetos'].includes(nome)) exigir(objeto(v), `estrutura ${nome}.`);
            if (['carga_horaria_disponivel', 'totalQuestoes', 'somaDasQuestoesNormalizadas'].includes(nome)) exigir(Number.isFinite(Number(v)) && Number(v) >= 0, `número ${nome}.`);
        }
        function validarCargaDiaria(carga) {
            if (carga === undefined) return;
            exigir(objeto(carga) && Object.keys(carga).length === 2
                && typeof carga.incluirRevisoes === 'boolean' && typeof carga.incluirPraticas === 'boolean', 'configuração da carga diária.');
        }
        function validarPlanoCargaDiaria(dados, plano) {
            const carga = dados.cargaDiariaPlano;
            exigir(dados.cargaDiariaVersao === 1 && objeto(dados.cargaDiaria) && objeto(carga)
                && Object.keys(carga).every(campo => ['grupos', 'praticas'].includes(campo))
                && Array.isArray(carga.grupos) && Array.isArray(carga.praticas) && objeto(plano), 'plano de carga diária.');
            const calendario = window.CalendarioJornada;
            exigir(typeof calendario?.mapear === 'function', 'calendário da carga diária indisponível.');
            const inicio = calendario.somarDias(dados.dataInicioF, 0), fim = calendario.somarDias(dados.dataFinalF, 0);
            exigir(civil(inicio) && civil(fim) && inicio <= fim && Array.isArray(dados.listaDiaDaSemana)
                && dados.listaDiaDaSemana.length > 0
                && dados.listaDiaDaSemana.every(dia => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].includes(dia)), 'período da carga diária.');
            const noPeriodo = data => civil(data) && data >= inicio && data <= fim;
            const { porDia, porData } = calendario.mapear(dados, Object.keys(plano).length);
            const origens = new Map();
            for (const [dia, blocos] of Object.entries(plano)) {
                exigir(Object.hasOwn(porDia, dia) && noPeriodo(porDia[dia]) && Array.isArray(blocos), 'datas dos blocos da carga diária.');
                for (const bloco of blocos) {
                    exigir(objeto(bloco) && bloco.projetoId === dados.projetoId && texto(bloco.blocoId)
                        && Number.isSafeInteger(bloco.metaSegundos) && bloco.metaSegundos > 0, 'bloco da carga diária.');
                    origens.set(bloco.blocoId, { data: porDia[dia], nominal: bloco.metaNominalSegundos ?? bloco.metaSegundos });
                }
            }
            const ids = new Set();
            for (const grupo of carga.grupos) {
                exigir(objeto(grupo) && Object.keys(grupo).every(campo => ['dataOrigem', 'chavePeriodo', 'etapa', 'dataNominal', 'dataOperacional', 'estado', 'duracaoSegundos', 'itens'].includes(campo))
                    && noPeriodo(grupo.dataOrigem) && noPeriodo(grupo.dataNominal) && grupo.dataOrigem < grupo.dataNominal
                    && calendario.periodoDaChave(grupo.chavePeriodo) && /^R[1-4]$/.test(grupo.etapa)
                    && (grupo.estado === 'reservada' ? noPeriodo(grupo.dataOperacional) && grupo.dataOperacional >= grupo.dataNominal
                        && Object.hasOwn(porData, grupo.dataOperacional) : grupo.estado === 'naoProgramavel' && grupo.dataOperacional === null)
                    && Array.isArray(grupo.itens) && grupo.itens.length > 0, 'grupo de revisão da carga diária.');
                let total = 0;
                for (const item of grupo.itens) {
                    exigir(objeto(item) && Object.keys(item).every(campo => ['id', 'blocoId', 'duracaoSegundos'].includes(campo))
                        && texto(item.blocoId) && item.id === JSON.stringify([dados.projetoId, item.blocoId, grupo.chavePeriodo])
                        && !ids.has(item.id), 'identidade de revisão da carga diária.');
                    ids.add(item.id);
                    const origem = origens.get(item.blocoId);
                    exigir(origem?.data === grupo.dataOrigem && Number.isSafeInteger(origem.nominal) && origem.nominal > 0
                        && item.duracaoSegundos === Math.round(origem.nominal / 8), 'origem ou duração de revisão da carga diária.');
                    total += item.duracaoSegundos;
                }
                exigir(Number.isSafeInteger(total) && grupo.duracaoSegundos === total, 'total do grupo de revisão da carga diária.');
            }
            const missoes = new Set();
            for (const pratica of carga.praticas) {
                exigir(objeto(pratica) && Object.keys(pratica).every(campo => ['missaoId', 'dataPrevista', 'duracaoPlanejadaSegundos', 'consomeCargaEstudo'].includes(campo))
                    && texto(pratica.missaoId) && !missoes.has(pratica.missaoId) && noPeriodo(pratica.dataPrevista)
                    && Number.isSafeInteger(pratica.duracaoPlanejadaSegundos) && pratica.duracaoPlanejadaSegundos > 0
                    && typeof pratica.consomeCargaEstudo === 'boolean', 'prática do plano de carga diária.');
                missoes.add(pratica.missaoId);
            }
        }
        function validarPoliticaRevisao(politica, rascunho = false) {
            const incompleta = rascunho && politica?.ativadas === true && politica.modalidade === 'personalizado'
                && Array.isArray(politica.periodos) && !politica.periodos.length;
            exigir(window.CalendarioJornada?.politicaRevisoesValida(incompleta ? { ...politica, ativadas: false } : politica), 'política de revisão.');
        }
        function validarReplanejamento(r, projetoId) {
            exigir(objeto(r) && r.versao === 1 && r.projetoId === projetoId && objeto(r.origens)
                && objeto(r.metasAnteriores) && Array.isArray(r.revisoesIds) && r.revisoesIds.every(texto), 'origens do replanejamento.');
            if (r.sessoesIds !== undefined) exigir(Array.isArray(r.sessoesIds) && r.sessoesIds.every(texto), 'sessões do replanejamento.');
            if (r.planoFonteId !== undefined) exigir(r.planoFonteId === null || texto(r.planoFonteId), 'versão de origem do replanejamento.');
            if (r.revisoesPlano !== undefined) {
                const plano = r.revisoesPlano;
                exigir(objeto(plano) && [plano.dataInicioF, plano.dataFinalF].every(data => data === null || civil(data))
                    && Array.isArray(plano.listaDiaDaSemana) && plano.listaDiaDaSemana.every(dia => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].includes(dia)), 'calendário anterior das revisões.');
                if (plano.blocosConcluidos !== undefined) exigir(Array.isArray(plano.blocosConcluidos)
                    && plano.blocosConcluidos.every(id => texto(id) && Object.hasOwn(r.origens, id)), 'blocos concluídos no calendário anterior.');
                if (plano.revisoesPolitica !== undefined) validarPoliticaRevisao(plano.revisoesPolitica);
            }
            if (r.politicasExtras !== undefined) {
                exigir(objeto(r.politicasExtras), 'políticas de revisão dos extras.');
                for (const [id, politica] of Object.entries(r.politicasExtras)) {
                    exigir(/^extra-[\w-]+$/.test(id), 'origem da política de revisão do extra.');
                    validarPoliticaRevisao(politica);
                }
            }
            const estados = parsed[`projetoV1:${projetoId}:revisoesEstadoV1`] || parsed.revisoesEstadoV1;
            exigir(r.revisoesIds.every(id => estados?.entidades?.[id]?.projetoId === projetoId), 'referência histórica de revisão.');
            for (const [id, b] of Object.entries(r.origens)) {
                exigir(objeto(b) && b.blocoId === id && texto(id) && b.projetoId === projetoId
                    && (/^dia[1-9]\d*$/.test(b.diaOrigem) || b.diaOrigem === 'folga-' + b.dataOrigem)
                    && (b.dataOrigem === null || civil(b.dataOrigem))
                    && Number.isInteger(b.numero) && b.numero > 0 && Number.isSafeInteger(b.metaSegundos) && b.metaSegundos > 0,
                    'bloco histórico do replanejamento.');
                vinculo(b.projetoMateriaId, projetoId);
                if (b.metaNominalSegundos !== undefined) exigir(Number.isSafeInteger(b.metaNominalSegundos) && b.metaNominalSegundos > 0, 'meta nominal histórica do replanejamento.');
                if (b.revisoesPolitica !== undefined) validarPoliticaRevisao(b.revisoesPolitica);
            }
            for (const [id, m] of Object.entries(r.metasAnteriores)) {
                exigir(objeto(m) && typeof m.materia === 'string' && Number.isSafeInteger(m.metaSegundos) && m.metaSegundos > 0, 'meta histórica do replanejamento.');
                vinculo(id, projetoId);
            }
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
            if (storage.getItem(JOURNAL) !== null) throw new Error('Não foi possível concluir a restauração.');
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
        if (!window.navigator?.locks) throw new Error('Para restaurar, abra o Grimório pelo endereço seguro (HTTPS) em um navegador compatível.');
        if (operacaoExclusiva) throw new Error('Uma operação exclusiva já está em andamento nesta aba.');
        operacaoExclusiva = true;
        try {
            await pronta;
            try {
                if (liberarUso) { const liberar = liberarUso; liberarUso = null; liberar(); await usoPedido; }
                return await window.navigator.locks.request('grimorio:uso', { ifAvailable: true }, lock => {
                    if (!lock) throw new Error('Feche as outras abas do Grimório antes de restaurar o backup.');
                    return comando();
                });
            } finally {
                if (!bloqueado) { pronta = manterUso(); await pronta; }
            }
        } finally { operacaoExclusiva = false; }
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
        let handle = opcoes.somenteDownload ? null : await obterPastaSalva();
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
        validarPomodoro,
        exportar,
        executarExclusivo: exclusivo,
        restaurar,
        validarBackup,
        solicitarPersistencia,
        configurarPastaFixa,
        obterPastaSalva,
        salvarRapido,
        exportarAnterior,
        garantirDisponivel,
        get pronta() { return pronta; },
        get bloqueado() { return bloqueado; }
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

    function prepararDialogoRestauracao() {
        const dialogo = document.createElement('dialog');
        dialogo.id = 'backup-restauracao-dialog';
        dialogo.setAttribute('aria-labelledby', 'backup-restauracao-titulo');
        dialogo.setAttribute('aria-describedby', 'backup-restauracao-aviso');
        dialogo.innerHTML = `
            <h2 id="backup-restauracao-titulo">Restaurar cópia de segurança?</h2>
            <p data-arquivo></p>
            <p id="backup-restauracao-aviso">Seus dados atuais serão substituídos pelos do arquivo. O Grimório guarda uma cópia dos dados atuais neste navegador.</p>
            <form>
                <label for="backup-restauracao-confirmacao">Digite RESTAURAR para confirmar</label>
                <input id="backup-restauracao-confirmacao" autocomplete="off" spellcheck="false">
                <p data-erro role="alert"></p>
                <div class="backup-restauracao-acoes">
                    <button type="button" data-cancelar autofocus>Cancelar</button>
                    <button type="submit" data-confirmar disabled>Restaurar backup</button>
                </div>
            </form>`;
        document.body.append(dialogo);
        const campo = dialogo.querySelector('input');
        const cancelar = dialogo.querySelector('[data-cancelar]');
        const confirmar = dialogo.querySelector('[data-confirmar]');
        const erro = dialogo.querySelector('[data-erro]');
        let pendente;
        cancelar.addEventListener('click', () => dialogo.close());
        campo.addEventListener('input', () => {
            confirmar.disabled = campo.value.trim().toUpperCase() !== 'RESTAURAR';
        });
        dialogo.addEventListener('cancel', evento => {
            if (cancelar.disabled) evento.preventDefault();
        });
        dialogo.addEventListener('close', () => {
            pendente?.botao.focus();
            pendente = null;
        });
        dialogo.querySelector('form').addEventListener('submit', async evento => {
            evento.preventDefault();
            if (confirmar.disabled) return;
            confirmar.disabled = cancelar.disabled = campo.disabled = true;
            erro.textContent = '';
            try {
                await restaurar(pendente.texto);
                window.location.reload();
            } catch (falha) {
                erro.textContent = `Não foi possível restaurar o backup. ${falha.message || 'Tente novamente.'}`;
                confirmar.disabled = cancelar.disabled = campo.disabled = false;
            }
        });
        return (botao, nome, texto) => {
            pendente = { botao, texto };
            campo.value = '';
            erro.textContent = '';
            confirmar.disabled = true;
            dialogo.querySelector('[data-arquivo]').textContent = nome;
            dialogo.showModal();
            cancelar.focus();
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        for (const botao of document.querySelectorAll('[data-backup-exportar]')) {
            botao.addEventListener('click', () => {
                const status = document.getElementById(botao.dataset.backupStatus);
                try {
                    const dados = exportar();
                    dispararDownload(dados);
                    if (status) status.textContent = 'Download do backup iniciado.';
                    try {
                        window.SistemaIaStore?.incrementarTelemetria?.('backupsExportados', 1);
                        window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
                    } catch (_) {}
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
                            : 'Download do backup iniciado.';
                    }
                    try {
                        window.SistemaIaStore?.incrementarTelemetria?.('backupsExportados', 1);
                        window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
                    } catch (_) {}
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
                    try {
                        window.SistemaIaStore?.incrementarTelemetria?.('backupsExportados', 1);
                        window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
                    } catch (_) {}
                    if (status) status.textContent = `Pasta fixa definida para "${res.pasta}" e backup de hoje atualizado (${res.arquivo}).`;
                } catch (erro) {
                    if (erro?.name === 'AbortError') return;
                    if (status) status.textContent = `Não foi possível definir a pasta fixa. ${erro.message || 'Tente novamente.'}`;
                }
            });
        }

        const botoesRestaurar = document.querySelectorAll('[data-backup-restaurar]');
        if (!botoesRestaurar.length) return;
        const abrirRestauracao = prepararDialogoRestauracao();
        for (const botao of botoesRestaurar) {
            botao.setAttribute('aria-haspopup', 'dialog');
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
                    validarBackup(texto);
                    if (status) status.textContent = '';
                    abrirRestauracao(botao, arquivo.name, texto);
                } catch (erro) {
                    if (status) status.textContent = `Não foi possível restaurar o backup. ${erro.message || 'Verifique o arquivo.'}`;
                }
            });
        }
    });
})();
