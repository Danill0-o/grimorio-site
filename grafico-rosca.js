/* Gráfico de rosca SVG offline reutilizável (Etapa 4 do Wizard e Planejamento). */
(function () {
    'use strict';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const PALETA_PADRAO = [
        'var(--rosca-cor-teoria, var(--pixel-emerald))',
        'var(--pixel-gold)',
        'var(--pixel-mana)',
        'var(--pixel-xp)',
        'var(--pixel-crimson-bright)',
        'var(--pixel-kicker)',
        '#7c5cbf',
        '#a66b38'
    ];

    function criar(tag, texto, classe) {
        const el = document.createElement(tag);
        if (texto != null) el.textContent = texto;
        if (classe) el.className = classe;
        return el;
    }

    function criarSvg(tag, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [chave, valor] of Object.entries(attrs)) el.setAttribute(chave, String(valor));
        return el;
    }

    function formatarPercentual(valor, total) {
        if (!(total > 0) || !(valor > 0)) return '0%';
        const pct = (valor / total) * 100;
        if (pct < 0.1) return '< 0,1%';
        return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    }

    function calcularPercentuais(lista, total) {
        const resultados = lista.map(() => '0%');
        if (!(total > 0)) return resultados;
        const candidatos = lista
            .map((item, indice) => ({
                indice,
                valor: item.valor,
                decimos: item.valor > 0 ? (item.valor / total) * 1000 : 0
            }))
            .filter(item => item.valor > 0);
        const menores = candidatos.filter(c => c.decimos < 1);
        menores.forEach(c => { resultados[c.indice] = '< 0,1%'; });
        const principais = candidatos.filter(c => c.decimos >= 1);
        if (!principais.length) return resultados;
        const somaMenores = menores.reduce((s, c) => s + c.decimos, 0);
        const alvoTotal = Math.max(principais.length, Math.round(1000 - somaMenores));
        const base = principais.map(c => ({
            ...c,
            inteiro: Math.floor(c.decimos),
            resto: c.decimos - Math.floor(c.decimos)
        }));
        let diferenca = alvoTotal - base.reduce((s, c) => s + c.inteiro, 0);
        const ordem = [...base].sort((a, b) => b.resto - a.resto || b.valor - a.valor || a.indice - b.indice);
        for (let i = 0; i < ordem.length && diferenca > 0; i++, diferenca--) ordem[i].inteiro++;
        for (let i = ordem.length - 1; i >= 0 && diferenca < 0; i--) {
            if (ordem[i].inteiro > 1) { ordem[i].inteiro--; diferenca++; }
        }
        base.forEach(c => {
            const pct = c.inteiro / 10;
            resultados[c.indice] = `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
        });
        return resultados;
    }

    function renderizar(container, opcoes = {}) {
        if (!container) return;
        const {
            titulo = '',
            subtitulo = '',
            tituloTag = 'h3',
            tituloId = '',
            ariaLabel = '',
            centroRotulo = 'Total',
            centroValor = '0',
            itens = [],
            vazio = 'Ainda não há dados para este gráfico.'
        } = opcoes;

        const lista = Array.isArray(itens) ? itens : [];
        const total = lista.reduce((soma, item) => soma + Math.max(0, Number(item.valor) || 0), 0);
        const wrapper = criar('div', null, 'rosca-grafico');

        if (titulo || subtitulo) {
            const cab = criar('div', null, 'rosca-cabecalho');
            if (titulo) {
                const h = criar(tituloTag, titulo, 'rosca-titulo');
                if (tituloId) h.id = tituloId;
                cab.append(h);
            }
            if (subtitulo) cab.append(criar('p', subtitulo, 'rosca-subtitulo'));
            wrapper.append(cab);
        }

        if (!(total > 0)) {
            wrapper.append(criar('p', vazio, 'rosca-vazio'));
            container.replaceChildren(wrapper);
            return;
        }

        const valoresNormalizados = lista.map(item => ({
            ...item,
            valor: Math.max(0, Number(item.valor) || 0)
        }));
        const percentuais = calcularPercentuais(valoresNormalizados, total);
        const enriquecidos = valoresNormalizados.map((item, i) => {
            const pctTexto = item.percentualTexto || percentuais[i];
            const cor = item.cor || PALETA_PADRAO[i % PALETA_PADRAO.length];
            const valorTexto = item.valorTexto != null ? String(item.valorTexto) : String(item.valor);
            return { ...item, pctTexto, cor, valorTexto };
        });

        const resumoAria = ariaLabel || `${titulo || 'Gráfico de distribuição'}: ${enriquecidos.map(i => `${i.nome} ${i.valorTexto} (${i.pctTexto})`).join('; ')}.`;
        const corpo = criar('div', null, 'rosca-corpo');
        const visual = criar('div', null, 'rosca-visual');

        const raio = 76;
        const circunferencia = 2 * Math.PI * raio;
        const positivos = enriquecidos.filter(i => i.valor > 0);
        const espaco = positivos.length > 1 ? Math.min(2.8, circunferencia / (positivos.length * 6)) : 0;

        const svg = criarSvg('svg', {
            viewBox: '0 0 220 220',
            width: 220,
            height: 220,
            class: 'rosca-svg',
            role: 'img',
            'aria-label': resumoAria
        });

        svg.append(
            criarSvg('circle', { cx: 110, cy: 110, r: 90, class: 'rosca-anel-guia' }),
            criarSvg('circle', { cx: 110, cy: 110, r: raio, class: 'rosca-trilha' }),
            criarSvg('circle', { cx: 110, cy: 110, r: 62, class: 'rosca-anel-guia' })
        );

        const segmentosPorIndice = new Map();
        const legendaPorIndice = new Map();
        let deslocamento = 0;

        enriquecidos.forEach((item, indice) => {
            if (!(item.valor > 0)) return;
            const arco = (item.valor / total) * circunferencia;
            const visivel = espaco && arco > espaco + 2 ? arco - espaco : arco;
            const seg = criarSvg('circle', {
                cx: 110,
                cy: 110,
                r: raio,
                stroke: item.cor,
                'stroke-dasharray': `${visivel.toFixed(3)} ${(circunferencia - visivel).toFixed(3)}`,
                'stroke-dashoffset': (-deslocamento).toFixed(3),
                transform: 'rotate(-90 110 110)',
                class: 'rosca-segmento'
            });
            seg.append(criarSvg('title'));
            seg.firstChild.textContent = `${item.nome}: ${item.valorTexto} (${item.pctTexto})`;
            svg.append(seg);
            segmentosPorIndice.set(indice, seg);
            deslocamento += arco;
        });

        const centro = criar('div', null, 'rosca-centro');
        centro.setAttribute('aria-hidden', 'true');
        const centroRotuloEl = criar('span', centroRotulo, 'rosca-centro-rotulo');
        const centroValorEl = criar('strong', centroValor, 'rosca-centro-valor');
        centro.append(centroRotuloEl, centroValorEl);
        visual.append(svg, centro);

        function destacar(indiceAtivo) {
            if (indiceAtivo == null) {
                svg.classList.remove('tem-foco');
                segmentosPorIndice.forEach(s => s.classList.remove('ativo'));
                legendaPorIndice.forEach(l => l.classList.remove('ativo'));
                centroRotuloEl.textContent = centroRotulo;
                centroValorEl.textContent = centroValor;
                return;
            }
            const item = enriquecidos[indiceAtivo];
            if (!item) return;
            svg.classList.add('tem-foco');
            segmentosPorIndice.forEach((s, idx) => s.classList.toggle('ativo', idx === indiceAtivo));
            legendaPorIndice.forEach((l, idx) => l.classList.toggle('ativo', idx === indiceAtivo));
            centroRotuloEl.textContent = item.nome;
            centroValorEl.textContent = item.pctTexto;
        }

        const ul = criar('ul', null, 'rosca-legenda');
        enriquecidos.forEach((item, indice) => {
            const li = criar('li', null, 'rosca-legenda-item');
            const swatch = criar('span', null, 'rosca-cor');
            swatch.setAttribute('aria-hidden', 'true');
            swatch.style.background = item.cor;

            const info = criar('div', null, 'rosca-info');
            const topo = criar('div', null, 'rosca-topo');
            topo.append(criar('strong', item.nome, 'rosca-nome'));

            const valorEl = criar('span', item.valorTexto, 'rosca-valor');
            const pctEl = criar('span', ` (${item.pctTexto})`, 'rosca-pct');
            valorEl.append(pctEl);
            topo.append(valorEl);
            info.append(topo);

            if (item.subtexto) info.append(criar('small', item.subtexto, 'rosca-subtexto'));
            li.append(swatch, info);
            legendaPorIndice.set(indice, li);

            const seg = segmentosPorIndice.get(indice);
            li.addEventListener('mouseenter', () => destacar(indice));
            li.addEventListener('mouseleave', () => destacar(null));
            if (seg) {
                seg.addEventListener('mouseenter', () => destacar(indice));
                seg.addEventListener('mouseleave', () => destacar(null));
            }
            ul.append(li);
        });

        corpo.append(visual, ul);
        wrapper.append(corpo);
        container.replaceChildren(wrapper);
    }

    window.GraficoRosca = Object.freeze({ renderizar, formatarPercentual });
})();
