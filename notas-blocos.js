(function () {
    const CHAVE = 'notasBlocosV1';
    const contextos = new Map();
    let dialogo, campo, contador, erro, alvo;

    function ler() {
        const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(CHAVE) || '{}');
        if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Notas inválidas');
        return valor;
    }

    function texto(bloco) {
        try { return ler()[bloco.blocoId]?.texto ?? String(bloco.topico || ''); }
        catch (_) { return String(bloco.topico || ''); }
    }

    function salvar(contexto, valor) {
        if (!contexto.blocoId) throw new Error('Integridade: blocoId obrigatório');
        window.MateriasStore.obterProjetoMateria(contexto.projetoMateriaId, contexto.projetoId);
        const notas = ler();
        // Guardar uma nota vazia também permite apagar um tópico legado.
        notas[contexto.blocoId] = { ...contexto, texto: String(valor).slice(0, 140), atualizadoEm: new Date().toISOString() };
        (window.ProjetoStorage || localStorage).setItem(CHAVE, JSON.stringify(notas));
    }

    function preparar(bloco, contexto) {
        if (!bloco.blocoId) return;
        contextos.set(bloco.blocoId, { projetoId: bloco.projetoId, projetoMateriaId: bloco.projetoMateriaId,
            blocoId: bloco.blocoId, materia: bloco.materia, ...contexto });
    }

    function criarBotao(bloco, contexto) {
        preparar(bloco, contexto);
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'nota-botao';
        botao.dataset.notaBloco = bloco.blocoId;
        botao.textContent = 'T';
        const preenchida = Boolean(texto(bloco));
        botao.classList.toggle('nota-preenchida', preenchida);
        botao.title = `${preenchida ? 'Editar anotação de' : 'Anotar'} ${bloco.materia} · ${contexto.diaJornada} · bloco ${contexto.numero}`;
        botao.setAttribute('aria-label', botao.title);
        botao.setAttribute('aria-haspopup', 'dialog');
        botao.addEventListener('click', () => abrir(bloco, contexto, botao));
        return botao;
    }

    function montar() {
        dialogo = document.createElement('dialog');
        dialogo.className = 'nota-balao';
        dialogo.setAttribute('aria-labelledby', 'nota-titulo');
        dialogo.innerHTML = '<form><h2 id="nota-titulo"></h2><label for="nota-texto">Tópicos estudados</label><textarea id="nota-texto" maxlength="140" rows="4" placeholder="Anote aqui os tópicos estudados…" aria-describedby="nota-contador"></textarea><small id="nota-contador"></small><p id="nota-erro" role="alert"></p><div class="nota-acoes"><button type="button" id="nota-cancelar">Cancelar</button><button type="submit">Salvar nota</button></div></form>';
        document.body.append(dialogo);
        campo = dialogo.querySelector('textarea');
        contador = dialogo.querySelector('#nota-contador');
        erro = dialogo.querySelector('#nota-erro');
        campo.addEventListener('input', () => { contador.textContent = `${campo.value.length}/140 caracteres`; });
        dialogo.querySelector('#nota-cancelar').addEventListener('click', () => dialogo.close());
        dialogo.addEventListener('close', () => {
            const botao = Array.from(document.querySelectorAll('[data-nota-bloco]')).find(b => b.dataset.notaBloco === alvo.blocoId);
            botao?.focus({ preventScroll: true });
        });
        dialogo.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            try {
                salvar(alvo, campo.value);
                dialogo.close();
                window.dispatchEvent(new Event('notas:alteradas'));
            } catch (_) { erro.textContent = 'Não foi possível salvar. Sua nota continua aqui; tente novamente.'; }
        });
        window.addEventListener('resize', () => { if (dialogo.open) posicionar(); });
    }

    function posicionar(botao) {
        const limite = 12;
        const rect = botao?.getBoundingClientRect();
        const largura = dialogo.offsetWidth;
        const altura = dialogo.offsetHeight;
        dialogo.style.left = `${Math.max(limite, Math.min(rect ? rect.right + 14 : (innerWidth - largura) / 2, innerWidth - largura - limite))}px`;
        dialogo.style.top = `${Math.max(limite, Math.min(rect ? rect.top : (innerHeight - altura) / 2, innerHeight - altura - limite))}px`;
    }

    function abrir(bloco, contexto, botao) {
        if (!dialogo) montar();
        alvo = contextos.get(bloco.blocoId);
        dialogo.querySelector('h2').textContent = `${bloco.materia} · ${contexto.diaJornada.replace('dia', 'Dia ')} · bloco ${contexto.numero}`;
        erro.textContent = '';
        try { ler(); campo.value = texto(bloco); } catch (_) { campo.value = ''; erro.textContent = 'Não foi possível ler as notas salvas. Nenhum dado foi substituído.'; }
        contador.textContent = `${campo.value.length}/140 caracteres`;
        dialogo.showModal();
        posicionar(botao);
        campo.focus();
    }

    function preservarLegadas(plano) {
        Object.entries(plano || {}).forEach(([diaJornada, blocos]) => blocos.forEach(bloco => {
            if (bloco.blocoId && bloco.topico && !ler()[bloco.blocoId]) {
                salvar({ blocoId: bloco.blocoId, projetoId: bloco.projetoId, projetoMateriaId: bloco.projetoMateriaId, materia: bloco.materia, diaJornada }, bloco.topico);
            }
        }));
    }
    window.NotasBlocos = { criarBotao, texto, preparar, salvar, preservarLegadas };
})();
