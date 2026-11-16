/* Interact.js entrega o gesto e zonas de drop; a R1 valida cada destino. */
(function () {
    'use strict';
    function ligar(dialog, api) {
        interact.pointerMoveTolerance(7);
        const registros = new Map();
        const zonas = new Map();
        const faixa = document.createElement('div');
        faixa.className = 'reagendamento-faixa-arraste';
        const aviso = document.createElement('p');
        aviso.className = 'reagendamento-impacto';
        aviso.setAttribute('role', 'status');
        aviso.hidden = true;
        faixa.append(aviso);
        dialog.prepend(faixa);
        let gesto, marca, frame = 0;

        function limparMarca() {
            if (marca) {
                delete marca.dataset.reagendamentoInsercao;
                delete marca.dataset.reagendamentoFim;
                marca = null;
            }
            for (const el of dialog.querySelectorAll('[data-reagendamento-deslocar]')) {
                delete el.dataset.reagendamentoDeslocar;
            }
            for (const el of dialog.querySelectorAll('[data-reagendamento-recebendo]')) {
                delete el.dataset.reagendamentoRecebendo;
            }
            for (const el of dialog.querySelectorAll('[data-drop-ativo], [data-drop-bloqueado]')) {
                delete el.dataset.dropAtivo;
                delete el.dataset.dropBloqueado;
            }
        }
        function cancelar() {
            if (!gesto) return;
            const anterior = gesto;
            gesto = null;
            cancelAnimationFrame(frame);
            frame = 0;
            limparMarca();
            delete anterior.linha.dataset.reagendamentoArrastando;
            delete dialog.dataset.reagendamentoGesto;
            dialog.style.removeProperty('--reagendamento-topo');
            aviso.hidden = true;
            aviso.textContent = '';
            api.prever();
            anterior.fantasma.remove();
        }
        function destino(x, y) {
            const sob = document.elementFromPoint(x, y);
            const card = sob?.closest('.reagendamento-dias section');
            const lista = card?.querySelector('ol[data-reagendamento-data]');
            if (!lista || !dialog.contains(lista)) return null;
            const linhas = Array.from(lista.children);
            const topo = lista.getBoundingClientRect().top;
            const antes = linhas.find(linha => y < topo + linha.offsetTop + linha.offsetHeight / 2);
            const indice = antes ? linhas.indexOf(antes) : linhas.length;
            return { card, lista, antes, indice, data: lista.dataset.reagendamentoData };
        }
        function avaliar(alvo) {
            if (!alvo) return null;
            const mesmaData = alvo.data === gesto.data;
            const indiceDestino = alvo.indice - Number(mesmaData && alvo.indice > gesto.indice);
            const metodo = mesmaData ? 'reordenar' : 'mover';
            const dados = mesmaData ? { data: alvo.data, indiceDestino }
                : { dataOrigem: gesto.data, dataDestino: alvo.data, indiceDestino };
            try { return api.simular(gesto.item, metodo, dados); }
            catch (e) { return { erro: e.message }; }
        }
        function deslocarVizinhos(alvo) {
            const mesmaData = alvo.data === gesto.data;
            const linhasAlvo = Array.from(alvo.lista.children);
            if (mesmaData) {
                const destinoIndice = alvo.indice - Number(alvo.indice > gesto.indice);
                if (destinoIndice > gesto.indice) {
                    for (let k = gesto.indice + 1; k <= destinoIndice; k++) {
                        if (linhasAlvo[k]) linhasAlvo[k].dataset.reagendamentoDeslocar = 'cima';
                    }
                } else if (destinoIndice < gesto.indice) {
                    for (let k = destinoIndice; k < gesto.indice; k++) {
                        if (linhasAlvo[k]) linhasAlvo[k].dataset.reagendamentoDeslocar = 'baixo';
                    }
                }
                return;
            }
            const listaOrigem = gesto.linha.parentElement;
            if (listaOrigem) {
                const linhasOrigem = Array.from(listaOrigem.children);
                for (let k = gesto.indice + 1; k < linhasOrigem.length; k++) {
                    linhasOrigem[k].dataset.reagendamentoDeslocar = 'cima';
                }
            }
            alvo.lista.dataset.reagendamentoRecebendo = '';
            for (let k = alvo.indice; k < linhasAlvo.length; k++) {
                linhasAlvo[k].dataset.reagendamentoDeslocar = 'baixo';
            }
        }
        function atualizar() {
            const alvo = destino(gesto.x, gesto.y);
            const chave = alvo ? alvo.data + ':' + alvo.indice : '';
            if (chave === gesto.alvoAnterior) return;
            gesto.alvoAnterior = chave;
            const resultado = avaliar(alvo);
            limparMarca();
            if (!resultado || resultado.erro) {
                api.prever();
                if (alvo?.card) alvo.card.dataset.dropBloqueado = '';
                aviso.textContent = alvo && alvo.data !== gesto.data && !gesto.item.movimentavel
                    ? 'Bloco já iniciado: pode mudar de ordem no mesmo dia, mas permanece nesta data'
                    : resultado?.erro ? 'Posição indisponível' : '';
                return;
            }
            if (alvo.card) alvo.card.dataset.dropAtivo = '';
            marca = alvo.antes || alvo.lista;
            if (alvo.antes) marca.dataset.reagendamentoInsercao = '';
            else marca.dataset.reagendamentoFim = '';
            deslocarVizinhos(alvo);
            api.prever(resultado.dias);
            const dia = resultado.dias.find(d => d.data === alvo.data);
            aviso.textContent = `${api.data(dia.data)} · Carga ${api.tempo(dia.cargaPlanejadaSegundos)} · Livre ${api.tempo(dia.livreSegundos)} · Excesso ${api.tempo(dia.excessoSegundos)}`;
        }
        function rolar() {
            frame = 0;
            if (!gesto?.ativo) return;
            const caixa = dialog.getBoundingClientRect();
            if (gesto.x < caixa.left || gesto.x > caixa.right || gesto.y < caixa.top || gesto.y > caixa.bottom) return;
            const delta = gesto.y < caixa.top + 42 ? -10 : gesto.y > caixa.bottom - 42 ? 10 : 0;
            if (!delta) return;
            const anterior = dialog.scrollTop;
            dialog.scrollTop += delta;
            if (dialog.scrollTop === anterior) return;
            gesto.alvoAnterior = '';
            atualizar();
            frame = requestAnimationFrame(rolar);
        }
        function iniciar(e, linha, info) {
            if (gesto) return;
            const caixa = linha.getBoundingClientRect();
            dialog.style.setProperty('--reagendamento-topo', dialog.getBoundingClientRect().top + 'px');
            dialog.dataset.reagendamentoGesto = '';
            const passo = Math.round(caixa.height + 10);
            dialog.style.setProperty('--slot-passo', passo + 'px');
            dialog.style.setProperty('--slot-altura', Math.round(caixa.height) + 'px');
            const fantasma = linha.cloneNode(true);
            fantasma.classList.add('reagendamento-fantasma');
            fantasma.removeAttribute('tabindex');
            delete fantasma.dataset.reagendamentoItem;
            delete fantasma.dataset.reagendamentoArraste;
            fantasma.setAttribute('aria-hidden', 'true');
            fantasma.style.width = caixa.width + 'px';
            dialog.append(fantasma);
            gesto = { ...info, linha, fantasma, x: e.clientX, y: e.clientY,
                dx: e.clientX - caixa.left, dy: e.clientY - caixa.top, ativo: true };
            linha.dataset.reagendamentoArrastando = '';
            aviso.hidden = false;
            mover(e, linha);
        }
        function mover(e, linha) {
            if (gesto?.linha !== linha) return;
            gesto.x = e.clientX;
            gesto.y = e.clientY;
            gesto.fantasma.style.left = gesto.x - gesto.dx + 'px';
            gesto.fantasma.style.top = gesto.y - gesto.dy + 'px';
            atualizar();
            if (!frame) frame = requestAnimationFrame(rolar);
        }
        function soltar(e, linha) {
            if (gesto?.linha !== linha) return;
            const resultado = avaliar(destino(e.clientX, e.clientY));
            const { fantasma, item } = gesto;
            const inicial = fantasma.getBoundingClientRect();
            cancelar();
            if (resultado?.proximo) api.aplicar(resultado.proximo, item.chave);
            const alvo = resultado?.proximo ? [...dialog.querySelectorAll('[data-reagendamento-item]')]
                .find(el => el.dataset.reagendamentoItem === item.chave) : linha;
            if (!alvo || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const final = alvo.getBoundingClientRect();
            alvo.animate([
                { transform: `translate(${inicial.left - final.left}px, ${inicial.top - final.top}px) scale(1.02)` },
                { transform: 'none' }
            ], { duration: 190, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
        }
        dialog.addEventListener('pointercancel', cancelar);
        dialog.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || !gesto) return;
            e.preventDefault();
            cancelar();
        });
        dialog.addEventListener('cancel', e => {
            if (!gesto) return;
            e.preventDefault();
            cancelar();
        });
        dialog.addEventListener('close', () => { if (!dialog.open) cancelar(); });
        window.addEventListener('blur', cancelar);
        return {
            cancelar() {
                cancelar();
                for (const controle of registros.values()) controle.unset();
                registros.clear();
                for (const zona of zonas.values()) zona.unset();
                zonas.clear();
            },
            registrarZona(secao) {
                if (!secao || zonas.has(secao)) return;
                zonas.set(secao, interact(secao).dropzone({ overlap: 'pointer' }));
            },
            registrar(linha, item, data, indice) {
                linha.dataset.reagendamentoArraste = '';
                const controle = interact(linha).draggable({
                    inertia: false,
                    listeners: {
                        start: e => iniciar(e, linha, { item, data, indice }),
                        move: e => mover(e, linha),
                        end: e => soltar(e, linha)
                    }
                });
                registros.set(linha, controle);
            }
        };
    }
    window.ReagendamentoArraste = Object.freeze({ ligar });
})();
