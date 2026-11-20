/* Fundação de dados isolada e best-effort para conquistas ocultas e avisos do System AI (Etapa 0). */
(function (escopo) {
    'use strict';

    const CHAVE = 'grimorioSistemaIaV1';
    const VERSAO = 1;
    const MAX_FILA = 50;
    const MAX_HISTORICO = 100;
    const SEGUNDOS_DIA = 86400;

    const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const isoData = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const isoInstante = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
    const inteiroNaoNeg = v => Number.isSafeInteger(v) && v >= 0;

    function dataCivilLocal(instante) {
        if (!instante) return '';
        const d = instante instanceof Date ? instante : new Date(instante);
        if (!Number.isFinite(d.getTime())) return '';
        return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function telemetriaPadrao() {
        return {
            cliquesIsca: 0,
            cliquesReclamacaoXp: 0,
            visitasMuralHoje: { data: '', contagem: 0, ultimoTotal: 0 },
            aberturasSemEstudo: 0,
            edicoesPerfil: 0,
            edicoesPerfilHoje: { data: '', contagem: 0 },
            edicoesRotinaHoje: { data: '', contagem: 0 },
            trocasTemaHoje: { data: '', contagem: 0 },
            temasUsados: [],
            projetosRestaurados: 0,
            backupsExportados: 0,
            pomodorosFocoConcluidosSeq: 0,
            pomodorosFocoHoje: { data: '', contagem: 0 },
            pomodoroDesligadoEmFoco: 0,
            segundosScanlines: 0,
            disparosToastRapidos: 0,
            codigoConsole: false,
            codigoKonami: false,
            codigoHadouken: false,
            codigoIddqdCount: 0,
            temaFliperamaDesbloqueado: false,
            usurpadorAplicado: false
        };
    }

    function estadoPadrao() {
        return {
            versao: VERSAO,
            desbloqueadas: {},
            telemetria: telemetriaPadrao(),
            filaAvisos: [],
            historicoAvisos: [],
            ultimaFalaDia: { data: '', contagem: 0 }
        };
    }

    function normalizarContadorDia(valor) {
        if (!objeto(valor)) return { data: '', contagem: 0 };
        return {
            data: isoData(valor.data) ? valor.data : '',
            contagem: inteiroNaoNeg(valor.contagem) ? valor.contagem : 0
        };
    }

    function normalizarVisitaMural(valor) {
        if (!objeto(valor)) return { data: '', contagem: 0, ultimoTotal: 0 };
        return {
            data: isoData(valor.data) ? valor.data : '',
            contagem: inteiroNaoNeg(valor.contagem) ? valor.contagem : 0,
            ultimoTotal: inteiroNaoNeg(valor.ultimoTotal) ? valor.ultimoTotal : 0
        };
    }

    function normalizarAviso(item) {
        if (!objeto(item) || typeof item.id !== 'string' || !item.id.trim()) return null;
        return {
            id: item.id.trim().slice(0, 80),
            tipo: typeof item.tipo === 'string' ? item.tipo.slice(0, 40) : 'conquista',
            titulo: typeof item.titulo === 'string' ? item.titulo.slice(0, 140) : '',
            texto: typeof item.texto === 'string' ? item.texto.slice(0, 1200) : '',
            tituloRecompensa: typeof item.tituloRecompensa === 'string' ? item.tituloRecompensa.slice(0, 80) : '',
            ...(item.exibido === true ? { exibido: true } : {}),
            criadaEm: isoInstante(item.criadaEm) ? item.criadaEm : new Date().toISOString()
        };
    }

    function normalizar(bruto) {
        const base = estadoPadrao();
        if (!objeto(bruto) || bruto.versao !== VERSAO) return base;

        if (objeto(bruto.desbloqueadas)) {
            for (const [id, reg] of Object.entries(bruto.desbloqueadas)) {
                if (typeof id !== 'string' || !id.trim() || !objeto(reg) || !isoInstante(reg.em)) continue;
                base.desbloqueadas[id.trim().slice(0, 80)] = {
                    id: id.trim().slice(0, 80),
                    em: reg.em
                };
            }
        }

        if (objeto(bruto.telemetria)) {
            const t = bruto.telemetria;
            const d = base.telemetria;
            for (const campo of [
                'cliquesIsca', 'cliquesReclamacaoXp', 'aberturasSemEstudo', 'edicoesPerfil',
                'projetosRestaurados', 'backupsExportados', 'pomodorosFocoConcluidosSeq',
                'pomodoroDesligadoEmFoco', 'segundosScanlines', 'disparosToastRapidos', 'codigoIddqdCount'
            ]) {
                if (inteiroNaoNeg(t[campo])) d[campo] = t[campo];
            }
            for (const flag of [
                'codigoConsole', 'codigoKonami', 'codigoHadouken',
                'temaFliperamaDesbloqueado', 'usurpadorAplicado'
            ]) {
                if (typeof t[flag] === 'boolean') d[flag] = t[flag];
            }
            if (Array.isArray(t.temasUsados)) {
                d.temasUsados = [...new Set(t.temasUsados.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 30)))];
            }
            d.visitasMuralHoje = normalizarVisitaMural(t.visitasMuralHoje);
            d.edicoesPerfilHoje = normalizarContadorDia(t.edicoesPerfilHoje);
            d.edicoesRotinaHoje = normalizarContadorDia(t.edicoesRotinaHoje);
            d.trocasTemaHoje = normalizarContadorDia(t.trocasTemaHoje);
            d.pomodorosFocoHoje = normalizarContadorDia(t.pomodorosFocoHoje);
        }

        if (Array.isArray(bruto.filaAvisos)) {
            base.filaAvisos = bruto.filaAvisos.map(normalizarAviso).filter(Boolean).slice(0, MAX_FILA);
        }
        if (Array.isArray(bruto.historicoAvisos)) {
            base.historicoAvisos = bruto.historicoAvisos.map(normalizarAviso).filter(Boolean).slice(0, MAX_HISTORICO);
        }
        base.ultimaFalaDia = normalizarContadorDia(bruto.ultimaFalaDia);
        return base;
    }

    function validar(valor) {
        if (!objeto(valor) || valor.versao !== VERSAO) return false;
        const camposTopo = new Set(['versao', 'desbloqueadas', 'telemetria', 'filaAvisos', 'historicoAvisos', 'ultimaFalaDia']);
        if (Object.keys(valor).some(c => !camposTopo.has(c))) return false;
        if (valor.desbloqueadas !== undefined) {
            if (!objeto(valor.desbloqueadas)) return false;
            for (const [id, reg] of Object.entries(valor.desbloqueadas)) {
                if (!id || !objeto(reg) || reg.id !== id || !isoInstante(reg.em)) return false;
            }
        }
        if (valor.telemetria !== undefined && !objeto(valor.telemetria)) return false;
        if (valor.filaAvisos !== undefined && (!Array.isArray(valor.filaAvisos) || valor.filaAvisos.some(a => normalizarAviso(a) === null))) return false;
        if (valor.historicoAvisos !== undefined && (!Array.isArray(valor.historicoAvisos) || valor.historicoAvisos.some(a => normalizarAviso(a) === null))) return false;
        if (valor.ultimaFalaDia !== undefined && !objeto(valor.ultimaFalaDia)) return false;
        return true;
    }

    function storageAtual(storage) {
        return storage || escopo.localStorage || null;
    }

    function ler(storage) {
        const st = storageAtual(storage);
        if (!st) return estadoPadrao();
        try {
            const bruto = st.getItem(CHAVE);
            if (!bruto) return estadoPadrao();
            return normalizar(JSON.parse(bruto));
        } catch (_) {
            return estadoPadrao();
        }
    }

    function notificar(tipo, detalhe) {
        try {
            if (typeof escopo.dispatchEvent === 'function' && typeof escopo.CustomEvent === 'function') {
                escopo.dispatchEvent(new escopo.CustomEvent(tipo, { detail: detalhe }));
            }
        } catch (_) {}
    }

    function salvar(estado, storage) {
        const st = storageAtual(storage);
        const seguro = normalizar(estado);
        if (!st) return { ok: false, estado: seguro };
        try {
            st.setItem(CHAVE, JSON.stringify(seguro));
            notificar('sistema-ia:alterado', { estado: seguro });
            return { ok: true, estado: seguro };
        } catch (_) {
            // Falha de armazenamento na camada cosmética nunca interrompe o estudo nem o cronômetro.
            return { ok: false, estado: seguro };
        }
    }

    function registrarDesbloqueio(id, opcoes = {}, storage) {
        if (typeof id !== 'string' || !id.trim()) return { ok: false, nova: false, registro: null };
        const chaveId = id.trim().slice(0, 80);
        const atual = ler(storage);
        if (Object.hasOwn(atual.desbloqueadas, chaveId)) {
            return { ok: true, nova: false, registro: atual.desbloqueadas[chaveId] };
        }
        const instante = isoInstante(opcoes.agora) ? new Date(opcoes.agora).toISOString() : new Date().toISOString();
        const registro = { id: chaveId, em: instante };
        atual.desbloqueadas[chaveId] = registro;
        const salvo = salvar(atual, storage);
        return { ok: salvo.ok, nova: true, registro };
    }

    function estaDesbloqueada(id, storage) {
        if (typeof id !== 'string' || !id.trim()) return false;
        const atual = ler(storage);
        return Object.hasOwn(atual.desbloqueadas, id.trim().slice(0, 80));
    }

    function listarDesbloqueadas(storage) {
        return { ...ler(storage).desbloqueadas };
    }

    function atualizarTelemetria(mutadora, storage) {
        const atual = ler(storage);
        if (typeof mutadora === 'function') {
            try { mutadora(atual.telemetria); } catch (_) { return { ok: false, telemetria: atual.telemetria }; }
        }
        const salvo = salvar(atual, storage);
        return { ok: salvo.ok, telemetria: salvo.estado.telemetria };
    }

    function incrementarTelemetria(campo, delta = 1, storage) {
        return atualizarTelemetria(t => {
            if (!Object.hasOwn(t, campo) || typeof t[campo] !== 'number') return;
            t[campo] = Math.max(0, t[campo] + Math.round(Number(delta) || 0));
        }, storage);
    }

    function enfileirarAviso(aviso, storage) {
        const item = normalizarAviso(aviso);
        if (!item) return { ok: false, adicionado: false };
        const atual = ler(storage);
        const duplicado = item.tipo === 'conquista'
            && (atual.filaAvisos.some(a => a.id === item.id) || atual.historicoAvisos.some(a => a.id === item.id));
        if (duplicado) return { ok: true, adicionado: false };
        atual.filaAvisos = [...atual.filaAvisos, item].slice(-MAX_FILA);
        const salvo = salvar(atual, storage);
        return { ok: salvo.ok, adicionado: true };
    }

    function marcarAvisoExibido(id, storage) {
        const atual = ler(storage);
        const aviso = atual.filaAvisos.find(item => item.id === id);
        if (!aviso || aviso.exibido) return false;
        aviso.exibido = true;
        return salvar(atual, storage).ok;
    }

    function consumirProximoAviso(storage, id) {
        const atual = ler(storage);
        const indice = id === undefined ? 0 : atual.filaAvisos.findIndex(item => item.id === id);
        const proximo = atual.filaAvisos[indice];
        if (!proximo) return { ok: true, aviso: null };
        atual.filaAvisos.splice(indice, 1);
        atual.historicoAvisos = [proximo, ...atual.historicoAvisos].slice(0, MAX_HISTORICO);
        const salvo = salvar(atual, storage);
        return { ok: salvo.ok, aviso: proximo };
    }

    function somarSegundosPorDiaCivil(sessoes) {
        const porDia = new Map();
        const adicionar = (iso, seg) => {
            if (!isoData(iso) || !(seg > 0)) return;
            porDia.set(iso, (porDia.get(iso) || 0) + seg);
        };
        for (const s of (Array.isArray(sessoes) ? sessoes : [])) {
            const totalSeg = Math.max(0, Math.round(Number(s?.duracaoSegundos) || 0));
            if (!totalSeg) continue;
            if (s?.precisaoInicio === 'dia' && isoData(s?.dataEstudo)) {
                adicionar(s.dataEstudo, totalSeg);
                continue;
            }
            const inicioMs = Date.parse(s?.inicio);
            if (!Number.isFinite(inicioMs)) {
                if (isoData(s?.dataEstudo)) adicionar(s.dataEstudo, totalSeg);
                continue;
            }
            if (s?.precisaoInicio === 'dia') {
                adicionar(dataCivilLocal(inicioMs), totalSeg);
                continue;
            }
            let cursorMs = inicioMs;
            let restanteSeg = totalSeg;
            let guardDias = 0;
            while (restanteSeg > 0 && guardDias < 366) {
                const atual = new Date(cursorMs);
                const iso = dataCivilLocal(atual);
                const proxMeiaNoite = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + 1, 0, 0, 0, 0).getTime();
                const segAteMeiaNoite = Math.max(1, Math.round((proxMeiaNoite - cursorMs) / 1000));
                const fatia = Math.min(restanteSeg, segAteMeiaNoite);
                adicionar(iso, fatia);
                restanteSeg -= fatia;
                cursorMs = proxMeiaNoite;
                guardDias++;
            }
            if (restanteSeg > 0) adicionar(dataCivilLocal(cursorMs), restanteSeg);
        }
        return porDia;
    }

    function diasAcimaDe24h(sessoes) {
        const mapa = somarSegundosPorDiaCivil(sessoes);
        return [...mapa.entries()]
            .filter(([, seg]) => seg > SEGUNDOS_DIA)
            .map(([iso, seg]) => ({ data: iso, segundos: seg }))
            .sort((a, b) => a.data.localeCompare(b.data));
    }

    const api = {
        CHAVE,
        VERSAO,
        SEGUNDOS_DIA,
        estadoPadrao,
        normalizar,
        validar,
        ler,
        salvar,
        registrarDesbloqueio,
        estaDesbloqueada,
        listarDesbloqueadas,
        atualizarTelemetria,
        incrementarTelemetria,
        enfileirarAviso,
        consumirProximoAviso,
        marcarAvisoExibido,
        somarSegundosPorDiaCivil,
        diasAcimaDe24h,
        dataCivilLocal
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    escopo.SistemaIaStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
