(function () {
    const numero = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
    const camposHistorico = ['historico-estudo', 'historico-revisao', 'historico-sessoes', 'historico-outros', 'historico-primeira', 'historico-recente'];
    function tempo(segundos) {
        const total = Math.floor(segundos);
        const horas = Math.floor(total / 3600), minutos = Math.floor(total % 3600 / 60), resto = total % 60;
        return [horas ? `${numero(horas)}h` : '', minutos ? `${minutos}min` : '', resto ? `${resto}s` : ''].filter(Boolean).join(' ') || '0h';
    }
    function elemento(tag, texto, classe) {
        const el = document.createElement(tag);
        if (texto !== undefined) el.textContent = texto;
        if (classe) el.className = classe;
        return el;
    }
    function renderizarHistorico(sessoes) {
        let estudo = 0, revisao = 0, outros = 0;
        let primeira = null, recente = null;
        for (const sessao of sessoes) {
            const segundos = Number(sessao.duracaoSegundos);
            if (EstudoStore.sessaoEstudoElegivel(sessao)) estudo += segundos;
            else if (sessao.tipo === 'revisao' || ['cronometro-revisao', 'conclusao-revisao'].includes(sessao.origem)) revisao += segundos;
            else outros += segundos;
            const inicio = new Date(sessao.inicio);
            if (primeira === null || inicio < primeira) primeira = inicio;
            if (recente === null || inicio > recente) recente = inicio;
        }
        document.getElementById('historico-estudo').textContent = tempo(estudo);
        document.getElementById('historico-revisao').textContent = tempo(revisao);
        document.getElementById('historico-outros').textContent = tempo(outros);
        document.getElementById('historico-outros-item').hidden = outros === 0;
        document.getElementById('historico-sessoes').textContent = numero(sessoes.length);
        for (const [id, data] of [['historico-primeira', primeira], ['historico-recente', recente]]) {
            const el = document.getElementById(id);
            el.textContent = data ? dataHora.format(data) : 'Ainda sem sessões';
            if (data) el.dateTime = data.toISOString();
            else el.removeAttribute('datetime');
        }
        document.getElementById('historico-global-status').textContent = sessoes.length ? '' : 'Registre sua primeira sessão em um projeto para começar sua trajetória.';
    }
    function renderizar() {
        const lista = document.getElementById('perfil-dominio');
        const status = document.getElementById('perfil-status');
        const materiaComFoco = document.activeElement?.closest('#perfil-dominio article')?.dataset.materiaGlobalId;
        try {
            const materias = EstudoStore.listarDominioGlobal().sort((a, b) => b.segundos - a.segundos
                || a.nomeCanonico.localeCompare(b.nomeCanonico, 'pt-BR') || a.materiaGlobalId.localeCompare(b.materiaGlobalId));
            const sessoes = EstudoStore.listarSessoes();
            const total = sessoes.reduce((soma, sessao) => soma + Number(sessao.duracaoSegundos), 0);
            const projetos = ProjetosStore.listar().length;
            const cards = materias.map(m => {
                const card = elemento('article', undefined, 'materia-level-card');
                card.dataset.materiaGlobalId = m.materiaGlobalId;
                const avanco = elemento('div', undefined, 'perfil-avanco');
                const barra = elemento('progress');
                barra.max = 100; barra.value = m.percentual;
                barra.setAttribute('aria-label', `Avanço de ${m.nomeCanonico} para o próximo nível`);
                avanco.append(barra, elemento('p', m.nivel === 100 ? 'Nível 100 alcançado' : `${numero(m.percentual)}% para o próximo nível`),
                    elemento('p', m.nivel === 100 ? 'Nível máximo · seu tempo continua acumulando' : `Faltam ${tempo(Math.ceil(m.pontosParaProximoNivel * 60))} para o nível ${m.nivel + 1}`));
                const reset = elemento('button', 'Zerar domínio', 'btn dominio-reset');
                reset.type = 'button';
                reset.disabled = m.pontos <= 0;
                reset.setAttribute('aria-label', `Zerar domínio de ${m.nomeCanonico}`);
                reset.addEventListener('click', () => abrirReset(m.materiaGlobalId, m.nomeCanonico));
                card.append(elemento('h3', m.nomeCanonico), elemento('p', `Nível ${numero(m.nivel)}`, 'perfil-nivel'),
                    elemento('p', m.titulo, 'perfil-titulo'), elemento('p', `${numero(m.pontos)} pontos de conhecimento`),
                    elemento('p', `${tempo(m.segundos)} de domínio`), avanco, reset);
                return card;
            });
            lista.replaceChildren(...cards);
            document.getElementById('perfil-tempo').textContent = tempo(total);
            document.getElementById('perfil-materias').textContent = numero(materias.length);
            document.getElementById('perfil-projetos').textContent = numero(projetos);
            const global = EstudoStore.obterProgressaoGlobal();
            document.getElementById('perfil-global-nivel').textContent = `Nível global ${global.nivel}`;
            document.getElementById('perfil-global-xp').textContent = `${numero(global.xp)} XP · ${tempo(global.segundos)} de dedicação`;
            document.getElementById('perfil-global-barra').value = global.percentual;
            document.getElementById('perfil-global-avanco').textContent = global.nivel === 100
                ? 'Nível 100 alcançado · seu XP e suas horas continuam acumulando'
                : `${numero(global.percentual)}% · faltam ${tempo(Math.ceil(global.pontosParaProximoNivel * 60))} para o nível ${global.nivel + 1}`;
            renderizarHistorico(sessoes);
            status.textContent = materias.length ? '' : 'Seu domínio começa com a primeira sessão. Abra um projeto e registre seu estudo.';
            if (materiaComFoco) {
                const card = cards.find(el => el.dataset.materiaGlobalId === materiaComFoco);
                const botao = card?.querySelector('.dominio-reset');
                (botao && !botao.disabled ? botao : document.getElementById('reiniciar-dominio')).focus({ preventScroll: true });
            }
        } catch (erro) {
            lista.replaceChildren();
            for (const id of ['perfil-global-nivel', 'perfil-global-xp', 'perfil-global-avanco']) document.getElementById(id).textContent = '—';
            document.getElementById('perfil-global-barra').removeAttribute('value');
            for (const id of ['perfil-tempo', 'perfil-materias', 'perfil-projetos']) document.getElementById(id).textContent = '—';
            for (const id of camposHistorico) {
                const el = document.getElementById(id);
                el.textContent = '—';
                el.removeAttribute('datetime');
            }
            document.getElementById('historico-outros-item').hidden = true;
            document.getElementById('historico-global-status').textContent = 'Não foi possível carregar seu histórico. Recarregue para tentar novamente.';
            status.textContent = 'Não foi possível carregar seu perfil. Os dados foram preservados. Verifique o armazenamento e recarregue para tentar novamente.';
            if (materiaComFoco) document.getElementById('reiniciar-dominio').focus({ preventScroll: true });
            console.error(erro);
        }
    }
    function abrirReset(id = null, nome = '') {
        const dialogo = document.getElementById('reset-dominio-dialogo');
        dialogo.dataset.materia = id || '';
        document.getElementById('reset-dominio-alvo').textContent = id ? `Zerar o domínio de ${nome}?` : 'Zerar o domínio de todas as matérias?';
        document.getElementById('reset-dominio-confirmacao').value = '';
        document.getElementById('reset-dominio-executar').disabled = true;
        dialogo.showModal();
        document.getElementById('reset-dominio-cancelar').focus();
    }
    document.addEventListener('DOMContentLoaded', () => {
        const dialogo = document.getElementById('reset-dominio-dialogo');
        const entrada = document.getElementById('reset-dominio-confirmacao');
        const confirmar = document.getElementById('reset-dominio-executar');
        document.getElementById('reiniciar-dominio').addEventListener('click', () => abrirReset());
        entrada.addEventListener('input', () => { confirmar.disabled = entrada.value.trim() !== 'ZERAR'; });
        document.getElementById('reset-dominio-cancelar').addEventListener('click', () => dialogo.close());
        dialogo.addEventListener('close', () => {
            const card = [...document.querySelectorAll('#perfil-dominio article')].find(el => el.dataset.materiaGlobalId === dialogo.dataset.materia);
            const botao = card?.querySelector('.dominio-reset');
            (botao && !botao.disabled ? botao : document.getElementById('reiniciar-dominio')).focus();
        });
        document.getElementById('reset-dominio-form').addEventListener('submit', event => {
            event.preventDefault();
            if (entrada.value.trim() !== 'ZERAR') return;
            try {
                EstudoStore.reiniciarDominio(dialogo.dataset.materia || null);
                dialogo.close();
                document.getElementById('dominio-status').textContent = 'Domínio reiniciado. Novas sessões voltarão a acumular conhecimento.';
            } catch (erro) {
                document.getElementById('dominio-status').textContent = 'Não foi possível reiniciar o domínio. Tente novamente.';
                console.error(erro);
            }
        });
    });
    document.addEventListener('DOMContentLoaded', renderizar);
    for (const evento of ['estudo:registrado', 'estudo:excluido', 'dominio:reiniciado', 'storage', 'pageshow']) window.addEventListener(evento, renderizar);
})();
