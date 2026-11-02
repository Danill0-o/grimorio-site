/* Sidebar compartilhada: atalhos de projeto apenas na Jornada e no Calendário. */
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
 const ajudaRevisoes=document.getElementById('revisoes-status'),infoRevisoes=document.querySelector('.revisoes-info');
 if(ajudaRevisoes&&infoRevisoes){
  const posicionar=()=>{if(!ajudaRevisoes.matches(':popover-open'))return;const r=infoRevisoes.getBoundingClientRect();ajudaRevisoes.style.left=Math.max(8,Math.min(r.right-ajudaRevisoes.offsetWidth,innerWidth-ajudaRevisoes.offsetWidth-8))+'px';ajudaRevisoes.style.top=Math.max(8,r.bottom+8+ajudaRevisoes.offsetHeight>innerHeight?r.top-ajudaRevisoes.offsetHeight-8:r.bottom+8)+'px';};
  ajudaRevisoes.addEventListener('toggle',posicionar);addEventListener('resize',posicionar);addEventListener('scroll',posicionar,{passive:true});
 }
 if(['agenda.html','calendario.html'].includes(pagina)&&!window.ProjetosStore?.temAtual()){location.replace('home.html');return;}
 if(!window.ProjetosStore?.temAtual())document.querySelectorAll('[data-menu-projeto]').forEach(e=>e.remove());
 const nav=menu.querySelector('nav');
 if(pagina==='pesomateria.html'&&window.ProjetosStore?.temAtual()){
  const editar=document.createElement('a');editar.href='index.html?editar=1';editar.textContent='Editar projeto';nav.append(editar);
 }
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
   const cores=()=>{const grafico=window.Chart?.getChart('graficoPizza');if(!grafico)return;const cor=getComputedStyle(document.documentElement).getPropertyValue('--pixel-ink').trim();grafico.options.plugins.title.color=cor;grafico.options.plugins.legend.labels.color=cor;grafico.update('none');};cores();new MutationObserver(cores).observe(document.documentElement,{attributes:true,attributeFilter:['data-tema-pixel']});
  }
 });
 const ordem=e=>['abrir-praticas','atalho-praticas'].includes(e.id)?4:e.id==='abrir-historico'?8:e.id==='jornada-temas'?9:({'perfil.html':0,'home.html':1,'agenda.html':2,'calendario.html':3,'pesomateria.html':5,'index.html':6,'materias.html':7}[e.getAttribute('href')?.split('?')[0]]??-1);
 if(nav)[...nav.children].sort((a,b)=>ordem(a)-ordem(b)).forEach(e=>nav.append(e));
 let topo=document.getElementById('calendario-topo');
 if(!topo&&['perfil.html','materias.html'].includes(pagina)){topo=document.createElement('button');topo.type='button';topo.id='pagina-topo';topo.append(window.IconesPixel.criar('cima'));topo.setAttribute('aria-label','Voltar ao topo');topo.title='Voltar ao topo';document.body.append(topo);}
 if(topo){topo.classList.add('voltar-topo');const atualizarTopo=()=>{topo.hidden=scrollY<Math.max(400,innerHeight*.6);};addEventListener('scroll',atualizarTopo,{passive:true});addEventListener('resize',atualizarTopo);atualizarTopo();topo.addEventListener('click',()=>{scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});const titulo=document.querySelector('main h1, header h1');if(titulo){titulo.tabIndex=-1;titulo.focus({preventScroll:true});}});}
 const media=matchMedia('(min-width:1100px)');const ajustar=()=>{menu.open=media.matches;const filtros=document.getElementById('historico-modal-filtros-painel');if(filtros)filtros.open=media.matches;};ajustar();media.addEventListener('change',ajustar);
 for(const link of menu.querySelectorAll('a[href]'))if(new URL(link.href).pathname===location.pathname)link.setAttribute('aria-current','page');
});
