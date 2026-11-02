(function () {
    const CHAVE_SESSOES = 'sessoesEstudo';
    const CHAVE_DOMINIO = 'reiniciosDominio';
    const JOURNAL_CRONOMETRO = 'cronometroRegistroV1';
    const RAZAO_NIVEIS = 1.025;
    // Limiares em segundos inteiros: nunca antecipa um nível por arredondamento visual.
    function limiaresProgressao(horasMaximas) {
        return Array.from({ length: 100 }, (_, i) => i === 99 ? horasMaximas * 3600
            : Math.ceil(horasMaximas * 3600 * (RAZAO_NIVEIS ** i - 1) / (RAZAO_NIVEIS ** 99 - 1)));
    }
    const LIMIARES_MATERIA = limiaresProgressao(600);
    const LIMIARES_GLOBAL = limiaresProgressao(1800);
    function projetarProgressao(segundos, limiares) {
        let indice = 0;
        while (indice < 99 && segundos >= limiares[indice + 1]) indice++;
        const maximo = indice === 99;
        const avancado = maximo ? 0 : segundos - limiares[indice];
        const necessario = maximo ? 0 : limiares[indice + 1] - limiares[indice];
        return { nivel: indice + 1, pontosNoNivel: avancado / 60,
            percentual: maximo ? 100 : avancado / necessario * 100,
            pontosParaProximoNivel: maximo ? 0 : (necessario - avancado) / 60 };
    }
    function sessaoXpElegivel(sessao) {
        return sessaoEstudoElegivel(sessao) || sessao.tipo === 'revisao'
            || ['cronometro-revisao', 'conclusao-revisao'].includes(sessao.origem);
    }
    function obterProgressaoGlobal() {
        const segundosEstudo = listarSessoes().filter(sessaoXpElegivel)
            .reduce((total, sessao) => total + Number(sessao.duracaoSegundos), 0);
        const temPraticas = Object.keys(localStorage).some(k => k.startsWith('praticasProjetoV1:'));
        if (temPraticas && !window.PraticasStore?.listarProgressao) throw new Error('Progressão das práticas indisponível');
        const praticas = temPraticas ? window.PraticasStore.listarProgressao() : [];
        const xpPraticasUnidades = praticas.reduce((total, p) => total + p.xpUnidades, 0);
        const segundosPraticas = praticas.reduce((total, p) => total + p.tempoRegistradoSegundos, 0);
        const unidadesXp = segundosEstudo + xpPraticasUnidades, segundos = segundosEstudo + segundosPraticas;
        if (!Number.isSafeInteger(unidadesXp) || !Number.isSafeInteger(segundos)) throw new Error('Total de progressão excede o limite seguro');
        return { segundos, segundosEstudo, segundosPraticas, xp: unidadesXp / 60,
            xpEstudo: segundosEstudo / 60, xpPraticas: xpPraticasUnidades / 60,
            ...projetarProgressao(unidadesXp, LIMIARES_GLOBAL) };
    }

    function recuperarCronometro() {
        const raw = localStorage.getItem(JOURNAL_CRONOMETRO);
        if (!raw) return;
        const { sessao, chave } = JSON.parse(raw);
        if (!sessao?.id || chave !== `cronometroV1:${sessao.projetoId}`) throw new Error('Registro de cronômetro inválido');
        if (window.HistoricoRepository) {
            window.HistoricoRepository.adicionar([sessao]);
            localStorage.removeItem(chave);
            localStorage.removeItem(JOURNAL_CRONOMETRO);
            return;
        }
        const sessoes = JSON.parse(localStorage.getItem(CHAVE_SESSOES) || '[]');
        if (!Array.isArray(sessoes)) throw new Error('Histórico inválido');
        if (!sessoes.some(s => s.id === sessao.id)) {
            sessoes.push(sessao);
            localStorage.setItem(CHAVE_SESSOES, JSON.stringify(sessoes));
        }
        localStorage.removeItem(chave);
        localStorage.removeItem(JOURNAL_CRONOMETRO);
    }

    function registrarCronometro(dados) {
        recuperarCronometro();
        const sessao = normalizarSessao(dados);
        if (!sessao) throw new Error('Sessão inválida');
        const existente = listarSessoes().find(s => s.id === sessao.id);
        if (existente) return existente;
        if (window.HistoricoRepository) {
            window.HistoricoRepository.adicionar([sessao]);
            localStorage.removeItem(`cronometroV1:${sessao.projetoId}`);
            notificarRegistro([sessao]);
            return sessao;
        }
        localStorage.setItem(JOURNAL_CRONOMETRO, JSON.stringify({ sessao, chave: `cronometroV1:${sessao.projetoId}` }));
        recuperarCronometro();
        notificarRegistro([sessao]);
        return sessao;
    }

    // Um reinício arquiva a contribuição ao domínio, sem alterar as sessões do plano.
    function identidadeSessao(sessao) {
        if (!sessao.id) throw new Error('Integridade: sessão sem ID');
        return sessao.id;
    }

    function listarSessoesDominio() {
        const reinicios = window.HistoricoRepository ? window.HistoricoRepository.dominio() : lerJson(CHAVE_DOMINIO, {});
        // O reinício arquiva contribuições concretas, mesmo após corrigir seu vínculo.
        const arquivadas = new Set(Object.values(reinicios).filter(Array.isArray).flat());
        return listarSessoes().filter(sessao => !arquivadas.has(identidadeSessao(sessao)));
    }

    function projetarDominio(materiaGlobalId, segundos = 0, quantidadeSessoes = 0, quantidadeSessoesDominio = 0) {
        const global = window.MateriasStore.resolverMateriaGlobal(materiaGlobalId);

        return {
            materiaGlobalId: global.materiaGlobalId,
            nomeCanonico: global.nomeCanonico,
            segundos, pontos: segundos / 60,
            ...projetarProgressao(segundos, LIMIARES_MATERIA),
            titulo: obterTituloDominio(segundos / 60),
            quantidadeSessoes, quantidadeSessoesDominio
        };
    }

    // Universo histórico, inclusive contribuições resetadas e projetos excluídos.
    // Não inclui o catálogo sem sessões nem depende do projeto selecionado/DOM.
    function listarDominioGlobal() {
        const totais = new Map();
        listarSessoesDominio().forEach(sessao => {
            const id = chaveGlobal(sessao);
            if (!totais.has(id)) totais.set(id, { segundos: 0, quantidadeSessoes: 0, quantidadeSessoesDominio: 0 });
            const total = totais.get(id);
            const segundos = Number(sessao.duracaoSegundos || 0);
            total.segundos += segundos;

            total.quantidadeSessoesDominio++;
        });
        listarSessoes().forEach(sessao => {
            const id = chaveGlobal(sessao);
            if (!totais.has(id)) totais.set(id, { segundos: 0, quantidadeSessoes: 0, quantidadeSessoesDominio: 0 });
            totais.get(id).quantidadeSessoes++;
        });
        return [...totais].map(([id, t]) => projetarDominio(id, t.segundos, t.quantidadeSessoes, t.quantidadeSessoesDominio));
    }

    // Global válida sem histórico tem projeção zero; ID ausente/inválido é erro.
    function obterDominioMateria(materiaGlobalId) {
        const global = window.MateriasStore.resolverMateriaGlobal(materiaGlobalId);
        return listarDominioGlobal().find(m => m.materiaGlobalId === global.materiaGlobalId)
            || projetarDominio(global.materiaGlobalId);
    }

    // Consulta contextual em lote: inclui globais sem histórico, sem um scan por card.
    function obterDominioMaterias(materiaGlobalIds) {
        const ids = new Set(materiaGlobalIds.map(id => window.MateriasStore.resolverMateriaGlobal(id).materiaGlobalId));
        const historico = new Map(listarDominioGlobal().map(m => [m.materiaGlobalId, m]));
        return new Map([...ids].map(id => [id, historico.get(id) || projetarDominio(id)]));
    }

    // Detalha o crédito diário já calculado; não muda sua origem nem o destino do excesso.
    function projetarProgressoBlocos(meta, blocos) {
        let credito = meta.pontosAplicadosSegundos;
        return blocos.map(bloco => {
            if (!bloco.blocoId || chaveMateria(bloco) !== meta.projetoMateriaId
                || !Number.isInteger(bloco.metaSegundos) || bloco.metaSegundos <= 0) {
                throw new Error('Integridade: bloco inválido para projeção de progresso');
            }
            const pontosAplicadosSegundos = Math.min(bloco.metaSegundos, credito);
            credito -= pontosAplicadosSegundos;
            const faltamSegundos = bloco.metaSegundos - pontosAplicadosSegundos;
            return { blocoId: bloco.blocoId, metaSegundos: bloco.metaSegundos, pontosAplicadosSegundos,
                faltamSegundos, percentual: limitarPercentual(pontosAplicadosSegundos / bloco.metaSegundos * 100),
                completo: faltamSegundos === 0 };
        });
    }

    function obterTituloDominio(pontos) {
        if (pontos >= 15000) return 'Lenda';
        if (pontos >= 6000) return 'Mestre';
        if (pontos >= 4500) return 'Expert';
        if (pontos >= 1440) return 'Perito';
        if (pontos >= 600) return 'Dedicado';
        if (pontos >= 120) return 'Aprendiz';
        return 'Iniciante';
    }

    function reiniciarDominio(materia = null) {
        const reinicios = lerJson(CHAVE_DOMINIO, {});
        const grupos = new Map();
        listarSessoes().forEach((sessao) => {
            const chave = chaveGlobal(sessao);
            if (materia !== null && chave !== materia) return;
            if (!grupos.has(chave)) grupos.set(chave, new Set(Array.isArray(reinicios[chave]) ? reinicios[chave] : []));
            grupos.get(chave).add(identidadeSessao(sessao));
        });
        grupos.forEach((ids, chave) => { reinicios[chave] = Array.from(ids); });
        if (window.HistoricoRepository) window.HistoricoRepository.reiniciarDominio(Object.fromEntries([...grupos].map(([chave, ids]) => [chave, [...ids]])));
        else (window.ProjetoStorage || localStorage).setItem(CHAVE_DOMINIO, JSON.stringify(reinicios));
        window.dispatchEvent(new CustomEvent('dominio:reiniciado', { detail: { materia } }));
    }

    function listarSessoes() {
        recuperarCronometro();
        window.EstudoExtra?.recuperarRegistros();
        const sessoes = window.HistoricoRepository ? window.HistoricoRepository.listar() : lerJson(CHAVE_SESSOES, []);
        return Array.isArray(sessoes)
            ? sessoes.map((sessao) => { validarIdentidade(sessao); return Object.assign({}, sessao, {
                duracaoSegundos: Number(sessao.duracaoSegundos)
            }); })
            : [];
    }

    function registrarSessao(dados, notificar = true) {
        const sessao = normalizarSessao(dados);
        if (!sessao) return null;
        if (window.HistoricoRepository) window.HistoricoRepository.adicionar([sessao]);
        else {
            const sessoes = listarSessoes();
            sessoes.push(sessao);
            (window.ProjetoStorage || localStorage).setItem(CHAVE_SESSOES, JSON.stringify(sessoes));
        }
        if (notificar) notificarRegistro([sessao]);
        return sessao;
    }

    function registrarSessoes(lista) {
        const novas = (Array.isArray(lista) ? lista : []).map(normalizarSessao).filter(Boolean);
        if (!novas.length) return [];
        if (window.HistoricoRepository) window.HistoricoRepository.adicionar(novas);
        else {
            const sessoes = listarSessoes();
            sessoes.push(...novas);
            (window.ProjetoStorage || localStorage).setItem(CHAVE_SESSOES, JSON.stringify(sessoes));
        }
        notificarRegistro(novas);
        return novas;
    }

    function excluirSessao(id) {
        const sessoes = listarSessoes();
        const indice = sessoes.findIndex((sessao) => sessao.id === id);
        if (indice < 0) return null;
        const [excluida] = sessoes.splice(indice, 1);
        if (window.HistoricoRepository) window.HistoricoRepository.excluir(id);
        else (window.ProjetoStorage || localStorage).setItem(CHAVE_SESSOES, JSON.stringify(sessoes));
        window.dispatchEvent(new CustomEvent('estudo:excluido', { detail: { sessao: excluida } }));
        return excluida;
    }

    function calcularProgressoPlano({ dados, materiaDoDia, sessoesProjeto, distribuicaoMaterias, hoje = new Date() }) {
        const dias = Object.keys(materiaDoDia || {}).sort((a, b) => numeroDoDia(a) - numeroDoDia(b));
        const diasDoPlano = new Set(dias);
        // O volume é integral; cada registro quita somente a meta de seu próprio dia.
        const segundosPorDia = new Map();
        const sequencial = dados?.replanejamento?.versao === 1;
        const segundosNormais = new Map();
        let calendarioPorData;
        let calendarioConsultado = false;
        function diaDaSessao(sessao) {
            if (sessao.diaJornada !== undefined && sessao.diaJornada !== null) {
                return diasDoPlano.has(sessao.diaJornada) ? sessao.diaJornada : null;
            }
            if (sessao.inicio === undefined || sessao.inicio === null || sessao.inicio === '') return null;
            const inicioSessao = new Date(sessao.inicio);
            if (!Number.isFinite(inicioSessao.getTime())) return null;
            if (!calendarioConsultado) {
                calendarioConsultado = true;
                const calendario = window.CalendarioJornada;
                const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
                if (typeof calendario?.mapear === 'function' && typeof calendario?.somarDias === 'function'
                    && Array.isArray(dados?.listaDiaDaSemana) && dados.listaDiaDaSemana.length
                    && dados.listaDiaDaSemana.every(dia => semana.includes(dia))) {
                    const inicio = calendario.somarDias(dados.dataInicioF, 0);
                    const fim = calendario.somarDias(dados.dataFinalF, 0);
                    if (inicio && fim && inicio <= fim) calendarioPorData = calendario.mapear(dados, dias.length).porData;
                }
            }
            const dataLocal = `${String(inicioSessao.getFullYear()).padStart(4, '0')}-${String(inicioSessao.getMonth() + 1).padStart(2, '0')}-${String(inicioSessao.getDate()).padStart(2, '0')}`;
            const dia = calendarioPorData?.[dataLocal];
            return diasDoPlano.has(dia) ? dia : null;
        }
        const pontosPorMateria = (Array.isArray(sessoesProjeto) ? sessoesProjeto : []).reduce((acc, sessao) => {
            if (sequencial && sessao.projetoId !== dados.projetoId) return acc;
            const chave = chaveMateria(sessao);
            if (!sessaoEstudoElegivel(sessao)) return acc;
            if (!chave) return acc;
            if (!acc[chave]) acc[chave] = { nome: sessao.materia, segundos: 0 };
            const segundos = Math.max(0, Math.round(Number(sessao.duracaoSegundos) || 0));
            acc[chave].segundos += segundos;
            if (!sessao.blocoExtraId && (!dados?.projetoId || sessao.projetoId === dados.projetoId)) {
                segundosNormais.set(chave, (segundosNormais.get(chave) || 0) + segundos);
            }
            const dia = sessao.blocoExtraId ? null : diaDaSessao(sessao);
            if (dia) {
                if (!segundosPorDia.has(dia)) segundosPorDia.set(dia, new Map());
                const materias = segundosPorDia.get(dia);
                materias.set(chave, (materias.get(chave) || 0) + segundos);
            }
            return acc;
        }, {});

        const aparicoes = {};
        dias.forEach((dia) => {
            (materiaDoDia[dia] || []).forEach((bloco) => {
                const chave = chaveMateria(bloco);
                if (!chave) return;
                if (!aparicoes[chave]) aparicoes[chave] = { nome: bloco.materia, projetoMateriaId: bloco.projetoMateriaId, quantidade: 0, segundos: 0, explicita: true };
                aparicoes[chave].quantidade += 1;
                aparicoes[chave].explicita &&= Number.isInteger(bloco.metaSegundos) && bloco.metaSegundos > 0;
                aparicoes[chave].segundos += Number(bloco.metaSegundos) || 0;
            });
        });

        const metasDistribuidas = (Array.isArray(distribuicaoMaterias) ? distribuicaoMaterias : []).reduce((acc, item) => {
            const chave = chaveMateria(item);
            const minutos = Number(item.Materia_distribuida);
            if (chave && Number.isFinite(minutos) && minutos > 0) acc[chave] = minutos;
            return acc;
        }, {});
        const estudoPorBloco = Math.max(1, Number(dados?.estudoPorBloco) || 1);
        const metasMateria = {};
        Object.entries(aparicoes).forEach(([chave, aparicao]) => {
            const metaTotal = aparicao.explicita ? aparicao.segundos / 60 : metasDistribuidas[chave] || aparicao.quantidade * estudoPorBloco;
            const metaTotalSegundos = Math.round(metaTotal * 60);
            const segundos = pontosPorMateria[chave]?.segundos || 0;
            metasMateria[chave] = {
                nome: aparicao.nome,
                projetoMateriaId: aparicao.projetoMateriaId,
                metaTotal,
                metaTotalSegundos,
                pontos: segundos / 60,
                segundos,
                pontosCreditados: Math.min(segundos, metaTotalSegundos) / 60,
                segundosCreditados: Math.min(segundos, metaTotalSegundos),
                metaPorAparicao: metaTotal / aparicao.quantidade,
                percentual: limitarPercentual((segundos / metaTotalSegundos) * 100)
            };
        });

        let missoesPorDia = {};
        if (dados?.projetoId && window.PraticasStore?.projetarMissoesProjeto) {
            missoesPorDia = window.PraticasStore.projetarMissoesProjeto(dados.projetoId, { dados, materiaDoDia }).missoesPorDiaJornada || {};
        }
        const aparicoesProcessadas = {};
        const segundosProcessados = {};
        const diasCalculados = dias.map((dia, indice) => {
            const quantidadeNoDia = (materiaDoDia[dia] || []).reduce((acc, bloco) => {
                const chave = chaveMateria(bloco);
                if (chave) acc[chave] = (acc[chave] || 0) + 1;
                return acc;
            }, {});
            const metas = Object.entries(quantidadeNoDia).map(([chave, quantidade]) => {
                const materia = metasMateria[chave];
                const totalAparicoes = aparicoes[chave]?.quantidade || quantidade;
                const processadasAntes = aparicoesProcessadas[chave] || 0;
                const processadasAte = processadasAntes + quantidade;
                const metaTotalSegundos = materia?.metaTotalSegundos || Math.round(totalAparicoes * estudoPorBloco * 60);
                const explicita = aparicoes[chave]?.explicita;
                const necessarioAntesSegundos = explicita ? segundosProcessados[chave] || 0 : Math.round(metaTotalSegundos * processadasAntes / totalAparicoes);
                const necessarioAteSegundos = explicita ? necessarioAntesSegundos + (materiaDoDia[dia] || []).filter(b => chaveMateria(b) === chave).reduce((s,b) => s+b.metaSegundos,0) : Math.round(metaTotalSegundos * processadasAte / totalAparicoes);
                segundosProcessados[chave] = necessarioAteSegundos;
                const metaSegundos = necessarioAteSegundos - necessarioAntesSegundos;
                const pontosAplicadosSegundos = Math.min(metaSegundos, sequencial
                    ? Math.max(0, (segundosNormais.get(chave) || 0) - necessarioAntesSegundos)
                    : segundosPorDia.get(dia)?.get(chave) || 0);
                const faltamSegundos = Math.max(0, metaSegundos - pontosAplicadosSegundos);
                aparicoesProcessadas[chave] = processadasAte;
                return {
                    chave,
                    materia: materia?.nome || chave,
                    projetoMateriaId: materia?.projetoMateriaId,
                    metaSegundos,
                    pontosAplicadosSegundos,
                    faltamSegundos,
                    meta: metaSegundos / 60,
                    pontosAplicados: pontosAplicadosSegundos / 60,
                    faltam: faltamSegundos / 60,
                    percentual: limitarPercentual((pontosAplicadosSegundos / metaSegundos) * 100),
                    completo: faltamSegundos === 0
                };
            });
            const metaTotalDia = metas.reduce((total, meta) => total + meta.metaSegundos, 0);
            const pontosDia = metas.reduce((total, meta) => total + meta.pontosAplicadosSegundos, 0);
            const missoesDia = missoesPorDia[dia] || [];
            const semBlocoTeoricoComPratica = metas.length === 0 && missoesDia.length > 0;
            const missoesConcluidas = semBlocoTeoricoComPratica ? missoesDia.filter(m => m.concluida).length : 0;
            return {
                dia,
                indice,
                metasMaterias: metas,
                concluido: semBlocoTeoricoComPratica
                    ? missoesConcluidas === missoesDia.length
                    : metas.length > 0 && metas.every((meta) => meta.completo),
                percentual: semBlocoTeoricoComPratica
                    ? limitarPercentual((missoesConcluidas / missoesDia.length) * 100)
                    : metaTotalDia ? limitarPercentual((pontosDia / metaTotalDia) * 100) : 0
            };
        });

        const diasComAcesso = window.CalendarioJornada?.projetarAcesso
            ? window.CalendarioJornada.projetarAcesso(dados, diasCalculados, hoje)
            : diasCalculados.map(dia => ({ ...dia, dataPrevista: null, situacaoTemporal: 'indisponivel',
                desbloqueado: false, podeIniciar: false, atual: false }));

        const cargaPlanejadaSegundos = Object.values(metasMateria).reduce((total, materia) => total + materia.metaTotalSegundos, 0);
        const pontosCreditadosSegundos = Object.values(metasMateria).reduce((total, materia) => total + materia.segundosCreditados, 0);
        const cargaPlanejada = cargaPlanejadaSegundos / 60;
        const pontosCreditados = pontosCreditadosSegundos / 60;
        return {
            dias: diasComAcesso,
            materias: metasMateria,
            cargaPlanejada,
            pontosCreditados,
            percentualJornada: diasCalculados.length ? diasCalculados.reduce((soma, dia) => soma + dia.percentual, 0) / diasCalculados.length : 0,
            percentualGeral: cargaPlanejadaSegundos ? limitarPercentual((pontosCreditadosSegundos / cargaPlanejadaSegundos) * 100) : 0
        };
    }

    function sessaoEstudoElegivel(sessao) {
        if (!sessao || !Number.isFinite(Number(sessao.duracaoSegundos))) return false;
        if (['cronometro-revisao', 'conclusao-revisao'].includes(sessao.origem)) return false;
        if (sessao.tipo) return sessao.tipo === 'estudo';
        // Compatibilidade com sessões anteriores à introdução do campo tipo.
        return !sessao.origem || ['cronometro', 'manual', 'conclusao-materia', 'conclusao-dia'].includes(sessao.origem);
    }

    function dataCivilLocal(data) {
        return `${String(data.getFullYear()).padStart(4, '0')}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    }

    function contextoDataEstudo(dataEstudo, registradoEm = new Date()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataEstudo))) throw new Error('Data do estudo inválida');
        const [ano, mes, dia] = dataEstudo.split('-').map(Number);
        // Meio-dia é somente uma representação da data civil, nunca um horário declarado.
        const inicio = new Date(0);
        inicio.setFullYear(ano, mes - 1, dia);
        inicio.setHours(12, 0, 0, 0);
        const registro = new Date(registradoEm);
        if (!Number.isFinite(registro.getTime()) || dataCivilLocal(inicio) !== dataEstudo
            || dataEstudo > dataCivilLocal(registro)) throw new Error('Informe uma data de estudo válida, até hoje');
        return { inicio: inicio.toISOString(), dataEstudo, precisaoInicio: 'dia', registradoEm: registro.toISOString() };
    }

    function metadadosDataEstudo(dados, inicio) {
        const metadados = {};
        if (dados.dataEstudo !== undefined || dados.precisaoInicio !== undefined) {
            if (dados.precisaoInicio !== 'dia' || !dados.registradoEm) throw new Error('Metadados da data do estudo inválidos');
            const contexto = contextoDataEstudo(dados.dataEstudo, dados.registradoEm);
            if (dataCivilLocal(inicio) !== contexto.dataEstudo) throw new Error('Início e data do estudo divergentes');
            Object.assign(metadados, { dataEstudo: contexto.dataEstudo, precisaoInicio: 'dia', registradoEm: contexto.registradoEm });
        } else if (dados.registradoEm !== undefined) {
            const registro = new Date(dados.registradoEm);
            if (!Number.isFinite(registro.getTime())) throw new Error('Instante do registro inválido');
            metadados.registradoEm = registro.toISOString();
        }
        return metadados;
    }

    function normalizarSessao(dados) {
        if (!dados || !String(dados.materia || '').trim()) return null;
        validarIdentidade(dados);
        const duracaoSegundos = Math.max(1, Math.round(Number(dados.duracaoSegundos) || 0));
        const inicio = dados.inicio instanceof Date ? dados.inicio : new Date(dados.inicio || Date.now());
        if (Number.isNaN(inicio.getTime())) return null;
        return {
            ...window.IdentidadeStore.vinculosSessao(dados),
            ...metadadosDataEstudo(dados, inicio),
            id: dados.id || criarId(),
            projetoId: dados.projetoId,
            materia: String(dados.materia).trim(),
            inicio: inicio.toISOString(),
            duracaoSegundos,
            tipo: dados.tipo || 'estudo',
            origem: dados.origem || 'cronometro',
            diaJornada: dados.diaJornada || null,
            referenciaDia: dados.referenciaDia || null,
            revisaoId: dados.revisaoId || null,
            ...(dados.anotacao ? { anotacao: String(dados.anotacao).slice(0, 140) } : {})
        };
    }

    function notificarRegistro(sessoes) {
        window.dispatchEvent(new CustomEvent('estudo:registrado', {
            detail: { sessoes, pontosConhecimento: somarPontos(sessoes) }
        }));
    }

    function somarPontos(sessoes) {
        return (Array.isArray(sessoes) ? sessoes : []).reduce(
            (total, sessao) => total + Number(sessao.duracaoSegundos || 0) / 60,
            0
        );
    }

    function obterProjetoAtualId() {
        const dados = lerJson('dadosExame', {});
        if (dados.projetoId) return dados.projetoId;
        throw new Error('Integridade: projetoId obrigatório');
    }

    function sessaoValida(sessao) {
        return sessao
            && sessao.materia
            && sessao.inicio
            && !Number.isNaN(new Date(sessao.inicio).getTime())
            && Number.isFinite(Number(sessao.duracaoSegundos));
    }

    function criarId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function numeroDoDia(chave) {
        return Number(String(chave).replace(/\D/g, '')) || 0;
    }

    function chaveMateria(item) {
        if (typeof item?.projetoMateriaId !== 'string' || !item.projetoMateriaId) throw new Error('Integridade: projetoMateriaId obrigatório');
        return item.projetoMateriaId;
    }
    function validarIdentidade(item) {
        if (!item?.projetoId || Object.hasOwn(item, 'materiaGlobalId') || Object.hasOwn(item, 'materiaId')) throw new Error('Integridade: identidade de sessão inválida');
        window.MateriasStore.obterProjetoMateria(chaveMateria(item), item.projetoId);
    }
    function chaveGlobal(item) {
        const p = window.MateriasStore.obterProjetoMateria(chaveMateria(item));
        return window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).materiaGlobalId;
    }

    function limitarPercentual(valor) {
        return Math.min(100, Math.max(0, Number.isFinite(valor) ? valor : 0));
    }

    function lerJson(chave, valorPadrao) {
        try {
            const valor = JSON.parse((window.ProjetoStorage || localStorage).getItem(chave));
            return valor === null ? valorPadrao : valor;
        } catch (erro) {
            return valorPadrao;
        }
    }

    window.EstudoStore = {
        listarSessoes,
        listarSessoesDominio,
        listarDominioGlobal,
        obterProgressaoGlobal,
        obterDominioMateria,
        obterDominioMaterias,
        projetarProgressoBlocos,
        reiniciarDominio,
        registrarSessao,
        registrarCronometro,
        registrarSessoes,
        excluirSessao,
        calcularProgressoPlano,
        contextoDataEstudo,
        sessaoEstudoElegivel,
        obterProjetoAtualId,
        chaveGlobal,
        prepararSessao: normalizarSessao
    };
})();
