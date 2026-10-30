/* D040/E1+E4+E8: domínio puro, agendamento manual/automático e capacidade diária. */
(function () {
    'use strict';

    const tipos = Object.freeze(['redacao', 'discursiva', 'estudo-caso', 'peca', 'sentenca', 'parecer', 'simulado', 'taf', 'outra']);
    const diasSemana = Object.freeze(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']);
    const periodicidades = Object.freeze(['semanal', 'quinzenal', 'mensal']);
    const modosInicio = Object.freeze(['inicio', 'data', 'estagio']);
    const camposAtividade = ['atividadeId', 'projetoId', 'nome', 'tipo', 'duracaoPlanejadaSegundos', 'importanciaProva', 'agendamento', 'presetXpId', 'perfilXp', 'pesoProva', 'duracaoModo'];
    const camposAtividadeObrigatorios = ['atividadeId', 'projetoId', 'nome', 'tipo', 'duracaoPlanejadaSegundos', 'importanciaProva'];
    const camposMissao = ['versao', 'missaoId', 'atividadeId', 'projetoId', 'dataPrevista', 'duracaoPlanejadaSegundos'];
    const camposConclusao = ['versao', 'conclusaoId', 'missaoId', 'atividadeId', 'projetoId', 'registradoEm'];
    const camposSessao = ['versao', 'sessaoId', 'missaoId', 'atividadeId', 'projetoId', 'inicio', 'duracaoSegundos'];
    const camposAvaliacao = ['versao', 'avaliacaoId', 'missaoId', 'atividadeId', 'projetoId', 'registradoEm', 'nota', 'anotacao'];
    const extrasSessao = ['origem', 'dataEstudo', 'precisaoInicio', 'registradoEm', 'anotacao'];
    const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    const falhar = mensagem => { throw new Error(`Atividades práticas: ${mensagem}`); };

    function campos(valor, permitidos, obrigatorios = permitidos) {
        if (!objeto(valor) || Object.keys(valor).some(campo => !permitidos.includes(campo))
            || obrigatorios.some(campo => !Object.hasOwn(valor, campo))) falhar('campos inválidos ou obrigatórios ausentes');
    }
    function id(valor, campo) {
        if (typeof valor !== 'string' || !/^[a-z0-9_-]+$/i.test(valor)) falhar(`${campo} inválido`);
        return valor;
    }
    function versao(valor) {
        if (valor !== 1) falhar('versão não suportada');
    }
    function segundos(valor) {
        if (!Number.isSafeInteger(valor) || valor <= 0) falhar('duração deve ser um inteiro positivo seguro de segundos');
        return valor;
    }
    function dataCivil(valor) {
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) falhar('data civil inválida');
        const data = new Date(`${valor}T12:00:00.000Z`);
        if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) falhar('data civil inválida');
        return valor;
    }
    function somarDiasCivil(valor, delta) {
        if (!Number.isSafeInteger(delta)) falhar('deslocamento de dias inválido');
        const data = new Date(`${dataCivil(valor)}T12:00:00.000Z`);
        data.setUTCDate(data.getUTCDate() + delta);
        return data.toISOString().slice(0, 10);
    }
    function diferencaDiasCivil(origem, destino) {
        const a = new Date(`${dataCivil(origem)}T12:00:00.000Z`);
        const b = new Date(`${dataCivil(destino)}T12:00:00.000Z`);
        return Math.round((b.getTime() - a.getTime()) / 86400000);
    }
    function diaSemanaCivil(valor) {
        const data = new Date(`${dataCivil(valor)}T12:00:00.000Z`);
        return diasSemana[data.getUTCDay()];
    }
    function instante(valor) {
        if (typeof valor !== 'string') falhar('instante ISO UTC inválido');
        const data = new Date(valor);
        if (!Number.isFinite(data.getTime()) || data.toISOString() !== valor) falhar('instante ISO UTC inválido');
        return valor;
    }
    function regrasDoTipo(tipo) {
        if (!tipos.includes(tipo)) falhar('tipo de atividade inválido');
        return { consomeCargaEstudo: tipo !== 'taf', usaCronometro: tipo !== 'taf', geraRevisoes: false };
    }
    function importancia(valor) {
        if (valor === null) return null;
        campos(valor, ['pontos', 'total']);
        if (!Number.isFinite(valor.pontos) || !Number.isFinite(valor.total)
            || valor.total <= 0 || valor.pontos < 0 || valor.pontos > valor.total) falhar('importância na prova inválida');
        return { pontos: valor.pontos, total: valor.total };
    }
    function normalizarDiasSemana(lista, rotulo = 'diasSemana') {
        if (!Array.isArray(lista) || !lista.length) falhar(`${rotulo} deve ser uma lista não vazia de dias da semana`);
        const conjunto = new Set();
        for (const dia of lista) {
            if (typeof dia !== 'string' || !diasSemana.includes(dia)) falhar(`${rotulo} contém dia da semana inválido`);
            if (conjunto.has(dia)) falhar(`${rotulo} não pode conter dias duplicados`);
            conjunto.add(dia);
        }
        return diasSemana.filter(dia => conjunto.has(dia));
    }
    function normalizarInicioAgendamento(inicio) {
        if (!objeto(inicio) || !Object.hasOwn(inicio, 'modo') || !modosInicio.includes(inicio.modo)) {
            falhar('modo de início do agendamento inválido');
        }
        if (inicio.modo === 'inicio') {
            campos(inicio, ['modo']);
            return { modo: 'inicio' };
        }
        if (inicio.modo === 'data') {
            campos(inicio, ['modo', 'dataInicio']);
            return { modo: 'data', dataInicio: dataCivil(inicio.dataInicio) };
        }
        campos(inicio, ['modo', 'percentual', 'projetoMateriaIds']);
        if (typeof inicio.percentual !== 'number' || !Number.isFinite(inicio.percentual)
            || inicio.percentual <= 0 || inicio.percentual > 100) {
            falhar('percentual do estágio planejado deve estar entre 0 e 100');
        }
        if (!Array.isArray(inicio.projetoMateriaIds) || !inicio.projetoMateriaIds.length) {
            falhar('selecione ao menos uma matéria para o estágio planejado');
        }
        const ids = [];
        const vistos = new Set();
        for (const item of inicio.projetoMateriaIds) {
            const validado = id(item, 'projetoMateriaId');
            if (vistos.has(validado)) falhar('matérias do estágio planejado não podem conter duplicatas');
            vistos.add(validado);
            ids.push(validado);
        }
        return { modo: 'estagio', percentual: inicio.percentual, projetoMateriaIds: ids };
    }
    function validarAgendamento(valor) {
        if (valor?.modo === 'automatico') {
            campos(valor,['modo','inicio']);
            return {modo:'automatico',inicio:normalizarInicioAgendamento(valor.inicio)};
        }
        campos(valor, ['periodicidade', 'diasSemana', 'inicio']);
        if (typeof valor.periodicidade !== 'string' || !periodicidades.includes(valor.periodicidade)) {
            falhar('periodicidade de agendamento inválida');
        }
        return {
            periodicidade: valor.periodicidade,
            diasSemana: normalizarDiasSemana(valor.diasSemana, 'diasSemana'),
            inicio: normalizarInicioAgendamento(valor.inicio)
        };
    }
    function duracaoPlanejada(valor, atividade) {
        return atividade.tipo === 'taf' && valor === null ? null : segundos(valor);
    }
    function presetXp(dados, tipo) {
        if (!Object.hasOwn(dados, 'presetXpId') && !Object.hasOwn(dados, 'perfilXp')) return {};
        if (!window.PraticasProgressao) falhar('validador de presets de XP indisponível');
        const xp = {};
        if (Object.hasOwn(dados,'presetXpId')) xp.presetXpId = window.PraticasProgressao.validarPreset(dados.presetXpId,tipo);
        if (Object.hasOwn(dados,'perfilXp')) xp.perfilXp = window.PraticasProgressao.validarPerfil(dados.perfilXp,tipo);
        if (xp.presetXpId != null && xp.perfilXp != null) falhar('escolha preset ou perfil proporcional');
        return xp;
    }
    function normalizarAtividade(dados) {
        regrasDoTipo(dados.tipo);
        if (typeof dados.nome !== 'string' || !dados.nome.trim()) falhar('nome obrigatório');
        const agendamento = dados.agendamento === null || dados.agendamento === undefined
            ? null
            : validarAgendamento(dados.agendamento);
        const extras = {};
        if (Object.hasOwn(dados,'pesoProva')) {
            if (dados.pesoProva !== null && (!Number.isFinite(dados.pesoProva) || dados.pesoProva < 0 || dados.pesoProva > Number.MAX_SAFE_INTEGER)) falhar('peso da prova inválido');
            extras.pesoProva = dados.pesoProva;
        }
        if (Object.hasOwn(dados,'duracaoModo')) {
            if (!['manual','referencia'].includes(dados.duracaoModo)) falhar('modo de duração inválido');
            if (dados.duracaoModo === 'referencia') {
                const p = window.PraticasProgressao?.obterParametros(dados);
                if (!p || p.alvoSegundos !== dados.duracaoPlanejadaSegundos) falhar('duração deve corresponder à referência selecionada');
            }
            extras.duracaoModo = dados.duracaoModo;
        }
        if (agendamento?.modo === 'automatico') {
            const peso = Object.hasOwn(dados,'pesoProva') ? dados.pesoProva : dados.importanciaProva?.pontos;
            if (dados.tipo === 'taf') falhar('TAF mantém frequência manual própria');
            if (!Number.isFinite(peso) || peso < 0) falhar('informe os pontos da atividade para distribuição automática');
        }
        return {
            versao: 1,
            atividadeId: id(dados.atividadeId, 'atividadeId'),
            projetoId: id(dados.projetoId, 'projetoId'),
            nome: dados.nome.trim(),
            tipo: dados.tipo,
            duracaoPlanejadaSegundos: duracaoPlanejada(dados.duracaoPlanejadaSegundos, dados),
            importanciaProva: importancia(dados.importanciaProva),
            ...presetXp(dados, dados.tipo),
            ...extras,
            ...(agendamento ? { agendamento } : {})
        };
    }
    function criarAtividade(dados) {
        campos(dados, camposAtividade, ['atividadeId', 'projetoId', 'nome', 'tipo']);
        if (Object.hasOwn(dados, 'agendamento') && dados.agendamento === undefined) falhar('campos inválidos ou obrigatórios ausentes');
        return normalizarAtividade({ ...dados,
            duracaoPlanejadaSegundos: Object.hasOwn(dados, 'duracaoPlanejadaSegundos') ? dados.duracaoPlanejadaSegundos : null,
            importanciaProva: Object.hasOwn(dados, 'importanciaProva') ? dados.importanciaProva : null,
            agendamento: Object.hasOwn(dados, 'agendamento') ? dados.agendamento : null });
    }
    function validarAtividade(atividade) {
        campos(atividade, ['versao', ...camposAtividade], ['versao', ...camposAtividadeObrigatorios]);
        if (Object.hasOwn(atividade, 'agendamento') && atividade.agendamento === undefined) falhar('campos inválidos ou obrigatórios ausentes');
        versao(atividade.versao);
        return normalizarAtividade(atividade);
    }
    function criarMissao(atividade, dados) {
        const a = validarAtividade(atividade);
        campos(dados, ['missaoId', 'dataPrevista']);
        return {
            versao: 1,
            missaoId: id(dados.missaoId, 'missaoId'),
            atividadeId: a.atividadeId,
            projetoId: a.projetoId,
            dataPrevista: dataCivil(dados.dataPrevista),
            duracaoPlanejadaSegundos: a.duracaoPlanejadaSegundos,
            ...presetXp(a, a.tipo)
        };
    }
    function validarMissao(missao, atividade) {
        const a = validarAtividade(atividade);
        campos(missao, [...camposMissao, 'presetXpId', 'perfilXp'], camposMissao);
        versao(missao.versao);
        if (missao.atividadeId !== a.atividadeId || missao.projetoId !== a.projetoId) falhar('atividade prática vinculada a outra atividade ou projeto');
        return {
            versao: 1,
            missaoId: id(missao.missaoId, 'missaoId'),
            atividadeId: a.atividadeId,
            projetoId: a.projetoId,
            dataPrevista: dataCivil(missao.dataPrevista),
            // Snapshot: uma edição da configuração não reescreve a duração da ocorrência.
            duracaoPlanejadaSegundos: duracaoPlanejada(missao.duracaoPlanejadaSegundos, a),
            ...presetXp(missao, a.tipo)
        };
    }
    function vinculos(fato, missao) {
        if (fato.missaoId !== missao.missaoId || fato.atividadeId !== missao.atividadeId
            || fato.projetoId !== missao.projetoId) falhar('fato vinculado a outra atividade prática, atividade ou projeto');
        return { missaoId: missao.missaoId, atividadeId: missao.atividadeId, projetoId: missao.projetoId };
    }
    function normalizarConclusao(conclusao, missao) {
        campos(conclusao, [...camposConclusao, 'dataRealizacao'], camposConclusao);
        versao(conclusao.versao);
        const resultado = { versao: 1, conclusaoId: id(conclusao.conclusaoId, 'conclusaoId'), ...vinculos(conclusao, missao),
            registradoEm: instante(conclusao.registradoEm) };
        if (Object.hasOwn(conclusao, 'dataRealizacao')) {
            resultado.dataRealizacao = dataCivil(conclusao.dataRealizacao);
            if (resultado.dataRealizacao < missao.dataPrevista || resultado.dataRealizacao > dataLocal(resultado.registradoEm)) falhar('data de realização fora do período permitido');
        }
        return resultado;
    }
    function criarConclusao(atividade, missao, dados) {
        const m = validarMissao(missao, atividade);
        campos(dados, ['conclusaoId', 'registradoEm', 'dataRealizacao'], ['conclusaoId', 'registradoEm']);
        return normalizarConclusao({ ...dados, versao: 1, missaoId: m.missaoId,
            atividadeId: m.atividadeId, projetoId: m.projetoId }, m);
    }
    function dataLocal(valor) {
        const d = new Date(valor);
        return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function normalizarSessao(sessao, missao) {
        campos(sessao, [...camposSessao, ...extrasSessao], camposSessao);
        versao(sessao.versao);
        const resultado = { versao: 1, sessaoId: id(sessao.sessaoId, 'sessaoId'), ...vinculos(sessao, missao),
            inicio: instante(sessao.inicio), duracaoSegundos: segundos(sessao.duracaoSegundos) };
        if (Object.hasOwn(sessao, 'origem')) {
            if (!['manual', 'cronometro'].includes(sessao.origem)) falhar('origem da sessão inválida');
            resultado.origem = sessao.origem;
        }
        if (['dataEstudo', 'precisaoInicio', 'registradoEm'].some(k => Object.hasOwn(sessao, k))) {
            resultado.dataEstudo = dataCivil(sessao.dataEstudo);
            resultado.registradoEm = instante(sessao.registradoEm);
            if (sessao.origem !== 'manual' || sessao.precisaoInicio !== 'dia' || dataLocal(resultado.inicio) !== resultado.dataEstudo
                || resultado.dataEstudo < missao.dataPrevista || resultado.dataEstudo > dataLocal(resultado.registradoEm)) falhar('data estudada inválida');
            resultado.precisaoInicio = 'dia';
        }
        if (sessao.origem === 'manual' && !resultado.dataEstudo) falhar('registro manual exige data e precisão diária');
        if (sessao.origem === 'cronometro' && dataLocal(resultado.inicio) < missao.dataPrevista) falhar('cronômetro anterior à atividade prática');
        if (Object.hasOwn(sessao, 'anotacao')) {
            if (typeof sessao.anotacao !== 'string' || sessao.anotacao.length > 140) falhar('anotação deve ter até 140 caracteres');
            resultado.anotacao = sessao.anotacao;
        }
        return resultado;
    }
    function criarSessao(atividade, missao, dados) {
        const m = validarMissao(missao, atividade);
        campos(dados, ['sessaoId', 'inicio', 'duracaoSegundos', ...extrasSessao], ['sessaoId', 'inicio', 'duracaoSegundos']);
        if (atividade.tipo === 'taf' && dados.origem === 'cronometro') falhar('TAF não usa cronômetro');
        return normalizarSessao({ ...dados, versao: 1, missaoId: m.missaoId,
            atividadeId: m.atividadeId, projetoId: m.projetoId }, m);
    }
    function normalizarAvaliacao(avaliacao, missao) {
        campos(avaliacao, camposAvaliacao); versao(avaliacao.versao);
        const resultado = { versao: 1, avaliacaoId: id(avaliacao.avaliacaoId, 'avaliacaoId'), ...vinculos(avaliacao, missao),
            registradoEm: instante(avaliacao.registradoEm), nota: null, anotacao: avaliacao.anotacao };
        if (typeof resultado.anotacao !== 'string' || resultado.anotacao.length > 140) falhar('anotação deve ter até 140 caracteres');
        if (avaliacao.nota !== null) {
            campos(avaliacao.nota, ['obtida', 'maxima']);
            const { obtida, maxima } = avaliacao.nota;
            if (!Number.isFinite(obtida) || !Number.isFinite(maxima) || maxima <= 0 || obtida < 0 || obtida > maxima) falhar('nota inválida');
            resultado.nota = { obtida, maxima };
        }
        if (resultado.nota === null && !resultado.anotacao.trim()) falhar('informe nota ou anotação');
        return resultado;
    }
    function criarAvaliacao(atividade, missao, dados) {
        const m = validarMissao(missao, atividade);
        campos(dados, ['avaliacaoId', 'registradoEm', 'nota', 'anotacao']);
        return normalizarAvaliacao({ ...dados, versao: 1, missaoId: m.missaoId, atividadeId: m.atividadeId, projetoId: m.projetoId }, m);
    }
    function unicos(lista, campoId, normalizar) {
        if (!Array.isArray(lista)) falhar('coleção deve ser uma lista');
        const registros = new Map();
        for (const entrada of lista) {
            const registro = normalizar(entrada);
            const anterior = registros.get(registro[campoId]);
            if (anterior && JSON.stringify(anterior) !== JSON.stringify(registro)) falhar(`conflito de conteúdo para ${campoId}`);
            if (!anterior) registros.set(registro[campoId], registro);
        }
        return registros;
    }
    function somarSegundos(total, parcela) {
        const soma = total + parcela;
        if (!Number.isSafeInteger(soma)) falhar('total de segundos excede o limite inteiro seguro');
        return soma;
    }
    function projetarAtividade(dados) {
        campos(dados, ['atividade', 'missoes', 'conclusoes', 'sessoes'], ['atividade', 'missoes']);
        const atividade = validarAtividade(dados.atividade);
        const missoes = unicos(dados.missoes, 'missaoId', missao => validarMissao(missao, atividade));
        function missaoDoFato(fato) {
            if (!objeto(fato)) falhar('fato inválido');
            const missao = missoes.get(id(fato.missaoId, 'missaoId'));
            if (!missao) falhar('atividade prática inexistente para o fato');
            return missao;
        }
        const conclusoes = unicos(dados.conclusoes === undefined ? [] : dados.conclusoes,
            'conclusaoId', fato => normalizarConclusao(fato, missaoDoFato(fato)));
        const sessoes = unicos(dados.sessoes === undefined ? [] : dados.sessoes,
            'sessaoId', fato => normalizarSessao(fato, missaoDoFato(fato)));
        const realizadas = new Set([...conclusoes.values()].map(fato => fato.missaoId));
        const tempoPorMissao = new Map();
        let tempoRegistradoSegundos = 0;
        for (const sessao of sessoes.values()) {
            tempoRegistradoSegundos = somarSegundos(tempoRegistradoSegundos, sessao.duracaoSegundos);
            tempoPorMissao.set(sessao.missaoId, somarSegundos(tempoPorMissao.get(sessao.missaoId) || 0, sessao.duracaoSegundos));
        }
        const planejadas = missoes.size;
        const concluidas = realizadas.size;
        return {
            atividadeId: atividade.atividadeId,
            projetoId: atividade.projetoId,
            planejadas,
            concluidas,
            percentual: planejadas ? concluidas / planejadas * 100 : 0,
            importanciaPercentual: atividade.importanciaProva === null ? null
                : atividade.importanciaProva.pontos / atividade.importanciaProva.total * 100,
            tempoRegistradoSegundos,
            missoes: [...missoes.values()].map(missao => ({ missaoId: missao.missaoId, dataPrevista: missao.dataPrevista,
                duracaoPlanejadaSegundos: missao.duracaoPlanejadaSegundos, concluida: realizadas.has(missao.missaoId),
                tempoRegistradoSegundos: tempoPorMissao.get(missao.missaoId) || 0 }))
        };
    }

    function mapearCalendarioRotina(dataInicio, dataFinal, diasRotina) {
        const inicio = dataCivil(dataInicio);
        const fim = dataCivil(dataFinal);
        if (inicio > fim) falhar('período do projeto inválido');
        const rotina = normalizarDiasSemana(diasRotina, 'diasRotina');
        const rotinaSet = new Set(rotina);
        const totalDiasCorridos = diferencaDiasCivil(inicio, fim) + 1;
        const diasEstudo = [];
        const todasDatas = [];
        for (let i = 0; i < totalDiasCorridos; i++) {
            const data = somarDiasCivil(inicio, i);
            const diaSemana = diaSemanaCivil(data);
            const ehEstudo = rotinaSet.has(diaSemana);
            if (ehEstudo) {
                const numero = diasEstudo.length + 1;
                diasEstudo.push({ dia: `dia${numero}`, numero, dataPrevista: data, diaSemana });
            }
            todasDatas.push({ dataPrevista: data, diaSemana, ehEstudo });
        }
        if (!diasEstudo.length) falhar('o período não contém nenhum dia de estudo da rotina selecionada');
        return { inicio, fim, rotina, rotinaSet, diasEstudo, todasDatas };
    }

    function normalizarPlanoTeoricoBase(planoTeoricoBase, diasEstudo) {
        if (!objeto(planoTeoricoBase)) falhar('plano teórico base obrigatório para calcular estágio planejado');
        const chaves = Object.keys(planoTeoricoBase);
        if (chaves.length !== diasEstudo.length) falhar('plano teórico base incompatível com os dias de estudo da rotina');
        const cargaPorMateria = new Map();
        const diasNormalizados = diasEstudo.map((diaInfo, idx) => {
            const chaveDia = `dia${idx + 1}`;
            if (!Object.hasOwn(planoTeoricoBase, chaveDia) || !Array.isArray(planoTeoricoBase[chaveDia])) {
                falhar(`dia ${chaveDia} ausente ou inválido no plano teórico base`);
            }
            const blocos = planoTeoricoBase[chaveDia].map(bloco => {
                if (!objeto(bloco)) falhar('bloco do plano teórico base inválido');
                const projetoMateriaId = id(bloco.projetoMateriaId, 'projetoMateriaId');
                const metaSegundos = segundos(bloco.metaSegundos);
                cargaPorMateria.set(projetoMateriaId, somarSegundos(cargaPorMateria.get(projetoMateriaId) || 0, metaSegundos));
                return { projetoMateriaId, metaSegundos };
            });
            return { ...diaInfo, blocos };
        });
        return { diasNormalizados, cargaPorMateria };
    }

    function resolverInicioPlanejado(dados) {
        campos(dados, ['atividade', 'dataInicio', 'dataFinal', 'diasRotina', 'planoTeoricoBase'],
            ['atividade', 'dataInicio', 'dataFinal', 'diasRotina']);
        const atividade = validarAtividade(dados.atividade);
        const calendario = mapearCalendarioRotina(dados.dataInicio, dados.dataFinal, dados.diasRotina);
        if (!atividade.agendamento) return null;
        const regras = regrasDoTipo(atividade.tipo);

        const inicioCfg = atividade.agendamento.inicio;
        if (inicioCfg.modo === 'inicio') {
            return {
                modo: 'inicio',
                dataInicioAtiva: calendario.inicio,
                diaJornadaInicio: calendario.diasEstudo[0].dia,
                percentualConfigurado: null,
                percentualAlcancado: 0,
                projetoMateriaIds: []
            };
        }
        if (inicioCfg.modo === 'data') {
            if (inicioCfg.dataInicio < calendario.inicio || inicioCfg.dataInicio > calendario.fim) {
                falhar('data de início da atividade fora do período do projeto');
            }
            const primeiroCard = calendario.diasEstudo.find(d => d.dataPrevista >= inicioCfg.dataInicio) || null;
            return {
                modo: 'data',
                dataInicioAtiva: inicioCfg.dataInicio,
                diaJornadaInicio: primeiroCard ? primeiroCard.dia : null,
                percentualConfigurado: null,
                percentualAlcancado: null,
                projetoMateriaIds: []
            };
        }
        const { diasNormalizados, cargaPorMateria } = normalizarPlanoTeoricoBase(dados.planoTeoricoBase, calendario.diasEstudo);
        let cargaAlvoSegundos = 0;
        for (const materiaId of inicioCfg.projetoMateriaIds) {
            const totalMateria = cargaPorMateria.get(materiaId) || 0;
            if (!totalMateria) falhar('matéria de referência do estágio planejado inexistente no plano teórico base');
            cargaAlvoSegundos = somarSegundos(cargaAlvoSegundos, totalMateria);
        }
        const selecionadas = new Set(inicioCfg.projetoMateriaIds);
        const metaMarcoSegundos = cargaAlvoSegundos * (inicioCfg.percentual / 100);
        let acumuladoSegundos = 0;
        let diaMarco = diasNormalizados[diasNormalizados.length - 1];
        for (const dia of diasNormalizados) {
            for (const bloco of dia.blocos) {
                if (selecionadas.has(bloco.projetoMateriaId)) {
                    acumuladoSegundos = somarSegundos(acumuladoSegundos, bloco.metaSegundos);
                }
            }
            if (acumuladoSegundos + 1e-9 >= metaMarcoSegundos) {
                diaMarco = dia;
                break;
            }
        }
        return {
            modo: 'estagio',
            dataInicioAtiva: diaMarco.dataPrevista,
            diaJornadaInicio: diaMarco.dia,
            percentualConfigurado: inicioCfg.percentual,
            percentualAlcancado: acumuladoSegundos / cargaAlvoSegundos * 100,
            cargaAlvoSegundos,
            cargaAcumuladaNoMarcoSegundos: acumuladoSegundos,
            projetoMateriaIds: [...inicioCfg.projetoMateriaIds]
        };
    }

    function gerarMissoesAtividade(dados) {
        campos(dados, ['atividade', 'dataInicio', 'dataFinal', 'diasRotina', 'planoTeoricoBase', 'gerarMissaoId', 'pesoRelativo', 'cargaPorData', 'disponibilidadeDiariaSegundos'],
            ['atividade', 'dataInicio', 'dataFinal', 'diasRotina']);
        if (dados.gerarMissaoId !== undefined && typeof dados.gerarMissaoId !== 'function') {
            falhar('gerarMissaoId deve ser uma função');
        }
        const atividade = validarAtividade(dados.atividade);
        const calendario = mapearCalendarioRotina(dados.dataInicio, dados.dataFinal, dados.diasRotina);
        const inicioResolvido = resolverInicioPlanejado({
            atividade,
            dataInicio: dados.dataInicio,
            dataFinal: dados.dataFinal,
            diasRotina: dados.diasRotina,
            ...(dados.planoTeoricoBase !== undefined ? { planoTeoricoBase: dados.planoTeoricoBase } : {})
        });
        if (!inicioResolvido) {
            return {
                atividadeId: atividade.atividadeId,
                projetoId: atividade.projetoId,
                agendada: false,
                dataInicioAtiva: null,
                diaJornadaInicio: null,
                inicioResolvido: null,
                missoes: []
            };
        }
        const regras = regrasDoTipo(atividade.tipo);
        if (atividade.agendamento.modo === 'automatico') {
            if (!window.PraticasRecomendacoes) falhar('recomendações indisponíveis');
            const datasElegiveis = calendario.diasEstudo.filter(d => d.dataPrevista >= inicioResolvido.dataInicioAtiva).map(d => d.dataPrevista);
            const recomendacao = window.PraticasRecomendacoes.recomendarDatas({datasElegiveis,pesoRelativo:dados.pesoRelativo,
                duracaoSegundos:atividade.duracaoPlanejadaSegundos,disponibilidadeSegundos:dados.disponibilidadeDiariaSegundos,cargaPorData:dados.cargaPorData});
            return {atividadeId:atividade.atividadeId,projetoId:atividade.projetoId,agendada:true,dataInicioAtiva:inicioResolvido.dataInicioAtiva,
                diaJornadaInicio:inicioResolvido.diaJornadaInicio,inicioResolvido,recomendacao,
                missoes:recomendacao.datas.map((dataPrevista,i) => criarMissao(atividade,{missaoId:dados.gerarMissaoId
                    ? dados.gerarMissaoId(atividade,dataPrevista,i) : `missao-${atividade.atividadeId}-${dataPrevista}`,dataPrevista}))};
        }
        const diasAtividadeSet = new Set(atividade.agendamento.diasSemana);
        const passoSemanas = atividade.agendamento.periodicidade === 'semanal' ? 1
            : atividade.agendamento.periodicidade === 'quinzenal' ? 2 : 4;
        let primeiraDataElegivel = null;
        const missoes = [];
        for (const infoData of calendario.todasDatas) {
            if (infoData.dataPrevista < inicioResolvido.dataInicioAtiva) continue;
            if (!diasAtividadeSet.has(infoData.diaSemana)) continue;

            if (primeiraDataElegivel === null) primeiraDataElegivel = infoData.dataPrevista;
            const diasDesdePrimeira = diferencaDiasCivil(primeiraDataElegivel, infoData.dataPrevista);
            const semanaAtiva = Math.floor(diasDesdePrimeira / 7);
            if (semanaAtiva % passoSemanas !== 0) continue;
            const missaoId = dados.gerarMissaoId
                ? dados.gerarMissaoId(atividade, infoData.dataPrevista, missoes.length)
                : `missao-${atividade.atividadeId}-${infoData.dataPrevista}`;
            missoes.push(criarMissao(atividade, { missaoId, dataPrevista: infoData.dataPrevista }));
        }
        return {
            atividadeId: atividade.atividadeId,
            projetoId: atividade.projetoId,
            agendada: true,
            dataInicioAtiva: inicioResolvido.dataInicioAtiva,
            diaJornadaInicio: inicioResolvido.diaJornadaInicio,
            inicioResolvido,
            missoes: [...unicos(missoes, 'missaoId', m => validarMissao(m, atividade)).values()]
        };
    }

    function planejarCapacidadePraticas(dados) {
        campos(dados, ['projetoId', 'dataInicio', 'dataFinal', 'diasRotina', 'disponibilidadeDiariaSegundos',
            'blocosPorDia', 'atividades', 'planoTeoricoBase', 'totalMaterias', 'gerarMissaoId', 'materiasProva', 'missoesPreservadas'],
            ['projetoId', 'dataInicio', 'dataFinal', 'diasRotina', 'disponibilidadeDiariaSegundos', 'blocosPorDia', 'atividades']);
        const projetoId = id(dados.projetoId, 'projetoId');
        const calendario = mapearCalendarioRotina(dados.dataInicio, dados.dataFinal, dados.diasRotina);
        const disponibilidadeDiariaSegundos = segundos(dados.disponibilidadeDiariaSegundos);
        if (!Number.isSafeInteger(dados.blocosPorDia) || dados.blocosPorDia < 1) {
            falhar('blocosPorDia deve ser um inteiro positivo');
        }
        const blocosPorDia = dados.blocosPorDia;
        const duracaoNormalBlocoSegundos = Math.floor(disponibilidadeDiariaSegundos / blocosPorDia);
        if (duracaoNormalBlocoSegundos < 1) {
            falhar('duração normal do bloco deve ser de ao menos 1 segundo');
        }
        let totalMaterias = 0;
        if (dados.totalMaterias !== undefined) {
            if (!Number.isSafeInteger(dados.totalMaterias) || dados.totalMaterias < 0) {
                falhar('totalMaterias deve ser um inteiro não negativo');
            }
            totalMaterias = dados.totalMaterias;
        } else if (dados.planoTeoricoBase !== undefined) {
            const { cargaPorMateria } = normalizarPlanoTeoricoBase(dados.planoTeoricoBase, calendario.diasEstudo);
            totalMaterias = cargaPorMateria.size;
        }
        const mapaAtividades = unicos(dados.atividades, 'atividadeId', entrada => {
            const a = validarAtividade(entrada);
            if (a.projetoId !== projetoId) falhar('atividade pertence a outro projeto');
            return a;
        });
        const atividadesPlanejadas = [];
        const todasMissoes = [];
        const idsMissoesGlobal = new Set();
        const missoesPorData = new Map();
        const temAutomaticas = [...mapaAtividades.values()].some(a => a.agendamento?.modo === 'automatico');
        const pesos = (temAutomaticas || dados.materiasProva?.length) && window.PraticasRecomendacoes
            ? window.PraticasRecomendacoes.calcularPesosProva({projetoId,materias:dados.materiasProva,atividades:[...mapaAtividades.values()]}) : null;
        if (temAutomaticas && !pesos) falhar('preencha matérias e pesos para consolidar a distribuição automática');
        const ordemExecucao = [...mapaAtividades.values()].sort((a,b) => {
            const aa = a.agendamento?.modo === 'automatico', bb = b.agendamento?.modo === 'automatico';
            return Number(aa)-Number(bb) || (aa && bb ? (pesos.atividades[b.atividadeId].pesoRelativo-pesos.atividades[a.atividadeId].pesoRelativo)
                || a.atividadeId.localeCompare(b.atividadeId) : 0);
        });
        for (const atividade of ordemExecucao) {
            const regras = regrasDoTipo(atividade.tipo);
            const geradas = gerarMissoesAtividade({
                atividade,
                dataInicio: calendario.inicio,
                dataFinal: calendario.fim,
                diasRotina: calendario.rotina,
                ...(atividade.agendamento?.modo === 'automatico' ? {pesoRelativo:pesos.atividades[atividade.atividadeId].pesoRelativo,
                    disponibilidadeDiariaSegundos,cargaPorData:Object.fromEntries([...missoesPorData].map(([data,lista]) => [data,
                        lista.filter(i=>i.consomeCargaEstudo).reduce((s,i)=>s+i.missao.duracaoPlanejadaSegundos,0)]))} : {}),
                ...(dados.planoTeoricoBase !== undefined ? { planoTeoricoBase: dados.planoTeoricoBase } : {}),
                ...(dados.gerarMissaoId !== undefined ? { gerarMissaoId: dados.gerarMissaoId } : {})
            });
            if (!geradas.recomendacao && geradas.agendada && regras.consomeCargaEstudo && pesos && pesos.atividades[atividade.atividadeId].pesoRelativo !== null) {
                const datas = calendario.diasEstudo.filter(d=>d.dataPrevista>=geradas.dataInicioAtiva).map(d=>d.dataPrevista);
                geradas.recomendacao = {...window.PraticasRecomendacoes.recomendarDatas({datasElegiveis:datas,
                    pesoRelativo:pesos.atividades[atividade.atividadeId].pesoRelativo,duracaoSegundos:atividade.duracaoPlanejadaSegundos,
                    disponibilidadeSegundos:disponibilidadeDiariaSegundos}),manual:true};
            }
            let tempoPlanejadoTotalSegundos = 0;
            for (const missao of geradas.missoes) {
                if (idsMissoesGlobal.has(missao.missaoId)) falhar('ID de atividade prática duplicado entre atividades');
                idsMissoesGlobal.add(missao.missaoId);
                todasMissoes.push(missao);
                if (missao.duracaoPlanejadaSegundos !== null) {
                    tempoPlanejadoTotalSegundos = somarSegundos(tempoPlanejadoTotalSegundos, missao.duracaoPlanejadaSegundos);
                }
                const listaData = missoesPorData.get(missao.dataPrevista) || [];
                listaData.push({ missao, atividade, consomeCargaEstudo: regras.consomeCargaEstudo });
                missoesPorData.set(missao.dataPrevista, listaData);
            }
            atividadesPlanejadas.push({
                atividadeId: atividade.atividadeId,
                nome: atividade.nome,
                tipo: atividade.tipo,
                consomeCargaEstudo: regras.consomeCargaEstudo,
                agendada: geradas.agendada,
                periodicidade: atividade.agendamento?.modo === 'automatico' ? 'automatica' : atividade.agendamento ? atividade.agendamento.periodicidade : null,
                diasSemana: atividade.agendamento?.modo === 'automatico' ? [...calendario.rotina] : atividade.agendamento ? [...atividade.agendamento.diasSemana] : [],
                dataInicioAtiva: geradas.dataInicioAtiva,
                diaJornadaInicio: geradas.diaJornadaInicio,
                inicioResolvido: geradas.inicioResolvido,
                totalMissoes: geradas.missoes.length,
                tempoPlanejadoTotalSegundos,
                missoes: geradas.missoes,
                ...(geradas.recomendacao ? {recomendacao:{...geradas.recomendacao,...pesos.atividades[atividade.atividadeId],totalProva:pesos.totalProva}} : {})
            });
        }
        if (dados.missoesPreservadas !== undefined) {
            if (!Array.isArray(dados.missoesPreservadas)) falhar('atividades práticas preservadas inválidas');
            const datasProjeto = new Set(calendario.todasDatas.map(d=>d.dataPrevista));
            const idsPreservados = new Set();
            for (const entrada of dados.missoesPreservadas) {
                const atividade = mapaAtividades.get(entrada?.atividadeId);
                if (!atividade || atividade.agendamento?.modo !== 'automatico') falhar('atividade prática preservada fora de atividade automática');
                const missao = validarMissao(entrada,atividade);
                if (idsPreservados.has(missao.missaoId)) falhar('atividade prática preservada repetida'); idsPreservados.add(missao.missaoId);
                if (!datasProjeto.has(missao.dataPrevista)) continue;
                const i = todasMissoes.findIndex(m=>m.missaoId === missao.missaoId);
                const a = atividadesPlanejadas.find(a=>a.atividadeId===atividade.atividadeId);
                const j = a.missoes.findIndex(m=>m.missaoId===missao.missaoId);
                if (i >= 0 && j < 0) falhar('ID da atividade prática preservada pertence a outra atividade');
                if (i < 0) { todasMissoes.push(missao); a.missoes.push(missao); a.recomendacao.preservadasAdicionais=(a.recomendacao.preservadasAdicionais||0)+1; }
                else { todasMissoes[i]=missao; a.missoes[j]=missao; }
                a.totalMissoes=a.missoes.length;
                a.tempoPlanejadoTotalSegundos=a.missoes.reduce((s,m)=>somarSegundos(s,m.duracaoPlanejadaSegundos),0);
            }
            missoesPorData.clear();
            for (const missao of todasMissoes) {
                const atividade = mapaAtividades.get(missao.atividadeId);
                const lista = missoesPorData.get(missao.dataPrevista)||[];
                lista.push({missao,atividade,consomeCargaEstudo:regrasDoTipo(atividade.tipo).consomeCargaEstudo});
                missoesPorData.set(missao.dataPrevista,lista);
            }
        }
        let disponibilidadeTotalSegundos = 0;
        let totalBlocosNormaisRestantes = 0;
        let tempoTotalReservadoPraticasSegundos = 0;
        let tempoTotalAlocadoBlocosSegundos = 0;
        let tempoTotalNaoAlocadoSegundos = 0;
        let tempoTotalExcessoPraticasSegundos = 0;
        let diasComPraticaInterna = 0;
        let diasSemBlocosTeoricos = 0;
        let diasComExcessoPraticas = 0;
        let totalMissoesInternas = 0;
        let totalMissoesExternas = 0;
        const datasEstudoSet = new Set();
        const diasEstudo = calendario.diasEstudo.map(diaInfo => {
            datasEstudoSet.add(diaInfo.dataPrevista);
            disponibilidadeTotalSegundos = somarSegundos(disponibilidadeTotalSegundos, disponibilidadeDiariaSegundos);
            const ocorrencias = missoesPorData.get(diaInfo.dataPrevista) || [];
            const missoesInternas = [];
            const missoesExternas = [];
            let reservaInternaSegundos = 0;
            for (const item of ocorrencias) {
                if (item.consomeCargaEstudo) {
                    missoesInternas.push(item.missao);
                    reservaInternaSegundos = somarSegundos(reservaInternaSegundos, item.missao.duracaoPlanejadaSegundos);
                    totalMissoesInternas++;
                } else {
                    missoesExternas.push(item.missao);
                    totalMissoesExternas++;
                }
            }
            const ultrapassaDisponibilidade = reservaInternaSegundos > disponibilidadeDiariaSegundos;
            const excessoPraticasSegundos = ultrapassaDisponibilidade
                ? reservaInternaSegundos - disponibilidadeDiariaSegundos
                : 0;
            const tempoRestanteSegundos = ultrapassaDisponibilidade
                ? 0
                : disponibilidadeDiariaSegundos - reservaInternaSegundos;
            const blocosNormaisRestantes = Math.floor(tempoRestanteSegundos / duracaoNormalBlocoSegundos);
            const tempoAlocadoBlocosSegundos = blocosNormaisRestantes * duracaoNormalBlocoSegundos;
            const tempoNaoAlocadoSegundos = tempoRestanteSegundos - tempoAlocadoBlocosSegundos;
            if (missoesInternas.length > 0) diasComPraticaInterna++;
            if (blocosNormaisRestantes === 0) diasSemBlocosTeoricos++;
            if (ultrapassaDisponibilidade) diasComExcessoPraticas++;
            totalBlocosNormaisRestantes = somarSegundos(totalBlocosNormaisRestantes, blocosNormaisRestantes);
            tempoTotalReservadoPraticasSegundos = somarSegundos(tempoTotalReservadoPraticasSegundos, reservaInternaSegundos);
            tempoTotalAlocadoBlocosSegundos = somarSegundos(tempoTotalAlocadoBlocosSegundos, tempoAlocadoBlocosSegundos);
            tempoTotalNaoAlocadoSegundos = somarSegundos(tempoTotalNaoAlocadoSegundos, tempoNaoAlocadoSegundos);
            tempoTotalExcessoPraticasSegundos = somarSegundos(tempoTotalExcessoPraticasSegundos, excessoPraticasSegundos);
            return {
                dia: diaInfo.dia,
                numero: diaInfo.numero,
                dataPrevista: diaInfo.dataPrevista,
                diaSemana: diaInfo.diaSemana,
                disponibilidadeSegundos: disponibilidadeDiariaSegundos,
                duracaoNormalBlocoSegundos,
                blocosPorDiaRotina: blocosPorDia,
                reservaInternaSegundos,
                tempoRestanteSegundos,
                blocosNormaisRestantes,
                tempoAlocadoBlocosSegundos,
                tempoNaoAlocadoSegundos,
                ultrapassaDisponibilidade,
                excessoPraticasSegundos,
                missoesInternas,
                missoesExternas
            };
        });
        const diasFolgaComPraticas = [];
        for (const infoData of calendario.todasDatas) {
            if (datasEstudoSet.has(infoData.dataPrevista)) continue;
            const ocorrencias = missoesPorData.get(infoData.dataPrevista) || [];
            if (!ocorrencias.length) continue;
            // Um snapshot interno histórico pode cair numa folga após edição da rotina;
            // ele permanece no histórico sem se tornar TAF ou consumir um dia inexistente.
            totalMissoesInternas += ocorrencias.filter(item => item.consomeCargaEstudo).length;
            const missoesExternas = ocorrencias.map(item => item.missao);
            if (!missoesExternas.length) continue;
            totalMissoesExternas += ocorrencias.filter(item => !item.consomeCargaEstudo).length;
            diasFolgaComPraticas.push({
                dataPrevista: infoData.dataPrevista,
                diaSemana: infoData.diaSemana,
                missoesExternas
            });
        }
        const totalBlocosSemPraticas = somarSegundos(0, calendario.diasEstudo.length * blocosPorDia);
        return {
            projetoId,
            dataInicio: calendario.inicio,
            dataFinal: calendario.fim,
            diasRotina: calendario.rotina,
            disponibilidadeDiariaSegundos,
            blocosPorDia,
            duracaoNormalBlocoSegundos,
            atividades: atividadesPlanejadas,
            missoes: todasMissoes,
            diasEstudo,
            diasFolgaComPraticas,
            resumo: {
                totalDiasEstudo: diasEstudo.length,
                disponibilidadeTotalSegundos,
                duracaoNormalBlocoSegundos,
                blocosPorDiaRotina: blocosPorDia,
                totalBlocosSemPraticas,
                totalBlocosNormaisRestantes,
                tempoTotalReservadoPraticasSegundos,
                tempoTotalAlocadoBlocosSegundos,
                tempoTotalNaoAlocadoSegundos,
                tempoTotalExcessoPraticasSegundos,
                diasComPraticaInterna,
                diasSemBlocosTeoricos,
                diasComExcessoPraticas,
                diasFolgaComTaf: diasFolgaComPraticas.length,
                totalMissoes: todasMissoes.length,
                totalMissoesInternas,
                totalMissoesExternas,
                totalMaterias,
                capacidadeInsuficiente: totalMaterias > 0 && totalBlocosNormaisRestantes < totalMaterias,
                semBlocosTeoricos: totalBlocosNormaisRestantes === 0
            }
        };
    }

    window.AtividadesPraticas = Object.freeze({ tipos, diasSemana, periodicidades, modosInicio, regrasDoTipo,
        validarAgendamento, criarAtividade, validarAtividade, criarMissao, validarMissao, criarConclusao,
        criarSessao, criarAvaliacao, validarAvaliacao: normalizarAvaliacao, validarSessao: normalizarSessao,
        validarConclusao: normalizarConclusao, projetarAtividade, resolverInicioPlanejado, gerarMissoesAtividade, planejarCapacidadePraticas });
})();
