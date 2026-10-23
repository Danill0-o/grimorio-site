/* Barras decorativas acompanhadas de valores textuais, sem persistência. */
(function () {
    'use strict';
    const estados = new WeakMap();
    const categorias = { estudo: 'Estudo', revisao: 'Revisão', outros: 'Outros registros', cumprido: 'Cumprido', falta: 'Falta' };
    function tempo(segundos) {
        const horas = Math.floor(segundos / 3600), minutos = Math.floor(segundos % 3600 / 60), resto = segundos % 60;
        return [horas ? `${horas.toLocaleString('pt-BR')}h` : '', minutos ? `${minutos}min` : '', resto ? `${resto}s` : ''].filter(Boolean).join(' ') || '0h';
    }
    function criar(tag, texto, classe) {
        const no = document.createElement(tag); if (texto != null) no.textContent = texto; if (classe) no.className = classe; return no;
    }
    function barras(raiz, titulo, linhas, metas = false, escala) {
        const secao = criar('section', null, 'relatorios-grafico');
        secao.append(criar('h3', titulo));
        if (!linhas.length) { secao.append(criar('p', 'Ainda não há dados para este gráfico.')); raiz.append(secao); return; }
        const chaves = metas ? ['cumprido', 'falta'] : ['estudo', 'revisao', 'outros'];
        const legenda = criar('p', null, 'relatorios-legenda');
        for (const chave of chaves) legenda.append(criar('span', categorias[chave], `relatorios-${chave}`));
        secao.append(legenda);
        const maior = escala ?? linhas.reduce((maximo, linha) => Math.max(maximo, linha.total), 0);
        const maximo = Math.max(1, maior);
        if (!metas) secao.append(criar('p', maior ? `Escala comum: barra inteira = ${tempo(maior)}.` : 'Nenhum tempo registrado nestes períodos.', 'relatorios-ajuda'));
        const lista = criar('ul', null, 'relatorios-barras');
        for (const linha of linhas) {
            const item = criar('li');
            const percentual = linha.total ? Math.round(linha.cumprido / linha.total * 100) : 0;
            item.append(criar('strong', linha.nome), criar('span', metas ? `${percentual}% · ${tempo(linha.cumprido)} de ${tempo(linha.total)}` : tempo(linha.total), 'relatorios-valor'));
            const trilho = criar('div', null, 'relatorios-trilho'); trilho.setAttribute('aria-hidden', 'true');
            for (const chave of chaves) {
                const segmento = criar('span', null, `relatorios-${chave}`);
                segmento.style.width = `${Math.max(0, Math.min(100, (linha[chave] || 0) / (metas ? Math.max(1, linha.total) : maximo) * 100))}%`;
                trilho.append(segmento);
            }
            item.append(trilho, criar('small', chaves.map(chave => `${categorias[chave]}: ${tempo(linha[chave] || 0)}`).join(' · ')));
            lista.append(item);
        }
        secao.append(lista); raiz.append(secao);
    }
    function mostrar(raiz, resumo, assinatura) {
        let estado = estados.get(raiz);
        const paginas = Math.max(1, Math.ceil(resumo.periodos.length / 12));
        if (!estado || estado.assinatura !== assinatura) estado = { assinatura, pagina: paginas - 1 };
        estado.pagina = Math.min(estado.pagina, paginas - 1); estados.set(raiz, estado);
        raiz.replaceChildren();
        raiz.append(criar('p', `${resumo.quantidade.toLocaleString('pt-BR')} ${resumo.quantidade === 1 ? 'sessão' : 'sessões'} · ${tempo(resumo.totais.total)} no período.`, 'relatorios-total'));
        barras(raiz, resumo.grupo === 'mes' ? 'Horas por mês' : 'Horas por semana', resumo.periodos.slice(estado.pagina * 12, (estado.pagina + 1) * 12), false,
            resumo.periodos.reduce((maximo, periodo) => Math.max(maximo, periodo.total), 0));
        if (paginas > 1) {
            const nav = criar('nav', null, 'relatorios-paginacao'); nav.setAttribute('aria-label', 'Páginas dos períodos do gráfico');
            for (const [texto, delta] of [['Períodos anteriores', -1], ['Períodos seguintes', 1]]) {
                const botao = criar('button', texto, 'btn'); botao.type = 'button';
                botao.disabled = delta < 0 ? estado.pagina === 0 : estado.pagina === paginas - 1;
                botao.addEventListener('click', () => { estado.pagina += delta; mostrar(raiz, resumo, assinatura); raiz.focus({ preventScroll: true }); });
                nav.append(botao);
            }
            nav.append(criar('span', `Página ${estado.pagina + 1} de ${paginas}`)); raiz.append(nav);
        }
        barras(raiz, 'Horas por matéria', resumo.materias);
    }
    function erro(raiz, mensagem) { raiz.replaceChildren(criar('p', mensagem)); }
    window.RelatoriosUI = Object.freeze({ mostrar, barras, erro, tempo });
})();
