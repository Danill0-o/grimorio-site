/* Controles de interface da Jornada (modal de atividades práticas), sem alterações no plano ou na persistência. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    window.HistoricoJornada = { atualizar() {} };
    document.addEventListener('DOMContentLoaded', () => {
        const praticas = $('praticas-painel-dialog');
        if (!praticas) return;
        $('abrir-praticas')?.addEventListener('click', () => {
            praticas.showModal();
            $('fechar-praticas-painel')?.focus();
        });
        $('fechar-praticas-painel')?.addEventListener('click', () => praticas.close());
        praticas.addEventListener('close', () => {
            const abrir = $('abrir-praticas');
            (abrir?.checkVisibility() ? abrir : $('jornada-menu-aberto')?.querySelector('summary'))?.focus();
        });
    });
})();
