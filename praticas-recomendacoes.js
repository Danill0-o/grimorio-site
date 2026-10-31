/* E8: peso de prova e frequência são cálculos puros, independentes de afinidade/XP. */
(function () {
    'use strict';
    const falhar = m => { throw new Error(`Recomendações de práticas: ${m}`); };
    function numero(v, nome, zero = false) {
        if (!Number.isFinite(v) || v < 0 || (!zero && v === 0) || v > Number.MAX_SAFE_INTEGER) falhar(`${nome} inválido`);
        return v;
    }
    function identidade(v) { if (typeof v !== 'string' || !/^[a-z0-9_-]+$/i.test(v)) falhar('ID inválido'); return v; }
    function calcularPesosProva({projetoId,materias,atividades}) {
        identidade(projetoId);
        if (!Array.isArray(materias) || !materias.length) falhar('preencha todas as matérias comuns e pesos antes de consolidar a distribuição automática');
        if (!Array.isArray(atividades)) falhar('atividades inválidas');
        const vistos = new Set(), pesos = Object.create(null); let totalMaterias = 0, totalPraticas = 0;
        for (const m of materias) {
            const id = identidade(m?.projetoMateriaId);
            if (vistos.has(id)) falhar('matéria repetida no peso da prova'); vistos.add(id);
            if (m.projetoId !== undefined && m.projetoId !== projetoId) falhar('matéria de outro projeto');
            totalMaterias = numero(totalMaterias + numero(m.Nquestoes,'questões',true) * numero(m.peso,'peso'),'total das matérias',true);
        }
        if (totalMaterias <= 0) falhar('total das matérias inválido');
        vistos.clear();
        for (const a of atividades) {
            const id = identidade(a?.atividadeId);
            if (vistos.has(id) || a.projetoId !== projetoId) falhar('atividade repetida ou de outro projeto'); vistos.add(id);
            const pontos = a.tipo === 'taf' ? null : Object.hasOwn(a,'pesoProva') ? a.pesoProva : a.importanciaProva?.pontos ?? null;
            if (pontos !== null) { numero(pontos,'pontos da atividade',true); totalPraticas = numero(totalPraticas+pontos,'total das práticas',true); }
            pesos[id] = {pontos,pesoRelativo:null};
        }
        const totalProva = numero(totalMaterias+totalPraticas,'total da prova');
        for (const p of Object.values(pesos)) if (p.pontos !== null) p.pesoRelativo = p.pontos/totalProva;
        return {totalMaterias,totalPraticas,totalProva,atividades:pesos};
    }
    function recomendarDatas({datasElegiveis,pesoRelativo,duracaoSegundos,disponibilidadeSegundos,cargaPorData = {}}) {
        if (!Array.isArray(datasElegiveis) || datasElegiveis.some((d,i) => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)
            || !Number.isFinite(Date.parse(d+'T12:00:00Z')) || new Date(d+'T12:00:00Z').toISOString().slice(0,10) !== d || i && d <= datasElegiveis[i-1])) falhar('datas elegíveis inválidas');
        numero(pesoRelativo,'peso relativo',true); if (pesoRelativo > 1) falhar('peso relativo maior que a prova');
        if (!Number.isSafeInteger(duracaoSegundos) || duracaoSegundos < 1 || !Number.isSafeInteger(disponibilidadeSegundos) || disponibilidadeSegundos < 1) falhar('capacidade/duração inválida');
        const dias = datasElegiveis.length;
        const quantidade = dias && pesoRelativo ? Math.max(1,Math.min(dias,Math.round(dias*pesoRelativo))) : 0;
        const escolhidas = new Set();
        for (let i=0;i<quantidade;i++) {
            const alvo = Math.floor((i+0.5)*dias/quantidade);
            // Faixas temporais disjuntas preservam a regularidade; dentro delas, evitar excesso e concentração.
            const inicio = Math.floor(i*dias/quantidade), fim = Math.floor((i+1)*dias/quantidade);
            let melhor = null;
            const avaliar = j => {
                const data = datasElegiveis[j], carga = cargaPorData[data] ?? 0;
                if (escolhidas.has(data)) return;
                if (!Number.isSafeInteger(carga) || carga < 0) falhar('carga prevista inválida');
                const excesso = Math.max(0,carga+duracaoSegundos-disponibilidadeSegundos);
                const score = [excesso,carga,Math.abs(j-alvo),j];
                if (!melhor || score.some((v,k) => v !== melhor.score[k] && score.slice(0,k).every((s,n)=>s===melhor.score[n]) && v < melhor.score[k])) melhor = {data,score};
            };
            for (let j=inicio;j<fim;j++) avaliar(j);
            if (!melhor || melhor.score[0] > 0) for (let j=0;j<dias;j++) avaliar(j);
            if (melhor) escolhidas.add(melhor.data);
        }
        return {quantidade,diasElegiveis:dias,pesoRelativo,datas:[...escolhidas].sort()};
    }
    function duracaoReferencia(atividade) {
        const p = window.PraticasProgressao?.obterParametros(atividade);
        if (!p) falhar('escolha uma referência de linhas ou tempo ideal para usar a duração da tabela');
        return p.alvoSegundos;
    }
    window.PraticasRecomendacoes = Object.freeze({calcularPesosProva,recomendarDatas,duracaoReferencia});
})();
