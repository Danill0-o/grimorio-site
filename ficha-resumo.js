/* Card compacto de avatar, nível global, título equipado e progresso de XP (item 3.5). */
(function () {
    'use strict';

    const el = id => document.getElementById(id);
    const numero = valor => Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    let ultimasDesbloqueadas = [];
    let ultimoNivelGlobal = 1;
    let renderizando = false;
    let modalCriado = null;

    function elemento(tag, texto, classe) {
        const no = document.createElement(tag);
        if (texto !== undefined) no.textContent = texto;
        if (classe) no.className = classe;
        return no;
    }

    function montarCard(raiz) {
        const avatarBtn = document.createElement('button');
        avatarBtn.type = 'button';
        avatarBtn.id = 'ficha-resumo-avatar-btn';
        avatarBtn.className = 'ficha-resumo-avatar-btn';
        avatarBtn.setAttribute('aria-label', 'Personalizar ficha: alterar retrato, nome e título');
        avatarBtn.title = 'Personalizar ficha';

        const img = document.createElement('img');
        img.id = 'ficha-resumo-avatar-img';
        img.src = 'img/avatars/mago.svg';
        img.width = 64;
        img.height = 64;
        img.alt = '';

        const nivel = elemento('span', 'Nv. 1', 'ficha-resumo-nivel');
        nivel.id = 'ficha-resumo-nivel';
        avatarBtn.append(img, nivel);

        const identidade = elemento('div', undefined, 'ficha-resumo-identidade');
        const nome = elemento('p', 'Estudante do Grimório', 'ficha-resumo-nome');
        nome.id = 'ficha-resumo-nome';
        const titulo = elemento('p', 'Iniciante', 'ficha-resumo-titulo');
        titulo.id = 'ficha-resumo-titulo';
        identidade.append(nome, titulo);

        const xpCaixa = elemento('div', undefined, 'ficha-resumo-xp');
        const xpTopo = elemento('div', undefined, 'ficha-resumo-xp-topo');
        const xpTotal = elemento('span', '0 XP', 'ficha-resumo-xp-total');
        xpTotal.id = 'ficha-resumo-xp-total';
        const xpPct = elemento('span', '0%', 'ficha-resumo-xp-pct');
        xpPct.id = 'ficha-resumo-xp-pct';
        xpTopo.append(xpTotal, xpPct);

        const barra = document.createElement('progress');
        barra.id = 'ficha-resumo-xp-barra';
        barra.className = 'ficha-resumo-barra';
        barra.max = 100;
        barra.value = 0;
        barra.setAttribute('aria-label', 'Progresso de XP para o próximo nível global');

        const xpFalta = elemento('p', '—', 'ficha-resumo-xp-falta');
        xpFalta.id = 'ficha-resumo-xp-falta';
        xpCaixa.append(xpTopo, barra, xpFalta);

        raiz.replaceChildren(avatarBtn, identidade, xpCaixa);
    }

    function carregarEstado() {
        const materias = window.EstudoStore?.listarDominioGlobal
            ? window.EstudoStore.listarDominioGlobal()
                .filter(m => !window.MateriasStore?.resolverMateriaGlobal || window.MateriasStore.resolverMateriaGlobal(m.materiaGlobalId).status !== 'excluida')
            : [];
        const sessoes = window.EstudoStore?.listarSessoes ? window.EstudoStore.listarSessoes() : [];
        const global = window.EstudoStore?.obterProgressaoGlobal
            ? window.EstudoStore.obterProgressaoGlobal()
            : { nivel: 1, xp: 0, percentual: 0, pontosParaProximoNivel: 60 };
        const praticas = window.PraticasStore?.listarProgressao ? window.PraticasStore.listarProgressao() : [];
        const identidade = window.PerfilIdentidade?.obter
            ? window.PerfilIdentidade.obter()
            : { nomeExibicao: 'Estudante do Grimório', avatar: { id: 'mago', nome: 'Mago Arcano', arquivo: 'img/avatars/mago.svg' }, tituloEquipadoId: null };
        const retencao = window.PerfilRetencao?.calcular
            ? window.PerfilRetencao.calcular({ sessoes, materias, global, praticas, identidade, persistirOcultas: false })
            : null;
        return { global, identidade, retencao };
    }

    function renderizar() {
        const raiz = el('ficha-resumo');
        if (!raiz || renderizando) return;
        renderizando = true;
        try {
            if (!el('ficha-resumo-avatar-btn')) montarCard(raiz);
            const { global, identidade, retencao } = carregarEstado();
            ultimoNivelGlobal = Number(global.nivel) || 1;
            ultimasDesbloqueadas = retencao?.todasDesbloqueadas || retencao?.conquistasDesbloqueadas || [];

            const tituloResolvido = window.PerfilRetencao?.resolverTituloEquipado
                ? window.PerfilRetencao.resolverTituloEquipado(identidade.tituloEquipadoId, ultimasDesbloqueadas, ultimoNivelGlobal).rotulo
                : (window.PerfilIdentidade?.tituloGlobalPorNivel
                    ? window.PerfilIdentidade.tituloGlobalPorNivel(ultimoNivelGlobal)
                    : 'Iniciante');

            const img = el('ficha-resumo-avatar-img');
            const nivelEl = el('ficha-resumo-nivel');
            const nomeEl = el('ficha-resumo-nome');
            const tituloEl = el('ficha-resumo-titulo');
            const xpTotalEl = el('ficha-resumo-xp-total');
            const xpPctEl = el('ficha-resumo-xp-pct');
            const barraEl = el('ficha-resumo-xp-barra');
            const xpFaltaEl = el('ficha-resumo-xp-falta');

            if (img && identidade.avatar?.arquivo) img.src = identidade.avatar.arquivo;
            if (nivelEl) nivelEl.textContent = `Nv. ${numero(ultimoNivelGlobal)}`;
            if (nomeEl) nomeEl.textContent = identidade.nomeExibicao;
            if (tituloEl) tituloEl.textContent = tituloResolvido;
            if (xpTotalEl) xpTotalEl.textContent = `${numero(global.xp)} XP`;
            if (xpPctEl) xpPctEl.textContent = `${numero(global.percentual)}%`;
            if (barraEl) barraEl.value = global.percentual;
            if (xpFaltaEl) {
                xpFaltaEl.textContent = ultimoNivelGlobal >= 100
                    ? 'Nível 100 alcançado · XP máximo'
                    : `Faltam ${numero(global.pontosParaProximoNivel)} XP para o nível ${ultimoNivelGlobal + 1}`;
            }
        } catch (erro) {
            const nomeEl = el('ficha-resumo-nome');
            const tituloEl = el('ficha-resumo-titulo');
            const xpFaltaEl = el('ficha-resumo-xp-falta');
            if (nomeEl) nomeEl.textContent = 'Estudante do Grimório';
            if (tituloEl) tituloEl.textContent = 'Iniciante';
            if (xpFaltaEl) xpFaltaEl.textContent = 'Resumo indisponível no momento.';
            console.error(erro);
        } finally {
            renderizando = false;
        }
    }

    function garantirModal() {
        if (modalCriado) return modalCriado;
        const existente = el('ficha-resumo-dialog');
        if (existente) {
            modalCriado = existente;
            return modalCriado;
        }

        const dialogo = document.createElement('dialog');
        dialogo.id = 'ficha-resumo-dialog';
        dialogo.className = 'ficha-resumo-dialogo';
        dialogo.setAttribute('aria-labelledby', 'ficha-resumo-dialogo-titulo');

        const form = document.createElement('form');
        form.id = 'ficha-resumo-form';
        form.noValidate = true;

        const titulo = elemento('h2', 'Personalizar ficha');
        titulo.id = 'ficha-resumo-dialogo-titulo';

        const ajuda = elemento('p', 'Defina seu nome no Grimório, escolha um retrato e selecione o título exibido.', 'ficha-resumo-dialogo-ajuda');

        const campoNome = document.createElement('label');
        campoNome.className = 'ficha-resumo-dialogo-campo';
        campoNome.setAttribute('for', 'ficha-resumo-nome-input');
        const rotuloNome = elemento('span', 'Nome de exibição (até 40 caracteres)');
        const inputNome = document.createElement('input');
        inputNome.id = 'ficha-resumo-nome-input';
        inputNome.name = 'nomeExibicao';
        inputNome.type = 'text';
        inputNome.maxLength = 40;
        inputNome.placeholder = 'Estudante do Grimório';
        inputNome.autocomplete = 'nickname';
        campoNome.append(rotuloNome, inputNome);

        const grupoAvatares = document.createElement('fieldset');
        grupoAvatares.className = 'ficha-resumo-avatares-grupo';
        const legenda = elemento('legend', 'Escolha seu retrato');
        const barraSexo = elemento('div', undefined, 'ficha-resumo-avatares-sexo');
        barraSexo.id = 'ficha-resumo-avatares-sexo';
        barraSexo.setAttribute('role', 'group');
        barraSexo.setAttribute('aria-label', 'Filtrar avatares por sexo');
        const gradeAvatares = elemento('div', undefined, 'ficha-resumo-avatares-opcoes');
        gradeAvatares.id = 'ficha-resumo-avatares-opcoes';
        grupoAvatares.append(legenda, barraSexo, gradeAvatares);

        const campoTitulo = document.createElement('label');
        campoTitulo.className = 'ficha-resumo-dialogo-campo ficha-resumo-dialogo-campo-espaco';
        campoTitulo.setAttribute('for', 'ficha-resumo-titulo-select');
        const rotuloTitulo = elemento('span', 'Título exibido na ficha');
        const selectTitulo = document.createElement('select');
        selectTitulo.id = 'ficha-resumo-titulo-select';
        selectTitulo.name = 'tituloEquipadoId';
        campoTitulo.append(rotuloTitulo, selectTitulo);

        const statusDialogo = elemento('p', '', 'ficha-resumo-dialogo-erro');
        statusDialogo.id = 'ficha-resumo-dialogo-status';
        statusDialogo.setAttribute('role', 'alert');

        const acoes = elemento('div', undefined, 'ficha-resumo-dialogo-acoes');
        const btnCancelar = elemento('button', 'Cancelar', 'btn btn-outline-secondary');
        btnCancelar.type = 'button';
        btnCancelar.id = 'ficha-resumo-cancelar';

        const btnSalvar = elemento('button', 'Salvar ficha', 'btn');
        btnSalvar.type = 'submit';
        btnSalvar.id = 'ficha-resumo-salvar';

        acoes.append(btnCancelar, btnSalvar);
        form.append(titulo, ajuda, campoNome, grupoAvatares, campoTitulo, statusDialogo, acoes);
        dialogo.append(form);
        document.body.append(dialogo);

        let avatarSelecionado = 'mago';
        let sexoFiltro = 'masculino';

        function atualizarSelecaoAvatares() {
            for (const botao of gradeAvatares.querySelectorAll('[data-avatar-id]')) {
                botao.setAttribute('aria-pressed', botao.dataset.avatarId === avatarSelecionado ? 'true' : 'false');
            }
        }

        function atualizarBotoesSexo() {
            for (const botao of barraSexo.querySelectorAll('[data-avatar-sexo]')) {
                botao.setAttribute('aria-pressed', botao.dataset.avatarSexo === sexoFiltro ? 'true' : 'false');
            }
        }

        function montarBotoesSexo() {
            const sexos = window.PerfilIdentidade?.SEXOS_AVATAR || [
                { id: 'masculino', rotulo: 'Avatares masculinos', titulo: 'Masculino', simbolo: '\u2642\uFE0E' },
                { id: 'feminino', rotulo: 'Avatares femininos', titulo: 'Feminino', simbolo: '\u2640\uFE0E' }
            ];
            const botoes = sexos.map(sx => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ficha-resumo-avatar-sexo-btn';
                btn.dataset.avatarSexo = sx.id;
                btn.setAttribute('aria-label', sx.rotulo);
                btn.title = sx.titulo;
                btn.setAttribute('aria-pressed', sx.id === sexoFiltro ? 'true' : 'false');
                btn.textContent = sx.simbolo;
                btn.addEventListener('click', () => {
                    if (sexoFiltro === sx.id) return;
                    sexoFiltro = sx.id;
                    atualizarBotoesSexo();
                    montarOpcoes();
                });
                return btn;
            });
            barraSexo.replaceChildren(...botoes);
        }

        function montarOpcoes() {
            const lista = window.PerfilIdentidade?.listarAvataresPorSexo
                ? window.PerfilIdentidade.listarAvataresPorSexo(sexoFiltro)
                : (window.PerfilIdentidade?.AVATARES || []);
            const botoes = lista.map(av => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ficha-resumo-avatar-opcao';
                btn.dataset.avatarId = av.id;
                btn.setAttribute('aria-pressed', av.id === avatarSelecionado ? 'true' : 'false');

                const img = document.createElement('img');
                img.src = av.arquivo;
                img.alt = '';
                img.width = 56;
                img.height = 56;

                const nome = elemento('span', av.nome, 'ficha-resumo-avatar-opcao-nome');
                btn.append(img, nome);
                btn.addEventListener('click', () => {
                    avatarSelecionado = av.id;
                    atualizarSelecaoAvatares();
                });
                return btn;
            });
            gradeAvatares.replaceChildren(...botoes);
        }

        function montarTitulos(atualId) {
            const patentePadrao = window.PerfilIdentidade?.tituloGlobalPorNivel
                ? window.PerfilIdentidade.tituloGlobalPorNivel(ultimoNivelGlobal)
                : 'Iniciante';
            const opcoes = [new Option(`Automático (${patentePadrao})`, '')];
            for (const item of ultimasDesbloqueadas) {
                opcoes.push(new Option(`${item.tituloRecompensa} (${item.nome})`, item.id));
            }
            selectTitulo.replaceChildren(...opcoes);
            selectTitulo.value = ultimasDesbloqueadas.some(c => c.id === atualId) ? atualId : '';
        }

        const devolverFoco = () => {
            el('ficha-resumo-avatar-btn')?.focus();
        };

        btnCancelar.addEventListener('click', () => {
            dialogo.close();
            devolverFoco();
        });

        dialogo.addEventListener('cancel', () => {
            requestAnimationFrame(devolverFoco);
        });

        form.addEventListener('submit', e => {
            e.preventDefault();
            if (!window.PerfilIdentidade?.salvar) return;
            try {
                window.PerfilIdentidade.salvar({
                    nomeExibicao: inputNome.value,
                    avatarId: avatarSelecionado,
                    tituloEquipadoId: selectTitulo.value || null
                });
                dialogo.close();
                renderizar();
                devolverFoco();
            } catch (erro) {
                statusDialogo.textContent = 'Não foi possível salvar suas preferências neste navegador.';
                console.error(erro);
            }
        });

        dialogo._prepararAbertura = () => {
            renderizar();
            const atual = window.PerfilIdentidade?.obter
                ? window.PerfilIdentidade.obter()
                : { avatarId: 'mago', avatar: { sexo: 'masculino' }, nomePersonalizado: '', tituloEquipadoId: null };
            avatarSelecionado = atual.avatarId;
            sexoFiltro = atual.avatar?.sexo === 'feminino' ? 'feminino' : 'masculino';
            inputNome.value = atual.nomePersonalizado || '';
            statusDialogo.textContent = '';
            montarBotoesSexo();
            montarOpcoes();
            montarTitulos(atual.tituloEquipadoId);
        };

        modalCriado = dialogo;
        return modalCriado;
    }

    function iniciar() {
        const raiz = el('ficha-resumo');
        if (!raiz) return;
        montarCard(raiz);
        renderizar();

        const btn = el('ficha-resumo-avatar-btn');
        btn?.addEventListener('click', () => {
            if (!window.PerfilIdentidade) return;
            const dialogo = garantirModal();
            dialogo._prepararAbertura();
            dialogo.showModal();
            el('ficha-resumo-nome-input')?.focus();
        });
    }

    document.addEventListener('DOMContentLoaded', iniciar);
    for (const evento of [
        'estudo:registrado', 'estudo:excluido', 'dominio:reiniciado',
        'materias:excluida', 'praticas:alteradas', 'revisoes:alteradas',
        'perfil:identidade-alterada', 'sistema-ia:atualizado'
    ]) {
        window.addEventListener(evento, renderizar);
    }
    window.addEventListener('pageshow', renderizar);
    window.addEventListener('storage', e => {
        if (!e.key
            || e.key === window.PerfilIdentidade?.CHAVE
            || e.key === window.SistemaIaStore?.CHAVE
            || e.key.startsWith('historicoOperacaoV1:')
            || e.key.startsWith('projetoV1:')
            || e.key.startsWith('praticasProjetoV1:')
            || e.key === 'materiasDominioV1') {
            renderizar();
        }
    });
})();
