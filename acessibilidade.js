/* Complementos compartilhados, sem interferir nas regras de estudo. */
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const dialogo = document.querySelector('dialog[open]');
        if (!dialogo) return;
        const controles = [...dialogo.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
            .filter(el => !el.disabled && el.tabIndex >= 0 && el.checkVisibility());
        const primeiro = controles[0], ultimo = controles.at(-1);
        if (!primeiro) { event.preventDefault(); dialogo.focus(); return; }
        if (event.shiftKey && (document.activeElement === primeiro || !dialogo.contains(document.activeElement))) { event.preventDefault(); ultimo.focus(); }
        else if (!event.shiftKey && (document.activeElement === ultimo || !dialogo.contains(document.activeElement))) { event.preventDefault(); primeiro.focus(); }
    });
    const main = document.querySelector('main');
    if (main) {
        main.id ||= 'conteudo-principal';
        main.tabIndex = -1;
        const link = document.createElement('a');
        link.className = 'skip-link'; link.href = `#${main.id}`; link.textContent = 'Pular para o conteúdo';
        link.addEventListener('click', () => main.focus());
        document.body.prepend(link);
    }
    const afinidade = document.getElementById('afinidade');
    if (afinidade) {
        const atualizar = () => afinidade.setAttribute('aria-valuetext', ({'0.5':'Baixa','1':'Média','1.5':'Alta'})[afinidade.value] || afinidade.value);
        afinidade.addEventListener('input', atualizar); atualizar();
    }
    document.querySelectorAll('canvas').forEach(canvas => { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Proporção dos pesos das matérias. Os mesmos valores estão na tabela de planejamento.'); });
});


/* Seletor de Temas Pixel Art & RPG (Taverna, Arcano, Floresta + CRT Scanlines) */
(function iniciarTemasPixelArt() {
    const CHAVE_TEMA = 'grimorioTemaPixelV1';
    const CHAVE_CRT = 'grimorioScanlinesPixelV1';
    const TEMAS = [
        { id: 'taverna', rotulo: '📜 Taverna 16-Bit' },
        { id: 'arcano', rotulo: '🔮 Arcano Noturno' },
        { id: 'floresta', rotulo: '🌿 Bosque Élfico' }
    ];

    function lerPreferencia(chave, padrao) {
        try { const valor = localStorage.getItem(chave) || padrao; return chave === CHAVE_TEMA && valor === 'reliquia' ? 'floresta' : valor; } catch (_) { return padrao; }
    }
    function salvarPreferencia(chave, valor) {
        try { localStorage.setItem(chave, valor); } catch (_) {}
    }

    function aplicarTema(temaId) {
        const valido = TEMAS.some(t => t.id === temaId) ? temaId : 'taverna';
        document.documentElement.setAttribute('data-tema-pixel', valido);
        if (document.body) document.body.setAttribute('data-tema-pixel', valido);
        salvarPreferencia(CHAVE_TEMA, valido);
        document.querySelectorAll('[data-tema-pixel-btn]').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.temaPixelBtn === valido));
        });
    }

    function aplicarScanlines(estado) {
        const ativo = estado === 'on' ? 'on' : 'off';
        if (document.body) document.body.setAttribute('data-scanlines', ativo);
        salvarPreferencia(CHAVE_CRT, ativo);
        const btn = document.querySelector('[data-scanlines-btn]');
        if (btn) btn.setAttribute('aria-pressed', String(ativo === 'on'));
    }

    aplicarTema(lerPreferencia(CHAVE_TEMA, 'taverna'));

    document.addEventListener('DOMContentLoaded', () => {
        aplicarTema(lerPreferencia(CHAVE_TEMA, 'taverna'));
        aplicarScanlines(lerPreferencia(CHAVE_CRT, 'off'));

        if (document.querySelector('.pixel-theme-bar')) return;
        const barra = document.createElement('div');
        barra.className = 'pixel-theme-bar';
        barra.setAttribute('role', 'region');
        barra.setAttribute('aria-label', 'Personalização visual Pixel Art');

        const label = document.createElement('span');
        label.className = 'pixel-theme-label';
        label.textContent = '⚔️ Tema RPG:';
        barra.appendChild(label);

        TEMAS.forEach(tema => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pixel-theme-chip';
            btn.dataset.temaPixelBtn = tema.id;
            btn.textContent = tema.rotulo;
            btn.setAttribute('aria-pressed', String(lerPreferencia(CHAVE_TEMA, 'taverna') === tema.id));
            btn.addEventListener('click', () => aplicarTema(tema.id));
            barra.appendChild(btn);
        });

        const crtBtn = document.createElement('button');
        crtBtn.type = 'button';
        crtBtn.className = 'pixel-theme-chip';
        crtBtn.dataset.scanlinesBtn = 'true';
        crtBtn.textContent = '📺 CRT';
        crtBtn.title = 'Alternar efeito de linhas retrô CRT';
        crtBtn.setAttribute('aria-pressed', String(lerPreferencia(CHAVE_CRT, 'off') === 'on'));
        crtBtn.addEventListener('click', () => {
            const atual = document.body.getAttribute('data-scanlines') === 'on' ? 'off' : 'on';
            aplicarScanlines(atual);
        });
        barra.appendChild(crtBtn);

        const salto = document.querySelector('body > .skip-link');
        if (salto) salto.after(barra);
        else document.body.prepend(barra);
    });
})();
