/* Valida o histórico de reorganizações e, na restauração, os vínculos do plano ativo. */
(function () {
    'use strict';
    const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const texto = v => typeof v === 'string' && v.trim() !== '';
    const exigir = (condicao, mensagem) => { if (!condicao) throw new Error(`Reagendamento: ${mensagem}`); };
    const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const tipos = ['redacao', 'discursiva', 'estudo-caso', 'peca', 'sentenca', 'parecer', 'simulado', 'taf', 'outra'];
    function campos(valor, nomes) {
        return objeto(valor) && Object.keys(valor).length === nomes.length && nomes.every(c => Object.hasOwn(valor, c));
    }
    function civil(valor) {
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
        const data = new Date(`${valor}T00:00:00.000Z`);
        return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
    }
    function instantaneo(valor) {
        return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/.test(valor)
            && civil(valor.slice(0, 10));
    }
    function dataConfigurada(valor) {
        const iso = typeof valor === 'string' ? valor.split('/').reverse().join('-') : '';
        exigir(civil(iso), 'data do plano inválida');
        return iso;
    }
    function validarSnapshot(m, projetoId) {
        exigir(campos(m, ['missaoId', 'atividadeId', 'projetoId', 'tipo', 'dataPrevista', 'duracaoPlanejadaSegundos', 'presetXpId', 'perfilXp'])
            && texto(m.missaoId) && !m.missaoId.startsWith('pratica-extra-') && texto(m.atividadeId) && m.projetoId === projetoId
            && tipos.includes(m.tipo) && civil(m.dataPrevista)
            && ((m.tipo === 'taf' && m.duracaoPlanejadaSegundos === null) || (Number.isSafeInteger(m.duracaoPlanejadaSegundos) && m.duracaoPlanejadaSegundos > 0))
            && (m.presetXpId === null || texto(m.presetXpId)) && (m.perfilXp === null || objeto(m.perfilXp))
            && !(m.presetXpId !== null && m.perfilXp !== null), 'snapshot da atividade prática inválido');
        if (m.presetXpId !== null) {
            exigir(typeof window.PraticasProgressao?.validarPreset === 'function', 'validador do preset indisponível');
            window.PraticasProgressao.validarPreset(m.presetXpId, m.tipo);
        }
        if (m.perfilXp !== null) {
            exigir(typeof window.PraticasProgressao?.validarPerfil === 'function', 'validador do perfil indisponível');
            window.PraticasProgressao.validarPerfil(m.perfilXp, m.tipo);
        }
    }
    const tipoChave = chave => chave.slice(0, chave.indexOf(':'));
    const idChave = chave => chave.slice(chave.indexOf(':') + 1);
    const teoricas = lista => lista.filter(chave => tipoChave(chave) === 'materia');
    const iguais = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    function validarLayout(layout) {
        exigir(Array.isArray(layout) && layout.length === 2 && Array.isArray(layout[0]) && Array.isArray(layout[1]), 'disposição do par inválida');
        const chaves = layout.flat();
        exigir(chaves.every(chave => typeof chave === 'string' && /^(materia|pratica):/.test(chave) && texto(idChave(chave))
            && !idChave(chave).startsWith(tipoChave(chave) === 'materia' ? 'extra-' : 'pratica-extra-'))
            && new Set(chaves).size === chaves.length, 'referência duplicada, inválida ou avulsa');
        return chaves;
    }
    function criarTopologia(dados, materiaDoDia, projetoId) {
        exigir(objeto(dados) && dados.projetoId === projetoId && objeto(materiaDoDia), 'fontes do plano ativo ausentes');
        const inicio = dataConfigurada(dados.dataInicioF), fim = dataConfigurada(dados.dataFinalF);
        exigir(inicio <= fim && Array.isArray(dados.listaDiaDaSemana) && dados.listaDiaDaSemana.length
            && dados.listaDiaDaSemana.every(d => semana.includes(d)), 'rotina do plano ativo inválida');
        const dias = new Map(), ids = new Set();
        const datas = new Date(`${inicio}T00:00:00.000Z`);
        const totalDias = Object.keys(materiaDoDia).length;
        for (let i = 1; i <= totalDias; i++) {
            while (!dados.listaDiaDaSemana.includes(semana[datas.getUTCDay()])) datas.setUTCDate(datas.getUTCDate() + 1);
            const data = datas.toISOString().slice(0, 10), blocos = materiaDoDia[`dia${i}`];
            exigir(data <= fim && Array.isArray(blocos), 'dia base do plano ativo inválido');
            dias.set(data, blocos.map(b => {
                exigir(objeto(b) && b.projetoId === projetoId && texto(b.blocoId) && !ids.has(b.blocoId), 'bloco base inválido');
                ids.add(b.blocoId);
                return `materia:${b.blocoId}`;
            }));
            datas.setUTCDate(datas.getUTCDate() + 1);
        }
        return { inicio, fim, dias };
    }
    const jsonCanonico = valor => Array.isArray(valor) ? `[${valor.map(jsonCanonico).join(',')}]`
        : objeto(valor) ? `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`).join(',')}}`
            : JSON.stringify(valor);
    function validarAntecipacao(op) {
        const fato = op.antecipacao;
        exigir(campos(fato, ['item', 'modo', 'segundos']) && typeof fato.item === 'string'
            && op.antes[0].includes(fato.item) && op.datas[1] < op.datas[0]
            && iguais(op.depois[0], op.antes[0].filter(k => k !== fato.item))
            && iguais(op.depois[1], [...op.antes[1], fato.item]), 'movimento retrospectivo inválido');
        const positivo = Number.isSafeInteger(fato.segundos) && fato.segundos > 0;
        exigir(tipoChave(fato.item) === 'materia' ? ['tempo', 'saldo'].includes(fato.modo) && positivo
            : fato.modo === 'conclusao' && (positivo || fato.segundos === null), 'declaração retrospectiva inválida');
    }
    function validar(ledger, projetoId, fontes = null) {
        exigir(campos(ledger, ['versao', 'projetoId', 'operacoes']) && ledger.versao === 1
            && texto(projetoId) && ledger.projetoId === projetoId && Array.isArray(ledger.operacoes), 'histórico inválido');
        const ids = new Set(), snapshotsPorVersao = new Map();
        let topologia = null;
        const comFontes = fontes !== null && Object.hasOwn(fontes, 'dados');
        const atual = comFontes ? (fontes.dados?.planoVersaoId ?? null) : null;
        if (comFontes && ledger.operacoes.length) {
            exigir(objeto(fontes.dados) && fontes.dados.projetoId === projetoId, 'dados do projeto ausentes');
            exigir(atual === null || texto(atual), 'versão do plano ativo inválida');
        }
        for (const op of ledger.operacoes) {
            const nomes = ['id', 'planoVersaoId', 'confirmadoEm', 'datas', 'antes', 'depois', 'praticas'];
            if (objeto(op) && Object.hasOwn(op, 'antecipacao')) nomes.push('antecipacao');
            exigir(campos(op, nomes)
                && texto(op.id) && !ids.has(op.id) && (op.planoVersaoId === null || texto(op.planoVersaoId))
                && instantaneo(op.confirmadoEm) && Array.isArray(op.datas) && op.datas.length === 2
                && civil(op.datas[0]) && civil(op.datas[1]) && op.datas[0] !== op.datas[1] && Array.isArray(op.praticas), 'operação inválida');
            ids.add(op.id);
            const antes = new Set(validarLayout(op.antes)), depois = validarLayout(op.depois);
            exigir(antes.size === depois.length && depois.every(chave => antes.has(chave))
                && (!iguais(op.antes[0], op.depois[0]) || !iguais(op.antes[1], op.depois[1])), 'operação deve permutar o mesmo conjunto');
            if (Object.hasOwn(op, 'antecipacao')) validarAntecipacao(op);
            const praticas = new Set([...antes].filter(chave => tipoChave(chave) === 'pratica').map(idChave));
            const ativos = comFontes && op.planoVersaoId === atual;
            const conhecidos = snapshotsPorVersao.get(op.planoVersaoId) || new Map();
            snapshotsPorVersao.set(op.planoVersaoId, conhecidos);
            for (const m of op.praticas) {
                validarSnapshot(m, projetoId);
                exigir(praticas.delete(m.missaoId), 'snapshot duplicado ou sem referência');
                const anterior = conhecidos.get(m.missaoId), assinatura = jsonCanonico(m);
                exigir(!anterior || anterior.assinatura === assinatura, 'snapshot de ocorrência alterado na mesma versão');
                const chave = `pratica:${m.missaoId}`;
                const origem = op.datas[op.antes.findIndex(lista => lista.includes(chave))];
                const destino = op.datas[op.depois.findIndex(lista => lista.includes(chave))];
                exigir(origem === (anterior?.data ?? m.dataPrevista), 'origem da ocorrência divergente da sua disposição anterior');
                conhecidos.set(m.missaoId, { assinatura, data: destino });
                if (ativos) {
                    const estado = fontes.praticas, atividade = estado?.atividades?.[m.atividadeId]?.atividade;
                    const raw = estado?.missoes?.[m.missaoId];
                    exigir(estado?.projetoId === projetoId && atividade?.projetoId === projetoId && atividade.atividadeId === m.atividadeId
                        && atividade.tipo === m.tipo && (!raw || (raw.projetoId === projetoId && raw.atividadeId === m.atividadeId)),
                    'ocorrência vinculada a outra atividade ou projeto');
                }
            }
            exigir(praticas.size === 0, 'referência prática sem snapshot');
            if (!ativos) continue;
            topologia ||= criarTopologia(fontes.dados, fontes.materiaDoDia, projetoId);
            const { inicio, fim, dias } = topologia;
            exigir(op.datas.every(data => data >= inicio && data <= fim)
                && op.praticas.every(m => m.dataPrevista >= inicio && m.dataPrevista <= fim), 'reorganização fora do período ativo');
            op.datas.forEach((data, i) => {
                exigir(iguais(teoricas(op.antes[i]), dias.get(data) || []), 'referência ou ordem de blocos do plano ativo divergente');
                dias.set(data, teoricas(op.depois[i]));
            });
        }
        return ledger;
    }
    window.ReagendamentoSchema = Object.freeze({ validar });
})();
