(function () {
    document.addEventListener('DOMContentLoaded', iniciarResumoProjeto);
    window.addEventListener('estudo:registrado', iniciarResumoProjeto);
    window.addEventListener('estudo:excluido', iniciarResumoProjeto);
    window.addEventListener('storage', event => { if (window.HistoricoRepository?.ehChave(event.key)) iniciarResumoProjeto(); });

    function iniciarResumoProjeto() {
        const paineis = document.querySelectorAll('[data-projeto-resumo]');
        if (!paineis.length) return;

        const dados = lerObjeto('dadosExame');
        if (!dados) {
            paineis.forEach((painel) => painel.classList.add('d-none'));
            return;
        }

        const resumo = calcularResumo(dados);
        paineis.forEach((painel) => preencherPainel(painel, resumo));
    }

    function preencherPainel(painel, resumo) {
        definirTexto(painel, '[data-projeto-nome]', resumo.nome);
        definirTexto(painel, '[data-projeto-inicio]', resumo.inicio);
        definirTexto(painel, '[data-projeto-fim]', resumo.fim);
        definirTexto(painel, '[data-projeto-restantes]', resumo.diasRestantes);
        definirTexto(painel, '[data-projeto-carga]', resumo.carga);
        definirTexto(painel, '[data-projeto-progresso-label]', `${Math.round(resumo.progresso)}%`);
        const barra = painel.querySelector('[data-projeto-progresso]');
        if (barra) barra.style.width = `${resumo.progresso}%`;
    }

    function calcularResumo(dados) {
        const projetoId = obterProjetoId(dados);
        const materias = lerArray('objetosNormalizados');
        const sessoes = (window.EstudoStore ? window.EstudoStore.listarSessoes() : lerArray('sessoesEstudo')).filter((sessao) => pertenceAoProjeto(sessao, projetoId));
        const cargaTotal = Math.max(1, Number(dados.carga_horaria_disponivel) || Number((window.ProjetoStorage || localStorage).getItem('carga_horaria_disponivel')) || 1);
        const materiaDoDia = lerObjeto('materiaDoDia') || {};
        const progressoPlano = window.EstudoStore?.calcularProgressoPlano({
            dados,
            materiaDoDia,
            sessoesProjeto: sessoes,
            distribuicaoMaterias: lerArray('lista_distribuicao_materias')
        });

        return {
            nome: dados.nomeExame || 'Projeto sem nome',
            inicio: dados.dataInicioF || 'Não informada',
            fim: dados.dataFinalF || 'Sem data final',
            diasRestantes: calcularDiasRestantes(dados.dataFinalF),
            carga: formatarCarga(cargaTotal),
            progresso: limitarPercentual(progressoPlano?.percentualGeral || 0)
        };
    }

    function definirTexto(container, seletor, texto) {
        const elemento = container.querySelector(seletor);
        if (elemento) elemento.textContent = texto;
    }

    function obterProjetoId(dados) {
        if (!dados.projetoId) throw new Error('Integridade: projetoId obrigatório');
        return dados.projetoId;
    }

    function pertenceAoProjeto(sessao, projetoId) {
        if (!sessao.projetoId || !sessao.projetoMateriaId) throw new Error('Integridade: sessão sem identidade');
        return sessao.projetoId === projetoId;
    }

    function calcularDiasRestantes(valor) {
        const fim = dataBrasileira(valor);
        if (!fim) return 'Sem prazo';
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        fim.setHours(0, 0, 0, 0);
        const dias = Math.ceil((fim - hoje) / 86400000);
        if (dias < 0) return 'Prova realizada';
        if (dias === 0) return 'Hoje';
        return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    }

    function formatarCarga(minutos) {
        const total = Math.max(0, Math.round(minutos));
        const horas = Math.floor(total / 60);
        const restante = total % 60;
        return restante ? `${horas}h ${restante}min` : `${horas}h`;
    }

    function limitarPercentual(valor) {
        return Math.min(100, Math.max(0, Number.isFinite(valor) ? valor : 0));
    }

    function dataBrasileira(valor) {
        if (typeof valor !== 'string') return null;
        const partes = valor.split('/').map(Number);
        if (partes.length !== 3 || partes.some((parte) => !parte)) return null;
        const data = new Date(partes[2], partes[1] - 1, partes[0]);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    function lerArray(chave) {
        try {
            const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
            return Array.isArray(valor) ? valor : [];
        } catch (erro) {
            return [];
        }
    }

    function lerObjeto(chave) {
        try {
            const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
            return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
        } catch (erro) {
            return null;
        }
    }

    window.ProjetoUI = { obterProjetoId, atualizar: iniciarResumoProjeto };
})();

