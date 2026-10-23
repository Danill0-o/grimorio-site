//carga_horaria_disponivel = JSON.parse((window.ProjetoStorage || localStorage).getItem('carga_horaria_disponivel')); //recebe a qtde de horas disponíveis até a data da prova. >> Calcular sobre a porcentagem de cada matéria.


const divCargaHorariaDivisao = document.getElementById('cargaHorariaDisponivel')
let indice2 = 1;

if (window.location.pathname.endsWith('pesomateria.html')) {
    window.addEventListener("load", function() {
        const lista_distribuicao_materiasParse = lerArrayArmazenado('lista_distribuicao_materias'); //recebe a lista com as matérias e a carga horária dividida para cada uma
        distribuiMateriaTable(lista_distribuicao_materiasParse);
        console.log(lista_distribuicao_materiasParse, "teste")
    });
};
// function distribuiMateriaTable(lista_distribuicao_materiasParse) {
//     const tabela2 = document.getElementById("table-body-distribuicao");
//     const novaLinha2 = document.createElement("tr");
//     const celulaIndice2 = document.createElement("td");
//     celulaIndice2.textContent = indice2;
//     celulaIndice2.classList.add("indice-cell");
//     novaLinha2.appendChild(celulaIndice2);
//     for (const chave of lista_distribuicao_materiasParse) {
//         if (lista_distribuicao_materiasParse.hasOwnProperty(chave)) {
//             const celula2 = document.createElement("td");
//             celula2.textContent = lista_distribuicao_materiasParse[chave];
//             novaLinha2.appendChild(celula2);
//         }
//     }
//     tabela2.appendChild(novaLinha2);
// };
function distribuiMateriaTable(lista_distribuicao_materiasParse) {
    const tabela2 = document.getElementById("table-body-distribuicao");
    if (!tabela2) return;
    tabela2.replaceChildren();

    if (!lista_distribuicao_materiasParse.length) {
        const linhaVazia = document.createElement("tr");
        const celulaVazia = document.createElement("td");
        celulaVazia.colSpan = 3;
        celulaVazia.className = "text-center text-secondary py-3";
        celulaVazia.textContent = "A carga horária será exibida depois que o planejamento for salvo.";
        linhaVazia.appendChild(celulaVazia);
        tabela2.appendChild(linhaVazia);
        return;
    }

    for (let indice = 0; indice < lista_distribuicao_materiasParse.length; indice++) {
        const item = lista_distribuicao_materiasParse[indice];

        const novaLinha2 = document.createElement("tr");
        
        // Cria uma célula para o índice
        const celulaIndice2 = document.createElement("td");
        celulaIndice2.textContent = indice + 1; // Ajusta o índice para começar de 1
        celulaIndice2.classList.add("indice-cell");
        novaLinha2.appendChild(celulaIndice2);

        // Cria uma célula para o nome da matéria
        const celulaMateria = document.createElement("td");
        celulaMateria.textContent = item.Materia;
        novaLinha2.appendChild(celulaMateria);

        // Cria uma célula para a carga horária
        const celulaCargaHoraria = document.createElement("td");
        const minutosEmHoras = converterMinutosParaHoras(item.Materia_distribuida)
        celulaCargaHoraria.textContent = minutosEmHoras   //item.Materia_distribuida.toFixed(1); 
        novaLinha2.appendChild(celulaCargaHoraria);

        tabela2.appendChild(novaLinha2);
    }
}

