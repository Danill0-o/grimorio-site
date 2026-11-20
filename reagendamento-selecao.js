(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', () => {
        const abrir = document.getElementById('reagendamento-jornada-abrir');
        const dialog = document.getElementById('reagendamento-jornada');
        if (!abrir || !dialog) return;
        const titulo = dialog.querySelector('h2'), trilha = dialog.querySelector('[role="region"]');
        const etapa = dialog.querySelector('[data-etapa]'), dica = dialog.querySelector('[data-dica]');
        const confirmacao = dialog.querySelector('[data-confirmacao]');
        dialog.querySelector('[data-passo="-1"]').append(IconesPixel.criar('esquerda'));
        dialog.querySelector('[data-passo="1"]').append(IconesPixel.criar('direita'));
        const formatarData = iso => iso ? iso.split('-').reverse().join('/') : '';
        let origem, candidato, botoes, abrindoEditor = false;
        function instruir() {
            if (etapa) etapa.textContent = origem
                ? `Passo 2 de 2 · Primeiro dia: ${origem.getAttribute('aria-label')} (${formatarData(origem.dataset.data)})`
                : 'Passo 1 de 2';
            titulo.textContent = origem ? 'Escolha o segundo dia' : 'Escolha o primeiro dia';
            if (dica) dica.textContent = origem
                ? 'Escolha o segundo dia para comparar os horários e mover sessões.'
                : 'Escolha o primeiro dia que você quer reorganizar.';
        }
        function atualizarDestaqueCentral() {
            if (!botoes?.length) return;
            const centro = trilha.getBoundingClientRect().left + trilha.clientWidth / 2;
            const dist = b => Math.abs(b.getBoundingClientRect().left + b.offsetWidth / 2 - centro);
            const maisProximo = botoes.reduce((melhor, b) => !melhor || dist(b) < dist(melhor) ? b : melhor, null);
            botoes.forEach(b => b.parentElement.classList.toggle('reagendamento-carta-central', b === maisProximo));
        }
        function focar(botao) {
            botao?.focus({ preventScroll: true });
            botao?.scrollIntoView({ block: 'nearest', inline: 'center' });
            requestAnimationFrame(atualizarDestaqueCentral);
        }
        function voltar() {
            if (!candidato) return;
            candidato.parentElement.classList.remove('reagendamento-candidato');
            candidato.setAttribute('aria-pressed', String(candidato === origem));
            confirmacao.hidden = true;
            instruir();
            focar(candidato);
            candidato = null;
        }
        function selecionar(botao) {
            if (botao.disabled || botao === candidato) return;
            if (candidato) {
                candidato.parentElement.classList.remove('reagendamento-candidato');
                candidato.setAttribute('aria-pressed', 'false');
            }
            candidato = botao;
            botao.parentElement.classList.add('reagendamento-candidato');
            botao.setAttribute('aria-pressed', 'true');
            const rotulo = botao.getAttribute('aria-label');
            const dataFmt = formatarData(botao.dataset.data);
            titulo.textContent = `Selecionar ${rotulo}${dataFmt ? ' (' + dataFmt + ')' : ''}?`;
            if (dica) dica.textContent = origem
                ? 'Confirme para abrir os dois cards lado a lado no modo de reorganização.'
                : 'Confirme o primeiro dia ou clique em outro card.';
            confirmacao.hidden = false;
            focar(botao);
        }
        function simplificarCartaClonada(copia, dataIso) {
            copia.removeAttribute('id');
            copia.classList.remove('dia-card-selecionado');
            copia.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
            copia.inert = true;
            copia.setAttribute('aria-hidden', 'true');
            copia.querySelectorAll('details[open]').forEach(el => { el.open = false; });
            copia.querySelectorAll('.dia-materia-expandida').forEach(el => el.classList.remove('dia-materia-expandida'));
            copia.querySelectorAll([
                '.dia-extra-adicionar',
                '.dia-bloqueio-aviso',
                '.dia-progresso-resumo',
                '.dia-concluir-botao',
                '.dia-revisoes-titulo',
                '.revisoes-grupos',
                '.blocos-acoes',
                '.materia-cronometro-acoes',
                '.materia-notas',
                '.materia-indicador-projeto',
                '.materia-indicador-nivel',
                '.dia-missao-item button',
                '.estudo-extra button'
            ].join(',')).forEach(el => el.remove());
            const cabecalho = copia.querySelector('.dia-card-cabecalho');
            if (cabecalho && dataIso) {
                const tagData = document.createElement('span');
                tagData.className = 'reagendamento-carta-data';
                tagData.textContent = formatarData(dataIso);
                cabecalho.append(tagData);
            }
        }
        abrir.addEventListener('click', () => {
            document.getElementById('reagendamento-status').textContent = '';
            origem = candidato = null;
            abrindoEditor = false;
            const hoje = CalendarioJornada.dataLocal();
            const cartas = [...document.querySelectorAll('#jornada-cards > .dia-card[data-data-prevista]')];
            botoes = [];
            trilha.replaceChildren(...cartas.filter(c => c.dataset.dataPrevista >= hoje).map(carta => {
                const item = document.createElement('div'), copia = carta.cloneNode(true);
                const botao = document.createElement('button');
                const rotulo = carta.querySelector('h3').textContent.trim();
                simplificarCartaClonada(copia, carta.dataset.dataPrevista);
                botao.type = 'button';
                botao.className = 'reagendamento-carta-gatilho';
                botao.dataset.data = carta.dataset.dataPrevista;
                botao.setAttribute('aria-label', rotulo);
                botao.setAttribute('aria-pressed', 'false');
                botao.addEventListener('click', () => selecionar(botao));
                botoes.push(botao);
                item.className = 'reagendamento-carta-slot';
                item.append(copia, botao);
                return item;
            }));
            instruir();
            dialog.showModal();
            if (botoes.length) focar(botoes[0]);
            else titulo.focus();
        });
        function navegar(passo) {
            const centro = trilha.getBoundingClientRect().left + trilha.clientWidth / 2;
            const visiveis = botoes.filter(b => !b.disabled);
            if (!visiveis.length) return;
            const dist = b => Math.abs(b.getBoundingClientRect().left + b.offsetWidth / 2 - centro);
            const atual = visiveis.reduce((i, b, j) => i < 0 || dist(b) < dist(visiveis[i]) ? j : i, -1);
            focar(visiveis[Math.max(0, Math.min(visiveis.length - 1, atual + passo))]);
        }
        trilha.addEventListener('scroll', () => requestAnimationFrame(atualizarDestaqueCentral), { passive: true });
        dialog.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => navegar(Number(b.dataset.passo))));
        trilha.addEventListener('keydown', e => {
            if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            navegar(e.key === 'ArrowLeft' ? -1 : 1);
        });
        confirmacao.querySelector('[data-voltar]').addEventListener('click', voltar);
        confirmacao.querySelector('[data-confirmar]').addEventListener('click', () => {
            if (!candidato) return;
            if (origem) {
                const par = [origem.dataset.data, candidato.dataset.data];
                abrindoEditor = true;
                dialog.close();
                void window.ReagendamentoEditor.abrir(par, abrir);
                return;
            }
            origem = candidato;
            voltar();
            origem.disabled = true;
            origem.parentElement.classList.add('reagendamento-origem');
            const proximo = botoes.find(b => !b.disabled);
            if (proximo) focar(proximo);
            else titulo.focus();
        });
        dialog.querySelector('[data-fechar]').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => {
            origem = candidato = null;
            confirmacao.hidden = true;
            trilha.replaceChildren();
            if (!abrindoEditor) abrir.focus();
        });
        const url = new URL(window.location.href);
        if (url.searchParams.get('reorganizar') === '1') {
            url.searchParams.delete('reorganizar');
            history.replaceState(null, '', url);
            queueMicrotask(() => {
                if (!dialog.open && document.querySelector('#jornada-cards > .dia-card[data-data-prevista]')) {
                    abrir.click();
                }
            });
        }
    });
})();
