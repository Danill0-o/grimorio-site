/* Referência e acesso temporal; não distribui matérias nem altera metas/créditos. */
(function () {
    const semana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
    const proximoEstudo = { tipo: 'proximoEstudo' };
    const padrao = [proximoEstudo, { tipo: 'semanasAposProximo', semanas: 1 }, { tipo: 'semanasAposOrigem', semanas: 4 }];
    const estendida = [...padrao, { tipo: 'semanasAposOrigem', semanas: 12 }];
    const presets = { padrao, simplificado: padrao.slice(0, 2), estendida };
    // UTC é usado somente como coordenada aritmética de componentes civis.
    // Nunca converter esse valor para getters locais ou para um instante de sessão.
    function civil(texto) {
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(texto)) ? texto : String(texto || '').split('/').reverse().join('-');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
        const [a,m,d] = iso.split('-').map(Number);
        const data = new Date(0); data.setUTCFullYear(a,m-1,d); data.setUTCHours(0,0,0,0);
        return data.getUTCFullYear()===a && data.getUTCMonth()===m-1 && data.getUTCDate()===d ? data : null;
    }
    const formatar = data => data.toISOString().slice(0,10);
    function somarDias(texto, dias) {
        const data = civil(texto);
        if (!data || !Number.isInteger(dias)) return null;
        data.setUTCDate(data.getUTCDate()+dias); return formatar(data);
    }
    function diferencaDias(origem, destino) { return (civil(destino)-civil(origem))/86400000; }
    function proximoDia(texto, dados) {
        const data = civil(texto), fim = civil(dados.dataFinalF);
        if (!data || !fim) return null;
        for(let i=0;i<7 && data<=fim;i++,data.setUTCDate(data.getUTCDate()+1)) {
            if ((dados.listaDiaDaSemana || []).includes(semana[data.getUTCDay()])) return formatar(data);
        }
        return null;
    }
    function mapear(dados, totalCards) {
        if (dados.datasReagendamento) {
            const porDia = dados.datasReagendamento;
            return { porDia, porData: Object.fromEntries(Object.entries(porDia).map(([dia, data]) => [data, dia])) };
        }
        const porDia = {}, porData = {};
        let data = proximoDia(dados.dataInicioF,dados);
        for(let i=1;data && i<=totalCards;i++) {
            porDia[`dia${i}`]=data; porData[data]=`dia${i}`;
            data=proximoDia(somarDias(data,1),dados);
        }
        return {porDia,porData};
    }
    function dataLocal(hoje = new Date()) {
        const data = new Date(hoje);
        if (!Number.isFinite(data.getTime())) return null;
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    }
    // A data real do card governa acesso; a referência visual de folgas não concede estudo.
    function projetarAcesso(dados, dias, hoje = new Date()) {
        const dataHoje = dataLocal(hoje);
        const inicio = somarDias(dados?.dataInicioF, 0), fim = somarDias(dados?.dataFinalF, 0);
        const rotina = dados?.listaDiaDaSemana;
        const valido = dataHoje && inicio && fim && inicio <= fim && Array.isArray(rotina)
            && rotina.length > 0 && rotina.every(dia => semana.includes(dia));
        const datas = valido ? mapear(dados, dias.length).porDia : {};
        return dias.map(dia => {
            const dataPrevista = datas[dia.dia] || null;
            const situacaoTemporal = !dataPrevista ? 'indisponivel'
                : dataPrevista < dataHoje ? 'passado' : dataPrevista > dataHoje ? 'futuro' : 'hoje';
            return { ...dia, dataPrevista, situacaoTemporal,
                desbloqueado: situacaoTemporal === 'passado' || situacaoTemporal === 'hoje',
                podeIniciar: situacaoTemporal === 'hoje', atual: situacaoTemporal === 'hoje' };
        });
    }
    function chavePeriodo(periodo) {
        if (periodo?.tipo === 'proximoEstudo' && !Object.hasOwn(periodo, 'semanas')) return 'R1';
        if (!['semanasAposProximo', 'semanasAposOrigem'].includes(periodo?.tipo)
            || !Number.isSafeInteger(periodo.semanas) || periodo.semanas < 1) return null;
        if (periodo.tipo === 'semanasAposProximo' && periodo.semanas === 1) return 'R2';
        if (periodo.tipo === 'semanasAposOrigem' && periodo.semanas === 4) return 'R3';
        return `${periodo.tipo}:${periodo.semanas}`;
    }
    function periodoDaChave(chave) {
        if (typeof chave !== 'string') return null;
        const legado = /^R([1-3])$/.exec(chave);
        if (legado) return { ...padrao[Number(legado[1]) - 1] };
        const partes = /^(semanasAposProximo|semanasAposOrigem):([1-9]\d*)$/.exec(chave);
        if (!partes) return null;
        const periodo = { tipo: partes[1], semanas: Number(partes[2]) };
        return chavePeriodo(periodo) === chave ? periodo : null;
    }
    function grupoRevisao(chave) {
        if (!periodoDaChave(chave)) return null;
        return /^R[1-3]$/.test(chave) ? `revisao${chave[1]}` : chave;
    }
    function chavePeriodoDoGrupo(grupo) {
        if (typeof grupo !== 'string') return null;
        if (/^revisao[1-3]$/.test(grupo)) return `R${grupo.at(-1)}`;
        return grupoRevisao(grupo) === grupo ? grupo : null;
    }
    function criarPolitica(modalidade, periodos = []) {
        return { versao: 1, ativadas: true, modalidade,
            periodos: (Object.hasOwn(presets, modalidade) ? presets[modalidade] : periodos).map(periodo => ({ ...periodo })) };
    }
    function politicaRevisoesValida(politica) {
        if (politica?.versao !== 1 || typeof politica.ativadas !== 'boolean'
            || !['padrao', 'simplificado', 'estendida', 'personalizado'].includes(politica.modalidade)
            || !Array.isArray(politica.periodos) || politica.periodos.length > 4
            || (politica.ativadas && !politica.periodos.length)) return false;
        const chaves = Array.from(politica.periodos, chavePeriodo);
        if (chaves.includes(null) || new Set(chaves).size !== chaves.length) return false;
        const preset = presets[politica.modalidade];
        return !preset || (preset.length === chaves.length && preset.every((periodo, i) => chavePeriodo(periodo) === chaves[i]));
    }
    function politicaProjeto(dados) {
        if (dados?.revisoesPolitica === undefined) return criarPolitica('padrao');
        if (!politicaRevisoesValida(dados.revisoesPolitica)) throw new Error('A configuração de revisões do projeto é inválida.');
        return dados.revisoesPolitica;
    }
    function obterRotina(dados) {
        const dias = dados?.listaDiaDaSemana;
        if (!Array.isArray(dias) || !dias.every(dia => semana.includes(dia))) return [];
        return semana.filter(dia => dias.includes(dia));
    }
    function saltosSemanais(rotina) {
        const indices = rotina.map(dia => semana.indexOf(dia));
        return indices.map((dia, i) => (indices[(i + 1) % indices.length] - dia + 7) % 7 || 7);
    }
    function deslocamentoPeriodo(periodo, salto) {
        if (periodo.tipo === 'proximoEstudo') return salto;
        return periodo.semanas * 7 + (periodo.tipo === 'semanasAposProximo' ? salto : 0);
    }
    function alvoPeriodoRevisao(periodo, origem, proximo, prazo = Infinity) {
        const dias = deslocamentoPeriodo(periodo, proximo ? diferencaDias(origem, proximo) : Infinity);
        return dias <= prazo ? somarDias(origem, dias) : null;
    }
    function periodosCompativeis(periodos, saltos) {
        return saltos.every(salto => {
            const deslocamentos = periodos.map(periodo => deslocamentoPeriodo(periodo, salto)).sort((a, b) => a - b);
            return deslocamentos.every((dias, i) => i === 0 || dias - deslocamentos[i - 1] >= 7);
        });
    }
    function contextoRevisoes(origem, dados) {
        if (!origem) return null;
        const fim = somarDias(dados.dataFinalF, 0);
        if (!fim || origem > fim) return null;
        const proximo = proximoDia(somarDias(origem, 1), dados);
        return { origem, prazo: diferencaDias(origem, fim), salto: proximo ? diferencaDias(origem, proximo) : Infinity };
    }
    function projetarPeriodo(periodo, contexto, dados) {
        const dias = deslocamentoPeriodo(periodo, contexto.salto);
        if (dias > contexto.prazo) return null;
        const alvo = somarDias(contexto.origem, dias);
        // D024 também cobre extras e blocos movidos para folgas. Nessas origens,
        // um período baseado na origem pode precisar do primeiro dia programado após o alvo.
        const data = proximoDia(alvo, dados);
        return data ? { periodo, data, alvo } : null;
    }
    function projetarPeriodosRevisao(origem, dados, politica = politicaProjeto(dados)) {
        if (!politica?.ativadas || !politicaRevisoesValida(politica) || !obterRotina(dados).length) return [];
        const contexto = contextoRevisoes(somarDias(origem, 0), dados);
        if (!contexto) return [];
        const datas = new Set();
        return politica.periodos.map(periodo => projetarPeriodo(periodo, contexto, dados))
            .filter(Boolean)
            .sort((a, b) => a.data.localeCompare(b.data) || a.alvo.localeCompare(b.alvo))
            .filter(({ data }) => {
                // Em folga, dois alvos de uma rotina semanal de um único dia podem convergir.
                if (datas.has(data)) return false;
                datas.add(data);
                return true;
            })
            .map(({ periodo, data }, i) => ({ periodo, chavePeriodo: chavePeriodo(periodo), etapa: `R${i + 1}`, data }));
    }
    function projetarRevisoes(origem, dados) {
        return projetarPeriodosRevisao(origem, dados).map(({ etapa, data, chavePeriodo }) => ({
            etapa: dados.revisoesPolitica === undefined ? chavePeriodo : etapa, data
        }));
    }
    function validarPoliticaRevisoes(dados, politica) {
        if (!politicaRevisoesValida(politica)) return false;
        if (!politica.ativadas) return true;
        const rotina = obterRotina(dados);
        if (!rotina.length) return false;
        const origem = proximoDia(dados.dataInicioF, dados);
        return Boolean(origem) && periodosCompativeis(politica.periodos, saltosSemanais(rotina))
            && projetarPeriodosRevisao(origem, dados, politica).length === politica.periodos.length;
    }
    function catalogoRevisoes(dados, periodosSelecionados = []) {
        const rotina = obterRotina(dados);
        const origem = rotina.length ? proximoDia(dados.dataInicioF, dados) : null;
        const contexto = contextoRevisoes(origem, dados);
        const opcoes = contexto ? estendida.flatMap(periodo => {
            const prevista = projetarPeriodo(periodo, contexto, dados);
            return [{ periodo: { ...periodo }, data: prevista?.data ?? null }];
        }) : [];
        const modalidades = {
            padrao: validarPoliticaRevisoes(dados, criarPolitica('padrao')),
            simplificado: validarPoliticaRevisoes(dados, criarPolitica('simplificado')),
            estendida: validarPoliticaRevisoes(dados, criarPolitica('estendida')),
            personalizado: opcoes.some(opcao => opcao.data)
        };
        const chavesCatalogo = new Set(estendida.map(chavePeriodo));
        const disponiveis = periodosSelecionados.every(periodo => chavesCatalogo.has(chavePeriodo(periodo)))
            ? opcoes.filter(({ periodo }) => !periodosSelecionados.some(selecionado => chavePeriodo(selecionado) === chavePeriodo(periodo))) : [];
        return { origem, opcoes: disponiveis, modalidades, diaria: rotina.length === semana.length };
    }
    function calcular(dados, totalCards, hoje = new Date()) {
        if (dados.datasReagendamento) {
            const datas = Object.values(dados.datasReagendamento).sort();
            const civilHoje = dataLocal(hoje);
            return { indice: Math.max(0, datas.filter(data => data <= civilHoje).length - 1),
                aviso: datas.includes(civilHoje) ? '' : 'Hoje não há estudo programado.' };
        }
        const parse = texto => {
            const [dia, mes, ano] = String(texto || '').split('/').map(Number);
            return new Date(ano, mes - 1, dia);
        };
        const inicio = parse(dados.dataInicioF);
        const fim = parse(dados.dataFinalF);
        const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        if (!totalCards || !Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime())) {
            return { indice: 0, aviso: 'Calendário indisponível.' };
        }
        const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        const semana = new Set(dados.listaDiaDaSemana || []);
        let decorridos = 0;
        for (const dia = new Date(inicio); dia <= fim && dia <= data; dia.setDate(dia.getDate() + 1)) {
            if (semana.has(nomes[dia.getDay()])) decorridos++;
        }
        const indice = Math.max(0, Math.min(totalCards - 1, decorridos - 1));
        const aviso = data < inicio || !decorridos ? 'O primeiro dia programado ainda não chegou.'
            : data > fim ? 'Período planejado encerrado. Referência: último dia do plano.'
            : !semana.has(nomes[data.getDay()]) ? 'Hoje não há estudo programado. Referência: último dia previsto.' : '';
        return { indice, aviso };
    }
    window.CalendarioJornada = { calcular, mapear, projetarRevisoes, somarDias, diferencaDias, dataLocal, projetarAcesso,
        chavePeriodo, periodoDaChave, grupoRevisao, chavePeriodoDoGrupo, alvoPeriodoRevisao,
        criarPolitica, politicaRevisoesValida, politicaProjeto, projetarPeriodosRevisao,
        validarPoliticaRevisoes, catalogoRevisoes };
})();
