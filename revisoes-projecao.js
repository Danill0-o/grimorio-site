/* D064: reservas simuladas por data e período, varredura de vagas teóricas e entrada da D012. */
(function () {
    'use strict';

    function chave(blocoId, chavePeriodo) { return JSON.stringify([blocoId, chavePeriodo]); }
    function idOrigem(data, posicao) { return `bloco-${data}-${posicao + 1}`; }

    function somarSegundos(total, parcela) {
        const soma = total + parcela;
        if (!Number.isSafeInteger(soma)) throw new Error('Total de segundos da projeção inválido.');
        return soma;
    }

    function primeiraEmOuApos(datas, alvo) {
        if (!alvo) return null;
        let inicio = 0;
        let fim = datas.length;
        while (inicio < fim) {
            const meio = Math.floor((inicio + fim) / 2);
            if (datas[meio] < alvo) inicio = meio + 1;
            else fim = meio;
        }
        return datas[inicio] ?? null;
    }

    function ordemDosGrupos(a, b) {
        return a.dataNominal.localeCompare(b.dataNominal) || a.ordem - b.ordem || a.dataOrigem.localeCompare(b.dataOrigem);
    }

    function duplaPrioritaria(novas, data, pratica, capacidade, saldoReal, teto) {
        if (BigInt(pratica) * 4n !== BigInt(capacidade) * 3n) return [];
        for (const primeira of novas) {
            if (primeira.grupo.etapa !== 'R1' || primeira.prazoFixo < data) continue;
            for (const segunda of novas) {
                if (segunda.grupo.etapa !== 'R2' || segunda.prazoFixo < data
                    || primeira.grupo.dataOrigem === segunda.grupo.dataOrigem) continue;
                const a = primeira.grupo.duracaoSegundos;
                const b = segunda.grupo.duracaoSegundos;
                const duracao = somarSegundos(a, b);
                const tolerancia = Math.floor(a / 20) + Math.floor(b / 20);
                if (duracao <= teto && duracao - saldoReal <= tolerancia) return [primeira, segunda];
            }
        }
        return [];
    }

    function projetar({ carga, disponibilidadeDiariaSegundos, politica, origens, protegidas = [], blocosPorDia,
        incluirRevisoes, primeiraDataReserva = null, teoriaConfirmadaPorData = {} }) {
        const calendario = window.CalendarioJornada;
        const { somarDias, diferencaDias, chavePeriodo, alvoPeriodoRevisao } = calendario;
        if (!calendario.politicaRevisoesValida(politica)) throw new Error('Política de revisão inválida.');
        if (!carga || !Number.isSafeInteger(carga.duracaoNormalBlocoSegundos) || carga.duracaoNormalBlocoSegundos < 1
            || !Array.isArray(carga.dias) || !carga.dias.length
            || !Number.isSafeInteger(disponibilidadeDiariaSegundos) || disponibilidadeDiariaSegundos < carga.duracaoNormalBlocoSegundos) {
            throw new Error('Modelo de carga diária inválido.');
        }
        const duracaoBloco = carga.duracaoNormalBlocoSegundos;
        const maximoBlocos = blocosPorDia === undefined
            ? Math.min(4, Math.floor(disponibilidadeDiariaSegundos / duracaoBloco))
            : blocosPorDia;
        if (!Number.isInteger(maximoBlocos) || maximoBlocos < 1 || maximoBlocos > 4
            || Math.floor(disponibilidadeDiariaSegundos / maximoBlocos) !== duracaoBloco) {
            throw new Error('Quantidade de blocos por dia inválida.');
        }
        const revisoesNaCarga = incluirRevisoes === undefined
            ? (!politica.ativadas || carga.limiteRevisoesSegundos > 0)
            : Boolean(incluirRevisoes);
        const origensDinamicas = origens === undefined;
        if (!origensDinamicas && !Array.isArray(origens)) {
            throw new Error('Origem de revisão inválida ou duplicada.');
        }

        const protegidasPorVinculo = new Map();
        const saldosPorData = new Map();
        const protegidasPorId = new Map();
        for (const revisao of protegidas) {
            const { id, blocoId, chavePeriodo, dataPrevista, estado, saldoSegundos } = revisao;
            if (!id || !blocoId || !calendario.periodoDaChave(chavePeriodo) || !dataPrevista || somarDias(dataPrevista, 0) !== dataPrevista
                || !['pendente', 'concluida', 'dispensada'].includes(estado) || !Number.isSafeInteger(saldoSegundos) || saldoSegundos < 0) {
                throw new Error('Compromisso protegido de revisão inválido.');
            }
            const anterior = protegidasPorId.get(id);
            if (anterior) {
                if (['blocoId', 'chavePeriodo', 'dataPrevista', 'estado', 'saldoSegundos'].some(campo => anterior[campo] !== revisao[campo])) {
                    throw new Error('Compromissos protegidos conflitantes.');
                }
                continue;
            }
            protegidasPorId.set(id, revisao);
            const vinculo = chave(blocoId, chavePeriodo);
            const dataAnterior = protegidasPorVinculo.get(vinculo);
            if (!dataAnterior || dataPrevista > dataAnterior) protegidasPorVinculo.set(vinculo, dataPrevista);
            if (estado === 'pendente') saldosPorData.set(dataPrevista, somarSegundos(saldosPorData.get(dataPrevista) ?? 0, saldoSegundos));
        }

        const dias = carga.dias.map(dia => {
            const protegidos = saldosPorData.get(dia.dataPrevista) ?? 0;
            const residual = Math.max(0, disponibilidadeDiariaSegundos - dia.praticasRegularesSegundos);
            return { dataPrevista: dia.dataPrevista, revisoesProtegidasSegundos: protegidos,
                revisoesReservadasSegundos: 0, excessoProtegidoSegundos: Math.max(0, protegidos - residual),
                excessoDuplaSegundos: 0,
                vagasTeoricas: 0, teoriaSegundos: 0, duracoesOperacionaisSegundos: [], folgaSegundos: 0 };
        });
        const resultado = { grupos: [], protegidas: [...protegidasPorId.values()].map(revisao => ({ ...revisao })), dias };
        const simularRevisoes = Boolean(politica.ativadas && carga.limiteRevisoesSegundos > 0);

        const rotina = carga.dias.filter(dia => dia.ehEstudo).map(dia => dia.dataPrevista);
        const elegiveis = carga.dias.filter(dia => dia.ehEstudo && !dia.excepcional).map(dia => dia.dataPrevista);
        const datasElegiveis = new Set(elegiveis);
        const fim = carga.dias.at(-1).dataPrevista;
        const futuros = new Map();
        const intervalo = politica.modalidade === 'personalizado' ? 7 : 1;

        function enfileirar(origem) {
            while (origem.posicao < origem.etapas.length) {
                const { periodo, grupo, fixa } = origem.etapas[origem.posicao++];
                if (!grupo) {
                    if (fixa && (!origem.anterior || fixa > origem.anterior)) origem.anterior = fixa;
                    if (fixa && periodo.tipo === 'proximoEstudo') origem.proximo = fixa;
                    continue;
                }
                const alvo = alvoPeriodoRevisao(periodo, grupo.dataOrigem, origem.proximo, diferencaDias(grupo.dataOrigem, fim));
                if (!alvo || grupo.duracaoSegundos > carga.limiteRevisoesSegundos) return;
                const menorData = [grupo.dataNominal, alvo, primeiraDataReserva,
                    origem.anterior && somarDias(origem.anterior, intervalo)].filter(Boolean).sort().at(-1);
                const data = primeiraEmOuApos(elegiveis, menorData);
                let prazoFixo = fim;
                for (const posterior of origem.etapas.slice(origem.posicao)) {
                    const distancia = periodo.tipo === 'proximoEstudo' && posterior.periodo.tipo === 'semanasAposProximo'
                        ? posterior.periodo.semanas * 7 : intervalo;
                    for (const item of grupo.itens) {
                        const dataFixa = protegidasPorVinculo.get(chave(item.blocoId, posterior.chavePeriodo));
                        if (!dataFixa) continue;
                        const limite = somarDias(dataFixa, -distancia);
                        if (!limite || limite < prazoFixo) prazoFixo = limite;
                    }
                }
                if (!data || !prazoFixo || data > prazoFixo) return;
                if (!futuros.has(data)) futuros.set(data, []);
                futuros.get(data).push({ origem, periodo, grupo, fixa, prazoFixo });
                return;
            }
        }

        function registrarOrigem(dataOrigem, itens) {
            const diaSeguinte = somarDias(dataOrigem, 1);
            const proximoRegular = primeiraEmOuApos(rotina, diaSeguinte);
            const proximo = primeiraEmOuApos(elegiveis, diaSeguinte);
            const datasFixasR1 = politica.periodos.some(periodo => periodo.tipo === 'proximoEstudo')
                ? itens.map(item => protegidasPorVinculo.get(chave(item.blocoId, 'R1'))) : [];
            // Se toda a coorte tem R1 protegida, a âncora comum é a última dessas datas.
            const ancoraNominal = datasFixasR1.length && datasFixasR1.every(Boolean)
                ? datasFixasR1.sort().at(-1) : proximo || proximoRegular;
            const prazo = diferencaDias(dataOrigem, fim);
            // A ordem civil da política precede as exceções e é estável quando períodos coincidem.
            const etapas = politica.periodos.map(periodo => ({ periodo, chavePeriodo: chavePeriodo(periodo),
                alvoRegular: alvoPeriodoRevisao(periodo, dataOrigem, proximoRegular, prazo) }))
                .sort((a, b) => (a.alvoRegular ?? '9999-99-99').localeCompare(b.alvoRegular ?? '9999-99-99')
                    || a.chavePeriodo.localeCompare(b.chavePeriodo))
                .map(({ periodo, chavePeriodo, alvoRegular }, ordem) => {
                    const vinculadas = itens.map(item => ({ ...item, id: chave(item.blocoId, chavePeriodo) }));
                    const novas = vinculadas.filter(item => !protegidasPorVinculo.has(item.id)).sort((a, b) => a.id.localeCompare(b.id));
                    const fixa = vinculadas.map(item => protegidasPorVinculo.get(item.id)).filter(Boolean).sort().at(-1);
                    // Sem próximo dia elegível, um alvo dentro do prazo pode continuar sem vaga.
                    const alvo = alvoPeriodoRevisao(periodo, dataOrigem, ancoraNominal, prazo);
                    const dataNominal = primeiraEmOuApos(elegiveis, alvo) || alvo || alvoRegular;
                    const grupo = dataNominal && novas.length ? { dataOrigem, chavePeriodo, etapa: `R${ordem + 1}`,
                        ordem, dataNominal, dataOperacional: null, estado: 'naoProgramavel', itens: novas,
                        duracaoSegundos: novas.reduce((total, item) => somarSegundos(total, item.duracaoSegundos), 0) } : null;
                    if (grupo) resultado.grupos.push(grupo);
                    return { periodo, chavePeriodo, grupo, fixa };
                });
            enfileirar({ etapas, proximo, anterior: null, posicao: 0 });
        }

        if (simularRevisoes && !origensDinamicas) {
            const porOrigem = new Map();
            const blocos = new Set();
            for (const { blocoId, dataOrigem, metaSegundos, preservarOrigem } of origens) {
                if (typeof blocoId !== 'string' || !blocoId || blocos.has(blocoId)
                    || !Number.isSafeInteger(metaSegundos) || metaSegundos <= 0 || !dataOrigem || somarDias(dataOrigem, 0) !== dataOrigem) {
                    throw new Error('Origem de revisão inválida ou duplicada.');
                }
                blocos.add(blocoId);
                if (!datasElegiveis.has(dataOrigem) && !preservarOrigem) continue;
                if (!porOrigem.has(dataOrigem)) porOrigem.set(dataOrigem, []);
                porOrigem.get(dataOrigem).push({ blocoId, duracaoSegundos: Math.round(metaSegundos / 8) });
            }
            for (const [dataOrigem, itens] of [...porOrigem].sort(([a], [b]) => a.localeCompare(b))) {
                registrarOrigem(dataOrigem, itens);
            }
        }

        let pendentes = [];
        for (let i = 0; i < dias.length; i++) {
            const dia = dias[i];
            const cargaDia = carga.dias[i];
            if (simularRevisoes && datasElegiveis.has(dia.dataPrevista)) {
                const novas = futuros.get(dia.dataPrevista) ?? [];
                futuros.delete(dia.dataPrevista);
                const fila = pendentes.concat(novas).sort((a, b) => ordemDosGrupos(a.grupo, b.grupo));
                pendentes = [];
                const teoriaConfirmada = teoriaConfirmadaPorData[dia.dataPrevista] ?? 0;
                const saldoReal = disponibilidadeDiariaSegundos - cargaDia.praticasRegularesSegundos
                    - dia.revisoesProtegidasSegundos - teoriaConfirmada;
                const dupla = teoriaConfirmada ? [] : duplaPrioritaria(novas.sort((a, b) => ordemDosGrupos(a.grupo, b.grupo)), dia.dataPrevista,
                    cargaDia.praticasRegularesSegundos, disponibilidadeDiariaSegundos, saldoReal, carga.limiteRevisoesSegundos);
                let saldo = Math.max(0, Math.min(carga.limiteRevisoesSegundos, saldoReal));
                for (const entrada of [...dupla, ...fila.filter(item => !dupla.includes(item))]) {
                    const { origem, periodo, grupo, fixa, prazoFixo } = entrada;
                    if (dia.dataPrevista > prazoFixo) continue;
                    if (grupo.duracaoSegundos > saldo && !dupla.includes(entrada)) {
                        pendentes.push(entrada);
                        continue;
                    }
                    grupo.dataOperacional = dia.dataPrevista;
                    grupo.estado = 'reservada';
                    saldo -= grupo.duracaoSegundos;
                    dia.revisoesReservadasSegundos += grupo.duracaoSegundos;
                    origem.anterior = fixa && fixa > dia.dataPrevista ? fixa : dia.dataPrevista;
                    if (periodo.tipo === 'proximoEstudo') origem.proximo = origem.anterior;
                    enfileirar(origem);
                }
                if (dupla.length) dia.excessoDuplaSegundos = Math.max(0, dia.revisoesReservadasSegundos - saldoReal);
            }
            if (!cargaDia.ehEstudo) continue;
            if (cargaDia.excepcional) {
                const descontarRevisoes = revisoesNaCarga ? dia.revisoesProtegidasSegundos : 0;
                dia.folgaSegundos = Math.max(0, disponibilidadeDiariaSegundos - cargaDia.praticasRegularesSegundos - descontarRevisoes);
                continue;
            }
            const descontarRevisoes = revisoesNaCarga
                ? somarSegundos(dia.revisoesProtegidasSegundos, dia.revisoesReservadasSegundos)
                : 0;
            const restante = Math.max(0, disponibilidadeDiariaSegundos - cargaDia.praticasRegularesSegundos - descontarRevisoes);
            dia.vagasTeoricas = restante > 0 ? Math.min(maximoBlocos, restante) : 0;
            dia.teoriaSegundos = dia.vagasTeoricas > 0 ? restante : 0;
            dia.duracoesOperacionaisSegundos = Array.from({ length: dia.vagasTeoricas }, (_, slot) =>
                Math.floor(restante / dia.vagasTeoricas) + (slot < restante % dia.vagasTeoricas ? 1 : 0));
            dia.folgaSegundos = Math.max(0, restante - dia.teoriaSegundos);
            if (origensDinamicas && simularRevisoes && dia.vagasTeoricas > 0) {
                const itens = Array.from({ length: dia.vagasTeoricas }, (_, posicao) => ({
                    blocoId: idOrigem(dia.dataPrevista, posicao),
                    duracaoSegundos: Math.round(duracaoBloco / 8)
                }));
                registrarOrigem(dia.dataPrevista, itens);
            }
        }
        resultado.duracaoNominalBlocoSegundos = duracaoBloco;
        resultado.blocosPorDiaLista = dias.filter((_, i) => carga.dias[i].ehEstudo).map(dia => dia.vagasTeoricas);
        resultado.teoriaSegundosPorDiaLista = dias.filter((_, i) => carga.dias[i].ehEstudo).map(dia => dia.teoriaSegundos);
        resultado.totalVagasTeoricas = resultado.blocosPorDiaLista.reduce((soma, n) => soma + n, 0);
        resultado.cargaTeoricaTotalSegundos = resultado.teoriaSegundosPorDiaLista.reduce((soma, n) => soma + n, 0);
        resultado.temReservaCapacidade = carga.dias.some((cargaDia, i) => cargaDia.ehEstudo
            && (cargaDia.praticasRegularesSegundos > 0
                || (revisoesNaCarga && (dias[i].revisoesProtegidasSegundos > 0 || dias[i].revisoesReservadasSegundos > 0))));
        resultado.grupos = resultado.grupos.sort(ordemDosGrupos).map(({ ordem, ...grupo }) => grupo);
        return resultado;
    }

    function dadosDistribuicao({ dados, carga, projecao }) {
        if (!dados || typeof dados !== 'object' || !carga || typeof carga !== 'object' || !projecao || typeof projecao !== 'object') {
            throw new Error('Dados de distribuição da projeção inválidos.');
        }
        const dias = Number(dados.diasEstudoPraProva);
        if (!Array.isArray(projecao.blocosPorDiaLista) || projecao.blocosPorDiaLista.length !== dias
            || !Array.isArray(projecao.teoriaSegundosPorDiaLista) || projecao.teoriaSegundosPorDiaLista.length !== dias
            || !Number.isSafeInteger(carga.duracaoNormalBlocoSegundos) || carga.duracaoNormalBlocoSegundos < 1) {
            throw new Error('Vagas teóricas da projeção incompatíveis com os dias de estudo.');
        }
        if (!projecao.temReservaCapacidade) return { ...dados, distribuicaoVersao: 3 };
        return {
            ...dados,
            distribuicaoVersao: 3,
            blocosPorDiaLista: [...projecao.blocosPorDiaLista],
            teoriaSegundosPorDiaLista: [...projecao.teoriaSegundosPorDiaLista],
            duracaoNormalBlocoSegundos: carga.duracaoNormalBlocoSegundos
        };
    }

    window.RevisoesProjecao = Object.freeze({ projetar, dadosDistribuicao, idOrigem });
})();
