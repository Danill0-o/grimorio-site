/* Identidade local da ficha do estudante (nome, avatar placeholder, título equipado e telemetria Sistema IA). */
(function (escopo) {
    'use strict';

    const CHAVE = 'grimorioPerfilV1';
    const NOME_PADRAO = 'Estudante do Grimório';
    const NOME_USURPADOR = 'Sisteminha Júnior';
    const LIMITE_NOME = 40;
    const AVATAR_PADRAO = 'mago';
    const NOMES_SISTEMA = new Set(['sistema', 'o sistema', 'system', 'system ai', 'ia', 'admin']);

    const AVATARES = Object.freeze([
        { id: 'mago', nome: 'Mago Arcano', arquivo: 'img/avatars/mago.svg', descricao: 'Retrato placeholder em pixel art de um mago com chapéu e cajado.' },
        { id: 'guardia', nome: 'Guardiã da Ordem', arquivo: 'img/avatars/guardia.svg', descricao: 'Retrato placeholder em pixel art de uma guardiã com elmo e escudo.' },
        { id: 'escriba', nome: 'Escriba Real', arquivo: 'img/avatars/escriba.svg', descricao: 'Retrato placeholder em pixel art de um escriba com boina e grimório.' },
        { id: 'alquimista', nome: 'Alquimista', arquivo: 'img/avatars/alquimista.svg', descricao: 'Retrato placeholder em pixel art de um alquimista com óculos e frasco.' },
        { id: 'explorador', nome: 'Explorador', arquivo: 'img/avatars/explorador.svg', descricao: 'Retrato placeholder em pixel art de um explorador com capa e bússola.' }
    ]);

    function limparNome(valor) {
        if (typeof valor !== 'string') return '';
        return valor.replace(/\s+/g, ' ').trim().slice(0, LIMITE_NOME);
    }

    function normalizarNomeSimples(valor) {
        return limparNome(valor)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function obterStoreIa() {
        return escopo.SistemaIaStore || (typeof require === 'function' ? require('./sistema-ia-store') : null);
    }

    function resolverAvatar(id) {
        return AVATARES.find(a => a.id === id) || AVATARES[0];
    }

    function resolverStorage(storage) {
        return storage || escopo.localStorage;
    }

    function lerBruto(storage) {
        try {
            const st = resolverStorage(storage);
            const bruto = st?.getItem(CHAVE);
            if (!bruto) return {};
            const parsed = JSON.parse(bruto);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function obter(storage) {
        const salvo = lerBruto(storage);
        const nomeSalvo = limparNome(salvo.nomeExibicao);
        const avatar = resolverAvatar(typeof salvo.avatarId === 'string' ? salvo.avatarId : AVATAR_PADRAO);
        const tituloEquipadoId = typeof salvo.tituloEquipadoId === 'string' && salvo.tituloEquipadoId.trim()
            ? salvo.tituloEquipadoId.trim().slice(0, 60)
            : null;
        return {
            versao: 1,
            nomeExibicao: nomeSalvo || NOME_PADRAO,
            nomePersonalizado: nomeSalvo,
            avatarId: avatar.id,
            avatar,
            tituloEquipadoId
        };
    }

    function salvar(dados = {}, storage) {
        const st = resolverStorage(storage);
        const atual = lerBruto(st);
        const nomeAnterior = limparNome(atual.nomeExibicao);
        const avatarAnterior = resolverAvatar(atual.avatarId).id;
        const nomeSolicitado = Object.hasOwn(dados, 'nomeExibicao') ? limparNome(dados.nomeExibicao) : nomeAnterior;
        const avatarNovo = Object.hasOwn(dados, 'avatarId') ? resolverAvatar(dados.avatarId).id : avatarAnterior;

        const storeIa = obterStoreIa();
        let usurpadorAcionadoAgora = false;
        let nomeFinal = nomeSolicitado;
        if (Object.hasOwn(dados, 'nomeExibicao') && NOMES_SISTEMA.has(normalizarNomeSimples(nomeSolicitado))) {
            try {
                const iaAtual = storeIa ? storeIa.ler(st) : null;
                if (iaAtual && !iaAtual.telemetria?.usurpadorAplicado && !Object.hasOwn(iaAtual.desbloqueadas || {}, 'usurpador_do_trono')) {
                    nomeFinal = NOME_USURPADOR;
                    usurpadorAcionadoAgora = true;
                }
            } catch (_) {}
        }

        const proximo = {
            versao: 1,
            nomeExibicao: nomeFinal,
            avatarId: avatarNovo,
            tituloEquipadoId: Object.hasOwn(dados, 'tituloEquipadoId')
                ? (typeof dados.tituloEquipadoId === 'string' && dados.tituloEquipadoId.trim() ? dados.tituloEquipadoId.trim().slice(0, 60) : null)
                : (typeof atual.tituloEquipadoId === 'string' && atual.tituloEquipadoId.trim() ? atual.tituloEquipadoId.trim().slice(0, 60) : null)
        };
        st.setItem(CHAVE, JSON.stringify(proximo));

        try {
            if (storeIa) {
                if (usurpadorAcionadoAgora) {
                    if (escopo.SistemaIaCatalogo?.desbloquearComAviso) {
                        escopo.SistemaIaCatalogo.desbloquearComAviso('usurpador_do_trono', {}, st);
                    } else {
                        storeIa.registrarDesbloqueio('usurpador_do_trono', {}, st);
                    }
                    storeIa.atualizarTelemetria(t => { t.usurpadorAplicado = true; }, st);
                }
                if (proximo.nomeExibicao !== nomeAnterior || proximo.avatarId !== avatarAnterior) {
                    storeIa.incrementarTelemetria('edicoesPerfil', 1, st);
                }
            }
        } catch (_) {}

        const resultado = obter(st);
        try {
            escopo.dispatchEvent(new CustomEvent('perfil:identidade-alterada', { detail: resultado }));
        } catch (_) {}
        return resultado;
    }

    function tituloGlobalPorNivel(nivel) {
        const n = Number(nivel) || 1;
        if (n >= 100) return 'Lenda';
        if (n >= 75) return 'Mestre';
        if (n >= 50) return 'Expert';
        if (n >= 25) return 'Perito';
        if (n >= 10) return 'Dedicado';
        if (n >= 5) return 'Aprendiz';
        return 'Iniciante';
    }

    const api = {
        CHAVE,
        NOME_PADRAO,
        LIMITE_NOME,
        AVATARES,
        obter,
        salvar,
        resolverAvatar,
        tituloGlobalPorNivel
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    escopo.PerfilIdentidade = api;
})(typeof window !== 'undefined' ? window : globalThis);
