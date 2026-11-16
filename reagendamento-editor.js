(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', () => {
        const porId = id => document.getElementById(id);
        const dialog = porId('reagendamento-editor');
        if (!dialog) return;
        const titulo = porId('reagendamento-titulo'), conteudo = porId('reagendamento-conteudo');
        const acoes = porId('reagendamento-acoes'), erro = porId('reagendamento-erro'), status = porId('reagendamento-status');
        const hoje = () => CalendarioJornada.dataLocal(new Date());
        const data = iso => iso.split('-').reverse().join('/');
        const tempo = s => [Math.floor(s / 60) + ' min', s % 60 ? s % 60 + ' s' : ''].filter(Boolean).join(' ');
        const parTempo = (a, b) => a % 60 === 0 && b % 60 === 0
            ? `${a / 60} / ${b / 60} min`
            : `${tempo(a)} / ${tempo(b)}`;
        const rotuloDia = dia => dia.diaJornada
            ? `Dia ${String(dia.diaJornada.replace(/^dia/, '')).padStart(2, '0')} · ${data(dia.data)}`
            : `Folga · ${data(dia.data)}`;
        let rascunho, operacaoId, ocupado = false, gatilhoRetorno = null;
        const simular = (item, metodo, dados) => Reagendamento[metodo](rascunho,
            { itemId: item.id, tipo: item.tipo, ...dados }, hoje());
        function aplicar(proximo, foco) {
            rascunho = proximo;
            operacaoId = crypto.randomUUID();
            editar(false, foco);
        }
        const arraste = ReagendamentoArraste.ligar(dialog, {
            simular(item, metodo, dados) {
                const proximo = simular(item, metodo, dados);
                return { proximo, dias: ReagendamentoStore.prever(proximo, hoje()).dias };
            },
            aplicar, data, tempo,
            prever(dias) {
                if (rascunho) atualizarCargas(dias || ReagendamentoStore.prever(rascunho, hoje()).dias);
            }
        });
        function atualizarCargas(dias) {
            for (const dia of dias) {
                const painel = conteudo.querySelector(`[data-carga-dia="${dia.data}"]`);
                if (!painel) continue;
                const { capacidadeSegundos: limite, cargaPlanejadaSegundos: carga,
                    excessoSegundos: excesso, livreSegundos: livre, cargaExternaSegundos: externa, externosSemDuracao } = dia;
                const escala = Math.max(limite, carga, 1);
                painel.style.setProperty('--carga-normal', Math.min(carga, limite) / escala);
                painel.style.setProperty('--carga-excesso', excesso / escala);
                painel.dataset.estado = excesso ? 'excesso' : livre ? 'livre' : limite ? 'cheio' : 'sem-carga';
                painel.querySelector('[data-carga-valor]').textContent = parTempo(carga, limite);
                const badge = painel.querySelector('[data-carga-badge]');
                if (badge) {
                    badge.hidden = !excesso;
                    badge.textContent = excesso ? '+' + tempo(excesso) : '';
                }
                painel.querySelector('[data-carga-saldo]').textContent = excesso
                    ? (dia.cargaIntegrada ? tempo(excesso) + ' acima do orçamento' : '⚠ ' + tempo(excesso) + ' acima do planejado')
                    : livre ? tempo(livre) + ' disponíveis'
                    : limite ? 'Tempo do dia preenchido' : 'Dia de folga';
                const taf = painel.querySelector('[data-carga-externa]');
                if (dia.cargaIntegrada) {
                    taf.textContent = CargaDiaria.textoForaDaCarga(dia.praticasExtrasSegundos, dia.praticasSemDuracao);
                    taf.hidden = !taf.textContent;
                    painel.querySelector('[data-carga-divisao]').textContent = CargaDiaria.divisao(dia);
                    painel.querySelector('[data-carga-realizado]').textContent = CargaDiaria.realizado(dia);
                    continue;
                }
                taf.hidden = !externa && !externosSemDuracao;
                taf.textContent = 'TAF · ' + (externa ? tempo(externa) : 'Duração livre')
                    + (externa && externosSemDuracao ? ' e treinos com duração livre' : '');
            }
        }
        function painelCarga(dia) {
            const painel = elemento('div');
            painel.className = 'reagendamento-carga';
            painel.dataset.cargaDia = dia.data;
            const topo = elemento('div');
            topo.className = 'reagendamento-carga-topo';
            const valor = elemento('strong'), badge = elemento('span');
            valor.dataset.cargaValor = '';
            badge.className = 'reagendamento-carga-badge';
            badge.dataset.cargaBadge = '';
            badge.hidden = true;
            topo.append(valor, badge);
            const trilho = elemento('div'), saldo = elemento('span'), taf = elemento('small');
            saldo.dataset.cargaSaldo = taf.dataset.cargaExterna = '';
            trilho.className = 'reagendamento-carga-trilho';
            trilho.setAttribute('aria-hidden', 'true');
            trilho.append(elemento('span'), elemento('span'));
            painel.append(topo, trilho, saldo, taf);
            if (dia.cargaIntegrada) {
                const divisao = elemento('small'), realizado = elemento('small');
                divisao.dataset.cargaDivisao = realizado.dataset.cargaRealizado = '';
                painel.append(divisao, realizado);
            }
            return painel;
        }
        function elemento(tag, texto) {
            const el = document.createElement(tag);
            if (texto !== undefined) el.textContent = texto;
            return el;
        }
        function botao(texto, acao, pai = acoes) {
            const el = elemento('button', texto);
            el.type = 'button';
            el.addEventListener('click', acao);
            pai.append(el);
            return el;
        }
        function tela(nome) {
            arraste.cancelar();
            titulo.textContent = nome;
            conteudo.replaceChildren();
            acoes.replaceChildren();
            erro.textContent = '';
            return botao('Cancelar', () => dialog.close());
        }
        function falha(e) { erro.textContent = e.message; }
        function painelResumo(previa) {
            const resumo = elemento('div');
            resumo.className = 'reagendamento-resumo';
            const itensPorChave = new Map(previa.dias.flatMap(d => d.itens.map(i => [i.chave, i])));
            for (const m of previa.movimentos) {
                const item = itensPorChave.get(m.chave);
                const nome = item?.nome || m.itemId;
                const descricao = m.dataOrigem !== m.dataDestino
                    ? `• ${nome}: transferido de ${data(m.dataOrigem)} para ${data(m.dataDestino)}`
                    : `• ${nome}: reordenado em ${data(m.dataOrigem)} (${m.indiceOrigem + 1}º → ${m.indiceDestino + 1}º)`;
                resumo.append(elemento('p', descricao));
            }
            for (const dia of previa.dias) {
                if (dia.excessoSegundos > 0) {
                    resumo.append(elemento('p', `⚠ ${data(dia.data)} ficará com ${tempo(dia.excessoSegundos)} acima do planejado.`));
                }
            }
            return resumo;
        }
        function editar(revisar = false, foco = null) {
            const previa = ReagendamentoStore.prever(rascunho, hoje());
            const cancelar = tela(revisar ? 'Confirmar reorganização' : 'Comparar os dois dias');
            conteudo.append(elemento('p', revisar
                ? 'Confira a ordem final e a carga antes de salvar.'
                : 'Arraste os boxes entre os dois dias ou mude a ordem dentro do mesmo dia.'));
            const teclado = elemento('p', 'Use as setas para mudar a ordem ou trocar de dia.');
            teclado.id = 'reagendamento-teclado';
            teclado.className = 'visually-hidden';
            if (!revisar) conteudo.append(teclado);
            if (revisar && previa.movimentos.length) conteudo.append(painelResumo(previa));
            const grade = elemento('div');
            grade.className = 'reagendamento-dias';
            let proximoFoco;
            previa.dias.forEach((dia, i) => {
                const outro = previa.dias[1 - i], card = elemento('section');
                card.className = 'reagendamento-dia-card';
                card.append(elemento('h3', rotuloDia(dia)));
                card.append(painelCarga(dia));
                const lista = elemento('ol');
                lista.dataset.reagendamentoData = dia.data;
                if (!dia.itens.length) {
                    const vazio = elemento('p', 'Nenhum bloco neste dia. Arraste um bloco para cá.');
                    vazio.className = 'reagendamento-vazio';
                    card.append(vazio);
                }
                dia.itens.forEach((item, indice) => {
                    const li = elemento('li');
                    li.dataset.reagendamentoItem = item.chave;
                    li.tabIndex = -1;
                    if (item.chave === foco) proximoFoco = li;
                    const concluido = item.tipo === 'pratica' ? item.snapshot.concluida
                        : item.metaSegundos > 0 && item.creditoSegundos >= item.metaSegundos;
                    li.className = 'dia-materia-item reagendamento-box' + (concluido ? ' dia-materia-concluida' : '');
                    const editavel = !revisar && (item.reordenavel ?? item.movimentavel);
                    if (editavel) {
                        const alca = elemento('span', '⠿');
                        alca.className = 'reagendamento-alca';
                        alca.setAttribute('aria-hidden', 'true');
                        li.append(alca);
                    }
                    const identificacao = elemento('span');
                    identificacao.className = 'dia-materia-identificacao';
                    const topo = elemento('span');
                    topo.className = 'reagendamento-box-topo';
                    const nome = elemento('strong', item.tipo === 'pratica' && !/^Atividade prática|^TAF/i.test(item.nome)
                        ? 'Atividade prática · ' + item.nome : item.nome);
                    topo.append(nome);
                    if (item.bloqueios.length) {
                        const tag = elemento('span', concluido ? '✓ Concluído · fixo no dia' : 'Iniciado · fixo no dia');
                        tag.className = 'reagendamento-tag-fixo';
                        topo.append(tag);
                    }
                    identificacao.append(topo);
                    const meta = elemento('span');
                    meta.className = 'reagendamento-box-meta';
                    if (item.metaSegundos === null) {
                        meta.append(elemento('span', 'Tempo externo'));
                    } else {
                        const barra = elemento('progress');
                        barra.className = 'materia-indicador-barra';
                        barra.max = item.metaSegundos;
                        barra.value = item.tipo === 'pratica'
                            ? (concluido ? item.metaSegundos : item.snapshot.tempoRegistradoSegundos)
                            : item.creditoSegundos;
                        barra.setAttribute('aria-label', 'Meta de ' + item.nome);
                        const rotuloMeta = item.tipo === 'pratica'
                            ? 'Duração: ' + tempo(item.metaSegundos)
                            : parTempo(item.creditoSegundos, item.metaSegundos);
                        meta.append(elemento('span', rotuloMeta), barra);
                    }
                    identificacao.append(meta);
                    li.append(identificacao);
                    if (editavel) {
                        li.tabIndex = 0;
                        li.setAttribute('aria-keyshortcuts', item.movimentavel
                            ? 'ArrowUp ArrowDown ArrowLeft ArrowRight'
                            : 'ArrowUp ArrowDown');
                        li.setAttribute('aria-describedby', 'reagendamento-teclado');
                        arraste.registrar(li, item, dia.data, indice);
                        li.addEventListener('keydown', e => {
                            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                            e.preventDefault();
                            erro.textContent = '';
                            const lateral = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
                            if (lateral && e.key !== (i ? 'ArrowLeft' : 'ArrowRight')) return;
                            if (lateral && !item.movimentavel) {
                                erro.textContent = 'Você pode mudar a ordem de uma sessão já iniciada ou concluída, dentro do mesmo dia.';
                                return;
                            }
                            const posicao = indice + (e.key === 'ArrowUp' ? -1 : 1);
                            if (!lateral && !dia.itens[posicao]) return;
                            try {
                                aplicar(simular(item, lateral ? 'mover' : 'reordenar', lateral
                                    ? { dataOrigem: dia.data, dataDestino: outro.data, indiceDestino: outro.itens.length }
                                    : { data: dia.data, indiceDestino: posicao }), item.chave);
                            } catch (_) { erro.textContent = 'Posição indisponível.'; }
                        });
                    }
                    lista.append(li);
                });
                card.append(lista);
                for (const extra of dia.contexto.extras.filter(item => item.extraAvulsa && item.missaoId)) {
                    const contexto = elemento('p', `${extra.nome} · Atividade extra fora da reorganização`);
                    contexto.className = 'reagendamento-vazio';
                    card.append(contexto);
                }
                if (!revisar) arraste.registrarZona(card);
                grade.append(card);
            });
            conteudo.append(grade);
            atualizarCargas(previa.dias);
            if (previa.outrosDias?.length) {
                const impacto = elemento('div');
                impacto.className = 'carga-diaria-resumo';
                impacto.append(elemento('strong', 'Reservas alteradas em outras datas'));
                for (const dia of previa.outrosDias) {
                    impacto.append(elemento('span', `${data(dia.data)} · ${CargaDiaria.duracao(dia.revisoesSegundos)} de revisões reservadas`
                        + (dia.excessoSegundos ? ` · Excesso ${CargaDiaria.duracao(dia.excessoSegundos)}` : '')));
                }
                conteudo.append(impacto);
            }
            if (previa.necessitaRevalidacao) erro.textContent = 'A data mudou. Cancele e selecione os dias novamente.';
            if (!revisar) {
                const finalizar = botao('Revisar alterações', () => editar(true));
                finalizar.disabled = !previa.alterado || previa.necessitaRevalidacao;
                (proximoFoco || titulo).focus();
                return;
            }
            botao('Voltar e ajustar', () => editar());
            const salvar = botao('Confirmar e salvar', async () => {
                ocupado = true;
                for (const b of acoes.querySelectorAll('button')) b.disabled = true;
                erro.textContent = '';
                try {
                    await ReagendamentoStore.confirmar(rascunho, operacaoId);
                    if (status) status.textContent = 'Reorganização salva. Reabra o editor para consultar a ordem confirmada.';
                    dialog.close();
                } catch (e) {
                    falha(e);
                    for (const b of acoes.querySelectorAll('button')) b.disabled = false;
                    salvar.focus();
                } finally { ocupado = false; }
            });
            salvar.disabled = previa.necessitaRevalidacao;
            cancelar.focus();
        }
        async function abrirEditor(par, gatilho) {
            if (dialog.open || ocupado) return;
            if (status) status.textContent = '';
            ocupado = true;
            try {
                rascunho = await ReagendamentoStore.abrir(par);
                operacaoId = crypto.randomUUID();
                gatilhoRetorno = gatilho;
                dialog.showModal();
                editar();
            } catch (e) {
                if (dialog.open) dialog.close();
                if (status) status.textContent = e.message;
                gatilho?.focus();
            } finally { ocupado = false; }
        }
        dialog.addEventListener('cancel', e => { if (ocupado) e.preventDefault(); });
        dialog.addEventListener('close', () => {
            if (dialog.open) return;
            arraste.cancelar();
            rascunho = operacaoId = null;
            gatilhoRetorno?.focus();
            gatilhoRetorno = null;
        });
        window.ReagendamentoEditor = Object.freeze({ abrir: abrirEditor });
    });
})();
