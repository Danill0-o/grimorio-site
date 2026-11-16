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
        const patente = window.PerfilRetencao
            ? window.PerfilRetencao.resolverTituloEquipado(identidade.tituloEquipadoId, conquistasDesbloqueadas, nivelGlobal).rotulo
            : (window.PerfilIdentidade ? window.PerfilIdentidade.tituloGlobalPorNivel(nivelGlobal) : 'Iniciante');

        if (tituloEl) tituloEl.textContent = identidade.nomeExibicao;
        if (classeEl) classeEl.textContent = `${patente} · ${identidade.avatar.nome}`;
        if (avatarImg) avatarImg.src = identidade.avatar.arquivo;
        if (avatarNivel) avatarNivel.textContent = `Nv. ${numero(nivelGlobal)}`;
        return identidade;
    }

    function renderizarRetencao(retencao, identidade) {
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
        const resumoConquistas = el('perfil-conquistas-resumo');
        const listaConquistas = el('perfil-conquistas-lista');

        if (!retencao || !streakAtual || !lista7d || !listaConquistas) return;

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
        });

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
                item.desbloqueada ? `Desbloqueada · Título: ${item.tituloRecompensa}` : `Bloqueada · ${item.progresso}`,
                'perfil-conquista-status'
            );
            card.append(topo, criterio, status);

            if (item.desbloqueada && window.PerfilIdentidade) {
                const equipado = identidade.tituloEquipadoId === item.id;
                const btn = elemento('button', equipado ? 'Título equipado' : `Equipar "${item.tituloRecompensa}"`, 'btn btn-outline-secondary perfil-conquista-equipar');
                btn.type = 'button';
                btn.setAttribute('aria-pressed', equipado ? 'true' : 'false');
                btn.addEventListener('click', () => {
                    window.PerfilIdentidade.salvar({ tituloEquipadoId: equipado ? null : item.id });
                });
                card.append(btn);
            }
            return card;
        });
        listaConquistas.replaceChildren(...cardsConquistas);
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

    function renderizar() {
        const lista = el('perfil-dominio');
        const status = el('perfil-status');
        if (!lista || !status) return;
        try {
            const materias = EstudoStore.listarDominioGlobal()
                .filter(m => MateriasStore.resolverMateriaGlobal(m.materiaGlobalId).status !== 'excluida');
            const sessoes = EstudoStore.listarSessoes();
            const global = EstudoStore.obterProgressaoGlobal();
            const total = sessoes.reduce((soma, sessao) => soma + Number(sessao.duracaoSegundos), 0) + global.segundosPraticas;
            const projetos = ProjetosStore.listar().length;
            const praticas = window.PraticasStore?.listarProgressao ? window.PraticasStore.listarProgressao() : [];

            const retencao = window.PerfilRetencao
                ? window.PerfilRetencao.calcular({ sessoes, materias, global, praticas })
                : null;

            ultimoNivelGlobal = global.nivel;
            ultimasDesbloqueadas = retencao ? retencao.conquistasDesbloqueadas : [];
            const identidade = renderizarIdentidade(global.nivel, ultimasDesbloqueadas);
            renderizarRetencao(retencao, identidade);

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
            const listaConquistas = el('perfil-conquistas-lista');
            if (listaConquistas) listaConquistas.replaceChildren();
            const lista7d = el('perfil-ritmo-7d');
            if (lista7d) lista7d.replaceChildren();
            status.textContent = 'Não foi possível carregar seu perfil. Os dados foram preservados. Verifique o armazenamento e recarregue para tentar novamente.';
            console.error(erro);
        }
    }

    function iniciarDialogoIdentidade() {
        const dialogo = el('perfil-identidade-dialog');
        const abrir = el('perfil-personalizar-btn');
        const form = el('perfil-identidade-form');
        const inputNome = el('perfil-nome-input');
        const gradeAvatares = el('perfil-avatares-opcoes');
        const selectTitulo = el('perfil-titulo-select');
        const cancelar = el('perfil-identidade-cancelar');
        const statusDialogo = el('perfil-dialogo-status');
        if (!dialogo || !abrir || !form || !inputNome || !gradeAvatares || !cancelar || !window.PerfilIdentidade) return;

        let avatarSelecionado = 'mago';

        function atualizarSelecaoAvatares() {
            for (const botao of gradeAvatares.querySelectorAll('[data-avatar-id]')) {
                botao.setAttribute('aria-pressed', botao.dataset.avatarId === avatarSelecionado ? 'true' : 'false');
            }
        }

        function montarOpcoes() {
            const botoes = window.PerfilIdentidade.AVATARES.map(av => {
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
            inputNome.value = atual.nomePersonalizado || '';
            if (statusDialogo) statusDialogo.textContent = '';
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
                window.PerfilIdentidade.salvar({
                    nomeExibicao: inputNome.value,
                    avatarId: avatarSelecionado,
                    tituloEquipadoId: selectTitulo ? (selectTitulo.value || null) : undefined
                });
                dialogo.close();
                renderizar();
                abrir.focus();
            } catch (erro) {
                if (statusDialogo) statusDialogo.textContent = 'Não foi possível salvar suas preferências neste navegador.';
                console.error(erro);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        iniciarDialogoIdentidade();
        el('perfil-conquistas-filtro')?.addEventListener('change', renderizar);
        el('perfil-dominio-ordem')?.addEventListener('change', renderizar);
        el('perfil-dominio-filtro')?.addEventListener('change', renderizar);
        renderizar();
    });
    for (const evento of ['estudo:registrado', 'estudo:excluido', 'dominio:reiniciado', 'materias:excluida', 'praticas:alteradas', 'perfil:identidade-alterada', 'pageshow']) {
        window.addEventListener(evento, renderizar);
    }
    window.addEventListener('storage', e => {
        if (!e.key || e.key === window.PerfilIdentidade?.CHAVE || e.key.startsWith('historicoOperacaoV1:') || e.key.startsWith('projetoV1:') || e.key.startsWith('praticasProjetoV1:') || e.key === 'materiasDominioV1') {
            renderizar();
        }
    });
})();
