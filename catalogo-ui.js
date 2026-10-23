(function () {
    'use strict';

    const tipos = {
        'nome-exato': 'Nome exato',
        'alias-exato': 'Nome alternativo confirmado',
        'termo-aprendido': 'Busca lembrada',
        prefixo: 'Começa com o texto',
        tokens: 'Trecho do nome',
        aproximado: 'Nome parecido — confirme antes de usar',
        'token-parcial': 'Palavra em comum — pode ser outra matéria',
        catalogo: 'Disponível no seu Grimório'
    };

    function formatarTempo(segundos) {
        const total = Math.max(0, Math.floor(Number(segundos) || 0));
        if (total === 0) return '0h estudadas';
        if (total < 60) return `${total}s estudados`;
        const horas = Math.floor(total / 3600);
        const minutos = Math.floor((total % 3600) / 60);
        if (horas > 0 && minutos > 0) return `${horas.toLocaleString('pt-BR')}h ${minutos}min estudados`;
        if (horas > 0) return `${horas.toLocaleString('pt-BR')}h ${horas === 1 ? 'estudada' : 'estudadas'}`;
        return `${minutos}min ${minutos === 1 ? 'estudado' : 'estudados'}`;
    }

    function obterDominios(ids) {
        try {
            if (window.EstudoStore?.obterDominioMaterias) {
                return window.EstudoStore.obterDominioMaterias(ids);
            }
        } catch (_) {}
        return new Map();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const voltarWizard = document.getElementById('materias-voltar-wizard');
        if (voltarWizard && window.ProjetosStore?.temAtual?.()) {
            voltarWizard.hidden = false;
        }

        iniciarLivroWizard();
        iniciarGestaoMemorias();
        iniciarAcervoPagina();
    });

    function iniciarLivroWizard() {
        const input = document.getElementById('catalogo-consulta');
        const painel = document.getElementById('catalogo-sugestoes');
        const lista = document.getElementById('catalogo-resultados');
        const select = document.getElementById('materia-catalogo');
        const criar = document.getElementById('catalogo-criar');
        const status = document.getElementById('catalogo-status');
        const dialogLivro = document.getElementById('livro-materias-dialog');
        const btnAbrirLivro = document.getElementById('abrir-livro-materias');
        const btnFecharLivro = document.getElementById('livro-materias-fechar');
        const resumoLivro = document.getElementById('livro-materias-resumo');
        const bannerVinculo = document.getElementById('materia-vinculo-ativo');
        const textoVinculo = document.getElementById('materia-vinculo-texto');
        const btnLimparVinculo = document.getElementById('materia-limpar-vinculo');
        const paginacao = document.getElementById('livro-paginacao');
        const btnPagAnterior = document.getElementById('livro-pagina-anterior');
        const btnPagProxima = document.getElementById('livro-pagina-proxima');
        const infoPagina = document.getElementById('livro-pagina-info');

        if (!input || !lista || !select) return;

        const POR_PAGINA = 6;
        let todosResultados = [];
        let resultadosVisiveis = [];
        let paginaAtual = 0;
        let indice = -1;
        let buscando = false;

        function atualizarResumoLivro() {
            if (!resumoLivro) return;
            try {
                const globais = window.MateriasStore.listarMateriasGlobais();
                if (!globais.length) {
                    resumoLivro.textContent = 'Abrir Grimório (nenhuma matéria cadastrada ainda)';
                    return;
                }
                const dominios = obterDominios(globais.map(g => g.materiaGlobalId));
                const comHistorico = [...dominios.values()].filter(d => d.segundos > 0).length;
                resumoLivro.textContent = `${globais.length} ${globais.length === 1 ? 'matéria' : 'matérias'} no Grimório${comHistorico ? ` (${comHistorico} com progresso)` : ''} · 1 clique`;
            } catch (_) {
                resumoLivro.textContent = 'Ver níveis e escolher do Grimório';
            }
        }

        function atualizarBannerVinculo() {
            if (!bannerVinculo || !textoVinculo) return;
            const globalId = select.value;
            if (!globalId) {
                bannerVinculo.hidden = true;
                textoVinculo.textContent = '';
                return;
            }
            try {
                const g = window.MateriasStore.resolverMateriaGlobal(globalId);
                const dom = obterDominios([g.materiaGlobalId]).get(g.materiaGlobalId) || { nivel: 1, titulo: 'Iniciante', segundos: 0, pontos: 0 };
                textoVinculo.textContent = `📖 Matéria do Grimório selecionada: ${g.nomeCanonico} — Nível ${dom.nivel} (${dom.titulo}) · ${formatarTempo(dom.segundos)}`;
                bannerVinculo.hidden = false;
            } catch (_) {
                bannerVinculo.hidden = true;
            }
        }

        function fecharSugestoes() {
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            indice = -1;
        }

        function fecharLivro(devolverFoco = true) {
            fecharSugestoes();
            if (dialogLivro?.open) dialogLivro.close();
            if (devolverFoco) btnAbrirLivro?.focus();
        }

        function destacar(i) {
            indice = i;
            [...lista.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
            if (i >= 0 && lista.children[i]) {
                input.setAttribute('aria-activedescendant', lista.children[i].id);
                lista.children[i].scrollIntoView({ block: 'nearest' });
            }
        }

        async function escolher(m) {
            const consulta = input.value;
            if (typeof atualizarCatalogoMaterias === 'function') atualizarCatalogoMaterias();
            const option = [...select.options].find(o => o.value === m.materiaGlobalId);
            if (!option || option.disabled) return;
            select.value = m.materiaGlobalId;
            select.dispatchEvent(new Event('change'));
            atualizarBannerVinculo();
            input.value = m.nomeCanonico;
            status.textContent = `${m.nomeCanonico} selecionada. Informe os dados e clique em Adicionar.`;
            if (dialogLivro?.open) dialogLivro.close();
            document.getElementById('Nquestoes')?.focus();
            try {
                await window.MateriasBusca.lembrarTermo(m.materiaGlobalId, consulta);
                window.dispatchEvent(new CustomEvent('memorias:atualizadas'));
            } catch (erro) {
                status.textContent = `Matéria selecionada; não foi possível lembrar a busca: ${erro.message}`;
            }
        }

        function renderizarPaginaLivro() {
            const totalPaginas = Math.max(1, Math.ceil(todosResultados.length / POR_PAGINA));
            paginaAtual = Math.max(0, Math.min(paginaAtual, totalPaginas - 1));
            resultadosVisiveis = todosResultados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
            const dominios = obterDominios(resultadosVisiveis.map(m => m.materiaGlobalId));

            lista.replaceChildren();
            indice = -1;
            input.removeAttribute('aria-activedescendant');

            if (!resultadosVisiveis.length) {
                const vazio = document.createElement('li');
                vazio.className = 'livro-pagina-vazia';
                vazio.setAttribute('role', 'presentation');
                vazio.textContent = input.value.trim()
                    ? 'Nenhuma matéria encontrada com esse filtro. Você pode usar o botão acima para criar uma nova matéria com este nome.'
                    : 'Seu Grimório ainda não possui matérias cadastradas. Feche o livro e adicione sua primeira matéria no formulário!';
                lista.appendChild(vazio);
            } else {
                resultadosVisiveis.forEach((m, i) => {
                    const dom = dominios.get(m.materiaGlobalId) || { nivel: 1, titulo: 'Iniciante', segundos: 0, pontos: 0, percentual: 0 };
                    const li = document.createElement('li');
                    li.id = `catalogo-opcao-${i}`;
                    li.className = 'livro-materia-card';
                    li.dataset.livroMateriaId = m.materiaGlobalId;
                    li.setAttribute('role', 'option');
                    li.setAttribute('aria-selected', 'false');
                    li.setAttribute('aria-disabled', String(m.usada));

                    const topo = document.createElement('div');
                    topo.className = 'livro-card-topo';
                    const nome = document.createElement('strong');
                    nome.className = 'livro-card-nome';
                    nome.textContent = m.nomeCanonico;
                    const badgeNivel = document.createElement('span');
                    badgeNivel.className = 'livro-card-nivel';
                    badgeNivel.textContent = `Nível ${dom.nivel} · ${dom.titulo}`;
                    topo.append(nome, badgeNivel);

                    const tempo = document.createElement('span');
                    tempo.className = 'livro-card-tempo';
                    tempo.textContent = `${formatarTempo(dom.segundos)} · ${Math.floor(dom.pontos).toLocaleString('pt-BR')} pts`;

                    const barra = document.createElement('progress');
                    barra.className = 'livro-card-barra';
                    barra.max = 100;
                    barra.value = Math.round(dom.percentual || 0);
                    barra.setAttribute('aria-label', `Avanço de ${m.nomeCanonico}`);

                    const detalhe = document.createElement('small');
                    detalhe.className = 'livro-card-detalhe';
                    detalhe.textContent = m.usada
                        ? '✓ Já adicionada neste projeto'
                        : `${tipos[m.tipoMatch] || 'Sua matéria'} — clique para escolher`;

                    li.append(topo, tempo, barra, detalhe);
                    li.addEventListener('mousedown', e => e.preventDefault());
                    li.addEventListener('click', () => escolher(m));
                    lista.appendChild(li);
                });
            }

            if (paginacao) {
                paginacao.hidden = todosResultados.length <= POR_PAGINA;
                if (infoPagina) infoPagina.textContent = `Páginas ${paginaAtual * 2 + 1}–${paginaAtual * 2 + 2} (${paginaAtual + 1} de ${totalPaginas})`;
                if (btnPagAnterior) btnPagAnterior.disabled = paginaAtual === 0;
                if (btnPagProxima) btnPagProxima.disabled = paginaAtual >= totalPaginas - 1;
            }
        }

        function buscar() {
            // Atualizar o select emite catalogo:atualizado de forma síncrona.
            // A mesma busca já está recompondo a lista e não deve reentrar pelo evento.
            if (buscando) return;
            buscando = true;
            try {
                if (typeof atualizarCatalogoMaterias === 'function') atualizarCatalogoMaterias();
                const usadas = new Set([...select.options].filter(o => o.disabled).map(o => o.value));
                const consulta = input.value;
                const brutos = window.MateriasBusca.buscar(consulta);
                const limite = consulta.trim() ? brutos.slice(0, 12) : brutos;
                todosResultados = limite.map(m => ({ ...m, usada: usadas.has(m.materiaGlobalId) }));
                paginaAtual = 0;
                renderizarPaginaLivro();
                if (criar) {
                    criar.hidden = !consulta.trim();
                    criar.disabled = todosResultados.some(m => m.tipoMatch === 'nome-exato');
                }
                if (painel) painel.hidden = false;
                input.setAttribute('aria-expanded', 'true');
                status.textContent = todosResultados.length
                    ? `${todosResultados.length} ${todosResultados.length === 1 ? 'matéria encontrada' : 'matérias encontradas'}. Clique em um card ou use as setas e Enter.`
                    : 'Nenhuma matéria encontrada. Você pode criar uma nova.';
            } catch (erro) {
                fecharSugestoes();
                status.textContent = erro.message;
            } finally { buscando = false; }
        }

        btnAbrirLivro?.addEventListener('click', () => {
            input.value = '';
            buscar();
            if (dialogLivro && !dialogLivro.open) dialogLivro.showModal();
            input.focus();
        });

        btnFecharLivro?.addEventListener('click', () => fecharLivro(true));

        dialogLivro?.addEventListener('click', e => {
            if (e.target === dialogLivro) fecharLivro(true);
        });

        dialogLivro?.addEventListener('close', () => {
            fecharSugestoes();
        });

        btnPagAnterior?.addEventListener('click', () => {
            if (paginaAtual > 0) {
                paginaAtual--;
                renderizarPaginaLivro();
            }
        });

        btnPagProxima?.addEventListener('click', () => {
            paginaAtual++;
            renderizarPaginaLivro();
        });

        btnLimparVinculo?.addEventListener('click', () => {
            select.value = '';
            select.dispatchEvent(new Event('change'));
            atualizarBannerVinculo();
            const campoMateria = document.getElementById('materia');
            if (campoMateria) {
                campoMateria.value = '';
                campoMateria.readOnly = false;
                campoMateria.focus();
            }
        });

        input.addEventListener('focus', buscar);
        input.addEventListener('input', () => {
            select.value = '';
            select.dispatchEvent(new Event('change'));
            atualizarBannerVinculo();
            buscar();
        });

        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                fecharSugestoes();
                if (dialogLivro?.open) fecharLivro(true);
                return;
            }
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                if (!resultadosVisiveis.length) buscar();
                const disponiveis = resultadosVisiveis.map((m, i) => m.usada ? -1 : i).filter(i => i >= 0);
                if (!disponiveis.length) return;
                const pos = disponiveis.indexOf(indice);
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                destacar(disponiveis[pos < 0 ? (delta > 0 ? 0 : disponiveis.length - 1) : (pos + delta + disponiveis.length) % disponiveis.length]);
            } else if (event.key === 'Enter' && input.getAttribute('aria-expanded') === 'true') {
                event.preventDefault();
                if (indice >= 0 && resultadosVisiveis[indice]) escolher(resultadosVisiveis[indice]);
            }
        });

        criar?.addEventListener('click', () => {
            select.value = '';
            select.dispatchEvent(new Event('change'));
            atualizarBannerVinculo();
            const campoMateria = document.getElementById('materia');
            if (campoMateria) {
                campoMateria.value = input.value.trim();
                campoMateria.readOnly = false;
            }
            if (dialogLivro?.open) dialogLivro.close();
            campoMateria?.focus();
        });

        select.addEventListener('change', atualizarBannerVinculo);
        window.addEventListener('catalogo:atualizado', () => {
            atualizarResumoLivro();
            atualizarBannerVinculo();
            if (dialogLivro?.open) buscar();
        });
        window.addEventListener('storage', e => {
            if (['materiasBuscaV1', 'materiasDominioV1', 'sessoesEstudo', 'reiniciosDominio'].includes(e.key) || window.HistoricoRepository?.ehChave(e.key)) {
                atualizarResumoLivro();
                atualizarBannerVinculo();
                if (dialogLivro?.open || input === document.activeElement) buscar();
            }
        });

        atualizarResumoLivro();
        atualizarBannerVinculo();
    }

    function iniciarGestaoMemorias() {
        const gerenciar = document.getElementById('catalogo-gerenciar');
        const destino = document.getElementById('catalogo-memorias-lista');
        const memoriaStatus = document.getElementById('catalogo-memorias-status');
        const btnConfirmar = document.getElementById('catalogo-confirmar-alias');
        const inputAlias = document.getElementById('catalogo-alias');
        const detailsMemorias = document.querySelector('.catalogo-memorias');

        if (!gerenciar || !destino || !btnConfirmar || !inputAlias) return;

        function memorias() {
            destino.replaceChildren();
            if (!gerenciar.value) return;
            for (const m of window.MateriasBusca.listarMemorias(gerenciar.value)) {
                const li = document.createElement('li');
                const texto = document.createElement('span');
                const remover = document.createElement('button');
                texto.textContent = `${m.tipo === 'aliases' ? 'Nome confirmado' : 'Busca lembrada'}: ${m.texto}`;
                remover.type = 'button';
                remover.className = 'btn btn-sm btn-outline-secondary';
                remover.textContent = 'Remover';
                remover.setAttribute('aria-label', `Remover ${m.texto}`);
                remover.addEventListener('click', async () => {
                    try {
                        await window.MateriasBusca.remover(m.tipo, m.materiaGlobalId, m.normalizado);
                        memorias();
                        window.dispatchEvent(new CustomEvent('memorias:atualizadas'));
                        memoriaStatus.textContent = 'Memória removida. Matéria e histórico preservados.';
                        gerenciar.focus();
                    } catch (erro) {
                        memoriaStatus.textContent = erro.message;
                    }
                });
                li.append(texto, remover);
                destino.appendChild(li);
            }
        }

        function atualizarGestao() {
            try {
                const id = gerenciar.value;
                gerenciar.replaceChildren(...window.MateriasStore.listarMateriasGlobais().map(m => new Option(m.nomeCanonico, m.materiaGlobalId)));
                if ([...gerenciar.options].some(o => o.value === id)) gerenciar.value = id;
                btnConfirmar.disabled = !gerenciar.value;
                memorias();
            } catch (erro) {
                if (memoriaStatus) memoriaStatus.textContent = erro.message;
            }
        }

        gerenciar.addEventListener('change', memorias);
        btnConfirmar.addEventListener('click', async () => {
            try {
                await window.MateriasBusca.confirmarAlias(gerenciar.value, inputAlias.value);
                inputAlias.value = '';
                memorias();
                window.dispatchEvent(new CustomEvent('memorias:atualizadas'));
                if (memoriaStatus) memoriaStatus.textContent = 'Nome alternativo confirmado por você.';
            } catch (erro) {
                if (memoriaStatus) memoriaStatus.textContent = erro.message;
            }
        });

        detailsMemorias?.addEventListener('toggle', atualizarGestao);
        window.addEventListener('memorias:atualizadas', atualizarGestao);
        window.addEventListener('storage', e => {
            if (['materiasBuscaV1', 'materiasDominioV1'].includes(e.key)) atualizarGestao();
        });

        atualizarGestao();
    }

    function iniciarAcervoPagina() {
        const grid = document.getElementById('catalogo-acervo-grid');
        const formNova = document.getElementById('catalogo-nova-global-form');
        const inputNova = document.getElementById('catalogo-nova-global-nome');
        const statusNova = document.getElementById('catalogo-nova-global-status');
        if (!grid) return;

        function renderizarAcervo() {
            try {
                const globais = window.MateriasStore.listarMateriasGlobais();
                const dominios = obterDominios(globais.map(g => g.materiaGlobalId));
                grid.replaceChildren();
                if (!globais.length) {
                    const p = document.createElement('p');
                    p.textContent = 'Ainda não há matérias cadastradas no seu Grimório. Cadastre uma acima ou durante a criação de um projeto.';
                    grid.appendChild(p);
                    return;
                }
                const ordenadas = [...globais].sort((a, b) => {
                    const da = dominios.get(a.materiaGlobalId)?.segundos || 0;
                    const db = dominios.get(b.materiaGlobalId)?.segundos || 0;
                    return db - da || a.nomeCanonico.localeCompare(b.nomeCanonico, 'pt-BR');
                });
                for (const g of ordenadas) {
                    const dom = dominios.get(g.materiaGlobalId) || { nivel: 1, titulo: 'Iniciante', segundos: 0, pontos: 0, percentual: 0 };
                    const card = document.createElement('article');
                    card.className = 'materia-level-card';
                    card.dataset.materiaGlobalId = g.materiaGlobalId;

                    const h3 = document.createElement('h3');
                    h3.textContent = g.nomeCanonico;

                    const nivel = document.createElement('p');
                    nivel.className = 'perfil-nivel';
                    nivel.textContent = `Nível ${dom.nivel}`;

                    const titulo = document.createElement('p');
                    titulo.className = 'perfil-titulo';
                    titulo.textContent = dom.titulo;

                    const tempo = document.createElement('p');
                    tempo.textContent = `${formatarTempo(dom.segundos)} · ${Math.floor(dom.pontos).toLocaleString('pt-BR')} pontos de conhecimento`;

                    const barra = document.createElement('progress');
                    barra.max = 100;
                    barra.value = Math.round(dom.percentual || 0);
                    barra.setAttribute('aria-label', `Avanço de ${g.nomeCanonico}`);

                    const mems = window.MateriasBusca ? window.MateriasBusca.listarMemorias(g.materiaGlobalId) : [];
                    const resumoMem = document.createElement('p');
                    resumoMem.className = 'small text-secondary mt-2 mb-0';
                    resumoMem.textContent = mems.length
                        ? `Nomes/buscas associados: ${mems.map(m => m.texto).join(', ')}`
                        : 'Nenhum nome alternativo cadastrado.';

                    card.append(h3, nivel, titulo, tempo, barra, resumoMem);
                    grid.appendChild(card);
                }
            } catch (erro) {
                if (statusNova) statusNova.textContent = erro.message;
            }
        }

        formNova?.addEventListener('submit', async e => {
            e.preventDefault();
            const nome = inputNova?.value.trim() || '';
            if (!nome) {
                if (statusNova) statusNova.textContent = 'Informe o nome da matéria.';
                inputNova?.focus();
                return;
            }
            try {
                const criada = await window.MateriasStore.criarMateriaGlobal({ nomeCanonico: nome });
                inputNova.value = '';
                if (statusNova) statusNova.textContent = `Matéria "${criada.nomeCanonico}" adicionada ao seu Grimório.`;
                renderizarAcervo();
                window.dispatchEvent(new CustomEvent('memorias:atualizadas'));
                window.dispatchEvent(new CustomEvent('vinculo:atualizar'));
            } catch (erro) {
                if (statusNova) statusNova.textContent = /nome normalizado/.test(erro.message)
                    ? 'Esta matéria já existe no seu Grimório.'
                    : erro.message;
            }
        });

        window.addEventListener('memorias:atualizadas', renderizarAcervo);
        window.addEventListener('storage', e => {
            if (['materiasBuscaV1', 'materiasDominioV1', 'sessoesEstudo', 'reiniciosDominio'].includes(e.key) || window.HistoricoRepository?.ehChave(e.key)) {
                renderizarAcervo();
            }
        });

        renderizarAcervo();
    }
})();
