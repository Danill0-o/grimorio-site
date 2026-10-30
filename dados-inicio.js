class DadosExame {
    constructor(nomeExame, minutosPorDia, diasAteAProva, dataInicioF, dataFinalF, listaDiaDaSemana, carga_horaria_disponivel, diasEstudoPraProva, horasPorDia, materiasPorDia, estudoPorBloco) {
      this.nomeExame = nomeExame;
      this.minutosPorDia = minutosPorDia;
      this.diasAteAProva = diasAteAProva;
      this.dataInicioF = dataInicioF;
      this.dataFinalF = dataFinalF;
      this.listaDiaDaSemana = listaDiaDaSemana;
      this.carga_horaria_disponivel = carga_horaria_disponivel;
      this.diasEstudoPraProva = diasEstudoPraProva;
      this.horasPorDia = horasPorDia;
      this.materiasPorDia = materiasPorDia;
      this.estudoPorBloco = estudoPorBloco;
    }
  };

let carga_horaria_disponivel;
let lista_distribuicao_materias = [];
let listaDiaDaSemana = [];

function converterHorasParaMinutos(horas) { // converte as horas no formato 00:00 para minutos
    if (!horas || !horas.includes(':')) return 0;
    // Divide as horas e minutos
    const partes = horas.split(':');

    // Converte para minutos
    const minutos = parseInt(partes[0]) * 60 + parseInt(partes[1]);

    return minutos;
};
function converterMinutosParaHoras(minutos){ //converte os minutos para o formato 00:00
    if (!Number.isFinite(Number(minutos))) return '00:00';
    minutos = Number(minutos);
    const minutosSemDecimal = Math.floor(minutos)
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutosSemDecimal % 60;

    // Formata o resultado
    const horasFormatadas = horas < 10 ? '0' + horas : horas;
    const minutosFormatados = minutosRestantes < 10 ? '0' + minutosRestantes : minutosRestantes;

    return `${horasFormatadas}:${minutosFormatados}`;
}
function distribui_materias(){
    const dados = lerObjetoArmazenado('dadosExame');
    if (dados?.distribuicaoVersao === 2 || dados?.distribuicaoVersao === 3) {
        const normalizadas = lerArrayArmazenado('objetosNormalizados');
        const cap = dados.distribuicaoVersao === 3 ? window.PraticasStore?.planejarProjeto?.(dados, normalizadas) : null;
        lista_distribuicao_materias = window.DistribuicaoEstudos.gerar(cap ? cap.dadosDistribuicao : dados, normalizadas).distribuicaoMaterias;
        (window.ProjetoStorage || localStorage).setItem('lista_distribuicao_materias', JSON.stringify(lista_distribuicao_materias));
        return lista_distribuicao_materias;
    }
    carga_horaria_disponivel = JSON.parse((window.ProjetoStorage || localStorage).getItem('carga_horaria_disponivel'));
    const objetosCopia = lerArrayArmazenado('objetosNormalizados');
    lista_distribuicao_materias = [];
    for (let i = 0; i < objetosCopia.length; i++){
        const distribuicao_proporcional = (objetosCopia[i].questoesEmPorcentagem * Number(carga_horaria_disponivel || 0))/100
        const array_de_materias_proporcionais = {
            Materia: objetosCopia[i].Materia,
            projetoMateriaId: objetosCopia[i].projetoMateriaId,
            Materia_distribuida: distribuicao_proporcional
        }
        lista_distribuicao_materias.push(array_de_materias_proporcionais)
    };
    (window.ProjetoStorage || localStorage).setItem('lista_distribuicao_materias', JSON.stringify(lista_distribuicao_materias));
    console.log(lista_distribuicao_materias, "teste em dados")
    return lista_distribuicao_materias;
};

function atualizarResumoPlanejamento() {
    const nomeProjeto = document.getElementById('nome-projeto-resumo');
    const cargaHoraria = document.getElementById('carga-horaria-resumo');
    if (!nomeProjeto || !cargaHoraria) return;

    const dadosExame = lerObjetoArmazenado('dadosExame');
    const cargaEmMinutos = Number((window.ProjetoStorage || localStorage).getItem('carga_horaria_disponivel'));
    nomeProjeto.textContent = dadosExame && dadosExame.nomeExame ? dadosExame.nomeExame : 'Não informado';
    cargaHoraria.textContent = Number.isFinite(cargaEmMinutos) && cargaEmMinutos > 0
        ? `${converterMinutosParaHoras(cargaEmMinutos)} horas`
        : 'Não informada';
}
function formatarData(data) { //transforma a data do formato AAAA-MM-DD para DD/MM/AAAA
    return new Date(data).toLocaleDateString('pt-BR');
};
function converterDataBrasileiraParaISO(data) {
    if (typeof data !== 'string') return '';
    const partes = data.split('/');
    if (partes.length !== 3 || partes.some((parte) => !parte)) return '';
    return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
}

function lerArrayArmazenado(chave) {
    try {
        const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
        return Array.isArray(valor) ? valor : [];
    } catch (erro) {
        return [];
    }
}

function lerObjetoArmazenado(chave) {
    try {
        const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
        return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
    } catch (erro) {
        return null;
    }
}

function quantosDiasTem(dataInicio, dataFinal, listaDiaDaSemana){ //conta os dias da semana da data do início até a data final
    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    const objetoDiasSemana = {
        Dom:0,
        Seg:0,
        Ter:0,
        Qua:0,
        Qui:0,
        Sex:0,
        Sab:0
    };
    while (dataInicio <= dataFinal){
       const numeroDiaSemana = dataInicio.getDay();
       const nomeDS = diasSemana[numeroDiaSemana]
       objetoDiasSemana[nomeDS]++;
       dataInicio.setDate(dataInicio.getDate() + 1);

    };
    let soma = 0;
    for (let chave in objetoDiasSemana) {
        soma += objetoDiasSemana[chave];
    }
    let contagem = 0;
    for (let i = 0; i < listaDiaDaSemana.length; i++) {
      const dia = listaDiaDaSemana[i];
      contagem += objetoDiasSemana[dia] || 0;
    }
    console.log(soma, objetoDiasSemana, contagem, "teste em qtsdiastem")
    return contagem;
};


//const dataInicioZ = new Date('2024-01-07T12:00:00Z');
//const dataFinalZ = new Date("2024-01-31T12:00:00Z");
//const data = dataFinalZ - dataInicioZ
//const dataTesteDia = dataInicioZ.getDate()
//dataInicioZ.setDate(dataInicioZ.getDate() + 0);

//console.log(dataInicioZ.toISOString());
//const dataTeste2 = dataInicio.setDate(dataInicio.getDate() + 1);
//const dataTeste2 = 
//dataInicioZ.setDate(dataInicioZ +1);
//const diasAteAProva = Math.floor(dataTeste2 / (1000 * 60 * 60 * 24));

//const dataTeste = new Date(data)
//console.log(dataTesteDia,dataInicioZ,"inicioZ",dataFinalZ, "teste data")
//dataInicioZ.getDay()
//let day = diasSemana[dataInicioZ.getDay()];
//console.log(day)

