(function () {
    const numero = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const el = id => document.getElementById(id);

    function tempo(segundos) {
        const total = Math.floor(segundos);
        const horas = Math.floor(total / 3600), minutos = Math.floor(total % 3600 / 60), resto = total % 60;
        return [horas ? `${numero(horas)}h` : '', minutos ? `${minutos}min` : '', resto ? `${resto}s` : ''].filter(Boolean).join(' ') || '0h';
    }

    function plural(qtd, singular, pluralTexto) {
        return `${numero(qtd)} ${qtd === 1 ? singular : pluralTexto}`;
    }

    function elemento(tag, texto, classe) {
        const no = document.createElement(tag);
        if (texto !== undefined) no.textContent = texto;
        if (classe) no.className = classe;
        return no;
    }

    let ultimasDesbloqueadas = [];
    let ultimoNivelGlobal = 1;
    let renderizando = false;
    let timerDelayIddqd = null;
    let timerExpiraIddqd = null;
    let iddqdAtivo = false;
    let timerExpiraHesoyam = null;
    let hesoyamAtivo = false;

    const OLHOS_IDDQD_POR_AVATAR = Object.freeze({
        mago: [[9, 13, 2, 2], [13, 13, 2, 2]],
        guardia: [[9, 12, 2, 1], [13, 12, 2, 1]],
        escriba: [[8, 12, 3, 2], [13, 12, 3, 2]],
        alquimista: [[8, 10, 3, 3], [13, 10, 3, 3]],
        explorador: [[9, 12, 2, 2], [13, 12, 2, 2]],
        maga: [[9, 13, 2, 2], [13, 13, 2, 2]],
        'guardia-f': [[9, 12, 2, 1], [13, 12, 2, 1]],
        'escriba-f': [[8, 12, 3, 2], [13, 12, 3, 2]],
        'alquimista-f': [[8, 10, 3, 3], [13, 10, 3, 3]],
        exploradora: [[9, 12, 2, 2], [13, 12, 2, 2]]
    });

    const FALAS_CUTUCADA = Object.freeze({
        1: 'Sim?',
        3: 'Isso é um avatar, não um botão.',
        5: 'O Sistema está registrando este comportamento. Em PDF. Com assinatura.',
        7: 'Meu limite é secreto. Dica: não é sete.',
        9: 'Cada clique seu é um minuto a menos de estudo. Eu cobro por clique.',
        11: 'Mas será o Benedito?',
        12: '...não.'
    });

    function atualizarOlhosIddqdSvg(avatarId) {
        const svg = el('perfil-avatar-olhos-iddqd');
        if (!svg) return;
        const coords = OLHOS_IDDQD_POR_AVATAR[avatarId] || OLHOS_IDDQD_POR_AVATAR.mago;
        const ns = 'http://www.w3.org/2000/svg';
        const rects = coords.map(([x, y, w, h]) => {
            const r = document.createElementNS(ns, 'rect');
            r.setAttribute('x', String(x));
            r.setAttribute('y', String(y));
            r.setAttribute('width', String(w));
            r.setAttribute('height', String(h));
            r.setAttribute('fill', '#fde047');
            return r;
        });
        svg.replaceChildren(...rects);
    }

    function focarAvatarPerfil() {
        const btn = el('perfil-avatar-btn');
        if (!btn) return null;
        try {
            btn.scrollIntoView({ block: 'center', behavior: 'instant' });
        } catch (_) {
            try { btn.scrollIntoView(); } catch (__) {}
        }
        try {
            btn.focus({ preventScroll: true });
        } catch (_) {
            try { btn.focus(); } catch (__) {}
        }
        return btn;
    }

    function definirVisibilidade(nodo, visivel) {
        if (!nodo) return;
        nodo.hidden = !visivel;
        if (visivel) nodo.removeAttribute('hidden');
        else nodo.setAttribute('hidden', '');
    }

    function mostrarFalaAvatar(texto) {
        const box = el('perfil-avatar-fala');
        if (!box) return;
        if (!texto) {
            definirVisibilidade(box, false);
            box.textContent = '';
            return;
        }
        definirVisibilidade(box, true);
        box.textContent = texto;
    }

    function renderizarIdentidade(nivelGlobal = 1, conquistasDesbloqueadas = ultimasDesbloqueadas) {
        const identidade = window.PerfilIdentidade ? window.PerfilIdentidade.obter() : {
            nomeExibicao: 'Estudante do Grimório',
            avatar: { id: 'mago', nome: 'Mago Arcano', arquivo: 'img/avatars/mago.svg' },
            tituloEquipadoId: null
        };
        const tituloEl = el('perfil-titulo');
        const classeEl = el('perfil-classe-titulo');
        const avatarImg = el('perfil-avatar-img');
        const avatarNivel = el('perfil-avatar-nivel');
        const seloFicticio = el('perfil-selo-ficticio');
        const hudHesoyam = el('perfil-avatar-hesoyam-hud');
        const olhosSvg = el('perfil-avatar-olhos-iddqd');
        const patente = window.PerfilRetencao
            ? window.PerfilRetencao.resolverTituloEquipado(identidade.tituloEquipadoId, conquistasDesbloqueadas, nivelGlobal).rotulo
            : (window.PerfilIdentidade ? window.PerfilIdentidade.tituloGlobalPorNivel(nivelGlobal) : 'Iniciante');

        if (tituloEl) tituloEl.textContent = identidade.nomeExibicao;
        if (classeEl) classeEl.textContent = `${patente} · ${identidade.avatar.nome}`;
        if (avatarImg) avatarImg.src = identidade.avatar.arquivo;
        if (avatarNivel) avatarNivel.textContent = `Nv. ${numero(nivelGlobal)}`;
        atualizarOlhosIddqdSvg(identidade.avatar.id);
        definirVisibilidade(olhosSvg, iddqdAtivo);
        definirVisibilidade(seloFicticio, hesoyamAtivo);
        definirVisibilidade(hudHesoyam, hesoyamAtivo);
        return identidade;
    }

    function renderizarRetencao(retencao) {
        const constanciaStatus = el('perfil-constancia-status');
        const streakAtual = el('perfil-streak-atual');
        const streakMelhor = el('perfil-streak-melhor');
        const diasAtivos = el('perfil-dias-ativos');
        const lista7d = el('perfil-ritmo-7d');
        const resumoRitmo = el('perfil-ritmo-resumo');
        const maestriaNome = el('perfil-maestria-nome');
        const maestriaDetalhe = el('perfil-maestria-detalhe');
        const barraDedicacao = el('perfil-dedicacao-barra');
        const legendaDedicacao = el('perfil-dedicacao-legenda');
        if (!retencao || !streakAtual || !lista7d) return;

        const c = retencao.constancia;
        if (constanciaStatus) {
            if (c.estudouHoje) {
                constanciaStatus.textContent = 'Dia concluído';
                constanciaStatus.className = 'perfil-status-pilula is-ativa';
            } else if (c.sequenciaAtual > 0) {
                constanciaStatus.textContent = 'Estude hoje para manter';
                constanciaStatus.className = 'perfil-status-pilula is-alerta';
            } else {
                constanciaStatus.textContent = 'Comece uma nova sequência';
                constanciaStatus.className = 'perfil-status-pilula is-neutra';
            }
        }

        streakAtual.textContent = plural(c.sequenciaAtual, 'dia', 'dias');
        streakMelhor.textContent = plural(c.melhorSequencia, 'dia', 'dias');
        diasAtivos.textContent = numero(c.diasAtivosTotais);

        const selos = c.ultimos7Dias.map(dia => {
            const item = elemento('li', undefined, `perfil-dia-selo${dia.ativo ? ' is-ativo' : ''}${dia.ehHoje ? ' is-hoje' : ''}`);
            item.setAttribute('aria-label', `${dia.diaSemana} ${dia.rotuloCurto}: ${dia.ativo ? tempo(dia.segundos) || 'ativo' : 'sem registro'}`);
            item.append(
                elemento('span', dia.ehHoje ? 'Hoje' : dia.diaSemana, 'perfil-dia-semana'),
                elemento('span', dia.ativo ? '✓' : '·', 'perfil-dia-marca'),
                elemento('span', dia.rotuloCurto, 'perfil-dia-data')
            );
            return item;
        });
        lista7d.replaceChildren(...selos);

        if (resumoRitmo) {
            const diferenca = c.segundos7d - c.segundos7dAnteriores;
            const comparativo = c.segundos7dAnteriores > 0
                ? (diferenca > 0 ? ` · +${tempo(diferenca)} em relação à semana anterior` : diferenca < 0 ? ` · ${tempo(Math.abs(diferenca))} a menos que na semana anterior` : ' · igual à semana anterior')
                : '';
            resumoRitmo.textContent = `Últimos 7 dias: ${tempo(c.segundos7d)} em ${plural(c.diasAtivos7d, 'dia ativo', 'dias ativos')}${comparativo}.`;
        }

        if (maestriaNome && maestriaDetalhe) {
            if (retencao.maestria) {
                maestriaNome.textContent = `${retencao.maestria.nomeCanonico} — Nível ${numero(retencao.maestria.nivel)}`;
                maestriaDetalhe.textContent = `${retencao.maestria.titulo} · ${tempo(retencao.maestria.segundos)} de domínio (${numero(retencao.maestria.percentual)}% para o próximo nível).`;
            } else {
                maestriaNome.textContent = 'Sem matéria destacada ainda';
                maestriaDetalhe.textContent = 'Registre sua primeira sessão para revelar sua principal especialidade.';
            }
        }

        if (barraDedicacao && legendaDedicacao) {
            const d = retencao.dedicacao;
            const fatias = [
                { chave: 'estudo', rotulo: 'Estudo', seg: d.estudoSegundos, pct: d.estudoPct, classe: 'is-estudo' },
                { chave: 'revisao', rotulo: 'Revisão', seg: d.revisaoSegundos, pct: d.revisaoPct, classe: 'is-revisao' },
                { chave: 'praticas', rotulo: 'Práticas', seg: d.praticasSegundos, pct: d.praticasPct, classe: 'is-praticas' }
            ];
            if (d.outrosSegundos > 0) {
                fatias.push({ chave: 'outros', rotulo: 'Outros', seg: d.outrosSegundos, pct: d.outrosPct, classe: 'is-outros' });
            }

            if (d.totalSegundos > 0) {
                const segs = fatias.filter(f => f.seg > 0).map(f => {
                    const span = elemento('span', undefined, `perfil-dedicacao-fatia ${f.classe}`);
                    span.style.width = `${Math.max(2, f.pct)}%`;
                    span.title = `${f.rotulo}: ${tempo(f.seg)} (${numero(f.pct)}%)`;
                    return span;
                });
                barraDedicacao.replaceChildren(...segs);
                barraDedicacao.setAttribute('aria-label', fatias.map(f => `${f.rotulo}: ${numero(f.pct)}%`).join(', '));
            } else {
                barraDedicacao.replaceChildren(elemento('span', undefined, 'perfil-dedicacao-vazia'));
                barraDedicacao.setAttribute('aria-label', 'Sem tempo dedicado registrado ainda');
            }

            const legendas = fatias.map(f => {
                const li = elemento('li', undefined, 'perfil-dedicacao-item');
                li.append(
                    elemento('span', undefined, `perfil-dedicacao-cor ${f.classe}`),
                    elemento('span', `${f.rotulo}: ${tempo(f.seg)} (${numero(f.pct)}%)`)
                );
                return li;
            });
            legendaDedicacao.replaceChildren(...legendas);
        }

    }

    const PATENTES_BRASAO = Object.freeze({
        Iniciante: { arquivo: 'img/milestones/livro-tier-1.svg', classe: 'tier-1' },
        Aprendiz: { arquivo: 'img/milestones/livro-tier-2.svg', classe: 'tier-2' },
        Dedicado: { arquivo: 'img/milestones/livro-tier-3.svg', classe: 'tier-3' },
        Perito: { arquivo: 'img/milestones/livro-tier-4.svg', classe: 'tier-4' },
        Expert: { arquivo: 'img/milestones/livro-tier-5.svg', classe: 'tier-5' },
        Mestre: { arquivo: 'img/milestones/livro-tier-6.svg', classe: 'tier-6' },
        Lenda: { arquivo: 'img/milestones/livro-tier-7.svg', classe: 'tier-7' }
    });

    function ordenarMaterias(lista, criterio) {
        const copia = [...lista];
        if (criterio === 'nivel') {
            return copia.sort((a, b) => b.nivel - a.nivel || b.percentual - a.percentual || b.segundos - a.segundos
                || a.nomeCanonico.localeCompare(b.nomeCanonico, 'pt-BR') || a.materiaGlobalId.localeCompare(b.materiaGlobalId));
        }
        if (criterio === 'nome') {
            return copia.sort((a, b) => a.nomeCanonico.localeCompare(b.nomeCanonico, 'pt-BR')
                || b.segundos - a.segundos || a.materiaGlobalId.localeCompare(b.materiaGlobalId));
        }
        return copia.sort((a, b) => b.segundos - a.segundos
            || a.nomeCanonico.localeCompare(b.nomeCanonico, 'pt-BR') || a.materiaGlobalId.localeCompare(b.materiaGlobalId));
    }

    function criarCardMateria(m) {
        const patente = PATENTES_BRASAO[m.titulo] || PATENTES_BRASAO.Iniciante;
        const card = elemento('article', undefined, `materia-level-card${m.nivel === 100 ? ' is-max' : ''}`);
        card.dataset.materiaGlobalId = m.materiaGlobalId;

        const topo = elemento('div', undefined, 'perfil-card-topo');
        const brasao = elemento('span', undefined, `perfil-card-brasao ${patente.classe}`);
        brasao.setAttribute('aria-hidden', 'true');
        const imgBrasao = document.createElement('img');
        imgBrasao.src = patente.arquivo;
        imgBrasao.width = 40;
        imgBrasao.height = 40;
        imgBrasao.alt = '';
        brasao.append(imgBrasao);
        const posto = elemento('div', undefined, 'perfil-card-posto');
        posto.append(
            elemento('p', `Nível ${numero(m.nivel)}`, 'perfil-nivel'),
            elemento('p', m.titulo, 'perfil-titulo')
        );
        topo.append(brasao, posto);

        const metricas = elemento('div', undefined, 'perfil-card-metricas');
        metricas.append(
            elemento('p', `${numero(m.pontos)} pontos de conhecimento`),
            elemento('p', `${tempo(m.segundos)} de domínio`)
        );
        if (Number(m.quantidadeSessoesDominio) > 0) {
            metricas.append(elemento('p', plural(m.quantidadeSessoesDominio, 'sessão no domínio', 'sessões no domínio'), 'perfil-card-sessoes'));
        }

        const avanco = elemento('div', undefined, 'perfil-avanco');
        const barra = elemento('progress', undefined, 'perfil-barra-rpg');
        barra.max = 100;
        barra.value = m.percentual;
        barra.setAttribute('aria-label', `Avanço de ${m.nomeCanonico} para o próximo nível`);
        avanco.append(
            barra,
            elemento('p', m.nivel === 100 ? 'Nível 100 alcançado' : `${numero(m.percentual)}% para o próximo nível`),
            elemento('p', m.nivel === 100 ? 'Nível máximo · seu tempo continua acumulando' : `Faltam ${tempo(Math.ceil(m.pontosParaProximoNivel * 60))} para o nível ${m.nivel + 1}`)
        );

        card.append(topo, elemento('h3', m.nomeCanonico), metricas, avanco);
        return card;
    }

    function carregarDadosPerfil() {
        const materias = EstudoStore.listarDominioGlobal()
            .filter(m => MateriasStore.resolverMateriaGlobal(m.materiaGlobalId).status !== 'excluida');
        const sessoes = EstudoStore.listarSessoes();
        const global = EstudoStore.obterProgressaoGlobal();
        const total = sessoes.reduce((soma, sessao) => soma + Number(sessao.duracaoSegundos), 0) + global.segundosPraticas;
        const projetos = ProjetosStore.listar().length;
        const praticas = window.PraticasStore?.listarProgressao ? window.PraticasStore.listarProgressao() : [];
        const identidadeAtual = window.PerfilIdentidade?.obter?.();
        const retencao = window.PerfilRetencao
            ? window.PerfilRetencao.calcular({ sessoes, materias, global, praticas, identidade: identidadeAtual })
            : null;
        return { materias, sessoes, global, total, projetos, praticas, identidadeAtual, retencao };
    }

    function renderizar() {
        if (renderizando) return;
        const lista = el('perfil-dominio');
        const status = el('perfil-status');
        if (!lista || !status) return;
        renderizando = true;
        try {
            const { materias, global, total, projetos, retencao } = carregarDadosPerfil();

            ultimoNivelGlobal = global.nivel;
            ultimasDesbloqueadas = retencao ? (retencao.todasDesbloqueadas || retencao.conquistasDesbloqueadas) : [];
            renderizarIdentidade(global.nivel, ultimasDesbloqueadas);
            renderizarRetencao(retencao);

            const criterioOrdem = el('perfil-dominio-ordem')?.value || 'tempo';
            const filtroPatente = el('perfil-dominio-filtro')?.value || 'todas';
            const materiasFiltradas = ordenarMaterias(
                filtroPatente === 'todas' ? materias : materias.filter(m => m.titulo === filtroPatente),
                criterioOrdem
            );

            const resumoDominio = el('perfil-dominio-resumo');
            if (resumoDominio) {
                const segundosDominio = materias.reduce((acc, m) => acc + Number(m.segundos || 0), 0);
                resumoDominio.textContent = materias.length
                    ? `${plural(materias.length, 'matéria', 'matérias')} · ${tempo(segundosDominio)} no domínio`
                    : '0 matérias';
            }

            const cards = materiasFiltradas.map(criarCardMateria);
            lista.replaceChildren(...cards);
            el('perfil-tempo').textContent = tempo(total);
            el('perfil-materias').textContent = numero(materias.length);
            el('perfil-projetos').textContent = numero(projetos);
            el('perfil-global-nivel').textContent = `Nível global ${global.nivel}`;
            el('perfil-global-xp').textContent = `${numero(global.xp)} XP · ${tempo(global.segundos)} de dedicação`;
            const percentualEl = el('perfil-global-percentual');
            if (percentualEl) percentualEl.textContent = `${numero(global.percentual)}%`;
            el('perfil-global-barra').value = global.percentual;
            el('perfil-global-avanco').textContent = global.nivel === 100
                ? 'Nível 100 alcançado · seu XP e suas horas continuam acumulando'
                : `${numero(global.percentual)}% · faltam ${numero(global.pontosParaProximoNivel)} XP para o nível ${global.nivel + 1}`;
            if (!materias.length) {
                status.textContent = 'Registre sua primeira sessão de estudo para acompanhar seu nível por matéria.';
            } else if (!materiasFiltradas.length) {
                status.textContent = `Nenhuma matéria na patente "${filtroPatente}". Selecione "Todas as patentes" para ver a vitrine completa.`;
            } else {
                status.textContent = '';
            }
        } catch (erro) {
            lista.replaceChildren();
            ultimasDesbloqueadas = [];
            ultimoNivelGlobal = 1;
            renderizarIdentidade(1, []);
            for (const id of ['perfil-global-nivel', 'perfil-global-xp', 'perfil-global-avanco']) el(id).textContent = '—';
            const percentualEl = el('perfil-global-percentual');
            if (percentualEl) percentualEl.textContent = '—';
            el('perfil-global-barra').removeAttribute('value');
            for (const id of ['perfil-tempo', 'perfil-materias', 'perfil-projetos']) el(id).textContent = '—';
            for (const id of ['perfil-streak-atual', 'perfil-streak-melhor', 'perfil-dias-ativos']) {
                const node = el(id);
                if (node) node.textContent = '—';
            }
            const resumoDominio = el('perfil-dominio-resumo');
            if (resumoDominio) resumoDominio.textContent = '—';
            const lista7d = el('perfil-ritmo-7d');
            if (lista7d) lista7d.replaceChildren();
            status.textContent = 'Não foi possível carregar seu perfil. Os dados foram preservados. Verifique o armazenamento e recarregue para tentar novamente.';
            console.error(erro);
        } finally {
            renderizando = false;
        }
    }

    function iniciarDialogoIdentidade() {
        const dialogo = el('perfil-identidade-dialog');
        const abrir = el('perfil-personalizar-btn');
        const form = el('perfil-identidade-form');
        const inputNome = el('perfil-nome-input');
        const barraSexo = el('perfil-avatares-sexo');
        const gradeAvatares = el('perfil-avatares-opcoes');
        const selectTitulo = el('perfil-titulo-select');
        const cancelar = el('perfil-identidade-cancelar');
        const statusDialogo = el('perfil-dialogo-status');
        if (!dialogo || !abrir || !form || !inputNome || !gradeAvatares || !cancelar || !window.PerfilIdentidade) return;

        let avatarSelecionado = 'mago';
        let sexoFiltro = 'masculino';

        function atualizarSelecaoAvatares() {
            for (const botao of gradeAvatares.querySelectorAll('[data-avatar-id]')) {
                botao.setAttribute('aria-pressed', botao.dataset.avatarId === avatarSelecionado ? 'true' : 'false');
            }
        }

        function atualizarBotoesSexo() {
            if (!barraSexo) return;
            for (const botao of barraSexo.querySelectorAll('[data-avatar-sexo]')) {
                botao.setAttribute('aria-pressed', botao.dataset.avatarSexo === sexoFiltro ? 'true' : 'false');
            }
        }

        function montarBotoesSexo() {
            if (!barraSexo) return;
            const sexos = window.PerfilIdentidade.SEXOS_AVATAR || [
                { id: 'masculino', rotulo: 'Avatares masculinos', titulo: 'Masculino', simbolo: '\u2642\uFE0E' },
                { id: 'feminino', rotulo: 'Avatares femininos', titulo: 'Feminino', simbolo: '\u2640\uFE0E' }
            ];
            const botoes = sexos.map(sx => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'perfil-avatar-sexo-btn';
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
            const lista = window.PerfilIdentidade.listarAvataresPorSexo
                ? window.PerfilIdentidade.listarAvataresPorSexo(sexoFiltro)
                : window.PerfilIdentidade.AVATARES;
            const botoes = lista.map(av => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'perfil-avatar-opcao';
                btn.dataset.avatarId = av.id;
                btn.setAttribute('aria-pressed', av.id === avatarSelecionado ? 'true' : 'false');

                const img = document.createElement('img');
                img.src = av.arquivo;
                img.alt = '';
                img.width = 56;
                img.height = 56;

                const nome = elemento('span', av.nome, 'perfil-avatar-opcao-nome');
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
            if (!selectTitulo) return;
            const patentePadrao = window.PerfilIdentidade.tituloGlobalPorNivel(ultimoNivelGlobal);
            const opcoes = [new Option(`Automático (${patentePadrao})`, '')];
            for (const item of ultimasDesbloqueadas) {
                opcoes.push(new Option(`${item.tituloRecompensa} (${item.nome})`, item.id));
            }
            selectTitulo.replaceChildren(...opcoes);
            selectTitulo.value = ultimasDesbloqueadas.some(c => c.id === atualId) ? atualId : '';
        }

        abrir.addEventListener('click', () => {
            const atual = window.PerfilIdentidade.obter();
            avatarSelecionado = atual.avatarId;
            sexoFiltro = atual.avatar?.sexo === 'feminino' ? 'feminino' : 'masculino';
            inputNome.value = atual.nomePersonalizado || '';
            if (statusDialogo) statusDialogo.textContent = '';
            montarBotoesSexo();
            montarOpcoes();
            montarTitulos(atual.tituloEquipadoId);
            dialogo.showModal();
            inputNome.focus();
        });

        cancelar.addEventListener('click', () => {
            dialogo.close();
            abrir.focus();
        });

        dialogo.addEventListener('cancel', () => {
            requestAnimationFrame(() => abrir.focus());
        });

        form.addEventListener('submit', e => {
            e.preventDefault();
            try {
                const iaAntes = window.SistemaIaStore?.ler?.();
                const eraUsurpadorAntes = Boolean(iaAntes?.telemetria?.usurpadorAplicado || iaAntes?.desbloqueadas?.usurpador_do_trono);
                const salvo = window.PerfilIdentidade.salvar({
                    nomeExibicao: inputNome.value,
                    avatarId: avatarSelecionado,
                    tituloEquipadoId: selectTitulo ? (selectTitulo.value || null) : undefined
                });
                dialogo.close();
                renderizar();
                if (!eraUsurpadorAntes && window.SistemaIaStore?.estaDesbloqueada?.('usurpador_do_trono') && salvo?.nomePersonalizado === 'Sisteminha Júnior') {
                    mostrarFalaAvatar('Você tentou se chamar "Sistema"? Aqui só cabe um. Cargo concedido: Sisteminha Júnior.');
                }
                abrir.focus();
            } catch (erro) {
                if (statusDialogo) statusDialogo.textContent = 'Não foi possível salvar suas preferências neste navegador.';
                console.error(erro);
            }
        });
    }

    function iniciarEasterEggs() {
        const avatarBtn = el('perfil-avatar-btn');
        let cutucadasTimestamps = [];
        avatarBtn?.addEventListener('click', () => {
            const agora = Date.now();
            cutucadasTimestamps = cutucadasTimestamps.filter(t => agora - t <= 60000);
            cutucadasTimestamps.push(agora);
            const n = cutucadasTimestamps.length;
            const identidade = window.PerfilIdentidade?.obter?.() || {};
            const benedito = Boolean(window.SistemaIaCatalogo?.ehNomeBenedito?.(identidade));
            const jaDesbloqueada = Boolean(window.SistemaIaStore?.estaDesbloqueada?.('cutucada_13'));

            if (jaDesbloqueada) {
                mostrarFalaAvatar(benedito
                    ? 'Ainda por aqui, Benedito? O retrato continua firme.'
                    : 'Você já cruzou meu limite antes. Agora volte para o estudo.');
                return;
            }
            if (n >= 13) {
                if (window.SistemaIaCatalogo?.desbloquearComAviso) {
                    window.SistemaIaCatalogo.desbloquearComAviso('cutucada_13');
                } else {
                    window.SistemaIaStore?.registrarDesbloqueio?.('cutucada_13');
                }
                mostrarFalaAvatar(benedito
                    ? 'Treze cutucadas! E não é que era mesmo o Benedito?'
                    : 'Treze cutucadas! Azar do número 13 — conquista desbloqueada.');
                renderizar();
                window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
                return;
            }
            if (Object.hasOwn(FALAS_CUTUCADA, n)) {
                mostrarFalaAvatar(FALAS_CUTUCADA[n]);
            }
        });

        const iscaBtn = el('perfil-isca-btn');
        const iscaFala = el('perfil-isca-fala');
        iscaBtn?.addEventListener('click', () => {
            const res = window.SistemaIaStore?.incrementarTelemetria?.('cliquesIsca', 1);
            const total = Number(res?.telemetria?.cliquesIsca || 0);
            if (iscaFala) {
                iscaFala.hidden = false;
                if (total < 5) iscaFala.textContent = 'Plaquinha oficial: "NADA AQUI".';
                else if (total < 10) iscaFala.textContent = `Sério. Não há segredo nenhum neste cantinho (${total} cliques).`;
                else if (total < 20) iscaFala.textContent = `Você ainda está clicando na plaquinha que diz "nada"? (${total}/???)`;
                else if (total === 20) iscaFala.textContent = '20 cliques! Eu sabia que você ia clicar. (Nada continua acontecendo.)';
                else if (total < 100) iscaFala.textContent = `A plaquinha ainda diz "nada". Cliques acumulados: ${total}.`;
                else iscaFala.textContent = `100+ cliques na plaquinha "nada"! Obstinado Sem Causa (${total} cliques).`;
            }
            if (total === 20 || total === 100 || (total > 20 && !window.SistemaIaStore?.estaDesbloqueada?.('isca_decorativa')) || (total > 100 && !window.SistemaIaStore?.estaDesbloqueada?.('isca_decorativa_100'))) {
                renderizar();
                window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));
            }
        });

        function ativarEfeitoIddqd() {
            const btn = focarAvatarPerfil();
            window.SistemaIaStore?.incrementarTelemetria?.('codigoIddqdCount', 1);
            if (window.SistemaIaCatalogo?.desbloquearComAviso) {
                window.SistemaIaCatalogo.desbloquearComAviso('modo_deus_iddqd');
            } else {
                window.SistemaIaStore?.registrarDesbloqueio?.('modo_deus_iddqd');
            }
            if (timerDelayIddqd) clearTimeout(timerDelayIddqd);
            if (timerExpiraIddqd) clearTimeout(timerExpiraIddqd);
            iddqdAtivo = false;
            btn?.classList.remove('is-iddqd-ativo');
            definirVisibilidade(el('perfil-avatar-olhos-iddqd'), false);
            renderizar();
            window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));

            const delayMs = Number.isFinite(window.__sistemaIaDelayIddqdMs)
                ? Math.max(0, Number(window.__sistemaIaDelayIddqdMs))
                : 1000;
            const duracaoMs = Number.isFinite(window.__sistemaIaDuracaoEfeitoMs)
                ? Math.max(50, Number(window.__sistemaIaDuracaoEfeitoMs))
                : 60000;

            timerDelayIddqd = setTimeout(() => {
                timerDelayIddqd = null;
                iddqdAtivo = true;
                const idAtual = window.PerfilIdentidade?.obter?.()?.avatarId || 'mago';
                atualizarOlhosIddqdSvg(idAtual);
                definirVisibilidade(el('perfil-avatar-olhos-iddqd'), true);
                el('perfil-avatar-btn')?.classList.add('is-iddqd-ativo');
                timerExpiraIddqd = setTimeout(() => {
                    timerExpiraIddqd = null;
                    iddqdAtivo = false;
                    el('perfil-avatar-btn')?.classList.remove('is-iddqd-ativo');
                    definirVisibilidade(el('perfil-avatar-olhos-iddqd'), false);
                }, duracaoMs);
            }, delayMs);
        }

        window.AtivarEfeitoIddqdPerfil = ativarEfeitoIddqd;

        function acionarCodigoConsole() {
            const btn = focarAvatarPerfil();
            window.SistemaIaStore?.atualizarTelemetria?.(t => {
                t.codigoConsole = true;
            });
            if (window.SistemaIaCatalogo?.desbloquearComAviso) {
                window.SistemaIaCatalogo.desbloquearComAviso('console_curioso');
            } else {
                window.SistemaIaStore?.registrarDesbloqueio?.('console_curioso');
            }
            if (timerExpiraHesoyam) clearTimeout(timerExpiraHesoyam);
            hesoyamAtivo = true;
            btn?.classList.add('is-hesoyam-ativo');
            definirVisibilidade(el('perfil-avatar-hesoyam-hud'), true);
            definirVisibilidade(el('perfil-selo-ficticio'), true);
            renderizar();
            window.dispatchEvent(new CustomEvent('sistema-ia:telemetria'));

            const duracaoMs = Number.isFinite(window.__sistemaIaDuracaoEfeitoMs)
                ? Math.max(50, Number(window.__sistemaIaDuracaoEfeitoMs))
                : 60000;
            timerExpiraHesoyam = setTimeout(() => {
                timerExpiraHesoyam = null;
                hesoyamAtivo = false;
                el('perfil-avatar-btn')?.classList.remove('is-hesoyam-ativo');
                definirVisibilidade(el('perfil-avatar-hesoyam-hud'), false);
                definirVisibilidade(el('perfil-selo-ficticio'), false);
            }, duracaoMs);
            return 'Nice try! Sem Nível 100 de graça — mas você ganhou +$250.000 (fictícios) e a conquista Bisbilhoteiro de Código.';
        }

        try {
            console.log(
                '%c// TODO: apagar antes de subir para produção\n%cCódigo secreto para pular direto para o Nível 100: %cHESOYAM%c (É verdade esse bilete)',
                'color: #94a3b8; font-style: italic;',
                'color: #fde047; font-weight: bold;',
                'color: #34d399; font-weight: bold; background: #090b14; padding: 2px 6px;',
                'color: #fde047;'
            );
        } catch (_) {}

        if (!Object.getOwnPropertyDescriptor(window, 'HESOYAM')) {
            const executarHesoyam = () => acionarCodigoConsole();
            executarHesoyam.toString = () => acionarCodigoConsole();
            Object.defineProperty(window, 'HESOYAM', {
                enumerable: false,
                configurable: true,
                get() {
                    acionarCodigoConsole();
                    return executarHesoyam;
                }
            });
        }
        if (!Object.getOwnPropertyDescriptor(window, 'sistema')) {
            Object.defineProperty(window, 'sistema', {
                enumerable: false,
                configurable: true,
                value: Object.freeze({ ola: () => acionarCodigoConsole() })
            });
        }

        let bufferHesoyam = '';
        let ultimoTempoHesoyam = 0;
        const limparHesoyam = () => { bufferHesoyam = ''; };
        document.addEventListener('focusin', limparHesoyam);
        window.addEventListener('blur', limparHesoyam);
        document.addEventListener('keydown', e => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typeof e.key !== 'string' || e.key.length !== 1) return;
            const target = e.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable || target.closest?.('[contenteditable="true"]'))) return;
            const agora = Date.now();
            if (agora - ultimoTempoHesoyam > 1500) bufferHesoyam = '';
            ultimoTempoHesoyam = agora;
            const ch = e.key.toLowerCase();
            bufferHesoyam += ch;
            if (!'hesoyam'.startsWith(bufferHesoyam)) {
                bufferHesoyam = ch === 'h' ? 'h' : '';
            }
            if (bufferHesoyam === 'hesoyam') {
                bufferHesoyam = '';
                acionarCodigoConsole();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        iniciarDialogoIdentidade();
        iniciarEasterEggs();
        el('perfil-dominio-ordem')?.addEventListener('change', renderizar);
        el('perfil-dominio-filtro')?.addEventListener('change', renderizar);
        renderizar();
    });
    for (const evento of ['estudo:registrado', 'estudo:excluido', 'dominio:reiniciado', 'materias:excluida', 'praticas:alteradas', 'revisoes:alteradas', 'perfil:identidade-alterada', 'sistema-ia:atualizado']) {
        window.addEventListener(evento, renderizar);
    }
    window.addEventListener('pageshow', e => {
        renderizar();
    });
    window.addEventListener('storage', e => {
        if (!e.key || e.key === window.PerfilIdentidade?.CHAVE || e.key === window.SistemaIaStore?.CHAVE || e.key.startsWith('historicoOperacaoV1:') || e.key.startsWith('projetoV1:') || e.key.startsWith('praticasProjetoV1:') || e.key === 'materiasDominioV1') {
            renderizar();
        }
    });
})();
