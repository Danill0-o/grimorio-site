/* Confirmações do site: sem diálogos nativos e sem executar ações ao cancelar. */
(function () {
    'use strict';
    let sequencia = 0;
    function abrir({ titulo, mensagem, confirmar = 'Confirmar', acao, alternativa, informativo = false }) {
        const existente = document.querySelector('dialog.dialogo-site[open]');
        if (existente) { existente.querySelector('button')?.focus(); return Promise.resolve(false); }
        const anterior = document.activeElement;
        const dialogo = document.createElement('dialog');
        dialogo.className = 'dialogo-site';
        const id = 'dialogo-site-' + ++sequencia;
        dialogo.setAttribute('aria-labelledby', id + '-titulo');
        dialogo.setAttribute('aria-describedby', id + '-mensagem');
        const h = document.createElement('h2'); h.id = id + '-titulo'; h.textContent = titulo;
        const p = document.createElement('p'); p.id = id + '-mensagem'; p.textContent = mensagem;
        const erro = document.createElement('p'); erro.className = 'dialogo-site-erro'; erro.setAttribute('role', 'alert');
        const acoes = document.createElement('div'); acoes.className = 'dialogo-site-acoes';
        const cancelar = document.createElement('button'); cancelar.type = 'button'; cancelar.textContent = informativo ? 'Entendi' : 'Cancelar'; cancelar.dataset.cancelar = '';
        acoes.append(cancelar);
        dialogo.append(h, p, erro, acoes); document.body.append(dialogo);
        let ocupado = false, resultado = false;
        const executar = async callback => {
            if (ocupado) return;
            ocupado = true; erro.textContent = '';
            const botoes = [...acoes.querySelectorAll('button')]; botoes.forEach(b => { b.disabled = true; });
            try {
                if (await callback() === false) throw new Error('Não foi possível concluir. Confira a sessão e tente novamente.');
                resultado = true; dialogo.close();
            } catch (e) { erro.textContent = e.message || 'Não foi possível concluir. Tente novamente.'; }
            finally { ocupado = false; botoes.forEach(b => { b.disabled = false; }); }
        };
        if (alternativa) {
            const b = document.createElement('button'); b.type = 'button'; b.textContent = alternativa.texto; b.dataset.alternativa = '';
            b.addEventListener('click', () => executar(alternativa.acao)); acoes.append(b);
        }
        if (!informativo) {
            const b = document.createElement('button'); b.type = 'button'; b.textContent = confirmar; b.dataset.confirmar = '';
            b.addEventListener('click', () => executar(acao)); acoes.append(b);
        }
        cancelar.addEventListener('click', () => { if (!ocupado) dialogo.close(); });
        dialogo.addEventListener('cancel', e => { if (ocupado) e.preventDefault(); });
        const fechou = new Promise(resolve => dialogo.addEventListener('close', () => {
            dialogo.remove(); if (anterior?.isConnected) anterior.focus({ preventScroll: true }); resolve(resultado);
        }, { once: true }));
        dialogo.showModal(); cancelar.focus(); return fechou;
    }
    window.Dialogos = Object.freeze({ confirmar: abrir, avisar: opcoes => abrir({ ...opcoes, informativo: true }) });
})();
