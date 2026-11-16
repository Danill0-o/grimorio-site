/* R1: adapta snapshots já carregados; não lê stores, recupera journals ou grava. */
(function () {
    'use strict';
    const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const tiposPratica = ['redacao', 'discursiva', 'estudo-caso', 'peca', 'sentenca', 'parecer', 'simulado', 'taf', 'outra'];
    const falhar = texto => { throw new Error(`Reagendamento: ${texto}`); };
    const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    function id(valor, campo) {
        if (typeof valor !== 'string' || !valor.trim()) falhar(`${campo} inválido`);
        return valor;
    }
    function inteiro(valor, campo, minimo = 0) {
        if (!Number.isSafeInteger(valor) || valor < minimo) falhar(`${campo} inválido`);
        return valor;
    }
    function texto(valor, campo) {
        if (typeof valor !== 'string' || !valor.trim()) falhar(`${campo} inválido`);
        return valor;
    }
    function civil(valor) {
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)
            || window.CalendarioJornada?.somarDias(valor, 0) !== valor) falhar('data civil inválida');
        return valor;
    }
    function dataConfigurada(valor) {
        const resultado = window.CalendarioJornada?.somarDias(valor, 0);
        if (!resultado) falhar('período inválido');
        return civil(resultado);
    }
    function dataFato(fato) {
        const data = new Date(fato.inicio);
        if (typeof fato.inicio !== 'string' || !Number.isFinite(data.getTime())) falhar('instante da sessão inválido');
        if (fato.dataEstudo != null) {
            const declarada = civil(fato.dataEstudo);
            if (window.CalendarioJornada.dataLocal(data) !== declarada) falhar('data do estudo divergente');
            return declarada;
        }
        return civil(window.CalendarioJornada.dataLocal(data));
    }
    function instante(valor) {
        if (typeof valor !== 'string' || !Number.isFinite(new Date(valor).getTime())) falhar('instante inválido');
    }
    function clonar(valor) {
        const vistos = new Set();
        function verificar(atual) {
            if (atual === null || typeof atual === 'string' || typeof atual === 'boolean') return;
            if (typeof atual === 'number' && Number.isFinite(atual)) return;
            if (typeof atual !== 'object' || vistos.has(atual)) falhar('snapshot não é JSON válido');
            const proto = Object.getPrototypeOf(atual);
            const construtor = proto && Object.getOwnPropertyDescriptor(proto, 'constructor')?.value;
            if (proto !== null && (!construtor || construtor.name !== (Array.isArray(atual) ? 'Array' : 'Object'))) falhar('protótipo do snapshot inválido');
            if (Object.getOwnPropertySymbols(atual).length) falhar('símbolos no snapshot');
            vistos.add(atual);
            for (const [chave, descritor] of Object.entries(Object.getOwnPropertyDescriptors(atual))) {
                if (descritor.get || descritor.set || chave === 'toJSON') falhar('acessores ou serialização customizada no snapshot');
                if (!Array.isArray(atual) || chave !== 'length') verificar(descritor.value);
            }
            vistos.delete(atual);
        }
        verificar(valor);
        return JSON.parse(JSON.stringify(valor));
    }
    function lista(valor, campo) {
        if (!Array.isArray(valor)) falhar(`${campo} inválido`);
        return valor;
    }
    const bloquear = (item, motivo) => { if (!item.bloqueios.includes(motivo)) item.bloqueios.push(motivo); };
    function preparar(fontes) {
        const { dados, materiaDoDia, distribuicaoMaterias = [], sessoesProjeto = [], missoes = [],
            praticas = null, checkpoint = null, extras = [], revisoes = [] } = clonar(fontes);
        if (!objeto(dados) || !objeto(materiaDoDia)) falhar('fontes do plano inválidas');
        const projetoId = id(dados.projetoId, 'projetoId');
        const planoVersaoId = dados.planoVersaoId == null ? null : id(dados.planoVersaoId, 'planoVersaoId');
        const inicio = dataConfigurada(dados.dataInicioF), fim = dataConfigurada(dados.dataFinalF);
        if (inicio > fim) falhar('período invertido');
        const diasSemana = lista(dados.listaDiaDaSemana, 'dias da semana').slice();
        if (!diasSemana.length || diasSemana.some(d => !semana.includes(d)) || new Set(diasSemana).size !== diasSemana.length) falhar('dias da semana inválidos');
        const capacidadeDiaSegundos = inteiro(dados.minutosPorDia * 60, 'capacidade diária', 1);
        const distribuicaoVersao = dados.distribuicaoVersao === undefined ? 1 : dados.distribuicaoVersao;
        if (![1, 2, 3].includes(distribuicaoVersao)) falhar('versão da distribuição inválida');
        const creditoSequencial = dados.replanejamento?.versao === 1;
        if (dados.replanejamento != null && !creditoSequencial) falhar('versão do replanejamento inválida');
        const herdadas = new Set(lista(dados.replanejamento?.sessoesIds ?? [], 'sessões herdadas').map(s => id(s, 'ID da sessão herdada')));
        if (lista(missoes, 'missões').length && praticas === null) falhar('snapshot completo de práticas obrigatório');
        const nomesDias = Object.keys(materiaDoDia).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
        if (nomesDias.some((d, i) => d !== `dia${i + 1}`)) falhar('índices dos dias inválidos');
        const mapa = window.CalendarioJornada.mapear(dados, nomesDias.length);
        const dias = new Map(), itens = new Map();
        function obterDia(data, diaJornada = mapa.porData[data] || null) {
            civil(data);
            if (data < inicio || data > fim) falhar('data planejada fora do período');
            if (!dias.has(data)) dias.set(data, { data, diaJornada, itens: [], contexto: { extras: [], revisoes: [], realizadoSegundos: 0 } });
            return dias.get(data);
        }
        const chaveItem = (tipo, itemId) => `${tipo}:${itemId}`;
        function adicionar(data, item) {
            const chave = chaveItem(item.tipo, item.id);
            if (itens.has(chave)) falhar('ID de bloco/ocorrência duplicado');
            itens.set(chave, item); obterDia(data).itens.push(item);
        }
        const aparicoes = new Map(), metasDistribuidas = new Map();
        for (const m of lista(distribuicaoMaterias, 'distribuição de matérias')) {
            const materiaId = id(m.projetoMateriaId, 'projetoMateriaId');
            if (!Number.isFinite(Number(m.Materia_distribuida)) || Number(m.Materia_distribuida) <= 0) falhar('meta distribuída inválida');
            metasDistribuidas.set(materiaId, inteiro(Math.round(Number(m.Materia_distribuida) * 60), 'meta distribuída', 1));
        }
        for (const dia of nomesDias) {
            if (!mapa.porDia[dia]) falhar('card sem data civil');
            obterDia(mapa.porDia[dia], dia);
            for (const bloco of lista(materiaDoDia[dia], 'blocos do dia')) {
                if (!objeto(bloco) || bloco.projetoId !== projetoId) falhar('bloco de outro projeto');
                const m = id(bloco.projetoMateriaId, 'projetoMateriaId');
                id(bloco.blocoId, 'blocoId'); texto(bloco.materia, 'nome da matéria');
                if (String(bloco.blocoId).startsWith('extra-')) falhar('extra no plano normal');
                if (distribuicaoVersao !== 1 || bloco.metaSegundos != null) inteiro(bloco.metaSegundos, 'meta do bloco', 1);
                aparicoes.set(m, (aparicoes.get(m) || 0) + 1);
            }
        }
        const processadas = new Map();
        for (const dia of nomesDias) {
            const grupos = new Map();
            for (const bloco of materiaDoDia[dia]) {
                const m = bloco.projetoMateriaId;
                if (!grupos.has(m)) grupos.set(m, []);
                grupos.get(m).push(bloco);
            }
            const metas = new Map();
            for (const [m, blocos] of grupos) {
                const explicita = nomesDias.every(d => materiaDoDia[d].filter(b => b.projetoMateriaId === m)
                    .every(b => Number.isSafeInteger(b.metaSegundos) && b.metaSegundos > 0));
                const antes = processadas.get(m) || 0;
                if (explicita) blocos.forEach(b => metas.set(b.blocoId, b.metaSegundos));
                else {
                    if (!Number.isFinite(dados.estudoPorBloco) || dados.estudoPorBloco <= 0) falhar('duração legada inválida');
                    const total = metasDistribuidas.get(m) || Math.round(aparicoes.get(m) * dados.estudoPorBloco * 60);
                    inteiro(total, 'meta legada total', 1);
                    const metaDia = Math.round(total * (antes + blocos.length) / aparicoes.get(m)) - Math.round(total * antes / aparicoes.get(m));
                    blocos.forEach((b, i) => metas.set(b.blocoId, inteiro(Math.round(metaDia * (i + 1) / blocos.length)
                        - Math.round(metaDia * i / blocos.length), 'meta legada do bloco', 1)));
                }
                processadas.set(m, antes + blocos.length);
            }
            for (const bloco of materiaDoDia[dia]) adicionar(mapa.porDia[dia], {
                id: bloco.blocoId, tipo: 'materia', projetoMateriaId: bloco.projetoMateriaId,
                nome: bloco.materia, metaSegundos: metas.get(bloco.blocoId), externo: false, bloqueios: [], snapshot: clonar(bloco)
            });
        }
        const missoesPorId = new Map();
        for (const m of lista(missoes, 'missões')) {
            if (!objeto(m) || m.projetoId !== projetoId) falhar('ocorrência de outro projeto');
            id(m.missaoId, 'missaoId'); id(m.atividadeId, 'atividadeId'); texto(m.nome, 'nome da prática');
            if (!tiposPratica.includes(m.tipo)) falhar('tipo da prática inválido');
            if (missoesPorId.has(m.missaoId)) falhar('ocorrência duplicada');
            missoesPorId.set(m.missaoId, m);
            const data = civil(m.dataPrevista);
            const externa = m.tipo === 'taf';
            if (m.duracaoPlanejadaSegundos !== null || !externa) inteiro(m.duracaoPlanejadaSegundos, 'duração da prática', 1);
            inteiro(m.tempoRegistradoSegundos, 'tempo registrado da prática');
            if (typeof m.concluida !== 'boolean') falhar('conclusão da prática inválida');
            if (m.extraAvulsa != null && typeof m.extraAvulsa !== 'boolean') falhar('tipo de ocorrência inválido');
            if (data < inicio || data > fim) continue;
            if (m.extraAvulsa || m.missaoId.startsWith('pratica-extra-')) obterDia(data).contexto.extras.push(clonar(m));
            else adicionar(data, { id: m.missaoId, tipo: 'pratica', atividadeId: m.atividadeId,
                nome: m.nome, metaSegundos: m.duracaoPlanejadaSegundos, externo: externa,
                bloqueios: m.concluida || m.tempoRegistradoSegundos > 0 ? ['historico-pratica'] : [], snapshot: clonar(m) });
        }
        for (const e of lista(extras, 'extras')) {
            if (!objeto(e) || e.projetoId !== projetoId) falhar('extra de outro projeto');
            id(e.blocoId, 'blocoId do extra');
            if (e.projetoMateriaId != null) id(e.projetoMateriaId, 'projetoMateriaId do extra');
            const data = civil(e.dataOrigem);
            if (data >= inicio && data <= fim) obterDia(data).contexto.extras.push(clonar(e));
        }
        for (const r of lista(revisoes, 'revisões')) {
            if (!objeto(r) || r.projetoId !== projetoId) falhar('revisão de outro projeto');
            texto(r.id, 'revisaoId'); id(r.blocoId, 'blocoId da revisão'); id(r.projetoMateriaId, 'projetoMateriaId da revisão');
            const data = civil(r.dataPrevista);
            if (data >= inicio && data <= fim) obterDia(data).contexto.revisoes.push(clonar(r));
        }
        const teoria = [...itens.values()].filter(i => i.tipo === 'materia');
        function protegerNormal(fato, motivo, herdada = false, origemAtual = false) {
            const m = id(fato.projetoMateriaId, 'projetoMateriaId da sessão');
            if (fato.blocoId != null) {
                id(fato.blocoId, 'blocoId da sessão');
                const item = itens.get(chaveItem('materia', fato.blocoId));
                if (item) {
                    if (item.tipo !== 'materia' || item.projetoMateriaId !== m) falhar('bloco da sessão divergente');
                    bloquear(item, motivo); return;
                }
                const antiga = dados.replanejamento?.origens?.[fato.blocoId];
                if (antiga && antiga.projetoId === projetoId && antiga.projetoMateriaId === m) return;
            }
            if (herdada) return;
            const data = fato.diaJornada != null ? mapa.porDia[fato.diaJornada] : fato.inicio ? dataFato(fato) : null;
            const candidatos = dias.get(data)?.itens.filter(i => i.tipo === 'materia' && i.projetoMateriaId === m) || [];
            if ((!creditoSequencial || origemAtual) && candidatos.length) candidatos.forEach(i => bloquear(i, motivo));
            else teoria.filter(i => i.projetoMateriaId === m).forEach(i => bloquear(i, 'origem-ambigua'));
        }
        const sessoesNormais = [], idsSessoes = new Set();
        for (const s of lista(sessoesProjeto, 'sessões')) {
            if (!objeto(s)) falhar('sessão inválida');
            id(s.id, 'id da sessão'); id(s.projetoId, 'projetoId da sessão');
            id(s.projetoMateriaId, 'projetoMateriaId da sessão'); inteiro(s.duracaoSegundos, 'duração da sessão', 1);
            if (s.tipo != null && !['estudo', 'revisao'].includes(s.tipo)) falhar('tipo da sessão inválido');
            const dataReal = dataFato(s);
            if (s.projetoId !== projetoId) continue;
            if (idsSessoes.has(s.id)) falhar('sessão duplicada'); idsSessoes.add(s.id);
            if (dataReal >= inicio && dataReal <= fim) obterDia(dataReal).contexto.realizadoSegundos += s.duracaoSegundos;
            if (s.blocoExtraId != null) { id(s.blocoExtraId, 'blocoExtraId'); continue; }
            if (s.tipo === 'revisao' || ['cronometro-revisao', 'conclusao-revisao'].includes(s.origem)) continue;
            if (!s.tipo && s.origem && !['cronometro', 'manual', 'conclusao-materia', 'conclusao-dia'].includes(s.origem)) continue;
            const folga = s.diaJornada?.startsWith('folga-') ? civil(s.diaJornada.slice(6)) : null;
            if (s.diaJornada != null && !folga && !/^dia[1-9]\d*$/.test(s.diaJornada)) falhar('dia da sessão inválido');
            const dataCredito = s.diaJornada != null ? folga || mapa.porDia[s.diaJornada] || null
                : mapa.porData[dataReal] ? dataReal : null;
            sessoesNormais.push({ id: s.id, projetoMateriaId: s.projetoMateriaId, duracaoSegundos: s.duracaoSegundos, dataCredito });
            protegerNormal(s, 'execucao', creditoSequencial && herdadas.has(s.id));
        }
        if (praticas !== null) {
            if (!objeto(praticas) || praticas.projetoId !== projetoId || praticas.versao !== 1) falhar('snapshot de práticas inválido');
            for (const grupo of ['atividades', 'missoes', 'sessoes', 'conclusoes']) if (!objeto(praticas[grupo])) falhar('coleção de práticas inválida');
            for (const [chave, registro] of Object.entries(praticas.atividades)) {
                const atividade = registro?.atividade;
                if (!objeto(atividade) || id(atividade.atividadeId, 'atividadeId') !== chave || atividade.projetoId !== projetoId
                    || !tiposPratica.includes(atividade.tipo)) falhar('atividade bruta inválida');
                if (atividade.duracaoPlanejadaSegundos !== undefined
                    && (atividade.duracaoPlanejadaSegundos !== null || atividade.tipo !== 'taf')) inteiro(atividade.duracaoPlanejadaSegundos, 'duração da atividade', 1);
            }
            for (const [chave, missao] of Object.entries(praticas.missoes)) {
                const atividade = praticas.atividades[missao?.atividadeId]?.atividade;
                if (!objeto(missao) || id(missao.missaoId, 'missaoId') !== chave || missao.projetoId !== projetoId
                    || !atividade) falhar('ocorrência bruta inválida');
                civil(missao.dataPrevista);
                if (missao.duracaoPlanejadaSegundos !== null || atividade.tipo !== 'taf') inteiro(missao.duracaoPlanejadaSegundos, 'duração da ocorrência bruta', 1);
            }
            for (const m of missoesPorId.values()) {
                const atividade = praticas.atividades[m.atividadeId]?.atividade;
                if (!atividade || atividade.tipo !== m.tipo) falhar('atividade da projeção inexistente ou divergente');
                const raw = praticas.missoes[m.missaoId];
                if (raw && (raw.missaoId !== m.missaoId || raw.atividadeId !== m.atividadeId || raw.projetoId !== m.projetoId)) falhar('identidade da projeção divergente');
            }
            if (!objeto(praticas.exclusoes)) falhar('tombstones de práticas inválidos');
            const temposPorMissao = new Map(), concluidas = new Set();
            for (const grupo of ['sessoes', 'conclusoes', 'avaliacoes']) {
                const colecao = praticas[grupo] ?? {}, exclusoes = praticas.exclusoes[grupo] ?? {};
                if (!objeto(colecao) || !objeto(exclusoes)) falhar('fatos de práticas inválidos');
                for (const [chave, excluido] of Object.entries(exclusoes)) if (excluido !== true || !Object.hasOwn(colecao, chave)) falhar('tombstone de prática sem fato');
                for (const [chave, fato] of Object.entries(colecao)) {
                    const campo = { sessoes: 'sessaoId', conclusoes: 'conclusaoId', avaliacoes: 'avaliacaoId' }[grupo];
                    if (!objeto(fato) || id(fato[campo], campo) !== chave || fato.projetoId !== projetoId) falhar('fato de prática inválido');
                    const raw = praticas.missoes[id(fato.missaoId, 'missaoId do fato')];
                    if (!raw || raw.projetoId !== projetoId || raw.atividadeId !== id(fato.atividadeId, 'atividadeId do fato')) falhar('origem do fato de prática inválida');
                    const projetada = missoesPorId.get(fato.missaoId);
                    if (projetada && (projetada.atividadeId !== fato.atividadeId || projetada.projetoId !== raw.projetoId
                        || projetada.dataPrevista !== raw.dataPrevista
                        || projetada.duracaoPlanejadaSegundos !== raw.duracaoPlanejadaSegundos)) falhar('snapshot da projeção divergente');
                    const item = itens.get(chaveItem('pratica', fato.missaoId));
                    if (item) bloquear(item, 'historico-pratica');
                    if (fato.registradoEm !== undefined) instante(fato.registradoEm);
                    if (fato.dataRealizacao !== undefined) civil(fato.dataRealizacao);
                    if (grupo === 'conclusoes' && !exclusoes[chave]) concluidas.add(fato.missaoId);
                    if (grupo === 'sessoes') {
                        inteiro(fato.duracaoSegundos, 'duração da prática realizada', 1);
                        const data = dataFato(fato);
                        if (!exclusoes[chave]) temposPorMissao.set(fato.missaoId, inteiro((temposPorMissao.get(fato.missaoId) || 0)
                            + fato.duracaoSegundos, 'tempo total da prática'));
                        if (!exclusoes[chave] && data >= inicio && data <= fim) obterDia(data).contexto.realizadoSegundos += fato.duracaoSegundos;
                    }
                }
            }
            for (const m of missoesPorId.values()) {
                if (m.tempoRegistradoSegundos !== (temposPorMissao.get(m.missaoId) || 0)
                    || m.concluida !== concluidas.has(m.missaoId)) falhar('fatos da projeção de práticas incompletos ou divergentes');
            }
        }
        if (checkpoint !== null) {
            if (!objeto(checkpoint) || checkpoint.projetoId !== projetoId || !objeto(checkpoint.contexto)) falhar('checkpoint inválido');
            const contexto = checkpoint.contexto;
            if (contexto.projetoId !== projetoId) falhar('projeto do checkpoint divergente');
            if (contexto.tipo != null && !['estudo', 'revisao', 'pratica'].includes(contexto.tipo)) falhar('tipo do checkpoint inválido');
            if (contexto.tipo === 'pratica') {
                const missaoId = id(contexto.missaoId, 'missaoId do checkpoint');
                const atividadeId = id(contexto.atividadeId, 'atividadeId do checkpoint');
                const item = itens.get(chaveItem('pratica', missaoId));
                if (item && (item.tipo !== 'pratica' || item.atividadeId !== atividadeId)) falhar('ocorrência do checkpoint divergente');
                if (item) bloquear(item, 'checkpoint');
                const raw = praticas?.missoes[missaoId], projetada = missoesPorId.get(missaoId);
                if (raw && projetada && (raw.projetoId !== projetada.projetoId || raw.atividadeId !== projetada.atividadeId
                    || raw.dataPrevista !== projetada.dataPrevista
                    || raw.duracaoPlanejadaSegundos !== projetada.duracaoPlanejadaSegundos)) falhar('snapshot do checkpoint divergente');
            } else if (contexto.tipo !== 'revisao' && !contexto.blocoExtraId) protegerNormal(contexto, 'checkpoint', false, true);
        }
        for (const dia of dias.values()) inteiro(dia.contexto.realizadoSegundos, 'tempo realizado total');
        return clonar({ projetoId, planoVersaoId, inicio, fim, diasSemana, capacidadeDiaSegundos, creditoSequencial,
            sessoesNormais, dias: [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)) });
    }
    window.ReagendamentoFontes = Object.freeze({ preparar });
})();
