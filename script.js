var hoveredDatasetIndex = -1;
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.href.includes('pesomateria.html')) {
        const ctx = document.getElementById('graficoPizza');
        
        const { nomeMaterias, valoresMaterias } = getDataToChart();
        if (!ctx || !nomeMaterias.length || typeof Chart === 'undefined') return;
        new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: nomeMaterias,
            datasets: [{
            label: 'Peso real',
            data: valoresMaterias,
            backgroundColor: ['#356b5c', '#b58a45', '#7c4c39', '#6a7861', '#a97b62', '#717b84', '#8a7543'],
            borderColor: '#e5cf9d',
            borderWidth: 3,
            hoverOffset: 12
            }]
        },
        options: {
            animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
            plugins: {
                title:{
                    display: true,
                    text:"Peso real de cada matéria",
                    color: '#513c21',
                    font: { family: 'Georgia', size: 16 }
                },

              legend: {
                labels: {
                    usePointStyle: true,
                    color: '#513c21'
                },
                position: 'bottom',
                responsive: true,
            }
          }
        }});
    }
});

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
    const objetosArmazenados = lerArrayLocalStorage('objetosSalvos');
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
        const escolhida = globalId ? window.MateriasStore.resolverMateriaGlobal(globalId) : null;
        if (escolhida && escolhida.status !== 'ativa') throw new Error('Esta matéria não está mais disponível no catálogo.');
        const materia = escolhida?.nomeCanonico || document.getElementById("materia").value.trim();
        if (!materia) return;
        if (!escolhida && materia.length > 60) throw new Error('O nome da matéria deve ter no máximo 60 caracteres.');
        const Nquestoes = parseInt(document.getElementById("Nquestoes").value);
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
        document.getElementById("afinidade").value = "";
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
    botaoRemover.classList.add("border-0");
    botaoRemover.type = "button";
    botaoRemover.setAttribute("aria-label", "Excluir " + novaLinha.children[1].textContent);
    const iconeSVG = document.createElement("img");
    iconeSVG.src = "img/trash-10-24.ico";
    iconeSVG.alt = "X"; 
    // Adicione o ícone SVG ao botão
    botaoRemover.appendChild(iconeSVG);
    botaoRemover.addEventListener("click", async function() {
        if (!window.confirm(`Excluir matéria ${novaLinha.children[1].textContent} do planejamento? O histórico de estudo será preservado.`)) return;
        //trecho responsável por armazenar o valor de Nquestoes numa variável para exluí-la do campo "Total de questões:"
        const valorNquestoes = parseInt(novaLinha.querySelector("td[data-nquestoes]").dataset.nquestoes);
        questoesRemovidasDaLinha = valorNquestoes; //até aqui.
        //console.log(questoesRemovidasDaLinha, "NoN")
        //removeTotalQuestoes(questoesRemovidasDaLinha)
        totalQuestoes = objetosSalvos.reduce((total, objeto) => total + objeto.Nquestoes, 0);
        totalQuestoes -= questoesRemovidasDaLinha
        document.getElementById("totalQuestoes").value = totalQuestoes;
        const celulaIndice = novaLinha.querySelector(".indice-cell");
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

    for (const objeto of objetosCopia) {
        // Crie uma nova linha (<tr>) para cada objeto
        const novaLinha = document.createElement("tr");
        const celulaIndice = document.createElement("td");

        // Defina o índice sem formatação
        celulaIndice.textContent = indice;
        novaLinha.appendChild(celulaIndice);
        indice++;
        // Percorra as chaves do objeto
        for (const chave in objeto) {
            if (objeto.hasOwnProperty(chave) && chave !== "projetoMateriaId") {
                // Crie uma nova célula (<td>) para cada chave e atribua o valor
                const celula = document.createElement("td");
                celula.textContent = objeto[chave];
    
                // Adicione a célula à linha
                novaLinha.appendChild(celula);
            }
        }
       
        // Adicione a linha à tabela
        tabela.appendChild(novaLinha);
    }
    distribui_materias()
    sortMaterias();
    atualizarResumoPlanejamento();
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
function sortMaterias() {
    const materiasNormalizadas = lerArrayLocalStorage('objetosNormalizados');
    const dadosExame = lerObjetoLocalStorage('dadosExame');
    if (!materiasNormalizadas.length || !dadosExame) return false;

    if (dadosExame.distribuicaoVersao === 2 || dadosExame.distribuicaoVersao === 3) {
        const cap = dadosExame.distribuicaoVersao === 3 ? window.PraticasStore?.planejarProjeto?.(dadosExame, materiasNormalizadas) : null;
        const plano = window.DistribuicaoEstudos.gerar(cap ? cap.dadosDistribuicao : dadosExame, materiasNormalizadas);
        window.IdentidadeStore?.identificarPlano(plano.materiaDoDia);
        const revisoesDoDia = revisoes(Object.entries(plano.materiaDoDia).map(([dia, blocos]) => ({ [dia]: blocos })));
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

function revisoes(arrayObjetosDivisaoPorDia, dados = JSON.parse((window.ProjetoStorage || localStorage).getItem('dadosExame') || '{}')) {
    const revisoesDoDia = {};
    const plano = Object.assign({}, ...arrayObjetosDivisaoPorDia);
    const calendario = window.CalendarioJornada;
    const mapa = calendario.mapear(dados, arrayObjetosDivisaoPorDia.length);
    Object.keys(plano).forEach(dia => { revisoesDoDia[dia] = {revisao1:null,revisao2:null,revisao3:null}; });
    Object.entries(plano).forEach(([origem, blocos]) => {
        if (!mapa.porDia[origem] || !Array.isArray(blocos) || !blocos.length) return;
        calendario.projetarRevisoes(mapa.porDia[origem], dados).forEach(({etapa,data}) => {
            const destino = mapa.porData[data];
            if (!destino || !revisoesDoDia[destino]) return;
            const grupo = revisoesDoDia[destino][`revisao${etapa.slice(1)}`] ||= {};
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
