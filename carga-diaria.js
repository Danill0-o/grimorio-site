/* Orçamento por data civil, compartilhado pela consulta e pela reorganização. */
(function () {
    'use strict';
    function calcular({ dados, materiaDoDia, mapa, sessoes, missoes, praticas, fontesRevisoes, hoje }) {
        const civil = window.CalendarioJornada;
        const politica = civil.politicaProjeto(dados);
        const capacidade = Math.round(dados.minutosPorDia * 60);
        const carga = window.AtividadesPraticas.modelarCargaDiaria({
            dataInicio: civil.somarDias(dados.dataInicioF, 0), dataFinal: civil.somarDias(dados.dataFinalF, 0),
            diasRotina: dados.listaDiaDaSemana, disponibilidadeDiariaSegundos: capacidade, blocosPorDia: dados.blocosPorDia,
            cargaDiaria: dados.cargaDiaria, periodosRevisao: politica.ativadas ? politica.periodos.length : 0,
            missoes: missoes.filter(m => m.duracaoPlanejadaSegundos != null)
        });
        const porData = new Map(carga.dias.map(dia => [dia.dataPrevista, {
            data: dia.dataPrevista, capacidadeSegundos: dia.ehEstudo ? capacidade : 0,
            teoriaSegundos: 0, revisoesSegundos: 0, praticasSegundos: dia.praticasRegularesSegundos,
            praticasExtrasSegundos: dia.praticasExtrasSegundos, realizadoSegundos: 0, praticasSemDuracao: 0
        }]));
        for (const [dia, blocos] of Object.entries(materiaDoDia)) {
            const cargaDia = porData.get(mapa.porDia[dia]);
            if (cargaDia) cargaDia.teoriaSegundos = blocos.reduce((soma, bloco) => soma + bloco.metaSegundos, 0);
        }
        const { cargasReservadas } = window.RevisoesMaterializacao.calcular({
            dados, materiaDoDia, mapa, sessoes, missoes, hoje, carga, ...fontesRevisoes
        });
        for (const reserva of cargasReservadas) {
            const dia = porData.get(reserva.data);
            if (dia) dia.revisoesSegundos += reserva.segundos;
        }
        for (const missao of missoes) {
            const dia = porData.get(missao.dataPrevista);
            if (dia && missao.duracaoPlanejadaSegundos == null) dia.praticasSemDuracao++;
        }
        const sessoesPraticas = Object.values(praticas.sessoes).filter(s => !Object.hasOwn(praticas.exclusoes.sessoes, s.sessaoId));
        for (const sessao of [...sessoes, ...sessoesPraticas]) {
            if (sessao.projetoId !== dados.projetoId) continue;
            const dia = porData.get(sessao.dataEstudo || civil.dataLocal(sessao.inicio));
            if (dia) dia.realizadoSegundos += sessao.duracaoSegundos;
        }
        for (const dia of porData.values()) {
            dia.cargaPlanejadaSegundos = dia.teoriaSegundos + dia.praticasSegundos + dia.revisoesSegundos;
            dia.excessoSegundos = Math.max(0, dia.cargaPlanejadaSegundos - dia.capacidadeSegundos);
            dia.livreSegundos = Math.max(0, dia.capacidadeSegundos - dia.cargaPlanejadaSegundos);
        }
        return porData;
    }

    function consultar({ dados, materiaDoDia, sessoes = window.EstudoStore.listarSessoes(), missoes }) {
        if (dados?.cargaDiariaVersao !== 1) return new Map();
        const mapa = window.CalendarioJornada.mapear(dados, Object.keys(materiaDoDia).length);
        const praticas = window.PraticasStore.obterEstado(dados.projetoId);
        missoes ??= window.PraticasStore.projetarMissoesProjeto(dados.projetoId, { dados, materiaDoDia }).missoes;
        return calcular({ dados, materiaDoDia, mapa, sessoes, missoes, praticas,
            fontesRevisoes: window.RevisoesStore.fontesParaCarga(dados.projetoId) });
    }

    function duracao(segundos) {
        return [Math.floor(segundos / 3600) && `${Math.floor(segundos / 3600)} h`,
            Math.floor(segundos / 60) % 60 && `${Math.floor(segundos / 60) % 60} min`,
            segundos % 60 && `${segundos % 60} s`].filter(Boolean).join(' ') || '0 min';
    }
    function textoForaDaCarga(segundos, semDuracao) {
        if (!segundos && !semDuracao) return '';
        return `Práticas fora da carga · ${[segundos && duracao(segundos), semDuracao && 'duração livre'].filter(Boolean).join(' + ')}`;
    }
    function divisao(dia) {
        return `Teoria ${duracao(dia.teoriaSegundos)} · Revisões reservadas ${duracao(dia.revisoesSegundos)} · Práticas ${duracao(dia.praticasSegundos)}`;
    }
    function realizado(dia) {
        const excesso = Math.max(0, dia.realizadoSegundos - dia.capacidadeSegundos);
        return `Realizado ${duracao(dia.realizadoSegundos)}${excesso ? ` · ${duracao(excesso)} acima do orçamento` : ''}`;
    }
    function painel(dia) {
        const bloco = document.createElement('div');
        bloco.className = 'carga-diaria-resumo';
        const topo = document.createElement('strong');
        topo.textContent = `Carga planejada ${duracao(dia.cargaPlanejadaSegundos)} / ${duracao(dia.capacidadeSegundos)}`
            + (dia.excessoSegundos ? ` · Excesso ${duracao(dia.excessoSegundos)}` : '');
        bloco.append(topo);
        for (const texto of [divisao(dia), textoForaDaCarga(dia.praticasExtrasSegundos, dia.praticasSemDuracao), realizado(dia)]) {
            if (!texto) continue;
            const linha = document.createElement('span');
            linha.textContent = texto;
            bloco.append(linha);
        }
        return bloco;
    }
    window.CargaDiaria = Object.freeze({ calcular, consultar, duracao, textoForaDaCarga, divisao, realizado, painel });
})();
