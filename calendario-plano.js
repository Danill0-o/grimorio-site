/* Consulta do plano existente; não gera distribuição nem acrescenta persistência. */
(function () {
    'use strict';
    const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const objeto = valor => valor && typeof valor === 'object' && !Array.isArray(valor);
    const exigir = (valor, campo) => {
        if (typeof valor !== 'string' || !valor.trim()) throw new Error(`Integridade: ${campo} obrigatório no calendário`);
        return valor;
    };
    function ler(chave, padrao) {
        const raw = (window.ProjetoStorage || localStorage).getItem(chave);
        if (raw === null) return padrao;
        try { return JSON.parse(raw); }
        catch (erro) { throw new Error(`Não foi possível ler ${chave} para o calendário`, { cause: erro }); }
    }
    function carregar() {
        const projetoId = window.ProjetosStore.idAtual();
        if (!projetoId) return { projetoId: null, nome: '', inicio: null, fim: null, dias: [], extrasForaPlano: [],
            aviso: 'Selecione um projeto para consultar o calendário.', revisoesHabilitadas: true };
        window.ProjetosStore.validarAtual();
        const dados = ler('dadosExame', null), plano = ler('materiaDoDia', null);
        if (dados !== null && (!objeto(dados) || exigir(dados.projetoId, 'projetoId') !== projetoId)) {
            throw new Error('Integridade: projeto do calendário inválido');
        }
        if (plano !== null && !objeto(plano)) throw new Error('Integridade: plano do calendário inválido');
        const inicio = dados ? window.CalendarioJornada.somarDias(dados.dataInicioF, 0) : null;
        const fim = dados ? window.CalendarioJornada.somarDias(dados.dataFinalF, 0) : null;
        const resultado = { projetoId, nome: String(dados?.nomeExame || 'Seu projeto'), inicio, fim, dias: [], extrasForaPlano: [],
            folgasPraticas: [], aviso: '', revisoesHabilitadas: true };
        resultado.dados = dados;
        resultado.plano = plano;
        if (!plano || !Object.keys(plano).length) {
            resultado.aviso = 'Este projeto ainda não possui um cronograma. Conclua o planejamento para consultar o calendário.';
            return resultado;
        }
        if (!dados) throw new Error('Integridade: dados do projeto ausentes no calendário');
        const chaves = Object.keys(plano).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
        const blocosPorId = new Map();
        chaves.forEach((dia, indice) => {
            if (dia !== `dia${indice + 1}` || !Array.isArray(plano[dia])) throw new Error('Integridade: dias do cronograma inválidos');
            plano[dia].forEach(bloco => {
                if (!objeto(bloco)) throw new Error('Integridade: bloco do calendário inválido');
                exigir(bloco.projetoMateriaId, 'projetoMateriaId'); exigir(bloco.blocoId, 'blocoId');
                if (bloco.projetoId !== projetoId || blocosPorId.has(bloco.blocoId)) throw new Error('Integridade: vínculo de bloco inválido no calendário');
                window.MateriasStore.obterProjetoMateria(bloco.projetoMateriaId, projetoId);
                if ((dados.distribuicaoVersao === 3 || bloco.metaSegundos !== undefined)
                    && (!Number.isInteger(bloco.metaSegundos) || bloco.metaSegundos <= 0)) throw new Error('Integridade: meta de bloco inválida no calendário');
                blocosPorId.set(bloco.blocoId, { ...bloco, dia });
            });
        });
        const distribuicao = ler('lista_distribuicao_materias', []);
        if (!Array.isArray(distribuicao)) throw new Error('Integridade: metas distribuídas inválidas no calendário');
        distribuicao.forEach(item => {
            exigir(item?.projetoMateriaId, 'projetoMateriaId');
            window.MateriasStore.obterProjetoMateria(item.projetoMateriaId, projetoId);
        });
        const revisoesDoDia = ler('revisoesDoDia', null);
        if (!objeto(revisoesDoDia)) throw new Error('Integridade: programação das revisões ausente ou inválida no calendário');
        Object.entries(revisoesDoDia).forEach(([destino, grupos]) => {
            if (!Object.hasOwn(plano, destino) || !objeto(grupos)) throw new Error('Integridade: destino de revisão inválido no calendário');
            Object.entries(grupos).forEach(([etapa, grupo]) => {
                if (!['revisao1', 'revisao2', 'revisao3'].includes(etapa)) throw new Error('Integridade: etapa de revisão inválida no calendário');
                if (grupo === null) return;
                if (!objeto(grupo)) throw new Error('Integridade: grupo de revisão inválido no calendário');
                Object.entries(grupo).forEach(([origem, blocos]) => {
                    if (!Object.hasOwn(plano, origem) || !Array.isArray(blocos)) throw new Error('Integridade: origem de revisão inválida no calendário');
                    blocos.forEach(bloco => {
                        const fonte = blocosPorId.get(exigir(bloco?.blocoId, 'blocoId'));
                        if (!fonte || fonte.dia !== origem || fonte.projetoMateriaId !== exigir(bloco.projetoMateriaId, 'projetoMateriaId')
                            || bloco.projetoId !== projetoId) throw new Error('Integridade: vínculo de revisão inválido no calendário');
                    });
                });
            });
        });
        const valido = inicio && fim && inicio <= fim && Array.isArray(dados.listaDiaDaSemana)
            && dados.listaDiaDaSemana.length > 0 && dados.listaDiaDaSemana.every(dia => semana.includes(dia));
        const datas = valido ? window.CalendarioJornada.mapear(dados, chaves.length).porDia : {};
        const completo = chaves.every(dia => datas[dia]);
        if (!valido || !completo) resultado.aviso = 'Calendário indisponível ou incompleto. O cronograma foi preservado; confira as datas e a rotina do projeto.';
        // Os leitores vigentes recuperam journals; não persistimos totais ou um novo plano.
        const sessoes = window.EstudoStore.listarSessoes();
        const sessoesProjeto = sessoes.filter(s => s.projetoId === projetoId);
        resultado.sessoes = sessoesProjeto;
        const progressoPlano = window.EstudoStore.calcularProgressoPlano({ dados, materiaDoDia: plano,
            distribuicaoMaterias: distribuicao, sessoesProjeto });
        const diasMetas = progressoPlano.dias;
        const globaisPorParticipacao = new Map();
        for (const id of blocosPorId.values()) {
            if (!globaisPorParticipacao.has(id.projetoMateriaId)) {
                const p = window.MateriasStore.obterProjetoMateria(id.projetoMateriaId, projetoId);
                globaisPorParticipacao.set(id.projetoMateriaId, window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).materiaGlobalId);
            }
        }
        const extras = window.EstudoExtra.listar(projetoId), porExtra = new Map(), segundosPorExtra = new Map();
        extras.forEach(extra => {
            if (extra.projetoMateriaId && !globaisPorParticipacao.has(extra.projetoMateriaId)) {
                try {
                    const p = window.MateriasStore.obterProjetoMateria(extra.projetoMateriaId, projetoId);
                    globaisPorParticipacao.set(extra.projetoMateriaId, window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).materiaGlobalId);
                } catch (_) {}
            }
        });
        const dominios = window.EstudoStore.obterDominioMaterias
            ? window.EstudoStore.obterDominioMaterias([...new Set(globaisPorParticipacao.values())])
            : new Map();
        const textoNotaOrigem = bloco => {
            try { return window.NotasBlocos?.texto ? String(window.NotasBlocos.texto(bloco) || '') : String(bloco?.topico || ''); }
            catch (_) { return ''; }
        };
        resultado.dias = diasMetas.map((dia, indice) => {
            const metasPorMateria = new Map(dia.metasMaterias.map(meta => [meta.projetoMateriaId, meta]));
            const contagens = new Map(), posicoes = new Map();
            plano[dia.dia].forEach(b => contagens.set(b.projetoMateriaId, (contagens.get(b.projetoMateriaId) || 0) + 1));
            const materias = plano[dia.dia].map((bloco, indiceBloco) => {
                const posicao = posicoes.get(bloco.projetoMateriaId) || 0;
                posicoes.set(bloco.projetoMateriaId, posicao + 1);
                const metaMateria = metasPorMateria.get(bloco.projetoMateriaId);
                const total = metaMateria.metaSegundos, quantidade = contagens.get(bloco.projetoMateriaId);
                // Mesmo rateio em segundos da origem usado pelo RevisoesStore para v1/v2.
                const metaSegundos = bloco.metaSegundos ?? (Math.round(total * (posicao + 1) / quantidade) - Math.round(total * posicao / quantidade));
                if (!Number.isInteger(metaSegundos) || metaSegundos < 0) throw new Error('Integridade: meta diária inválida no calendário');
                let realizadosSegundos = metaMateria.pontosAplicadosSegundos || 0;
                if (dados.distribuicaoVersao === 3 && window.EstudoStore.projetarProgressoBlocos) {
                    const blocosMateria = plano[dia.dia].filter(b => b.projetoMateriaId === bloco.projetoMateriaId);
                    realizadosSegundos = window.EstudoStore.projetarProgressoBlocos(metaMateria, blocosMateria)[posicao]?.pontosAplicadosSegundos || 0;
                } else if (quantidade > 1) {
                    realizadosSegundos = Math.min(metaSegundos, Math.max(0, Math.round(realizadosSegundos / quantidade)));
                }
                const dominio = dominios.get(globaisPorParticipacao.get(bloco.projetoMateriaId)) || { nivel: 1, percentual: 0 };
                return { nome: typeof bloco.materia === 'string' && bloco.materia.trim() ? bloco.materia
                    : window.IdentidadeStore.nomeMateria(bloco.projetoMateriaId), projetoMateriaId: bloco.projetoMateriaId,
                    blocoId: bloco.blocoId, numero: indiceBloco + 1, metaSegundos, realizadosSegundos,
                    nivel: dominio.nivel, percentualNivel: dominio.percentual,
                    nota: textoNotaOrigem(bloco) };
            });
            return { dia: dia.dia, numero: indice + 1, dataPrevista: datas[dia.dia] || null, materias, extras: [], revisoes: [], missoes: [] };
        });
        const porDia = new Map(resultado.dias.map(dia => [dia.dia, dia]));
        // Atividades práticas são consultivas: sem estado de atraso e sem ações de execução (E6).
        resultado.folgasPraticas = [];
        if (window.PraticasStore?.projetarMissoesProjeto) {
            const praticas = window.PraticasStore.projetarMissoesProjeto(projetoId, { dados, materiaDoDia: plano });
            const folgasMapa = new Map();
            const adicionarFolga = (dataPrevista, missoesLista) => {
                if (!dataPrevista || !Array.isArray(missoesLista) || !missoesLista.length) return;
                const atual = folgasMapa.get(dataPrevista) || [];
                for (const m of missoesLista) {
                    if (!atual.some(x => x.missaoId === m.missaoId)) atual.push(m);
                }
                folgasMapa.set(dataPrevista, atual);
            };
            Object.entries(praticas.missoesPorDiaJornada).forEach(([dia, missoes]) => {
                const destino = porDia.get(dia);
                if (destino) destino.missoes = missoes;
                else missoes.forEach(m => adicionarFolga(m.dataPrevista, [m]));
            });
            praticas.folgas.forEach(folga => adicionarFolga(folga.dataPrevista, folga.missoes));
            resultado.folgasPraticas = [...folgasMapa.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dataPrevista, missoes]) => ({ dataPrevista, missoes }));
        }
        sessoes.forEach(s => {
            if (s.projetoId === projetoId && s.blocoExtraId && window.EstudoStore.sessaoEstudoElegivel(s)) {
                segundosPorExtra.set(s.blocoExtraId, (segundosPorExtra.get(s.blocoExtraId) || 0) + s.duracaoSegundos);
            }
        });
        extras.forEach(extra => {
            const destino = porDia.get(extra.diaJornada);
            if (porExtra.has(extra.blocoId)) throw new Error('Integridade: origem de estudo extra inválida no calendário');
            const segundosRegistrados = segundosPorExtra.get(extra.blocoId) || 0;
            if (!Number.isInteger(segundosRegistrados) || segundosRegistrados < 0) throw new Error('Integridade: tempo de estudo extra inválido no calendário');
            const foraPlano = !destino || Boolean(valido && completo && destino.dataPrevista !== extra.dataOrigem);
            const dominio = extra.projetoMateriaId ? (dominios.get(globaisPorParticipacao.get(extra.projetoMateriaId)) || { nivel: 1, percentual: 0 }) : { nivel: 1, percentual: 0 };
            const projetado = { nome: extra.projetoMateriaId ? window.IdentidadeStore.nomeMateria(extra.projetoMateriaId) : 'Matéria a escolher',
                projetoMateriaId: extra.projetoMateriaId, blocoId: extra.blocoId, diaJornada: extra.diaJornada,
                numero: Number(extra.diaJornada.slice(3)), dataOrigem: extra.dataOrigem, metaSegundos: null, segundosRegistrados,
                nivel: dominio.nivel, percentualNivel: dominio.percentual,
                nota: textoNotaOrigem(extra) };
            if (foraPlano) resultado.extrasForaPlano.push(projetado);
            else destino.extras.push(projetado);
            porExtra.set(extra.blocoId, { ...extra, foraPlano });
        });
        if (resultado.extrasForaPlano.length) resultado.aviso += `${resultado.aviso ? ' ' : ''}Existem estudos extras de um cronograma anterior. Seus registros foram preservados.`;
        // Calendário inválido não desativa entidades/snapshots que continuam recuperáveis.
        const revisoes = valido && completo ? window.RevisoesStore.sincronizar({ dados, materiaDoDia: plano, revisoesDoDia,
            dias: diasMetas, sessoes }) : window.RevisoesStore.listar();
        resultado.revisoesHabilitadas = window.RevisoesStore.habilitadas();
        revisoes.forEach(r => {
            const destino = porDia.get(r.diaJornada) || (r.origemHistorica ? resultado.dias[0] : null), origem = porDia.get(r.diaOrigem);
            const blocoOrigem = r.blocoExtraId ? porExtra.get(r.blocoExtraId) : r.origemHistorica
                ? dados.replanejamento?.origens[r.blocoId] : blocosPorId.get(r.blocoId);
            exigir(r.id, 'revisaoId'); exigir(r.projetoMateriaId, 'projetoMateriaId');
            if (r.projetoId !== projetoId || !destino || (!r.blocoExtraId && !r.origemHistorica && !origem) || !blocoOrigem || blocoOrigem.projetoMateriaId !== r.projetoMateriaId
                || !['R1', 'R2', 'R3'].includes(r.etapa) || !['pendente', 'concluida', 'dispensada'].includes(r.estado)
                || !Number.isInteger(r.sugeridaSegundos) || r.sugeridaSegundos < 0) throw new Error('Integridade: revisão inválida no calendário');
            window.MateriasStore.obterProjetoMateria(r.projetoMateriaId, projetoId);
            const dominio = dominios.get(globaisPorParticipacao.get(r.projetoMateriaId)) || { nivel: 1, percentual: 0 };
            destino.revisoes.push({ id: r.id, nome: typeof r.materia === 'string' && r.materia.trim() ? r.materia
                : window.IdentidadeStore.nomeMateria(r.projetoMateriaId), projetoMateriaId: r.projetoMateriaId,
                blocoId: r.blocoId, blocoExtraId: r.blocoExtraId || null, etapa: r.etapa,
                sugestaoSegundos: r.sugeridaSegundos, estado: r.estado,
                nivel: dominio.nivel, percentualNivel: dominio.percentual,
                nota: textoNotaOrigem(r),
                dataPrevista: r.dataPrevista,
                origem: { dia: r.diaOrigem, numero: r.blocoExtraId ? Number(blocoOrigem.diaJornada.slice(3)) : r.origemHistorica ? Number(r.diaOrigem.slice(3)) : origem.numero,
                    dataPrevista: r.blocoExtraId || r.origemHistorica ? blocoOrigem.dataOrigem : origem.dataPrevista,
                    extra: Boolean(r.blocoExtraId), foraPlano: Boolean(r.origemHistorica || r.blocoExtraId && blocoOrigem.foraPlano) } });
        });
        return resultado;
    }
    window.CalendarioPlano = Object.freeze({ carregar });
})();
