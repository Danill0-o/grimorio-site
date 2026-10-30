/* E7: XP e níveis puros, perfis proporcionais versionados. */
(function () {
'use strict';
const refs = [
 {id:'discursiva-curta',nome:'Discursiva curta',extensao:'10 a 15 linhas',linhas:12.5,piso:900,ideal:1650,idealMin:1500,antigo:1800,teto:2400,xp:40,qtd:390},
 {id:'redacao-dissertativa',nome:'Redação dissertativa',extensao:'20 a 30 linhas',linhas:25,piso:2100,ideal:3300,idealMin:3000,antigo:3600,teto:4500,xp:80,qtd:260},
 {id:'estudo-caso-parecer',nome:'Estudo de caso / Parecer',extensao:'45 a 60 linhas',linhas:52.5,piso:3000,ideal:4350,idealMin:3900,antigo:4800,teto:5700,xp:110,qtd:156},
 {id:'peca-pratica',nome:'Peça prática completa',extensao:'90 a 150 linhas',linhas:120,piso:4800,ideal:8100,idealMin:7200,antigo:9000,teto:10800,xp:200,qtd:69}
];
const falhar = m => {throw new Error(`Progressão de práticas: ${m}`);};
const inteiro = (v,n) => {if(!Number.isSafeInteger(v)||v<1)falhar(`${n} inválido`);return v;};
function interpolar(x,pontos) {
 if(x<=pontos[0][0])return pontos[0][1]*x/pontos[0][0];
 const u=pontos.at(-1);if(x>=u[0])return u[1]*x/u[0];
 for(let i=1;i<pontos.length;i++){const[a,b]=pontos[i-1],[c,d]=pontos[i];if(x<=c)return b+(d-b)*(x-a)/(c-a);}
}
function quantidade(linhas) {
 const p=refs.slice(0,3).map(r=>[r.linhas,r.qtd]),u=p.at(-1);
 return inteiro(Math.ceil(linhas<p[0][0]?p[0][0]*p[0][1]/linhas:linhas>u[0]?u[0]*u[1]/linhas:interpolar(linhas,p)),'quantidade');
}
function validarPerfil(p,tipo) {
 if(p===null)return null;
 if(!p||typeof p!=='object'||Array.isArray(p)||p.versao!==2||!['linhas','tempo-ideal'].includes(p.base))falhar('perfil de XP inválido');
 const campo=p.base==='linhas'?'linhas':'tempoIdealSegundos';
 if(Object.keys(p).length!==3||!Object.hasOwn(p,campo))falhar('campos do perfil inválidos');
 if(['taf','simulado'].includes(tipo))falhar('este tipo tem regra própria');
 const valor=p[campo];if(!Number.isFinite(valor)||valor<=0)falhar('referência inválida');
 if(p.base==='tempo-ideal')inteiro(valor,'tempo ideal');
 const resultado={versao:2,base:p.base,[campo]:valor};
 const linhas=p.base==='linhas'?valor:interpolar(valor,refs.map(r=>[r.ideal,r.linhas]));
 porLinhas(linhas,p.base==='tempo-ideal'?valor:null);
 return resultado;
}
function porLinhas(linhas,ideal=null) {
 if(!Number.isFinite(linhas)||linhas<=0)falhar('linhas inválidas');
 const v=k=>interpolar(linhas,refs.map(r=>[r.linhas,r[k]]));
 const alvoSegundos=inteiro(ideal??Math.round(v('ideal')),'tempo ideal'),minimoSegundos=inteiro(Math.round(v('piso')),'piso'),maximoSegundos=inteiro(Math.round(v('teto')),'teto');
 const xpNominalUnidades=inteiro(Math.round(v('xp')*60),'XP nominal'),conclusoesNivel100=quantidade(linhas);
 inteiro(xpNominalUnidades*conclusoesNivel100,'XP máximo');
 if(minimoSegundos>alvoSegundos||alvoSegundos>maximoSegundos)falhar('janela inválida');
 return {nome:'Produção escrita proporcional',extensao:`${linhas.toLocaleString('pt-BR',{maximumFractionDigits:2})} linhas de referência`,linhasReferencia:linhas,minimoSegundos,alvoMinimoSegundos:alvoSegundos,alvoSegundos,maximoSegundos,xpNominal:xpNominalUnidades/60,xpNominalUnidades,conclusoesNivel100};
}
function resolverPerfil(perfil) {
 const p=validarPerfil(perfil);if(!p)return null;
 const linhas=p.base==='linhas'?p.linhas:interpolar(p.tempoIdealSegundos,refs.map(r=>[r.ideal,r.linhas]));
 return porLinhas(linhas,p.base==='tempo-ideal'?p.tempoIdealSegundos:null);
}
function obterPreset(id) {
 const r=refs.find(r=>id===r.id+'-v1'||id===r.id+'-v2');if(!r)falhar('preset de XP desconhecido');
 if(id.endsWith('-v1'))return {presetId:id,nome:r.nome,extensao:r.extensao,legado:true,linhasReferencia:r.linhas,minimoSegundos:r.piso,alvoMinimoSegundos:r.idealMin,alvoSegundos:r.antigo,maximoSegundos:r.teto,xpNominal:r.antigo*13/600,xpNominalUnidades:r.antigo*13/10,conclusoesNivel100:r.qtd};
 return {...porLinhas(r.linhas),presetId:id,nome:r.nome,extensao:r.extensao,legado:false,alvoMinimoSegundos:r.idealMin,alvoFaixaMaximoSegundos:r.antigo};
}
function validarPreset(id,tipo) {if(id===null)return null;obterPreset(id);if(['taf','simulado'].includes(tipo))falhar('este tipo não usa presets de produção escrita');return id;}
function obterParametros({tipo,presetXpId=null,perfilXp=null,duracaoPlanejadaSegundos=10800}) {
 if(presetXpId!==null&&perfilXp!==null)falhar('escolha preset ou perfil proporcional');
 if(tipo==='taf'||tipo==='simulado') {
  if(presetXpId!==null||perfilXp!==null)falhar('este tipo tem regra própria');
  if(tipo==='simulado') {
   const ideal=inteiro(duracaoPlanejadaSegundos,'duração do simulado');
   const xp=inteiro(Math.round(ideal*1.3),'XP do simulado');
   return {nome:'Simulado',extensao:'Duração da prova',minimoSegundos:Math.round(ideal*0.8),alvoMinimoSegundos:ideal,alvoSegundos:ideal,maximoSegundos:Math.round(ideal*1.2),xpNominal:xp/60,xpNominalUnidades:xp,conclusoesNivel100:104};
  }
  return null;
 }
 return perfilXp!==null?resolverPerfil(perfilXp):presetXpId!==null?obterPreset(presetXpId):null;
}
function calcularXpMissao({tipo,presetXpId=null,perfilXp=null,duracaoPlanejadaSegundos=10800,concluida,tempoRegistradoSegundos}) {
 if(typeof concluida!=='boolean'||!Number.isSafeInteger(tempoRegistradoSegundos)||tempoRegistradoSegundos<0)falhar('realização ou segundos inválidos');
 const p=obterParametros({tipo,presetXpId,perfilXp,duracaoPlanejadaSegundos});let zona,xpUnidades=0;
 if(tipo==='taf'){zona='tempo-taf';xpUnidades=tempoRegistradoSegundos;}
 else if(!p)zona='sem-preset';else if(!concluida)zona='aguardando-conclusao';
 else if(tempoRegistradoSegundos<p.minimoSegundos){zona='abaixo-piso';xpUnidades=tempoRegistradoSegundos;}
 else{zona=tempoRegistradoSegundos<=p.maximoSegundos?'faixa-operacional':'acima-teto';xpUnidades=p.xpNominalUnidades;}
 return {presetXpId,perfilXp:perfilXp===null?null:{...perfilXp},xpUnidades,xp:xpUnidades/60,xpNominal:p?.xpNominal??0,zona,unidadesMaximasNivel:tipo==='taf'?2160000:p?p.xpNominalUnidades*p.conclusoesNivel100:null,conclusoesNivel100:p?.conclusoesNivel100??null};
}
function limiaresNiveis({razao,unidadesMaximas}) {
 if(!Number.isFinite(razao)||razao<=1||!Number.isSafeInteger(unidadesMaximas)||unidadesMaximas<100)falhar('parâmetros da curva inválidos');
 return Array.from({length:100},(_,i)=>i===99?unidadesMaximas:Math.ceil(unidadesMaximas*(razao**i-1)/(razao**99-1)));
}
function projetarNivel(xpUnidades,regra) {
 if(!Number.isSafeInteger(xpUnidades)||xpUnidades<0)falhar('XP inválido para nível');
 const limites=limiaresNiveis(regra);let i=0;while(i<99&&xpUnidades>=limites[i+1])i++;
 const max=i===99,avanco=xpUnidades-limites[i],custo=max?0:limites[i+1]-limites[i];
 return {nivel:i+1,percentual:max?100:avanco/custo*100,xpParaProximoNivel:max?0:(custo-avanco)/60,xpMaximoNivel:regra.unidadesMaximas/60,razaoNiveis:regra.razao};
}
function nivelProducao(resultados) {
 const validos=resultados.filter(m=>m.unidadesMaximasNivel!==null);if(!validos.length)return {};
 const bases=new Set(validos.map(m=>m.unidadesMaximasNivel));
 if(bases.size===1)return projetarNivel(validos.reduce((s,m)=>s+m.xpUnidades,0),{razao:1.015,unidadesMaximas:[...bases][0]});
 // Soma racional exata das frações de domínio antes de normalizar perfis diferentes.
 const mdc=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};let n=0n,d=1n;
 for(const m of validos){const b=BigInt(m.unidadesMaximasNivel),a=BigInt(m.xpUnidades),g=mdc(d,b);n=n*(b/g)+a*(d/g);d=d*(b/g);const h=mdc(n,d);n/=h;d/=h;}
 const escala=1000000000,v=n*BigInt(escala)/d;
 const p=projetarNivel(Number(v>BigInt(escala)?BigInt(escala):v),{razao:1.015,unidadesMaximas:escala});
 return {...p,xpParaProximoNivel:null,xpMaximoNivel:null,misturaPerfis:true};
}
function projetarAtividade({missoes,tipo}) {
 if(!Array.isArray(missoes))falhar('atividades práticas devem ser uma lista');const ids=new Set();let xpUnidades=0,concluidas=0;
 const resultados=missoes.map(m=>{if(typeof m.missaoId!=='string'||!m.missaoId||ids.has(m.missaoId))falhar('identidade de atividade prática inválida ou duplicada');ids.add(m.missaoId);const xp=calcularXpMissao({...m,tipo});xpUnidades+=xp.xpUnidades;if(!Number.isSafeInteger(xpUnidades))falhar('total de XP excede o limite seguro');if(m.concluida)concluidas++;return {missaoId:m.missaoId,...xp};});
 return {xpUnidades,xp:xpUnidades/60,concluidas,missoes:resultados,...(tipo==='taf'?projetarNivel(xpUnidades,{razao:1.025,unidadesMaximas:2160000}):nivelProducao(resultados))};
}
window.PraticasProgressao=Object.freeze({listarPresets:()=>refs.map(r=>obterPreset(r.id+'-v2')),obterPreset,validarPreset,validarPerfil,resolverPerfil,obterParametros,calcularXpMissao,projetarAtividade,limiaresNiveis,projetarNivel});
})();
