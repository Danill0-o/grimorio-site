/* D040/E2–E7: snapshots por projeto e projeções recalculáveis; XP não é armazenado como contador. */
(function () {
    'use strict';
    const dominio = window.AtividadesPraticas, schema = window.PraticasSchema;
    const storage = window.localStorage;
    const prefixo = 'praticasProjetoV1:';
    const clonar = valor => JSON.parse(JSON.stringify(valor));
    // Capture a intenção antes de aguardar locks, preservando inclusive valores inválidos
    // (undefined/NaN) para que o validador os rejeite, em vez de apagá-los via JSON.
    const copiarEntrada = valor => Array.isArray(valor) ? valor.map(copiarEntrada)
        : valor !== null && typeof valor === 'object'
            ? Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, copiarEntrada(v)])) : valor;
    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const falhar = mensagem => { throw new Error(`Práticas: ${mensagem}`); };
    const id = valor => {
        if (typeof valor !== 'string' || !/^[a-z0-9_-]+$/i.test(valor)) falhar('ID inválido');
        return valor;
    };
    const chave = projetoId => prefixo + id(projetoId);
    function disponivel() {
        window.BackupLocal?.garantirDisponivel();
        if (!dominio || !schema) falhar('núcleo ou validador indisponível');
        if (storage.getItem('projetosTransacaoV1') !== null
            || Object.keys(storage).some(k => k.startsWith('projetosTransacaoV2:'))) {
            falhar('gestão de projetos pendente; recarregue para recuperar antes de alterar práticas');
        }
    }
    function projeto(projetoId, ativo = false) {
        id(projetoId);
        const raw = storage.getItem(`projetoV1:${projetoId}:registro`);
        if (raw === null) falhar('projeto inexistente');
        const registro = JSON.parse(raw);
        if (!registro || registro.id !== projetoId) falhar('registro de projeto inválido');
        if (ativo && (registro.removido || registro.arquivado)) falhar('selecione um projeto ativo');
        return registro;
    }
    function ler(projetoId) {
        window.BackupLocal?.garantirDisponivel();
        if (!schema) falhar('validador indisponível');
        projeto(projetoId);
        const raw = storage.getItem(chave(projetoId));
        return raw === null ? schema.vazio(projetoId) : schema.validar(JSON.parse(raw), projetoId);
    }
    async function escrever(projetoId, acao) {
        id(projetoId);
        if (!window.navigator?.locks) falhar('use Web Locks em HTTPS ou localhost');
        if (window.BackupLocal?.pronta) await window.BackupLocal.pronta;
        let mudou = false;
        const resultado = await window.navigator.locks.request('projetos:gestao', () => window.navigator.locks.request(`praticas:${projetoId}`, () => {
            disponivel(); projeto(projetoId, true);
            const estado = ler(projetoId), antes = JSON.stringify(estado);
            const resultado = acao(estado);
            const depois = JSON.stringify(schema.validar(estado, projetoId));
            // Um único setItem é o commit: não há estado parcial a recuperar.
            if (depois !== antes) { storage.setItem(chave(projetoId), depois); mudou = true; }
            return clonar(resultado);
        }));
        if (mudou && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('praticas:alteradas', { detail: { projetoId } }));
        }
        return resultado;
    }
    function obterAtividade(estado, atividadeId, ativa = false) {
        id(atividadeId);
        if (!Object.hasOwn(estado.atividades, atividadeId)) falhar('atividade inexistente');
        const registro = estado.atividades[atividadeId];
        if (ativa && registro.removida) falhar('atividade removida');
        return registro;
    }
    function obterMissao(estado, missaoId) {
        id(missaoId);
        if (!Object.hasOwn(estado.missoes, missaoId)) falhar('atividade prática inexistente');
        return estado.missoes[missaoId];
    }
    function inserir(colecao, campoId, entrada) {
        const identificador = entrada[campoId];
        if (Object.hasOwn(colecao, identificador)) {
            if (!igual(colecao[identificador], entrada)) falhar('ID reutilizado com outro conteúdo');
            return colecao[identificador];
        }
        colecao[identificador] = entrada;
        return entrada;
    }
    function criarAtividade(dados) {
        const atividade = dominio.criarAtividade(dados);
        return escrever(atividade.projetoId, estado => {
            if (Object.hasOwn(estado.atividades, atividade.atividadeId)) {
                const anterior = estado.atividades[atividade.atividadeId];
                if (!igual(anterior.atividade, atividade)) falhar('ID de atividade reutilizado com outro conteúdo');
                return anterior;
            }
            const registro = { atividade, revisao: 1, removida: false };
            estado.atividades[atividade.atividadeId] = registro;
            return registro;
        });
    }
    function revisar(registro, revisaoEsperada) {
        if (!Number.isSafeInteger(revisaoEsperada) || revisaoEsperada !== registro.revisao) falhar('conflito de revisão; releia a atividade');
        if (!Number.isSafeInteger(registro.revisao + 1)) falhar('limite de revisão excedido');
        registro.revisao++;
    }
    function editarAtividade(projetoId, atividadeId, alteracoes, revisaoEsperada) {
        alteracoes = copiarEntrada(alteracoes);
        return escrever(projetoId, estado => {
            const registro = obterAtividade(estado, atividadeId, true);
            if (!alteracoes || typeof alteracoes !== 'object' || Array.isArray(alteracoes)
                || Object.keys(alteracoes).some(k => !['nome', 'tipo', 'duracaoPlanejadaSegundos', 'importanciaProva', 'agendamento', 'presetXpId', 'perfilXp', 'pesoProva', 'duracaoModo'].includes(k))) falhar('alterações inválidas');
            const atualizada = dominio.validarAtividade({ ...registro.atividade, ...alteracoes });
            if (igual(atualizada, registro.atividade)) return registro;
            if (atualizada.tipo !== registro.atividade.tipo
                && Object.values(estado.missoes).some(m => m.atividadeId === atividadeId)) falhar('não altere o tipo de uma atividade com atividades práticas; crie outra atividade');
            revisar(registro, revisaoEsperada);
            registro.atividade = atualizada;
            return registro;
        });
    }
    function removerAtividade(projetoId, atividadeId, revisaoEsperada) {
        return escrever(projetoId, estado => {
            const registro = obterAtividade(estado, atividadeId);
            if (registro.removida) return registro;
            revisar(registro, revisaoEsperada);
            registro.removida = true;
            return registro;
        });
    }
    function criarMissao(projetoId, atividadeId, dados) {
        dados = copiarEntrada(dados);
        return escrever(projetoId, estado => {
            const registro = obterAtividade(estado, atividadeId, true);
            // Retry conserva o snapshot original, inclusive após editar duração.
            if (dados && Object.hasOwn(estado.missoes, dados.missaoId)) {
                const anterior = estado.missoes[dados.missaoId];
                const configuracao = { ...registro.atividade, duracaoPlanejadaSegundos: anterior.duracaoPlanejadaSegundos };
                delete configuracao.duracaoModo; // retry usa a duração histórica, não a referência atual do cadastro
                if (Object.hasOwn(anterior, 'presetXpId')) configuracao.presetXpId = anterior.presetXpId;
                else delete configuracao.presetXpId;
                if (Object.hasOwn(anterior,'perfilXp')) configuracao.perfilXp = anterior.perfilXp;
                else delete configuracao.perfilXp;
                const candidata = dominio.criarMissao(configuracao, dados);
                if (!igual(anterior, candidata)) falhar('ID de atividade prática reutilizado com outro conteúdo');
                return anterior;
            }
            return inserir(estado.missoes, 'missaoId', dominio.criarMissao(registro.atividade, dados));
        });
    }
    function registrarFato(projetoId, missaoId, dados, nome) {
        dados = copiarEntrada(dados);
        return escrever(projetoId, estado => {
            const missao = obterMissao(estado, missaoId), registro = obterAtividade(estado, missao.atividadeId);
            const fato = { conclusoes: dominio.criarConclusao, sessoes: dominio.criarSessao,
                avaliacoes: dominio.criarAvaliacao }[nome](registro.atividade, missao, dados);
            const campoId = { conclusoes: 'conclusaoId', sessoes: 'sessaoId', avaliacoes: 'avaliacaoId' }[nome];
            if (nome === 'avaliacoes' && !Object.hasOwn(estado.avaliacoes, fato.avaliacaoId)
                && !Object.values(estado.conclusoes).some(c => c.missaoId === missaoId && !Object.hasOwn(estado.exclusoes.conclusoes, c.conclusaoId))) falhar('conclua a atividade prática antes de avaliar');
            if (registro.removida && !Object.hasOwn(estado[nome], fato[campoId])) falhar('atividade removida');
            // Um retry de fato excluído retorna a origem, mas conserva seu tombstone.
            return inserir(estado[nome], campoId, fato);
        });
    }
    function excluirFato(projetoId, fatoId, nome) {
        return escrever(projetoId, estado => {
            id(fatoId);
            if (!Object.hasOwn(estado[nome], fatoId)) falhar('fato inexistente');
            estado.exclusoes[nome][fatoId] = true;
            return estado[nome][fatoId];
        });
    }
    function concluirMissao(projetoId, missaoId, dados) {
        dados = copiarEntrada(dados);
        return escrever(projetoId, estado => {
            const missao = obterMissao(estado, missaoId), registro = obterAtividade(estado, missao.atividadeId, true);
            const entrada = dominio.criarConclusao(registro.atividade, missao, dados);
            if (Object.hasOwn(estado.conclusoes, entrada.conclusaoId)) return inserir(estado.conclusoes, 'conclusaoId', entrada);
            const anterior = Object.values(estado.conclusoes).find(c => c.missaoId === missaoId && !Object.hasOwn(estado.exclusoes.conclusoes, c.conclusaoId));
            return anterior || inserir(estado.conclusoes, 'conclusaoId', entrada);
        });
    }
    function definirPresetMissao(projetoId, missaoId, presetXpId) {
        return definirConfiguracaoXp(projetoId,missaoId,{presetXpId});
    }
    function definirPerfilMissao(projetoId,missaoId,perfilXp) {
        return definirConfiguracaoXp(projetoId,missaoId,{perfilXp:copiarEntrada(perfilXp)});
    }
    function definirConfiguracaoXp(projetoId,missaoId,configuracao) {
        return escrever(projetoId, estado => {
            const missao = obterMissao(estado, missaoId), registro = obterAtividade(estado, missao.atividadeId, true);
            const candidata = dominio.validarMissao({...missao,...configuracao},registro.atividade);
            if (igual(candidata,missao)) return missao;
            if (missao.presetXpId != null || missao.perfilXp != null) falhar('preset da atividade prática já definido; o snapshot é preservado');
            const possuiFatos = ['conclusoes','sessoes','avaliacoes'].some(c => Object.values(estado[c]).some(f => f.missaoId === missaoId));
            if (!possuiFatos) falhar('registre realização ou tempo antes de classificar esta atividade prática; configure o cadastro para as próximas');
            Object.assign(missao,configuracao);
            return missao;
        });
    }
    function projetarAtividade(projetoId, atividadeId) {
        return projetarEstadoAtividade(ler(projetoId), atividadeId);
    }
    function projetarEstadoAtividade(estado, atividadeId) {
        const registro = obterAtividade(estado, atividadeId);
        return dominio.projetarAtividade({ atividade: registro.atividade,
            missoes: Object.values(estado.missoes).filter(m => m.atividadeId === atividadeId),
            conclusoes: Object.values(estado.conclusoes).filter(c => c.atividadeId === atividadeId && !Object.hasOwn(estado.exclusoes.conclusoes, c.conclusaoId)),
            sessoes: Object.values(estado.sessoes).filter(s => s.atividadeId === atividadeId && !Object.hasOwn(estado.exclusoes.sessoes, s.sessaoId)) });
    }
    function obterProgressaoEstado(estado, atividadeId) {
        const projecao = projetarEstadoAtividade(estado, atividadeId);
        return window.PraticasProgressao.projetarAtividade({ tipo: estado.atividades[atividadeId].atividade.tipo, missoes: projecao.missoes.map(m => ({ ...m,
            presetXpId: estado.missoes[m.missaoId].presetXpId ?? null,perfilXp:estado.missoes[m.missaoId].perfilXp ?? null })) });
    }
    function listarProgressao() {
        disponivel();
        const lista = [];
        for (const k of Object.keys(storage).filter(k => k.startsWith(prefixo))) {
            const projetoId = k.slice(prefixo.length), estado = ler(projetoId), registroProjeto = projeto(projetoId);
            const dados = lerJsonProjeto(projetoId, 'dadosExame', null);
            const idsComHistorico = new Set(['conclusoes','sessoes','avaliacoes'].flatMap(c => Object.values(estado[c]).map(f => f.atividadeId)));
            for (const atividadeId of idsComHistorico) {
                const registro = estado.atividades[atividadeId];
                const fatos = projetarEstadoAtividade(estado, atividadeId);
                lista.push({ projetoId, atividadeId, nome: registro.atividade.nome, tipo: registro.atividade.tipo,
                    projetoNome: dados?.nomeExame || registroProjeto.nome || 'Projeto', removida: registro.removida,
                    projetoArquivado: Boolean(registroProjeto.arquivado), projetoRemovido: Boolean(registroProjeto.removido),
                    tempoRegistradoSegundos: fatos.tempoRegistradoSegundos, ...obterProgressaoEstado(estado, atividadeId) });
            }
        }
        return lista.sort((a,b) => b.xpUnidades - a.xpUnidades || a.nome.localeCompare(b.nome, 'pt-BR')
            || a.projetoId.localeCompare(b.projetoId) || a.atividadeId.localeCompare(b.atividadeId));
    }
    function dataBrParaIso(data) {
        if (typeof data !== 'string') return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
        const partes = data.split('/');
        if (partes.length !== 3 || partes.some(p => !p)) return '';
        return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
    }
    function lerJsonProjeto(projetoId, sufixo, padrao = null) {
        const raw = storage.getItem(`projetoV1:${projetoId}:${sufixo}`) ?? storage.getItem(sufixo);
        if (raw === null) return padrao;
        try { return JSON.parse(raw); } catch (_) { return padrao; }
    }
    // Configuração gravada nunca é reescrita aqui: apenas a leitura do plano ignora
    // dias fora da rotina atual (prática interna) e referências de estágio removidas.
    function normalizarAtividadesParaPlanejamento(atividades, materiasNormalizadas, diasRotina) {
        const idsMaterias = new Set((Array.isArray(materiasNormalizadas) ? materiasNormalizadas : []).map(m => m?.projetoMateriaId).filter(Boolean));
        return atividades.map(original => {
            let atividade = original;
            if (atividade.agendamento?.inicio?.modo !== 'estagio') return atividade;
            const validos = atividade.agendamento.inicio.projetoMateriaIds.filter(idMat => idsMaterias.has(idMat));
            if (validos.length === atividade.agendamento.inicio.projetoMateriaIds.length) return atividade;
            return {
                ...atividade,
                agendamento: {
                    ...atividade.agendamento,
                    inicio: validos.length
                        ? { ...atividade.agendamento.inicio, projetoMateriaIds: validos }
                        : { modo: 'inicio' }
                }
            };
        });
    }
    function planejarProjeto(dados, materiasNormalizadas = null) {
        if (!dados || typeof dados !== 'object' || typeof dados.projetoId !== 'string') return null;
        if (storage.getItem(chave(dados.projetoId)) === null) return null;
        const estado = ler(dados.projetoId);
        const ativas = Object.values(estado.atividades).filter(r => !r.removida).map(r => r.atividade);
        const agendadas = ativas.filter(a => a.agendamento);
        if (!agendadas.length) return null;
        const materias = Array.isArray(materiasNormalizadas)
            ? materiasNormalizadas
            : lerJsonProjeto(dados.projetoId, 'objetosNormalizados', []);
        const dataInicio = dataBrParaIso(dados.dataInicioF);
        const dataFinal = dataBrParaIso(dados.dataFinalF);
        const listaDiaDaSemana = Array.isArray(dados.listaDiaDaSemana) ? dados.listaDiaDaSemana : [];
        const minutosPorDia = Number(dados.minutosPorDia);
        const disponibilidadeDiariaSegundos = Math.round(minutosPorDia * 60);
        const blocosPorDia = Number(dados.blocosPorDia ?? dados.materiasPorDia) || 1;
        let diasEstudo = Number(dados.diasEstudoPraProva);
        if ((!Number.isInteger(diasEstudo) || diasEstudo < 1) && dataInicio && dataFinal && dataFinal >= dataInicio && listaDiaDaSemana.length) {
            const rotinaSet = new Set(listaDiaDaSemana), nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
            let contagem = 0;
            for (const d = new Date(`${dataInicio}T12:00:00.000Z`), fim = new Date(`${dataFinal}T12:00:00.000Z`); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
                if (rotinaSet.has(nomesDias[d.getUTCDay()])) contagem++;
            }
            diasEstudo = contagem;
        }
        if (!dataInicio || !dataFinal || dataFinal < dataInicio || !listaDiaDaSemana.length
            || !Number.isSafeInteger(disponibilidadeDiariaSegundos) || disponibilidadeDiariaSegundos < 1
            || !Number.isInteger(blocosPorDia) || blocosPorDia < 1
            || !Number.isInteger(diasEstudo) || diasEstudo < 1) {
            return null;
        }
        const atividadesCalculo = normalizarAtividadesParaPlanejamento(ativas, materias, listaDiaDaSemana);
        if (!atividadesCalculo.some(a => a.agendamento)) return null;
        let planoTeoricoBase = null;
        if (atividadesCalculo.some(a => a.agendamento?.inicio?.modo === 'estagio')) {
            if (Array.isArray(materias) && materias.length && window.DistribuicaoEstudos?.gerar) {
                planoTeoricoBase = window.DistribuicaoEstudos.gerar({
                    distribuicaoVersao: 3,
                    minutosPorDia,
                    blocosPorDia,
                    diasEstudoPraProva: diasEstudo
                }, materias).materiaDoDia;
            } else {
                const planoSalvo = lerJsonProjeto(dados.projetoId, 'materiaDoDia', null);
                if (planoSalvo && typeof planoSalvo === 'object' && Object.keys(planoSalvo).length === diasEstudo) {
                    planoTeoricoBase = planoSalvo;
                } else {
                    return null;
                }
            }
        }
        const previa = dominio.planejarCapacidadePraticas({
            projetoId: dados.projetoId,
            dataInicio,
            dataFinal,
            diasRotina: listaDiaDaSemana,
            disponibilidadeDiariaSegundos,
            blocosPorDia,
            totalMaterias: Array.isArray(materias) ? materias.length : 0,
            atividades: atividadesCalculo,
            ...(atividadesCalculo.some(a=>a.agendamento?.modo === 'automatico') ? {materiasProva: window.MateriasStore?.listarProjetosMaterias
                ? window.MateriasStore.listarProjetosMaterias(dados.projetoId).filter(m=>!m.removida)
                : lerJsonProjeto(dados.projetoId,'objetosSalvos',[]),
                missoesPreservadas:missoesProtegidas(estado,atividadesCalculo)} : {}),
            ...(planoTeoricoBase ? { planoTeoricoBase } : {})
        });
        // Sem reserva interna, a v3 vigente é usada sem alteração (TAF não consome carga).
        const temReservaInterna = dados.distribuicaoVersao === 3 && previa.diasEstudo.some(d => d.reservaInternaSegundos > 0);
        const dadosDistribuicao = temReservaInterna && previa.diasEstudo.length === diasEstudo
            ? {
                ...dados,
                blocosPorDiaLista: previa.diasEstudo.map(d => d.blocosNormaisRestantes),
                duracaoNormalBlocoSegundos: previa.duracaoNormalBlocoSegundos
            }
            : dados;
        return { previa, temReservaInterna, dadosDistribuicao };
    }
    function ehMissaoAgendadaAutomatica(missao) {
        return Boolean(missao && missao.missaoId === `missao-${missao.atividadeId}-${missao.dataPrevista}`);
    }
    function missoesProtegidas(estado,atividades) {
        const emCronometro = missaoEmCronometro(estado);
        return Object.values(estado.missoes).filter(m=>atividades.some(a=>a.atividadeId===m.atividadeId && a.agendamento?.modo==='automatico')
            && ehMissaoAgendadaAutomatica(m) && (['conclusoes','sessoes','avaliacoes'].some(c=>Object.values(estado[c]).some(f=>f.missaoId===m.missaoId))
                || emCronometro===m.missaoId));
    }
    function missaoEmCronometro(estado) {
        const raw = storage.getItem(`cronometroV1:${estado.projetoId}`);
        if (raw === null) return null;
        const checkpoint = JSON.parse(raw);
        if (checkpoint?.contexto?.tipo !== 'pratica') return null;
        const missao = estado.missoes[checkpoint.contexto.missaoId];
        if (checkpoint.projetoId !== estado.projetoId || checkpoint.contexto.projetoId !== estado.projetoId
            || !missao || missao.atividadeId !== checkpoint.contexto.atividadeId) falhar('vínculo do cronômetro prático inválido');
        return missao.missaoId;
    }
    function aplicarSincronizacaoMissoes(estado, missoesPlanejadas) {
        if (!Array.isArray(missoesPlanejadas)) falhar('lista de atividades práticas inválida');
        const mapa = new Map();
        for (const entrada of missoesPlanejadas) {
            const registro = obterAtividade(estado, entrada?.atividadeId, true);
            let missao;
            if (Object.hasOwn(entrada, 'versao')) missao = dominio.validarMissao(entrada, registro.atividade);
            else {
                if (Object.keys(entrada).some(k => !['missaoId', 'atividadeId', 'dataPrevista', 'duracaoPlanejadaSegundos'].includes(k))) falhar('campos da atividade prática planejada inválidos');
                missao = dominio.criarMissao(registro.atividade, { missaoId: entrada.missaoId, dataPrevista: entrada.dataPrevista });
                if (Object.hasOwn(entrada, 'duracaoPlanejadaSegundos') && entrada.duracaoPlanejadaSegundos !== missao.duracaoPlanejadaSegundos) falhar('duração planejada divergente');
            }
            if (mapa.has(missao.missaoId) && !igual(mapa.get(missao.missaoId), missao)) falhar('conflito de ID na sincronização');
            mapa.set(missao.missaoId, missao);
        }
        const lista = [...mapa.values()];
        const comFatos = new Set([
            ...Object.values(estado.conclusoes).map(c => c.missaoId),
            ...Object.values(estado.sessoes).map(s => s.missaoId),
            ...Object.values(estado.avaliacoes).map(a => a.missaoId)
        ]);
        const emCronometro = missaoEmCronometro(estado);
        if (emCronometro) comFatos.add(emCronometro);
        const planejadasPorId = new Map(lista.map(m => [m.missaoId, m]));
        for (const [missaoId, existente] of Object.entries(estado.missoes)) {
            if (comFatos.has(missaoId)) continue;
            if (!ehMissaoAgendadaAutomatica(existente)) continue;
            const registro = estado.atividades[existente.atividadeId];
            if (!registro || registro.removida || !planejadasPorId.has(missaoId)) {
                delete estado.missoes[missaoId];
            }
        }
        for (const planejada of lista) {
            const registro = obterAtividade(estado, planejada.atividadeId, true);
            // Atividade prática com fato mantém seu snapshot; atividade prática automática ainda não executada é projeção do plano.
            if (Object.hasOwn(estado.missoes, planejada.missaoId) && comFatos.has(planejada.missaoId)) continue;
            estado.missoes[planejada.missaoId] = dominio.criarMissao(registro.atividade, {
                missaoId: planejada.missaoId,
                dataPrevista: planejada.dataPrevista
            });
        }
        return Object.values(estado.missoes);
    }
    function sincronizarMissoes(projetoId, missoesPlanejadas) {
        id(projetoId);
        if (!Array.isArray(missoesPlanejadas)) return Promise.reject(new Error('Práticas: lista de atividades práticas inválida'));
        const lista = copiarEntrada(missoesPlanejadas);
        if (storage.getItem(chave(projetoId)) === null && !lista.length) return Promise.resolve([]);
        return escrever(projetoId, estado => aplicarSincronizacaoMissoes(estado, lista));
    }
    function sincronizarMissoesProjeto(dados = null, materiasNormalizadas = null) {
        const projetoId = dados?.projetoId || window.ProjetosStore?.idAtual?.();
        if (!projetoId || storage.getItem(chave(projetoId)) === null) return Promise.resolve([]);
        const dadosEfetivos = dados || lerJsonProjeto(projetoId, 'dadosExame', null);
        const materiasEfetivas = Array.isArray(materiasNormalizadas)
            ? materiasNormalizadas
            : lerJsonProjeto(projetoId, 'objetosNormalizados', []);
        const planejamento = planejarProjeto(dadosEfetivos, materiasEfetivas);
        return sincronizarMissoes(projetoId, planejamento ? planejamento.previa.missoes : []);
    }
    function projetarMissoesProjeto(projetoId, opcoes = {}) {
        const vazio = { missoes: [], missoesPorDiaJornada: {}, missoesPorData: {}, folgas: [], folgasPorData: {}, atividades: {} };
        if (!projetoId || storage.getItem(chave(projetoId)) === null) return vazio;
        const estado = ler(projetoId);
        const dados = opcoes.dados ?? lerJsonProjeto(projetoId, 'dadosExame', null);
        const materiaDoDia = opcoes.materiaDoDia ?? lerJsonProjeto(projetoId, 'materiaDoDia', null);
        const materiasNormalizadas = opcoes.materiasNormalizadas ?? lerJsonProjeto(projetoId, 'objetosNormalizados', []);
        const planejamento = dados ? planejarProjeto(dados, materiasNormalizadas) : null;
        const planejadasPorId = new Map((planejamento?.previa?.missoes || []).map(m => [m.missaoId, m]));
        const totalDiasPlano = materiaDoDia && Object.keys(materiaDoDia).length
            ? Object.keys(materiaDoDia).length : Number(dados?.diasEstudoPraProva) || 0;
        let datasEstudo = { porDia: {}, porData: {} };
        if (dados && totalDiasPlano > 0 && window.CalendarioJornada?.mapear) {
            try { datasEstudo = window.CalendarioJornada.mapear(dados, totalDiasPlano); } catch (_) {}
        }
        const conclusoesAtivas = Object.values(estado.conclusoes).filter(c => !Object.hasOwn(estado.exclusoes.conclusoes, c.conclusaoId));
        const sessoesAtivas = Object.values(estado.sessoes).filter(s => !Object.hasOwn(estado.exclusoes.sessoes, s.sessaoId));
        const comFatosHistoricos = new Set([
            ...Object.values(estado.conclusoes).map(c => c.missaoId),
            ...Object.values(estado.sessoes).map(s => s.missaoId),
            ...Object.values(estado.avaliacoes).map(a => a.missaoId)
        ]);
        const emCronometro = missaoEmCronometro(estado);
        if (emCronometro) comFatosHistoricos.add(emCronometro);
        // Atividade prática automática sem fato acompanha o plano vigente; fatos e atividades práticas manuais são preservados.
        const planoVigente = Boolean(planejamento) || (dados?.distribuicaoVersao === 3
            && !Object.values(estado.atividades).some(r => !r.removida && r.atividade.agendamento));
        const missoesEfetivasPorId = new Map();
        for (const [missaoId, missao] of Object.entries(estado.missoes)) {
            const registro = estado.atividades[missao.atividadeId];
            if (!registro || (registro.removida && !comFatosHistoricos.has(missaoId))) continue;
            if (planoVigente && ehMissaoAgendadaAutomatica(missao) && !comFatosHistoricos.has(missaoId)) continue;
            missoesEfetivasPorId.set(missaoId, missao);
        }
        for (const [missaoId, planejada] of planejadasPorId.entries()) {
            if (missoesEfetivasPorId.has(missaoId)) continue;
            const registro = estado.atividades[planejada.atividadeId];
            if (!registro || registro.removida) continue;
            missoesEfetivasPorId.set(missaoId, dominio.criarMissao(registro.atividade, {
                missaoId: planejada.missaoId,
                dataPrevista: planejada.dataPrevista
            }));
        }
        const missoes = [];
        const missoesPorDiaJornada = {};
        const missoesPorData = {};
        const folgasPorData = {};
        const atividades = {};
        for (const [atividadeId, registro] of Object.entries(estado.atividades)) {
            const missoesDaAtividade = [...missoesEfetivasPorId.values()].filter(m => m.atividadeId === atividadeId);
            if (registro.removida && !missoesDaAtividade.length) continue;
            const conclusoesDaAtividade = conclusoesAtivas.filter(c => c.atividadeId === atividadeId);
            const sessoesDaAtividade = sessoesAtivas.filter(s => s.atividadeId === atividadeId);
            const proj = dominio.projetarAtividade({
                atividade: registro.atividade,
                missoes: missoesDaAtividade,
                conclusoes: conclusoesDaAtividade,
                sessoes: sessoesDaAtividade
            });
            atividades[atividadeId] = { ...clonar(registro.atividade), ...proj };
            const xp = window.PraticasProgressao?.projetarAtividade({ tipo: registro.atividade.tipo, missoes: proj.missoes.map(m => ({ ...m,
                presetXpId: missoesEfetivasPorId.get(m.missaoId).presetXpId ?? null,perfilXp:missoesEfetivasPorId.get(m.missaoId).perfilXp ?? null })) });
            if (xp) atividades[atividadeId].progressao = xp;
            const xpPorMissao = new Map((xp?.missoes || []).map(m => [m.missaoId, m]));
            const regras = dominio.regrasDoTipo(registro.atividade.tipo);
            const conclusaoPorMissao = new Map();
            conclusoesDaAtividade.forEach(c => {
                const anterior = conclusaoPorMissao.get(c.missaoId);
                if (!anterior || c.registradoEm < anterior) conclusaoPorMissao.set(c.missaoId, c.registradoEm);
            });
            for (const m of proj.missoes) {
                const diaJornada = datasEstudo.porData?.[m.dataPrevista] || null;
                const item = {
                    missaoId: m.missaoId,
                    atividadeId,
                    projetoId,
                    nome: registro.atividade.nome,
                    tipo: registro.atividade.tipo,
                    consomeCargaEstudo: regras.consomeCargaEstudo,
                    usaCronometro: regras.usaCronometro,
                    importanciaProva: clonar(registro.atividade.importanciaProva),
                    dataPrevista: m.dataPrevista,
                    diaJornada,
                    emDiaEstudo: Boolean(diaJornada),
                    duracaoPlanejadaSegundos: m.duracaoPlanejadaSegundos,
                    tempoRegistradoSegundos: m.tempoRegistradoSegundos,
                    concluida: m.concluida,
                    registradoEm: conclusaoPorMissao.get(m.missaoId) || null,
                    estado: m.concluida ? 'concluida' : 'pendente',
                    presetXpId: missoesEfetivasPorId.get(m.missaoId).presetXpId ?? null,
                    perfilXp: missoesEfetivasPorId.get(m.missaoId).perfilXp ?? null,
                    ...(xpPorMissao.has(m.missaoId) ? { progressao: xpPorMissao.get(m.missaoId) } : {}),
                    planejadasAtividade: proj.planejadas,
                    concluidasAtividade: proj.concluidas,
                    percentualAtividade: proj.percentual,
                    tempoTotalAtividadeSegundos: proj.tempoRegistradoSegundos
                };
                missoes.push(item);
                (missoesPorData[item.dataPrevista] ||= []).push(item);
                if (diaJornada) (missoesPorDiaJornada[diaJornada] ||= []).push(item);
                else (folgasPorData[item.dataPrevista] ||= []).push(item);
            }
        }
        const ordenarMissoes = lista => lista.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista)
            || a.nome.localeCompare(b.nome, 'pt-BR')
            || a.missaoId.localeCompare(b.missaoId));
        ordenarMissoes(missoes);
        Object.values(missoesPorDiaJornada).forEach(ordenarMissoes);
        Object.values(missoesPorData).forEach(ordenarMissoes);
        Object.values(folgasPorData).forEach(ordenarMissoes);
        const folgas = Object.entries(folgasPorData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dataPrevista, lista]) => ({ dataPrevista, missoes: lista }));
        return { missoes, missoesPorDiaJornada, missoesPorData, folgas, folgasPorData, atividades };
    }
    function prepararCopia(origemId, destinoId, mapaMaterias = null) {
        disponivel(); projeto(origemId); id(destinoId);
        if (origemId === destinoId) falhar('destino da cópia inválido');
        if (storage.getItem(chave(destinoId)) !== null) falhar('destino já possui práticas');
        if (storage.getItem(chave(origemId)) === null) return {};
        const origem = ler(origemId), destino = schema.vazio(destinoId);
        for (const registro of Object.values(origem.atividades).filter(r => !r.removida)) {
            const atividadeEntrada = {
                ...registro.atividade,
                projetoId: destinoId,
                atividadeId: `atividade-${window.crypto.randomUUID()}`
            };
            if (registro.atividade.agendamento) {
                let agendamento = registro.atividade.agendamento;
                if (agendamento.inicio?.modo === 'estagio' && mapaMaterias && typeof mapaMaterias === 'object') {
                    agendamento = {
                        ...agendamento,
                        inicio: {
                            ...agendamento.inicio,
                            projetoMateriaIds: agendamento.inicio.projetoMateriaIds.map(idMat => mapaMaterias[idMat] || idMat)
                        }
                    };
                }
                atividadeEntrada.agendamento = agendamento;
            }
            const atividade = dominio.validarAtividade(atividadeEntrada);
            if (Object.hasOwn(destino.atividades, atividade.atividadeId)) falhar('ID duplicado ao preparar a cópia');
            destino.atividades[atividade.atividadeId] = { atividade, revisao: 1, removida: false };
        }
        return { [chave(destinoId)]: JSON.stringify(schema.validar(destino, destinoId)) };
    }
    window.PraticasStore = Object.freeze({ criarAtividade, editarAtividade, removerAtividade, criarMissao,
        registrarConclusao: (projetoId, missaoId, dados) => registrarFato(projetoId, missaoId, dados, 'conclusoes'),
        registrarSessao: (projetoId, missaoId, dados) => registrarFato(projetoId, missaoId, dados, 'sessoes'),
        registrarAvaliacao: (projetoId, missaoId, dados) => registrarFato(projetoId, missaoId, dados, 'avaliacoes'),
        excluirAvaliacao: (projetoId, fatoId) => excluirFato(projetoId, fatoId, 'avaliacoes'),
        concluirMissao, definirPresetMissao, definirPerfilMissao,
        excluirConclusao: (projetoId, fatoId) => excluirFato(projetoId, fatoId, 'conclusoes'),
        excluirSessao: (projetoId, fatoId) => excluirFato(projetoId, fatoId, 'sessoes'),
        obterEstado: projetoId => clonar(ler(projetoId)),
        listarAtividades: (projetoId, opcoes = {}) => clonar(Object.values(ler(projetoId).atividades).filter(r => opcoes.incluirRemovidas || !r.removida)),
        obterMissoesProtegidas(projetoId,atividades) { return clonar(missoesProtegidas(ler(projetoId),atividades)); },
        projetarAtividade, listarProgressao, planejarProjeto, sincronizarMissoes, sincronizarMissoesProjeto, projetarMissoesProjeto,
        validarIntegridade: projetoId => { ler(projetoId); return true; }, prepararCopia });
})();
