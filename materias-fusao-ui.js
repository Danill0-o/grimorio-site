(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', () => {
        const el = id => document.getElementById('fusao-' + id);
        if (!el('revisar')) return;
        let comando, ocupado = false;
        function atualizar() {
            const materias = window.MateriasStore.listarMateriasGlobais();
            for (const campo of ['origem','destino']) {
                const valor = el(campo).value;
                el(campo).replaceChildren(new Option('Selecione a matéria', ''), ...materias.map(m => new Option(m.nomeCanonico, m.materiaGlobalId)));
                if (materias.some(m => m.materiaGlobalId === valor)) el(campo).value = valor;
            }
        }
        el('revisar').addEventListener('click', () => {
            try {
                const origemId = el('origem').value, destinoId = el('destino').value;
                if (!origemId || !destinoId || origemId === destinoId) throw new Error('Escolha duas matérias diferentes.');
                const a = MateriasStore.resolverMateriaGlobal(origemId), b = MateriasStore.resolverMateriaGlobal(destinoId);
                const total = EstudoStore.obterDominioMateria(origemId).segundos + EstudoStore.obterDominioMateria(destinoId).segundos;
                comando = { origemId, destinoId };
                el('resumo').textContent = `Mesclar “${a.nomeCanonico}” em “${b.nomeCanonico}”. Nome mantido: ${b.nomeCanonico}. Experiência elegível reunida: ${(total / 60).toLocaleString('pt-BR', {maximumFractionDigits:2})} pontos de conhecimento. O nível e seu avanço serão recalculados pela dedicação acumulada; reinícios e registros excluídos continuam respeitados.`;
                el('confirmacao').value = ''; el('erro').textContent = ''; el('confirmar').disabled = true;
                el('dialog').showModal(); el('cancelar').focus();
            } catch (e) { el('status').textContent = e.message; }
        });
        el('confirmacao').addEventListener('input', () => { el('confirmar').disabled = ocupado || el('confirmacao').value !== 'MESCLAR'; });
        el('cancelar').addEventListener('click', () => el('dialog').close());
        el('dialog').addEventListener('cancel', e => { if (ocupado) e.preventDefault(); });
        el('dialog').addEventListener('close', () => el('revisar').focus());
        el('confirmar').addEventListener('click', async () => {
            if (ocupado || el('confirmacao').value !== 'MESCLAR') return;
            ocupado = true; el('confirmar').disabled = el('cancelar').disabled = true;
            try {
                const g = await MateriasStore.mesclarMaterias(comando), d = EstudoStore.obterDominioMateria(g.materiaGlobalId);
                const nivel = d.nivel === 100 ? 'nível 100 (máximo)' : `nível ${d.nivel} · ${d.percentual.toLocaleString('pt-BR', {maximumFractionDigits:1})}% até o próximo nível`;
                el('status').textContent = `${g.nomeCanonico}: ${(d.segundos / 60).toLocaleString('pt-BR', {maximumFractionDigits:2})} pontos de conhecimento · ${nivel}. Fusão concluída.`;
                atualizar(); el('dialog').close();
            } catch (e) { el('erro').textContent = e.message; }
            finally { ocupado = false; el('cancelar').disabled = false; el('confirmar').disabled = el('confirmacao').value !== 'MESCLAR'; }
        });
        window.addEventListener('memorias:atualizadas', atualizar);
        window.addEventListener('materias:excluida', atualizar);
        window.addEventListener('storage', e => { if (e.key === 'materiasDominioV1') atualizar(); });
        atualizar();
    });
})();
