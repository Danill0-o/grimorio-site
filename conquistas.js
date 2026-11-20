/* Mural global: projeta o histórico existente, sem migrar desbloqueios ou títulos. */
(function () {
    'use strict';
    const el = id => document.getElementById(id);
    let renderizando = false;
    function elemento(tag, texto, classe) {
        const no = document.createElement(tag);
        if (texto !== undefined) no.textContent = texto;
        if (classe) no.className = classe;
        return no;
    }
    function renderizarConquistas(retencao, identidade) {
        const resumoConquistas = el('perfil-conquistas-resumo');
        const listaConquistas = el('perfil-conquistas-lista');
        const totalConquistas = retencao.conquistas.length;
        const qtdDesbloqueadas = retencao.conquistasDesbloqueadas.length;
        if (resumoConquistas) {
            resumoConquistas.textContent = `${qtdDesbloqueadas} de ${totalConquistas} desbloqueadas`;
        }

        const filtroConquistas = el('perfil-conquistas-filtro')?.value || 'todas';
        const conquistasVisiveis = retencao.conquistas.filter(item => {
            if (filtroConquistas === 'desbloqueadas') return item.desbloqueada;
            if (filtroConquistas === 'bloqueadas') return !item.desbloqueada;
            if (filtroConquistas !== 'todas') return item.categoria === filtroConquistas;
            return true;
        }).sort((a, b) => Number(b.desbloqueada) - Number(a.desbloqueada));

        const vazioConquistas = el('perfil-conquistas-vazio');
        if (vazioConquistas) {
            if (conquistasVisiveis.length === 0) {
                vazioConquistas.hidden = false;
                vazioConquistas.textContent = filtroConquistas === 'desbloqueadas'
                    ? 'Nenhuma conquista desbloqueada ainda. Continue estudando para conquistar seu primeiro título.'
                    : 'Nenhuma conquista neste filtro.';
            } else {
                vazioConquistas.hidden = true;
                vazioConquistas.textContent = '';
            }
        }

        function criarBotaoEquipar(item) {
            if (!item.desbloqueada || !window.PerfilIdentidade) return null;
            const equipado = identidade.tituloEquipadoId === item.id;
            const btn = elemento('button', equipado ? 'Título em uso' : 'Usar título', 'btn btn-outline-secondary perfil-conquista-equipar');
            btn.type = 'button';
            btn.setAttribute('aria-label', (equipado ? 'Retirar título ' : 'Usar título ') + item.tituloRecompensa);
            btn.setAttribute('aria-pressed', equipado ? 'true' : 'false');
            btn.addEventListener('click', () => {
                window.PerfilIdentidade.salvar({ tituloEquipadoId: equipado ? null : item.id });
            });
            return btn;
        }

        const cardsConquistas = conquistasVisiveis.map(item => {
            const card = elemento('li', undefined, `perfil-conquista-card ${item.desbloqueada ? 'is-desbloqueada' : 'is-bloqueada'}`);
            card.dataset.conquistaId = item.id;

            const topo = elemento('div', undefined, 'perfil-conquista-topo');
            const emblema = elemento('span', item.emblema, 'perfil-conquista-emblema');
            emblema.setAttribute('aria-hidden', 'true');
            const meta = elemento('div', undefined, 'perfil-conquista-meta');
            meta.append(
                elemento('span', item.categoria, 'perfil-conquista-categoria'),
                elemento('h3', item.nome, 'perfil-conquista-nome')
            );
            topo.append(emblema, meta);

            const criterio = elemento('p', item.criterio, 'perfil-conquista-criterio');
            const status = elemento(
                'p',
                item.desbloqueada ? `Título: ${item.tituloRecompensa}` : item.progresso,
                'perfil-conquista-status'
            );
            card.append(topo, criterio, status);

            const btn = criarBotaoEquipar(item);
            if (btn) card.append(btn);
            return card;
        });
        listaConquistas.replaceChildren(...cardsConquistas);

        const listaOcultas = el('perfil-ocultas-lista');
        const resumoOcultas = el('perfil-ocultas-resumo');
        const vazioOcultas = el('perfil-ocultas-vazio');
        if (listaOcultas && Array.isArray(retencao.conquistasOcultas)) {
            const todasOcultas = retencao.conquistasOcultas;
            const descobertas = retencao.ocultasDesbloqueadas || [];
            if (resumoOcultas) {
                resumoOcultas.textContent = `${descobertas.length} de ${todasOcultas.length} descobertas`;
            }

            const filtroOcultas = el('perfil-ocultas-filtro')?.value || 'todas';
            const mostrarSegredos = filtroOcultas !== 'desbloqueadas' && todasOcultas.some(item => !item.desbloqueada);
            const ocultasOrdenadas = filtroOcultas === 'bloqueadas' ? [] : todasOcultas.filter(item => item.desbloqueada);

            if (vazioOcultas) {
                if (ocultasOrdenadas.length === 0 && !mostrarSegredos) {
                    vazioOcultas.hidden = false;
                    vazioOcultas.textContent = filtroOcultas === 'desbloqueadas'
                        ? 'Nenhuma conquista oculta descoberta ainda.'
                        : 'Parabéns: você já revelou todas as conquistas ocultas!';
                } else {
                    vazioOcultas.hidden = true;
                    vazioOcultas.textContent = '';
                }
            }

            const cardsOcultas = ocultasOrdenadas.map(item => {
                const card = elemento('li', undefined, 'perfil-conquista-card is-desbloqueada is-oculta-desbloqueada');
                card.dataset.conquistaId = item.id;

                const topo = elemento('div', undefined, 'perfil-conquista-topo');
                const emblema = elemento('span', 'IA', 'perfil-conquista-emblema');
                emblema.setAttribute('aria-hidden', 'true');
                const meta = elemento('div', undefined, 'perfil-conquista-meta');
                meta.append(
                    elemento('span', `${item.categoria} · Sistema IA`, 'perfil-conquista-categoria'),
                    elemento('h3', item.nome, 'perfil-conquista-nome')
                );
                topo.append(emblema, meta);

                const fala = elemento('blockquote', item.fala, 'perfil-oculta-fala');
                const status = elemento('p', `Título: ${item.tituloRecompensa}`, 'perfil-conquista-status');
                card.append(topo, fala, status);
                const btn = criarBotaoEquipar(item);
                if (btn) card.append(btn);
                return card;
            });
            if (mostrarSegredos) {
                const card = elemento('li', undefined, 'perfil-conquista-card is-bloqueada is-oculta-bloqueada');
                card.setAttribute('aria-label', 'Conquistas ocultas ainda não descobertas');
                const emblema = elemento('span', '???', 'perfil-conquista-emblema');
                emblema.setAttribute('aria-hidden', 'true');
                card.append(emblema);
                cardsOcultas.push(card);
            }
            listaOcultas.replaceChildren(...cardsOcultas);
        }
    }

    function carregarDadosConquistas(persistirOcultas = true) {
        const materias = EstudoStore.listarDominioGlobal().filter(m => MateriasStore.resolverMateriaGlobal(m.materiaGlobalId).status !== 'excluida');
        const sessoes = EstudoStore.listarSessoes();
        const global = EstudoStore.obterProgressaoGlobal();
        const praticas = window.PraticasStore?.listarProgressao ? window.PraticasStore.listarProgressao() : [];
        const identidade = window.PerfilIdentidade.obter();
        const retencao = window.PerfilRetencao.calcular({ sessoes, materias, global, praticas, identidade, persistirOcultas });
        return { retencao, identidade, global };
    }
    function renderizar(evento) {
        if (renderizando) return;
        renderizando = true;
        const foco = document.activeElement.closest('[data-conquista-id]')?.dataset.conquistaId;
        try {
            // Um aviso de outra aba só atualiza a projeção, sem disputar gravações cosméticas.
            const { retencao, identidade, global } = carregarDadosConquistas(evento?.type !== 'storage');
            renderizarConquistas(retencao, identidade);
            el('conquistas-status').textContent = '';
            if (foco) [...document.querySelectorAll('[data-conquista-id]')].find(c => c.dataset.conquistaId === foco)?.querySelector('button')?.focus({ preventScroll: true });
        } catch (e) {
            el('conquistas-status').textContent = 'Não foi possível carregar as conquistas. Seus dados foram preservados. Recarregue para tentar novamente.';
            console.error(e);
        } finally { renderizando = false; }
    }
    function registrarVisitaMural() {
        if (!window.SistemaIaStore || !window.PerfilRetencao) return;
        try {
            const { retencao } = carregarDadosConquistas();
            const hojeIso = retencao?.hojeIso || window.PerfilRetencao.dataCivilLocal(new Date());
            const totalSemFiscal = (retencao?.todasDesbloqueadas || []).filter(c => c.id !== 'fiscal_trofeus').length;
            window.SistemaIaStore.atualizarTelemetria(t => {
                const atual = t.visitasMuralHoje || { data: '', contagem: 0, ultimoTotal: 0 };
                if (atual.data !== hojeIso || totalSemFiscal > atual.ultimoTotal) {
                    t.visitasMuralHoje = { data: hojeIso, contagem: 1, ultimoTotal: totalSemFiscal };
                } else {
                    t.visitasMuralHoje = { data: hojeIso, contagem: atual.contagem + 1, ultimoTotal: totalSemFiscal };
                }
            });
        } catch (_) {}
    }

    document.addEventListener('DOMContentLoaded', () => {
        const abas = [...document.querySelectorAll('[role="tab"]')];
        function selecionar(aba, focar = false) {
            for (const b of abas) {
                const ativa = b === aba;
                b.setAttribute('aria-selected', String(ativa)); b.tabIndex = ativa ? 0 : -1;
                el(b.getAttribute('aria-controls')).hidden = !ativa;
            }
            if (focar) aba.focus();
        }
        abas.forEach((aba, i) => {
            aba.addEventListener('click', () => selecionar(aba));
            aba.addEventListener('keydown', e => {
                const n = e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : e.key === 'ArrowRight' ? (i + 1) % abas.length : e.key === 'ArrowLeft' ? (i + abas.length - 1) % abas.length : null;
                if (n === null) return; e.preventDefault(); selecionar(abas[n], true);
            });
        });
        el('perfil-conquistas-filtro').addEventListener('change', renderizar);
        el('perfil-ocultas-filtro').addEventListener('change', renderizar);
        const reclamacaoBtn = el('perfil-reclamacao-xp-btn');
        const reclamacaoStatus = el('perfil-reclamacao-status');
        reclamacaoBtn?.addEventListener('click', () => {
            const res = window.SistemaIaStore?.incrementarTelemetria?.('cliquesReclamacaoXp', 1);
            const total = Number(res?.telemetria?.cliquesReclamacaoXp || 0);
            const desbloqueada = window.SistemaIaStore?.estaDesbloqueada?.('reclamacao_xp');
            const atingiuMeta = total >= window.SistemaIaCatalogo.CLIQUES_RECLAMACAO_XP;
            if (reclamacaoStatus) {
                reclamacaoStatus.hidden = false;
                reclamacaoStatus.textContent = !atingiuMeta && !desbloqueada
                    ? `Protocolo nº ${total}: o Departamento de Reclamações foi extinto em 2019 (0 XP).`
                    : `Protocolo nº ${total} atendido! Conquista "Departamento de Reclamações" desbloqueada (continua valendo 0 XP).`;
            }
            if (atingiuMeta && !desbloqueada) {
                renderizar();
                window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
            }
        });

        registrarVisitaMural(); renderizar();
    });
    for (const evento of ['estudo:registrado','estudo:excluido','dominio:reiniciado','materias:excluida','praticas:alteradas','revisoes:alteradas','perfil:identidade-alterada','sistema-ia:atualizado']) window.addEventListener(evento, renderizar);
    window.addEventListener('pageshow', e => { if (e.persisted) registrarVisitaMural(); renderizar(); });
    window.addEventListener('storage', e => {
        if (!e.key || e.key === PerfilIdentidade.CHAVE || e.key === SistemaIaStore.CHAVE || e.key.startsWith('historicoOperacaoV1:') || e.key.startsWith('projetoV1:') || e.key.startsWith('praticasProjetoV1:') || e.key === 'materiasDominioV1') renderizar(e);
    });
})();
