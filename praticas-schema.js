/* D040/E2: validação pura compartilhada pelo store e pela restauração. */
(function () {
    'use strict';
    const dominio = window.AtividadesPraticas;
    const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    const falhar = mensagem => { throw new Error(`Integridade de práticas: ${mensagem}`); };
    function campos(valor, nomes, obrigatorios = nomes) {
        if (!objeto(valor) || Object.keys(valor).some(k => !nomes.includes(k))
            || obrigatorios.some(k => !Object.hasOwn(valor, k))) falhar('campos inválidos');
    }
    function id(valor) {
        if (typeof valor !== 'string' || !/^[a-z0-9_-]+$/i.test(valor)) falhar('ID inválido');
        return valor;
    }
    function vazio(projetoId) {
        return { versao: 1, projetoId: id(projetoId), atividades: Object.create(null), missoes: Object.create(null),
            conclusoes: Object.create(null), sessoes: Object.create(null), avaliacoes: Object.create(null),
            exclusoes: { conclusoes: Object.create(null), sessoes: Object.create(null), avaliacoes: Object.create(null) } };
    }
    function validar(estado, projetoId) {
        if (!dominio) falhar('núcleo de atividades indisponível');
        campos(estado, ['versao', 'projetoId', 'atividades', 'missoes', 'conclusoes', 'sessoes', 'avaliacoes', 'exclusoes'],
            ['versao', 'projetoId', 'atividades', 'missoes', 'conclusoes', 'sessoes', 'exclusoes']);
        if (estado.versao !== 1 || estado.projetoId !== id(projetoId)) falhar('versão ou projeto inválido');
        for (const nome of ['atividades', 'missoes', 'conclusoes', 'sessoes']) if (!objeto(estado[nome])) falhar(`coleção ${nome} inválida`);
        campos(estado.exclusoes, ['conclusoes', 'sessoes', 'avaliacoes'], ['conclusoes', 'sessoes']);
        const resultado = vazio(projetoId), grupos = new Map();
        for (const [chave, registro] of Object.entries(estado.atividades)) {
            campos(registro, ['atividade', 'revisao', 'removida']);
            const atividade = dominio.validarAtividade(registro.atividade);
            if (atividade.atividadeId !== id(chave) || atividade.projetoId !== projetoId
                || !Number.isSafeInteger(registro.revisao) || registro.revisao < 1
                || typeof registro.removida !== 'boolean') falhar('atividade ou revisão inválida');
            resultado.atividades[chave] = { atividade, revisao: registro.revisao, removida: registro.removida };
            grupos.set(chave, { atividade, missoes: [], conclusoes: [], sessoes: [] });
        }
        for (const [chave, valor] of Object.entries(estado.missoes)) {
            if (!objeto(valor) || !Object.hasOwn(resultado.atividades, valor.atividadeId)) falhar('atividade da atividade prática inexistente');
            const missao = dominio.validarMissao(valor, resultado.atividades[valor.atividadeId].atividade);
            if (missao.missaoId !== id(chave)) falhar('ID da atividade prática divergente');
            resultado.missoes[chave] = missao;
            grupos.get(missao.atividadeId).missoes.push(missao);
        }
        for (const nome of ['conclusoes', 'sessoes', 'avaliacoes']) {
            const campoId = { conclusoes: 'conclusaoId', sessoes: 'sessaoId', avaliacoes: 'avaliacaoId' }[nome];
            const fatos = Object.hasOwn(estado, nome) ? estado[nome] : {};
            if (!objeto(fatos)) falhar('coleção de fatos inválida');
            for (const [chave, valor] of Object.entries(fatos)) {
                if (!objeto(valor) || !Object.hasOwn(resultado.missoes, valor.missaoId)) falhar('atividade prática do fato inexistente');
                const missao = resultado.missoes[valor.missaoId], atividade = resultado.atividades[missao.atividadeId].atividade;
                if (nome === 'sessoes' && atividade.tipo === 'taf' && valor.origem === 'cronometro') falhar('TAF não usa cronômetro');
                if (valor.versao !== 1 || valor[campoId] !== id(chave) || valor.atividadeId !== atividade.atividadeId
                    || valor.projetoId !== projetoId) falhar('vínculo ou ID do fato inválido');
                resultado[nome][chave] = { conclusoes: dominio.validarConclusao, sessoes: dominio.validarSessao,
                    avaliacoes: dominio.validarAvaliacao }[nome](valor, missao);
            }
            const excluidos = Object.hasOwn(estado.exclusoes, nome) ? estado.exclusoes[nome] : {};
            if (!objeto(excluidos)) falhar('tombstones inválidos');
            for (const [chave, valor] of Object.entries(excluidos)) {
                if (valor !== true || !Object.hasOwn(resultado[nome], chave)) falhar('tombstone sem fato ou inválido');
                resultado.exclusoes[nome][chave] = true;
            }
            for (const [chave, valor] of Object.entries(resultado[nome])) {
                if (nome !== 'avaliacoes' && !Object.hasOwn(resultado.exclusoes[nome], chave)) grupos.get(valor.atividadeId)[nome].push(valor);
            }
        }
        // Valida também totais derivados, sem contar fatos logicamente excluídos.
        for (const grupo of grupos.values()) dominio.projetarAtividade(grupo);
        return resultado;
    }
    window.PraticasSchema = Object.freeze({ vazio, validar });
})();
