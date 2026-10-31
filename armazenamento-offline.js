/* Persistência offline: arquivos verificados + snapshots em IndexedDB; a fachada
   síncrona conserva o contrato dos stores e nunca escreve fatos só em memória. */
(function () {
'use strict';
const nativo=window.localStorage, CHAVE='grimorioOfflineV1', DB='grimorioProjetosOfflineV1';
const APAGADA='grimorioOfflineApagadaV1:';
const marcador=k=>APAGADA+encodeURIComponent(k);
const caches=new Map(); let configuracao, banco, ocupado=false, pronta;
const dono=k=>/^projetoV1:([^:]+):/.exec(k)?.[1] || /^praticasProjetoV1:(.+)$/.exec(k)?.[1] || null;
const lerConfig=()=>JSON.parse(nativo.getItem(CHAVE)||'{"versao":1,"projetos":{},"apagadas":[]}');
const iguais=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function validarMapa(id,mapa) {
 if(!mapa||typeof mapa!=='object'||Array.isArray(mapa))throw Error('Snapshot offline inválido.');
 for(const [k,v] of Object.entries(mapa)) {if(dono(k)!==id||typeof v!=='string')throw Error('Vínculo de snapshot offline inválido.');JSON.parse(v);}
 return mapa;
}
function atualizarConfig(proxima) {nativo.setItem(CHAVE,JSON.stringify(proxima));configuracao=proxima;}
function base(k) {configuracao=lerConfig();return configuracao.projetos[dono(k)]?caches.get(dono(k))?.dados[k]??null:null;}
function removida(k){configuracao=lerConfig();return nativo.getItem(marcador(k))!==null||configuracao.apagadas.includes(k);}
function nomes(){configuracao=lerConfig();return [...new Set([...Object.keys(nativo).filter(k=>k!==CHAVE&&!k.startsWith(APAGADA)),...[...caches.values()].filter(s=>configuracao.projetos[s.projetoId]).flatMap(s=>Object.keys(s.dados))])].filter(k=>!removida(k));}
const fachada={
 getItem(k){k=String(k);if(k===CHAVE)return null;return removida(k)?null:nativo.getItem(k)??base(k);},
 setItem(k,v){k=String(k);v=String(v);if(k===CHAVE)throw Error('Chave interna reservada.');nativo.setItem(k,v);nativo.removeItem(marcador(k));if(configuracao.apagadas.includes(k))atualizarConfig({...configuracao,apagadas:configuracao.apagadas.filter(x=>x!==k)});},
 removeItem(k){k=String(k);if(base(k)!==null&&!removida(k))nativo.setItem(marcador(k),'1');nativo.removeItem(k);},
 clear(){nativo.clear();caches.clear();configuracao=lerConfig();},
 key(i){return nomes()[Number(i)]??null;},get length(){return nomes().length;}
};
const proxy=new Proxy(fachada,{
 ownKeys:nomes,
 has(t,k){return k in t||typeof k==='string'&&nomes().includes(k);},
 getOwnPropertyDescriptor(t,k){if(nomes().includes(k))return {enumerable:true,configurable:true,get:()=>fachada.getItem(k)};return Reflect.getOwnPropertyDescriptor(t,k);},
 get(t,k){return k in t?Reflect.get(t,k):typeof k==='string'?fachada.getItem(k):undefined;},
 set(t,k,v){fachada.setItem(k,v);return true;},deleteProperty(t,k){fachada.removeItem(k);return true;}
});
function abrir(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function obter(chave){return new Promise((resolve,reject)=>{const tx=banco.transaction('snapshots','readonly'),r=tx.objectStore('snapshots').get(chave);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function guardar(chave,snapshot){return new Promise((resolve,reject)=>{const tx=banco.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(snapshot,chave);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Gravação offline interrompida.'));tx.onerror=()=>{};});}
async function hash(texto){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(texto));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function conferir(snapshot,id){if(!snapshot||snapshot.projetoId!==id||snapshot.hash!==await hash(JSON.stringify(snapshot.dados)))throw Error('A cópia local do projeto não passou na verificação. Seus arquivos foram preservados.');validarMapa(id,snapshot.dados);return snapshot;}
function snapshot(id){return Object.fromEntries(nomes().filter(k=>dono(k)===id).sort().map(k=>[k,fachada.getItem(k)]));}
function verificarPendencias(id){
 const timer=window.CronometroEstudos?.obterEstado();if(window.ProjetosStore?.idAtual()===id&&timer?.estado&&timer.estado!=='ocioso')throw Error('Registre ou zere o cronômetro antes do backup offline.');
 for(const k of nomes()){
  if(k===`cronometroV1:${id}`||k==='cronometroRegistroV1'||k==='projetosTransacaoV1'||k===`projetosTransacaoV2:${id}`||k===`projetoV1:${id}:revisoesTransacaoV1`)throw Error('Registre ou zere o cronômetro e recupere as operações pendentes antes de descarregar o projeto.');
  if(k.startsWith(`projetoV1:${id}:estudoExtraV1:`)&&JSON.parse(fachada.getItem(k))?.registroManualPendente&&!window.EstudoExtra?.excluido(JSON.parse(fachada.getItem(k)).blocoId,id))throw Error('Há registro manual pendente de recuperação.');
 }
}
async function lerArquivo(pasta,nome){return await (await (await pasta.getFileHandle(nome)).getFile()).text();}
async function escrever(pasta,nome,texto){const h=await pasta.getFileHandle(nome,{create:true});const w=await h.createWritable();try{await w.write(texto);await w.close();}catch(e){try{await w.abort();}catch(_){}throw e;}if(await lerArquivo(pasta,nome)!==texto)throw Error('Não foi possível conferir o arquivo gravado.');}
async function indice(pasta,id){try{const r=JSON.parse(await lerArquivo(pasta,`grimorio-${id}-indice.json`));if(r.versao!==1||r.projetoId!==id||!Array.isArray(r.geracoes)||r.geracoes.some(g=>!new RegExp('^grimorio-'+id+'-[a-z0-9-]+\\.json$').test(g.arquivo)||typeof g.hash!=='string'))throw Error('Índice de backups inválido.');return r;}catch(e){if(e.name==='NotFoundError')return {versao:1,projetoId:id,geracoes:[]};throw e;}}
async function pastaPersistida(){return new Promise((resolve,reject)=>{const r=indexedDB.open('grimorioBackupPastaV1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('diretorio'))r.result.createObjectStore('diretorio');};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('diretorio','readonly'),q=tx.objectStore('diretorio').get('pastaFixa');q.onsuccess=()=>{resolve(q.result||null);db.close();};q.onerror=()=>reject(q.error);};});}
async function permissao(pasta){if(pasta.queryPermission){let p=await pasta.queryPermission({mode:'readwrite'});if(p!=='granted')p=await pasta.requestPermission({mode:'readwrite'});if(p!=='granted')throw Error('Autorize a pasta de backup para salvar e descarregar projetos.');}}
async function salvarInterno(id,descarregar){
 const pasta=await window.BackupLocal.obterPastaSalva();if(!pasta)return {modo:'sem-pasta',descarregado:false};
 verificarPendencias(id);await permissao(pasta);
 const dados=snapshot(id);if(!Object.keys(dados).length)return {modo:'vazio',descarregado:false};
 const registro=JSON.parse(dados[`projetoV1:${id}:registro`]||'null');if(!registro||registro.removido)throw Error('Projeto indisponível para backup offline.');
 const backup=window.BackupLocal.exportar();window.BackupLocal.validarBackup(backup);
 const assinatura=await hash(JSON.stringify(backup.armazenamento.localStorage));
 let idx=await indice(pasta,id), ultima=idx.geracoes[0];const anteriores=[...idx.geracoes];
 // Cada geração contém um backup completo restaurável; o projeto tem seu próprio
 // índice e seu snapshot granular. Compartilhados nunca são substituídos na troca.
 let arquivo,conteudo;
 if(ultima?.assinatura===assinatura){arquivo=ultima.arquivo;conteudo=await lerArquivo(pasta,arquivo);if(await hash(conteudo)!==ultima.hash)throw Error('Backup atual alterado ou corrompido.');}
 else {
  arquivo=`grimorio-${id}-${crypto.randomUUID()}.json`;conteudo=JSON.stringify(backup);
  await escrever(pasta,arquivo,conteudo);
  const geracao={arquivo,hash:await hash(conteudo),assinatura,salvoEm:backup.exportadoEm};
  const proximo={versao:1,projetoId:id,geracoes:[geracao,...idx.geracoes].slice(0,3)};
  await escrever(pasta,`grimorio-${id}-indice.json`,JSON.stringify(proximo));
  idx=proximo;
 }
 const backupHash=await hash(conteudo);
 const revisao=`${id}:${crypto.randomUUID()}`,s={projetoId:id,dados,hash:await hash(JSON.stringify(dados)),arquivo};
 await guardar(revisao,s);await conferir(await obter(revisao),id);
 verificarPendencias(id);
 // O lock exclusivo garante que nenhuma outra aba escreva entre captura/remoção.
 if(!iguais(snapshot(id),dados))throw Error('Projeto mudou durante o backup. Nenhum dado foi descarregado.');
 atualizarConfig({versao:1,projetos:{...configuracao.projetos,[id]:{revisao,arquivo,hash:s.hash,backupHash}},apagadas:configuracao.apagadas.filter(k=>dono(k)!==id)});
 caches.set(id,s);
 for(const k of Object.keys(nativo))if(k.startsWith(APAGADA)&&dono(decodeURIComponent(k.slice(APAGADA.length)))===id)nativo.removeItem(k);
 if(descarregar)for(const k of Object.keys(dados))nativo.removeItem(k);
 // Limpeza somente de gerações não referenciadas, após todos os commits.
 if(pasta.removeEntry)for(const g of anteriores)if(!idx.geracoes.some(atual=>atual.arquivo===g.arquivo))await pasta.removeEntry(g.arquivo);
 await new Promise((resolve,reject)=>{const tx=banco.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots'),q=store.getAllKeys();q.onsuccess=()=>{const referencias=new Set(Object.values(configuracao.projetos).map(r=>r.revisao||r));for(const k of q.result)if(!referencias.has(k))store.delete(k);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 return {modo:'pasta',descarregado:descarregar,geracoes:idx.geracoes.length};
}
async function salvar(id=window.ProjetosStore?.idAtual(),{descarregar=false}={}){
 await pronta;if(!id)return {modo:'sem-projeto'};if(!await window.BackupLocal?.obterPastaSalva())return {modo:'sem-pasta',descarregado:false};if(ocupado)throw Error('Aguarde o backup do projeto.');
 if(!window.BackupLocal?.executarExclusivo)throw Error('Camada de backup indisponível.');
 ocupado=true;try{return await window.BackupLocal.executarExclusivo(()=>navigator.locks.request('projetos:gestao',()=>salvarInterno(id,descarregar)));}finally{ocupado=false;}
}
async function carregar(id){await pronta;configuracao=lerConfig();const ref=configuracao.projetos[id];if(ref)caches.set(id,await conferir(await obter(ref.revisao||ref),id));return snapshot(id);}
async function trocar(id){const atual=window.ProjetosStore?.idAtual();if(atual&&atual!==id){const r=JSON.parse(fachada.getItem(`projetoV1:${atual}:registro`)||'null');if(r&&!r.removido)await salvar(atual,{descarregar:true});}if(id)await carregar(id);}
function aviso(e,destino){let p=document.getElementById('offline-erro');if(!p){p=document.createElement('p');p.id='offline-erro';p.setAttribute('role','alert');p.tabIndex=-1;document.body.prepend(p);}p.textContent='Não foi possível salvar o projeto na pasta. A navegação foi interrompida e os dados foram preservados. '+e.message;p.focus();if(destino){const b=document.createElement('button');b.type='button';b.setAttribute('data-backup-recuperacao','');b.textContent='Continuar sem novo backup';b.onclick=()=>location.assign(destino);p.append(document.createElement('br'),b);}}
pronta=(async()=>{
 if(navigator.locks&&!nativo.getItem('grimorioRestauracaoV1')){let liberar;const entrou=new Promise(resolve=>{window.__offlineLease=navigator.locks.request('grimorio:uso',{mode:'shared'},async()=>{resolve();await new Promise(r=>{liberar=r;});});});await entrou;window.__liberarOfflineLease=()=>liberar();}
 configuracao=lerConfig();if(configuracao.versao!==1||!configuracao.projetos||!Array.isArray(configuracao.apagadas))throw Error('Índice local offline inválido.');
 try{banco=await abrir();}catch(e){if(Object.keys(configuracao.projetos).length)throw e;return;}
 for(const [id,ref] of Object.entries(configuracao.projetos)) {
  let s;
  try {s=await conferir(await obter(ref.revisao||ref),id);if(ref.hash&&ref.hash!==s.hash)throw Error('Revisão local divergente.');}
  catch(e) {
   if(!ref.arquivo)throw e;
   const pasta=await pastaPersistida();if(!pasta)throw e;
   const esperado=ref.backupHash||(await indice(pasta,id)).geracoes.find(g=>g.arquivo===ref.arquivo)?.hash;if(!esperado)throw e;
   const texto=await lerArquivo(pasta,ref.arquivo);if(await hash(texto)!==esperado)throw e;
   const backup=JSON.parse(texto);if(backup.formato!=='grimorio-backup'||backup.versao!==1||!backup.armazenamento?.localStorage)throw e;
   const dados=Object.fromEntries(Object.entries(backup.armazenamento.localStorage).filter(([k])=>dono(k)===id));
   s=await conferir({projetoId:id,dados,hash:ref.hash,arquivo:ref.arquivo},id);await guardar(ref.revisao,s);
  }
  caches.set(id,s);
 }
 Object.defineProperty(window,'localStorage',{configurable:true,get:()=>proxy});
})();
window.ProjetosOffline={pronta,salvar,carregar,trocar,async autorizarPasta(){if(typeof window.showDirectoryPicker!=='function')throw Error('Navegador sem acesso direto a pastas.');const handle=await window.showDirectoryPicker({mode:'readwrite'});await new Promise((resolve,reject)=>{const r=indexedDB.open('grimorioBackupPastaV1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('diretorio'))r.result.createObjectStore('diretorio');};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('diretorio','readwrite');tx.objectStore('diretorio').put(handle,'pastaFixa');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});location.reload();},async organizar(){if(!await window.BackupLocal.obterPastaSalva())await window.BackupLocal.configurarPastaFixa();const projetos=window.ProjetosStore.listar(),erros=[];let salvos=0;for(const p of projetos){try{const r=await salvar(p.id,{descarregar:true});if(r.descarregado)salvos++;else erros.push('Pasta indisponível; projeto mantido no navegador.');}catch(e){erros.push(e.message);}}return {salvos,erros};},get descarregados(){return Object.keys(configuracao.projetos);}};
window.addEventListener('storage',e=>{if(e.key?.startsWith(APAGADA)){const key=decodeURIComponent(e.key.slice(APAGADA.length));window.dispatchEvent(new StorageEvent('storage',{key,newValue:fachada.getItem(key),url:e.url}));}});
document.addEventListener('click',event=>{
 const a=event.target.closest?.('a[href]');if(event.defaultPrevented||!a||a.download||a.hasAttribute('data-backup-recuperacao')||a.target==='_blank'||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
 const destino=new URL(a.href,location.href);if(destino.origin!==location.origin||destino.pathname===location.pathname&&destino.search===location.search)return;
 const id=window.ProjetosStore?.idAtual();if(!id||!window.BackupLocal?.executarExclusivo)return;
 if(window.CronometroEstudos?.obterEstado().estado!=='ocioso'&&window.CronometroEstudos)return;
 event.preventDefault();salvar(id).then(()=>location.assign(destino.href)).catch(e=>aviso(e,destino.href));
});
})();
