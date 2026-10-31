/* Configuração isolada por projeto; histórico, domínio e identidades continuam globais. */
(function () {
    try {
    window.BackupLocal?.garantirDisponivel();
    const storage = window.localStorage;
    const CHAVES = new Set(['dadosExame', 'wizardProjeto', 'listaDiaDaSemana', 'carga_horaria_disponivel',
        'lista_distribuicao_materias', 'totalQuestoes', 'objetosSalvos', 'objetosNormalizados',
        'somaDasQuestoesNormalizadas', 'materiaDoDia', 'revisoesDoDia', 'planosIdentidadeV1', 'revisoesEstadoV1', 'revisoesTransacaoV1']);
    const prefixo = id => `projetoV1:${id}:`;
    const ler = (chave, padrao = null) => JSON.parse(storage.getItem(chave) || JSON.stringify(padrao));
    const registro = id => ler(prefixo(id) + 'registro');
    const uuid = () => `projeto-${crypto.randomUUID()}`;
    function recuperar(journal) {
        const journals = journal ? [journal] : ['projetosTransacaoV1', ...Object.keys(storage).filter(k=>k.startsWith('projetosTransacaoV2:'))];
        journals.forEach(chaveJournal => {
            const transacao = ler(chaveJournal);
            if (!transacao) return;
            Object.entries(transacao).forEach(([chave, valor]) => valor === null ? storage.removeItem(chave) : storage.setItem(chave, valor));
            storage.removeItem(chaveJournal);
        });
    }
    function gravar(valores, journal='projetosTransacaoV1') {
        storage.setItem(journal, JSON.stringify(valores));
        recuperar(journal);
    }
    function migrar() {
        recuperar();
        const antigos = Object.fromEntries([...CHAVES].map(k => [k, storage.getItem(k)]));
        if (!Object.values(antigos).some(v => v !== null)) return;
        Object.values(antigos).filter(v => v !== null).forEach(v => JSON.parse(v));
        const id = JSON.parse(antigos.dadosExame || 'null')?.projetoId || uuid();
        const valores = { [prefixo(id) + 'registro']: JSON.stringify({ id, criadoEm: new Date().toISOString() }), projetoSelecionadoV1: id };
        if (!storage.getItem('projetosBackupV1')) valores.projetosBackupV1 = JSON.stringify(antigos);
        Object.entries(antigos).forEach(([k,v]) => { if (v !== null) valores[prefixo(id) + k] = v; valores[k] = null; });
        gravar(valores);
        sessionStorage.setItem('projetoSelecionadoV1', id);
    }
    migrar();
    let selecionado = sessionStorage.getItem('projetoSelecionadoV1') || storage.getItem('projetoSelecionadoV1');
    if (!registro(selecionado) || registro(selecionado).removido || registro(selecionado).arquivado) selecionado = null;
    if (selecionado) sessionStorage.setItem('projetoSelecionadoV1', selecionado);
    const pagina = location.pathname.split('/').pop();
    const wizard = pagina === 'index.html' && /novo|editar/.test(location.search);
    function criar() {
        const id = uuid();
        storage.setItem(prefixo(id) + 'registro', JSON.stringify({ id, criadoEm: new Date().toISOString() }));
        selecionar(id);
        return id;
    }
    function selecionar(id) {
        if (!registro(id) || registro(id).removido || registro(id).arquivado) throw new Error('Restaure o projeto arquivado antes de abri-lo.');
        sessionStorage.setItem('projetoSelecionadoV1', id);
        storage.setItem('projetoSelecionadoV1', id);
        // A página atual mantém seu contexto; a próxima navegação abre o selecionado.
    }
    if (!selecionado && wizard) {
        if (/editar/.test(location.search)) location.replace('home.html');
        else selecionado = criar();
    }
    function validar() {
        if (!selecionado || !registro(selecionado) || registro(selecionado).removido || registro(selecionado).arquivado) throw new Error('Selecione um projeto ativo na página inicial.');
    }
    function existente(id) {
        const r = registro(id);
        if (!r || r.removido) throw new Error('Este projeto não está mais disponível.');
        return r;
    }
    function semTempoPendente(id) {
        if (Object.keys(storage).some(k => k.startsWith(`${prefixo(id)}estudoExtraV1:`)
            && JSON.parse(storage.getItem(k))?.registroManualPendente
            && !window.HistoricoRepository?.extraExcluido(id,JSON.parse(storage.getItem(k)).blocoId))) {
            throw new Error('Há um registro manual para recuperar. Confira o armazenamento e recarregue antes de gerenciar este projeto.');
        }
        const journal = ler('cronometroRegistroV1');
        if (storage.getItem(`cronometroV1:${id}`) || (journal && (!journal.sessao?.projetoId || journal.sessao.projetoId===id))) {
            throw new Error('Abra o projeto e registre ou zere o tempo pendente antes de arquivar ou excluir.');
        }
    }
    async function gerenciar(id, acao, protegerTimer = false) {
        if (!window.navigator?.locks) throw new Error('Use um navegador com Web Locks em HTTPS ou localhost para gerenciar projetos.');
        return navigator.locks.request('projetos:gestao', async () => {
            recuperar(); existente(id);
            if (!protegerTimer) return acao();
            return navigator.locks.request(`cronometro:${id}`, {ifAvailable:true}, lock => {
                if (!lock) throw new Error('Feche a aba do cronômetro deste projeto antes de arquivar ou excluir. Registre ou zere qualquer tempo pendente primeiro.');
                semTempoPendente(id);
                return acao();
            });
        });
    }
    function excluir(id) {
        const r = existente(id);
        semTempoPendente(id);
        const valores = { [prefixo(id) + 'registro']: JSON.stringify({...r, removido:true}) };
        CHAVES.forEach(k => { valores[prefixo(id) + k] = null; });
        gravar(valores,`projetosTransacaoV2:${id}`);
    }
    async function duplicar(id, destino) {
        existente(id);
        if (!/^projeto-[\w-]+$/.test(destino) || destino===id) throw new Error('Identidade da cópia inválida.');
        const anterior=registro(destino);
        if (anterior) {
            if (anterior.origemCopia===id && !anterior.removido) return destino;
            throw new Error('A cópia não está mais disponível. Atualize a página.');
        }
        const dados=ler(prefixo(id)+'dadosExame',{}), rascunho=ler(prefixo(id)+'wizardProjeto',{});
        const projecao=ler(prefixo(id)+'objetosSalvos',[]);
        if (!Array.isArray(projecao)) throw new Error('Cadastro de matérias inválido.');
        projecao.forEach(m => window.MateriasStore.obterProjetoMateria(m.projetoMateriaId, id));
        // O domínio pode ter sido salvo antes de uma falha na projeção do wizard.
        const materias=window.MateriasStore.listarProjetosMaterias(id).filter(p=>!p.removida).map(p=>({
            Materia:p.nomeExibicao ?? window.MateriasStore.resolverMateriaGlobal(p.materiaGlobalId).nomeCanonico,
            projetoMateriaId:p.projetoMateriaId,Nquestoes:p.Nquestoes,peso:p.peso,afinidade:p.afinidade
        }));
        const nome=`Cópia de ${rascunho?.valores?.nome_exame || dados.nomeExame || 'Projeto em preparação'}`;
        const minutos=Number(dados.minutosPorDia)||0;
        const horas=rascunho?.valores?.['horas-por-dia'] || dados.horasPorDia || `${String(Math.floor(minutos/60)).padStart(2,'0')}:${String(minutos%60).padStart(2,'0')}`;
        const dias=rascunho?.dias || dados.listaDiaDaSemana || [];
        if (!window.PraticasStore && (storage.getItem(`praticasProjetoV1:${id}`) !== null || storage.getItem(`praticasProjetoV1:${destino}`) !== null)) {
            throw new Error('O armazenamento de atividades práticas precisa estar disponível antes de copiar este projeto. Recarregue a página.');
        }
        const cadastro=await window.MateriasStore.prepararCopia(id,destino,materias);
        const mapaMaterias=Object.fromEntries(materias.map((m,i)=>[m.projetoMateriaId,cadastro[i]?.projetoMateriaId]).filter(([k,v])=>k&&v));
        const praticas=window.PraticasStore ? window.PraticasStore.prepararCopia(id, destino, mapaMaterias) : {};
        // Copiar somente entradas editáveis, nunca o namespace/plano ou estados derivados.
        gravar({
            [prefixo(destino)+'dadosExame']:JSON.stringify({projetoId:destino,nomeExame:nome}),
            [prefixo(destino)+'objetosSalvos']:JSON.stringify(cadastro),
            [prefixo(destino)+'totalQuestoes']:JSON.stringify(cadastro.reduce((s,m)=>s+(Number(m.Nquestoes)||0),0)),
            [prefixo(destino)+'wizardProjeto']:JSON.stringify({etapa:0,valores:{nome_exame:nome,dataInicio:'',dataFinal:'','horas-por-dia':horas},dias}),
            ...praticas,
            [prefixo(destino)+'registro']:JSON.stringify({id:destino,criadoEm:new Date().toISOString(),origemCopia:id})
        },`projetosTransacaoV2:${destino}`);
        return destino;
    }
    window.ProjetoStorage = {
        getItem(chave) { return storage.getItem(CHAVES.has(chave) ? prefixo(selecionado) + chave : chave); },
        setItem(chave, valor) {
            if (CHAVES.has(chave)) validar();
            storage.setItem(CHAVES.has(chave) ? prefixo(selecionado) + chave : chave, valor);
        },
        removeItem(chave) {
            if (CHAVES.has(chave)) validar();
            storage.removeItem(CHAVES.has(chave) ? prefixo(selecionado) + chave : chave);
        },
        get length() { return storage.length; }
    };
    window.ProjetosStore = {
        criar, selecionar, validarAtual: validar, temAtual: () => Boolean(selecionado), idAtual: () => selecionado,
        arquivar: id=>gerenciar(id,()=>storage.setItem(prefixo(id)+'registro',JSON.stringify({...existente(id),arquivado:true})),true),
        restaurar: id=>gerenciar(id,()=>storage.setItem(prefixo(id)+'registro',JSON.stringify({...existente(id),arquivado:false}))),
        excluir: id=>gerenciar(id,()=>excluir(id),true),
        duplicar: (id,destino=uuid())=>gerenciar(id,()=>duplicar(id,destino)),
        listar() {
            return Object.keys(storage).filter(k => k.startsWith('projetoV1:') && k.endsWith(':registro'))
                .map(k => ler(k)).filter(r => !r.removido).map(r => ({ ...r,
                    dados: ler(prefixo(r.id) + 'dadosExame', {}),
                    rascunho: ler(prefixo(r.id) + 'wizardProjeto'),
                    materias: ler(prefixo(r.id) + 'objetosNormalizados', []),
                    plano: ler(prefixo(r.id) + 'materiaDoDia', {}),
                    distribuicao: ler(prefixo(r.id) + 'lista_distribuicao_materias', [])
                }));
        },
        excluirAtual() {
            validar();
            excluir(selecionado);
        }
    };
    // Sem seleção, as páginas de projeto não devem operar sobre outro conjunto de dados.
    if (!selecionado && ['agenda.html', 'pesomateria.html'].includes(pagina)) location.replace('home.html');
    window.addEventListener('storage', () => {
        if (selecionado && (wizard || ['agenda.html','pesomateria.html'].includes(pagina)) && (!registro(selecionado) || registro(selecionado).arquivado || registro(selecionado).removido)) location.replace('home.html');
    });
    window.addEventListener('beforeunload', event => {
        if (window.CronometroEstudos?.obterEstado().estado !== 'ocioso' && window.CronometroEstudos) {
            event.preventDefault(); event.returnValue = '';
        }
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('a[href]') || !window.CronometroEstudos || window.CronometroEstudos.obterEstado().estado === 'ocioso') return;
        event.preventDefault();
        alert('Registre o tempo ou zere o cronômetro antes de sair deste projeto.');
    }, true);
    } catch (erro) {
        const bloquear = () => { throw new Error('Armazenamento de projetos indisponível', { cause: erro }); };
        window.ProjetoStorage = { getItem: bloquear, setItem: bloquear, removeItem: bloquear };
        window.ProjetosStore = { criar: bloquear, selecionar: bloquear, listar: bloquear, temAtual: () => false };
        document.addEventListener('DOMContentLoaded', () => {
            const aviso = document.createElement('p');
            aviso.setAttribute('role', 'alert');
            aviso.textContent = 'Não foi possível carregar os projetos. Os dados foram preservados. Verifique o armazenamento do navegador e recarregue para tentar recuperar a operação.';
            document.body.replaceChildren(aviso);
        });
        console.error(erro);
    }
})();
