/* Referência e acesso temporal; não distribui matérias nem altera metas/créditos. */
(function () {
    const semana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
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
    function projetarRevisoes(origem, dados) {
        if (!civil(origem)) return [];
        const r1=proximoDia(somarDias(origem,1),dados);
        const r2=r1 ? proximoDia(somarDias(r1,7),dados) : null;
        const r3=proximoDia(somarDias(origem,28),dados);
        return [r1,r2,r3].map((data,i)=>({etapa:`R${i+1}`,data})).filter(r=>r.data);
    }
    function calcular(dados, totalCards, hoje = new Date()) {
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
    window.CalendarioJornada = { calcular, mapear, projetarRevisoes, somarDias, diferencaDias, dataLocal, projetarAcesso };
})();
