/* Navegação e consulta da Jornada, sem alterações no plano ou na persistência. */
(function(){
'use strict';
let pagina=1;const TAMANHO=10,$=id=>document.getElementById(id);
const normalizar=texto=>texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const criar=(tag,texto)=>{const e=document.createElement(tag);e.textContent=texto;return e;};
function atualizar(){
 const dialogo=$('historico-dialog');if(!dialogo?.open)return;
 try{
  const busca=normalizar($('historico-busca').value.trim()),tipo=$('historico-tipo').value;
  const projeto=$('historico-projeto').value==='atual'?window.ProjetosStore.idAtual():null;
  const nomes=new Map(window.ProjetosStore.listar().map(p=>[p.id,p.dados.nomeExame||p.rascunho?.valores?.nome_exame||'Projeto em preparação']));
  const sessoes=window.EstudoStore.listarSessoes().filter(s=>(!busca||normalizar(s.materia).includes(busca))&&(!projeto||s.projetoId===projeto)&&(!tipo||(tipo==='extra'?s.blocoExtraId:s.tipo===tipo)))
   .sort((a,b)=>Date.parse(b.inicio)-Date.parse(a.inicio)||String(b.id).localeCompare(String(a.id)));
  const paginas=Math.max(1,Math.ceil(sessoes.length/TAMANHO));pagina=Math.max(1,Math.min(pagina,paginas));
  const corpo=document.createDocumentFragment();
  for(const s of sessoes.slice((pagina-1)*TAMANHO,pagina*TAMANHO)){
   const tr=document.createElement('tr');tr.dataset.sessaoId=s.id;
   const inicio=new Date(s.inicio),dia=s.dataEstudo?s.dataEstudo.split('-').reverse().join('/'):inicio.toLocaleDateString('pt-BR');
   tr.append(criar('td',dia),criar('td',s.precisaoInicio==='dia'?'Não informado':inicio.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})));
   const materia=criar('td',s.materia);materia.append(criar('small',(s.tipo==='revisao'?(s.blocoExtraId?'Revisão de extra':'Revisão'):s.blocoExtraId?'Estudo extra':'Estudo')+' · '+(nomes.get(s.projetoId)||'Projeto removido')));
   const segundos=s.duracaoSegundos;const tempo=[Math.floor(segundos/3600)?Math.floor(segundos/3600)+'h':'',Math.floor(segundos%3600/60)?Math.floor(segundos%3600/60)+'min':'',segundos%60?segundos%60+'s':''].filter(Boolean).join(' ')||'0s';
   tr.append(materia,criar('td',tempo));const acao=document.createElement('td'),botao=criar('button','Excluir');botao.type='button';botao.dataset.excluirSessao=s.id;botao.setAttribute('aria-label','Excluir registro de '+s.materia+' em '+dia);
   botao.addEventListener('click',()=>{
    if(!confirm('Excluir este registro de '+s.materia+' ('+tempo+')? O tempo, o XP e o progresso correspondentes serão recalculados.'))return;
    botao.disabled=true;
    try{window.EstudoStore.excluirSessao(s.id);atualizar();($('sessoes-estudo-body').querySelector('button')||$('historico-busca')).focus();}
    catch(e){$('historico-resumo').textContent='Não foi possível excluir o registro. '+e.message;botao.disabled=false;}
   });acao.append(botao);tr.append(acao);[...tr.children].forEach((td,i)=>{td.dataset.rotulo=['Data','Hora','Matéria','Tempo estudado','Ações'][i];});corpo.append(tr);
  }
  if(!sessoes.length){const tr=document.createElement('tr'),td=criar('td','Nenhum registro encontrado.');td.colSpan=5;tr.append(td);corpo.append(tr);}
  $('sessoes-estudo-body').replaceChildren(corpo);
  $('historico-resumo').textContent=sessoes.length?`${(pagina-1)*TAMANHO+1}–${Math.min(pagina*TAMANHO,sessoes.length)} de ${sessoes.length} registros`:'Nenhum registro para os filtros escolhidos.';
  $('historico-pagina').textContent=`Página ${pagina} de ${paginas}`;$('historico-anterior').disabled=pagina===1;$('historico-proximo').disabled=pagina===paginas;
 }catch(e){$('historico-resumo').textContent='Não foi possível consultar o histórico. Seus dados foram preservados. '+e.message;}
}
window.HistoricoJornada={atualizar};
document.addEventListener('DOMContentLoaded',()=>{
 const dialogo=$('historico-dialog');if(!dialogo)return;
 $('abrir-historico').addEventListener('click',()=>{dialogo.showModal();atualizar();($('historico-busca').checkVisibility()?$('historico-busca'):$('fechar-historico')).focus();});
 $('fechar-historico').addEventListener('click',()=>dialogo.close());dialogo.addEventListener('close',()=>($('abrir-historico').checkVisibility()?$('abrir-historico'):$('jornada-menu-aberto').querySelector('summary')).focus());
 $('historico-filtros').addEventListener('submit',e=>e.preventDefault());
 for(const id of ['historico-busca','historico-tipo','historico-projeto'])$(id).addEventListener(id==='historico-busca'?'input':'change',()=>{pagina=1;atualizar();});
 $('historico-anterior').addEventListener('click',()=>{pagina--;atualizar();});$('historico-proximo').addEventListener('click',()=>{pagina++;atualizar();});
 if(!window.CronometroEstudos)for(const evento of ['estudo:registrado','estudo:excluido','storage'])window.addEventListener(evento,atualizar);
 const praticas=$('praticas-painel-dialog');
 $('abrir-praticas')?.addEventListener('click',()=>{praticas.showModal();$('fechar-praticas-painel').focus();});
 $('fechar-praticas-painel')?.addEventListener('click',()=>praticas.close());praticas?.addEventListener('close',()=>($('abrir-praticas').checkVisibility()?$('abrir-praticas'):$('jornada-menu-aberto').querySelector('summary')).focus());
});
})();
