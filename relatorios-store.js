/* Projeções somente leitura: segundos e identidades fornecidos pelo histórico. */
(function () {
    'use strict';
    const DIA = 86400000;
    const civil = valor => {
        const [ano, mes, dia] = valor.split('-').map(Number);
        const data = new Date(0); data.setUTCFullYear(ano, mes - 1, dia); data.setUTCHours(0, 0, 0, 0);
        return data.getTime();
    };
    const iso = valor => new Date(valor).toISOString().slice(0, 10);
    const local = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    const vazio = () => ({ estudo: 0, revisao: 0, outros: 0, total: 0 });
    function tipo(sessao) {
        if (window.EstudoStore.sessaoEstudoElegivel(sessao)) return 'estudo';
        return sessao.tipo === 'revisao' || ['cronometro-revisao', 'conclusao-revisao'].includes(sessao.origem) ? 'revisao' : 'outros';
    }
    function inicio(valor, grupo) {
        const data = new Date(valor);
        if (grupo !== 'mes') return valor - data.getUTCDay() * DIA;
        data.setUTCDate(1); return data.getTime();
    }
    function seguinte(valor, grupo) {
        const data = new Date(valor);
        if (grupo !== 'mes') return valor + 7 * DIA;
        data.setUTCMonth(data.getUTCMonth() + 1); return data.getTime();
    }
    function resumir(registros, { grupo = 'semana', de = '', ate = '' } = {}) {
        if (de && ate && de > ate) throw new Error('A data inicial deve ser anterior ou igual à data final.');
        const entradas = registros.map(r => ({ ...r, data: local(new Date(r.sessao.inicio)) }))
            .filter(r => (!de || r.data >= de) && (!ate || r.data <= ate));
        const totais = vazio(), materias = new Map(), periodos = new Map();
        const datas = entradas.map(r => r.data).sort();
        // Sem histórico nem intervalo completo não há série a mostrar.
        const primeiro = de || datas[0], ultimo = ate || datas[datas.length - 1];
        if (primeiro && ultimo && primeiro <= ultimo) {
            for (let valor = inicio(civil(primeiro), grupo), fim = inicio(civil(ultimo), grupo); valor <= fim; valor = seguinte(valor, grupo)) {
                const id = iso(valor);
                const nome = grupo === 'mes' ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(valor))
                    : `Semana de ${id.slice(8)} / ${id.slice(5, 7)} / ${id.slice(0, 4)}`;
                periodos.set(id, { id, nome, ...vazio() });
            }
        }
        for (const r of entradas) {
            const id = r.id || r.materiaGlobalId;
            if (!id) throw new Error('Integridade: identidade de matéria obrigatória no relatório.');
            if (!materias.has(id)) materias.set(id, { id, nome: r.nome, ...vazio() });
            const segundos = Math.max(0, Math.round(Number(r.sessao.duracaoSegundos) || 0));
            const categoria = tipo(r.sessao), periodo = periodos.get(iso(inicio(civil(r.data), grupo)));
            for (const acumulado of [totais, materias.get(id), periodo]) {
                acumulado[categoria] += segundos; acumulado.total += segundos;
            }
        }
        return { totais, quantidade: entradas.length, grupo, periodos: [...periodos.values()],
            materias: [...materias.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id)) };
    }
    window.RelatoriosEstudo = Object.freeze({ resumir, tipo });
})();
