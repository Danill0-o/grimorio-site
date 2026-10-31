/* Sidebar compartilhada: atalhos de projeto apenas na Jornada e no Calendário. */
document.addEventListener('DOMContentLoaded',()=>{
 const menu=document.getElementById('jornada-menu-aberto');if(!menu)return;
 const pagina=location.pathname.split('/').pop();
 if(['agenda.html','calendario.html'].includes(pagina)&&!window.ProjetosStore?.temAtual()){location.replace('home.html');return;}
 if(!window.ProjetosStore?.temAtual())document.querySelectorAll('[data-menu-projeto]').forEach(e=>e.remove());
 const media=matchMedia('(min-width:1100px)');const ajustar=()=>{menu.open=media.matches;const filtros=document.getElementById('historico-filtros-painel');if(filtros)filtros.open=media.matches;};ajustar();media.addEventListener('change',ajustar);
 for(const link of menu.querySelectorAll('a[href]'))if(new URL(link.href).pathname===location.pathname)link.setAttribute('aria-current','page');
});
