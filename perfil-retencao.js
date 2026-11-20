/* Projeção pura de constância, ritmo, maestria e conquistas do perfil a partir do histórico real. */
(function (escopo) {
    'use strict';

    const DIAS_SEMANA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    function dataCivilLocal(instante) {
        if (!instante) return '';
        const d = instante instanceof Date ? instante : new Date(instante);
        if (!Number.isFinite(d.getTime())) return '';
        return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function somarDiasIso(iso, delta) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return '';
        const [ano, mes, dia] = iso.split('-').map(Number);
        const d = new Date(ano, mes - 1, dia + delta, 12, 0, 0, 0);
        return dataCivilLocal(d);
    }

    function diaSemanaIso(iso) {
        const [ano, mes, dia] = iso.split('-').map(Number);
        const d = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
        return DIAS_SEMANA_CURTOS[d.getDay()] || '';
    }

    function formatarDataCurta(iso) {
        const [, mes, dia] = iso.split('-');
        return `${dia}/${mes}`;
    }

    function formatarTempoCurto(segundos) {
        const total = Math.max(0, Math.floor(Number(segundos) || 0));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return [h ? `${h.toLocaleString('pt-BR')}h` : '', m ? `${m}min` : '', !h && !m && s ? `${s}s` : ''].filter(Boolean).join(' ') || '0h';
    }

    function extrairAtividadesPraticasLocais(storage) {
        const dias = [];
        if (!storage) return dias;
        for (const k of Object.keys(storage)) {
            if (!k.startsWith('praticasProjetoV1:')) continue;
            try {
                const estado = JSON.parse(storage.getItem(k) || 'null');
                if (!estado || typeof estado !== 'object') continue;
                const exclSessoes = estado.exclusoes?.sessoes || {};
                const exclConclusoes = estado.exclusoes?.conclusoes || {};
                for (const [id, s] of Object.entries(estado.sessoes || {})) {
                    if (Object.hasOwn(exclSessoes, id) || !s) continue;
                    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio);
                    if (data) dias.push({ data, segundos: Math.max(0, Math.round(Number(s.duracaoSegundos) || 0)), tipo: 'sessao' });
                }
                for (const [id, c] of Object.entries(estado.conclusoes || {})) {
                    if (Object.hasOwn(exclConclusoes, id) || !c) continue;
                    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(c.dataRealizacao || '')) ? c.dataRealizacao : dataCivilLocal(c.registradoEm);
                    if (data) dias.push({ data, segundos: 0, tipo: 'conclusao' });
                }
            } catch (_) {}
        }
        return dias;
    }

    const CATALOGO_CONQUISTAS = Object.freeze([
        {
            id: 'primeira_chama',
            emblema: 'I',
            categoria: 'Início',
            nome: 'Primeira Chama',
            tituloRecompensa: 'Iniciado',
            criterio: 'Registre sua primeira sessão de estudo ou revisão.',
            avaliar: s => ({
                ok: s.totalSessoes >= 1,
                progresso: s.totalSessoes >= 1 ? '1/1 sessão' : '0/1 sessão'
            })
        },
        {
            id: 'constancia_3',
            emblema: '3D',
            categoria: 'Constância',
            nome: 'Hábito em Construção',
            tituloRecompensa: 'Persistente',
            criterio: 'Alcance uma sequência de 3 dias seguidos.',
            avaliar: s => ({
                ok: s.melhorSequencia >= 3,
                progresso: `${Math.min(s.melhorSequencia, 3)}/3 dias seguidos`
            })
        },
        {
            id: 'semana_inabalavel',
            emblema: '7D',
            categoria: 'Constância',
            nome: 'Semana Inabalável',
            tituloRecompensa: 'Guardião da Constância',
            criterio: 'Alcance uma sequência de 7 dias seguidos.',
            avaliar: s => ({
                ok: s.melhorSequencia >= 7,
                progresso: `${Math.min(s.melhorSequencia, 7)}/7 dias seguidos`
            })
        },
        {
            id: 'quinzena_firme',
            emblema: '14D',
            categoria: 'Constância',
            nome: 'Quinzena Inquebrável',
            tituloRecompensa: 'Sentinela Inabalável',
            criterio: 'Alcance uma sequência de 14 dias seguidos.',
            avaliar: s => ({
                ok: s.melhorSequencia >= 14,
                progresso: `${Math.min(s.melhorSequencia, 14)}/14 dias seguidos`
            })
        },
        {
            id: 'ciclo_30d',
            emblema: '30D',
            categoria: 'Constância',
            nome: 'Guardião do Ciclo',
            tituloRecompensa: 'Senhor da Disciplina',
            criterio: 'Alcance uma sequência de 30 dias seguidos.',
            avaliar: s => ({
                ok: s.melhorSequencia >= 30,
                progresso: `${Math.min(s.melhorSequencia, 30)}/30 dias seguidos`
            })
        },
        {
            id: 'maratonista_10h',
            emblema: '10H',
            categoria: 'Dedicação',
            nome: 'Dez Horas de Vigília',
            tituloRecompensa: 'Vigia do Saber',
            criterio: 'Acumule 10h totais de dedicação no Grimório.',
            avaliar: s => ({
                ok: s.segundosTotais >= 36000,
                progresso: s.segundosTotais >= 36000 ? '10h/10h concluídas' : `${formatarTempoCurto(s.segundosTotais)} / 10h`
            })
        },
        {
            id: 'veterano_50h',
            emblema: '50H',
            categoria: 'Dedicação',
            nome: 'Cinquenta Horas',
            tituloRecompensa: 'Veterano Arcano',
            criterio: 'Acumule 50h totais de dedicação no Grimório.',
            avaliar: s => ({
                ok: s.segundosTotais >= 180000,
                progresso: s.segundosTotais >= 180000 ? '50h/50h concluídas' : `${formatarTempoCurto(s.segundosTotais)} / 50h`
            })
        },
        {
            id: 'centuriao_100h',
            emblema: '100H',
            categoria: 'Dedicação',
            nome: 'Centurião das Páginas',
            tituloRecompensa: 'Centurião do Estudo',
            criterio: 'Acumule 100h totais de dedicação no Grimório.',
            avaliar: s => ({
                ok: s.segundosTotais >= 360000,
                progresso: s.segundosTotais >= 360000 ? '100h/100h concluídas' : `${formatarTempoCurto(s.segundosTotais)} / 100h`
            })
        },
        {
            id: 'guardiao_250h',
            emblema: '250H',
            categoria: 'Dedicação',
            nome: 'Cronista das Eras',
            tituloRecompensa: 'Cronista Veterano',
            criterio: 'Acumule 250h totais de dedicação no Grimório.',
            avaliar: s => ({
                ok: s.segundosTotais >= 900000,
                progresso: s.segundosTotais >= 900000 ? '250h/250h concluídas' : `${formatarTempoCurto(s.segundosTotais)} / 250h`
            })
        },
        {
            id: 'sabio_500h',
            emblema: '500H',
            categoria: 'Dedicação',
            nome: 'Vigília dos Sábios',
            tituloRecompensa: 'Oráculo das Horas',
            criterio: 'Acumule 500h totais de dedicação no Grimório.',
            avaliar: s => ({
                ok: s.segundosTotais >= 1800000,
                progresso: s.segundosTotais >= 1800000 ? '500h/500h concluídas' : `${formatarTempoCurto(s.segundosTotais)} / 500h`
            })
        },
        {
            id: 'milenar_1000h',
            emblema: '1KH',
            categoria: 'Dedicação',
            nome: 'Milênio do Conhecimento',
            tituloRecompensa: 'Soberano do Tempo',
            criterio: 'Acumule 1.000h totais de dedicação no Grimório.',
            avaliar: s => ({
                ok: s.segundosTotais >= 3600000,
                progresso: s.segundosTotais >= 3600000 ? '1.000h/1.000h concluídas' : `${formatarTempoCurto(s.segundosTotais)} / 1.000h`
            })
        },
        {
            id: 'revisor_fiel',
            emblema: '5R',
            categoria: 'Revisão',
            nome: 'Memória Afiada',
            tituloRecompensa: 'Escriba da Revisão',
            criterio: 'Complete ao menos 5 sessões de revisão.',
            avaliar: s => ({
                ok: s.revisoesCount >= 5,
                progresso: `${Math.min(s.revisoesCount, 5)}/5 revisões`
            })
        },
        {
            id: 'arquivista_25r',
            emblema: '25R',
            categoria: 'Revisão',
            nome: 'Arquivista Implacável',
            tituloRecompensa: 'Arquivista Real',
            criterio: 'Complete ao menos 25 sessões de revisão.',
            avaliar: s => ({
                ok: s.revisoesCount >= 25,
                progresso: `${Math.min(s.revisoesCount, 25)}/25 revisões`
            })
        },
        {
            id: 'guardiao_100r',
            emblema: '100R',
            categoria: 'Revisão',
            nome: 'Guardião da Memória',
            tituloRecompensa: 'Custódio da Memória',
            criterio: 'Complete ao menos 100 sessões de revisão.',
            avaliar: s => ({
                ok: s.revisoesCount >= 100,
                progresso: `${Math.min(s.revisoesCount, 100)}/100 revisões`
            })
        },
        {
            id: 'polimata',
            emblema: '3M',
            categoria: 'Domínio',
            nome: 'Versátil',
            tituloRecompensa: 'Polímata',
            criterio: 'Estude ao menos 3 matérias diferentes.',
            avaliar: s => ({
                ok: s.materiasEstudadas >= 3,
                progresso: `${Math.min(s.materiasEstudadas, 3)}/3 matérias`
            })
        },
        {
            id: 'biblioteca_ampla',
            emblema: '6M',
            categoria: 'Domínio',
            nome: 'Biblioteca Ampla',
            tituloRecompensa: 'Cartógrafo do Saber',
            criterio: 'Estude ao menos 6 matérias diferentes.',
            avaliar: s => ({
                ok: s.materiasEstudadas >= 6,
                progresso: `${Math.min(s.materiasEstudadas, 6)}/6 matérias`
            })
        },
        {
            id: 'materia_aprendiz',
            emblema: 'L2H',
            categoria: 'Domínio',
            nome: 'Primeiro Tomo Aberto',
            tituloRecompensa: 'Estudioso',
            criterio: 'Alcance a patente Aprendiz (2h de domínio) em qualquer matéria.',
            avaliar: s => ({
                ok: s.maxPontosMateria >= 120,
                progresso: s.maxPontosMateria >= 120 ? 'Patente Aprendiz alcançada' : `${formatarTempoCurto(Math.floor(s.maxPontosMateria * 60))} / 2h`
            })
        },
        {
            id: 'materia_dedicado',
            emblema: 'L10H',
            categoria: 'Domínio',
            nome: 'Caderno Encadernado',
            tituloRecompensa: 'Estudioso Focado',
            criterio: 'Alcance a patente Dedicado (10h de domínio) em qualquer matéria.',
            avaliar: s => ({
                ok: s.maxPontosMateria >= 600,
                progresso: s.maxPontosMateria >= 600 ? 'Patente Dedicado alcançada' : `${formatarTempoCurto(Math.floor(s.maxPontosMateria * 60))} / 10h`
            })
        },
        {
            id: 'materia_perito',
            emblema: 'L24H',
            categoria: 'Domínio',
            nome: 'Tomo Selado',
            tituloRecompensa: 'Especialista',
            criterio: 'Alcance a patente Perito (24h de domínio) em qualquer matéria.',
            avaliar: s => ({
                ok: s.maxPontosMateria >= 1440,
                progresso: s.maxPontosMateria >= 1440 ? 'Patente Perito alcançada' : `${formatarTempoCurto(Math.floor(s.maxPontosMateria * 60))} / 24h`
            })
        },
        {
            id: 'materia_expert',
            emblema: 'L75H',
            categoria: 'Domínio',
            nome: 'Volume Escarlate',
            tituloRecompensa: 'Autoridade',
            criterio: 'Alcance a patente Expert (75h de domínio) em qualquer matéria.',
            avaliar: s => ({
                ok: s.maxPontosMateria >= 4500,
                progresso: s.maxPontosMateria >= 4500 ? 'Patente Expert alcançada' : `${formatarTempoCurto(Math.floor(s.maxPontosMateria * 60))} / 75h`
            })
        },
        {
            id: 'materia_mestre',
            emblema: 'L100',
            categoria: 'Domínio',
            nome: 'Códice Rúnico',
            tituloRecompensa: 'Mestre de Cátedra',
            criterio: 'Alcance a patente Mestre (100h de domínio) em qualquer matéria.',
            avaliar: s => ({
                ok: s.maxPontosMateria >= 6000,
                progresso: s.maxPontosMateria >= 6000 ? 'Patente Mestre alcançada' : `${formatarTempoCurto(Math.floor(s.maxPontosMateria * 60))} / 100h`
            })
        },
        {
            id: 'materia_lenda',
            emblema: 'L250',
            categoria: 'Domínio',
            nome: 'Grimório Lendário',
            tituloRecompensa: 'Grão-Mestre do Tomo',
            criterio: 'Alcance a patente Lenda (250h de domínio) em qualquer matéria.',
            avaliar: s => ({
                ok: s.maxPontosMateria >= 15000,
                progresso: s.maxPontosMateria >= 15000 ? 'Patente Lenda alcançada' : `${formatarTempoCurto(Math.floor(s.maxPontosMateria * 60))} / 250h`
            })
        },
        {
            id: 'materia_nv100',
            emblema: 'M100',
            categoria: 'Domínio',
            nome: 'Cume da Matéria',
            tituloRecompensa: 'Arquimago da Matéria',
            criterio: 'Alcance o nível máximo 100 (600h de domínio) em uma matéria.',
            avaliar: s => ({
                ok: s.maxNivelMateria >= 100,
                progresso: s.maxNivelMateria >= 100 ? 'Nível 100 alcançado' : `Maior nível: ${s.maxNivelMateria}/100`
            })
        },
        {
            id: 'global_nv5',
            emblema: 'NV5',
            categoria: 'Nível Global',
            nome: 'Despertar do Aprendiz',
            tituloRecompensa: 'Aprendiz do Grimório',
            criterio: 'Alcance o nível global 5 e desbloqueie o título Aprendiz.',
            avaliar: s => ({
                ok: s.nivelGlobal >= 5,
                progresso: `Nível ${Math.min(s.nivelGlobal, 5)}/5`
            })
        },
        {
            id: 'global_nv10',
            emblema: 'NV10',
            categoria: 'Nível Global',
            nome: 'Voto de Dedicação',
            tituloRecompensa: 'Dedicado do Saber',
            criterio: 'Alcance o nível global 10 e desbloqueie o título Dedicado.',
            avaliar: s => ({
                ok: s.nivelGlobal >= 10,
                progresso: `Nível ${Math.min(s.nivelGlobal, 10)}/10`
            })
        },
        {
            id: 'global_nv25',
            emblema: 'NV25',
            categoria: 'Nível Global',
            nome: 'Selo do Perito',
            tituloRecompensa: 'Perito Arcano',
            criterio: 'Alcance o nível global 25 e desbloqueie o título Perito.',
            avaliar: s => ({
                ok: s.nivelGlobal >= 25,
                progresso: `Nível ${Math.min(s.nivelGlobal, 25)}/25`
            })
        },
        {
            id: 'global_nv50',
            emblema: 'NV50',
            categoria: 'Nível Global',
            nome: 'Zênite do Expert',
            tituloRecompensa: 'Expert Soberano',
            criterio: 'Alcance o nível global 50 e desbloqueie o título Expert.',
            avaliar: s => ({
                ok: s.nivelGlobal >= 50,
                progresso: `Nível ${Math.min(s.nivelGlobal, 50)}/50`
            })
        },
        {
            id: 'global_nv75',
            emblema: 'NV75',
            categoria: 'Nível Global',
            nome: 'Coroa de Mestre',
            tituloRecompensa: 'Grão-Mestre',
            criterio: 'Alcance o nível global 75 e desbloqueie o título Mestre.',
            avaliar: s => ({
                ok: s.nivelGlobal >= 75,
                progresso: `Nível ${Math.min(s.nivelGlobal, 75)}/75`
            })
        },
        {
            id: 'global_nv100',
            emblema: 'NV100',
            categoria: 'Nível Global',
            nome: 'Apoteose Lendária',
            tituloRecompensa: 'Lenda Imortal',
            criterio: 'Alcance o nível global 100 e desbloqueie o título Lenda.',
            avaliar: s => ({
                ok: s.nivelGlobal >= 100,
                progresso: `Nível ${Math.min(s.nivelGlobal, 100)}/100`
            })
        },
        {
            id: 'praticante_campo',
            emblema: '1P',
            categoria: 'Práticas',
            nome: 'Prática em Campo',
            tituloRecompensa: 'Estrategista',
            criterio: 'Conclua ao menos 1 atividade prática.',
            avaliar: s => ({
                ok: s.praticasConcluidas >= 1,
                progresso: s.praticasConcluidas >= 1 ? `${s.praticasConcluidas} concluída(s)` : '0/1 atividade'
            })
        },
        {
            id: 'veterano_praticas',
            emblema: '10P',
            categoria: 'Práticas',
            nome: 'Veterano de Campo',
            tituloRecompensa: 'Duelista Prático',
            criterio: 'Conclua ao menos 10 atividades práticas.',
            avaliar: s => ({
                ok: s.praticasConcluidas >= 10,
                progresso: `${Math.min(s.praticasConcluidas, 10)}/10 concluídas`
            })
        },
        {
            id: 'campeao_praticas',
            emblema: '30P',
            categoria: 'Práticas',
            nome: 'Campeão dos Simulados',
            tituloRecompensa: 'Campeão de Campo',
            criterio: 'Conclua ao menos 30 atividades práticas.',
            avaliar: s => ({
                ok: s.praticasConcluidas >= 30,
                progresso: `${Math.min(s.praticasConcluidas, 30)}/30 concluídas`
            })
        },
        {
            id: 'platina_marcos',
            emblema: 'PLAT',
            categoria: 'Platina',
            nome: 'Platina do Grimório',
            tituloRecompensa: 'Mestre Absoluto',
            criterio: 'Desbloqueie todos os outros 32 marcos de estudo.',
            avaliar: s => ({
                ok: s.totalMarcosBase > 0 && s.marcosBaseConcluidos >= s.totalMarcosBase,
                progresso: s.marcosBaseConcluidos >= s.totalMarcosBase
                    ? 'Todos os marcos desbloqueados'
                    : `${s.marcosBaseConcluidos}/${s.totalMarcosBase} marcos`
            })
        }
    ]);

    function calcular(entrada = {}) {
        const sessoes = Array.isArray(entrada.sessoes) ? entrada.sessoes : [];
        const materias = Array.isArray(entrada.materias) ? entrada.materias : [];
        const global = entrada.global || { nivel: 1, xp: 0, segundos: 0, segundosPraticas: 0 };
        const praticas = Array.isArray(entrada.praticas) ? entrada.praticas : [];
        const eventosPraticas = Array.isArray(entrada.eventosPraticas)
            ? entrada.eventosPraticas
            : extrairAtividadesPraticasLocais(entrada.storage || escopo.localStorage);

        const hojeIso = /^\d{4}-\d{2}-\d{2}$/.test(String(entrada.hoje || ''))
            ? String(entrada.hoje)
            : dataCivilLocal(entrada.hoje instanceof Date ? entrada.hoje : new Date());

        const diasMap = new Map();
        const registrarDia = (iso, deltaSeg = 0, tipo = 'sessao') => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
            if (!diasMap.has(iso)) diasMap.set(iso, { segundos: 0, sessoes: 0, praticas: 0 });
            const alvo = diasMap.get(iso);
            alvo.segundos += Math.max(0, Math.round(Number(deltaSeg) || 0));
            if (tipo === 'pratica') alvo.praticas++;
            else alvo.sessoes++;
        };

        let estudoSegundos = 0;
        let revisaoSegundos = 0;
        let outrosSegundos = 0;
        let revisoesCount = 0;
        const ehEstudo = s => escopo.EstudoStore?.sessaoEstudoElegivel ? escopo.EstudoStore.sessaoEstudoElegivel(s) : s.tipo === 'estudo';

        for (const s of sessoes) {
            const dur = Math.max(0, Math.round(Number(s.duracaoSegundos) || 0));
            const ehRevisao = s.tipo === 'revisao' || ['cronometro-revisao', 'conclusao-revisao'].includes(s.origem);
            if (ehRevisao) {
                revisaoSegundos += dur;
                revisoesCount++;
            } else if (ehEstudo(s)) {
                estudoSegundos += dur;
            } else {
                outrosSegundos += dur;
            }
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(s.dataEstudo || '')) ? s.dataEstudo : dataCivilLocal(s.inicio);
            registrarDia(iso, dur, 'sessao');
        }

        for (const ev of eventosPraticas) {
            registrarDia(ev.data, ev.segundos, 'pratica');
        }

        const diasOrdenados = [...diasMap.keys()].sort();
        const diasAtivosTotais = diasOrdenados.length;

        let melhorSequencia = 0;
        let corrida = 0;
        let anterior = '';
        for (const iso of diasOrdenados) {
            if (anterior && somarDiasIso(anterior, 1) === iso) corrida++;
            else corrida = 1;
            if (corrida > melhorSequencia) melhorSequencia = corrida;
            anterior = iso;
        }

        const ontemIso = somarDiasIso(hojeIso, -1);
        const estudouHoje = diasMap.has(hojeIso);
        let sequenciaAtual = 0;
        let cursor = estudouHoje ? hojeIso : (diasMap.has(ontemIso) ? ontemIso : '');
        while (cursor && diasMap.has(cursor)) {
            sequenciaAtual++;
            cursor = somarDiasIso(cursor, -1);
        }

        const ultimos7Dias = [];
        let segundos7d = 0;
        let diasAtivos7d = 0;
        for (let i = -6; i <= 0; i++) {
            const iso = somarDiasIso(hojeIso, i);
            const info = diasMap.get(iso);
            const ativo = Boolean(info);
            if (ativo) {
                segundos7d += info.segundos;
                diasAtivos7d++;
            }
            ultimos7Dias.push({
                data: iso,
                diaSemana: diaSemanaIso(iso),
                rotuloCurto: formatarDataCurta(iso),
                ativo,
                ehHoje: i === 0,
                segundos: info ? info.segundos : 0,
                sessoes: info ? info.sessoes : 0,
                praticas: info ? info.praticas : 0
            });
        }

        let segundos7dAnteriores = 0;
        for (let i = -13; i <= -7; i++) {
            const info = diasMap.get(somarDiasIso(hojeIso, i));
            if (info) segundos7dAnteriores += info.segundos;
        }

        const praticasSegundos = Math.max(0, Math.round(Number(global.segundosPraticas) || 0));
        const totalDedicadoSegundos = estudoSegundos + revisaoSegundos + praticasSegundos + outrosSegundos;
        const pct = v => totalDedicadoSegundos > 0 ? Math.round((v / totalDedicadoSegundos) * 1000) / 10 : 0;

        const materiasOrdenadas = [...materias].sort((a, b) => (Number(b.segundos) || 0) - (Number(a.segundos) || 0));
        const maestria = materiasOrdenadas.find(m => Number(m.segundos) > 0) || null;
        const maxNivelMateria = materias.reduce((max, m) => Math.max(max, Number(m.nivel) || 1), 0);
        const maxPontosMateria = materias.reduce((max, m) => Math.max(max, Number(m.pontos) || ((Number(m.segundos) || 0) / 60)), 0);
        const praticasConcluidas = praticas.reduce((acc, p) => acc + (Number(p.concluidas) || 0), 0);

        const contexto = {
            totalSessoes: sessoes.length,
            sequenciaAtual,
            melhorSequencia,
            segundosTotais: totalDedicadoSegundos,
            revisoesCount,
            materiasEstudadas: materias.filter(m => Number(m.segundos) > 0).length,
            maxNivelMateria,
            maxPontosMateria,
            nivelGlobal: Number(global.nivel) || 1,
            praticasConcluidas,
            marcosBaseConcluidos: 0,
            totalMarcosBase: 0
        };

        const marcosBase = CATALOGO_CONQUISTAS.filter(item => item.id !== 'platina_marcos');
        const resultadosBase = marcosBase.map(item => [item.id, item.avaliar(contexto)]);
        contexto.totalMarcosBase = marcosBase.length;
        contexto.marcosBaseConcluidos = resultadosBase.filter(([, res]) => Boolean(res.ok)).length;
        const mapaBase = new Map(resultadosBase);

        const conquistas = CATALOGO_CONQUISTAS.map(item => {
            const res = mapaBase.get(item.id) || item.avaliar(contexto);
            return {
                id: item.id,
                emblema: item.emblema,
                categoria: item.categoria,
                nome: item.nome,
                tituloRecompensa: item.tituloRecompensa,
                criterio: item.criterio,
                desbloqueada: Boolean(res.ok),
                progresso: res.progresso
            };
        });

        const conquistasDesbloqueadas = conquistas.filter(c => c.desbloqueada);
        const catalogoOcultas = escopo.SistemaIaCatalogo || (typeof require === 'function' ? require('./sistema-ia-catalogo') : null);
        const conquistasOcultas = catalogoOcultas?.avaliarOcultas
            ? catalogoOcultas.avaliarOcultas({ ...entrada, melhorSequencia }, diasMap, diasOrdenados)
            : [];
        const ocultasDesbloqueadas = conquistasOcultas.filter(c => c.desbloqueada);
        const todasDesbloqueadas = [...conquistasDesbloqueadas, ...ocultasDesbloqueadas];

        return {
            hojeIso,
            constancia: {
                sequenciaAtual,
                melhorSequencia,
                diasAtivosTotais,
                estudouHoje,
                ultimos7Dias,
                segundos7d,
                segundos7dAnteriores,
                diasAtivos7d
            },
            maestria: maestria ? {
                materiaGlobalId: maestria.materiaGlobalId,
                nomeCanonico: maestria.nomeCanonico,
                nivel: maestria.nivel,
                titulo: maestria.titulo,
                segundos: maestria.segundos,
                percentual: maestria.percentual
            } : null,
            dedicacao: {
                totalSegundos: totalDedicadoSegundos,
                estudoSegundos,
                revisaoSegundos,
                praticasSegundos,
                outrosSegundos,
                estudoPct: pct(estudoSegundos),
                revisaoPct: pct(revisaoSegundos),
                praticasPct: pct(praticasSegundos),
                outrosPct: pct(outrosSegundos)
            },
            conquistas,
            conquistasDesbloqueadas,
            conquistasOcultas,
            ocultasDesbloqueadas,
            todasDesbloqueadas
        };
    }

    function resolverTituloEquipado(tituloEquipadoId, conquistasDesbloqueadas, nivelGlobal) {
        if (tituloEquipadoId && Array.isArray(conquistasDesbloqueadas)) {
            const ach = conquistasDesbloqueadas.find(c => c.id === tituloEquipadoId);
            if (ach) return { id: ach.id, rotulo: ach.tituloRecompensa, personalizado: true };
        }
        const padrao = escopo.PerfilIdentidade ? escopo.PerfilIdentidade.tituloGlobalPorNivel(nivelGlobal) : 'Iniciante';
        return { id: null, rotulo: padrao, personalizado: false };
    }

    const api = {
        CATALOGO_CONQUISTAS,
        dataCivilLocal,
        somarDiasIso,
        calcular,
        resolverTituloEquipado
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    escopo.PerfilRetencao = api;
})(typeof window !== 'undefined' ? window : globalThis);
