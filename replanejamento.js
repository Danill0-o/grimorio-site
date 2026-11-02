/* D061: conserva origens e projeta o histórico sem criar sessões ou saldos. */
(function () {
    'use strict';
    const storage = () => window.ProjetoStorage || localStorage;
    const ler = (chave, padrao) => JSON.parse(storage().getItem(chave) ?? JSON.stringify(padrao));
    function capturar() {
        const dados = ler('dadosExame', null), plano = ler('materiaDoDia', {});
        if (!dados || !Object.keys(plano).length) return null;
        window.NotasBlocos.preservarLegadas(plano);
        const sessoes = window.EstudoStore.listarSessoes().filter(s => s.projetoId === dados.projetoId);
        const progresso = window.EstudoStore.calcularProgressoPlano({ dados, materiaDoDia: plano,
            sessoesProjeto: sessoes, distribuicaoMaterias: ler('lista_distribuicao_materias', []) });
        const revisoes = window.RevisoesStore.sincronizar({ dados, materiaDoDia: plano,
            revisoesDoDia: ler('revisoesDoDia', {}), dias: progresso.dias, sessoes });
        const anteriores = dados.replanejamento;
        const origens = { ...(anteriores?.origens || {}) };
        const metasAnteriores = { ...(anteriores?.metasAnteriores || {}) };
        progresso.dias.forEach(dia => dia.metasMaterias.forEach(meta => {
            const blocos = plano[dia.dia].filter(b => b.projetoMateriaId === meta.projetoMateriaId);
            blocos.forEach((b, i) => {
                origens[b.blocoId] = { ...b, diaOrigem: dia.dia, dataOrigem: dia.dataPrevista, numero: i + 1,
                    metaSegundos: b.metaSegundos ?? Math.round(meta.metaSegundos * (i + 1) / blocos.length) - Math.round(meta.metaSegundos * i / blocos.length) };
            });
        }));
        Object.values(progresso.materias).forEach(m => {
            metasAnteriores[m.projetoMateriaId] = { materia: m.nome, metaSegundos: m.metaTotalSegundos };
        });
        return { versao: 1, projetoId: dados.projetoId, planoFonteId: dados.planoVersaoId || null, origens, metasAnteriores,
            revisoesIds: [...new Set([...(anteriores?.revisoesIds || []), ...revisoes.map(r => r.id)])] };
    }
    function normal(sessao, projetoId) {
        return sessao.projetoId === projetoId && !sessao.blocoExtraId && window.EstudoStore.sessaoEstudoElegivel(sessao);
    }
    function preparar(origem, dados) {
        if (!origem || origem.projetoId !== dados.projetoId) throw new Error('Origem do replanejamento inválida. Reabra a edição.');
        if ((origem.planoFonteId || null) !== (dados.planoVersaoId || null)) throw new Error('Outro replanejamento foi salvo. Recarregue a edição e revise suas escolhas antes de salvar novamente.');
        return { ...origem, sessoesIds: window.EstudoStore.listarSessoes().filter(s => normal(s, dados.projetoId)).map(s => s.id) };
    }
    function historicos(dados, plano, sessoes) {
        const r = dados.replanejamento;
        if (!r) return [];
        const ativas = new Set(Object.values(plano).flat().map(b => b.projetoMateriaId));
        const segundos = new Map();
        sessoes.filter(s => normal(s, dados.projetoId)).forEach(s => segundos.set(s.projetoMateriaId,
            (segundos.get(s.projetoMateriaId) || 0) + s.duracaoSegundos));
        return Object.entries(r.metasAnteriores).filter(([id]) => !ativas.has(id) && segundos.get(id) > 0
            && window.MateriasStore.obterProjetoMateria(id, dados.projetoId).removida)
            .map(([projetoMateriaId, meta]) => ({ ...meta, projetoMateriaId,
                segundos: segundos.get(projetoMateriaId), completo: segundos.get(projetoMateriaId) >= meta.metaSegundos }));
    }
    // As notas continuam editáveis pela identidade original; não são copiadas para blocos novos.
    function criarHistorico(dados, plano, sessoes, editavel = false) {
        if (!dados.replanejamento) return null;
        const secao = document.createElement('section'); secao.className = 'replanejamento-historico';
        const titulo = document.createElement('h4'); titulo.textContent = 'Histórico do replanejamento'; secao.append(titulo);
        const aviso = document.createElement('p');
        aviso.textContent = 'O crédito dos blocos é reaproveitado por matéria. Registrar ou Concluir aplica o tempo aos primeiros blocos pendentes. As datas reais dos estudos permanecem no histórico.'; secao.append(aviso);
        historicos(dados, plano, sessoes).forEach(m => {
            const item = document.createElement('p'); item.dataset.historicoMateria = m.projetoMateriaId;
            item.textContent = `${m.materia} · matéria excluída do plano · ${m.completo ? 'Concluída' : 'Parcial'} · ${(m.segundos / 60).toLocaleString('pt-BR')} de ${(m.metaSegundos / 60).toLocaleString('pt-BR')} min`;
            secao.append(item);
        });
        const idsAtuais = new Set(Object.values(plano).flat().map(b => b.blocoId));
        const notas = Object.values(dados.replanejamento.origens).filter(b => !idsAtuais.has(b.blocoId) && window.NotasBlocos.texto(b));
        const idsHistoricos = new Set(dados.replanejamento.sessoesIds || []);
        const anotacoes = sessoes.filter(s => idsHistoricos.has(s.id) && normal(s, dados.projetoId) && s.anotacao);
        if (notas.length || anotacoes.length) {
            const detalhes = document.createElement('details'), summary = document.createElement('summary');
            summary.textContent = 'Notas e anotações das origens históricas'; detalhes.append(summary);
            notas.forEach(b => {
                const p = document.createElement('p'); p.dataset.notaHistorica = b.blocoId;
                const texto = document.createElement('span'); texto.textContent = `${b.materia} · ${b.dataOrigem || b.diaOrigem} · bloco ${b.numero}: ${window.NotasBlocos.texto(b)}`;
                p.append(texto);
                if (editavel) p.append(window.NotasBlocos.criarBotao(b, { diaJornada: b.diaOrigem, numero: b.numero }));
                detalhes.append(p);
            });
            anotacoes.forEach(s => { const p = document.createElement('p'); p.textContent = `${s.materia} · ${s.dataEstudo || window.CalendarioJornada.dataLocal(s.inicio)}: ${s.anotacao}`; detalhes.append(p); });
            secao.append(detalhes);
        }
        return secao;
    }
    window.Replanejamento = Object.freeze({ capturar, preparar, historicos, criarHistorico });
})();
