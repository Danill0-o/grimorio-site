/* Identidade de blocos e vínculos explícitos. Não infere matéria por texto. */
(function () {
    const storage = () => window.ProjetoStorage || localStorage;
    const ler = (chave, padrao) => JSON.parse(storage().getItem(chave) ?? JSON.stringify(padrao));
    const exigir = (valor, campo) => { if (typeof valor !== 'string' || !valor.trim()) throw new Error(`Integridade: ${campo} obrigatório`); return valor; };
    function garantirProjeto(dados) {
        dados.projetoId ||= window.ProjetosStore?.idAtual();
        return exigir(dados.projetoId, 'projetoId');
    }
    function chaveMateria(item) { return exigir(item?.projetoMateriaId, 'projetoMateriaId'); }
    function identificarPlano(plano) {
        const dados = ler('dadosExame', {});
        const projetoId = exigir(dados.projetoId, 'projetoId');
        const dias = Object.entries(plano);
        const assinatura = JSON.stringify([...(dados.planoVersaoId ? [dados.planoVersaoId] : []), dados.estudoPorBloco, dados.carga_horaria_disponivel,
            ler('objetosNormalizados', []).map(m => [chaveMateria(m), m.questoesEmPorcentagem]),
            dias.map(([dia, blocos]) => [dia, blocos.map(b => Number.isInteger(b.metaSegundos) ? [chaveMateria(b), b.metaSegundos] : chaveMateria(b))])]);
        const versoes = ler('planosIdentidadeV1', []);
        if (!Array.isArray(versoes)) throw new Error('Integridade: versões de blocos inválidas');
        let versao = versoes.find(p => p.assinatura === assinatura);
        if (!versao) { versao = { assinatura, blocos: {} }; versoes.push(versao); }
        dias.forEach(([dia, blocos]) => blocos.forEach((bloco, i) => {
            window.MateriasStore.obterProjetoMateria(chaveMateria(bloco), projetoId);
            bloco.projetoId = projetoId;
            bloco.blocoId = versao.blocos[`${dia}:${i}`] ||= `bloco-${crypto.randomUUID()}`;
        }));
        // Registro em uma chave: commit atômico e estabilidade após retry/recarga.
        const texto = JSON.stringify(versoes);
        if (storage().getItem('planosIdentidadeV1') !== texto) storage().setItem('planosIdentidadeV1', texto);
        return plano;
    }
    function vinculosSessao(dados) {
        const projetoId = exigir(dados.projetoId, 'projetoId');
        const projetoMateriaId = chaveMateria(dados);
        window.MateriasStore.obterProjetoMateria(projetoMateriaId, projetoId);
        if (dados.blocoExtraId) {
            if (!window.EstudoExtra) throw new Error('Integridade: estudo extra indisponível');
            return window.EstudoExtra.vinculosSessao(dados);
        }
        if (String(dados.blocoId || '').startsWith('extra-')) throw new Error('Integridade: blocoExtraId obrigatório');
        if (dados.tipo === 'revisao' && dados.revisaoId && ler('dadosExame', {}).replanejamento?.origens?.[dados.blocoId]) {
            const r = window.RevisoesStore?.listar().find(r => r.id === dados.revisaoId);
            if (!r || r.projetoId !== projetoId || r.projetoMateriaId !== projetoMateriaId || r.blocoId !== dados.blocoId) throw new Error('Integridade: origem da revisão inválida');
            return { projetoId, projetoMateriaId, blocoId: r.blocoId };
        }
        const dia = dados.tipo === 'revisao' ? dados.referenciaDia : dados.diaJornada;
        const candidatos = (ler('materiaDoDia', {})[dia] || []).filter(b => b.projetoId === projetoId && b.projetoMateriaId === projetoMateriaId);
        // O vínculo de bloco é opcional em estudo agregado, mas nunca é inferido por nome.
        if (dados.blocoId && candidatos.length && !candidatos.some(b => b.blocoId === dados.blocoId)) throw new Error('Integridade: bloco pertence a outra participação');
        return { projetoId, projetoMateriaId, blocoId: dados.blocoId || (candidatos.length === 1 ? candidatos[0].blocoId : null) };
    }
    window.IdentidadeStore = { garantirProjeto, identificarPlano, vinculosSessao, chaveMateria,
        nomeMateria: id => { const p = window.MateriasStore.obterProjetoMateria(id); return p.nomeExibicao ?? window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).nomeCanonico; } };
})();
