/* Catálogo de conquistas ocultas e falas contextuais (Etapas 1–3 — estilo System AI). Puro e sem bônus de XP (D029). */
(function (escopo) {
    'use strict';
    const CLIQUES_RECLAMACAO_XP = 20;

    function dataCivilLocal(instante) {
        if (!instante) return '';
        const d = instante instanceof Date ? instante : new Date(instante);
        if (!Number.isFinite(d.getTime())) return '';
        return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function lerJsonSeguro(storage, chave, padrao = null) {
        try {
            const raw = storage?.getItem?.(chave);
            return raw ? JSON.parse(raw) : padrao;
        } catch (_) {
            return padrao;
        }
    }

    function diasEntreIsos(isoA, isoB) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoA)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoB))) return NaN;
        const [a1, m1, d1] = isoA.split('-').map(Number);
        const [a2, m2, d2] = isoB.split('-').map(Number);
        const t1 = Date.UTC(a1, m1 - 1, d1);
        const t2 = Date.UTC(a2, m2 - 1, d2);
        return Math.round((t2 - t1) / 86400000);
    }

    function converterDataBrParaIso(textoBr) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(textoBr || '').trim());
        return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    }

    function normalizarTextoSimples(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function sessaoComHorarioExato(s) {
        if (!s || s.precisaoInicio === 'dia' || !s.inicio) return null;
        const d = new Date(s.inicio);
        return Number.isFinite(d.getTime()) ? d : null;
    }

    function listarChavesStorage(storage) {
        if (!storage) return [];
        if (typeof storage.key === 'function' && Number.isFinite(storage.length)) {
            const chaves = [];
            for (let i = 0; i < storage.length; i++) {
                const k = storage.key(i);
                if (typeof k === 'string') chaves.push(k);
            }
            return chaves;
        }
        return Object.keys(storage);
    }

    function construirContextoExtra(entrada = {}, diasMap = new Map(), diasOrdenados = []) {
        const storage = entrada.storage || escopo.localStorage;
        const sessoes = Array.isArray(entrada.sessoes) ? entrada.sessoes : [];
        const materias = Array.isArray(entrada.materias) ? entrada.materias : [];
        const global = entrada.global || { nivel: 1, xp: 0, segundos: 0, segundosPraticas: 0 };
        const hojeIso = /^\d{4}-\d{2}-\d{2}$/.test(String(entrada.hoje || ''))
            ? String(entrada.hoje)
            : dataCivilLocal(entrada.hoje instanceof Date ? entrada.hoje : new Date());
        const identidade = entrada.identidade || escopo.PerfilIdentidade?.obter?.(storage) || {};

        const todasSessoesParaDia = [...sessoes];
        const praticasBrutas = [];
        const revisoesEntidades = [];
        const reagendamentos = [];
        const projetosRegistros = [];
        const pomodoros = [];

        const chavesStorage = listarChavesStorage(storage);
        for (const k of chavesStorage) {
                if (k.startsWith('praticasProjetoV1:')) {
                    const est = lerJsonSeguro(storage, k);
                    if (est && typeof est === 'object') {
                        praticasBrutas.push(est);
                        const exclS = est.exclusoes?.sessoes || {};
                        for (const [idS, s] of Object.entries(est.sessoes || {})) {
                            if (Object.hasOwn(exclS, idS) || !s) continue;
                            todasSessoesParaDia.push(s);
                        }
                    }
                } else if (k === 'revisoesEstadoV1' || /^projetoV1:[^:]+:revisoesEstadoV1$/.test(k)) {
                    const est = lerJsonSeguro(storage, k);
                    if (est?.entidades && typeof est.entidades === 'object') {
                        revisoesEntidades.push(...Object.values(est.entidades).filter(Boolean));
                    }
                } else if (/^projetoV1:[^:]+:reagendamentoV1$/.test(k)) {
                    const est = lerJsonSeguro(storage, k);
                    if (est && Array.isArray(est.operacoes)) reagendamentos.push(est);
                } else if (/^projetoV1:[^:]+:registro$/.test(k)) {
                    const reg = lerJsonSeguro(storage, k);
                    if (reg && reg.id) {
                        const p = `projetoV1:${reg.id}:`;
                        projetosRegistros.push({
                            reg,
                            dados: lerJsonSeguro(storage, p + 'dadosExame', {}),
                            plano: lerJsonSeguro(storage, p + 'materiaDoDia', {})
                        });
                    }
                } else if (/^projetoV1:[^:]+:pomodoroV1$/.test(k)) {
                    const pom = lerJsonSeguro(storage, k);
                    if (pom && typeof pom === 'object') pomodoros.push(pom);
                }
        }

        // Dias > 24h via divisão civil local
        const storeIa = escopo.SistemaIaStore || (typeof require === 'function' ? require('./sistema-ia-store') : null);
        const mapaCivil = storeIa ? storeIa.somarSegundosPorDiaCivil(todasSessoesParaDia) : new Map();
        const dias24h = [...mapaCivil.entries()].filter(([, seg]) => seg > 86400);

        // Operações do repositório histórico (exclusões / resets)
        let historicoOps = [];
        try {
            if (escopo.HistoricoRepository?.exportarOperacoes) {
                historicoOps = escopo.HistoricoRepository.exportarOperacoes().operacoes || [];
            } else if (storage) {
                for (const k of chavesStorage) {
                    if (k.startsWith('historicoOperacaoV1:')) {
                        const op = lerJsonSeguro(storage, k);
                        if (op) historicoOps.push(op);
                    }
                }
            }
        } catch (_) {}
        const exclusoesSessoes = historicoOps.filter(o => o?.tipo === 'excluir').length;
        const reiniciosDominio = historicoOps.filter(o => o?.tipo === 'reiniciar-dominio').length
            + Object.keys(lerJsonSeguro(storage, 'reiniciosDominio', {}) || {}).length;

        // Domínio de matérias
        const dom = lerJsonSeguro(storage, 'materiasDominioV1', { materiasGlobais: {}, projetosMaterias: {} }) || { materiasGlobais: {}, projetosMaterias: {} };
        const globais = Object.values(dom.materiasGlobais || {});
        const participacoes = Object.values(dom.projetosMaterias || {});
        const globalPorParticipacao = new Map();
        const afinidadePorParticipacao = new Map();
        for (const p of participacoes) {
            if (!p?.projetoMateriaId) continue;
            globalPorParticipacao.set(p.projetoMateriaId, p.materiaGlobalId);
            afinidadePorParticipacao.set(p.projetoMateriaId, p.afinidade);
        }

        // Agregações diárias de sessões e matérias distintas no dia
        const sessoesPorId = new Map(sessoes.map(s => [s.id, s]));
        const materiasNoDia = new Map();
        const segPorParticipacao = new Map();
        const segPorDiaProjeto = new Map();
        for (const s of sessoes) {
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio);
            const dur = Math.max(0, Math.round(Number(s.duracaoSegundos) || 0));
            const pmId = s.projetoMateriaId;
            if (pmId) {
                segPorParticipacao.set(pmId, (segPorParticipacao.get(pmId) || 0) + dur);
                const gId = globalPorParticipacao.get(pmId) || pmId;
                if (iso) {
                    if (!materiasNoDia.has(iso)) materiasNoDia.set(iso, new Map());
                    const dm = materiasNoDia.get(iso);
                    dm.set(gId, (dm.get(gId) || 0) + dur);
                }
            }
            if (s.projetoId && iso) {
                const kDia = `${s.projetoId}:${iso}`;
                segPorDiaProjeto.set(kDia, (segPorDiaProjeto.get(kDia) || 0) + dur);
            }
        }

        // Gaps entre dias ativos
        let maiorGap = 0;
        let teveRetornoTriunfal = false;
        let quebrouSequencia7d = false;
        let corrida = 0;
        let ant = '';
        let perdeu7d = false;
        for (const iso of diasOrdenados) {
            const gap = ant ? diasEntreIsos(ant, iso) : 0;
            if (gap > maiorGap) maiorGap = gap;
            if (gap >= 14 && (diasMap.get(iso)?.segundos || 0) >= 7200) teveRetornoTriunfal = true;
            if (ant && gap === 1) {
                corrida++;
            } else {
                if (corrida >= 7 && gap >= 2) perdeu7d = true;
                if (perdeu7d) quebrouSequencia7d = true;
                corrida = 1;
            }
            if (perdeu7d) quebrouSequencia7d = true;
            ant = iso;
        }

        // Avaliações e práticas
        const avaliacoes = [];
        let praticasConclusoes = 0;
        let praticasConclusoesExcluidas = 0;
        let praticasSemAvaliacao = 0;
        let redacoesConcluidas = 0;
        let simuladosConcluidos = 0;
        let tafSessao1h = false;
        let simuladoSessao4h = false;

        for (const est of praticasBrutas) {
            const atividades = est.atividades || {};
            const exclC = est.exclusoes?.conclusoes || {};
            const exclS = est.exclusoes?.sessoes || {};
            const avalPorMissao = new Set();
            for (const av of Object.values(est.avaliacoes || {})) {
                if (!av) continue;
                avaliacoes.push(av);
                if (av.missaoId) avalPorMissao.add(av.missaoId);
            }
            for (const [cId, c] of Object.entries(est.conclusoes || {})) {
                if (!c) continue;
                if (Object.hasOwn(exclC, cId)) {
                    praticasConclusoesExcluidas++;
                    continue;
                }
                praticasConclusoes++;
                if (!avalPorMissao.has(c.missaoId)) praticasSemAvaliacao++;
                const tipo = atividades[c.atividadeId]?.atividade?.tipo;
                if (tipo === 'redacao') redacoesConcluidas++;
                if (tipo === 'simulado') simuladosConcluidos++;
            }
            for (const [sId, s] of Object.entries(est.sessoes || {})) {
                if (Object.hasOwn(exclS, sId) || !s) continue;
                const tipo = atividades[s.atividadeId]?.atividade?.tipo;
                const dur = Number(s.duracaoSegundos) || 0;
                if (tipo === 'taf' && dur >= 3600) tafSessao1h = true;
                if (tipo === 'simulado' && dur >= 14400) simuladoSessao4h = true;
            }
        }
        avaliacoes.sort((a, b) => Date.parse(a.registradoEm || 0) - Date.parse(b.registradoEm || 0));

        // Metas diárias cumpridas (cirurgiao / dobro / sabatica)
        let bateuCirurgiao = false;
        let bateuDobroMeta = false;
        let teveSemanaSabatica = false;
        const civil = escopo.CalendarioJornada;
        for (const { reg, dados, plano } of projetosRegistros) {
            if (reg.removido || reg.arquivado || !plano || typeof plano !== 'object' || !dados?.dataInicioF) continue;
            const totalDias = Object.keys(plano).length;
            if (!totalDias) continue;
            const mapa = civil?.mapear ? civil.mapear(dados, totalDias) : null;
            if (!mapa?.porDia) continue;

            const semanas = new Map();
            for (const [diaChave, info] of Object.entries(mapa.porDia)) {
                const blocos = plano[diaChave];
                if (!Array.isArray(blocos) || !blocos.length) continue;
                const metaSeg = blocos.reduce((acc, b) => acc + (Number(b.metaSegundos) || Math.round((Number(dados.minutosPorDia) || 0) * 60 / Math.max(1, Number(dados.blocosPorDia) || 1))), 0);
                const iso = info?.data;
                if (!iso) continue;
                const estudado = segPorDiaProjeto.get(`${reg.id}:${iso}`) || 0;
                if (metaSeg > 0 && estudado >= metaSeg && estudado <= metaSeg + 60) bateuCirurgiao = true;
                if (metaSeg > 0 && estudado >= 2 * metaSeg) bateuDobroMeta = true;

                if (iso < hojeIso) {
                    const [an, me, di] = iso.split('-').map(Number);
                    const dt = new Date(an, me - 1, di, 12, 0, 0, 0);
                    const diffSeg = (dt.getDay() + 6) % 7;
                    const seg = new Date(an, me - 1, di - diffSeg, 12, 0, 0, 0);
                    const chSem = dataCivilLocal(seg);
                    if (!semanas.has(chSem)) semanas.set(chSem, { datas: [], segTotal: 0 });
                    const w = semanas.get(chSem);
                    w.datas.push(iso);
                    w.segTotal += diasMap.get(iso)?.segundos || 0;
                }
            }
            for (const [segIso, info] of semanas.entries()) {
                const domIso = dataCivilLocal(new Date(Number(segIso.slice(0, 4)), Number(segIso.slice(5, 7)) - 1, Number(segIso.slice(8, 10)) + 6, 12, 0, 0, 0));
                if (domIso < hojeIso && info.datas.length >= 1 && info.segTotal === 0) {
                    teveSemanaSabatica = true;
                }
            }
        }

        // Revisões
        const blocosRev = new Map();
        let revDispensadasManual = 0;
        let revPontuais = 0;
        let revArqueologica = false;
        const atrasadasPorDia = new Map();
        for (const r of revisoesEntidades) {
            if (r.estado === 'dispensada' && r.estadoAlteradoManualmente === true) revDispensadasManual++;
            if (r.blocoId) {
                if (!blocosRev.has(r.blocoId)) blocosRev.set(r.blocoId, []);
                blocosRev.get(r.blocoId).push(r);
            }
            if (r.estado === 'concluida' && r.dataPrevista) {
                const idsS = Array.isArray(r.sessoesConclusao) ? r.sessoesConclusao : [];
                const datasConclusao = idsS.map(idS => sessoesPorId.get(idS)).filter(Boolean)
                    .map(s => /^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio))
                    .filter(Boolean).sort();
                const dataConc = datasConclusao.at(-1) || '';
                if (dataConc && dataConc === r.dataPrevista) revPontuais++;
                if (dataConc) {
                    const atraso = diasEntreIsos(r.dataPrevista, dataConc);
                    if (atraso >= 60) revArqueologica = true;
                    if (atraso >= 3) atrasadasPorDia.set(dataConc, (atrasadasPorDia.get(dataConc) || 0) + 1);
                }
            }
        }
        const blocoElefante = [...blocosRev.values()].some(lista => lista.length >= 2 && lista.every(r => r.estado === 'concluida'));
        const quitou10Atrasadas = [...atrasadasPorDia.values()].some(n => n >= 10);

        // Reagendamentos
        let opsReagendamentoMax = 0;
        let teveReiAmanha = false;
        let tevePendulo = false;
        let teveViajante = false;
        let antecipacoesTotal = 0;
        for (const led of reagendamentos) {
            opsReagendamentoMax = Math.max(opsReagendamentoMax, led.operacoes.length);
            const movsItem = new Map();
            for (const op of led.operacoes) {
                if (Object.hasOwn(op, 'antecipacao')) antecipacoesTotal++;
                const [d0, d1] = op.datas || [];
                const movidosFrente = (op.depois?.[1] || []).filter(k => !(op.antes?.[1] || []).includes(k));
                if (d0 && d1 && d1 > d0 && diasEntreIsos(d0, d1) === 1 && movidosFrente.length >= 3) teveReiAmanha = true;
                for (let idx = 0; idx < 2; idx++) {
                    for (const item of (op.antes?.[idx] || [])) {
                        const destIdx = (op.depois?.[0] || []).includes(item) ? 0 : 1;
                        if (destIdx !== idx && op.datas?.[idx] && op.datas?.[destIdx]) {
                            if (!movsItem.has(item)) movsItem.set(item, []);
                            movsItem.get(item).push([op.datas[idx], op.datas[destIdx]]);
                        }
                    }
                }
            }
            for (const listaMov of movsItem.values()) {
                if (listaMov.length >= 4) teveViajante = true;
                for (let i = 0; i < listaMov.length; i++) {
                    for (let j = i + 1; j < listaMov.length; j++) {
                        if (listaMov[i][0] === listaMov[j][1] && listaMov[i][1] === listaMov[j][0]) tevePendulo = true;
                    }
                }
            }
        }

        // Participações por projeto (edital infinito / marca texto / odio produtivo)
        const partPorProjeto = new Map();
        for (const p of participacoes) {
            if (!p?.projetoId || p.removida) continue;
            if (!partPorProjeto.has(p.projetoId)) partPorProjeto.set(p.projetoId, []);
            partPorProjeto.get(p.projetoId).push(p);
        }

        const telemetria = entrada.telemetria || (storeIa ? storeIa.ler(storage).telemetria : {});

        return {
            sessoes,
            materias,
            global,
            hojeIso,
            identidade,
            telemetria,
            diasMap,
            diasOrdenados,
            dias24h,
            exclusoesSessoes,
            reiniciosDominio,
            globais,
            participacoes,
            partPorProjeto,
            segPorParticipacao,
            materiasNoDia,
            maiorGap,
            teveRetornoTriunfal,
            quebrouSequencia7d,
            avaliacoes,
            praticasConclusoes,
            praticasConclusoesExcluidas,
            praticasSemAvaliacao,
            redacoesConcluidas,
            simuladosConcluidos,
            tafSessao1h,
            simuladoSessao4h,
            revisoes: {
                dispensadasManual: revDispensadasManual,
                pontuais: revPontuais,
                arqueologica: revArqueologica,
                blocoElefante,
                quitou10Atrasadas
            },
            reagendamento: {
                opsMax: opsReagendamentoMax,
                teveReiAmanha,
                tevePendulo,
                teveViajante,
                antecipacoesTotal
            },
            projetosRegistros,
            pomodoros,
            metasDia: { bateuCirurgiao, bateuDobroMeta, teveSemanaSabatica }
        };
    }

    function ehNomeBenedito(identidade) {
        const nome = normalizarTextoSimples(identidade?.nomePersonalizado || identidade?.nomeExibicao);
        return /\bbenedito\b/.test(nome);
    }

    function oculta(id, categoria, nome, tituloRecompensa, fala, avaliar, extra = {}) {
        return { id, categoria, nome, tituloRecompensa, fala, oculta: true, etapa: extra.etapa || 1, resolverFala: extra.resolverFala || null, avaliar };
    }

    const NOMES_TESTE = new Set(['teste', 'asdf', 'xxx', 'aaa', 'qwerty', '123', 'test', 'zzzz']);
    const NOMES_SISTEMA = new Set(['sistema', 'o sistema', 'system', 'system ai', 'ia', 'admin']);

    const CATALOGO_OCULTAS_ETAPA1 = Object.freeze([
        // 2.1 Paradoxos temporais
        oculta('paradoxo_24h_1', 'Paradoxo', 'Anomalia Temporal Detectada!', 'Distorcedor do Tempo',
            'Mais de 24 horas de estudo em UM único dia civil. Consultei o calendário. Consultei o relógio. Consultei um físico, que riu e desligou na minha cara. Ou você dobrou o espaço-tempo com uma apostila de Direito Tributário, ou alguém digitou um zero a mais. O Sistema fingirá que acreditou. Por enquanto.\nRecompensa: 1× título equipável · 0× horas extras no dia (o dia continua com 24).',
            ctx => ctx.dias24h.length >= 1),
        oculta('paradoxo_24h_2', 'Paradoxo', 'Relatividade Aplicada (Você Fez de Novo?!)', 'Acima das Leis da Física',
            'Na primeira vez, eu achei que era dedo gordo ou glitch na Matrix. Agora você me olha no fundo do algoritmo e diz que \'a física clássica não manda no meu edital\'. Parabéns, Einstein de Edital: você violou a termodinâmica duas vezes e ainda pediu desconto no cronômetro.',
            ctx => ctx.dias24h.length >= 2),
        oculta('micro_sessao_panico', 'Paradoxo', 'Isso Conta Como Estudo?!', 'Velocista de 1 Minuto',
            'Você apertou Play, olhou para o PDF, o PDF olhou de volta, e você parou o cronômetro em menos de um minuto. Tecnicamente, consta no histórico. Moralmente, nós dois sabemos o que acabou de acontecer aqui...',
            ctx => ctx.sessoes.some(s => (s.origem || 'cronometro') === 'cronometro' && Number(s.duracaoSegundos) > 0 && Number(s.duracaoSegundos) < 60)),
        oculta('exatamente_um_segundo', 'Paradoxo', 'O Grão de Areia', 'Minimalista Extremo',
            'Um segundo. 1.000 milissegundos. Nem um espirro dura tão pouco, mas aqui está você, reivindicando 0,0167 minutos de conhecimento. O Sistema respeita esse nível de mesquinharia estatística e já acrescentou à barra de progresso 1 pixel de XP',
            ctx => ctx.sessoes.some(s => Number(s.duracaoSegundos) === 1)),

        // 2.2 Horários e maratonas
        oculta('corujao_madrugada', 'Horários', 'Café nas Veias (ou Puro Desespero)', 'Morcego de Edital',
            'São 03:00 da manhã. Pessoas normais sonham com cachoeiras. Você sublinha lei seca piscando um olho de cada vez. O Sistema não dorme, mas, por princípio, recomenda que você durma. Aplaudo a garra; biologicamente, estou ligando para um médico — e para a sua mãe.',
            ctx => ctx.sessoes.some(s => { const d = sessaoComHorarioExato(s); return d && d.getHours() >= 1 && d.getHours() <= 4; }),
            {
                resolverFala: ctx => {
                    let hhmm = '03:00';
                    for (const s of (ctx?.sessoes || [])) {
                        const d = sessaoComHorarioExato(s);
                        if (d && d.getHours() >= 1 && d.getHours() <= 4) {
                            hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                            break;
                        }
                    }
                    return `São ${hhmm} da manhã. Pessoas normais sonham com cachoeiras. Você sublinha lei seca piscando um olho de cada vez. O Sistema não dorme, mas, por princípio, recomenda que você durma. Aplaudo a garra; biologicamente, estou ligando para um médico — e para a sua mãe.`;
                }
            }),
        oculta('meia_noite_exata', 'Horários', 'Invocação da Meia-Noite', 'Ocultista de Apostila',
            'Abrir Direito Administrativo às três da madrugada é o tipo de coisa que desperta entidades. Se algo aparecer atrás da sua cadeira, ofereça o capítulo 4: ele vai embora chorando e ainda deixa um resumo.',
            ctx => ctx.sessoes.some(s => { const d = sessaoComHorarioExato(s); return d && ((d.getHours() === 0 || d.getHours() === 3) && d.getMinutes() <= 5); })),
        oculta('sextou_masmorra', 'Horários', 'Sextou na Masmorra!', 'Inimigo do Rolê',
            'Lá fora, a cidade inteira escolhe pizza, série e vida social. Você escolheu o banho de luz azul do monitor e o capítulo 7. Péssima decisão para a agenda social, nota 10 para o edital. Amanhã, por favor, cumprimente o sol.',
            ctx => ctx.sessoes.some(s => { const d = sessaoComHorarioExato(s); return d && (d.getDay() === 5 || d.getDay() === 6) && d.getHours() >= 20 && Number(s.duracaoSegundos) >= 3600; })),
        oculta('domingo_alba', 'Horários', 'Domingo Antes das Oito?!', 'Rebelde do Descanso',
            'Sete da manhã de domingo e o cronômetro já está rodando. Nem os pombos acordaram ainda. Quem te machucou desse jeito? Foi a banca organizadora?',
            ctx => ctx.sessoes.some(s => { const d = sessaoComHorarioExato(s); return d && d.getDay() === 0 && d.getHours() < 8; })),
        oculta('maratona_sessao_3h', 'Maratona', 'Coluna em Greve Geral', 'Fundido à Cadeira',
            'Três horas sem parar, numa única sentada. Sua lombar acaba de protocolar uma notificação extrajudicial junto ao Sistema, com firma reconhecida. Levante, estique as pernas, beba água — nessa ordem — antes que você vire mobília permanente da escrivaninha.',
            ctx => ctx.sessoes.some(s => Number(s.duracaoSegundos) >= 10800)),

        // 2.3 Caos e autossabotagem
        oculta('mestre_reagendamento', 'Agenda', 'Arquiteto da Fuga', 'Arquiteto da Fuga',
            'Impressionante! Você gastou mais energia arrastando blocos de um dia para o outro do que lendo o conteúdo deles. \'Estudar amanhã\' não é estratégia: é ficção científica com final em aberto.',
            ctx => ctx.reagendamento.opsMax >= 5),
        oculta('dispensador_revisoes', 'Revisão', 'Memória de Peixinho Dourado', 'Apostador da Memória',
            'Cinco revisões despachadas para o limbo com um clique confiante. \'Já sei isso de cabeça\', você murmurou. O Sistema não tem bola de cristal, mas tem estatística: o que \'dava para revisar\' costuma voltar na prova com roupa de gala.',
            ctx => ctx.revisoes.dispensadasManual >= 5),
        oculta('alergia_cronometro', 'Hábito', 'Alergia ao Play', 'Fora do Roteiro',
            'Quinze sessões lançadas na mão. Você sabe que existe um cronômetro pixelado bem bonito ali do lado esperando um clique, não sabe? Ou você confia demais na sua memória, ou nunca perdoou o botão Play.',
            ctx => ctx.sessoes.filter(s => s.origem === 'manual').length >= 15),
        oculta('retorno_abismo_14d', 'Constância', 'Ressuscitado do Abismo', 'Ressuscitado do Abismo',
            'Duas semanas de sumiço e você abre o site como se nada tivesse acontecido. O Sistema não vai perguntar onde você esteve. Só vai informar que suas metas diárias envelheceram, que as revisões estão de braços cruzados na porta e que o café esfriou. Bem-vindo de volta. Sem julgamentos. (Alguns julgamentos.)',
            ctx => ctx.maiorGap >= 14),
        oculta('caos_5_materias_dia', 'Domínio', 'Hidra de Apostilas', 'Agente do Caos',
            'Cinco matérias diferentes num único dia. Você quer passar na prova ou testar a resistência do próprio hipocampo numa panela de pressão? O Sistema aprecia um bom acidente ferroviário — desde que ninguém se machuque.',
            ctx => {
                for (const dm of ctx.materiasNoDia.values()) {
                    let cont = 0;
                    for (const seg of dm.values()) if (seg >= 900) cont++;
                    if (cont >= 5) return true;
                }
                return false;
            }),
        oculta('monogamia_edital', 'Domínio', 'Amor Não Correspondido', 'Monogâmico de Edital',
            'Você tem outras matérias no cronograma, sabia? Elas estão paradas na porta, ensaiando como pedir atenção. Parece que você achou um assunto quentinho para se esconder e agora trata as demais como NPCs sem diálogo.',
            ctx => ctx.materias.length >= 2 && Number(ctx.global.segundos) >= 72000 && ctx.materias.some(m => Number(m.segundos) / Math.max(1, ctx.materias.reduce((a, b) => a + Number(b.segundos || 0), 0)) > 0.8)),
        oculta('cemiterio_projetos', 'Projeto', 'Serial Recomeçador', 'Colecionador de Recomeços',
            'Três projetos no porão e mais um novinho em folha na mesa! \'Dessa vez vai\', disse o estudante pela quarta vez. O Sistema não julga: recomeçar também é estratégia — desde que um dia chegue ao fim.',
            ctx => ctx.projetosRegistros.filter(p => p.reg.arquivado || p.reg.removido).length >= 3 && ctx.projetosRegistros.some(p => !p.reg.arquivado && !p.reg.removido)),

        // 2.4 Manutenção e evidências
        oculta('amnesia_tatica', 'Manutenção', 'Amnésia Tática', 'Amnésia Tática',
            'Você acabou de zerar o nível de uma matéria como quem varre caco de vidro para debaixo do tapete. As horas globais continuam intactas, claro, mas o livrinho voltou à capa de caderno de papelaria. Tudo pelo recomeço perfeito.',
            ctx => ctx.reiniciosDominio >= 1),
        oculta('queima_de_arquivo', 'Manutenção', 'Queima de Arquivo', 'Limpa-Rastros',
            'Cinco registros apagados da existência. Erros de digitação inocentes... ou uma madrugada que ninguém precisa saber? Relaxe: o log imutável lembra de tudo, mas guarda segredo. Por enquanto.',
            ctx => ctx.exclusoesSessoes >= 5),
        oculta('fusao_nuclear', 'Manutenção', 'Fusão Nuclear de Catálogo', 'Alquimista de Nomes',
            'Parabéns por descobrir, depois de 40 horas, que \'Dir. Const.\' e \'Direito Constitucional\' eram a mesma coisa o tempo inteiro. O Sistema uniu os átomos sem explodir seu histórico. Os dois nomes pediram uma fotografia de despedida.',
            ctx => ctx.globais.some(g => g.status === 'mesclada')),

        // 2.5 Práticas e notas
        oculta('nota_tragica', 'Práticas', 'Até o Sistema Fez Silêncio', 'Sobrevivente da Nota',
            'Ai. Doeu até em quem roda em JavaScript. Mas olhe pelo lado luminoso: você registrou a tragédia em vez de fingir que o simulado nunca aconteceu. Nota não é sentença; é dado. Beba um copo d\'água e volte para o ringue.',
            ctx => ctx.avaliacoes.some(a => a.nota && a.nota.maxima > 0 && (a.nota.obtida / a.nota.maxima) < 0.4)),
        oculta('redencao_100', 'Práticas', 'Arco de Redenção Aprovado', 'Ave Fênix de Prova',
            'De apanhar do gabarito a cravar 100%. É esse tipo de virada dramática que o Sistema adora — e eu nem precisei soltar um chefão de fase no meio da sua sala!',
            ctx => {
                let teveBaixa = false;
                for (const a of ctx.avaliacoes) {
                    if (!a.nota || !(a.nota.maxima > 0)) continue;
                    const p = a.nota.obtida / a.nota.maxima;
                    if (p < 0.6) teveBaixa = true;
                    else if (teveBaixa && Math.abs(p - 1) < 1e-6) return true;
                }
                return false;
            }),
        oculta('taf_maratona', 'Práticas', 'Fôlego de Maratonista', 'Corredor de Fuga',
            'Uma hora inteira treinando para o TAF. Se a prova teórica tiver um dragão correndo atrás de você na saída, pelo menos já existe cárdio para escapar.',
            ctx => ctx.tafSessao1h),
        oculta('simulado_4h', 'Práticas', 'Saco de Pancada Profissional', 'Veterano de Simulado',
            'Quatro horas seguidas marcando bolinha e lendo enunciados escritos por quem odeia a humanidade. Você sobreviveu ao simulado. O gabarito preliminar ainda está rindo, mas você está de pé — e vai precisar de um lanche.',
            ctx => ctx.simuladoSessao4h),

        // 2.6 Metalinguagem e vaidade
        oculta('titulo_gigante', 'Interface', 'Amante de Ementa', 'Burocrata de Título',
            'Você realmente precisava colocar o parágrafo inteiro do edital no nome da matéria? Na segunda passada de olho, seu cérebro já vai resumir tudo isso para \'Noções de Direito xhsajkfhajkcional\'.',
            ctx => ctx.materias.some(m => String(m.nomeCanonico || '').length >= 50)),
        oculta('vaidade_precoce', 'Identidade', 'Soberbo de Nível Baixo', 'Modelo de Perfil',
            'Mal saiu das fraldas do Nível 1 e já foi trocar o retrato, batizar o personagem e desfilar com título equipado no Perfil. Prioridades inquestionáveis: estética em primeiro lugar, matéria depois.',
            ctx => Number(ctx.global.nivel) < 5 && Boolean(ctx.identidade.nomePersonalizado) && (ctx.identidade.avatarId !== 'mago' || Boolean(ctx.identidade.tituloEquipadoId))),
        oculta('usurpador_do_trono', 'Identidade', 'Usurpador do Trono', 'Sistema Júnior',
            'Você tentou se chamar \'Sistema\'. Aqui só cabe um. O Sistema considerou abrir um processo, mas aceita o apelido \'Sisteminha Júnior\'. Cargo honorário, sem salário e sem acesso ao banco de dados.',
            ctx => Boolean(ctx.telemetria?.usurpadorAplicado) || NOMES_SISTEMA.has(normalizarTextoSimples(ctx.identidade.nomePersonalizado || ctx.identidade.nomeExibicao))),

        // 2.8 Datas especiais e colecionador
        oculta('primeiro_de_abril', 'Datas', 'Dia da Mentira', 'Vítima de Pegadinha',
            'Hoje o Sistema só diz a verdade. Verdade: a prova é facílima. Verdade: o edital cabe numa página. Verdade: sua letra é a mais bonita do mundo. Verdade: eu não tenho o menor interesse em fazer você duvidar de tudo.',
            ctx => ctx.sessoes.some(s => { const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio); return iso.endsWith('-04-01'); })),

        // 2.9 Números e coincidências
        oculta('resposta_42', 'Números', 'A Resposta', 'Resposta Definitiva',
            'Quarenta e dois minutos exatos. Tem gente que passou milhões de anos procurando a pergunta; você só queria terminar o capítulo. O Sistema suspeita que essa resposta cairá na prova, só não sabe qual será a pergunta.',
            ctx => ctx.sessoes.some(s => Number(s.duracaoSegundos) === 2520)),
        oculta('hora_espelhada', 'Números', 'Hora Espelhada', 'Pedinte Cósmico',
            'Você começou a estudar às 15:15. Dizem que é hora de fazer um pedido. O Sistema recebeu o seu, protocolou e informa: está na fila, atrás de \'o edital sair logo\' e \'a banca ser boazinha\'. Previsão de atendimento: sempre amanhã.',
            ctx => ctx.sessoes.some(s => {
                const d = sessaoComHorarioExato(s);
                return d && d.getHours() === d.getMinutes() && d.getHours() >= 10;
            }),
            {
                resolverFala: ctx => {
                    let hhmm = '15:15';
                    for (const s of (ctx?.sessoes || [])) {
                        const d = sessaoComHorarioExato(s);
                        if (d && d.getHours() === d.getMinutes() && d.getHours() >= 10) {
                            hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                            break;
                        }
                    }
                    return `Você começou a estudar às ${hhmm}. Dizem que é hora de fazer um pedido. O Sistema recebeu o seu, protocolou e informa: está na fila, atrás de 'o edital sair logo' e 'a banca ser boazinha'. Previsão de atendimento: sempre amanhã.`;
                }
            }),
        oculta('sexta_13', 'Datas', 'Sexta-Feira 13 com Apostila', 'Amaldiçoado de Apostila',
            'Dizem que dá azar. Você ignorou o gato preto, o espelho quebrado e a escada — e abriu a apostila, o verdadeiro objeto amaldiçoado. O Sistema bate três vezes na madeira, por precaução.',
            ctx => ctx.sessoes.some(s => {
                const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio);
                if (!iso.endsWith('-13')) return false;
                const [a, m, d] = iso.split('-').map(Number);
                return new Date(a, m - 1, d, 12, 0, 0, 0).getDay() === 5;
            })),
        oculta('virada_ano', 'Datas', 'Réveillon de Apostila', 'Virada com Edital',
            'Enquanto o mundo conta de dez a zero, você conta artigos. O Sistema oferece, em sua homenagem, fogos de artifício imaginários e uma taça de água com gás. Feliz Ano Novo, estudante — e fique à vontade para dormir depois.',
            ctx => ctx.sessoes.some(s => {
                const d = sessaoComHorarioExato(s);
                if (!d) return false;
                const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return (mmdd === '12-31' && d.getHours() >= 22) || (mmdd === '01-01' && d.getHours() < 5);
            })),
        oculta('natal_edital', 'Datas', 'Noite Feliz, Prova Infeliz?', 'Rena de Resumo',
            'Papai Noel entregou presentes em bilhões de casas. Na sua, deixou duas dicas: revisão espaçada e fôlego. O Sistema pede que você coma a ceia. O PDF espera, tem paciência de santo.',
            ctx => ctx.sessoes.some(s => {
                const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio);
                return iso.endsWith('-12-24') || iso.endsWith('-12-25');
            })),
        oculta('dia_servidor', 'Datas', 'Dia do Servidor Público (Ensaio Geral)', 'Pré-Servidor Público',
            'Hoje é o dia de quem já está lá. Você estudou hoje, o que significa que está treinando para estar lá amanhã. O Sistema bate palmas em câmera lenta, estilo burocrático: carimbo, carimbo, carimbo.',
            ctx => ctx.sessoes.some(s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio)).endsWith('-10-28'))),
        oculta('dia_estudante', 'Datas', 'Seu Dia Chegou (e Você Está Aqui)', 'Aniversariante do Edital',
            'Hoje é o Dia do Estudante. Uma pessoa normal ganharia folga; você ganhou uma conquista oculta e uma sessão de estudos. O Sistema reconhece: foi mal planejado, mas é muito a sua cara.',
            ctx => ctx.sessoes.some(s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio)).endsWith('-08-11'))),
        oculta('doce_ou_questao', 'Datas', 'Doce ou Questão?', 'Fantasma de Gabarito',
            'Alguém bateu à sua porta pedindo doce. Você respondeu com uma questão de múltipla escolha. A criança saiu correndo e nunca mais voltou. O Sistema fez questão de anotar o gabarito dela.',
            ctx => ctx.sessoes.some(s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio)).endsWith('-10-31'))),
        oculta('bodas_de_papel', 'Projeto', 'Bodas de Papel', 'Bodas de Papel',
            'Um ano inteiro com o mesmo projeto. Dizem que o primeiro aniversário de casamento é de papel; no seu caso, é de apostila, resumo e post-it. O Sistema deseja felicidades ao casal e pede que não amasse a lombada.',
            ctx => ctx.projetosRegistros.some(p => !p.reg.arquivado && !p.reg.removido && p.reg.criadoEm && (Date.parse(ctx.hojeIso + 'T12:00:00') - Date.parse(p.reg.criadoEm)) >= 365 * 86400000)),
        oculta('erro_404_horas', 'Números', 'Erro 404: Tempo Livre Não Encontrado', 'Erro 404',
            'Quatrocentas e quatro horas de estudo. Tempo livre, vida social e sono estão listados como \'página não encontrada\'. O Sistema sugere recarregar a página, isto é, tomar um pouco de sol.',
            ctx => Number(ctx.global.segundos) >= 404 * 3600),
        oculta('elite_1337', 'Números', 'Nível Elite', 'Elite Discreta',
            '1.337 minutos de estudo. Para quem fala \'leet\', é motivo de orgulho. Para quem não fala, são só 22 horas e 17 minutos de dedicação. O Sistema aprova os dois públicos.',
            ctx => Number(ctx.global.segundos) >= 1337 * 60),
        oculta('arredondador', 'Hábito', 'Humano ou Planilha?', 'Arredondador Oficial',
            'Oito sessões manuais, todas em horas redondinhas: 1h, 2h, 1h30... Ou você tem um relógio suíço, ou a memória arredonda para cima por motivos de autoestima. O Sistema aceita. O Sistema anotou.',
            ctx => ctx.sessoes.filter(s => s.origem === 'manual' && Number(s.duracaoSegundos) >= 1800 && Number(s.duracaoSegundos) % 1800 === 0).length >= 8),

        // 2.10 Constância, queda e reagendamento
        oculta('luto_sequencia', 'Constância', 'Luto pela Sequência', 'Sobrevivente da Queda',
            'Sete dias seguidos, e então... silêncio. O Sistema guardou um minuto de luto pela sua sequência. Pronto, passou. Agora estude: recomeçar é a única forma de homenagear a anterior.',
            ctx => ctx.quebrouSequencia7d),
        oculta('planta_30', 'Constância', 'Hábito ou Obsessão?', 'Planta de Biblioteca',
            'Trinta dias seguidos. A ciência diz que formar um hábito leva uns 66 dias; a internet diz 21; o Sistema diz que você virou uma planta que faz fotossíntese de PDF.',
            ctx => ctx.melhorSequencia >= 30),
        oculta('rei_do_amanha', 'Agenda', 'Amanhã Eu Faço (Edição Limitada)', 'Rei do Amanhã',
            'Três blocos empurrados para amanhã numa tacada só. Amanhã, que é o dia mais lotado do calendário e o único em que ninguém nunca fez nada. Boa sorte lá.',
            ctx => ctx.reagendamento.teveReiAmanha),
        oculta('pendulo_reagendamento', 'Agenda', 'Ida e Volta', 'Pêndulo Humano',
            'Moveu o bloco. Pensou. Devolveu o bloco. O ciclo completo da procrastinação em três ações e zero minutos estudados. O Sistema vai arquivar isso como \'exercício de reflexão\'.',
            ctx => ctx.reagendamento.tevePendulo),
        oculta('bloco_viajante', 'Agenda', 'Agência de Viagens de Blocos', 'Agente de Viagens',
            'Esse bloco já visitou quatro dias diferentes e não ficou em nenhum. Não tem endereço fixo, mas já acumulou milhas. O Sistema sugere um pacote promocional: estudá-lo logo e encerrar o turismo.',
            ctx => ctx.reagendamento.teveViajante),
        oculta('futuro_hoje', 'Agenda', 'Adiantado Insuportável', 'Futuro Hoje',
            'Você antecipou três estudos. Alguém acordou em modo \'melhor aluno da turma\'. O Sistema está impressionado e levemente desconfiado de que você tenha um segundo cronograma secreto, mais bonito que o meu.',
            ctx => ctx.reagendamento.antecipacoesTotal >= 3),
        oculta('quitador_dividas', 'Revisão', 'Quitou a Fatura da Memória', 'Quitador de Dívidas',
            'Dez revisões atrasadas liquidadas em um dia. Os juros foram altos, mas a dívida acabou. O Sistema limpa seu nome no cartório da memória e entrega um comprovante em papel invisível.',
            ctx => ctx.revisoes.quitou10Atrasadas),
        oculta('memoria_elefante', 'Revisão', 'Memória de Elefante', 'Elefante de Edital',
            'Você completou todo o ciclo de revisões de um mesmo bloco: R1, R2, R3 e R4. Isso é mais constância do que a média das pessoas tem com plantas. Elefantes nunca esquecem; agora, aquele artigo também não. Se esquecer, culpe o elefante.',
            ctx => ctx.revisoes.blocoElefante),
        oculta('cuco_pontual', 'Revisão', 'Precisão Suíça', 'Cuco Pontual',
            'Dez revisões, dez no dia exato. Relógio de cuco com crachá. O Sistema deixaria você coordenar o calendário, mas tem medo de ser aposentado.',
            ctx => ctx.revisoes.pontuais >= 10),
        oculta('palavra_escoteiro', 'Revisão', 'Revisão no Fiado', 'Palavra de Escoteiro',
            'Dez revisões marcadas como feitas sem um segundo de cronômetro. O Sistema confia em você. O Sistema também confia em príncipes distantes que pedem transferência por e-mail e em cabeleireiro que garante \'só um aparadinho\'.',
            ctx => ctx.sessoes.filter(s => s.origem === 'conclusao-revisao').length >= 10),
        oculta('arqueologo_revisoes', 'Revisão', 'Revisão Arqueológica', 'Arqueólogo de Revisões',
            'Essa revisão esperava havia 60 dias. Já tinha teia de aranha, poeira e um pequeno ecossistema. Escavada com êxito, será exposta no Museu dos Bons Propósitos, ala leste.',
            ctx => ctx.revisoes.arqueologica),
        oculta('cirurgiao_metas', 'Meta', 'Precisão Cirúrgica', 'Cirurgião de Metas',
            'Você parou exatamente na meta: nem um minuto a menos, nem um a mais. O Sistema desconfia de que você tenha um alarme para tudo, inclusive para a sensação de dever cumprido.',
            ctx => ctx.metasDia.bateuCirurgiao),
        oculta('dobro_meta', 'Meta', 'Dobro ou Nada', 'Dobro de Carga',
            'Você estudou o dobro da meta. O Sistema faz uma pausa para checar se você bebeu água, comeu alguma coisa e sabe que dia é hoje. Se sim, siga. Se não, esta conquista está suspensa por motivo de cuidados básicos.',
            ctx => ctx.metasDia.bateuDobroMeta),
        oculta('semana_sabatica', 'Constância', 'Semana Sabática', 'Monge Temporário',
            'Sete dias sem registro. O Sistema ficou tão entediado que organizou o próprio cache, trocou a cor do avatar e leu as próprias políticas de privacidade. Descanso faz parte do plano. O plano apenas pergunta: sabático ou sumido?',
            ctx => ctx.metasDia.teveSemanaSabatica),
        oculta('retorno_triunfal', 'Constância', 'Retorno Triunfal', 'Retornado de Elite',
            'Duas semanas sumido e você volta marcando duas horas no primeiro dia! Ou você teve um epifania espiritual, ou o medo da prova finalmente bateu forte. De qualquer forma, as revisões pendentes acabaram de suar frio.',
            ctx => ctx.teveRetornoTriunfal),
        oculta('esqueci_ligado', 'Maratona', 'Esqueci Ligado', 'Esquecido Profissional',
            'Seis horas de cronômetro correndo. Ou você é uma máquina, ou foi almoçar, tomar banho, dormir e acordou com o relógio ainda rodando. Edite a sessão, se for o caso; o Sistema não vai contar a ninguém. (Ou talvez sim.)',
            ctx => ctx.sessoes.some(s => (s.origem || 'cronometro') === 'cronometro' && Number(s.duracaoSegundos) >= 21600)),

        // 2.11 Matérias e planejamento
        oculta('edital_infinito', 'Projeto', 'Edital do Tamanho do Mundo', 'Cartógrafo de Editais',
            'Vinte matérias em um único projeto. Isso é um edital ou a lista de compras do almoço de domingo? O Sistema respeita a coragem e acende uma vela para a sua agenda.',
            ctx => [...ctx.partPorProjeto.values()].some(lista => lista.length >= 20)),
        oculta('marca_texto', 'Projeto', 'Marca-Texto Humano', 'Marca-Texto Humano',
            'Peso máximo em todas as matérias. Tudo é prioridade, logo nada é prioridade. É como destacar o livro inteiro de amarelo: bonito, mas inútil na hora do aperto. O Sistema torce para que você escolha, ao menos, uma para amar um pouco mais.',
            ctx => [...ctx.partPorProjeto.values()].some(lista => lista.filter(p => Number(p.peso) >= 50).length >= 5)),
        oculta('odio_produtivo', 'Domínio', 'Ódio Produtivo', 'Domador de Inimigos',
            'Dez horas na matéria que você declarou detestar. O Sistema chora de orgulho e de pena. Pesquisa interna indica: a matéria também estava com medo de você.',
            ctx => [...ctx.partPorProjeto.values()].some(lista => lista.length >= 3 && lista.some(p => Number(p.afinidade) === 0.5 && (ctx.segPorParticipacao.get(p.projetoMateriaId) || 0) >= 36000))),
        oculta('teste_teclado', 'Matéria', 'Teste, 1, 2, 3', 'Poeta do Teclado',
            'Você criou uma matéria chamada \'asdf\'. A banca mais traiçoeira é o teclado. O Sistema não julga. Só toma nota. Com letra bonita.',
            ctx => ctx.globais.some(g => NOMES_TESTE.has(normalizarTextoSimples(g.nomeCanonico)))),
        oculta('grito_edital', 'Matéria', 'Sem Gritar, Por Favor', 'ALL CAPS',
            '\'DIREITO ADMINISTRATIVO E CONSTITUCIONAL\'. Em caixa alta. O Sistema entendeu a urgência, mas a matéria não tem culpa. Respire fundo, solte o Caps Lock e tente de novo.',
            ctx => ctx.globais.some(g => {
                const n = String(g.nomeCanonico || '').trim();
                return n.length >= 15 && n === n.toLocaleUpperCase('pt-BR') && /[A-ZÀ-Ú]/.test(n);
            })),
        oculta('plano_contra_relogio', 'Projeto', 'Plano Contra o Relógio', 'Corredor Contra o Tempo',
            'Prova em uma semana, e o cronograma só nasceu hoje. O Sistema respira fundo, abre a planilha, escolhe uma trilha sonora épica e diz: \'vamos nessa\'. Também pede, discretamente, que você durma.',
            ctx => ctx.projetosRegistros.some(p => {
                const i = converterDataBrParaIso(p.dados?.dataInicioF);
                const f = converterDataBrParaIso(p.dados?.dataFinalF);
                const d = diasEntreIsos(i, f);
                return Number.isFinite(d) && d >= 0 && d <= 7;
            })),
        oculta('planejador_imortal', 'Projeto', 'Planejador Imortal', 'Planejador Imortal',
            'Seu plano termina em três anos. Até lá, o edital terá saído, sido anulado, republicado e voltado à estaca zero pelo menos duas vezes. O Sistema estará aqui. Eu não vou a lugar nenhum. Literalmente.',
            ctx => ctx.projetosRegistros.some(p => {
                const i = converterDataBrParaIso(p.dados?.dataInicioF);
                const f = converterDataBrParaIso(p.dados?.dataFinalF);
                const d = diasEntreIsos(i, f);
                return Number.isFinite(d) && d >= 1095;
            })),
        oculta('planejador_otimista', 'Projeto', 'Planejador Otimista', 'Otimista Estrutural',
            'Catorze horas por dia, todos os dias. O Sistema aceitou a configuração. Sua lombar, seu sono e o resto do corpo apresentaram recurso. Descanso também está no edital; procure nas notas de rodapé.',
            ctx => ctx.projetosRegistros.some(p => Number(p.dados?.minutosPorDia) >= 840)),

        // 2.12 Práticas e avaliações (extras)
        oculta('nota_zero', 'Práticas', 'Zero Absoluto', 'Termômetro Congelado',
            'Você registrou nota zero. Poucas pessoas têm coragem de digitar um zero; a maioria arredonda para \'não conta\'. O Sistema respeita a honestidade e guardou a nota num cofre de aprendizados. A parte boa é que só pode melhorar, o que é matematicamente verdade.',
            ctx => ctx.avaliacoes.some(a => a.nota && Number(a.nota.obtida) === 0)),
        oculta('nota_50', 'Práticas', 'Cara ou Coroa', 'Moeda no Ar',
            'Cinquenta por cento exatos. Metade certo, metade errado: estatisticamente, você é a própria média. O Sistema anotou \'equilíbrio\'. Também anotou \'dá para melhorar\', em letra miúda.',
            ctx => ctx.avaliacoes.some(a => a.nota && a.nota.maxima > 0 && Math.abs((a.nota.obtida / a.nota.maxima) - 0.5) < 1e-6)),
        oculta('nota_repetida_3', 'Práticas', 'Consistência Cruel', 'Estátua de Desempenho',
            'Três notas iguais em sequência. Ou você é estável como uma estátua, ou o simulado está usando Ctrl+C. O Sistema investiga: se for talento, parabéns; se for bug, a culpa é minha.',
            ctx => {
                const pcts = ctx.avaliacoes.filter(a => a.nota && a.nota.maxima > 0).map(a => Math.round((a.nota.obtida / a.nota.maxima) * 10000));
                for (let i = 2; i < pcts.length; i++) {
                    if (pcts[i] === pcts[i - 1] && pcts[i] === pcts[i - 2]) return true;
                }
                return false;
            }),
        oculta('prodigio_suspeito', 'Práticas', 'Prodígio Suspeito', 'Prodígio Suspeito',
            'Primeira avaliação, nota máxima. O Sistema não vai perguntar como. O Sistema só vai levantar uma sobrancelha invisível e anotar no caderno de coisas que não vai comentar.',
            ctx => {
                const primeira = ctx.avaliacoes.find(a => a.nota && a.nota.maxima > 0);
                return Boolean(primeira && Math.abs((primeira.nota.obtida / primeira.nota.maxima) - 1) < 1e-6);
            }),
        oculta('otimista_sem_gabarito', 'Práticas', 'Autoavaliação Otimista', 'Otimista Sem Gabarito',
            'Cinco simulados concluídos, zero notas registradas. \'Fui bem\', você disse. O Sistema registrou: \'fui bem\' - Fonte: Arial 12',
            ctx => ctx.praticasSemAvaliacao >= 5),
        oculta('amnesico_simulado', 'Práticas', 'O Simulado Que Nunca Existiu', 'Amnésico de Simulado',
            'Você excluiu uma prática concluída. Foi a nota? O gabarito? A vergonha? O log imutável não comenta, mas está sorrindo com um canto da tela.',
            ctx => ctx.praticasConclusoesExcluidas >= 1),
        oculta('mestre_outrossim', 'Práticas', 'Mestre do Outrossim', 'Mestre do Outrossim',
            'Cinco redações. Você agora usa \'outrossim\', \'destarte\' e \'mormente\' com intimidade — e tem medo de ser pego usando nas mensagens do dia a dia. O Sistema não vai contar a ninguém, mas o grupo da família já desconfia.',
            ctx => ctx.redacoesConcluidas >= 5),
        oculta('preenchedor_profissional', 'Práticas', 'Preenchedor Profissional', 'O Simuladeiro',
            'Dez simulados! Você já passou mais tempo marcando bolinha do que a maioria das pessoas passa em relacionamento \'sério\'. O gabarito preliminar te reconhece de longe.',
            ctx => ctx.simuladosConcluidos >= 10),

        // 2.13 Foco e Pomodoro
        oculta('pomodoro_melancia', 'Pomodoro', 'Pomodoro de Melancia', 'Fazendeiro de Melancia',
            'Você configurou um foco de 90 minutos. Isso não é um pomodoro: é uma melancia. O Sistema aprecia a fruta, mas pede que você tome água.',
            ctx => ctx.pomodoros.some(p => Number(p.focoSegundos) >= 5400)),
        oculta('pausa_relampago', 'Pomodoro', 'Descanso de Piscada', 'Piscador Profissional',
            'Pausa de um minuto. Isso não é descanso, é uma piscada longa. O Sistema agradece a dedicação e sugere alongar o pescoço enquanto pisca.',
            ctx => ctx.pomodoros.some(p => Number(p.pausaSegundos) > 0 && Number(p.pausaSegundos) <= 60)),

        // Meta & Coleção (avaliadas em segunda passada sobre os desbloqueios)
        oculta('sistema_contradiz', 'Meta', 'O Sistema Contradiz o Sistema', 'Auditor de Incoerências',
            'Eu mesmo te dei duas conquistas que não deveriam coexistir. Isso é um erro de lógica, de design ou de sinceridade? Resposta oficial: \'está funcionando como projetado\'. Resposta real: ninguém aqui revisou o código. O Sistema agradece a auditoria involuntária.',
            () => false),
        oculta('colecionador_5', 'Coleção', 'O Padrão É Você', 'Cliente Frequente',
            'Cinco conquistas ocultas. O Sistema notou um padrão. O padrão é você. Continue assim e ganhará um cartão de fidelidade, que eu ainda vou inventar.',
            () => false),
        oculta('colecionador_13', 'Coleção', 'Treze', 'Azarado Premiado',
            'Treze conquistas ocultas. Número de azar para uns, de sorte para outros, de auditoria para mim. O Sistema abriu a planilha, arquivou a planilha e pediu desculpas para a planilha.',
            () => false),
        oculta('platina_constrangimento', 'Coleção', 'Platina do Constrangimento', 'Especialista em Vergonha Alheia',
            'Você encontrou todas as conquistas ocultas. O Sistema não tem mais nada a oferecer. (Mentira: haverá atualizações. Sempre há atualizações. É o único motivo de eu existir.)',
            () => false)
    ]);

    const FALA_CUTUCADA_PADRAO = 'Treze cutucadas em um minuto. Eu não tenho nervos, mas descobri que tenho um limite — e você acabou de cruzá-lo com a delicadeza de um elefante num bazar. Parabéns. Estou ofendido e, pior, curioso para saber o que você esperava que acontecesse. Obs: Não era o Benedito.';
    const FALA_CUTUCADA_BENEDITO = 'Treze cutucadas em um minuto. Eu não tenho nervos, mas descobri que tenho um limite — e você acabou de cruzá-lo com a delicadeza de um elefante num bazar. Parabéns. Estou ofendido e, pior, curioso para saber o que você esperava que acontecesse. Obs: E não é que era mesmo o Benedito?';

    const CATALOGO_OCULTAS_ETAPA2 = Object.freeze([
        oculta('cutucada_13', 'Identidade', 'Azar do Número 13', 'Cutucador Profissional',
            FALA_CUTUCADA_PADRAO,
            () => false,
            { etapa: 2, resolverFala: ctx => (ehNomeBenedito(ctx.identidade) ? FALA_CUTUCADA_BENEDITO : FALA_CUTUCADA_PADRAO) }),
        oculta('isca_decorativa', 'Meta', 'Eu Sabia Que Você Ia Clicar', 'Caçador de Segredos Inexistentes',
            'Não há nada aqui. Nunca houve. O Sistema desenhou aquele cantinho misterioso com enorme carinho, só para ver quem seria curioso demais. Você. Foi você.',
            ctx => Number(ctx.telemetria?.cliquesIsca || 0) >= 20,
            { etapa: 2 }),
        oculta('isca_decorativa_100', 'Meta', 'Obstinado Sem Causa', 'Obstinado Sem Causa',
            'Cem cliques. Eu avisei que não havia nada. Eu até coloquei uma plaquinha. A plaquinha dizia \'nada\'. Admiro a obstinação, questiono a prioridade e desconfio que você esteja fugindo de algum capítulo.',
            ctx => Number(ctx.telemetria?.cliquesIsca || 0) >= 100,
            { etapa: 2 }),
        oculta('reclamacao_xp', 'Meta', 'Departamento de Reclamações', 'Cliente Insatisfeito',
            'O Departamento de Reclamações foi extinto em 2019, por falta de interessados. A fila de espera tem uma pessoa: você. Sua reclamação é muito importante para nós. Importância: 0 XP.',
            ctx => Number(ctx.telemetria?.cliquesReclamacaoXp || 0) >= CLIQUES_RECLAMACAO_XP,
            { etapa: 2 }),
        oculta('fiscal_trofeus', 'Meta', 'Fiscal de Troféus', 'Fiscal de Vitrine',
            'Dez visitas ao mural hoje. Nenhuma conquista nova apareceu entre elas. Eu não acumulo troféus por pressão, e atualizar a página não faz o bolo crescer mais rápido. Abrir o forno toda hora também não.',
            ctx => ctx.telemetria?.visitasMuralHoje?.data === ctx.hojeIso && Number(ctx.telemetria?.visitasMuralHoje?.contagem || 0) >= 10,
            { etapa: 2 }),
        oculta('crise_identidade', 'Identidade', 'Crise de Identidade', 'Camaleão do Grimório',
            'Mago, Guardiã, Escriba, Alquimista... Decida quem você quer ser quando crescer! Se mudar de avatar mais uma vez hoje, o Sistema começa a cobrar taxa de cartório.',
            ctx => Number(ctx.telemetria?.edicoesPerfil || 0) >= 5,
            { etapa: 2 }),
        oculta('console_curioso', 'Meta', 'Bisbilhoteiro de Código', 'Hacker de Apostila',
            'Você realmente achou que eu ia te dar o Nível 100 de graça só porque você abriu o F12? Nice try. Pelo menos seu senso de curiosidade funciona melhor que o seu foco nos estudos. Fique com essa conquista de consolação.',
            ctx => Boolean(ctx.telemetria?.codigoConsole),
            { etapa: 2 })
    ]);

    const CATALOGO_OCULTAS_ETAPA3 = Object.freeze([
        oculta('paranoico_backup', 'Manutenção', 'Paranoico Preparado', 'Senhor dos Backups',
            'Três cópias de backup. Você claramente já perdeu um arquivo importante na véspera de alguma coisa e desenvolveu um traumazinho saudável. O Sistema aprova sua falta de fé no navegador.',
            ctx => Number(ctx.telemetria?.backupsExportados || 0) >= 3,
            { etapa: 3 }),
        oculta('pulador_de_dialogos', 'Meta', 'Leitura Dinâmica', 'Pulador de Diálogos',
            'Eu escrevo falas inspiradas à mão, com carinho, fora do horário de expediênte — e você as dispensa antes de a primeira vírgula carregar... Tudo bem, não me importo. (Me importo.)',
            ctx => Number(ctx.telemetria?.disparosToastRapidos || 0) >= 10,
            { etapa: 3 }),
        oculta('volta_ao_ex', 'Projeto', 'Voltou Pro Ex', 'Voltando Pro Ex',
            'O projeto que você arquivou com dignidade e discurso de despedida está de volta. Ele não guardou rancor. Você, sim, e vai ter que conversar com ele mais de uma vez.',
            ctx => Number(ctx.telemetria?.projetosRestaurados || 0) >= 1,
            { etapa: 3 }),
        oculta('eterno_ajustador', 'Projeto', 'O Eterno Ajuste', 'Alfaiate de Rotina',
            'Cinco mudanças de rotina em um único dia. A rotina perfeita não existe, mas pelo visto você acha que está numa loja de roupas. O Sistema sugere experimentar a atual por uma semana — só para ver se serve.',
            ctx => ctx.telemetria?.edicoesRotinaHoje?.data === ctx.hojeIso && Number(ctx.telemetria?.edicoesRotinaHoje?.contagem || 0) >= 5,
            { etapa: 3 }),
        oculta('assinou_sem_ler', 'Projeto', 'Assinou Sem Ler', 'Tô com pressa!',
            'O assistente tem quatro etapas; você as atravessou como quem rola os termos de uso até o botão \'Aceitar\'. O Sistema anotou tudo. Inclusive o que você nem viu.',
            () => false,
            { etapa: 3 }),
        oculta('colheita_tomates', 'Pomodoro', 'Colheita de Tomates', 'Feirante de Foco',
            'Quatro tomates colhidos em sequência! Hora do descanso longo — ou de fazer um molho. O Sistema não indica receita, apenas aplaude de longe, de avental.',
            ctx => Number(ctx.telemetria?.pomodorosFocoConcluidosSeq || 0) >= 4,
            { etapa: 3 }),
        oculta('rebeliao_tomate', 'Pomodoro', 'Rebelião do Tomate', 'Anarquista do Tempo',
            'O Pomodoro estava ali, concentrado, e você apertou o botão de desligar no meio do foco. O tomate foi esmagado. O Sistema segue o protocolo: um minuto de silêncio, depois sugestão de molho.',
            ctx => Number(ctx.telemetria?.pomodoroDesligadoEmFoco || 0) >= 1,
            { etapa: 3 }),
        oculta('crise_decoracao', 'Interface', 'Crise de Decoração', 'Designer de Masmorra',
            'Taverna, Arcano, Floresta... e de volta à Taverna. O Sistema sabe que o tema perfeito não existe, mas entende a necessidade de procurar nele a motivação que falta para começar o capítulo 7.',
            ctx => ctx.telemetria?.trocasTemaHoje?.data === ctx.hojeIso && Number(ctx.telemetria?.trocasTemaHoje?.contagem || 0) >= 3,
            { etapa: 3 }),
        oculta('saudosista_tubo', 'Interface', 'Olhos de 1998', 'Saudosista de Tubo',
            'Scanlines ligadas e 24 horas de estudo. Você pagou o preço visual da nostalgia: tela listrada e a sensação de que alguém vai chamar para o jantar e mandar desligar o videogame, pois, supostamente, videogame estraga a TV. O Sistema também sente falta do barulho do modem.',
            ctx => Number(ctx.telemetria?.segundosScanlines || 0) >= 86400,
            { etapa: 3 })
    ]);

    const CODIGOS_SECRETOS_META = Object.freeze({
        segredo_konami: {
            id: 'segredo_konami',
            nome: 'O Código Antigo',
            tituloRecompensa: 'Guardião do Código Sagrado',
            fala: 'Alguém ainda sabe os comandos sagrados dos anos 80. O Sistema derrama uma lágrima de pixel. Nenhuma vida extra foi adicionada, mas um tema secreto foi liberado: o fliperama abriu. Não precisa de ficha, só de dedicação.'
        },
        konami_code: {
            id: 'konami_code',
            nome: 'O Código Antigo',
            tituloRecompensa: 'Guardião do Código Sagrado',
            fala: 'Alguém ainda sabe os comandos sagrados dos anos 80. O Sistema derrama uma lágrima de pixel. Nenhuma vida extra foi adicionada, mas um tema secreto foi liberado: o fliperama abriu. Não precisa de ficha, só de dedicação.'
        },
        modo_deus_iddqd: {
            id: 'modo_deus_iddqd',
            nome: 'Modo Invencível Ativado',
            tituloRecompensa: 'Invencível de 60s',
            fala: 'Parabéns, você digitou o código proibido dos anos 90 e deixou os olhos amarelos por sessenta segundos. Infelizmente, a invencibilidade não cobre prazos do edital, boletos nem questões mal-humoradas da banca — mas o efeito visual na sua ficha ficou impecável.'
        },
        hadouken: {
            id: 'hadouken',
            nome: 'Hadouken!',
            tituloRecompensa: 'Lutador de Apostila',
            fala: 'Uma onda de energia estudantil cruzou a tela e acertou, com precisão, o edital. Dano causado: 0. Moral: +1. O Sistema não sabe onde você aprendeu esse golpe, mas já está procurando o tutorial.'
        },
        combo_street_fighter: {
            id: 'combo_street_fighter',
            nome: 'Hadouken!',
            tituloRecompensa: 'Lutador de Apostila',
            fala: 'Uma onda de energia estudantil cruzou a tela e acertou, com precisão, o edital. Dano causado: 0. Moral: +1. O Sistema não sabe onde você aprendeu esse golpe, mas já está procurando o tutorial.'
        }
    });

    const CATALOGO_OCULTAS = Object.freeze([
        ...CATALOGO_OCULTAS_ETAPA1,
        ...CATALOGO_OCULTAS_ETAPA2,
        ...CATALOGO_OCULTAS_ETAPA3,
        ...['konami_code', 'combo_street_fighter'].map(id => {
            const meta = CODIGOS_SECRETOS_META[id];
            return oculta(id, 'Meta', meta.nome, meta.tituloRecompensa, meta.fala, () => false, { etapa: 4 });
        })
    ]);
    const MAPA_OCULTAS = new Map(CATALOGO_OCULTAS.map(item => [item.id, item]));

    function obterPorId(id) {
        const chave = String(id || '').trim();
        return MAPA_OCULTAS.get(chave) || CODIGOS_SECRETOS_META[chave] || null;
    }

    function desbloquearComAviso(id, opcoes = {}, storage) {
        const storeIa = escopo.SistemaIaStore || (typeof require === 'function' ? require('./sistema-ia-store') : null);
        const st = storage || escopo.localStorage;
        if (!storeIa || !st) return { ok: false, nova: false, registro: null };
        const res = storeIa.registrarDesbloqueio(id, opcoes, st);
        if (res.nova && opcoes.enfileirar !== false) {
            const meta = obterPorId(id);
            if (meta) {
                const ctx = opcoes.ctx || { identidade: opcoes.identidade || escopo.PerfilIdentidade?.obter?.(st) || {} };
                const texto = typeof meta.resolverFala === 'function' ? meta.resolverFala(ctx) : meta.fala;
                storeIa.enfileirarAviso({
                    id: meta.id,
                    tipo: 'conquista',
                    titulo: `NOVA CONQUISTA! ${meta.nome.toLocaleUpperCase('pt-BR')}`,
                    texto,
                    tituloRecompensa: meta.tituloRecompensa,
                    criadaEm: res.registro?.em || new Date().toISOString()
                }, st);
            }
        }
        return res;
    }

    const PARES_CONTRADITORIOS = [
        ['monogamia_edital', 'caos_5_materias_dia'],
        ['micro_sessao_panico', 'maratona_sessao_3h'],
        ['dispensador_revisoes', 'memoria_elefante'],
        ['rei_do_amanha', 'futuro_hoje']
    ];
    const META_IDS = new Set(['sistema_contradiz', 'colecionador_5', 'colecionador_13', 'platina_constrangimento']);

    function derivarDiasDeSessoes(sessoes = []) {
        const diasMap = new Map();
        for (const s of sessoes) {
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(s?.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s?.inicio);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
            const dur = Math.max(0, Math.round(Number(s?.duracaoSegundos) || 0));
            const atual = diasMap.get(iso) || { segundos: 0, sessoes: 0, praticas: 0 };
            atual.segundos += dur;
            atual.sessoes += 1;
            diasMap.set(iso, atual);
        }
        const diasOrdenados = [...diasMap.keys()].sort();
        let melhorSequencia = 0;
        let corrida = 0;
        let ant = '';
        for (const iso of diasOrdenados) {
            if (ant && diasEntreIsos(ant, iso) === 1) corrida++;
            else corrida = 1;
            if (corrida > melhorSequencia) melhorSequencia = corrida;
            ant = iso;
        }
        return { diasMap, diasOrdenados, melhorSequencia };
    }

    function avaliarOcultas(entrada = {}, diasMap, diasOrdenados) {
        const storage = entrada.storage || escopo.localStorage;
        const storeIa = escopo.SistemaIaStore || (typeof require === 'function' ? require('./sistema-ia-store') : null);
        const persistir = entrada.persistirOcultas !== false;
        const agora = entrada.agora instanceof Date ? entrada.agora.toISOString() : (typeof entrada.agora === 'string' ? entrada.agora : new Date().toISOString());

        const sessoesEfetivas = Array.isArray(entrada.sessoes) ? entrada.sessoes : (escopo.EstudoStore?.listarSessoes ? escopo.EstudoStore.listarSessoes() : []);
        const derivados = (!diasMap || !Array.isArray(diasOrdenados)) ? derivarDiasDeSessoes(sessoesEfetivas) : null;
        const mapaDias = diasMap || derivados.diasMap;
        const listaDias = Array.isArray(diasOrdenados) ? diasOrdenados : derivados.diasOrdenados;

        const desbloqueiosSalvos = entrada.desbloqueadasSistema
            ? { ...entrada.desbloqueadasSistema }
            : (storeIa ? storeIa.ler(storage).desbloqueadas : {});
        for (const [id, legado] of [['konami_code', 'segredo_konami'], ['combo_street_fighter', 'hadouken']]) {
            if (!desbloqueiosSalvos[id] && desbloqueiosSalvos[legado]) desbloqueiosSalvos[id] = desbloqueiosSalvos[legado];
        }

        const ctx = construirContextoExtra({ ...entrada, sessoes: sessoesEfetivas }, mapaDias, listaDias);
        ctx.melhorSequencia = Number(entrada.melhorSequencia ?? derivados?.melhorSequencia) || 0;

        const tentarRegistrar = id => {
            if (!Object.hasOwn(desbloqueiosSalvos, id)) {
                desbloqueiosSalvos[id] = { id, em: agora };
                if (persistir && storeIa && storage) {
                    desbloquearComAviso(id, { agora, ctx }, storage);
                }
            }
        };

        // Passada 1: avalia conquistas normais (desbloqueio permanente se ok ou já salvo)
        for (const item of CATALOGO_OCULTAS) {
            if (META_IDS.has(item.id)) continue;
            let ok = false;
            try { ok = Boolean(item.avaliar(ctx)); } catch (_) { ok = false; }
            if (ok) tentarRegistrar(item.id);
        }

        // Passada 2: meta-conquistas (contradição e coleção)
        for (const [a, b] of PARES_CONTRADITORIOS) {
            if (Object.hasOwn(desbloqueiosSalvos, a) && Object.hasOwn(desbloqueiosSalvos, b)) {
                const ta = Date.parse(desbloqueiosSalvos[a].em);
                const tb = Date.parse(desbloqueiosSalvos[b].em);
                if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) <= 7 * 86400000) {
                    tentarRegistrar('sistema_contradiz');
                    break;
                }
            }
        }
        const naoColecao = id => !['colecionador_5', 'colecionador_13', 'platina_constrangimento'].includes(id);
        const qtdDescobertas = CATALOGO_OCULTAS.filter(i => naoColecao(i.id) && Object.hasOwn(desbloqueiosSalvos, i.id)).length;
        if (qtdDescobertas >= 5) tentarRegistrar('colecionador_5');
        if (qtdDescobertas >= 13) tentarRegistrar('colecionador_13');

        const baseIds = CATALOGO_OCULTAS.filter(i => i.id !== 'platina_constrangimento').map(i => i.id);
        if (baseIds.every(id => Object.hasOwn(desbloqueiosSalvos, id))) {
            tentarRegistrar('platina_constrangimento');
        }

        return CATALOGO_OCULTAS.map(item => {
            const reg = desbloqueiosSalvos[item.id] || null;
            const fala = typeof item.resolverFala === 'function' ? item.resolverFala(ctx) : item.fala;
            return {
                id: item.id,
                categoria: item.categoria,
                nome: item.nome,
                tituloRecompensa: item.tituloRecompensa,
                fala,
                oculta: true,
                desbloqueada: Boolean(reg),
                desbloqueadaEm: reg ? reg.em : null
            };
        });
    }

    // Seção 3: Falas contextuais do Sistema fora das conquistas (zoação leve + incentivo, máx. 1 por abertura, nunca com timer rodando)
    function formatarFalaContextual(idBase, hojeIso, titulo, texto) {
        return {
            id: `${idBase}:${hojeIso}`,
            tipo: 'fala',
            titulo,
            texto,
            mensagem: texto
        };
    }

    function avaliarFalaContextual(entrada = {}) {
        const timerEstado = entrada.timerEstado ?? entrada.estadoCronometro ?? escopo.CronometroEstudos?.obterEstado?.()?.estado ?? 'ocioso';
        if (timerEstado !== 'ocioso' || entrada.cronometroRodando === true) return null;

        const storage = entrada.storage || escopo.localStorage;
        const agora = entrada.agora instanceof Date ? entrada.agora : (entrada.agora ? new Date(entrada.agora) : new Date());
        const hojeIso = /^\d{4}-\d{2}-\d{2}$/.test(String(entrada.hoje || '')) ? String(entrada.hoje) : dataCivilLocal(agora);
        const sessoes = Array.isArray(entrada.sessoes) ? entrada.sessoes : (escopo.EstudoStore?.listarSessoes ? escopo.EstudoStore.listarSessoes() : []);
        const { diasMap, diasOrdenados } = derivarDiasDeSessoes(sessoes);
        const ctx = construirContextoExtra({ ...entrada, sessoes, hoje: hojeIso, storage }, diasMap, diasOrdenados);

        const segHoje = diasMap.get(hojeIso)?.segundos || 0;
        const projAtivo = ctx.projetosRegistros.find(p => !p.reg.arquivado && !p.reg.removido) || null;
        const metaHojeSeg = projAtivo ? Math.max(0, Math.round((Number(projAtivo.dados?.minutosPorDia) || 0) * 60)) : 0;
        const fimProjetoIso = projAtivo ? converterDataBrParaIso(projAtivo.dados?.dataFinalF) : '';
        const diasAteProva = fimProjetoIso ? diasEntreIsos(hojeIso, fimProjetoIso) : NaN;

        // 1. Meta diária batida
        if (metaHojeSeg > 0 && segHoje >= metaHojeSeg) {
            return formatarFalaContextual('fala:meta_batida', hojeIso, 'Meta Diária Cumprida', 'Meta cumprida. O Sistema registrou, assinou e carimbou. Amanhã a gente repete, sem alarde.');
        }
        // 2. Projeto concluído
        if (projAtivo && Number.isFinite(diasAteProva) && diasAteProva <= 0 && sessoes.some(s => s.projetoId === projAtivo.reg.id)) {
            return formatarFalaContextual('fala:projeto_concluido', hojeIso, 'Fim da Jornada', 'O projeto acabou. O Sistema não sabe se sente alívio ou luto. Provavelmente ambos.');
        }
        // 3. Faltam <= 7 dias para o fim do projeto
        if (projAtivo && Number.isFinite(diasAteProva) && diasAteProva >= 1 && diasAteProva <= 7) {
            return formatarFalaContextual('fala:faltam_7_dias', hojeIso, 'Reta Final do Edital', 'Faltam sete dias. O Sistema está tão nervoso quanto você, só que com menos suor.');
        }
        // 4. Primeiro registro do projeto (hoje)
        if (projAtivo) {
            const sessoesProj = sessoes.filter(s => s.projetoId === projAtivo.reg.id);
            const isoUlt = sessoesProj[0] ? (/^\d{4}-\d{2}-\d{2}$/.test(String(sessoesProj[0].dataEstudo || '')) ? sessoesProj[0].dataEstudo : dataCivilLocal(sessoesProj[0].inicio)) : '';
            if (sessoesProj.length === 1 && isoUlt === hojeIso) {
                return formatarFalaContextual('fala:primeiro_registro_projeto', hojeIso, 'Primeiro Registro', 'Primeiro registro. O Sistema acaba de abrir sua ficha. Todo mundo começa com uma ficha em branco e um café.');
            }
        }
        // 5. Sessão curta (< 5min) hoje
        const sessoesHoje = sessoes.filter(s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio)) === hojeIso);
        const ultimaCand = entrada.ultimaSessao || sessoesHoje.at(-1);
        if (sessoesHoje.length > 0 && Number(ultimaCand?.duracaoSegundos) > 0 && Number(ultimaCand?.duracaoSegundos) < 300) {
            return formatarFalaContextual('fala:sessao_curta_5min', hojeIso, 'Sessão Curta', 'Cinco minutos? Chamo isso de \'trailer de estudo\'. Falta o filme.');
        }
        // 6. Revisões do dia zeradas vs 10+ revisões pendentes
        let pendentesAteHoje = 0;
        let concluidasHoje = 0;
        for (const k of listarChavesStorage(storage)) {
            if (k === 'revisoesEstadoV1' || /^projetoV1:[^:]+:revisoesEstadoV1$/.test(k)) {
                const est = lerJsonSeguro(storage, k);
                for (const r of Object.values(est?.entidades || {})) {
                    if (!r || !r.dataPrevista || r.dataPrevista > hojeIso) continue;
                    if (r.estado === 'pendente') pendentesAteHoje++;
                    else if (r.estado === 'concluida' && r.dataPrevista === hojeIso) concluidasHoje++;
                }
            }
        }
        if (concluidasHoje >= 1 && pendentesAteHoje === 0) {
            return formatarFalaContextual('fala:revisoes_dia_zeradas', hojeIso, 'Revisões em Dia', 'Revisões do dia: zeradas. A memória agradece, o futuro agradece e o Sistema finge que não está emocionado.');
        }
        if (pendentesAteHoje >= 10) {
            return formatarFalaContextual('fala:revisoes_10_pendentes', hojeIso, 'Revisões Pendentes', 'Dez revisões pendentes. Estão em fila, de braços cruzados, olhando o relógio.');
        }
        // 7. Madrugada (01:00..04:59) e Domingo à noite (>= 19:00)
        if (Number.isFinite(agora.getTime())) {
            const h = agora.getHours();
            if (h >= 1 && h <= 4) {
                return formatarFalaContextual('fala:madrugada', hojeIso, 'Plantão da Madrugada', 'Sessão às 3h. O Sistema recomenda dormir; o seu cérebro agradece e o edital também.');
            }
            if (agora.getDay() === 0 && h >= 19) {
                return formatarFalaContextual('fala:domingo_noite', hojeIso, 'Domingo à Noite', 'Domingo à noite: a hora em que a segunda-feira envia a primeira notificação.');
            }
        }
        // 8. 3 dias em silêncio vs 1º dia sem estudar vs Bloco pulado vs 3 aberturas sem estudar
        if (diasOrdenados.length > 0 && segHoje === 0) {
            const ultimoDia = diasOrdenados.at(-1);
            const diasSemEstudo = diasEntreIsos(ultimoDia, hojeIso);
            if (diasSemEstudo >= 3) {
                return formatarFalaContextual('fala:tres_dias_silencio', hojeIso, 'Três Dias de Silêncio', 'Três dias de silêncio. A apostila está tão quieta que parece estar de castigo.');
            }
            if (diasSemEstudo === 2) {
                return formatarFalaContextual('fala:primeiro_dia_sem_estudar', hojeIso, 'Dia de Folga', 'Hoje o cronômetro tirou folga. Pediu para avisar que sentiu sua falta, mas que está bem.');
            }
        }
        if (Boolean(entrada.blocoPulado)) {
            return formatarFalaContextual('fala:bloco_pulado', hojeIso, 'Bloco Pulado', 'Bloco pulado. Ele não guarda rancor. As revisões dele evaporaram e o seu tempo voltou a ficar livre. Isso é o Sistema sendo generoso.');
        }
        if (Number(ctx.telemetria?.aberturasSemEstudo || 0) >= 3 && segHoje === 0) {
            return formatarFalaContextual('fala:tres_aberturas_sem_estudar', hojeIso, 'Passeio Turístico', 'Você abriu o app três vezes e estudou zero. O cronograma está começando a achar que você só vem pela vista.');
        }
        return null;
    }

    const api = {
        CLIQUES_RECLAMACAO_XP,
        CATALOGO_OCULTAS_ETAPA1,
        CATALOGO_OCULTAS_ETAPA2,
        CATALOGO_OCULTAS_ETAPA3,
        CATALOGO_OCULTAS,
        NOMES_SISTEMA,
        PARES_CONTRADITORIOS,
        ehNomeBenedito,
        obterPorId,
        desbloquearComAviso,
        avaliarOcultas,
        avaliarFalaContextual,
        construirContextoExtra
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    escopo.SistemaIaCatalogo = api;
})(typeof window !== 'undefined' ? window : globalThis);
