/* O carregamento inicial aguarda o índice offline antes de executar os stores. */
(function(){
'use strict';
window.GrimorioPronto=false;
const iniciar=async()=>{
 const protecao=document.createElement('div');protecao.id='grimorio-carregando';protecao.setAttribute('role','status');protecao.textContent='Carregando seus projetos…';
 Object.assign(protecao.style,{position:'fixed',inset:'0',zIndex:'99999',background:'var(--pixel-surface)',color:'var(--texto-comum, var(--pixel-ink))',padding:'2rem'});document.body.append(protecao);
 document.body.inert=true;
 try{
  await window.ProjetosOffline.pronta;
  for(const original of document.querySelectorAll('script[type="application/grimorio"]')){
   const s=document.createElement('script');if(original.src){s.src=original.src;await new Promise((resolve,reject)=>{s.onload=resolve;s.onerror=()=>reject(Error('Não foi possível carregar '+original.src));document.head.append(s);});}
   else{s.textContent=original.textContent;document.head.append(s);}
   if(window.BackupLocal?.bloqueado){window.__liberarOfflineLease?.();document.body.inert=false;protecao.remove();window.GrimorioPronto=true;return;}
  }
  document.body.inert=false;protecao.remove();window.GrimorioPronto=true;
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await window.BackupLocal?.pronta;window.__liberarOfflineLease?.();
 }catch(e){window.__liberarOfflineLease?.();document.body.inert=false;protecao.textContent='Não foi possível carregar o armazenamento offline. Seus dados não foram apagados. Recarregue para tentar novamente. '+e.message;if(typeof window.showDirectoryPicker==='function'){const b=document.createElement('button');b.type='button';b.textContent='Autorizar pasta de backup e tentar recuperar';b.onclick=()=>window.ProjetosOffline.autorizarPasta().catch(e=>{protecao.append(document.createTextNode(' '+e.message));});protecao.append(document.createElement('br'),b);}console.error(e);}
};
document.addEventListener('DOMContentLoaded',iniciar,{once:true});
})();
