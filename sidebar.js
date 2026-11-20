/* Sidebar compartilhada: atalhos globais e contexto do projeto ativo. */
window.criarBotaoExcluirMateria = (id, nome) => {
 const botao=document.createElement('button');botao.type='button';botao.className='materia-excluir-icone';botao.title='Excluir matéria';botao.setAttribute('aria-label','Excluir permanentemente '+nome);
 const icone=document.createElement('img');icone.src='img/icons/lixeira-magnific.png';icone.alt='';icone.width=18;icone.height=18;botao.append(icone);
 botao.addEventListener('click',()=>{
  const dialog=document.createElement('dialog');dialog.id='excluir-materia-dialog';dialog.setAttribute('aria-labelledby','excluir-materia-titulo');dialog.setAttribute('aria-describedby','excluir-materia-descricao');
  dialog.innerHTML='<h2 id="excluir-materia-titulo">Excluir matéria?</h2><p id="excluir-materia-descricao"></p><p>O card e a opção no catálogo serão removidos. O histórico e todo o XP global serão preservados. Esta ação não pode ser desfeita. Projetos afetados exigirão edição e um novo planejamento sem esta matéria. Feche as abas de cronômetro antes de continuar.</p><label for="excluir-materia-confirmacao">Digite EXCLUIR para confirmar</label><input class="form-control" id="excluir-materia-confirmacao" autocomplete="off" spellcheck="false"><p id="excluir-materia-erro" role="alert"></p><div class="exclusao-acoes"><button type="button" data-cancelar autofocus>Cancelar</button><button type="button" class="acao-perigosa" data-confirmar disabled>Excluir definitivamente</button></div>';
  dialog.querySelector('#excluir-materia-descricao').textContent='Matéria: “'+nome+'”.';
  const entrada=dialog.querySelector('input'),confirmar=dialog.querySelector('[data-confirmar]'),cancelar=dialog.querySelector('[data-cancelar]');let salvando=false;
  entrada.addEventListener('input',()=>{confirmar.disabled=entrada.value.trim()!=='EXCLUIR';});
  cancelar.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',e=>{if(salvando)e.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.remove();if(botao.isConnected)botao.focus();else{const titulo=document.querySelector('main h1,header h1');if(titulo){titulo.tabIndex=-1;titulo.focus();}}});
  confirmar.addEventListener('click',async()=>{
   if(salvando||entrada.value.trim()!=='EXCLUIR')return;salvando=true;confirmar.disabled=true;cancelar.disabled=true;entrada.disabled=true;
   try{await MateriasStore.excluirMateriaGlobal(id);const aviso=document.querySelector('#catalogo-nova-global-status,#dominio-status');if(aviso)aviso.textContent='Matéria excluída. Histórico e XP preservados. Edite os projetos afetados antes de continuar.';dialog.close();}
   catch(e){dialog.querySelector('#excluir-materia-erro').textContent=e.message;}
   finally{salvando=false;entrada.disabled=false;cancelar.disabled=false;confirmar.disabled=entrada.value.trim()!=='EXCLUIR';}
  });document.body.append(dialog);dialog.showModal();cancelar.focus();
 });return botao;
};
document.addEventListener('DOMContentLoaded',()=>{
 const menu=document.getElementById('jornada-menu-aberto');if(!menu)return;
 const pagina=location.pathname.split('/').pop();
 if(['agenda.html','calendario.html','pesomateria.html'].includes(pagina)&&window.ProjetosStore?.temAtual()&&window.MateriasStore?.projetoPrecisaReplanejar(window.ProjetosStore.idAtual())){location.replace('index.html?editar=1');return;}
 window.addEventListener('storage',event=>{if(event.key==='materiasDominioV1'&&['agenda.html','calendario.html','pesomateria.html'].includes(pagina)&&window.MateriasStore?.projetoPrecisaReplanejar(window.ProjetosStore.idAtual()))location.replace('index.html?editar=1');});
 if(['agenda.html','calendario.html'].includes(pagina)&&!window.ProjetosStore?.temAtual()){location.replace('home.html');return;}
 const nav=menu.querySelector('nav');
 const lerJson=chave=>{try{return JSON.parse(localStorage.getItem(chave)||'null');}catch(_){return null;}};
 const obterProjetoAtivoComPlano=()=>{
  if(!window.ProjetosStore?.temAtual?.())return null;
  if(pagina==='index.html'&&/novo/.test(location.search))return null;
  const id=window.ProjetosStore.idAtual();if(!id)return null;
  const registro=lerJson(`projetoV1:${id}:registro`);
  if(!registro||registro.removido||registro.arquivado)return null;
  const plano=lerJson(`projetoV1:${id}:materiaDoDia`),dados=lerJson(`projetoV1:${id}:dadosExame`),materias=lerJson(`projetoV1:${id}:objetosNormalizados`),rascunho=lerJson(`projetoV1:${id}:wizardProjeto`);
  const temPlano=Boolean(plano&&typeof plano==='object'&&Object.keys(plano).length>0)||(Number(dados?.minutosPorDia)>0&&Array.isArray(materias)&&materias.length>0&&!rascunho);
  return temPlano?id:null;
 };
 const criarLinkProjeto=(href,texto,id)=>{
  const link=document.createElement('a');if(id)link.id=id;
  link.setAttribute('data-menu-projeto','');link.href=href;link.textContent=texto;return link;
 };
 const ordem=e=>['abrir-praticas','atalho-praticas'].includes(e.id)?4:['reagendamento-jornada-abrir','atalho-reorganizar'].includes(e.id)?4.5:e.id==='jornada-temas'?9:({'perfil.html':0,'conquistas.html':0.5,'home.html':1,'agenda.html':2,'calendario.html':3,'pesomateria.html':5,'index.html':6,'materias.html':7,'historico.html':8}[e.getAttribute('href')?.split('?')[0]]??-1);
 const atualizarAriaCurrent=()=>{
  for(const link of menu.querySelectorAll('a[href]'))link.removeAttribute('aria-current');
  for(const link of menu.querySelectorAll('a[href]')){
   const url=new URL(link.href,location.href);
   if(url.searchParams.has('praticas')||url.searchParams.has('reorganizar'))continue;
   if(url.pathname!==location.pathname)continue;
   if(url.pathname.endsWith('/index.html')){if(url.search==='?editar=1'&&/editar/.test(location.search))link.setAttribute('aria-current','page');continue;}
   link.setAttribute('aria-current','page');
  }
 };
 const sincronizarMenuProjeto=()=>{
  if(!nav)return;
  if(!obterProjetoAtivoComPlano())nav.querySelectorAll('[data-menu-projeto]').forEach(e=>e.remove());
  else {
   if(!nav.querySelector('a[href="agenda.html"]'))nav.append(criarLinkProjeto('agenda.html','Jornada'));
   if(!nav.querySelector('a[href="calendario.html"]'))nav.append(criarLinkProjeto('calendario.html','Calendário'));
   if(!nav.querySelector('#abrir-praticas, #atalho-praticas'))nav.append(criarLinkProjeto('agenda.html?praticas=1','Atividades práticas','atalho-praticas'));
   if(!nav.querySelector('#reagendamento-jornada-abrir, #atalho-reorganizar'))nav.append(criarLinkProjeto('agenda.html?reorganizar=1','Reorganizar blocos de estudos','atalho-reorganizar'));
   if(!nav.querySelector('a[href="pesomateria.html"]'))nav.append(criarLinkProjeto('pesomateria.html','Ver planejamento'));
   if(!nav.querySelector('a[href="index.html?editar=1"]'))nav.append(criarLinkProjeto('index.html?editar=1','Editar projeto'));
  }
  const filhos=[...nav.children],ordenados=[...filhos].sort((a,b)=>ordem(a)-ordem(b));
  if(ordenados.some((el,i)=>el!==filhos[i]))ordenados.forEach(e=>nav.append(e));
  atualizarAriaCurrent();
 };
 sincronizarMenuProjeto();
 window.addEventListener('projetos:alterados',sincronizarMenuProjeto);
 window.addEventListener('storage',event=>{if(!event.key||event.key==='projetoSelecionadoV1'||/^projetoV1:[^:]+:(registro|materiaDoDia|dadosExame|objetosNormalizados|wizardProjeto)$/.test(event.key))sincronizarMenuProjeto();});
 queueMicrotask(()=>{
  let rodape=document.querySelector('.site-rodape');
  if(!rodape){rodape=document.createElement('footer');rodape.className='site-rodape';rodape.innerHTML='<img class="site-rodape-borda" src="img/assets/Divider.png" alt="" width="1786" height="236" loading="lazy"><p><strong>GRIMÓRIO</strong></p><p><small>Cada dia de estudo escreve um novo capítulo.</small></p>';}
  rodape.querySelector('.credito-lixeira')?.remove();document.body.append(rodape);
  document.querySelector('.calendario-ajuda')?.remove();
  const dados=JSON.parse((window.ProjetoStorage||localStorage).getItem('dadosExame')||'null');
  if(dados)for(const painel of document.querySelectorAll('[data-projeto-resumo]')){
   const lista=painel.querySelector('dl');if(lista){const linha=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent='Dias de estudo';dd.textContent=(dados.listaDiaDaSemana||[]).map(d=>d.toLocaleUpperCase('pt-BR')).join(' · ');linha.append(dt,dd);lista.append(linha);}
  }
  if(pagina==='pesomateria.html'){
   const metas=JSON.parse((window.ProjetoStorage||localStorage).getItem('lista_distribuicao_materias')||'[]');
   const materias=JSON.parse((window.ProjetoStorage||localStorage).getItem('objetosNormalizados')||'[]');
   document.querySelectorAll('#table-body-peso tr').forEach((tr,i)=>{const percentual=tr.cells[3];if(percentual)percentual.textContent=percentual.textContent.replace(/%/g,'')+'%';const td=document.createElement('td');const meta=metas.find(m=>m.projetoMateriaId===materias[i]?.projetoMateriaId);td.textContent=meta?(Number(meta.Materia_distribuida)/60).toLocaleString('pt-BR',{maximumFractionDigits:2}):'—';tr.append(td);});
  }
 });
 let topo=document.getElementById('calendario-topo');
 if(!topo&&['agenda.html','index.html','perfil.html','conquistas.html','materias.html','historico.html'].includes(pagina)){topo=document.createElement('button');topo.type='button';topo.id='pagina-topo';topo.append(window.IconesPixel.criar('cima'));topo.setAttribute('aria-label','Voltar ao topo');topo.title='Voltar ao topo';document.body.append(topo);}
 if(topo){topo.classList.add('voltar-topo');const atualizarTopo=()=>{topo.hidden=scrollY<Math.max(400,innerHeight*.6);};addEventListener('scroll',atualizarTopo,{passive:true});addEventListener('resize',atualizarTopo);atualizarTopo();topo.addEventListener('click',()=>{scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});const titulo=document.querySelector('main h1, header h1');if(titulo){titulo.tabIndex=-1;titulo.focus({preventScroll:true});}});}
 const media=matchMedia('(min-width:1100px)');const ajustar=()=>{menu.open=media.matches;};ajustar();media.addEventListener('change',ajustar);
});
