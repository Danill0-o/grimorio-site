/* Geração pura: P0.5 preservada na v2; blocos configuráveis e cobertura na v3. */
(function () {
    function gerar(dados, normalizadas) {
        if (dados.distribuicaoVersao === 3) return gerarConfiguravel(dados, normalizadas);
        const dias = Number(dados.diasEstudoPraProva);
        const segundosDia = Math.round(Number(dados.minutosPorDia) * 60);
        const materias = normalizadas.map(m => ({ ...m, peso: Number(m.pesoQuestoes ?? String(m.questoesEmPorcentagem).replace(',', '.').replace('%', '')) }))
            .filter(m => m.Materia && Number.isFinite(m.peso) && m.peso > 0);
        if (!Number.isInteger(dias) || dias < 1 || !Number.isSafeInteger(segundosDia) || segundosDia < 1 || !materias.length) throw new Error('Disponibilidade ou pesos inválidos.');
        const quantidade = Math.max(1, Math.floor(segundosDia / 1800));
        const total = dias * quantidade;
        const somaPesos = materias.reduce((s,m) => s + m.peso, 0);
        // Maiores restos: o erro por matéria é inferior a uma unidade de alocação.
        const cotas = materias.map(m => total * m.peso / somaPesos);
        const limites = cotas.map(Math.floor);
        const ordem = materias.map((_,i) => i).sort((a,b) => (cotas[b]-limites[b])-(cotas[a]-limites[a]) || a-b);
        let sobra = total - limites.reduce((s,n) => s+n, 0);
        for(let i=0;i<sobra;i++) limites[ordem[i]]++;
        const usadas = materias.map(() => 0);
        const segundos = materias.map(() => 0);
        const materiaDoDia = {};
        for(let dia=0;dia<dias;dia++) {
            const blocos = new Map();
            for(let slot=0;slot<quantidade;slot++) {
                const passo = dia * quantidade + slot + 1;
                let escolhido = -1;
                let deficit = -Infinity;
                materias.forEach((m,i) => {
                    const valor = passo * limites[i] / total - usadas[i];
                    if(usadas[i] < limites[i] && valor > deficit) { escolhido=i; deficit=valor; }
                });
                usadas[escolhido]++;
                const duracao = Math.floor(segundosDia*(slot+1)/quantidade)-Math.floor(segundosDia*slot/quantidade);
                segundos[escolhido] += duracao;
                if(!blocos.has(escolhido)) blocos.set(escolhido,{materia:materias[escolhido].Materia,projetoMateriaId:materias[escolhido].projetoMateriaId,metaSegundos:0,tempoEstudado:'',topico:''});
                blocos.get(escolhido).metaSegundos += duracao;
            }
            materiaDoDia[`dia${dia+1}`] = [...blocos.values()].sort((a,b)=>a.materia.localeCompare(b.materia,'pt-BR'));
        }
        return {materiaDoDia, distribuicaoMaterias:materias.map((m,i)=>({Materia:m.Materia,projetoMateriaId:m.projetoMateriaId,Materia_distribuida:segundos[i]/60})), quantidade};
    }
    function gerarConfiguravel(dados, normalizadas) {
        const dias = Number(dados.diasEstudoPraProva);
        const segundosDia = Math.round(Number(dados.minutosPorDia) * 60);
        const quantidade = Number(dados.blocosPorDia);
        const materias = normalizadas.map(m => ({ ...m, peso: Number(m.pesoQuestoes) }));
        if (!Number.isInteger(dias) || dias < 1 || !Number.isSafeInteger(segundosDia) || segundosDia < 1
            || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > Math.max(1, Math.floor(segundosDia / 1800))
            || !materias.length || materias.some(m => !m.Materia || !Number.isFinite(m.peso) || m.peso < 0)) {
            throw new Error('Disponibilidade, blocos ou pesos inválidos.');
        }
        const somaPesos = materias.reduce((s,m) => s + m.peso, 0);
        if (!(somaPesos > 0)) throw new Error('Pesos inválidos.');
        if (Array.isArray(dados.blocosPorDiaLista)) {
            const listaBlocos = dados.blocosPorDiaLista.map(Number);
            const duracaoBloco = dados.duracaoNormalBlocoSegundos === undefined
                ? Math.floor(segundosDia / quantidade)
                : Number(dados.duracaoNormalBlocoSegundos);
            if (listaBlocos.length !== dias
                || listaBlocos.some(n => !Number.isInteger(n) || n < 0 || n > quantidade)
                || !Number.isSafeInteger(duracaoBloco) || duracaoBloco < 1 || duracaoBloco > segundosDia) {
                throw new Error('Disponibilidade, blocos ou pesos inválidos.');
            }
            const total = listaBlocos.reduce((s, n) => s + n, 0);
            const capacidadeInsuficiente = total < materias.length;
            if (total === 0) {
                const materiaDoDia = {};
                for (let dia = 0; dia < dias; dia++) materiaDoDia[`dia${dia + 1}`] = [];
                return {
                    materiaDoDia,
                    distribuicaoMaterias: materias.map(m => ({ Materia: m.Materia, projetoMateriaId: m.projetoMateriaId, Materia_distribuida: 0 })),
                    quantidade,
                    coberturaExtra: false,
                    capacidadeInsuficiente: true,
                    semBlocosTeoricos: true
                };
            }
            const cotas = materias.map(m => total * m.peso / somaPesos);
            const limites = cotas.map(Math.floor);
            const ordem = materias.map((_, i) => i).sort((a, b) => (cotas[b] - limites[b]) - (cotas[a] - limites[a]) || a - b);
            const sobra = total - limites.reduce((s, n) => s + n, 0);
            for (let i = 0; i < sobra; i++) limites[ordem[i]]++;
            const ordemCobertura = materias.map((_, i) => i).sort((a, b) => materias[b].peso - materias[a].peso || a - b);
            ordemCobertura.forEach(i => {
                if (limites[i] || !(materias[i].peso > 0)) return;
                let doador = -1;
                limites.forEach((n, j) => {
                    if (n > 1 && (doador < 0 || n - cotas[j] > limites[doador] - cotas[doador])) doador = j;
                });
                if (doador >= 0) { limites[doador]--; limites[i] = 1; }
            });
            const usadas = materias.map(() => 0);
            const segundos = materias.map(() => 0);
            const materiaDoDia = {};
            let passo = 0;
            for (let dia = 0; dia < dias; dia++) {
                const quantidadeDia = listaBlocos[dia];
                const blocos = [];
                for (let slot = 0; slot < quantidadeDia; slot++) {
                    passo++;
                    let escolhido = -1;
                    let deficit = -Infinity;
                    materias.forEach((m, i) => {
                        const valor = passo * limites[i] / total - usadas[i];
                        if (usadas[i] < limites[i] && valor > deficit) { escolhido = i; deficit = valor; }
                    });
                    usadas[escolhido]++;
                    segundos[escolhido] += duracaoBloco;
                    blocos.push({
                        materia: materias[escolhido].Materia,
                        projetoMateriaId: materias[escolhido].projetoMateriaId,
                        metaSegundos: duracaoBloco,
                        tempoEstudado: '',
                        topico: ''
                    });
                }
                materiaDoDia[`dia${dia + 1}`] = blocos;
            }
            return {
                materiaDoDia,
                distribuicaoMaterias: materias.map((m, i) => ({ Materia: m.Materia, projetoMateriaId: m.projetoMateriaId, Materia_distribuida: segundos[i] / 60 })),
                quantidade,
                coberturaExtra: false,
                capacidadeInsuficiente,
                semBlocosTeoricos: false
            };
        }
        const coberturaExtra = dias * quantidade < materias.length;
        const total = Math.max(dias * quantidade, materias.length);
        const cotas = materias.map(m => total * m.peso / somaPesos);
        const limites = cotas.map(Math.floor);
        const ordem = materias.map((_,i) => i).sort((a,b) => (cotas[b]-limites[b])-(cotas[a]-limites[a]) || a-b);
        const sobra = total - limites.reduce((s,n) => s+n, 0);
        for (let i=0; i<sobra; i++) limites[ordem[i]]++;
        // Cobertura mínima: transferir do maior excedente, sem zerar o doador.
        limites.forEach((limite,i) => {
            if (limite) return;
            let doador = -1;
            limites.forEach((n,j) => {
                if (n > 1 && (doador < 0 || n-cotas[j] > limites[doador]-cotas[doador])) doador=j;
            });
            limites[doador]--; limites[i]=1;
        });
        const usadas = materias.map(() => 0);
        const segundos = materias.map(() => 0);
        const materiaDoDia = {};
        let passo = 0;
        for (let dia=0; dia<dias; dia++) {
            const quantidadeDia = Math.floor(total/dias) + (dia < total%dias ? 1 : 0);
            const blocos = [];
            for (let slot=0; slot<quantidadeDia; slot++) {
                passo++;
                let escolhido = -1;
                let deficit = -Infinity;
                materias.forEach((m,i) => {
                    const valor = passo * limites[i] / total - usadas[i];
                    if (usadas[i] < limites[i] && valor > deficit) { escolhido=i; deficit=valor; }
                });
                usadas[escolhido]++;
                const duracao = Math.floor(segundosDia / quantidadeDia) + (slot < segundosDia % quantidadeDia ? 1 : 0);
                segundos[escolhido] += duracao;
                blocos.push({materia:materias[escolhido].Materia,projetoMateriaId:materias[escolhido].projetoMateriaId,metaSegundos:duracao,tempoEstudado:'',topico:''});
            }
            materiaDoDia[`dia${dia+1}`] = blocos;
        }
        return {materiaDoDia, distribuicaoMaterias:materias.map((m,i)=>({Materia:m.Materia,projetoMateriaId:m.projetoMateriaId,Materia_distribuida:segundos[i]/60})), quantidade, coberturaExtra};
    }
    window.DistribuicaoEstudos = {gerar};
})();
