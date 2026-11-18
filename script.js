function formatarDuracaoPlanejamento(minutos) {
    const segundos = Math.max(0, Math.round((Number(minutos) || 0) * 60));
    const totalMin = Math.round(segundos / 60);
    if (segundos > 0 && totalMin === 0) return `${segundos}s`;
    const horas = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (horas > 0 && mins > 0) return `${horas}h${String(mins).padStart(2, '0')}min`;
    if (horas > 0) return `${horas}h`;
    return `${mins}min`;
}

function renderizarGraficoPlanejamento() {
    const container = document.getElementById('grafico-pesos-planejamento');
    if (!container || !window.GraficoRosca) return;
    const objetosNormalizados = lerArrayLocalStorage('objetosNormalizados');
    if (!objetosNormalizados.length) {
        const bloco = container.closest('.planejamento-grafico');
        if (bloco) bloco.hidden = true;
        return;
    }
    const distribuicao = lerArrayLocalStorage('lista_distribuicao_materias');
    const porId = new Map(distribuicao.map(item => [item.projetoMateriaId, Number(item.Materia_distribuida) || 0]));
    const porNome = new Map(distribuicao.map(item => [item.Materia, Number(item.Materia_distribuida) || 0]));
    const minutosPlano = new Map();
    Object.values(lerObjetoLocalStorage('materiaDoDia') || {}).forEach(blocos => {
        if (!Array.isArray(blocos)) return;
        blocos.forEach(bloco => {
            const chave = bloco.projetoMateriaId || bloco.materia;
            if (!chave) return;
            minutosPlano.set(chave, (minutosPlano.get(chave) || 0) + (Number(bloco.metaSegundos) || 0) / 60);
        });
    });

    const itens = objetosNormalizados.map(objeto => {
        const pesoPct = Number(String(objeto.questoesEmPorcentagem).replace(',', '.').replace('%', '')) || 0;
        const peso = Number(objeto.pesoQuestoes) || pesoPct;
        const minutos = porId.has(objeto.projetoMateriaId)
            ? porId.get(objeto.projetoMateriaId)
            : porNome.has(objeto.Materia)
                ? porNome.get(objeto.Materia)
                : (minutosPlano.get(objeto.projetoMateriaId) ?? minutosPlano.get(objeto.Materia) ?? 0);
        return {
            nome: objeto.Materia,
            valor: peso,
            minutos,
            valorTexto: formatarDuracaoPlanejamento(minutos)
        };
    });
    const totalMinutos = itens.reduce((soma, item) => soma + item.minutos, 0);
    window.GraficoRosca.renderizar(container, {
        titulo: 'Peso real de cada matéria',
        subtitulo: 'Tempo distribuído e participação proporcional de cada matéria no plano teórico',
        tituloTag: 'h2',
        ariaLabel: 'Proporção dos pesos reais e carga distribuída de cada matéria.',
        centroRotulo: 'Carga teórica',
        centroValor: formatarDuracaoPlanejamento(totalMinutos),
        itens
    });
    renderizarGraficoCargaPlanejamento(totalMinutos);
}

function renderizarGraficoCargaPlanejamento(totalMinutosTeoria) {
    const secao = document.getElementById('carga-diaria-previa');
    const alvo = document.getElementById('carga-diaria-grafico') || secao;
    if (!secao || !alvo || !window.GraficoRosca) return;
    const dadosExame = lerObjetoLocalStorage('dadosExame');
    const materiaDoDia = lerObjetoLocalStorage('materiaDoDia') || {};
    if (!dadosExame) {
        secao.hidden = true;
        alvo.replaceChildren();
        return;
    }

    let teoriaSegundos = 0;
    const blocos = Object.values(materiaDoDia).flat();
    if (blocos.some(b => Number.isFinite(Number(b?.metaSegundos)))) {
        teoriaSegundos = blocos.reduce((soma, b) => soma + (Number(b?.metaSegundos) || 0), 0);
    } else {
        teoriaSegundos = Math.round((Number(totalMinutosTeoria) || 0) * 60);
    }

    let revisoesSegundos = 0;
    if (dadosExame.cargaDiaria?.incluirRevisoes && Array.isArray(dadosExame.cargaDiariaPlano?.grupos)) {
        for (const grupo of dadosExame.cargaDiariaPlano.grupos) {
            if (grupo?.estado !== 'reservada') continue;
            const itens = Array.isArray(grupo.itens) ? grupo.itens : [];
            const duracaoGrupo = Number(grupo.duracaoSegundos);
            revisoesSegundos += Number.isFinite(duracaoGrupo)
                ? duracaoGrupo
                : itens.reduce((s, it) => s + (Number(it?.duracaoSegundos) || 0), 0);
        }
    }

    let missoes = Array.isArray(dadosExame.cargaDiariaPlano?.praticas) ? dadosExame.cargaDiariaPlano.praticas : [];
    try {
        const proj = window.PraticasStore?.projetarMissoesProjeto?.(dadosExame.projetoId, { dados: dadosExame, materiaDoDia });
        if (Array.isArray(proj?.missoes)) missoes = proj.missoes;
    } catch (_) {}

    let datasEstudo = new Set();
    try {
        const mapa = window.CalendarioJornada?.mapear?.(dadosExame, Object.keys(materiaDoDia).length);
        if (mapa?.porDia) datasEstudo = new Set(Object.values(mapa.porDia));
    } catch (_) {}

    let praticasNaCargaSegundos = 0;
    let praticasExtrasSegundos = 0;
    for (const m of missoes) {
        if (!m || m.extraAvulsa || m.duracaoPlanejadaSegundos == null) continue;
        const dur = Math.max(0, Number(m.duracaoPlanejadaSegundos) || 0);
        if (m.consomeCargaEstudo && (!datasEstudo.size || datasEstudo.has(m.dataPrevista))) {
            praticasNaCargaSegundos += dur;
        } else {
            praticasExtrasSegundos += dur;
        }
    }

    const praticasTotalSegundos = praticasNaCargaSegundos + praticasExtrasSegundos;
    const totalGeralSegundos = teoriaSegundos + revisoesSegundos + praticasTotalSegundos;
    const subtextoPraticas = praticasNaCargaSegundos > 0 && praticasExtrasSegundos > 0
        ? `${formatarDuracaoPlanejamento(praticasNaCargaSegundos / 60)} no tempo diário · ${formatarDuracaoPlanejamento(praticasExtrasSegundos / 60)} adicionais`
        : praticasExtrasSegundos > 0 ? 'Adicionais ao tempo diário' : '';

    window.GraficoRosca.renderizar(alvo, {
        titulo: 'Distribuição da carga horária',
        subtitulo: 'Tempo planejado no período entre teoria, revisões e atividades práticas',
        tituloTag: 'h2',
        tituloId: 'carga-diaria-grafico-titulo',
        ariaLabel: 'Distribuição da carga horária entre teoria, revisões e atividades práticas.',
        centroRotulo: 'Total planejado',
        centroValor: formatarDuracaoPlanejamento(totalGeralSegundos / 60),
        vazio: 'Sem carga horária prevista para exibir no gráfico.',
        itens: [
            {
                nome: 'Teoria',
                valor: teoriaSegundos,
                valorTexto: formatarDuracaoPlanejamento(teoriaSegundos / 60),
                cor: 'var(--rosca-cor-teoria, var(--pixel-emerald))'
            },
            {
                nome: 'Revisões',
                valor: revisoesSegundos,
                valorTexto: formatarDuracaoPlanejamento(revisoesSegundos / 60),
                cor: 'var(--pixel-mana)'
            },
            {
                nome: 'Atividades práticas',
                valor: praticasTotalSegundos,
                valorTexto: formatarDuracaoPlanejamento(praticasTotalSegundos / 60),
                cor: 'var(--pixel-xp)',
                subtexto: subtextoPraticas
            }
        ]
    });
    secao.hidden = false;
}

class conteudoProgramatico {
    constructor(materia, Nquestoes, peso, afinidade) {
        this.materia = materia;
        this.Nquestoes = Nquestoes;
        this.peso = peso;
        this.afinidade = afinidade;
    }
    res() {
        console.log(`Matéria: ${this.materia} \n Nº de questões: ${this.Nquestoes} \n Peso: ${this.peso} \n Afinidade: ${this.afinidade}`);
    }
};

if (document.getElementById('cadastroForm') !== null) {
    document.getElementById("table-body").addEventListener("input", escondeBtn);
    window.addEventListener("load", escondeBtn);
};
document.addEventListener('DOMContentLoaded', function() {
    const objetosArmazenados = lerArrayLocalStorage('objetosSalvos').filter(m => {
        if (!document.getElementById('cadastroForm') || !window.MateriasStore) return true;
        const p = window.MateriasStore.obterProjetoMateria(m.projetoMateriaId, window.ProjetosStore.idAtual());
        return window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).status !== 'excluida';
    });
    objetosSalvos = objetosArmazenados;
    if (document.getElementById('cadastroForm') !== null) {
        restaurarMateriasSalvas(objetosArmazenados);
        atualizarCatalogoMaterias();
        atualizarAtalhoPlanejamento();
    }
    if (window.location.href.includes('pesomateria.html')) {
        copiaParaPesoMateria();
    }
});

let indice = 1;
const listaPesoQuestoes = [];
let objetosSalvos = [];
let objetosNormalizados = [];
let totalQuestoes = 0;
let questoesRemovidasDaLinha = 0;
let restaurandoMaterias = false;
function atualizarCatalogoMaterias() {
    const select = document.getElementById('materia-catalogo');
    if (!select) return;
    const selecionada = select.value;
    const usadas = new Set(window.MateriasStore.listarProjetosMaterias(window.ProjetosStore.idAtual())
        .filter(p => !p.removida).map(p => window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).materiaGlobalId));
    select.replaceChildren(new Option('Criar nova matéria', ''));
    for (const m of window.MateriasStore.listarMateriasGlobais()) {
        const option = new Option(m.nomeCanonico + (usadas.has(m.materiaGlobalId) ? ' — já adicionada' : ''), m.materiaGlobalId);
        option.disabled = usadas.has(m.materiaGlobalId);
        select.appendChild(option);
    }
    if ([...select.options].some(o => o.value === selecionada && !o.disabled)) select.value = selecionada;
    document.getElementById('materia').readOnly = Boolean(select.value);
    window.dispatchEvent(new CustomEvent('catalogo:atualizado'));
}
document.getElementById('materia-catalogo')?.addEventListener('change', function () {
    const input = document.getElementById('materia');
    input.value = this.value ? window.MateriasStore.resolverMateriaGlobal(this.value).nomeCanonico : '';
    input.readOnly = Boolean(this.value);
});
window.addEventListener('storage', event => {
    if (event.key === 'materiasDominioV1') atualizarCatalogoMaterias();
});
if (document.getElementById('cadastroForm') !== null) {
    document.getElementById("btnSalvar")?.addEventListener("click", salvarObjetos);
    document.getElementById("cadastroForm").addEventListener("submit", async function(event){
        event.preventDefault();
        if (this.dataset.salvando) return;
        this.dataset.salvando = 'true';
        let adicionada;
        try {
        const globalId = document.getElementById('materia-catalogo')?.value;
        const nomeDigitado = document.getElementById('materia').value.trim();
        const nomeNormalizado = window.MateriasStore.normalizarNome(nomeDigitado);
        const materiasRemovidas = globalId ? [] : window.MateriasStore.listarProjetosMaterias(window.ProjetosStore.idAtual())
            .filter(participacao => participacao.removida)
            .map(participacao => window.MateriasStore.resolverMateriaGlobal(participacao.materiaGlobalId));
        const escolhida = globalId ? window.MateriasStore.resolverMateriaGlobal(globalId)
            : materiasRemovidas.find(materia => materia.status === 'ativa' && materia.nomeNormalizado === nomeNormalizado);
        if (escolhida && escolhida.status !== 'ativa') throw new Error('Esta matéria não está mais disponível no catálogo.');
        const materia = escolhida?.nomeCanonico || nomeDigitado;
        if (!materia) return;
        if (!escolhida && materia.length > 60) throw new Error('O nome da matéria deve ter no máximo 60 caracteres.');
        const Nquestoes = parseInt(document.getElementById("Nquestoes").value, 10);
        if (!Number.isInteger(Nquestoes) || Nquestoes < 1) throw new Error('A matéria deve ter pelo menos 1 questão.');
        const peso = parseFloat(document.getElementById("peso").value);
        const afinidade = document.getElementById("afinidade").value;
        totalQuestoes += Nquestoes;
        const Materia = escolhida ? materia : capitalize(materia)
        // Após modificar o valor de totalQuestoes2 dentro do evento de envio do formulário
        document.getElementById("totalQuestoes").value = totalQuestoes;

        const dados = {
            materia: Materia,
            Nquestoes: Nquestoes,
            peso: peso,
            afinidade: afinidade
        };
        if (escolhida) dados.materiaGlobalId = escolhida.materiaGlobalId;
        addMateriaTable(Materia, Nquestoes, peso, afinidade, dados);
        adicionada = document.getElementById('table-body').lastElementChild;
        await salvarObjetos();
    
        document.getElementById("materia").value = "";
        document.getElementById("Nquestoes").value = "";
        document.getElementById("peso").value = 1;
        document.getElementById("afinidade").value = "1";
        document.getElementById("afinidade").dispatchEvent(new Event("input"));
        document.getElementById('materia-catalogo').value = '';
        document.getElementById('materia').readOnly = false;
        document.getElementById('wizard-erro').textContent = '';
        indice++;
        } catch (erro) {
            // Falha de criação não deixa linha sem identidade persistida na tabela.
            if (adicionada) {
                try { window.MateriasStore.obterProjetoMateria(adicionada.dataset.projetoMateriaId); }
                catch (_) { adicionada.remove(); }
            }
            totalQuestoes = [...document.querySelectorAll('#table-body tr')].reduce((s, linha) => s + Number(linha.children[2].textContent), 0);
            document.getElementById('totalQuestoes').value = totalQuestoes;
            document.getElementById('wizard-erro').textContent = /nome normalizado/.test(erro.message)
                ? 'Esta matéria já existe no seu catálogo. Escolha-a na lista para reutilizá-la.'
                : /participação ativa duplicada/.test(erro.message) ? 'Esta matéria já está neste projeto.' : erro.message;
        }
        finally { delete this.dataset.salvando; atualizarCatalogoMaterias(); }
    });
};
function addMateriaTable(Materia, Nquestoes, peso, afinidade, dados) {
    if (dados.afinidade == 0.5) {
        dados.afinidade = "Baixa";
    } else if (dados.afinidade == 1.0) {
        dados.afinidade = "Média";
    } else if (dados.afinidade == 1.5) {
        dados.afinidade = "Alta";
    };
    if (dados.peso == 0) {
        dados.peso = 1;
    };
    const tabela = document.getElementById("table-body");
    // Crie uma nova linha (<tr>)
    const novaLinha = document.createElement("tr");
    novaLinha.dataset.projetoMateriaId = dados.projetoMateriaId || `projeto-materia-${crypto.randomUUID()}`;
    if (!dados.projetoMateriaId) novaLinha.dataset.materiaGlobalId = dados.materiaGlobalId || `materia-global-${crypto.randomUUID()}`;
    const celulaIndice = document.createElement("td");
    // Defina o índice sem formatação
    celulaIndice.textContent = indice;
    celulaIndice.classList.add("indice-cell");
    novaLinha.appendChild(celulaIndice);
    // Itere sobre as variáveis em "dados"
    for (const chave in dados) {
        if (dados.hasOwnProperty(chave) && !['projetoMateriaId', 'materiaGlobalId'].includes(chave)) {
            // Crie uma nova célula (<td>) para cada variável
            const celula = document.createElement("td");
            // Insira o valor da variável na célula
            celula.textContent = dados[chave];
            
            if (chave === "Nquestoes") {
                celula.dataset.nquestoes = dados[chave];
            };

            // Adicione a célula à linha
            novaLinha.appendChild(celula);
        }
    }
    
    // Adicione a linha à tabela
    tabela.appendChild(novaLinha);
    removerLinhaTabela(tabela, novaLinha);
    mostrarBotaoSalvar();
    (window.ProjetoStorage || localStorage).setItem('totalQuestoes', JSON.stringify(totalQuestoes));
};

function restaurarMateriasSalvas(materiasSalvas) {
    const tabela = document.getElementById("table-body");
    if (!tabela || tabela.children.length || !materiasSalvas.length) return;

    totalQuestoes = materiasSalvas.reduce((total, objeto) => total + Number(objeto.Nquestoes || 0), 0);
    restaurandoMaterias = true;

    materiasSalvas.forEach((objeto) => {
        const dados = {
            materia: objeto.Materia,
            projetoMateriaId: objeto.projetoMateriaId,
            Nquestoes: Number(objeto.Nquestoes),
            peso: Number(objeto.peso),
            afinidade: Number(objeto.afinidade)
        };
        addMateriaTable(dados.materia, dados.Nquestoes, dados.peso, dados.afinidade, dados);
        indice++;
    });

    restaurandoMaterias = false;
    document.getElementById("totalQuestoes").value = totalQuestoes;
    normalizaQuestoes(objetosSalvos);
}

function removerLinhaTabela(tabela, novaLinha) { // Add um botão que remove a linha da tabela
    // const novaLinha = document.createElement("tr");
    const celulaRemover = document.createElement("td");
    const botaoRemover = document.createElement("button");
    botaoRemover.classList.add("materia-excluir-icone");
    botaoRemover.type = "button";
    const nomeMateria = novaLinha.children[1].textContent;
    botaoRemover.setAttribute("aria-label", "Excluir " + nomeMateria);
    botaoRemover.appendChild(window.IconesPixel.criar("excluir"));

    async function executarExclusaoLinha() {
        //trecho responsável por armazenar o valor de Nquestoes numa variável para exluí-la do campo "Total de questões:"
        const valorNquestoes = parseInt(novaLinha.querySelector("td[data-nquestoes]").dataset.nquestoes, 10) || 0;
        questoesRemovidasDaLinha = valorNquestoes; //até aqui.
        totalQuestoes = objetosSalvos.reduce((total, objeto) => total + objeto.Nquestoes, 0);
        totalQuestoes -= questoesRemovidasDaLinha;
        document.getElementById("totalQuestoes").value = totalQuestoes;
        // Remova a linha correspondente quando o botão for clicado
        tabela.removeChild(novaLinha);
        try { await salvarObjetos(); } catch (erro) { document.getElementById('wizard-erro').textContent = erro.message; }
        // Atualiza os números de índice nas células restantes
        const todasLinhas = tabela.querySelectorAll("tr");
        todasLinhas.forEach((linha, index) => {
            const celulaIndice = linha.querySelector(".indice-cell");
            if (celulaIndice) {
                celulaIndice.textContent = index + 1; // Atualiza o número de índice
            }
        });
        indice--;
        (tabela.querySelector('button') || document.getElementById('materia'))?.focus();
    }

    botaoRemover.addEventListener("click", function() {
        const dialog = document.getElementById('wizard-remover-materia-dialog');
        if (!dialog) {
            window.Dialogos.confirmar({ titulo: 'Excluir matéria do planejamento?', mensagem: 'Excluir '+nomeMateria+'? O histórico de estudo será preservado.', confirmar: 'Excluir matéria', acao: executarExclusaoLinha });
            return;
        }
        const nomeEl = document.getElementById('wizard-remover-nome');
        if (nomeEl) nomeEl.textContent = `"${nomeMateria}"`;
        const btnConfirmar = dialog.querySelector('[data-confirmar]');
        const btnsCancelar = dialog.querySelectorAll('[data-cancelar]');

        function fechar() {
            dialog.close();
            limpar();
            if (botaoRemover.isConnected) botaoRemover.focus();
            else (tabela.querySelector('button') || document.getElementById('materia'))?.focus();
        }

        async function onConfirmar() {
            dialog.close();
            limpar();
            await executarExclusaoLinha();
        }

        function onCancel(e) {
            fechar();
        }

        function limpar() {
            btnConfirmar?.removeEventListener('click', onConfirmar);
            btnsCancelar.forEach(b => b.removeEventListener('click', fechar));
            dialog.removeEventListener('cancel', onCancel);
        }

        btnConfirmar?.addEventListener('click', onConfirmar, { once: true });
        btnsCancelar.forEach(b => b.addEventListener('click', fechar, { once: true }));
        dialog.addEventListener('cancel', onCancel, { once: true });

        dialog.showModal();
        const focoCancelar = dialog.querySelector('button[data-cancelar]:not(.pixel-fechar)') || btnsCancelar[0];
        focoCancelar?.focus();
    });
    // Adicione o botão "Remover" à célula da linha
    celulaRemover.appendChild(botaoRemover);
    novaLinha.appendChild(celulaRemover);
    
};

function copiaParaPesoMateria (){ //incompleta
    const objetosCopia = lerArrayLocalStorage('objetosNormalizados');
    const tabela = document.getElementById("table-body-peso");
    // Crie uma nova linha (<tr>)
    //const novaLinha = document.createElement("tr");
    
    if (!objetosCopia.length) {
        const aviso = document.getElementById('planejamento-vazio');
        if (aviso) aviso.classList.remove('d-none');
        atualizarResumoPlanejamento();
        return;
    }

    if (tabela) {
        for (const objeto of objetosCopia) {
            const novaLinha = document.createElement("tr");
            const celulaIndice = document.createElement("td");
            celulaIndice.textContent = indice;
            novaLinha.appendChild(celulaIndice);
            indice++;
            for (const chave in objeto) {
                if (objeto.hasOwnProperty(chave) && chave !== "projetoMateriaId") {
                    const celula = document.createElement("td");
                    celula.textContent = objeto[chave];
                    novaLinha.appendChild(celula);
                }
            }
            tabela.appendChild(novaLinha);
        }
    }
    distribui_materias()
    sortMaterias();
    atualizarResumoPlanejamento();
    renderizarGraficoPlanejamento();
};
function fillTotalQuestoes() {
    totalQuestoes = objetosSalvos.reduce((total, objeto) => total + objeto.Nquestoes, 0);
    if (document.getElementById('cadastroForm') !== null) {
        if ((window.ProjetoStorage || localStorage).length === 0){
            document.getElementById("totalQuestoes").value = 0
        }else {
            document.getElementById("totalQuestoes").value = totalQuestoes; // tem que alterar pra so mostrar quando tiver objetos na tabela
    }};
};
async function salvarObjetos() {
    window.cadastroSalvando = (window.cadastroSalvando || 0) + 1;
    try {
    const entradas = [];
    let afinidadeEmFloat = ''
    const tabela = document.getElementById("table-body");
    const linhas = tabela.querySelectorAll("tr");

    linhas.forEach((linha) => {
        const celulas = linha.querySelectorAll("td");
        if (celulas[4].textContent == "Baixa") {
            afinidadeEmFloat = 0.5;
        } else if (celulas[4].textContent == "Média") {
            afinidadeEmFloat = 1.0;
        } else if (celulas[4].textContent == "Alta") {
            afinidadeEmFloat = 1.5;
        };
        const objeto = {
            Materia: celulas[1].textContent,
            projetoMateriaId: linha.dataset.projetoMateriaId,
            ...(linha.dataset.materiaGlobalId ? { materiaGlobalId: linha.dataset.materiaGlobalId } : {}),
            Nquestoes: parseInt(celulas[2].textContent), 
            peso: parseFloat(celulas[3].textContent), 
            afinidade: afinidadeEmFloat, 
        };
        linha.dataset.projetoMateriaId = objeto.projetoMateriaId || "";
        entradas.push(objeto);
    });
    objetosSalvos = await window.MateriasStore.salvarCadastro(window.ProjetosStore.idAtual(), entradas);
    document.querySelectorAll('#table-body tr').forEach(linha => { delete linha.dataset.materiaGlobalId; });
    (window.ProjetoStorage || localStorage).setItem('objetosSalvos', JSON.stringify(objetosSalvos));
    totalQuestoes = objetosSalvos.reduce((total, objeto) => total + objeto.Nquestoes, 0);
    document.getElementById('totalQuestoes').value = totalQuestoes;
    (window.ProjetoStorage || localStorage).setItem('totalQuestoes', JSON.stringify(totalQuestoes));
    
    
    normalizaQuestoes(objetosSalvos);
    sortMaterias();
    atualizarAtalhoPlanejamento();
    atualizarCatalogoMaterias();
    } finally { window.cadastroSalvando--; }
};
function normalizaQuestoes(objetosSalvos) {
    objetosNormalizados = [];
    somaDasQuestoesNormalizadas = 0;
    porcentagemQuestoesNormalizadas = 0;
    for (let i = 0; i < objetosSalvos.length; i++){
        const objetoQuestao = {
            Materia: objetosSalvos[i].Materia,
            Nquestoes: objetosSalvos[i].Nquestoes,
            peso: objetosSalvos[i].peso,
            afinidade: objetosSalvos[i].afinidade,
        };
        if (objetoQuestao.afinidade == 0.5) {
            pesoQuestoes = Math.ceil(objetoQuestao.Nquestoes * objetoQuestao.peso + objetoQuestao.Nquestoes * objetoQuestao.afinidade);
        } else if (objetoQuestao.afinidade == 1.5) {
            pesoQuestoes = Math.ceil(objetoQuestao.Nquestoes * objetoQuestao.peso - objetoQuestao.Nquestoes / 2);
        } else {
            pesoQuestoes = Math.ceil(objetoQuestao.Nquestoes * objetoQuestao.peso);
        }
        const objetoQuestaoNormalizado = {
            Materia: objetoQuestao.Materia,
            projetoMateriaId: objetosSalvos[i].projetoMateriaId,
            pesoQuestoes: pesoQuestoes,
            questoesEmPorcentagem: pesoQuestoes,        
        };
        somaDasQuestoesNormalizadas += pesoQuestoes
        objetosNormalizados.push(objetoQuestaoNormalizado)
    };
    for (let i = 0; i < objetosNormalizados.length; i++){ // Precisa alterar as casas decimais para a separação por vírgula!
        porcentagemQuestoesNormalizadas = objetosNormalizados[i].pesoQuestoes/somaDasQuestoesNormalizadas;
        porcentagemQuestoesNormalizadas = 100 * porcentagemQuestoesNormalizadas;
        porcentagemQuestoesNormalizadas = porcentagemQuestoesNormalizadas.toFixed(1);
        objetosNormalizados[i].questoesEmPorcentagem = porcentagemQuestoesNormalizadas;
    }
    objetosNormalizados.sort((a, b) => b.pesoQuestoes - a.pesoQuestoes );
    (window.ProjetoStorage || localStorage).setItem('objetosNormalizados', JSON.stringify(objetosNormalizados));
    (window.ProjetoStorage || localStorage).setItem('somaDasQuestoesNormalizadas', JSON.stringify(somaDasQuestoesNormalizadas));

};
function escondeBtn() {
    const checaTable = document.getElementById("table-body");
    const btnSalvar = document.getElementById("btnSalvar");
    if (!btnSalvar) return;
    if (!checaTable || checaTable.children.length === 0) { // Verifique se a tabela está vazia
        btnSalvar.style.display = "none";
    } else {
        btnSalvar.style.display = "block"; // Mostrar o botão se a tabela não estiver vazia
    }
};
function mostrarBotaoSalvar() {
    const checaTable = document.getElementById("table-body");
    const btnSalvar = document.getElementById("btnSalvar");
    if (!btnSalvar) return;
    
    if (checaTable && checaTable.childElementCount > 0) {
        btnSalvar.style.display = "block"; 
    } else {
        btnSalvar.style.display = "none";
    }
};
function getDataToChart() {
    const objetosNormalizados = lerArrayLocalStorage('objetosNormalizados');
    const nomeMaterias = objetosNormalizados.map((nome) => {
        return nome.Materia
    });
    // const valoresMaterias = objetosNormalizados.map((valores) => {
    //     return valores.pesoQuestoes // Informa o pesa da matéria em número absoluto para o gráfico
    const valoresMaterias = objetosNormalizados.map((valores) => {
        return valores.questoesEmPorcentagem // informa o peso da matéria em porcentagem para o gráfico
    });
    return { nomeMaterias, valoresMaterias };
}

function atualizarAtalhoPlanejamento() {
    const atalho = document.getElementById('atalho-planejamento');
    const possuiPlanejamento = !(window.ProjetoStorage || localStorage).getItem('wizardProjeto') && lerArrayLocalStorage('objetosNormalizados').length > 0;
    if (atalho) {
        atalho.classList.toggle('disabled', !possuiPlanejamento);
        atalho.setAttribute('aria-disabled', String(!possuiPlanejamento));
        atalho.title = possuiPlanejamento ? 'Abrir planejamento salvo' : 'Adicione e salve ao menos uma matéria';
    }

    const atalhoJornada = document.getElementById('atalho-jornada');
    if (atalhoJornada) {
        const jornadaDisponivel = possuiPlanejamento && Boolean(lerObjetoLocalStorage('dadosExame'));
        atalhoJornada.classList.toggle('disabled', !jornadaDisponivel);
        atalhoJornada.setAttribute('aria-disabled', String(!jornadaDisponivel));
        atalhoJornada.title = jornadaDisponivel
            ? 'Abrir jornada de estudos'
            : 'Salve o projeto e as matérias para iniciar a jornada';
    }
}

function lerArrayLocalStorage(chave) {
    if (chave === 'objetosSalvos') {
        const projetoId = window.ProjetosStore?.idAtual();
        if (!projetoId) return [];
        const antigos = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave) || '[]');
        if (antigos.some(m => !m.projetoMateriaId)) throw new Error('Dados de desenvolvimento anteriores ao domínio de matérias. Faça backup e reset explícito; identidade não será inferida por nome.');
        return window.MateriasStore.listarProjetosMaterias(projetoId).filter(p => !p.removida).map(p => ({
            Materia: p.nomeExibicao ?? window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).nomeCanonico,
            projetoMateriaId: p.projetoMateriaId, Nquestoes: p.Nquestoes, peso: p.peso, afinidade: p.afinidade
        }));
    }
    try {
        const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
        return Array.isArray(valor) ? valor : [];
    } catch (erro) {
        return [];
    }
}
function capitalize(materia) {
    // Obtenha a primeira letra da string e converta-a em maiúscula
    var minuscula = materia.toLowerCase();
    var primeira_letra = minuscula.slice(0, 1).toUpperCase();
    
    // Concatene a primeira letra com o restante da string (a partir do segundo caractere)
    var Materia = primeira_letra + minuscula.slice(1);
    return Materia;
};

/*
 * Lógica legada de distribuição da agenda.
 *
 * Esta rotina existia na versão anterior do projeto e gera os contratos
 * `materiaDoDia` e `revisoesDoDia` no (window.ProjetoStorage || localStorage). Ela permanece separada
 * da visualização atual para poder ser evoluída futuramente sem alterar o
 * cálculo de pesos e a tabela do planejamento.
 */
function sortMaterias({ reconstruir = false, cargaPlanejada = null } = {}) {
    const materiasNormalizadas = lerArrayLocalStorage('objetosNormalizados');
    const dadosExame = lerObjetoLocalStorage('dadosExame');
    if (!materiasNormalizadas.length || !dadosExame) return false;
    const reorganizado = !reconstruir && window.ProjetosStore?.temReagendamentoAtivo?.(dadosExame);
    const editando = !reconstruir && window.location?.pathname?.endsWith('/index.html')
        && lerObjetoLocalStorage('wizardProjeto')?.origemReplanejamento;
    if (!reconstruir && (dadosExame.cargaDiariaVersao === 1 || editando || reorganizado || window.MateriasStore?.projetoTemFusao?.(dadosExame.projetoId))) {
        const materiaDoDia = lerObjetoLocalStorage('materiaDoDia');
        if (materiaDoDia && (reorganizado || Object.keys(materiaDoDia).length)) return { materiaDoDia, revisoesDoDia: lerObjetoLocalStorage('revisoesDoDia') || {} };
        if (reorganizado) throw new Error('Plano base do reagendamento indisponível');
        if (dadosExame.cargaDiariaVersao === 1) throw new Error('Plano integrado de carga diária indisponível.');
    }

    if (dadosExame.distribuicaoVersao === 2 || dadosExame.distribuicaoVersao === 3) {
        const dadosDistribuicao = cargaPlanejada
            ? window.RevisoesProjecao.dadosDistribuicao({ dados: dadosExame, ...cargaPlanejada })
            : dadosExame.distribuicaoVersao === 3
                ? window.PraticasStore?.planejarProjeto?.(dadosExame, materiasNormalizadas)?.dadosDistribuicao ?? dadosExame
                : dadosExame;
        const plano = window.DistribuicaoEstudos.gerar(dadosDistribuicao, materiasNormalizadas);
        window.IdentidadeStore?.identificarPlano(plano.materiaDoDia);
        const revisoesDoDia = cargaPlanejada
            ? confirmarCargaDiaria(dadosExame, plano.materiaDoDia, cargaPlanejada)
            : revisoes(Object.entries(plano.materiaDoDia).map(([dia, blocos]) => ({ [dia]: blocos })));
        (window.ProjetoStorage || localStorage).setItem('lista_distribuicao_materias', JSON.stringify(plano.distribuicaoMaterias));
        (window.ProjetoStorage || localStorage).setItem('materiaDoDia', JSON.stringify(plano.materiaDoDia));
        return { materiaDoDia: plano.materiaDoDia, revisoesDoDia };
    }

    const diasEstudo = Math.floor(Number(dadosExame.diasEstudoPraProva));
    const materiasPorDia = Math.max(1, Math.floor(Number(dadosExame.materiasPorDia) || 1));
    const minutosPorDia = Number(dadosExame.minutosPorDia);
    const estudoPorBloco = Number(dadosExame.estudoPorBloco) || minutosPorDia / materiasPorDia;
    const cargaHoraria = Number(dadosExame.carga_horaria_disponivel);

    if (
        !Number.isFinite(diasEstudo) || diasEstudo <= 0
        || !Number.isFinite(estudoPorBloco) || estudoPorBloco <= 0
        || !Number.isFinite(cargaHoraria) || cargaHoraria <= 0
    ) {
        return false;
    }

    const materias = materiasNormalizadas.map((materia) => {
        const porcentagem = Number(String(materia.questoesEmPorcentagem).replace(',', '.').replace('%', ''));
        const distribuicaoEmMinutos = (porcentagem * cargaHoraria) / 100;
        const quantidadeDeAparicoes = Math.max(1, distribuicaoEmMinutos / estudoPorBloco);
        const sortDecimal = quantidadeDeAparicoes / diasEstudo;

        return {
            Materia: materia.Materia,
            projetoMateriaId: materia.projetoMateriaId,
            distribuicao_ProporcionalEmMinutos: distribuicaoEmMinutos,
            qtsXAparecera: quantidadeDeAparicoes,
            sortDecimal: sortDecimal,
            divisorcomresto: sortDecimal
        };
    }).filter((materia) => materia.Materia && Number.isFinite(materia.sortDecimal));

    const todasMateriasPorDia = {};
    const arrayObjetosDivisaoPorDia = [];
    const arrayListaMateriasDistribuidas = [];
    let arrayMateriaDoDia = [];
    let chaveMateriaDoDia = 0;

    function salvarDia() {
        if (!arrayMateriaDoDia.length) return;
        chaveMateriaDoDia += 1;
        const chaveDia = `dia${chaveMateriaDoDia}`;
        arrayMateriaDoDia.sort((a, b) => a.materia.localeCompare(b.materia, 'pt-BR'));
        todasMateriasPorDia[chaveDia] = [...arrayMateriaDoDia];
        arrayObjetosDivisaoPorDia.push({ [chaveDia]: [...arrayMateriaDoDia] });
        arrayMateriaDoDia = [];
    }

    for (let dia = 1; dia <= diasEstudo; dia++) {
        materias.forEach((materia) => {
            if (materia.divisorcomresto < 1) {
                materia.divisorcomresto += materia.sortDecimal;
            }

            while (materia.divisorcomresto >= 1) {
                arrayListaMateriasDistribuidas.push(materia.Materia);
                materia.divisorcomresto -= 1;
                arrayMateriaDoDia.push({
                    materia: materia.Materia,
                    projetoMateriaId: materia.projetoMateriaId,
                    tempoEstudado: '',
                    topico: ''
                });

                if (arrayMateriaDoDia.length >= materiasPorDia) salvarDia();
            }
        });
    }

    salvarDia();
    window.IdentidadeStore?.identificarPlano(todasMateriasPorDia);
    const revisoesDoDia = revisoes(arrayObjetosDivisaoPorDia);
    (window.ProjetoStorage || localStorage).setItem('materiaDoDia', JSON.stringify(todasMateriasPorDia));
    console.log(
        arrayListaMateriasDistribuidas,
        'matérias distribuídas',
        todasMateriasPorDia,
        'revisoesDoDia',
        revisoesDoDia
    );
    return { materiaDoDia: todasMateriasPorDia, revisoesDoDia: revisoesDoDia };
}

function confirmarCargaDiaria(dados, materiaDoDia, { carga, projecao, missoes, politica }) {
    const storage = window.ProjetoStorage || localStorage;
    const calendario = window.CalendarioJornada;
    const mapa = calendario.mapear(dados, Object.keys(materiaDoDia).length);
    const porIdProvisorio = new Map();
    const revisoesDoDia = {};
    for (const [dia, blocos] of Object.entries(materiaDoDia)) {
        const data = mapa.porDia[dia];
        if (!data) throw new Error('Data da sessão teórica inválida.');
        revisoesDoDia[dia] = {};
        blocos.forEach((bloco, posicao) => {
            bloco.metaNominalSegundos = carga.duracaoNormalBlocoSegundos;
            porIdProvisorio.set(window.RevisoesProjecao.idOrigem(data, posicao), bloco);
        });
    }

    function itemRevisao(bloco, chavePeriodo, duracaoSegundos) {
        return { id: JSON.stringify([dados.projetoId, bloco.blocoId, chavePeriodo]), blocoId: bloco.blocoId, duracaoSegundos };
    }
    let grupos = [];
    if (dados.cargaDiaria.incluirRevisoes && projecao.temReservaCapacidade) {
        grupos = projecao.grupos.map(grupo => ({
            ...grupo,
            itens: grupo.itens.map(item => {
                const bloco = porIdProvisorio.get(item.blocoId);
                if (!bloco?.blocoId) throw new Error('Origem da reserva de revisão inválida.');
                return itemRevisao(bloco, grupo.chavePeriodo, item.duracaoSegundos);
            })
        }));
    } else if (politica.ativadas) {
        for (const [dia, blocos] of Object.entries(materiaDoDia)) {
            if (!blocos.length) continue;
            const dataOrigem = mapa.porDia[dia];
            for (const { chavePeriodo, etapa, data } of calendario.projetarPeriodosRevisao(dataOrigem, dados, politica)) {
                const itens = blocos.map(bloco => itemRevisao(bloco, chavePeriodo, Math.round(bloco.metaNominalSegundos / 8)));
                grupos.push({ dataOrigem, chavePeriodo, etapa, dataNominal: data, dataOperacional: data, estado: 'reservada',
                    duracaoSegundos: itens.reduce((total, item) => total + item.duracaoSegundos, 0), itens });
            }
        }
    }
    for (const grupo of grupos) {
        if (grupo.estado !== 'reservada') continue;
        const origem = mapa.porData[grupo.dataOrigem], destino = mapa.porData[grupo.dataOperacional];
        if (!origem || !destino) throw new Error('Datas da reserva de revisão inválidas.');
        const ids = new Set(grupo.itens.map(item => item.blocoId));
        const blocos = materiaDoDia[origem].filter(bloco => ids.has(bloco.blocoId));
        (revisoesDoDia[destino][calendario.grupoRevisao(grupo.chavePeriodo)] ||= {})[origem] = blocos;
    }
    dados.cargaDiariaPlano = { grupos, praticas: missoes };
    storage.setItem('dadosExame', JSON.stringify(dados));
    storage.setItem('revisoesDoDia', JSON.stringify(revisoesDoDia));
    return revisoesDoDia;
}

function revisoes(arrayObjetosDivisaoPorDia, dados = JSON.parse((window.ProjetoStorage || localStorage).getItem('dadosExame') || '{}')) {
    const revisoesDoDia = {};
    const plano = Object.assign({}, ...arrayObjetosDivisaoPorDia);
    const calendario = window.CalendarioJornada;
    const mapa = calendario.mapear(dados, arrayObjetosDivisaoPorDia.length);
    Object.keys(plano).forEach(dia => {
        revisoesDoDia[dia] = dados.revisoesPolitica ? {} : {revisao1:null,revisao2:null,revisao3:null};
    });
    Object.entries(plano).forEach(([origem, blocos]) => {
        if (!mapa.porDia[origem] || !Array.isArray(blocos) || !blocos.length) return;
        calendario.projetarPeriodosRevisao(mapa.porDia[origem], dados).forEach(({ chavePeriodo, data }) => {
            const destino = mapa.porData[data];
            if (!destino || !revisoesDoDia[destino]) return;
            const grupo = revisoesDoDia[destino][calendario.grupoRevisao(chavePeriodo)] ||= {};
            grupo[origem] = blocos;
        });
    });

    (window.ProjetoStorage || localStorage).setItem('revisoesDoDia', JSON.stringify(revisoesDoDia));
    console.log(revisoesDoDia, 'revisões');
    return revisoesDoDia;
}

function lerObjetoLocalStorage(chave) {
    try {
        const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
        return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
    } catch (erro) {
        return null;
    }
}
