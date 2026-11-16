/* R1: comandos puros de reorganização; não lê stores nem persiste o rascunho. */
(function () {
    'use strict';
    const estados = new WeakMap();
    const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const erro = mensagem => { throw new Error(`Reagendamento: ${mensagem}`); };
    const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    const id = valor => typeof valor === 'string' && valor.trim().length > 0;
    const chave = item => `${item.tipo}:${item.id}`;
    function inteiro(valor, minimo = 0) {
        if (!Number.isSafeInteger(valor) || valor < minimo) erro('segundos ou índice devem ser inteiros seguros');
        return valor;
    }
    function somar(a, b) { return inteiro(a + b); }
    function data(valor) {
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) erro('data civil inválida');
        const instante = new Date(`${valor}T12:00:00.000Z`);
        if (!Number.isFinite(instante.getTime()) || instante.toISOString().slice(0, 10) !== valor) erro('data civil inválida');
        return valor;
    }
    function copiar(valor, caminho = new Set()) {
        if (valor === null || ['string', 'boolean'].includes(typeof valor)) return valor;
        if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
        if (!objeto(valor) && !Array.isArray(valor)) erro('snapshot deve conter somente valores JSON válidos');
        if (caminho.has(valor)) erro('snapshot inválido ou circular');
        const proto = Object.getPrototypeOf(valor);
        const construtor = proto && Object.getOwnPropertyDescriptor(proto, 'constructor')?.value;
        if (proto !== null && (!construtor || construtor.name !== (Array.isArray(valor) ? 'Array' : 'Object'))) erro('snapshot deve usar objetos JSON simples');
        if (Object.getOwnPropertySymbols(valor).length) erro('snapshot não aceita símbolos');
        caminho.add(valor);
        const resultado = Array.isArray(valor) ? [] : {};
        for (const [campo, propriedade] of Object.entries(Object.getOwnPropertyDescriptors(valor))) {
            if (!Object.hasOwn(propriedade, 'value') || campo === 'toJSON') erro('snapshot não aceita propriedades calculadas ou serialização customizada');
            if (Array.isArray(valor) && campo === 'length') continue;
            const copia = copiar(propriedade.value, caminho);
            if (propriedade.enumerable) Object.defineProperty(resultado, campo, { value: copia, enumerable: true, writable: true, configurable: true });
        }
        caminho.delete(valor);
        return resultado;
    }
    function congelar(valor) {
        if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
            Object.values(valor).forEach(congelar);
            Object.freeze(valor);
        }
        return valor;
    }
    function validarFonte(fonte) {
        if (!objeto(fonte) || !id(fonte.projetoId) || !(fonte.planoVersaoId === null || id(fonte.planoVersaoId))) erro('identidade do projeto/plano inválida');
        if (data(fonte.inicio) > data(fonte.fim)) erro('período do projeto inválido');
        if (!Array.isArray(fonte.diasSemana) || !fonte.diasSemana.length || new Set(fonte.diasSemana).size !== fonte.diasSemana.length
            || fonte.diasSemana.some(d => !semana.includes(d))) erro('rotina inválida');
        inteiro(fonte.capacidadeDiaSegundos);
        if (typeof fonte.creditoSequencial !== 'boolean' || !Array.isArray(fonte.sessoesNormais) || !Array.isArray(fonte.dias)) erro('fontes obrigatórias ausentes');
        const sessoes = new Set(), dias = new Set(), indices = new Set(), itens = new Set();
        for (const sessao of fonte.sessoesNormais) {
            if (!objeto(sessao) || !id(sessao.id) || !id(sessao.projetoMateriaId) || sessoes.has(sessao.id)) erro('identidade de sessão normal inválida ou duplicada');
            sessoes.add(sessao.id); inteiro(sessao.duracaoSegundos, 1);
            if (sessao.dataCredito !== null) data(sessao.dataCredito);
        }
        for (const dia of fonte.dias) {
            if (!objeto(dia) || data(dia.data) < fonte.inicio || dia.data > fonte.fim || dias.has(dia.data)) erro('data de origem inválida, duplicada ou fora do projeto');
            dias.add(dia.data);
            if (dia.diaJornada !== null) {
                if (!/^dia[1-9]\d*$/.test(dia.diaJornada) || indices.has(dia.diaJornada)) erro('diaJornada inválido ou duplicado');
                indices.add(dia.diaJornada);
            }
            if (!Array.isArray(dia.itens) || !objeto(dia.contexto) || !Array.isArray(dia.contexto.extras) || !Array.isArray(dia.contexto.revisoes)) erro('itens/contexto do dia inválidos');
            inteiro(dia.contexto.realizadoSegundos);
            for (const item of dia.itens) {
                if (!objeto(item) || !id(item.id) || !['materia', 'pratica'].includes(item.tipo) || itens.has(chave(item))) erro('identidade de bloco/ocorrência inválida ou duplicada');
                itens.add(chave(item));
                if (!id(item.nome) || typeof item.externo !== 'boolean' || !Array.isArray(item.bloqueios)
                    || item.bloqueios.some(b => !id(b)) || !objeto(item.snapshot)) erro('snapshot de bloco/ocorrência inválido');
                if (item.snapshot.projetoId !== fonte.projetoId) erro('projeto do snapshot ausente ou divergente');
                if (item.tipo === 'materia') {
                    if (!id(item.projetoMateriaId) || item.externo || item.snapshot.blocoId !== item.id
                        || item.snapshot.projetoMateriaId !== item.projetoMateriaId) erro('identidade da participação/bloco divergente do snapshot');
                    inteiro(item.metaSegundos, 1);
                    if (item.snapshot.metaSegundos !== undefined && item.snapshot.metaSegundos !== item.metaSegundos) erro('meta explícita divergente do snapshot');
                } else {
                    if (!id(item.atividadeId) || item.snapshot.missaoId !== item.id || item.snapshot.atividadeId !== item.atividadeId) erro('identidade da atividade/ocorrência divergente do snapshot');
                    if (item.metaSegundos !== null || !item.externo) inteiro(item.metaSegundos, 1);
                    if (item.snapshot.duracaoPlanejadaSegundos !== item.metaSegundos) erro('duração da ocorrência divergente do snapshot');
                }
            }
        }
    }
    function capacidade(fonte, dia) {
        return fonte.diasSemana.includes(semana[new Date(`${dia}T12:00:00.000Z`).getUTCDay()]) ? fonte.capacidadeDiaSegundos : 0;
    }
    function validarCargas(dias) {
        let total = 0;
        for (const dia of dias) {
            let normal = 0, externa = 0;
            for (const item of dia.itens) {
                const segundos = item.metaSegundos ?? 0;
                total = somar(total, segundos);
                if (item.externo) externa = somar(externa, segundos);
                else normal = somar(normal, segundos);
            }
        }
    }
    function creditos(fonte, dias) {
        const pools = new Map(), resultado = new Map();
        for (const sessao of fonte.sessoesNormais) {
            if (!fonte.creditoSequencial && sessao.dataCredito === null) continue;
            const grupo = JSON.stringify([sessao.projetoMateriaId, fonte.creditoSequencial ? null : sessao.dataCredito]);
            pools.set(grupo, somar(pools.get(grupo) || 0, sessao.duracaoSegundos));
        }
        for (const dia of [...dias].sort((a, b) => a.data.localeCompare(b.data))) {
            for (const item of dia.itens) {
                if (item.tipo !== 'materia') continue;
                const grupo = JSON.stringify([item.projetoMateriaId, fonte.creditoSequencial ? null : dia.data]);
                const saldo = pools.get(grupo) || 0;
                const credito = Math.min(saldo, item.metaSegundos);
                pools.set(grupo, saldo - credito); resultado.set(chave(item), credito);
            }
        }
        return resultado;
    }
    function registrar(estado) {
        const token = Object.freeze({ versao: 1, projetoId: estado.fonte.projetoId,
            planoVersaoId: estado.fonte.planoVersaoId, datas: congelar(estado.datas), hojeCriacao: estado.hoje });
        estados.set(token, congelar({ ...estado, origem: estado.origem || token }));
        return token;
    }
    function estadoDe(rascunho) {
        if (!rascunho || !estados.has(rascunho)) erro('rascunho inválido; crie uma nova simulação');
        return estados.get(rascunho);
    }
    function criarRascunho(snapshot, opcoes, retrospectiva = false) {
        const fonte = copiar(snapshot), escolhas = copiar(opcoes);
        validarFonte(fonte);
        if (!objeto(escolhas) || !Array.isArray(escolhas.datas) || escolhas.datas.length !== 2
            || escolhas.datas[0] === escolhas.datas[1]) erro('selecione exatamente dois dias distintos');
        const hoje = data(escolhas.hoje);
        for (const dia of escolhas.datas) {
            if (data(dia) < fonte.inicio || dia > fonte.fim) erro('dia selecionado fora do período do projeto');
            if (!retrospectiva && dia < hoje) erro('dia passado não participa da reorganização comum');
        }
        const dias = [...fonte.dias];
        for (const dia of escolhas.datas) {
            if (!dias.some(d => d.data === dia)) dias.push({ data: dia, diaJornada: null, itens: [],
                contexto: { extras: [], revisoes: [], realizadoSegundos: 0 } });
        }
        dias.sort((a, b) => a.data.localeCompare(b.data));
        // Rejeita overflow antes de devolver um rascunho ou comando projetável.
        validarCargas(dias);
        creditos(fonte, dias);
        return registrar({ fonte, datas: escolhas.datas, hoje, baseDias: dias, dias, comandados: [] });
    }
    function validarComando(estado, hoje) {
        if (data(hoje) !== estado.hoje) erro('a data civil mudou; reveja os dias em uma nova simulação');
        if (estado.datas.some(d => d < hoje)) erro('dia passado não pode ser reorganizado');
    }
    // Execução, crédito e checkpoint fixam a data do bloco (transferência), não sua ordem no próprio dia.
    function localizar(estado, comando, origem, transferencia = true) {
        if (!objeto(comando) || !id(comando.itemId) || (comando.tipo !== undefined && !['materia', 'pratica'].includes(comando.tipo))) erro('identidade do comando inválida');
        if (!estado.datas.includes(origem)) erro('origem deve ser um dos dois dias selecionados');
        const dia = estado.dias.find(d => d.data === origem);
        const candidatos = dia.itens.filter(item => item.id === comando.itemId && (comando.tipo === undefined || item.tipo === comando.tipo));
        if (candidatos.length !== 1) erro('item ausente ou identidade ambígua; informe o tipo e o ID');
        const item = candidatos[0];
        const mapa = creditos(estado.fonte, estado.dias);
        if (transferencia && (item.bloqueios.length || (mapa.get(chave(item)) || 0) > 0)) erro('bloco/ocorrência com crédito, execução ou contexto protegido não muda de dia');
        return { dia, item, indice: dia.itens.indexOf(item), mapa };
    }
    function aplicar(estado, comando, origem, destino, reordenacao) {
        if (!estado.datas.includes(destino)) erro('destino deve ser um dos dois dias selecionados');
        const { item, indice, mapa } = localizar(estado, comando, origem, !reordenacao);
        const outro = estado.dias.find(d => d.data === destino);
        const indiceDestino = inteiro(comando.indiceDestino);
        const limite = outro.itens.length - (reordenacao ? 1 : 0);
        if (indiceDestino > limite) erro('posição de destino fora da lista');
        const dias = estado.dias.map(d => ({ ...d, itens: [...d.itens] }));
        dias.find(d => d.data === origem).itens.splice(indice, 1);
        dias.find(d => d.data === destino).itens.splice(indiceDestino, 0, item);
        validarCargas(dias);
        const novos = creditos(estado.fonte, dias);
        if ([...mapa].some(([bloco, credito]) => novos.get(bloco) !== credito)) erro('movimento transferiria crédito entre blocos do plano');
        return registrar({ ...estado, dias, comandados: [...new Set([...estado.comandados, chave(item)])] });
    }
    function mover(rascunho, comando, hoje) {
        const estado = estadoDe(rascunho); validarComando(estado, hoje);
        const c = copiar(comando);
        if (!objeto(c) || c.dataOrigem === c.dataDestino) erro('movimento exige origem e destino distintos; use reordenar no mesmo dia');
        return aplicar(estado, c, c.dataOrigem, c.dataDestino, false);
    }
    function reordenar(rascunho, comando, hoje) {
        const estado = estadoDe(rascunho); validarComando(estado, hoje);
        const c = copiar(comando);
        return aplicar(estado, c, c?.data, c?.data, true);
    }
    function posicoes(dias) {
        const mapa = new Map();
        for (const dia of dias) dia.itens.forEach((item, indice) => mapa.set(chave(item), { item, data: dia.data, indice }));
        return mapa;
    }
    function projetar(rascunho, hoje) {
        const estado = estadoDe(rascunho); data(hoje);
        const mapa = creditos(estado.fonte, estado.dias);
        const necessitaRevalidacao = hoje !== estado.hoje;
        const base = posicoes(estado.baseDias), atual = posicoes(estado.dias);
        const movimentos = estado.comandados.flatMap(k => {
            const a = base.get(k), b = atual.get(k);
            return a.data === b.data && a.indice === b.indice ? [] : [{ chave: k, tipo: b.item.tipo, itemId: b.item.id,
                dataOrigem: a.data, dataDestino: b.data, indiceOrigem: a.indice, indiceDestino: b.indice }];
        });
        const dias = estado.datas.map(d => {
            const dia = estado.dias.find(item => item.data === d);
            let cargaPlanejadaSegundos = 0, cargaExternaSegundos = 0, externosSemDuracao = 0;
            const itens = dia.itens.map(item => {
                if (item.externo) {
                    if (item.metaSegundos === null) externosSemDuracao++;
                    else cargaExternaSegundos = somar(cargaExternaSegundos, item.metaSegundos);
                } else cargaPlanejadaSegundos = somar(cargaPlanejadaSegundos, item.metaSegundos);
                const creditoSegundos = mapa.get(chave(item)) || 0;
                const bloqueios = [...new Set([...item.bloqueios, ...(creditoSegundos ? ['credito'] : [])])];
                const editavel = !necessitaRevalidacao && d >= hoje;
                // movimentavel = pode mudar de dia; reordenavel = pode mudar de posição no próprio dia.
                return { ...item, chave: chave(item), creditoSegundos, bloqueios,
                    movimentavel: editavel && bloqueios.length === 0, reordenavel: editavel };
            });
            const capacidadeSegundos = capacidade(estado.fonte, d);
            return { data: d, diaJornada: dia.diaJornada, capacidadeSegundos, cargaPlanejadaSegundos,
                livreSegundos: Math.max(0, capacidadeSegundos - cargaPlanejadaSegundos),
                excessoSegundos: Math.max(0, cargaPlanejadaSegundos - capacidadeSegundos),
                cargaExternaSegundos, externosSemDuracao, itens, contexto: dia.contexto };
        });
        const alterado = [...base].some(([k, a]) => { const b = atual.get(k); return a.data !== b.data || a.indice !== b.indice; });
        return congelar({ projetoId: estado.fonte.projetoId, planoVersaoId: estado.fonte.planoVersaoId,
            hoje, necessitaRevalidacao, dias, movimentos, alterado });
    }
    function cancelar(rascunho) {
        const estado = estadoDe(rascunho);
        return registrar({ ...estado, dias: estado.baseDias, comandados: [] });
    }
    function diasDoPlano(rascunho) { return estadoDe(rascunho).dias; }
    const origem = rascunho => estadoDe(rascunho).origem;
    function antecipar(snapshot, comando, hoje) {
        const c = copiar(comando);
        if (data(c.dataDestino) >= data(hoje) || data(c.dataOrigem) <= hoje) erro('selecione uma previsão futura e uma data de realização passada');
        if (!['materia', 'pratica'].includes(c.tipo)) erro('tipo de bloco inválido');
        const base = criarRascunho(snapshot, { datas: [c.dataOrigem, c.dataDestino], hoje }, true);
        const estado = estadoDe(base);
        const { item } = localizar(estado, c, c.dataOrigem, true);
        if (c.tipo === 'materia' ? !['tempo', 'saldo'].includes(c.modo) : c.modo !== 'conclusao') erro('declaração inválida');
        const segundos = c.modo === 'saldo' ? item.metaSegundos
            : c.tipo === 'pratica' && c.segundos === null ? null : inteiro(c.segundos, 1);
        const dia = estado.dias.find(d => d.data === c.dataDestino);
        const rascunho = aplicar(estado, { ...c, indiceDestino: dia.itens.length }, c.dataOrigem, c.dataDestino, false);
        const movido = estadoDe(rascunho);
        let creditoAlvo = null;
        if (item.tipo === 'materia') {
            const comFato = { ...movido.fonte, sessoesNormais: [...movido.fonte.sessoesNormais,
                { projetoMateriaId: item.projetoMateriaId, duracaoSegundos: segundos, dataCredito: c.dataDestino }] };
            creditoAlvo = creditos(comFato, movido.dias).get(chave(item));
        }
        return congelar({ base, rascunho, item, segundos, creditoAlvo, modo: c.modo,
            diaJornada: dia.diaJornada || 'folga-' + c.dataDestino });
    }
    window.Reagendamento = Object.freeze({
        criarRascunho: (snapshot, opcoes) => criarRascunho(snapshot, opcoes),
        mover, reordenar, projetar, diasDoPlano, cancelar, origem, antecipar
    });
})();
