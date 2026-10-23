(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', () => {
        const el = id => document.getElementById(`vinculo-${id}`);
        const painel = el('painel');
        if (!painel) return;
        let comando;

        function obterProjetoAlvo() {
            const selectProjeto = el('projeto');
            if (selectProjeto && selectProjeto.value) return selectProjeto.value;
            return window.ProjetosStore?.idAtual?.() || '';
        }

        function atualizarProjetos() {
            const selectProjeto = el('projeto');
            if (!selectProjeto || !window.ProjetosStore?.listar) return;
            const atual = selectProjeto.value || window.ProjetosStore.idAtual() || '';
            const projetos = window.ProjetosStore.listar();
            selectProjeto.replaceChildren(
                ...projetos.map(p => {
                    const nome = p.dados?.nomeExame || p.rascunho?.valores?.nome_exame || 'Projeto em preparação';
                    return new Option(`${nome}${p.arquivado ? ' (arquivado)' : ''}`, p.id);
                })
            );
            if (!projetos.length) {
                selectProjeto.replaceChildren(new Option('Nenhum projeto disponível', ''));
            } else if ([...selectProjeto.options].some(o => o.value === atual)) {
                selectProjeto.value = atual;
            }
        }

        function atualizar() {
            try {
                atualizarProjetos();
                const projId = obterProjetoAlvo();
                const origem = el('origem').value, destino = el('destino').value;
                const participacoes = projId ? window.MateriasStore.listarProjetosMaterias(projId) : [];
                el('origem').replaceChildren(...participacoes.map(p => {
                    const global = window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId);
                    return new Option(`${p.nomeExibicao || global.nomeCanonico}${p.removida ? ' (removida)' : ''} — vínculo: ${global.nomeCanonico}`, p.projetoMateriaId);
                }));
                el('destino').replaceChildren(
                    new Option('Selecione a matéria correta', ''),
                    ...window.MateriasStore.listarMateriasGlobais().map(g => new Option(g.nomeCanonico, g.materiaGlobalId))
                );
                if (origem && [...el('origem').options].some(o => o.value === origem)) el('origem').value = origem;
                if (destino && [...el('destino').options].some(o => o.value === destino)) el('destino').value = destino;
            } catch (erro) {
                el('status').textContent = erro.message;
            }
        }

        el('projeto')?.addEventListener('change', atualizar);
        painel.addEventListener('toggle', () => { if (painel.open) atualizar(); });
        window.addEventListener('vinculo:atualizar', atualizar);
        window.addEventListener('storage', event => {
            if (!event.key || event.key === 'materiasDominioV1' || event.key.startsWith('projetoV1:')) atualizar();
        });
        if (painel.open) atualizar();

        el('revisar').addEventListener('click', () => {
            try {
                const projId = obterProjetoAlvo();
                if (!projId) throw new Error('Selecione um projeto válido.');
                const p = window.MateriasStore.obterProjetoMateria(el('origem').value, projId);
                const destino = window.MateriasStore.resolverMateriaGlobal(el('destino').value);
                const origem = window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId);
                if (origem.materiaGlobalId === destino.materiaGlobalId) throw new Error('Escolha uma matéria diferente do vínculo atual.');
                comando = {
                    projetoMateriaId: p.projetoMateriaId,
                    projetoId: p.projetoId,
                    materiaGlobalIdAnterior: p.materiaGlobalId,
                    novoMateriaGlobalId: destino.materiaGlobalId
                };
                const sessoes = window.HistoricoRepository.listar().filter(s => s.projetoMateriaId === p.projetoMateriaId);
                el('resumo').textContent = `De ${origem.nomeCanonico} para ${destino.nomeCanonico}. ${sessoes.length} sessão(ões) registrada(s) nesta participação.`;
                el('confirmacao').showModal();
            } catch (erro) {
                el('status').textContent = erro.message;
            }
        });

        el('cancelar').addEventListener('click', () => el('confirmacao').close());
        el('confirmar').addEventListener('click', async () => {
            el('confirmar').disabled = true;
            try {
                await window.MateriasStore.corrigirVinculo(comando);
                el('status').textContent = 'Vínculo corrigido. O histórico agora pertence à matéria escolhida.';
                atualizar();
                window.dispatchEvent(new CustomEvent('memorias:atualizadas'));
                if (typeof atualizarCatalogoMaterias === 'function') atualizarCatalogoMaterias();
            } catch (erro) {
                el('status').textContent = erro.message;
            } finally {
                el('confirmacao').close();
                el('confirmar').disabled = false;
            }
        });
    });
})();
