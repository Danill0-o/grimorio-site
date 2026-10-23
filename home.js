(function () {
    const status = document.getElementById('home-status');
    const dialog = document.getElementById('excluir-dialog');
    const confirmacao = document.getElementById('excluir-confirmacao');
    const confirmar = document.getElementById('excluir-confirmar');
    const copias = new Map();
    let arquivados = false, ocupado = false, exclusao = null, retorno = null;
    const nome = p => p.dados.nomeExame || p.rascunho?.valores?.nome_exame || 'Projeto em preparação';
    async function executar(acao) {
        if (ocupado) return;
        ocupado = true;
        try { await acao(); }
        catch (erro) {
            const destino = dialog.open ? document.getElementById('excluir-erro') : status;
            destino.textContent = erro.message || 'Não foi possível salvar. Os dados foram preservados; tente novamente.';
        } finally { ocupado = false; confirmar.disabled = confirmacao.value.trim() !== 'EXCLUIR'; }
    }
    function devolverFoco(projeto, acao) {
        const alvo = [...document.querySelectorAll('[data-acao]')].find(b=>b.dataset.projeto===projeto && b.dataset.acao===acao);
        (alvo || document.getElementById(arquivados ? 'projetos-arquivados' : 'projetos-ativos')).focus({preventScroll:true});
    }
    function renderizar(mensagem = '') {
        const foco = document.activeElement?.dataset;
        const projetos = window.ProjetosStore.listar();
        const sessoes = window.EstudoStore.listarSessoes();
        for (const [id,valor] of [['projetos-ativos',false],['projetos-arquivados',true]]) {
            const botao = document.getElementById(id);
            botao.textContent = `${valor ? 'Arquivados' : 'Ativos'} (${projetos.filter(p=>Boolean(p.arquivado)===valor).length})`;
            botao.setAttribute('aria-pressed',String(arquivados===valor));
        }
        const visiveis = projetos.filter(p=>Boolean(p.arquivado)===arquivados);
        document.getElementById('lista-projetos').replaceChildren(...visiveis.map(projeto => {
            const card = document.createElement('article'); card.dataset.projetoId = projeto.id;
            const titulo = document.createElement('h2'); titulo.textContent = nome(projeto);
            const preparando = Boolean(projeto.rascunho) || !projeto.materias.length || !projeto.dados.minutosPorDia;
            const detalhe = document.createElement('p');
            detalhe.textContent = preparando ? 'Preparação em andamento' : `${projeto.dados.dataInicioF} — ${projeto.dados.dataFinalF}`;
            card.append(titulo, detalhe);
            if (!preparando) {
                const progresso = window.EstudoStore.calcularProgressoPlano({ dados: projeto.dados, materiaDoDia: projeto.plano,
                    sessoesProjeto: sessoes.filter(s => s.projetoId === projeto.dados.projetoId), distribuicaoMaterias: projeto.distribuicao });
                const rotulo = document.createElement('p'); rotulo.textContent = `${Math.round(progresso.percentualGeral)}% do estudo planejado concluído`;
                const barra = document.createElement('progress'); barra.max = 100; barra.value = progresso.percentualGeral;
                barra.setAttribute('aria-label', `Progresso de ${titulo.textContent}`); card.append(rotulo, barra);
            }
            const acoes = document.createElement('div'); acoes.className = 'home-acoes';
            function botao(acao, texto, callback) {
                const b = document.createElement('button'); b.type='button'; b.textContent=texto;
                b.dataset.acao=acao; b.dataset.projeto=projeto.id; b.setAttribute('aria-label',`${texto}: ${titulo.textContent}`);
                b.addEventListener('click',()=>executar(()=>callback(b))); acoes.append(b); return b;
            }
            if (!projeto.arquivado) {
                const abrir=botao('abrir',preparando?'Continuar preparação':'Abrir projeto',()=>{
                    window.ProjetosStore.selecionar(projeto.id); location.assign(preparando?'index.html?editar=1':'agenda.html');
                });
                abrir.dataset.projetoAbrir=projeto.id;
            }
            botao('arquivo',projeto.arquivado?'Restaurar':'Arquivar',async()=>{
                await window.ProjetosStore[projeto.arquivado?'restaurar':'arquivar'](projeto.id);
                renderizar(projeto.arquivado?'Projeto restaurado nos ativos.':'Projeto movido para Arquivados.');
                devolverFoco(projeto.id,'arquivo');
            });
            botao('duplicar','Duplicar',async()=>{
                if (!copias.has(projeto.id)) copias.set(projeto.id,`projeto-${crypto.randomUUID()}`);
                const id=await window.ProjetosStore.duplicar(projeto.id,copias.get(projeto.id));
                window.ProjetosStore.selecionar(id); location.assign('index.html?editar=1');
            });
            botao('excluir','Excluir',b=>{
                exclusao={id:projeto.id,nome:nome(projeto)}; retorno=b;
                confirmacao.value=''; confirmar.disabled=true;
                document.getElementById('excluir-erro').textContent='';
                document.getElementById('excluir-descricao').textContent=`Projeto: “${nome(projeto)}”. ${detalhe.textContent}`;
                dialog.showModal(); document.getElementById('excluir-cancelar').focus();
            }).className='acao-perigosa';
            card.append(acoes); return card;
        }));
        status.textContent = mensagem || (visiveis.length ? '' : arquivados ? 'Nenhum projeto arquivado.' : 'Nenhum projeto ativo. Crie um novo ou restaure um arquivado.');
        if (!dialog.open && foco?.projeto) devolverFoco(foco.projeto,foco.acao);
    }
    confirmacao.addEventListener('input',()=>{ confirmar.disabled=ocupado || confirmacao.value.trim()!=='EXCLUIR'; });
    document.getElementById('excluir-cancelar').addEventListener('click',()=>{if(!ocupado) dialog.close();});
    dialog.addEventListener('cancel',e=>{ if(ocupado) e.preventDefault(); });
    dialog.addEventListener('close',()=>{
        if(retorno?.isConnected) retorno.focus();
        else if(exclusao) devolverFoco(exclusao.id,'excluir');
        exclusao=null;
    });
    confirmar.addEventListener('click',()=>executar(async()=>{
        if (!exclusao || confirmacao.value.trim()!=='EXCLUIR') return;
        confirmar.disabled=true;
        const alvo=window.ProjetosStore.listar().find(p=>p.id===exclusao.id);
        if (!alvo || nome(alvo)!==exclusao.nome) throw new Error('O projeto mudou em outra aba. Cancele e confira a lista antes de excluir.');
        await window.ProjetosStore.excluir(exclusao.id);
        dialog.close(); renderizar('Projeto excluído. Histórico de estudo preservado.');
    }));
    for(const [id,valor] of [['projetos-ativos',false],['projetos-arquivados',true]]) document.getElementById(id).addEventListener('click',()=>executar(()=>{arquivados=valor;renderizar();}));
    document.getElementById('novo-projeto').addEventListener('click',()=>executar(()=>{
        window.ProjetosStore.criar(); location.assign('index.html?novo=1');
    }));
    window.addEventListener('storage',()=>{try{renderizar();}catch(erro){status.textContent=erro.message;}});
    executar(()=>renderizar());
})();
