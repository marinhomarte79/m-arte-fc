/* M ARTE FC Match Analyst — plataforma independente (Supabase)
   Perfis: super-admin (M Arte Design) · admin do clube · treinador · analista · leitura */
'use strict';

/* =========================================================
   CATÁLOGO DE ACÇÕES — baseado na Ficha de Registo
   ========================================================= */
const CONS = [['ataq','Ataque adv.'],['rem','Remate adv.'],['golo','Golo adv.'],['cruz','Cruzamento adv.'],['falta','Falta nossa'],['recb','Recuperação imediata'],['nada','Sem consequência']];
const ATQ_CONS = [['perda','Perda de bola'],['cruz','Cruzamento'],['falta','Falta do adv.'],['rfi','Remate fora / interc.'],['rb','Remate à baliza'],['fj','Fora de jogo']];
const CORR = [['esq','Corredor esquerdo'],['cent','Corredor central'],['dir','Corredor direito']];
const SHOT = [['baliza','À baliza'],['fora','Fora'],['interc','Interceptado']];
const CANTO = [['p1','1º poste'],['zc','Zona central'],['p2','2º poste'],['curto','Marcação curta'],['fora','Fora']];
const ACT = {
  rec:{l:'Recuperação',c:'#FFFFFF',steps:['loc','player'],k:'R'},
  perda:{l:'Perda de bola',c:'var(--red)',steps:['loc','player','cons'],k:'P'},
  pe:{l:'Passe errado',c:'var(--pe)',steps:['loc','player','cons'],k:'E'},
  fc:{l:'Falta cometida',c:'#7B3FE4',steps:['loc','player'],k:'C'},
  fs:{l:'Falta sofrida',c:'#38BDF8',steps:['loc','player'],k:'S'},
  remate:{l:'Remate',c:'#111111',steps:['sub','loc','player'],subs:SHOT,k:'T'},
  golo:{l:'Golo',c:'var(--gold)',steps:['loc','player'],k:'G'},
  ataque:{l:'Ataque',c:'#9CA3AF',steps:['corr','sub'],subs:ATQ_CONS,k:'A'},
  canto:{l:'Canto',c:'#9CA3AF',steps:['sub'],subs:CANTO,k:'K'},
  amarelo:{l:'Cartão amarelo',c:'var(--gold)',steps:['player']},
  vermelho:{l:'Cartão vermelho',c:'var(--red)',steps:['player']},
  subst:{l:'Substituição',c:'#9CA3AF',steps:['player','player2']},
  gr_dc:{l:'Defesa completa',c:'#FFFFFF',steps:['player'],gk:true},
  gr_di:{l:'Defesa incompleta',c:'#FFFFFF',steps:['player'],gk:true},
  gr_ca:{l:'Defesa p/ canto',c:'#FFFFFF',steps:['player'],gk:true},
  ataque_adv:{l:'Ataque sofrido',c:'var(--opp)',steps:['corr'],opp:true},
  remate_adv:{l:'Remate adv.',c:'var(--opp)',steps:['sub'],subs:SHOT,opp:true},
  golo_adv:{l:'Golo adv.',c:'var(--opp)',steps:[],opp:true},
  amarelo_adv:{l:'Amarelo adv.',c:'var(--gold)',steps:[],opp:true},
  vermelho_adv:{l:'Vermelho adv.',c:'var(--red)',steps:[],opp:true},
};
const PAD = [['Transição / organização',['rec','perda','pe','fc','fs']],['Ataque',['remate','golo','ataque','canto']],['Guarda-redes',['gr_dc','gr_di','gr_ca']],['Disciplina',['amarelo','vermelho','subst']],['Adversário',['ataque_adv','remate_adv','golo_adv','amarelo_adv','vermelho_adv']]];
const ZN = {def:'Z. Defensiva',inter:'Z. Intermédia',ofen:'Z. Ofensiva'};
const ROLE_L = {admin:'Admin do clube',treinador:'Treinador',analista:'Analista',leitura:'Só leitura'};
const lab = (arr,k)=>(arr.find(a=>a[0]===k)||[,k])[1];

/* =========================================================
   ESTADO
   ========================================================= */
const CFG = window.MAFC_CONFIG;
const sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth:{ persistSession:true, autoRefreshToken:true } });
const S = {
  session:null, profile:null, isSuper:false,
  clubs:[], myRoles:{}, club:null, teams:[], team:null, players:[], matches:{}, cur:null,
  pending:null, layer:'rec', mapHalf:'all', sortI:{k:'saldo',d:-1}, sortS:{k:'saldo',d:-1}, confirm:null, autoM:null,
  scope:'jogo', season:null, range:'all',
  aiBusy:false, members:[], aiCount:0, admin:{users:null, aiByClub:{}, memCount:{}}, loginErr:'', msg:{},
};
const LS='mafc-v2';
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(LS+k)||'null'); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(LS+k, JSON.stringify(v)); }catch(e){} }
const uid = () => Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = id => document.getElementById(id);

/* ---------- permissões (a base de dados impõe-nas; aqui só se adapta o ecrã) ---------- */
const myRole = () => S.isSuper ? 'super' : (S.club ? S.myRoles[S.club.id] : null);
const canEdit = () => ['super','admin','treinador','analista'].includes(myRole());
const isAdmin = () => ['super','admin'].includes(myRole());
const clubActive = c => c && c.status==='ativo' && (!c.paid_until || c.paid_until >= today());
const today = () => new Date().toISOString().slice(0,10);
const matchRO = m => !canEdit() || (m && m.locked && !isAdmin());

/* =========================================================
   ARRANQUE E SESSÃO
   ========================================================= */
async function boot(){
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((ev, session)=>{ const had=!!S.session; S.session=session; if(!session){ resetState(); render(); } else if(!had){ afterLogin(); } });
  if(S.session) await afterLogin(); else render();
}
function resetState(){ Object.assign(S,{profile:null,isSuper:false,clubs:[],myRoles:{},club:null,teams:[],team:null,players:[],matches:{},cur:null,pending:null,members:[]}); }
async function afterLogin(){
  const u=S.session.user;
  const [{data:prof},{data:mems},{data:clubs}] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id',u.id).maybeSingle(),
    sb.from('memberships').select('club_id,role').eq('user_id',u.id),
    sb.from('clubs').select('*').order('name')
  ]);
  S.profile=prof||{email:u.email,full_name:'',is_super:false}; S.isSuper=!!S.profile.is_super;
  S.myRoles={}; for(const m of (mems||[])) S.myRoles[m.club_id]=m.role;
  S.clubs=clubs||[];
  const last=lsGet('club');
  const pick = S.clubs.find(c=>c.id===last) || S.clubs[0] || null;
  if(pick) await selectClub(pick.id, true); else render();
}
async function selectClub(id, quiet){
  S.club=S.clubs.find(c=>c.id===id)||null; S.pending=null; S.cur=null; S.matches={}; S.teams=[]; S.players=[]; S.team=null;
  lsSet('club',id);
  applyBrand();
  if(!S.club || (!clubActive(S.club) && !S.isSuper)){ render(); return; }
  const [{data:teams},{data:players},{data:matches}] = await Promise.all([
    sb.from('teams').select('*').eq('club_id',id).order('name'),
    sb.from('players').select('*').eq('club_id',id).order('name'),
    sb.from('matches').select('*').eq('club_id',id).order('date',{ascending:false})
  ]);
  S.teams=teams||[]; S.players=players||[];
  for(const r of (matches||[])) S.matches[r.id]=fromRow(r);
  restorePending();
  const lt=lsGet('team-'+id);
  S.team = S.teams.find(t=>t.id===lt) || S.teams[0] || null;
  pickCur();
  if(isAdmin()) loadClubAdmin();
  render();
  if(!quiet) toast('Clube: '+S.club.name);
}
function applyBrand(){
  const c=S.club&&S.club.color;
  if(c && /^#[0-9a-f]{6}$/i.test(c)){ document.documentElement.style.setProperty('--red',c); document.documentElement.style.setProperty('--red-deep',c); document.querySelector('meta[name=theme-color]').content=c; }
  else { document.documentElement.style.removeProperty('--red'); document.documentElement.style.removeProperty('--red-deep'); }
}
function selectTeam(id){ S.team=S.teams.find(t=>t.id===id)||null; lsSet('team-'+S.club.id,id); S.cur=null; S.pending=null; pickCur(); render(); }
function pickCur(){
  if(S.cur && S.matches[S.cur] && (!S.team || S.matches[S.cur].team_id===S.team.id)) return;
  const list=teamMatches(); S.cur=list[0]?list[0].id:null;
}
const teamMatches = () => Object.values(S.matches).filter(m=>!S.team||m.team_id===S.team.id).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.updatedAt-a.updatedAt));
const M = () => S.cur ? S.matches[S.cur] : null;
const players = () => S.players.filter(p=>!S.team||p.team_id===S.team.id);
const pname = e => { const p=S.players.find(p=>p.id===e.p); return p?p.name:(e.pn||''); };

/* ---------- linha da base de dados <-> jogo ---------- */
function fromRow(r){
  const d=r.data||{};
  return { id:r.id, team_id:r.team_id, home:r.home, opp:r.opp, date:r.date, time:r.time, comp:r.comp, halfLen:r.half_len, status:r.status, locked:r.locked,
    clock:d.clock||{half:1,running:false,startedAt:null,base:0}, poss:d.poss||{cur:null,since:null,us:0,opp:0}, events:d.events||[],
    scoreUnknown:!!d.scoreUnknown, note:d.note||'', ai:d.ai||null, self:d.self||null, lineup:d.lineup||null, updatedAt:Date.parse(r.updated_at)||0 };
}
function toRow(m){ return { home:m.home, opp:m.opp, date:m.date||null, time:m.time||'', comp:m.comp||'', half_len:m.halfLen, status:m.status,
  data:{ clock:m.clock, poss:m.poss, events:m.events, scoreUnknown:m.scoreUnknown, note:m.note, ai:m.ai, self:m.self||null, lineup:m.lineup||null } }; }

/* ---------- gravação com fila e reenvio ---------- */
const timers={}, chains={}, dirty=new Set();
function touch(m){
  m.updatedAt=Date.now(); dirty.add(m.id); savePendingLocal();
  clearTimeout(timers[m.id]); timers[m.id]=setTimeout(()=>flush(m.id),800); setSync('a');
}
function flush(id){
  chains[id]=(chains[id]||Promise.resolve()).then(async()=>{
    const m=S.matches[id]; if(!m||!dirty.has(id)) return;
    const stamp=m.updatedAt;
    const { error } = await sb.from('matches').update(toRow(m)).eq('id',id);
    if(error){
      if(/trancado/i.test(error.message)){ dirty.delete(id); savePendingLocal(); toast('Jogo trancado: alterações não gravadas.'); setSync(true); return; }
      setSync(false); clearTimeout(timers[id]); timers[id]=setTimeout(()=>flush(id),8000); return;
    }
    if(m.updatedAt===stamp) dirty.delete(id);
    savePendingLocal(); setSync(dirty.size?'a':true);
  });
}
function savePendingLocal(){ const o={}; for(const id of dirty) if(S.matches[id]) o[id]=S.matches[id]; lsSet('pending',o); }
function restorePending(){ const o=lsGet('pending')||{}; for(const [id,m] of Object.entries(o)){ if(S.matches[id] && m.updatedAt>S.matches[id].updatedAt){ S.matches[id]=m; dirty.add(id); flush(id); } } }
window.addEventListener('online',()=>{ for(const id of dirty) flush(id); });
function setSync(st){
  const el=$('sync'); if(!el) return;
  if(st===true){ el.className='sync'; el.innerHTML='<i></i>Guardado'; }
  else if(st==='a'){ el.className='sync'; el.innerHTML='<i></i>A guardar…'; }
  else { el.className='sync err'; el.innerHTML='<i></i>Sem ligação — a tentar'; }
}

/* =========================================================
   RELÓGIO, POSSE, EVENTOS
   ========================================================= */
function elapsed(m){ const c=m.clock; return c.base+(c.running?(Date.now()-c.startedAt)/1000:0); }
function fmtClock(sec){ sec=Math.max(0,Math.floor(sec)); return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0'); }
function minuteLabel(m,half,t){ const L=m.halfLen||45, mm=Math.floor(t/60); if(mm>=L) return (L*half)+'+'+(mm-L+1)+"'"; return ((half-1)*L+mm+1)+"'"; }
function possNow(m){ const p=m.poss; let us=p.us,opp=p.opp; if(p.cur&&p.since&&m.clock.running){ const d=(Date.now()-p.since)/1000; if(p.cur==='us') us+=d; else opp+=d; } return {us,opp}; }
function setPoss(m,who){ const now=Date.now(),p=m.poss; if(p.cur&&p.since) p[p.cur]+=(now-p.since)/1000; p.cur=(p.cur===who)?null:who; p.since=(p.cur&&m.clock.running)?now:null; touch(m); render(); }
function startPause(m){
  const now=Date.now(),c=m.clock,p=m.poss;
  if(c.running){ c.base+=(now-c.startedAt)/1000; c.running=false; c.startedAt=null; if(p.cur&&p.since){ p[p.cur]+=(now-p.since)/1000; p.since=null; } }
  else { c.running=true; c.startedAt=now; if(p.cur) p.since=now; if(m.status==='nova') m.status='a decorrer'; }
  touch(m); render();
}
function endHalf(m){
  if(m.clock.running) startPause(m);
  if(m.clock.half===1){ m.clock={half:2,running:false,startedAt:null,base:0}; toast('Intervalo. 2ª parte pronta a começar.'); }
  else { m.status='terminado'; toast('Jogo terminado. Veja a análise.'); }
  touch(m); render();
}
function begin(type){
  const m=M(); if(!m||matchRO(m)) return;
  S.pending={type,i:0,e:{id:uid(),type,half:m.clock.half,t:Math.round(elapsed(m))}};
  if(ACT[type].gk){ const gk=players().find(p=>p.pos==='GR'); if(gk){ S.pending.e.p=gk.id; S.pending.e.pn=gk.name; commit(); return; } }
  advance();
}
const curStep = () => S.pending ? ACT[S.pending.type].steps[S.pending.i] : null;
function advance(){ if(S.pending && S.pending.i>=ACT[S.pending.type].steps.length) commit(); else render(); }
function stepValue(key,val){
  const p=S.pending; if(!p) return;
  if(key==='player'||key==='player2'){ const pl=S.players.find(x=>x.id===val); if(key==='player'){ p.e.p=val||undefined; if(pl) p.e.pn=pl.name; } else { p.e.p2=val||undefined; if(pl) p.e.pn2=pl.name; } }
  else if(key==='loc'){ p.e.x=val.x; p.e.y=val.y; p.e.z=val.x<100/3?'def':val.x<200/3?'inter':'ofen'; }
  else p.e[key]=val;
  p.i++; advance();
}
function commit(){ const m=M(),e=S.pending.e; S.pending=null; m.events.push(e); touch(m); toast(minuteLabel(m,e.half,e.t)+' · '+ACT[e.type].l+(e.p?' · '+pname(e):'')); render(); }
function undo(){ const m=M(); if(!m||!m.events.length||matchRO(m)) return; const e=m.events.pop(); touch(m); toast('Anulado: '+ACT[e.type].l); render(); }
function delEvent(id){ const m=M(); if(matchRO(m)) return; m.events=m.events.filter(e=>e.id!==id); touch(m); render(); }
let toastT; function toast(t){ const el=$('toast'); el.textContent=t; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,2600); }

/* =========================================================
   CAMPO (SVG) — 105 × 68, 3 zonas como na ficha
   ========================================================= */
function pitchSVG({markers=[],zones=null,id='',labels=true}={}){
  const W=105,H=68; let s=`<svg class="pitch" ${id?`id="${id}"`:''} viewBox="-2 -2 109 72" role="img" aria-label="Campo, ataque da esquerda para a direita">`;
  for(let i=0;i<10;i++) s+=`<rect class="${i%2?'pg2':'pg1'}" x="${i*10.5}" y="0" width="10.5" height="${H}"/>`;
  s+=`<rect class="pg1" x="-2" y="-2" width="109" height="2"/><rect class="pg1" x="-2" y="68" width="109" height="2"/><rect class="pg1" x="-2" y="0" width="2" height="68"/><rect class="pg1" x="105" y="0" width="2" height="68"/>`;
  if(zones){ const mx=Math.max(1,zones.def,zones.inter,zones.ofen),tot=Math.max(1,zones.def+zones.inter+zones.ofen);
    [['def',0],['inter',35],['ofen',70]].forEach(([k,x])=>{ s+=`<rect class="zfill" x="${x}" y="0" width="35" height="68" opacity="${(zones[k]/mx*0.38).toFixed(2)}"/><text class="zcount" x="${x+17.5}" y="37" text-anchor="middle">${zones[k]}</text><text class="zpct" x="${x+17.5}" y="42" text-anchor="middle">${Math.round(zones[k]/tot*100)}%</text>`; }); }
  s+=`<g class="pl"><rect x="0" y="0" width="${W}" height="${H}"/><line x1="52.5" y1="0" x2="52.5" y2="68"/><circle cx="52.5" cy="34" r="9.15"/><rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/><rect x="0" y="24.84" width="5.5" height="18.32"/><rect x="99.5" y="24.84" width="5.5" height="18.32"/><rect x="-1.6" y="30.34" width="1.6" height="7.32"/><rect x="105" y="30.34" width="1.6" height="7.32"/><path d="M16.5 26.7 A9.15 9.15 0 0 1 16.5 41.3"/><path d="M88.5 26.7 A9.15 9.15 0 0 0 88.5 41.3"/></g><circle class="pd" cx="52.5" cy="34" r=".45"/><circle class="pd" cx="11" cy="34" r=".4"/><circle class="pd" cx="94" cy="34" r=".4"/><line class="pthird" x1="35" y1="0" x2="35" y2="68"/><line class="pthird" x1="70" y1="0" x2="70" y2="68"/>`;
  if(labels) s+=`<text class="plab" x="17.5" y="3.6" text-anchor="middle">Z. Defensiva</text><text class="plab" x="52.5" y="3.6" text-anchor="middle">Z. Intermédia</text><text class="plab" x="87.5" y="3.6" text-anchor="middle">Z. Ofensiva</text><text class="plab" x="1.5" y="66.2">Ataque →</text>`;
  for(const mk of markers){ const cx=+(mk.x*W/100).toFixed(2), cy=+(mk.y*H/100).toFixed(2);
    if(mk.shape==='x') s+=`<g stroke="${mk.c}" stroke-width=".8" stroke-linecap="round"><line x1="${cx-1.1}" y1="${cy-1.1}" x2="${cx+1.1}" y2="${cy+1.1}"/><line x1="${cx+1.1}" y1="${cy-1.1}" x2="${cx-1.1}" y2="${cy+1.1}"/></g>`;
    else if(mk.shape==='ring') s+=`<circle cx="${cx}" cy="${cy}" r="1.1" fill="none" stroke="${mk.c}" stroke-width=".55"/>`;
    else s+=`<circle class="mk" cx="${cx}" cy="${cy}" r="${mk.r||1.15}" fill="${mk.c}"><title>${esc(mk.t||'')}</title></circle>`; }
  return s+'</svg>';
}
function pitchClick(ev){ if(curStep()!=='loc') return; const svg=ev.currentTarget,pt=svg.createSVGPoint(); pt.x=ev.clientX; pt.y=ev.clientY; const p=pt.matrixTransform(svg.getScreenCTM().inverse()); stepValue('loc',{x:+Math.min(100,Math.max(0,p.x/105*100)).toFixed(1),y:+Math.min(100,Math.max(0,p.y/68*100)).toFixed(1)}); }

/* =========================================================
   ESTATÍSTICA
   ========================================================= */
const isShot = e => e.type==='remate'||e.type==='golo';
const count = (evs,f) => evs.filter(f).length;
function topPlayer(evs){ const c={}; for(const e of evs) if(e.p) c[e.p]=(c[e.p]||0)+1; const b=Object.entries(c).sort((a,b)=>b[1]-a[1])[0]; if(!b) return null; const pl=S.players.find(p=>p.id===b[0]); const e=evs.find(e=>e.p===b[0]); return {name:pl?pl.name:(e.pn||'?'),n:b[1]}; }
function stats(m){
  const ev=m.events,H=[1,2];
  const zt=type=>{ const o={}; for(const z of ['def','inter','ofen']) o[z]=H.map(h=>count(ev,e=>e.type===type&&e.half===h&&e.z===z)); o.h=H.map(h=>count(ev,e=>e.type===type&&e.half===h)); o.t=o.h[0]+o.h[1]; o.top=topPlayer(ev.filter(e=>e.type===type)); return o; };
  const shots={baliza:H.map(h=>count(ev,e=>e.half===h&&(e.type==='golo'||(e.type==='remate'&&e.sub==='baliza')))),fora:H.map(h=>count(ev,e=>e.half===h&&e.type==='remate'&&e.sub==='fora')),interc:H.map(h=>count(ev,e=>e.half===h&&e.type==='remate'&&e.sub==='interc'))};
  shots.h=H.map((h,i)=>shots.baliza[i]+shots.fora[i]+shots.interc[i]); shots.t=shots.h[0]+shots.h[1]; shots.top=topPlayer(ev.filter(isShot));
  const atk={by:{},cons:{},adv:{}};
  for(const [k] of CORR){ atk.by[k]=H.map(h=>count(ev,e=>e.type==='ataque'&&e.corr===k&&e.half===h)); atk.adv[k]=H.map(h=>count(ev,e=>e.type==='ataque_adv'&&e.corr===k&&e.half===h)); }
  for(const [k] of ATQ_CONS) atk.cons[k]=H.map(h=>count(ev,e=>e.type==='ataque'&&e.sub===k&&e.half===h));
  atk.t=count(ev,e=>e.type==='ataque'); atk.tadv=count(ev,e=>e.type==='ataque_adv');
  const cantos={}; for(const [k] of CANTO) cantos[k]=H.map(h=>count(ev,e=>e.type==='canto'&&e.sub===k&&e.half===h)); cantos.t=count(ev,e=>e.type==='canto');
  const cons={}; for(const t of ['pe','perda']){ cons[t]={}; for(const [k] of CONS) cons[t][k]=count(ev,e=>e.type===t&&e.cons===k); }
  const p=possNow(m),pt=p.us+p.opp;
  return {rec:zt('rec'),perda:zt('perda'),pe:zt('pe'),fs:zt('fs'),fc:zt('fc'),shots,atk,cantos,cons,goals:count(ev,e=>e.type==='golo'),goalsAdv:count(ev,e=>e.type==='golo_adv'),poss:pt>5?Math.round(p.us/pt*100):null,
    shotsAdv:count(ev,e=>e.type==='remate_adv'),shotsAdvOn:count(ev,e=>e.type==='remate_adv'&&e.sub==='baliza'),
    cards:{am:count(ev,e=>e.type==='amarelo'),vm:count(ev,e=>e.type==='vermelho'),amA:count(ev,e=>e.type==='amarelo_adv'),vmA:count(ev,e=>e.type==='vermelho_adv')},
    gk:{dc:count(ev,e=>e.type==='gr_dc'),di:count(ev,e=>e.type==='gr_di'),ca:count(ev,e=>e.type==='gr_ca')}};
}
function score(m){ if(m.scoreUnknown&&!m.events.some(e=>e.type==='golo'||e.type==='golo_adv')) return null; return [count(m.events,e=>e.type==='golo'),count(m.events,e=>e.type==='golo_adv')]; }
function periodOf(m,e){ const L=m.halfLen||45; return (e.half-1)*3+Math.min(2,Math.floor((e.t/60)/(L/3))); }
function periodLabels(m){ const L=m.halfLen||45,s=L/3,r=[]; for(let h=0;h<2;h++) for(let i=0;i<3;i++){ const a=h*L+i*s; r.push(`${Math.round(a)}'–${Math.round(a+s)}'`); } return r; }
function insights(m,st){
  const out=[],pct=(a,b)=>b?Math.round(a/b*100):0,R=st.rec.t,P=st.perda.t,E=st.pe.t;
  if(R+P+E===0) return [{tone:'info',tag:'Sem dados',t:'Ainda sem acções registadas',p:'Registe recuperações, perdas e passes errados para gerar a leitura do jogo.'}];
  const saldo=R-P-E;
  out.push({tone:saldo>=10?'good':saldo>=0?'info':'bad',tag:'Domínio da bola',t:`Saldo de bola ${saldo>0?'+':''}${saldo}`,p:`${R} recuperações contra ${P} perdas e ${E} passes errados. ${saldo>=10?'Equipa ganhou claramente a luta pela posse: há margem para ser mais vertical depois de recuperar.':saldo>=0?'Equilíbrio frágil. Cada perda evitável conta: exigir segurança no primeiro passe após recuperação.':'Devolvemos mais bolas do que ganhámos. Prioridade: reduzir risco na construção e melhorar apoios ao portador.'}`});
  const lz={}; for(const z of ['def','inter','ofen']) lz[z]=st.perda[z][0]+st.perda[z][1]+st.pe[z][0]+st.pe[z][1]; const lt=lz.def+lz.inter+lz.ofen;
  if(lt){ const kz=Object.entries(lz).sort((a,b)=>b[1]-a[1])[0]; const txt={def:'Perder a bola no nosso terço é o cenário mais caro. Treinar saída curta com 3º homem e saber jogar longo quando a pressão é alta.',inter:'A zona intermédia é onde o adversário nos apanha em transição. Melhorar orientação corporal na receção, apoios frontais e o timing do passe de ruptura.',ofen:'A maioria das perdas acontece no último terço, onde o risco é aceitável. Garantir equilíbrio defensivo (2+1 atrás da linha da bola) para a contra-pressão.'};
    out.push({tone:kz[0]==='def'?'bad':kz[0]==='inter'?'warn':'info',tag:'Onde perdemos a bola',t:`${pct(kz[1],lt)}% na ${ZN[kz[0]]}`,p:`${kz[1]} de ${lt} perdas e passes errados. ${txt[kz[0]]}`}); }
  if(R){ const of=st.rec.ofen[0]+st.rec.ofen[1],ofp=pct(of,R),de=st.rec.def[0]+st.rec.def[1];
    out.push({tone:ofp>=15?'good':'warn',tag:'Altura da pressão',t:`${ofp}% das recuperações no último terço`,p:ofp>=15?`${of} bolas ganhas perto da área adversária: a pressão alta funciona. Ligar cada recuperação a uma finalização rápida.`:`Só ${of} recuperações no terço ofensivo e ${de} no defensivo. Bloco a recuperar baixo: subir a linha de pressão com gatilhos claros (passe para trás, receção de costas, lateral).`}); }
  if(st.atk.t){ const by={}; for(const [k] of CORR) by[k]=st.atk.by[k][0]+st.atk.by[k][1]; const sa=st.atk.cons.rb[0]+st.atk.cons.rb[1]+st.atk.cons.rfi[0]+st.atk.cons.rfi[1]; const mn=Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
    out.push({tone:by.cent<st.atk.t*0.15?'warn':'info',tag:'Corredores',t:`${pct(mn[1],st.atk.t)}% dos ataques pelo ${lab(CORR,mn[0]).toLowerCase()}`,p:`Esq. ${by.esq} · Central ${by.cent} · Dir. ${by.dir}. ${pct(sa,st.atk.t)}% dos ataques terminaram em remate. ${by.cent<st.atk.t*0.15?'Jogo muito exterior e previsível: atrair por fora para entrar por dentro, com médios entre linhas.':'Boa distribuição: manter a variação de centro de jogo.'}`}); }
  if(st.shots.t){ const on=st.shots.baliza[0]+st.shots.baliza[1];
    out.push({tone:pct(on,st.shots.t)>=45?'good':'warn',tag:'Finalização',t:`${on} de ${st.shots.t} remates enquadrados (${pct(on,st.shots.t)}%)`,p:`${st.goals} golo(s). ${pct(on,st.shots.t)>=45?'Boa pontaria. O passo seguinte é criar remates de melhor qualidade, dentro da área.':'Muitos remates sem direcção à baliza. Trabalhar a decisão no último passe e a finalização ao primeiro toque.'}${st.shots.top?` Mais rematador: ${st.shots.top.name} (${st.shots.top.n}).`:''}`}); }
  const h1=st.rec.h[0]-st.perda.h[0]-st.pe.h[0],h2=st.rec.h[1]-st.perda.h[1]-st.pe.h[1];
  if(st.rec.h[1]+st.perda.h[1]+st.pe.h[1]>0) out.push({tone:h2>=h1?'good':'warn',tag:'1ª vs 2ª parte',t:`Saldo ${h1>0?'+':''}${h1} → ${h2>0?'+':''}${h2}`,p:`Recuperações ${st.rec.h[0]} → ${st.rec.h[1]}, perdas ${st.perda.h[0]} → ${st.perda.h[1]}, passes errados ${st.pe.h[0]} → ${st.pe.h[1]}. ${h2>=h1?'A equipa cresceu após o intervalo.':'Quebra na 2ª parte. Rever gestão física e substituições.'}${st.pe.h[1]>st.pe.h[0]*1.3?' A subida de passes errados na 2ª parte aponta para fadiga ou pressa em decidir.':''}`});
  if(st.fc.t){ const fd=st.fc.def[0]+st.fc.def[1]; out.push({tone:fd>=4?'warn':'info',tag:'Disciplina',t:`${st.fc.t} faltas cometidas, ${fd} na zona defensiva`,p:`${st.fs.t} faltas sofridas. ${fd>=4?'Demasiadas faltas perto da nossa área: oferecem bolas paradas.':'Faltas controladas perto da nossa baliza.'}${st.fc.top?` Mais faltoso: ${st.fc.top.name} (${st.fc.top.n}).`:''}`}); }
  const lc=['pe','perda'].reduce((a,t)=>a+st.cons[t].rem+st.cons[t].golo,0),wc=['pe','perda'].reduce((a,t)=>a+Object.values(st.cons[t]).reduce((s,v)=>s+v,0),0);
  if(wc) out.push({tone:lc>=3?'bad':'info',tag:'Transição defensiva',t:`${lc} remates/golos adv. após perda`,p:`De ${wc} perdas com consequência registada, ${count(m.events,e=>(e.type==='pe'||e.type==='perda')&&e.cons==='recb')} foram recuperadas de imediato. ${lc>=3?'A reacção à perda tem de ser mais rápida: 5 segundos de pressão sobre o portador.':'Boa reacção à perda.'}`});
  const per=Array(6).fill(0); for(const e of m.events) if(e.type==='perda'||e.type==='pe') per[periodOf(m,e)]++; const wp=per.indexOf(Math.max(...per));
  if(per[wp]>0) out.push({tone:'info',tag:'Momento crítico',t:`Período ${periodLabels(m)[wp]}`,p:`${per[wp]} perdas e passes errados, o pior período do jogo. Rever as imagens desse bloco com a equipa.`});
  return out;
}
function indiv(m){
  const cats=['rec','perda','fc','fs','shot','pe'],rows={};
  for(const pl of players()) rows[pl.id]={id:pl.id,name:pl.name,num:pl.num,gk:pl.pos==='GR'};
  for(const e of m.events){ if(!e.p) continue; const r=rows[e.p]||(rows[e.p]={id:e.p,name:pname(e)||'?',num:'',gk:false}); const k=isShot(e)?'shot':e.type; r[k+e.half]=(r[k+e.half]||0)+1;
    if(e.type==='golo') r.golos=(r.golos||0)+1; }
  for(const r of Object.values(rows)){ for(const c of cats){ r[c+'1']=r[c+'1']||0; r[c+'2']=r[c+'2']||0; r[c]=r[c+'1']+r[c+'2']; } r.saldo=r.rec-r.perda-r.pe; r.golos=r.golos||0; r.act=cats.reduce((a,c)=>a+r[c],0)+r.golos; }
  return Object.values(rows);
}

/* =========================================================
   PONTUAÇÕES (0–10) E ONZE INICIAL
   ========================================================= */
const FORMS=['4-4-2','4-3-3','4-2-3-1','4-1-4-1','4-3-1-2','4-5-1','3-5-2','3-4-3','3-4-1-2','5-3-2','5-4-1','3-3-2','3-2-3','3-3-1','2-3-2','2-3-1','3-2-1','2-1-2','2-2'];
const formSize = f => 1+f.split('-').reduce((a,b)=>a+ +b,0);
const RW={rec:0.12,perda:-0.12,pe:-0.10,fc:-0.08,fs:0.05,golo:1.1,amarelo:-0.3,vermelho:-1.2,gr_dc:0.30,gr_di:0.10,gr_ca:0.20};
function defaultLineup(m){
  const posOrd={GR:0,DEF:1,MED:2,AV:3,'':2};
  const cnt={}; for(const e of m.events) if(e.p) cnt[e.p]=(cnt[e.p]||0)+1;
  const pls=players(); const gk=pls.find(p=>p.pos==='GR'&&cnt[p.id])||pls.find(p=>p.pos==='GR');
  const rest=pls.filter(p=>p!==gk).sort((a,b)=>(cnt[b.id]||0)-(cnt[a.id]||0)).slice(0,10).sort((a,b)=>posOrd[a.pos||'']-posOrd[b.pos||'']);
  return {formation:'4-4-2',slots:[gk?gk.id:null,...rest.map(p=>p.id)],override:{},auto:true};
}
const lineupOf = m => m.lineup || defaultLineup(m);
function rateMatch(m){
  const lu=lineupOf(m), part=new Set((lu.slots||[]).filter(Boolean)), subsIn=new Set(), subsOut=new Set(), acc={};
  for(const e of m.events) if(e.type==='subst'){ if(e.p) subsOut.add(e.p); if(e.p2){ subsIn.add(e.p2); part.add(e.p2); } }
  for(const e of m.events){ if(!e.p||e.type==='subst') continue; part.add(e.p); let w=RW[e.type]; if(e.type==='remate') w=e.sub==='baliza'?0.18:0.05; if(w==null) continue; acc[e.p]=(acc[e.p]||0)+w; }
  const gk=(lu.slots||[])[0], ga=count(m.events,e=>e.type==='golo_adv'), out={};
  for(const id of part){ let r=6.0+(acc[id]||0); if(id===gk) r-=0.35*ga;
    const ov=lu.override&&lu.override[id]; const man=ov!=null&&ov!==''&&!isNaN(+ov);
    out[id]={r:man?Math.max(0,Math.min(10,+ov)):Math.round(Math.max(3,Math.min(10,r))*10)/10, manual:man, inn:subsIn.has(id), out:subsOut.has(id)}; }
  return out;
}
const rtCls = r => r>=9?'r6':r>=8?'r5':r>=7?'r4':r>=6.5?'r3':r>=6?'r2':'r1';
const f1r = v => (Math.round(v*10)/10).toFixed(1);
function vRatings(m){
  const lu=lineupOf(m), rt=rateMatch(m), lines=lu.formation.split('-').map(Number), slots=lu.slots||[];
  const vals=Object.values(rt).map(x=>x.r), avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  const rows=[[0,1],...lines.map((n,li)=>[n,li])]; let idx=0; const marks=[];
  const L=lines.length;
  marks.push({i:0,x:50,y:7});
  idx=1; lines.forEach((n,li)=>{ const y=25+li*(56/Math.max(1,L-1)); for(let k=0;k<n;k++){ marks.push({i:idx,x:(k+1)/(n+1)*100,y:L===1?50:y}); idx++; } });
  const pl=id=>S.players.find(p=>p.id===id);
  const chip=(id,x,y)=>{ const p=pl(id), r=rt[id]; const nm=p?p.name:'—', num=p&&p.num?p.num:'';
    return `<div class="lp" style="left:${x}%;top:${y}%">${r&&(r.out||r.inn)?`<span class="lp-sub" title="${r.out?'Substituído':'Entrou'}">${r.out?'↓':'↑'}</span>`:''}<span class="lp-shirt">${esc(num||initials(nm))}</span>${r?`<span class="rt ${rtCls(r.r)}" ${r.manual?'title="Nota manual"':''}>${f1r(r.r)}${r.manual?'*':''}</span>`:''}<span class="lp-name">${num?`<b>${esc(num)}</b> `:''}${esc(nm)}</span></div>`; };
  const onField=marks.map(mk=>slots[mk.i]?chip(slots[mk.i],mk.x,mk.y):`<div class="lp empty" style="left:${mk.x}%;top:${mk.y}%"><span class="lp-shirt">+</span></div>`).join('');
  const onSet=new Set(slots.filter(Boolean));
  const others=Object.entries(rt).filter(([id])=>!onSet.has(id)).sort((a,b)=>b[1].r-a[1].r);
  const ed=canEdit()&&!matchRO(m);
  const allPl=players();
  const rankList=Object.entries(rt).sort((a,b)=>b[1].r-a[1].r);
  const best=rankList[0];
  return `<section class="card"><h2>Pontuações do jogo<span class="sp"></span>${avg!=null?`<span class="row small" style="gap:6px">Média da equipa <span class="rt ${rtCls(avg)}">${f1r(avg)}</span></span>`:''}</h2>
  <div class="g-map" style="align-items:start">
    <div><div class="lineup">${pitchVertical()}<div class="lu-form">${esc(lu.formation)}</div>${onField}</div>
      ${lu.auto?`<p class="note" style="margin:8px 0 0">Onze sugerido automaticamente (guarda-redes + 10 jogadores com mais acções, em 4-4-2). ${ed?'Ajuste em "Editar onze e formação".':''}</p>`:''}</div>
    <div class="view" style="gap:12px">
      ${best?`<div class="in good"><span class="tag">Melhor em campo</span><b>${esc((pl(best[0])||{}).name||'?')} · ${f1r(best[1].r)}</b></div>`:''}
      ${(()=>{ const fs=fieldState(m); if(!fs) return ''; const un=[...fs.bench].filter(id=>!rt[id]); return un.length?`<div><div class="sec-h" style="margin-bottom:6px">Banco (não utilizados)</div><div class="chips">${un.map(id=>`<span class="pill">${esc((pl(id)||{}).name||'?')}</span>`).join('')}</div></div>`:''; })()}
      ${others.length?`<div><div class="sec-h" style="margin-bottom:6px">Suplentes utilizados e outros</div>${others.map(([id,r])=>`<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)"><span>${r.inn?'<span class="lp-sub sm">↑</span> ':''}${esc((pl(id)||{}).name||'?')}</span><span class="rt ${rtCls(r.r)}">${f1r(r.r)}${r.manual?'*':''}</span></div>`).join('')}</div>`:''}
      <div class="legend" style="margin:0">${[['r1','< 6,0'],['r2','6,0–6,4'],['r3','6,5–6,9'],['r4','7,0–7,9'],['r5','8,0–8,9'],['r6','9,0+']].map(([c,l])=>`<span><span class="rt ${c}" style="min-width:0;padding:0 6px">&nbsp;</span>${l}</span>`).join('')}</div>
      <p class="note" style="margin:0">Nota automática: parte de 6,0 e soma por cada acção (recuperação +0,12 · perda −0,12 · passe errado −0,10 · falta cometida −0,08 · falta sofrida +0,05 · remate à baliza +0,18 · golo +1,1 · amarelo −0,3 · vermelho −1,2; guarda-redes: defesa +0,1 a +0,3, golo sofrido −0,35). * = nota acertada pelo treinador.</p>
    </div>
  </div>
  ${ed?`<details class="lu-ed"${S.luOpen?' open':''}><summary>Editar onze e formação</summary>
    <div class="formrow" style="margin:10px 0"><label class="fl">Formação<select class="inp" data-luform>${FORMS.map(f=>`<option ${f===lu.formation?'selected':''}>${f}</option>`).join('')}</select></label></div>
    <div class="formrow">${marks.map((mk,k)=>{ let lab='GR'; if(k>0){ let c=0,li=0; for(;li<lines.length;li++){ if(k-1<c+lines[li]) break; c+=lines[li]; } lab=(li===0?'Defesa':li===lines.length-1?'Ataque':(lines.length>3?(li===1?'Meio-campo recuado':'Meio-campo ofensivo'):'Meio-campo'))+' '+(k-c); } return `<label class="fl">${lab}<select class="inp" data-luslot="${k}"><option value="">—</option>${allPl.map(p=>`<option value="${p.id}" ${slots[k]===p.id?'selected':''}>${esc((p.num?p.num+' · ':'')+p.name)}</option>`).join('')}</select></label>`; }).join('')}</div>
    <div class="sec-h" style="margin-top:14px">Banco de suplentes</div>
    <div class="chips">${allPl.filter(p=>!slots.includes(p.id)).map(p=>{ const on=(lu.bench||[]).includes(p.id); return `<button type="button" class="chip ${on?'':'skip'}" data-lubench="${p.id}" aria-pressed="${on}">${on?'✓ ':''}${esc(p.name)}</button>`; }).join('')}</div>
    <div class="sec-h" style="margin-top:14px">Acertar notas à mão (opcional)</div>
    <div class="formrow">${Object.entries(rt).map(([id,r])=>`<label class="fl">${esc((pl(id)||{}).name||'?')} <span class="muted">(auto ${f1r(rateFor(m,id))})</span><input class="inp" type="number" min="0" max="10" step="0.1" data-luov="${id}" value="${r.manual?r.r:''}" placeholder="${f1r(rateFor(m,id))}"></label>`).join('')}</div>
    <p class="note">Deixe em branco para usar a nota automática.</p>
  </details>`:''}
  </section>`;
}
function rateFor(m,id){ const lu=lineupOf(m), o=lu.override; lu.override={}; const r=rateMatch(m)[id]; lu.override=o; return r?r.r:6; }
const initials = n => String(n||'').split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
function pitchVertical(){
  return `<svg class="lu-bg" viewBox="0 0 68 90" preserveAspectRatio="none" aria-hidden="true"><rect width="68" height="90" class="pg1"/>${Array.from({length:9},(_,i)=>`<rect x="0" y="${i*10}" width="68" height="5" class="pg2"/>`).join('')}
  <g class="pl"><rect x="1" y="1" width="66" height="88"/><line x1="1" y1="45" x2="67" y2="45"/><circle cx="34" cy="45" r="7"/><rect x="15" y="1" width="38" height="14"/><rect x="25" y="1" width="18" height="5"/><rect x="15" y="75" width="38" height="14"/><rect x="25" y="84" width="18" height="5"/></g></svg>`;
}
function fieldState(m){
  if(!m.lineup) return null;
  const on=new Set((m.lineup.slots||[]).filter(Boolean)), bench=new Set((m.lineup.bench||[]).filter(id=>!on.has(id)));
  for(const e of m.events) if(e.type==='subst'){ if(e.p){ on.delete(e.p); } if(e.p2){ on.add(e.p2); bench.delete(e.p2); } }
  return {on,bench};
}
function buildLineup(callup, formation){
  const posOrd={GR:0,DEF:1,MED:2,AV:3,'':2}, pl=id=>S.players.find(p=>p.id===id)||{};
  const tit=Object.keys(callup).filter(id=>callup[id]==='T'), ben=Object.keys(callup).filter(id=>callup[id]==='B');
  const gk=tit.find(id=>pl(id).pos==='GR')||tit[0]||null;
  const rest=tit.filter(id=>id!==gk).sort((a,b)=>posOrd[pl(a).pos||'']-posOrd[pl(b).pos||'']||(+pl(a).num||99)-(+pl(b).num||99));
  const n=formSize(formation), slots=[gk,...rest].slice(0,n); while(slots.length<n) slots.push(null);
  const extra=[gk,...rest].slice(n).filter(Boolean);
  return {formation,slots,bench:[...ben,...extra],override:{}};
}
function luChange(m){ if(!m.lineup){ const d=defaultLineup(m); m.lineup={formation:d.formation,slots:d.slots,override:{}}; } delete m.lineup.auto; return m.lineup; }

/* =========================================================
   ÉPOCA (1 de Julho a 30 de Junho)
   ========================================================= */
function seasonOf(d){ if(!d) return null; const [y,mo]=String(d).split('-').map(Number); return mo>=7?y:y-1; }
const seasonLabel = y => y==null?'—':`${y}/${String((y+1)%100).padStart(2,'0')}`;
function seasonsAvail(){ return [...new Set(teamMatches().map(m=>seasonOf(m.date)).filter(x=>x!=null))].sort((a,b)=>b-a); }
function seasonMatches(){
  const ss=seasonsAvail(); if(S.season==null||!ss.includes(S.season)) S.season=ss[0]??null;
  let list=teamMatches().filter(m=>seasonOf(m.date)===S.season).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  if(S.range==='last5') list=list.slice(-5);
  if(S.range==='30d'){ const lim=new Date(Date.now()-30*864e5).toISOString().slice(0,10); list=list.filter(m=>(m.date||'')>=lim); }
  return list;
}
function seasonPseudo(list){
  const ev=[]; let us=0,opp=0,unk=false;
  for(const m of list){ for(const e of m.events) ev.push({...e,id:m.id+':'+e.id,mid:m.id}); const p=possNow(m); us+=p.us; opp+=p.opp; if(m.scoreUnknown) unk=true; }
  return { id:'__season', season:true, home:S.team?S.team.name:'', opp:'', date:'', halfLen:(S.team&&S.team.half_len)||45, events:ev,
    clock:{half:2,running:false,startedAt:null,base:0}, poss:{cur:null,since:null,us,opp}, scoreUnknown:unk&&!ev.some(e=>e.type==='golo'||e.type==='golo_adv'),
    note:'', ai:null, n:list.length, list };
}
const rangeLabel = () => ({all:'época inteira','30d':'últimos 30 dias',last5:'últimos 5 jogos'})[S.range];
function curAnalysis(){ return S.scope==='epoca' ? seasonPseudo(seasonMatches()) : M(); }
function scopeBar(){
  const ss=seasonsAvail();
  return `<div class="row" style="gap:10px">
    <span class="seg"><button aria-pressed="${S.scope==='jogo'}" data-scope="jogo">Este jogo</button><button aria-pressed="${S.scope==='epoca'}" data-scope="epoca">Época</button></span>
    ${S.scope==='epoca'?`<select class="inp" id="selSeason" style="width:auto" aria-label="Época">${ss.map(y=>`<option value="${y}" ${y===S.season?'selected':''}>Época ${seasonLabel(y)}</option>`).join('')||'<option>Sem jogos</option>'}</select>
    <span class="seg">${[['all','Época'],['30d','30 dias'],['last5','Últimos 5']].map(([k,l])=>`<button aria-pressed="${S.range===k}" data-range="${k}">${l}</button>`).join('')}</span>`:''}
  </div>`;
}
function seasonPlayers(list){
  const acc={};
  for(const p of players()) acc[p.id]={id:p.id,name:p.name,num:p.num,gk:p.pos==='GR',jogos:0,rec:0,perda:0,pe:0,fc:0,fs:0,shot:0,golos:0,saldo:0,series:[],rs:0,rn:0};
  for(const m of list){
    const rows=Object.fromEntries(indiv(m).map(r=>[r.id,r])), rts=rateMatch(m);
    for(const id of new Set([...Object.keys(acc),...Object.keys(rows)])){
      const r=rows[id]; const a=acc[id]||(acc[id]={id,name:r?r.name:'?',num:'',gk:false,jogos:0,rec:0,perda:0,pe:0,fc:0,fs:0,shot:0,golos:0,saldo:0,series:[],rs:0,rn:0});
      if(rts[id]){ a.rs+=rts[id].r; a.rn++; }
      if(r && r.act>0){ a.jogos++; for(const k of ['rec','perda','pe','fc','fs','shot','golos','saldo']) a[k]+=r[k]; a.series.push(r.saldo); } else a.series.push(null);
    }
  }
  for(const a of Object.values(acc)){ const j=a.jogos||1; a.rec_j=a.rec/j; a.perda_j=a.perda/j; a.pe_j=a.pe/j; a.saldo_j=a.jogos?a.saldo/j:0; a.nota=a.rn?a.rs/a.rn:0; }
  return Object.values(acc);
}
function spark(series){
  const pts=series.map((v,i)=>[i,v]).filter(p=>p[1]!=null); if(pts.length<2) return '<span class="muted small">—</span>';
  const W=96,H=26,n=Math.max(1,series.length-1), vals=pts.map(p=>p[1]), mn=Math.min(0,...vals), mx=Math.max(0,...vals), rg=(mx-mn)||1;
  const X=i=>2+i/n*(W-4), Y=v=>H-3-(v-mn)/rg*(H-6), d=pts.map((p,k)=>(k?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' '), last=pts[pts.length-1];
  const col=last[1]>=0?'var(--good)':'var(--bad)';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo jogo a jogo: ${vals.join(', ')}"><line x1="2" x2="${W-2}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="2.4" fill="${col}"/></svg>`;
}
function vIndSeason(){
  const list=seasonMatches();
  if(!list.length) return `<div class="view"><div class="mhead"><div><h1>Época</h1><div class="meta">${esc(S.team.name)}</div></div><div class="sp">${scopeBar()}</div></div><div class="card empty"><h2>Sem jogos neste período</h2><p class="muted">Escolha outra época ou outro filtro.</p></div></div>`;
  const rows=seasonPlayers(list).filter(r=>r.jogos>0||!r.gk), k=S.sortS.k, d=S.sortS.d;
  rows.sort((a,b)=>k==='name'?a.name.localeCompare(b.name)*d:((a[k]||0)-(b[k]||0))*d);
  const th=(key,l,cls='')=>`<th class="sortable ${cls}" data-sorts="${key}" ${k===key?`aria-sort="${d>0?'ascending':'descending'}"`:''}>${l}${k===key?(d>0?' ▲':' ▼'):''}</th>`;
  const f1=v=>v.toFixed(1).replace('.',','), sg=v=>(v>0?'+':'')+v, sc=v=>v>0?'var(--good)':v<0?'var(--bad)':'var(--muted)';
  const mx={rec:Math.max(1,...rows.map(r=>r.rec)),perda:Math.max(1,...rows.map(r=>r.perda)),pe:Math.max(1,...rows.map(r=>r.pe))};
  const tot=key=>rows.reduce((a,r)=>a+r[key],0);
  return `<div class="view">
  <div class="mhead"><div><h1>Época ${seasonLabel(S.season)}</h1><div class="meta">${esc(S.team.name)} · ${list.length} jogo(s) · ${rangeLabel()} · de ${esc(fmtDate(list[0].date))} a ${esc(fmtDate(list[list.length-1].date))}</div></div>
    <div class="sp row">${scopeBar()}<button class="btn" data-exp="epoca">Exportar época (CSV)</button></div></div>
  <section class="card"><div class="tscroll"><table class="st">
    <thead><tr><th></th><th></th><th colspan="2" class="band">Recuperações</th><th colspan="2">Perdas</th><th colspan="2" class="band">Passes errados</th><th>Faltas</th><th>Faltas</th><th></th><th></th><th colspan="2" class="band">Saldo de bola</th><th></th><th></th></tr>
    <tr>${th('name','Jogador')}${th('jogos','Jogos')}${th('rec','Total','band')}${th('rec_j','/jogo','band')}${th('perda','Total')}${th('perda_j','/jogo')}${th('pe','Total','band')}${th('pe_j','/jogo','band')}${th('fc','Com.')}${th('fs','Sofr.')}${th('shot','Remates')}${th('golos','Golos')}${th('saldo','Total','band')}${th('saldo_j','/jogo','band')}<th>Evolução</th>${th('nota','Nota média')}</tr></thead>
    <tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b>${r.num?` <span class="muted mono">${esc(r.num)}</span>`:''}${r.gk?' <span class="role">GR</span>':''}</td><td>${r.jogos}</td>
      <td class="band">${heat(r.rec,mx.rec,'var(--good)')}</td><td class="band">${f1(r.rec_j)}</td><td>${heat(r.perda,mx.perda,'var(--red)')}</td><td>${f1(r.perda_j)}</td><td class="band">${heat(r.pe,mx.pe,'var(--pe)')}</td><td class="band">${f1(r.pe_j)}</td>
      <td>${r.fc}</td><td>${r.fs}</td><td>${r.shot}</td><td>${r.golos||''}</td>
      <td class="band"><b style="color:${sc(r.saldo)}">${sg(r.saldo)}</b></td><td class="band" style="color:${sc(r.saldo_j)}">${r.saldo_j>0?'+':''}${f1(r.saldo_j)}</td><td>${spark(r.series)}</td><td>${r.rn?`<span class="rt ${rtCls(r.nota)}">${f1r(r.nota)}</span>`:'—'}</td></tr>`).join('')}
    <tr><td><b>TOTAL EQUIPA</b></td><td>${list.length}</td><td class="tot band">${tot('rec')}</td><td class="band">${f1(tot('rec')/list.length)}</td><td class="tot">${tot('perda')}</td><td>${f1(tot('perda')/list.length)}</td><td class="tot band">${tot('pe')}</td><td class="band">${f1(tot('pe')/list.length)}</td><td class="tot">${tot('fc')}</td><td class="tot">${tot('fs')}</td><td class="tot">${tot('shot')}</td><td class="tot">${tot('golos')}</td><td class="tot band">${sg(tot('saldo'))}</td><td class="band">${f1(tot('saldo')/list.length)}</td><td></td><td></td></tr>
    </tbody></table></div>
    <p class="note" style="margin:8px 0 0">"Jogos" conta os jogos em que o jogador tem pelo menos uma acção registada. Médias /jogo calculadas sobre esses jogos. Evolução = saldo de bola jogo a jogo (recuperações − perdas − passes errados), o ponto final é o jogo mais recente.</p></section>
  <section class="card"><h2>Jogos incluídos</h2><div class="tscroll"><table class="st"><thead><tr><th class="l">Data</th><th class="l">Jogo</th><th>Acções</th><th>Rec.</th><th>Perdas</th><th>P. err.</th><th>Saldo</th><th></th></tr></thead><tbody>
    ${[...list].reverse().map(m=>{ const s=stats(m), sl=s.rec.t-s.perda.t-s.pe.t, scr=score(m); return `<tr><td class="l">${esc(fmtDate(m.date))}</td><td class="l">${esc(m.home)} ${scr?scr.join('–'):'vs'} ${esc(m.opp)}</td><td>${m.events.length}</td><td>${s.rec.t}</td><td>${s.perda.t}</td><td>${s.pe.t}</td><td><b style="color:${sc(sl)}">${sg(sl)}</b></td><td><button class="btn sm" data-openscope="${m.id}">Ver jogo</button></td></tr>`; }).join('')}
  </tbody></table></div></section></div>`;
}

/* =========================================================
   AUTOANÁLISE — avaliação do desempenho da própria equipa
   ========================================================= */
const AREAS=[['org_of','Organização ofensiva'],['org_def','Organização defensiva'],['tr_def','Transição ataque → defesa'],['tr_of','Transição defesa → ataque'],['bp','Bolas paradas'],['atit','Atitude e intensidade']];
const clamp01 = v => Math.max(0,Math.min(1,v));
function kpis(m){
  const s=stats(m), n=m.season?Math.max(1,m.n):1, pct=(a,b)=>b?a/b*100:null;
  const R=s.rec.t, L=s.perda.t+s.pe.t, lossDef=s.perda.def[0]+s.perda.def[1]+s.pe.def[0]+s.pe.def[1];
  const on=s.shots.baliza[0]+s.shots.baliza[1], atkShot=s.atk.cons.rb[0]+s.atk.cons.rb[1]+s.atk.cons.rfi[0]+s.atk.cons.rfi[1];
  const sc=score(m);
  return [
    {k:'saldo',l:'Saldo de bola por jogo',v:(R-L)/n,fmt:v=>(v>0?'+':'')+v.toFixed(1).replace('.',','),meta:5,dir:1,metaTxt:'≥ +5',sc:v=>clamp01((v+10)/30),ok:R+L>0},
    {k:'recof',l:'Recuperações no último terço',v:pct(s.rec.ofen[0]+s.rec.ofen[1],R),fmt:v=>Math.round(v)+'%',meta:15,dir:1,metaTxt:'≥ 15%',sc:v=>clamp01(v/25),ok:R>0},
    {k:'lossdef',l:'Perdas e p. errados na zona defensiva',v:pct(lossDef,L),fmt:v=>Math.round(v)+'%',meta:15,dir:-1,metaTxt:'≤ 15%',sc:v=>clamp01(1-v/30),ok:L>0},
    {k:'shoton',l:'Remates enquadrados',v:pct(on,s.shots.t),fmt:v=>Math.round(v)+'%',meta:45,dir:1,metaTxt:'≥ 45%',sc:v=>clamp01(v/60),ok:s.shots.t>0},
    {k:'atkshot',l:'Ataques que terminam em remate',v:pct(atkShot,s.atk.t),fmt:v=>Math.round(v)+'%',meta:35,dir:1,metaTxt:'≥ 35%',sc:v=>clamp01(v/50),ok:s.atk.t>0},
    {k:'fc',l:'Faltas cometidas por jogo',v:s.fc.t/n,fmt:v=>v.toFixed(1).replace('.',','),meta:12,dir:-1,metaTxt:'≤ 12',sc:v=>clamp01(1-(v-6)/14),ok:m.events.length>0},
    {k:'gd',l:'Diferença de golos por jogo',v:sc?(sc[0]-sc[1])/n:null,fmt:v=>(v>0?'+':'')+v.toFixed(1).replace('.',','),meta:0,dir:1,metaTxt:'≥ 0',sc:v=>clamp01((v+3)/6),ok:!!sc},
  ].filter(x=>x.ok&&x.v!=null);
}
function kStatus(x){ const d=(x.v-x.meta)*x.dir, tol=Math.abs(x.meta)*0.2||1; return d>=0?'good':d>=-tol?'warn':'bad'; }
const ST_L={good:'Cumpre',warn:'Perto',bad:'Abaixo'};
function matchIndex(m){ const ks=kpis(m); if(!ks.length) return null; return Math.round(ks.reduce((a,x)=>a+x.sc(x.v),0)/ks.length*100)/10; }
function selfAvg(m){ const r=m.self&&m.self.ratings; if(!r) return null; const v=Object.values(r).filter(x=>x>0); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; }
function idxChart(list){
  const pts=list.map(m=>({m,v:matchIndex(m),c:selfAvg(m)})).filter(p=>p.v!=null);
  if(pts.length<2) return '<p class="note">O gráfico de evolução aparece a partir de 2 jogos com acções registadas.</p>';
  const W=1100,H=230,L=40,R=48,T=22,B=40, n=pts.length-1, X=i=>L+(n?i/n:0)*(W-L-R), Y=v=>T+(1-v/10)*(H-T-B);
  let g=''; for(const v of [0,2.5,5,7.5,10]) g+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${String(v).replace('.',',')}</text>`;
  const path=pts.map((p,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ');
  const area=path+` L${X(n).toFixed(1)} ${Y(0)} L${X(0).toFixed(1)} ${Y(0)} Z`;
  const cpts=pts.map((p,i)=>p.c!=null?[X(i),Y(p.c*2)]:null).filter(Boolean);
  const cpath=cpts.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' ');
  const anc=i=>i===0?'start':i===n?'end':'middle';
  const lbl=pts.map((p,i)=>`<text x="${X(i)}" y="${H-B+16}" text-anchor="${anc(i)}" font-size="10.5" fill="var(--muted)">${esc((p.m.date||'').slice(8,10)+'/'+(p.m.date||'').slice(5,7))}</text><text x="${X(i)}" y="${H-B+29}" text-anchor="${anc(i)}" font-size="10" fill="var(--muted)">${esc(short(p.m.opp).slice(0,10))}</text>`).join('');
  return `<div class="tscroll"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:520px;max-height:280px;height:auto" role="img" aria-label="Evolução da nota por jogo">${g}
    <path d="${area}" fill="var(--red)" opacity=".08"/><path d="${path}" fill="none" stroke="var(--red)" stroke-width="2.4" stroke-linejoin="round"/>
    ${cpts.length>1?`<path d="${cpath}" fill="none" stroke="var(--opp)" stroke-width="2" stroke-dasharray="5 4"/>`:''}
    ${pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.v)}" r="${i===n?5:3.5}" fill="var(--red)" stroke="var(--card)" stroke-width="1.5"><title>${esc(p.m.opp)}: ${String(p.v).replace('.',',')}</title></circle>`).join('')}
    <text x="${X(n)}" y="${Y(pts[n].v)-12}" text-anchor="end" font-size="13" font-weight="700" fill="var(--ink)">${String(pts[n].v).replace('.',',')}</text>${lbl}</svg></div>
    <div class="legend"><span><i style="background:var(--red)"></i>Nota objectiva (0–10)</span>${cpts.length>1?'<span><i style="background:var(--opp)"></i>Avaliação do treinador (×2)</span>':''}</div>`;
}
function vAuto(){
  const list=seasonMatches().filter(m=>m.events.length);
  if(!list.length) return `<div class="view"><div class="mhead"><div><h1>Autoanálise</h1><div class="meta">${esc(S.team.name)}</div></div><div class="sp">${scopeBarAuto()}</div></div><div class="card empty"><h2>Sem jogos registados neste período</h2><p class="muted">A autoanálise aparece quando houver jogos com acções registadas.</p></div></div>`;
  const P=seasonPseudo(list), ks=kpis(P), idx=matchIndex(P);
  const last=list[list.length-1], lk=Object.fromEntries(kpis(last).map(x=>[x.k,x]));
  const ranked=ks.map(x=>({x,d:(x.v-x.meta)*x.dir/(Math.abs(x.meta)||5)})).sort((a,b)=>b.d-a.d);
  const strong=ranked.filter(r=>r.d>=0).slice(0,2), weak=ranked.filter(r=>r.d<0).slice(-2).reverse();
  if(!S.autoM||!list.find(m=>m.id===S.autoM)) S.autoM=(M()&&list.find(m=>m.id===S.cur))?S.cur:last.id;
  const am=S.matches[S.autoM], ro=matchRO(am), sf=am.self||{ratings:{}};
  const areaAvg=AREAS.map(([k,l])=>{ const v=list.map(m=>m.self&&m.self.ratings&&m.self.ratings[k]).filter(x=>x>0); return [k,l,v.length?v.reduce((a,b)=>a+b,0)/v.length:null,v.length]; });
  const f1=v=>v.toFixed(1).replace('.',',');
  const grade=v=>v>=7?'good':v>=5?'warn':'bad';
  return `<div class="view">
  <div class="mhead"><div><h1>Autoanálise</h1><div class="meta">${esc(S.team.name)} · Época ${seasonLabel(S.season)} · ${rangeLabel()} · ${list.length} jogo(s) avaliados</div></div><div class="sp">${scopeBarAuto()}</div></div>
  <div class="g-map">
    <section class="card"><h2>Metas da equipa<span class="sp"></span><span class="pill">Nota global ${idx!=null?f1(idx):'—'} / 10</span></h2>
      <div class="tscroll"><table class="st"><thead><tr><th class="l">Indicador</th><th>Período</th><th>Meta</th><th>Estado</th><th>Último jogo</th></tr></thead><tbody>
      ${ks.map(x=>{ const st=kStatus(x), l=lk[x.k]; const tr=l?((l.v-x.v)*x.dir>0.001?'▲':(l.v-x.v)*x.dir<-0.001?'▼':'='):''; return `<tr><td class="l"><b>${x.l}</b></td><td class="tot">${x.fmt(x.v)}</td><td class="muted">${x.metaTxt}</td><td><span class="pill st-${st}">${ST_L[st]}</span></td><td>${l?`${l.fmt(l.v)} <span style="color:${tr==='▲'?'var(--good)':tr==='▼'?'var(--bad)':'var(--muted)'}">${tr}</span>`:'—'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="note" style="margin:8px 0 0">"Último jogo" compara o jogo mais recente com a média do período (▲ melhor, ▼ pior). A nota de 0 a 10 é a média dos indicadores, cada um convertido numa escala de 0 a 1.</p></section>
    <section class="view" style="gap:16px">
      <div class="card"><h2>Pontos fortes</h2>${strong.length?strong.map(r=>`<div class="in good" style="margin-bottom:8px"><b>${r.x.l}</b><p>${r.x.fmt(r.x.v)} (meta ${r.x.metaTxt}). Manter o que está a funcionar e usar como referência no treino.</p></div>`).join(''):'<p class="note">Nenhum indicador cumpre ainda a meta neste período.</p>'}</div>
      <div class="card"><h2>A melhorar</h2>${weak.length?weak.map(r=>`<div class="in bad" style="margin-bottom:8px"><b>${r.x.l}</b><p>${r.x.fmt(r.x.v)} (meta ${r.x.metaTxt}). Prioridade para o microciclo: exercícios específicos e objectivo claro para o próximo jogo.</p></div>`).join(''):'<p class="note">Todos os indicadores cumprem a meta. Subir a fasquia.</p>'}</div>
    </section>
  </div>
  <section class="card"><h2>Evolução jogo a jogo</h2>${idxChart(list)}
    <div class="tscroll" style="margin-top:10px"><table class="st"><thead><tr><th class="l">Data</th><th class="l">Jogo</th><th>Resultado</th><th>Nota</th><th>Saldo</th><th>Remates</th><th>Avaliação treinador</th><th></th></tr></thead><tbody>
    ${[...list].reverse().map(m=>{ const v=matchIndex(m), s=stats(m), sl=s.rec.t-s.perda.t-s.pe.t, scr=score(m), ca=selfAvg(m); return `<tr ${m.id===S.autoM?'style="background:var(--soft)"':''}><td class="l">${esc(fmtDate(m.date))}</td><td class="l">${esc(m.home)} vs ${esc(m.opp)}</td><td>${scr?scr.join('–'):'—'}</td><td><span class="pill st-${v!=null?grade(v):''}">${v!=null?f1(v):'—'}</span></td><td>${sl>0?'+':''}${sl}</td><td>${s.shots.t}</td><td>${ca!=null?f1(ca)+' / 5':'<span class="muted">por fazer</span>'}</td><td><button class="btn sm ${m.id===S.autoM?'pri':''}" data-autom="${m.id}">${ca!=null?'Ver avaliação':'Avaliar'}</button></td></tr>`; }).join('')}
    </tbody></table></div></section>
  <div class="g2">
    <section class="card"><h2>Avaliação do treinador · ${esc(am.home)} vs ${esc(am.opp)} · ${esc(fmtDate(am.date))}</h2>
      <form id="selfForm" class="view" style="gap:12px">
        ${AREAS.map(([k,l])=>`<div class="row" style="justify-content:space-between"><span style="font-weight:600">${l}</span><span class="seg">${[1,2,3,4,5].map(n=>`<button type="button" aria-pressed="${(sf.ratings||{})[k]===n}" data-rate="${k}" data-n="${n}" ${ro?'disabled':''}>${n}</button>`).join('')}</span></div>`).join('')}
        <p class="note" style="margin:0">1 = muito fraco · 3 = razoável · 5 = excelente</p>
        <label class="fl">O que correu bem<textarea class="inp" id="sf-bem" rows="2" ${ro?'disabled':''}>${esc(sf.bem||'')}</textarea></label>
        <label class="fl">O que temos de melhorar<textarea class="inp" id="sf-mel" rows="2" ${ro?'disabled':''}>${esc(sf.melhorar||'')}</textarea></label>
        <label class="fl">Objectivos para o próximo jogo<textarea class="inp" id="sf-obj" rows="2" ${ro?'disabled':''}>${esc(sf.objetivos||'')}</textarea></label>
        ${ro?`<p class="note">${am.locked?'Jogo trancado: avaliação só de consulta.':'O seu perfil é só de leitura.'}</p>`:`<div class="row"><button class="btn pri" type="submit">Gravar avaliação</button>${sf.at?`<span class="note">Gravada em ${new Date(sf.at).toLocaleString('pt-PT')}${sf.by?' por '+esc(sf.by):''}</span>`:''}</div>`}
      </form></section>
    <section class="card"><h2>Média da avaliação do treinador no período</h2>
      ${areaAvg.some(a=>a[2]!=null)?`<div class="bars">${areaAvg.map(([k,l,v,c])=>`<div class="bar" style="grid-template-columns:190px minmax(0,1fr) 54px"><span>${l}</span><span class="tr"><i style="width:${v!=null?v/5*100:0}%;background:${v==null?'var(--line)':v>=4?'var(--good)':v>=3?'var(--pe)':'var(--red)'}"></i></span><span class="v">${v!=null?f1(v):'—'}</span></div>`).join('')}</div>
      <p class="note" style="margin:10px 0 0">Compare com as metas objectivas: se o treinador avalia bem uma área que os números mostram fraca, é um sinal para rever as imagens do jogo.</p>`:'<p class="note">Ainda não há avaliações do treinador neste período. Escolha um jogo na tabela acima e carregue em "Avaliar".</p>'}
    </section>
  </div></div>`;
}
function selfDraft(){ const g=id=>$(id)?$(id).value:undefined; const o={}; if(g('sf-bem')!==undefined){ o.bem=g('sf-bem'); o.melhorar=g('sf-mel'); o.objetivos=g('sf-obj'); } return o; }
function scopeBarAuto(){
  const ss=seasonsAvail();
  return `<div class="row" style="gap:10px"><select class="inp" id="selSeason" style="width:auto" aria-label="Época">${ss.map(y=>`<option value="${y}" ${y===S.season?'selected':''}>Época ${seasonLabel(y)}</option>`).join('')||'<option>Sem jogos</option>'}</select>
    <span class="seg">${[['all','Época'],['30d','30 dias'],['last5','Últimos 5']].map(([k,l])=>`<button aria-pressed="${S.range===k}" data-range="${k}">${l}</button>`).join('')}</span></div>`;
}

/* =========================================================
   RENDER
   ========================================================= */
const VIEWS=[['registo','Registo ao vivo',()=>canEdit()],['analise','Análise',()=>true],['individual','Individual',()=>true],['auto','Autoanálise',()=>true],['jogos','Jogos',()=>true],['plantel','Plantel',()=>true],['clube','Clube',()=>isAdmin()],['admin','Super-admin',()=>S.isSuper],['conta','A minha conta',()=>true]];
function view(){ const h=location.hash.slice(1); const v=VIEWS.find(x=>x[0]===h&&x[2]()); return v?h:(canEdit()?'registo':'analise'); }
function render(){
  const app=$('app');
  if(!S.session){ $('hdr').hidden=true; app.innerHTML=vLogin(); return; }
  $('hdr').hidden=false;
  renderHeader();
  const v=view();
  $('tabs').innerHTML=VIEWS.filter(x=>x[2]()).map(([k,l])=>`<a href="#${k}" ${k===v?'aria-current="page"':''}>${l}</a>`).join('');
  if(v==='admin'){ app.innerHTML=vSuper(); return; }
  if(v==='conta'){ app.innerHTML=vConta(); return; }
  if(!S.club){ app.innerHTML=`<div class="card empty"><h2>Sem clube associado</h2><p class="muted">${S.isSuper?'Crie o primeiro clube na área Super-admin.':'A sua conta ainda não foi associada a nenhum clube. Peça acesso ao administrador do seu clube.'}</p>${S.isSuper?'<a class="btn pri" href="#admin">Abrir Super-admin</a>':''}</div>`; return; }
  if(!clubActive(S.club) && !S.isSuper){ app.innerHTML=`<div class="card empty"><h2>Acesso suspenso</h2><p class="muted">O acesso do ${esc(S.club.name)} está suspenso${S.club.paid_until&&S.club.paid_until<today()?' por mensalidade em atraso':''}. Contacte a M Arte Design: +351 934 574 197 · marinho_ribeiro@hotmail.com</p></div>`; return; }
  if(v==='clube'){ app.innerHTML=vClube(); return; }
  if(!S.team){ app.innerHTML=`<div class="card empty"><h2>Sem equipas</h2><p class="muted">${isAdmin()?'Crie a primeira equipa ou escalão na área Clube.':'O clube ainda não tem equipas criadas.'}</p>${isAdmin()?'<a class="btn pri" href="#clube">Abrir Clube</a>':''}</div>`; return; }
  const m=M();
  if(v==='plantel') app.innerHTML=vPlantel();
  else if(v==='analise'&&S.scope==='epoca') app.innerHTML=vAnaliseSeason();
  else if(v==='individual'&&S.scope==='epoca') app.innerHTML=vIndSeason();
  else if(v==='auto') app.innerHTML=vAuto();
  else if(v==='jogos'||!m) app.innerHTML=vJogos();
  else if(v==='registo') app.innerHTML=vRegisto(m);
  else if(v==='analise') app.innerHTML=vAnalise(m);
  else if(v==='individual') app.innerHTML=vIndividual(m);
  const pv=$('livePitch'); if(pv) pv.addEventListener('click',pitchClick);
}
function renderHeader(){
  const sc=$('selClub'), st=$('selTeam');
  const showClub = S.clubs.length>1 || S.isSuper;
  sc.hidden=!showClub || !S.clubs.length;
  sc.innerHTML=S.clubs.map(c=>`<option value="${c.id}" ${S.club&&c.id===S.club.id?'selected':''}>${esc(c.name)}${c.status!=='ativo'?' (suspenso)':''}</option>`).join('');
  st.hidden=!S.teams.length;
  st.innerHTML=S.teams.map(t=>`<option value="${t.id}" ${S.team&&t.id===S.team.id?'selected':''}>${esc(t.name)}</option>`).join('');
  $('hdrClub').textContent = S.club ? S.club.name : 'Análise de jogo';
  const r=myRole();
  $('hdrUser').innerHTML = `${esc(S.profile.full_name||S.profile.email)} <span class="role ${r==='super'?'super':r==='admin'?'admin':''}">${r==='super'?'Super-admin':ROLE_L[r]||'—'}</span>`;
  const m=M(), el=$('hdrScore');
  if(!m||['admin','conta','clube'].includes(view())){ el.innerHTML=''; return; }
  const s=score(m);
  el.innerHTML=`<span class="tm">${esc(m.home)}</span><span class="sc">${s?s[0]+' – '+s[1]:'– : –'}</span><span class="tm">${esc(m.opp)}</span><span class="clock" id="hdrClock">${fmtClock(elapsed(m))}<small>${m.clock.half}ª P</small></span>`;
}
setInterval(()=>{ const m=M(); if(!m||!m.clock.running) return; const c=$('hdrClock'); if(c) c.innerHTML=fmtClock(elapsed(m))+`<small>${m.clock.half}ª P</small>`;
  const p=possNow(m),pt=p.us+p.opp,a=$('posUs'),b=$('posOpp'),bar=$('posBar'); if(a) a.textContent=fmtClock(p.us); if(b) b.textContent=fmtClock(p.opp); if(bar&&pt) bar.style.width=(p.us/pt*100)+'%'; },500);

function vLogin(){
  return `<div class="login"><form class="box" id="loginForm">
    <div class="logo">M <span>Arte</span> FC</div>
    <p class="muted" style="margin:0">Registo e análise de jogo. Entre com a conta que o seu clube lhe deu.</p>
    <label class="fl">Email<input class="inp" id="lg-email" type="email" autocomplete="username" required></label>
    <label class="fl">Palavra-passe<input class="inp" id="lg-pass" type="password" autocomplete="current-password" required></label>
    ${S.loginErr?`<div class="err">${esc(S.loginErr)}</div>`:''}
    <button class="btn pri" type="submit" style="padding:11px">Entrar</button>
    <p class="note" style="margin:0">Esqueceu-se da palavra-passe? Peça ao administrador do seu clube para a repor.</p>
    <p class="note small" style="margin:0">M Arte Design · Esposende</p>
  </form></div>`;
}

function vRegisto(m){
  const ro=matchRO(m), st=curStep(), pd=S.pending, p=possNow(m), pt=p.us+p.opp;
  const evH=m.events.filter(e=>e.half===m.clock.half);
  const marks=m.events.slice(-14).filter(e=>e.x!=null).map(e=>({x:e.x,y:e.y,c:ACT[e.type].c}));
  if(pd&&pd.e.x!=null) marks.push({x:pd.e.x,y:pd.e.y,c:'#fff',r:1.6});
  let stepHtml='';
  if(pd){ const a=ACT[pd.type]; let body='',prompt='';
    if(st==='loc'){ prompt='Toque no campo onde aconteceu'; body=`<div class="chips"><button class="chip skip" data-skiploc>Sem localização</button></div>`; }
    else if(st==='player'||st==='player2'){ prompt=pd.type==='subst'?(st==='player'?'Quem sai?':'Quem entra?'):'Que jogador?';
      const pls=players().filter(x=>x.active!==false).sort((x,y)=>(y.pos==='GR'?1:0)-(x.pos==='GR'?1:0)||(+x.num||99)-(+y.num||99));
      const chipB=pl=>`<button class="chip ${pl.pos==='GR'?'gk':''}" data-pl="${pl.id}"><span class="n">${esc(pl.num||'')}</span>${esc(pl.name)}</button>`;
      const fs=fieldState(m);
      if(!fs) body=`<div class="chips">${pls.map(chipB).join('')}<button class="chip skip" data-pl="">Sem jogador</button></div>`;
      else { const onL=pls.filter(p=>fs.on.has(p.id)), bL=pls.filter(p=>fs.bench.has(p.id)), oL=pls.filter(p=>!fs.on.has(p.id)&&!fs.bench.has(p.id));
        const grp=(t,l,open)=>l.length?`<div class="cu-grp"><span class="cu-lab">${t}</span><div class="chips">${l.map(chipB).join('')}</div></div>`:'';
        if(pd.type==='subst'&&st==='player') body=grp('Em campo',onL)+`<div class="chips"><button class="chip skip" data-pl="">Sem jogador</button></div>`;
        else if(pd.type==='subst'&&st==='player2') body=grp('Banco',bL)+(oL.length?`<details><summary class="note">Outros jogadores do plantel</summary>${grp('',oL)}</details>`:'')+`<div class="chips"><button class="chip skip" data-pl="">Sem jogador</button></div>`;
        else body=grp('Em campo',onL)+`<div class="chips"><button class="chip skip" data-pl="">Sem jogador</button></div>`+((bL.length||oL.length)?`<details><summary class="note">Banco e outros</summary>${grp('Banco',bL)}${grp('Outros',oL)}</details>`:'');
      } }
    else if(st==='sub'){ prompt=pd.type==='ataque'?'Como terminou o ataque?':pd.type==='canto'?'Para onde foi o canto?':'Tipo de remate'; body=`<div class="chips">${a.subs.map(([k,l])=>`<button class="chip" data-v="sub" data-k="${k}">${l}</button>`).join('')}</div>`; }
    else if(st==='corr'){ prompt='Por que corredor?'; body=`<div class="chips">${CORR.map(([k,l])=>`<button class="chip" data-v="corr" data-k="${k}">${l}</button>`).join('')}</div>`; }
    else if(st==='cons'){ prompt='Consequência'; body=`<div class="chips">${CONS.map(([k,l])=>`<button class="chip ${k==='nada'?'skip':''}" data-v="cons" data-k="${k}">${l}</button>`).join('')}</div>`; }
    stepHtml=`<div class="step"><div class="sh"><span class="pill">${minuteLabel(m,pd.e.half,pd.e.t)}</span><b>${a.l}</b><span class="muted">${prompt}</span><button class="btn sm ghost sp" data-cancel>Cancelar</button></div>${body}</div>`;
  } else stepHtml = ro ? `<div class="lockbanner">${m.locked?'Jogo trancado pelo administrador do clube. Só é possível consultar.':'O seu perfil é só de leitura.'}</div>` : `<div class="idle">Escolha uma acção à esquerda (ou use o atalho de teclado). O minuto é registado no momento do toque.</div>`;
  const s=stats(m);
  return `<div class="live ${ro?'readonly':''}">
  <section class="card pad">
    <h3>Jogo · ${m.clock.half}ª parte</h3>
    <div class="ctrl"><button class="btn ${m.clock.running?'dark':'pri'}" data-clock>${m.clock.running?'Pausa':(elapsed(m)>0?'Retomar':'Iniciar '+m.clock.half+'ª')}</button>
      <button class="btn" data-endhalf ${m.status==='terminado'?'disabled':''}>${m.clock.half===1?'Fim 1ª parte':'Fim do jogo'}</button></div>
    <div class="poss"><button class="us ${m.poss.cur==='us'?'on':''}" data-poss="us"><b>Posse ${esc(short(m.home))}</b><span id="posUs">${fmtClock(p.us)}</span></button>
      <button class="opp ${m.poss.cur==='opp'?'on':''}" data-poss="opp"><b>Posse ${esc(short(m.opp))}</b><span id="posOpp">${fmtClock(p.opp)}</span></button></div>
    <div class="pbar"><i id="posBar" style="width:${pt?p.us/pt*100:50}%"></i></div>
    ${PAD.map(([g,keys])=>`<h3>${g}</h3><div class="acts">${keys.map(k=>`<button class="act ${ACT[k].opp?'opp':''} ${pd&&pd.type===k?'sel':''}" data-act="${k}"><span class="dot" style="background:${ACT[k].c}"></span>${ACT[k].l}${ACT[k].k?`<kbd>${ACT[k].k}</kbd>`:''}</button>`).join('')}</div>`).join('')}
  </section>
  <section class="view" style="gap:12px;min-width:0">${stepHtml}
    <div class="card"><div class="pitchwrap ${st==='loc'?'pick':''}">${pitchSVG({markers:marks,id:'livePitch'})}</div>
      <div class="mini"><div><b>${count(evH,e=>e.type==='rec')}</b><span>Recuperações</span></div><div><b>${count(evH,e=>e.type==='perda')}</b><span>Perdas</span></div><div><b>${count(evH,e=>e.type==='pe')}</b><span>Passes errados</span></div><div><b>${count(evH,isShot)}</b><span>Remates</span></div></div>
      <p class="note" style="margin:10px 0 0">Valores da ${m.clock.half}ª parte. Jogo inteiro: ${s.rec.t} rec. · ${s.perda.t} perdas · ${s.pe.t} p. errados · ${s.shots.t} remates · ${s.atk.t} ataques.</p></div>
  </section>
  <section class="card logcol"><h2>Registo <span class="pill">${m.events.length}</span><span class="sp"></span><button class="btn sm" data-undo ${m.events.length&&!ro?'':'disabled'}>Anular último</button></h2>
    <ul class="log">${m.events.length?[...m.events].reverse().slice(0,150).map(e=>logItem(m,e,ro)).join(''):'<li class="muted" style="display:block">Nenhuma acção registada.</li>'}</ul></section></div>`;
}
const short = n => { n=String(n||''); return n.length>10?n.split(' ')[0]:n; };
function logItem(m,e,ro){
  const a=ACT[e.type],d=[]; if(e.sub) d.push(lab(a.subs||[],e.sub)); if(e.corr) d.push(lab(CORR,e.corr)); if(e.z) d.push(ZN[e.z]); if(e.cons) d.push('→ '+lab(CONS,e.cons));
  if(e.type==='subst') d.unshift('Sai '+(pname(e)||'?')+' · entra '+(e.pn2||'?'));
  const who=e.type!=='subst'&&e.p?' · '+esc(pname(e)):'';
  return `<li class="${a.opp?'opp':''} ${e.type==='golo'?'goal':''}"><span class="m">${minuteLabel(m,e.half,e.t)}</span><span class="t"><b>${a.l}</b>${who}<small>${esc(d.join(' · '))||'&nbsp;'}</small></span>${ro?'<span></span>':`<button class="x" data-del="${e.id}" aria-label="Apagar">×</button>`}</li>`;
}
function heat(v,max,color){ if(!v) return `<span class="heat muted">0</span>`; const a=Math.round(Math.min(1,v/Math.max(1,max))*55)+8; return `<span class="heat" style="background:color-mix(in srgb,${color} ${a}%,transparent)">${v}</span>`; }
function fmtDate(d){ if(!d) return ''; const [y,mo,da]=String(d).split('-'); return da&&mo&&y?`${da}/${mo}/${y}`:d; }
function fmtAi(t){ return esc(t).replace(/^#{1,4}\s*(.+)$/gm,'<h4>$1</h4>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>'); }

function vAnaliseSeason(){
  const list=seasonMatches();
  if(!list.length) return `<div class="view"><div class="mhead"><div><h1>Época</h1><div class="meta">${esc(S.team.name)}</div></div><div class="sp">${scopeBar()}</div></div><div class="card empty"><h2>Sem jogos neste período</h2><p class="muted">Escolha outra época ou outro filtro.</p></div></div>`;
  return vAnalise(seasonPseudo(list));
}
function vAnalise(m){
  const s=stats(m),sc=score(m),ins=insights(m,s);
  const zrows=[['Recuperações de bola','rec','var(--good)'],['Perdas de bola','perda','var(--red)'],['Passes errados','pe','var(--pe)'],['Faltas sofridas','fs','#38BDF8'],['Faltas cometidas','fc','#7B3FE4']];
  const zmax=Math.max(1,...zrows.flatMap(([,k])=>['def','inter','ofen'].flatMap(z=>s[k][z])));
  const tr=([n,k,c])=>{ const o=s[k]; return `<tr><td><b>${n}</b></td>${['def','inter','ofen'].map((z,i)=>`<td class="${i%2?'':'band'}">${heat(o[z][0],zmax,c)}</td><td class="${i%2?'':'band'}">${heat(o[z][1],zmax,c)}</td>`).join('')}<td>${o.h[0]}</td><td>${o.h[1]}</td><td class="tot">${o.t}</td><td>${o.top?esc(o.top.name)+' <span class="muted">('+o.top.n+')</span>':'—'}</td></tr>`; };
  const sh=s.shots, layers=[['rec','Recuperações'],['perda','Perdas'],['pe','Passes errados'],['fc','Faltas cometidas'],['fs','Faltas sofridas'],['shot','Remates']];
  const lev=m.events.filter(e=>(S.layer==='shot'?isShot(e):e.type===S.layer)&&(S.mapHalf==='all'||e.half==S.mapHalf));
  const zones={def:count(lev,e=>e.z==='def'),inter:count(lev,e=>e.z==='inter'),ofen:count(lev,e=>e.z==='ofen')};
  const marks=lev.filter(e=>e.x!=null).map(e=>{ if(S.layer==='shot'){ if(e.type==='golo') return {x:e.x,y:e.y,c:'var(--gold)',r:1.6,t:'Golo · '+pname(e)}; if(e.sub==='fora') return {x:e.x,y:e.y,c:'#fff',shape:'ring'}; if(e.sub==='interc') return {x:e.x,y:e.y,c:'#fff',shape:'x'}; return {x:e.x,y:e.y,c:'#fff',t:'À baliza · '+pname(e)}; } return {x:e.x,y:e.y,c:ACT[e.type].c,t:minuteLabel(m,e.half,e.t)+' · '+pname(e)}; });
  const cb=k=>s.atk.by[k][0]+s.atk.by[k][1], ca=k=>s.atk.adv[k][0]+s.atk.adv[k][1], cshot=k=>count(m.events,e=>e.type==='ataque'&&e.corr===k&&(e.sub==='rb'||e.sub==='rfi'));
  const consT=Object.fromEntries(ATQ_CONS.map(([k])=>[k,s.atk.cons[k][0]+s.atk.cons[k][1]])), consMax=Math.max(1,...Object.values(consT));
  const pl=periodLabels(m), pv=[['Recuperações','rec','var(--good)'],['Perdas','perda','var(--red)'],['Passes errados','pe','var(--pe)'],['Remates',null,'var(--ink)'],['Ataques','ataque','#9CA3AF']].map(([n,k,c])=>{ const a=Array(6).fill(0); for(const e of m.events) if(k?e.type===k:isShot(e)) a[periodOf(m,e)]++; return [n,a,c]; });
  const cantMax=Math.max(1,...CANTO.map(([k])=>s.cantos[k][0]+s.cantos[k][1]));
  const consAny=CONS.some(([k])=>s.cons.pe[k]+s.cons.perda[k]);
  const aiOn=S.club&&(S.club.ai_enabled||S.isSuper)&&canEdit();
  return `<div class="view">
  ${m.season?`<div class="mhead"><div><h1>${esc(m.home)} <em>Época ${seasonLabel(S.season)}</em></h1>
    <div class="meta">${m.n} jogo(s) · ${rangeLabel()} · ${m.events.length} acções · golos ${s.goals} marcados, ${s.goalsAdv} sofridos</div></div>
    <div class="sp row">${scopeBar()}<button class="btn" data-exp="resumo">Exportar resumo (CSV)</button></div></div>`
  :`<div class="mhead"><div><h1>${esc(m.home)} <em>${sc?sc[0]+'–'+sc[1]:'vs'}</em> ${esc(m.opp)}</h1>
    <div class="meta">${esc(fmtDate(m.date))}${m.time?' · '+esc(m.time):''}${m.comp?' · '+esc(m.comp):''} · ${esc(S.team?S.team.name:'')} · ${m.events.length} acções${m.locked?' · trancado':''}${m.scoreUnknown&&!sc?' · resultado não registado':''}</div></div>
    <div class="sp row">${scopeBar()}<button class="btn" data-exp="eventos">Exportar acções (CSV)</button><button class="btn" data-exp="resumo">Exportar resumo (CSV)</button></div></div>`}
  ${m.note&&!m.season?`<div class="banner">${esc(m.note)}</div>`:''}
  <div class="kpis">
    <div class="kpi"><span>Posse</span><b>${s.poss!=null?s.poss+'%':'—'}</b><small>${s.poss!=null?'adv. '+(100-s.poss)+'%':'não cronometrada'}</small></div>
    <div class="kpi"><span>Remates</span><b>${sh.t}</b><small>${sh.baliza[0]+sh.baliza[1]} à baliza</small></div>
    <div class="kpi"><span>Golos</span><b>${s.goals}</b><small>sofridos ${s.goalsAdv}</small></div>
    <div class="kpi"><span>Recuperações</span><b>${s.rec.t}</b><small>${s.rec.h[0]} + ${s.rec.h[1]}</small></div>
    <div class="kpi"><span>Perdas</span><b>${s.perda.t}</b><small>${s.perda.h[0]} + ${s.perda.h[1]}</small></div>
    <div class="kpi"><span>Passes errados</span><b>${s.pe.t}</b><small>${s.pe.h[0]} + ${s.pe.h[1]}</small></div>
    <div class="kpi"><span>Ataques</span><b>${s.atk.t}</b><small>sofridos ${s.atk.tadv}</small></div>
    <div class="kpi"><span>Faltas C / S</span><b>${s.fc.t}<span class="muted" style="font-size:22px"> / </span>${s.fs.t}</b><small>cantos ${s.cantos.t}</small></div>
  </div>
  <section class="card"><h2>Leitura do treinador</h2><div class="ins">${ins.map(i=>`<div class="in ${i.tone}"><span class="tag">${i.tag}</span><b>${esc(i.t)}</b><p>${esc(i.p)}</p></div>`).join('')}</div></section>
  <section class="card"><h2>Análise estatística por zona</h2><div class="tscroll"><table class="st">
    <thead><tr><th></th><th colspan="2" class="band">Z. Def.</th><th colspan="2">Z. Inter.</th><th colspan="2" class="band">Z. Ofen.</th><th colspan="3">Partes</th><th>Jogador</th></tr>
    <tr><th></th><th class="band">1ª</th><th class="band">2ª</th><th>1ª</th><th>2ª</th><th class="band">1ª</th><th class="band">2ª</th><th>1ª</th><th>2ª</th><th>Total</th><th>com mais</th></tr></thead>
    <tbody>${zrows.map(tr).join('')}<tr><td><b>Remates efectuados</b></td><td class="band">${sh.baliza[0]}</td><td class="band">${sh.baliza[1]}</td><td>${sh.fora[0]}</td><td>${sh.fora[1]}</td><td class="band">${sh.interc[0]}</td><td class="band">${sh.interc[1]}</td><td>${sh.h[0]}</td><td>${sh.h[1]}</td><td class="tot">${sh.t}</td><td>${sh.top?esc(sh.top.name)+' <span class="muted">('+sh.top.n+')</span>':'—'}</td></tr></tbody></table></div>
    <p class="note" style="margin:8px 0 0">Na linha dos remates as colunas são Baliza · Fora · Interceptado (1ª e 2ª parte), como na folha Estatística.</p></section>
  <div class="g-map">
    <section class="card"><h2>Mapa de acções<span class="sp"></span><span class="seg">${[['all','Jogo'],['1','1ª'],['2','2ª']].map(([k,l])=>`<button aria-pressed="${S.mapHalf==k}" data-mh="${k}">${l}</button>`).join('')}</span></h2>
      <div class="row" style="margin-bottom:10px"><span class="seg" style="flex-wrap:wrap">${layers.map(([k,l])=>`<button aria-pressed="${S.layer===k}" data-layer="${k}">${l}</button>`).join('')}</span></div>
      ${pitchSVG({markers:marks,zones})}
      ${S.layer==='shot'?`<div class="legend"><span><i style="background:#fff"></i>À baliza</span><span><i style="background:var(--gold)"></i>Golo</span><span>○ Fora</span><span>× Interceptado</span></div>`:`<p class="note" style="margin:8px 0 0">Número e percentagem por zona; pontos onde a localização foi registada.</p>`}</section>
    <section class="view" style="gap:16px">
      <div class="card"><h2>Ataques efectuados vs sofridos</h2><div class="corr">${CORR.map(([k,l])=>`<div><span>${l.replace('Corredor ','')}</span><b>${cb(k)}</b><small>${s.atk.by[k][0]} + ${s.atk.by[k][1]} · ${cshot(k)} c/ remate</small><small style="color:var(--opp)">sofridos ${ca(k)}</small></div>`).join('')}</div></div>
      <div class="card"><h2>Consequência dos ataques</h2><div class="bars">${ATQ_CONS.map(([k,l])=>`<div class="bar"><span>${l}</span><span class="tr"><i style="width:${s.atk.cons[k][0]/consMax*100}%;background:var(--red)"></i><i style="width:${s.atk.cons[k][1]/consMax*100}%;background:color-mix(in srgb,var(--red) 45%,var(--card))"></i></span><span class="v">${consT[k]}</span></div>`).join('')}</div>
        <div class="legend"><span><i style="background:var(--red)"></i>1ª parte</span><span><i style="background:color-mix(in srgb,var(--red) 45%,var(--card))"></i>2ª parte</span></div></div>
    </section></div>
  <section class="card"><h2>Momentos do jogo · por período de ${Math.round((m.halfLen||45)/3)}'</h2><div class="tscroll"><div class="periods" style="min-width:560px"><span></span>${pl.map(x=>`<span class="h">${x}</span>`).join('')}
    ${pv.map(([n,a,c])=>{ const mx=Math.max(1,...a); return `<span class="lab">${n}</span>${a.map(v=>`<span class="cell"><b>${v}</b><i style="height:${Math.round(v/mx*44)+2}px;background:${c}"></i></span>`).join('')}<span class="sep"></span>`; }).join('')}</div></div></section>
  <div class="g3">
    <section class="card"><h2>Cantos <span class="pill">${s.cantos.t}</span></h2><div class="bars">${CANTO.map(([k,l])=>{ const v=s.cantos[k][0]+s.cantos[k][1]; return `<div class="bar"><span>${l}</span><span class="tr"><i style="width:${v/cantMax*100}%;background:var(--ink)"></i></span><span class="v">${v}</span></div>`; }).join('')}</div></section>
    <section class="card"><h2>Consequência p. errados e perdas</h2>${consAny?`<div class="tscroll"><table class="st"><thead><tr><th></th><th>P. errado (X)</th><th>Perda (I)</th></tr></thead><tbody>${CONS.map(([k,l])=>`<tr><td>${l}</td><td>${s.cons.pe[k]}</td><td>${s.cons.perda[k]}</td></tr>`).join('')}</tbody></table></div>`:'<p class="note">Sem consequências registadas neste jogo.</p>'}</section>
    <section class="card"><h2>Guarda-redes, disciplina, adversário</h2><div class="tscroll"><table class="st"><tbody>
      <tr><td>Defesas completas</td><td class="tot">${s.gk.dc}</td></tr><tr><td>Defesas incompletas</td><td class="tot">${s.gk.di}</td></tr><tr><td>Defesas p/ canto</td><td class="tot">${s.gk.ca}</td></tr>
      <tr><td>Cartões ${esc(short(m.home))} (A / V)</td><td class="tot">${s.cards.am} / ${s.cards.vm}</td></tr><tr><td>Cartões adv. (A / V)</td><td class="tot">${s.cards.amA} / ${s.cards.vmA}</td></tr><tr><td>Remates adv. (à baliza)</td><td class="tot">${s.shotsAdv} (${s.shotsAdvOn})</td></tr></tbody></table></div></section>
  </div>
  ${m.season?'':`<section class="card"><h2>Relatório técnico com IA<span class="sp"></span>${aiOn&&!matchRO(m)?`<button class="btn pri" data-ai ${S.aiBusy?'disabled':''}>${S.aiBusy?'A escrever… (até 1 minuto)':(m.ai?'Gerar novo relatório':'Gerar relatório')}</button>`:''}</h2>
    ${m.ai?`<div class="ai">${fmtAi(m.ai.text)}</div><p class="note">Gerado em ${new Date(m.ai.at).toLocaleString('pt-PT')}</p>`:`<p class="note">${aiOn?'Envia o resumo estatístico deste jogo à IA e recebe uma análise de treinador: diagnóstico, padrões, plano de treino da semana e ajustes para o próximo jogo.':'O relatório com IA não está incluído no plano deste clube. Fale com a M Arte Design para o activar.'}</p>`}</section>`}
  </div>`;
}
function vIndividual(m){
  const rows=indiv(m).filter(r=>!r.gk||r.act>0),k=S.sortI.k,d=S.sortI.d;
  rows.sort((a,b)=>k==='name'?a.name.localeCompare(b.name)*d:((a[k]||0)-(b[k]||0))*d);
  const cols=[['rec','Recuperações','var(--good)'],['perda','Perdas','var(--red)'],['fc','Faltas com.','#7B3FE4'],['fs','Faltas sofr.','#38BDF8'],['shot','Remates','var(--ink)'],['pe','Passes errados','var(--pe)']];
  const mx={}; for(const [c] of cols) mx[c]=Math.max(1,...rows.map(r=>Math.max(r[c+'1'],r[c+'2'])));
  const th=(key,l,cls='')=>`<th class="sortable ${cls}" data-sort="${key}" ${k===key?`aria-sort="${d>0?'ascending':'descending'}"`:''}>${l}${k===key?(d>0?' ▲':' ▼'):''}</th>`;
  const tot=c=>rows.reduce((a,r)=>a+r[c],0), gk=indiv(m).filter(r=>r.gk);
  const gkRows=gk.map(r=>{ const g=t=>[1,2].map(h=>count(m.events,e=>e.type===t&&e.p===r.id&&e.half===h)); return `<tr><td><b>${esc(r.name)}</b></td>${[g('gr_dc'),g('gr_di'),g('gr_ca'),g('pe'),g('fs')].map((a,i)=>`<td class="${i%2?'':'band'}">${a[0]}</td><td class="${i%2?'':'band'}">${a[1]}</td>`).join('')}</tr>`; }).join('');
  return `<div class="view"><div class="mhead"><div><h1>Análise individual</h1><div class="meta">${esc(m.home)} vs ${esc(m.opp)} · ${esc(fmtDate(m.date))} · clique num cabeçalho para ordenar</div></div><div class="sp row">${scopeBar()}<button class="btn" data-exp="individual">Exportar (CSV)</button></div></div>
  ${vRatings(m)}
  <section class="card"><div class="tscroll"><table class="st"><thead><tr><th></th>${cols.map(([c,l],i)=>`<th colspan="3" class="${i%2?'':'band'}">${l}</th>`).join('')}<th></th><th></th></tr>
    <tr>${th('name','Jogador')}${cols.map(([c],i)=>`<th class="${i%2?'':'band'}">1ª</th><th class="${i%2?'':'band'}">2ª</th>${th(c,'T',i%2?'':'band')}`).join('')}${th('golos','Golos')}${th('saldo','Saldo')}</tr></thead>
    <tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b>${r.num?` <span class="muted mono">${esc(r.num)}</span>`:''}</td>${cols.map(([c,,col],i)=>`<td class="${i%2?'':'band'}">${heat(r[c+'1'],mx[c],col)}</td><td class="${i%2?'':'band'}">${heat(r[c+'2'],mx[c],col)}</td><td class="${i%2?'':'band'}"><b>${r[c]}</b></td>`).join('')}<td>${r.golos||''}</td><td><b style="color:${r.saldo>0?'var(--good)':r.saldo<0?'var(--bad)':'var(--muted)'}">${r.saldo>0?'+':''}${r.saldo}</b></td></tr>`).join('')}
    <tr><td><b>TOTAL</b></td>${cols.map(([c],i)=>`<td class="${i%2?'':'band'}">${rows.reduce((a,r)=>a+r[c+'1'],0)}</td><td class="${i%2?'':'band'}">${rows.reduce((a,r)=>a+r[c+'2'],0)}</td><td class="tot ${i%2?'':'band'}">${tot(c)}</td>`).join('')}<td class="tot">${tot('golos')}</td><td class="tot">${tot('saldo')}</td></tr></tbody></table></div>
    <p class="note" style="margin:8px 0 0">Saldo = recuperações − perdas − passes errados.</p></section>
  ${gk.length?`<section class="card"><h2>Guarda-redes</h2><div class="tscroll"><table class="st"><thead><tr><th></th><th colspan="2" class="band">Def. completas</th><th colspan="2">Def. incompletas</th><th colspan="2" class="band">Def. canto</th><th colspan="2">Passes errados</th><th colspan="2" class="band">Faltas sofridas</th></tr><tr><th></th>${'<th class="band">1ª</th><th class="band">2ª</th><th>1ª</th><th>2ª</th>'.repeat(2)}<th class="band">1ª</th><th class="band">2ª</th></tr></thead><tbody>${gkRows}</tbody></table></div></section>`:''}</div>`;
}
function vJogos(){
  const list=teamMatches();
  return `<div class="view">
  ${!list.length?`<div class="card empty"><h2>Ainda não há jogos</h2><p class="muted">${canEdit()?'Crie o primeiro jogo abaixo.':'Ainda não foram registados jogos desta equipa.'}</p></div>`:''}
  ${list.length?`<section><div class="sec-h">Jogos · ${esc(S.team.name)} <span class="pill">${list.length}</span></div><div class="mlist">${list.map(m=>{ const sc=score(m); return `<div class="mcard ${m.id===S.cur?'cur':''}">
    <span class="note">${esc(fmtDate(m.date))}${m.time?' · '+esc(m.time):''}${m.comp?' · '+esc(m.comp):''}</span><span class="t">${esc(m.home)} vs ${esc(m.opp)}</span>
    <div class="row"><span class="s">${sc?sc[0]+'–'+sc[1]:'–:–'}</span><span class="pill">${esc(m.status||'')}</span><span class="pill">${m.events.length} acções</span>${m.locked?'<span class="pill">Trancado</span>':''}</div>
    <div class="row">${m.id===S.cur?'<span class="pill" style="background:var(--red);color:var(--on-red)">Jogo activo</span>':`<button class="btn sm pri" data-open="${m.id}">Abrir</button>`}
      <a class="btn sm" href="#analise" data-open="${m.id}" style="text-decoration:none">Análise</a>
      ${isAdmin()?(S.confirm==='m'+m.id?`<span class="confirm">Apagar este jogo? <button class="btn sm pri" data-delm="${m.id}">Apagar</button><button class="btn sm" data-noconf>Não</button></span>`:`<button class="btn sm ghost" data-conf="m${m.id}">Apagar</button>`):''}</div></div>`; }).join('')}</div></section>`:''}
  ${canEdit()?`<section class="card"><h2>Novo jogo · ${esc(S.team.name)}</h2><form id="newMatch" class="form">
    <label class="fl">Equipa<input class="inp" id="nm-home" value="${esc((S.club.short_name&&S.club.short_name.length>3?S.club.short_name:S.club.name).toUpperCase())}" required></label>
    <label class="fl">Adversário<input class="inp" id="nm-opp" placeholder="Nome do adversário" required></label>
    <label class="fl">Data<input class="inp" id="nm-date" type="date" value="${today()}"></label>
    <label class="fl">Hora<input class="inp" id="nm-time" placeholder="10h00"></label>
    <label class="fl">Competição<input class="inp" id="nm-comp" placeholder="Campeonato, Taça, Amigável…"></label>
    <label class="fl">Duração de cada parte<select class="inp" id="nm-half">${[45,40,35,30,25,20].map(v=>`<option value="${v}" ${v===S.team.half_len?'selected':''}>${v} min</option>`).join('')}</select></label>
    <div class="cu" style="grid-column:1/-1">${vCallup()}</div>
    <div style="display:flex;align-items:flex-end;grid-column:1/-1"><button class="btn pri" type="submit">Criar e começar registo</button></div></form></section>`:''}
  </div>`;
}
function vCallup(){
  const ps=players().filter(p=>p.active!==false).sort((a,b)=>({GR:0,DEF:1,MED:2,AV:3}[a.pos]??2)-({GR:0,DEF:1,MED:2,AV:3}[b.pos]??2)||(+a.num||99)-(+b.num||99));
  S.callup=S.callup||{}; const c=S.callup, nT=ps.filter(p=>c[p.id]==='T').length, nB=ps.filter(p=>c[p.id]==='B').length;
  if(!S.cuForm) S.cuForm='4-4-2';
  return `<div class="sec-h" style="margin:6px 0 8px">Convocatória<span class="sp"></span><span class="pill" id="cuCount">${cuCountTxt(nT,nB)}</span></div>
    <div class="row" style="margin-bottom:10px;gap:10px"><label class="fl" style="width:180px">Formação<select class="inp" id="cuForm">${FORMS.map(f=>`<option ${f===S.cuForm?'selected':''}>${f}</option>`).join('')}</select></label>
      <button type="button" class="btn sm" data-cuall="B">Todos no banco</button><button type="button" class="btn sm" data-cuall="">Limpar</button></div>
    ${ps.length?`<div class="cu-list">${ps.map(p=>`<div class="cu-row"><span class="mono muted">${esc(p.num||'')}</span><span><b>${esc(p.name)}</b>${p.pos?` <span class="role">${esc(p.pos)}</span>`:''}</span>
      <span class="seg" data-curow="${p.id}">${[['T','Titular'],['B','Banco'],['','Fora']].map(([k,l])=>`<button type="button" aria-pressed="${(c[p.id]||'')===k}" data-cu="${p.id}" data-cv="${k}">${l}</button>`).join('')}</span></div>`).join('')}</div>
    <p class="note" style="margin:8px 0 0">Máximo de ${maxTit()} titulares (conforme a formação) e ${MAX_BENCH} suplentes. Os titulares entram no campo pela ordem das posições (GR, DEF, MED, AV). Pode ajustar a posição de cada um depois, no separador Individual → "Editar onze e formação". Se não escolher ninguém, a app sugere o onze no fim do jogo.</p>`
    :'<p class="note">O plantel desta equipa está vazio. Adicione jogadores no separador Plantel.</p>'}`;
}
const MAX_TIT=11, MAX_BENCH=9;
const maxTit = () => Math.min(MAX_TIT, formSize(S.cuForm||'4-4-2'));
function cuCountTxt(nT,nB){ const need=formSize(S.cuForm||'4-4-2'), c=S.callup||{}; const gk=players().some(p=>p.pos==='GR'&&c[p.id]==='T'); return `Titulares ${nT}/${Math.min(MAX_TIT,need)} · Banco ${nB}/${MAX_BENCH}${nT&&!gk?' · sem GR titular':''}`; }
function cuRefresh(){ const ps=players(), c=S.callup||{}; const nT=ps.filter(p=>c[p.id]==='T').length, nB=ps.filter(p=>c[p.id]==='B').length; const el=$('cuCount'); if(el){ el.textContent=cuCountTxt(nT,nB); el.style.background=nT===formSize(S.cuForm)?'color-mix(in srgb,var(--good) 18%,var(--card))':''; }
  document.querySelectorAll('[data-cu]').forEach(b=>b.setAttribute('aria-pressed',String((c[b.dataset.cu]||'')===b.dataset.cv))); }
function vPlantel(){
  const ps=players(), ed=canEdit();
  return `<div class="view"><section class="card"><h2>Plantel · ${esc(S.team.name)} <span class="pill">${ps.length}</span></h2>
   <div class="sq" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)"><span>Nº</span><span>Nome</span><span>Posição</span><span></span></div>
   ${ps.map(p=>`<div class="sq"><input class="inp mono" data-pf="num" data-id="${p.id}" value="${esc(p.num||'')}" inputmode="numeric" aria-label="Número" ${ed?'':'disabled'}><input class="inp" data-pf="name" data-id="${p.id}" value="${esc(p.name)}" aria-label="Nome" ${ed?'':'disabled'}>
     <select class="inp" data-pf="pos" data-id="${p.id}" aria-label="Posição" ${ed?'':'disabled'}>${['','GR','DEF','MED','AV'].map(o=>`<option ${p.pos===o?'selected':''} value="${o}">${o||'—'}</option>`).join('')}</select>
     ${ed?(S.confirm==='p'+p.id?`<button class="x" data-delp="${p.id}" aria-label="Confirmar remoção" title="Confirmar">✓</button>`:`<button class="x" data-conf="p${p.id}" aria-label="Remover">×</button>`):'<span></span>'}</div>`).join('')}
   ${ed?`<form id="addP" class="row" style="margin-top:12px"><input class="inp mono" id="np-num" placeholder="Nº" style="width:70px"><input class="inp" id="np-name" placeholder="Nome do jogador" style="flex:1;min-width:160px" required><select class="inp" id="np-pos" style="width:90px">${['','GR','DEF','MED','AV'].map(o=>`<option value="${o}">${o||'Posição'}</option>`).join('')}</select><button class="btn pri" type="submit">Adicionar</button></form>
   <p class="note" style="margin:10px 0 0">O jogador com posição GR recebe automaticamente as defesas do guarda-redes no registo ao vivo. Remover um jogador não apaga as acções dele em jogos já registados.</p>`:''}
  </section></div>`;
}

/* ---------- ÁREA DO CLUBE (admin do clube) ---------- */
async function loadClubAdmin(){
  if(!S.club) return;
  const id=S.club.id;
  const start=new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
  const [{data:mems},{count}] = await Promise.all([
    sb.from('memberships').select('user_id,role,created_at').eq('club_id',id),
    sb.from('ai_reports').select('id',{count:'exact',head:true}).eq('club_id',id).gte('created_at',start.toISOString())
  ]);
  const ids=(mems||[]).map(m=>m.user_id);
  const { data:profs } = ids.length ? await sb.from('profiles').select('user_id,email,full_name').in('user_id',ids) : {data:[]};
  S.members=(mems||[]).map(m=>({...m,...((profs||[]).find(p=>p.user_id===m.user_id)||{})})).sort((a,b)=>(a.email||'').localeCompare(b.email||''));
  S.aiCount=count||0;
  if(['clube'].includes(view())) render();
}
function vClube(){
  const c=S.club, msg=S.msg.clube;
  return `<div class="view">
  <div class="mhead"><div><h1>${esc(c.name)}</h1><div class="meta">Estado: <span class="${clubActive(c)?'st-ativo':'st-suspenso'}">${clubActive(c)?'Activo':'Suspenso'}</span>${c.paid_until?' · mensalidade paga até '+fmtDate(c.paid_until):''} · Relatórios IA este mês: ${S.aiCount}${c.ai_enabled?' de '+c.ai_monthly_limit:' (IA não incluída)'}</div></div></div>
  ${msg?`<div class="banner ${msg.err?'err':'ok'}">${esc(msg.t)}</div>`:''}
  <section class="card"><h2>Equipa técnica e acessos <span class="pill">${S.members.length}</span></h2>
    <div class="tscroll"><table class="st"><thead><tr><th class="l">Nome</th><th class="l">Email</th><th class="l">Perfil</th><th></th></tr></thead><tbody>
    ${S.members.map(u=>{ const self=u.user_id===S.session.user.id; return `<tr><td class="l">${esc(u.full_name||'—')}</td><td class="l">${esc(u.email||'')}</td>
      <td class="l"><select class="inp" data-role="${u.user_id}" ${self?'disabled':''}>${Object.entries(ROLE_L).map(([k,l])=>`<option value="${k}" ${u.role===k?'selected':''}>${l}</option>`).join('')}</select></td>
      <td class="l">${self?'<span class="muted small">(a sua conta)</span>':`${S.confirm==='pw'+u.user_id?`<span class="confirm"><input class="inp" id="pw-${u.user_id}" value="${genPass()}" style="width:150px"><button class="btn sm pri" data-resetpw="${u.user_id}">Gravar</button><button class="btn sm" data-noconf>Cancelar</button></span>`:`<button class="btn sm" data-conf="pw${u.user_id}">Repor palavra-passe</button>`}
        ${S.confirm==='u'+u.user_id?`<span class="confirm">Retirar acesso? <button class="btn sm pri" data-delmem="${u.user_id}">Retirar</button><button class="btn sm" data-noconf>Não</button></span>`:`<button class="btn sm ghost" data-conf="u${u.user_id}">Retirar acesso</button>`}`}</td></tr>`; }).join('')}
    ${S.members.length?'':'<tr><td class="l muted" colspan="4">Ainda ninguém tem acesso a este clube. Adicione o treinador ou o coordenador abaixo.</td></tr>'}
    </tbody></table></div>
    <h3 class="sec-h" style="margin-top:16px">Adicionar pessoa</h3>
    <form id="addUser" class="formrow">
      <label class="fl">Nome<input class="inp" id="au-name" required></label>
      <label class="fl">Email<input class="inp" id="au-email" type="email" required></label>
      <label class="fl">Perfil<select class="inp" id="au-role">${Object.entries(ROLE_L).map(([k,l])=>`<option value="${k}" ${k==='treinador'?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="fl">Palavra-passe inicial<input class="inp mono" id="au-pass" value="${genPass()}" required minlength="8"></label>
      <button class="btn pri" type="submit">Criar acesso</button>
    </form>
    <p class="note" style="margin:8px 0 0">Entregue o email e a palavra-passe à pessoa; ela pode mudá-la em "A minha conta". Treinador e analista registam jogos; só leitura consulta; admin gere tudo no clube.</p>
  </section>
  <section class="card"><h2>Equipas e escalões <span class="pill">${S.teams.length}</span></h2>
    <div class="tscroll"><table class="st"><thead><tr><th class="l">Nome</th><th class="l">Duração da parte</th><th>Jogadores</th><th>Jogos</th><th></th></tr></thead><tbody>
    ${S.teams.map(t=>`<tr><td class="l"><input class="inp" data-tf="name" data-id="${t.id}" value="${esc(t.name)}"></td><td class="l"><select class="inp" data-tf="half_len" data-id="${t.id}">${[45,40,35,30,25,20].map(v=>`<option value="${v}" ${v===t.half_len?'selected':''}>${v} min</option>`).join('')}</select></td>
      <td>${S.players.filter(p=>p.team_id===t.id).length}</td><td>${Object.values(S.matches).filter(m=>m.team_id===t.id).length}</td>
      <td>${S.confirm==='t'+t.id?`<span class="confirm">Apaga equipa, plantel e jogos! <button class="btn sm pri" data-delteam="${t.id}">Apagar</button><button class="btn sm" data-noconf>Não</button></span>`:`<button class="btn sm ghost" data-conf="t${t.id}">Apagar</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    <form id="addTeam" class="row" style="margin-top:12px"><input class="inp" id="at-name" placeholder="Ex.: Sub-15, Seniores B" style="flex:1;min-width:180px" required><select class="inp" id="at-half" style="width:120px">${[45,40,35,30,25,20].map(v=>`<option value="${v}">${v} min</option>`).join('')}</select><button class="btn pri" type="submit">Criar equipa</button></form>
  </section>
  <section class="card"><h2>Trancar jogos</h2>
    <p class="note" style="margin:0 0 10px">Um jogo trancado fica só de consulta para treinadores e analistas, para os números não serem alterados depois de fechados.</p>
    <div class="tscroll"><table class="st"><thead><tr><th class="l">Jogo</th><th class="l">Equipa</th><th>Data</th><th>Estado</th><th></th></tr></thead><tbody>
    ${Object.values(S.matches).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(m=>`<tr><td class="l">${esc(m.home)} vs ${esc(m.opp)}</td><td class="l">${esc((S.teams.find(t=>t.id===m.team_id)||{}).name||'')}</td><td>${esc(fmtDate(m.date))}</td><td>${m.locked?'<b>Trancado</b>':'Aberto'}</td><td><button class="btn sm" data-lock="${m.id}">${m.locked?'Destrancar':'Trancar'}</button></td></tr>`).join('')||'<tr><td class="l muted" colspan="5">Sem jogos.</td></tr>'}
    </tbody></table></div></section>
  </div>`;
}
function genPass(){ const a='abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s=''; const r=new Uint32Array(10); crypto.getRandomValues(r); for(const x of r) s+=a[x%a.length]; return 'Fc-'+s; }

/* ---------- SUPER-ADMIN (M Arte Design) ---------- */
async function loadSuper(){
  const start=new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
  const [{data:clubs},{data:ai},{data:users,error}] = await Promise.all([
    sb.from('clubs').select('*').order('name'),
    sb.from('ai_reports').select('club_id,input_tokens,output_tokens').gte('created_at',start.toISOString()),
    sb.functions.invoke('admin-users',{body:{action:'list_all'}})
  ]);
  S.clubs=clubs||S.clubs;
  const by={}; for(const r of (ai||[])){ const o=by[r.club_id]||(by[r.club_id]={n:0,tin:0,tout:0}); o.n++; o.tin+=r.input_tokens||0; o.tout+=r.output_tokens||0; }
  S.admin.aiByClub=by;
  if(!error && users){ S.admin.users=users.profiles||[]; S.admin.mems=users.memberships||[]; const mc={}; for(const m of S.admin.mems) mc[m.club_id]=(mc[m.club_id]||0)+1; S.admin.memCount=mc; }
  S.admin.loaded=true;
  if(view()==='admin') render();
}
function vSuper(){
  if(!S.admin.loaded){ loadSuper(); return `<div class="card empty"><h2>A carregar…</h2></div>`; }
  const cl=S.clubs, act=cl.filter(clubActive), msg=S.msg.admin;
  const mrr=act.reduce((a,c)=>a+(+c.monthly_fee||0),0), late=cl.filter(c=>c.status==='ativo'&&c.paid_until&&c.paid_until<today());
  const aiTot=Object.values(S.admin.aiByClub).reduce((a,o)=>a+o.n,0);
  const clubName=id=>(cl.find(c=>c.id===id)||{}).name||'?';
  return `<div class="view">
  <div class="mhead"><div><h1>Super-admin</h1><div class="meta">M Arte Design · gestão de clubes, mensalidades, IA e utilizadores</div></div><div class="sp row"><button class="btn" data-reloadsuper>Actualizar</button><button class="btn" data-exp="backup">Cópia de segurança (JSON)</button></div></div>
  ${msg?`<div class="banner ${msg.err?'err':'ok'}">${esc(msg.t)}</div>`:''}
  <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="kpi"><span>Clubes activos</span><b>${act.length}</b><small>de ${cl.length}</small></div>
    <div class="kpi"><span>Mensalidades / mês</span><b>${mrr.toFixed(0)} €</b><small>sem IVA, clubes activos</small></div>
    <div class="kpi"><span>Pagamento em atraso</span><b style="color:${late.length?'var(--bad)':'inherit'}">${late.length}</b><small>${late.map(c=>esc(c.name)).join(', ')||'nenhum'}</small></div>
    <div class="kpi"><span>Relatórios IA este mês</span><b>${aiTot}</b><small>todos os clubes</small></div>
  </div>
  <section class="card"><h2>Clubes</h2><div class="tscroll"><table class="st"><thead><tr><th class="l">Clube</th><th class="l">Cor</th><th class="l">Estado</th><th class="l">Pago até</th><th class="l">Mensal. (€)</th><th>IA</th><th class="l">Limite IA/mês</th><th>IA este mês</th><th>Utiliz.</th><th></th></tr></thead><tbody>
  ${cl.map(c=>{ const ai=S.admin.aiByClub[c.id]||{n:0}; const atr=c.paid_until&&c.paid_until<today(); return `<tr>
    <td class="l"><input class="inp" data-cf="name" data-id="${c.id}" value="${esc(c.name)}" style="min-width:140px"></td>
    <td class="l"><input type="color" data-cf="color" data-id="${c.id}" value="${esc(c.color||'#C3262C')}" aria-label="Cor"></td>
    <td class="l"><select class="inp" data-cf="status" data-id="${c.id}"><option value="ativo" ${c.status==='ativo'?'selected':''}>Activo</option><option value="suspenso" ${c.status==='suspenso'?'selected':''}>Suspenso</option></select>${atr?'<div class="st-atraso small">em atraso</div>':''}</td>
    <td class="l"><input class="inp" type="date" data-cf="paid_until" data-id="${c.id}" value="${esc(c.paid_until||'')}"></td>
    <td class="l"><input class="inp" type="number" step="0.01" min="0" data-cf="monthly_fee" data-id="${c.id}" value="${esc(c.monthly_fee??'')}" style="width:90px"></td>
    <td><input type="checkbox" data-cf="ai_enabled" data-id="${c.id}" ${c.ai_enabled?'checked':''} aria-label="IA activa"></td>
    <td class="l"><input class="inp" type="number" min="0" data-cf="ai_monthly_limit" data-id="${c.id}" value="${esc(c.ai_monthly_limit)}" style="width:80px"></td>
    <td>${ai.n}</td><td>${S.admin.memCount[c.id]||0}</td>
    <td class="l"><button class="btn sm" data-enter="${c.id}">Entrar</button> ${S.confirm==='c'+c.id?`<span class="confirm">Apagar clube e TODOS os dados? <button class="btn sm pri" data-delclub="${c.id}">Apagar</button><button class="btn sm" data-noconf>Não</button></span>`:`<button class="btn sm ghost" data-conf="c${c.id}">Apagar</button>`}</td></tr>`; }).join('')||'<tr><td class="l muted" colspan="10">Ainda não há clubes.</td></tr>'}
  </tbody></table></div><p class="note" style="margin:8px 0 0">As alterações gravam ao sair de cada campo. Um clube suspenso, ou com data de pagamento ultrapassada, perde o acesso logo a seguir.</p></section>
  <section class="card"><h2>Novo clube</h2><form id="newClub" class="formrow">
    <label class="fl">Nome do clube<input class="inp" id="nc-name" required></label>
    <label class="fl">Sigla<input class="inp" id="nc-short" placeholder="PFC"></label>
    <label class="fl">Cor<input class="inp" type="color" id="nc-color" value="#C3262C" style="height:38px"></label>
    <label class="fl">Mensalidade (€)<input class="inp" type="number" step="0.01" id="nc-fee" value="30"></label>
    <label class="fl">Pago até<input class="inp" type="date" id="nc-paid"></label>
    <label class="fl">IA incluída<select class="inp" id="nc-ai"><option value="1">Sim</option><option value="0">Não</option></select></label>
    <label class="fl">1ª equipa<input class="inp" id="nc-team" value="Seniores" required></label>
    <label class="fl">Duração da parte<select class="inp" id="nc-half">${[45,40,35,30,25,20].map(v=>`<option value="${v}">${v} min</option>`).join('')}</select></label>
    <label class="fl">Nome do admin do clube<input class="inp" id="nc-aname"></label>
    <label class="fl">Email do admin do clube<input class="inp" type="email" id="nc-aemail"></label>
    <label class="fl">Palavra-passe inicial<input class="inp mono" id="nc-apass" value="${genPass()}" minlength="8"></label>
    <button class="btn pri" type="submit">Criar clube</button>
  </form><p class="note" style="margin:8px 0 0">O admin do clube é opcional aqui; pode ser criado depois dentro do clube (botão Entrar → separador Clube).</p></section>
  <section class="card"><h2>Todos os utilizadores <span class="pill">${(S.admin.users||[]).length}</span></h2><div class="tscroll"><table class="st"><thead><tr><th class="l">Nome</th><th class="l">Email</th><th class="l">Clubes e perfis</th><th></th></tr></thead><tbody>
  ${(S.admin.users||[]).map(u=>{ const ms=(S.admin.mems||[]).filter(m=>m.user_id===u.user_id); const self=u.user_id===S.session.user.id; return `<tr><td class="l">${esc(u.full_name||'—')}</td><td class="l">${esc(u.email)}</td>
    <td class="l">${u.is_super?'<span class="role super">Super-admin</span> ':''}${ms.map(m=>`${esc(clubName(m.club_id))} <span class="role ${m.role==='admin'?'admin':''}">${ROLE_L[m.role]}</span>`).join(' · ')||(u.is_super?'':'<span class="muted">sem clube</span>')}</td>
    <td class="l">${self?'':`${S.confirm==='spw'+u.user_id?`<span class="confirm"><input class="inp" id="spw-${u.user_id}" value="${genPass()}" style="width:150px"><button class="btn sm pri" data-sresetpw="${u.user_id}">Gravar</button><button class="btn sm" data-noconf>Cancelar</button></span>`:`<button class="btn sm" data-conf="spw${u.user_id}">Repor palavra-passe</button>`}
      ${S.confirm==='su'+u.user_id?`<span class="confirm">Apagar conta? <button class="btn sm pri" data-deluser="${u.user_id}">Apagar</button><button class="btn sm" data-noconf>Não</button></span>`:`<button class="btn sm ghost" data-conf="su${u.user_id}">Apagar conta</button>`}`}</td></tr>`; }).join('')}
  </tbody></table></div></section></div>`;
}
function vConta(){
  const msg=S.msg.conta;
  return `<div class="view"><section class="card" style="max-width:560px"><h2>A minha conta</h2>
    ${msg?`<div class="${msg.err?'err':'ok'}" style="margin-bottom:10px">${esc(msg.t)}</div>`:''}
    <form id="fName" class="row" style="margin-bottom:14px"><label class="fl" style="flex:1">Nome<input class="inp" id="me-name" value="${esc(S.profile.full_name||'')}"></label><button class="btn" type="submit" style="align-self:flex-end">Gravar nome</button></form>
    <p class="note">Email: <b>${esc(S.profile.email)}</b></p>
    <form id="fPass" class="row"><label class="fl" style="flex:1">Nova palavra-passe<input class="inp" id="me-pass" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn pri" type="submit" style="align-self:flex-end">Mudar palavra-passe</button></form>
    <p class="note">Mínimo 8 caracteres.</p></section></div>`;
}

/* =========================================================
   EXPORTAÇÃO (download normal do navegador)
   ========================================================= */
function download(filename,data,type){ const b=new Blob([data],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500); }
function csv(rows){ return '﻿'+rows.map(r=>r.map(v=>{ v=String(v??''); return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(';')).join('\r\n'); }
const slug = m => (m.season?(m.home+'-epoca-'+seasonLabel(S.season)):(m.home+'-vs-'+m.opp+'-'+(m.date||''))).replace(/[\s/]+/g,'-').replace(/[^\w\-]/g,'');
async function exp(kind){
  const m=curAnalysis();
  if(kind==='epoca'){ const list=seasonMatches(), r=[['Jogador','Jogos','Recuperações','Rec/jogo','Perdas','Perdas/jogo','Passes errados','P.err/jogo','Faltas com.','Faltas sofr.','Remates','Golos','Saldo','Saldo/jogo','Nota média']];
    const f=v=>v.toFixed(2).replace('.',',');
    for(const x of seasonPlayers(list)) r.push([x.name,x.jogos,x.rec,f(x.rec_j),x.perda,f(x.perda_j),x.pe,f(x.pe_j),x.fc,x.fs,x.shot,x.golos,x.saldo,f(x.saldo_j),x.rn?f(x.nota):'']);
    return download('epoca-'+seasonLabel(S.season).replace('/','-')+'-'+(S.team.name||'').replace(/\s+/g,'-')+'.csv',csv(r),'text/csv'); }
  if(kind==='backup'){
    const [{data:clubs},{data:teams},{data:pls},{data:mts}] = await Promise.all([sb.from('clubs').select('*'),sb.from('teams').select('*'),sb.from('players').select('*'),sb.from('matches').select('*')]);
    return download('m-arte-fc-backup-'+today()+'.json', JSON.stringify({version:2,exported_at:new Date().toISOString(),clubs,teams,players:pls,matches:mts},null,1),'application/json');
  }
  if(kind==='eventos'){ const r=[['Parte','Minuto','Acção','Detalhe','Corredor','Zona','Jogador','Consequência','X','Y']];
    for(const e of m.events) r.push([e.half,minuteLabel(m,e.half,e.t),ACT[e.type].l,e.sub?lab(ACT[e.type].subs||[],e.sub):'',e.corr?lab(CORR,e.corr):'',e.z?ZN[e.z]:'',pname(e)+(e.pn2?' > '+e.pn2:''),e.cons?lab(CONS,e.cons):'',e.x??'',e.y??'']);
    return download('accoes-'+slug(m)+'.csv',csv(r),'text/csv'); }
  if(kind==='resumo'){ const s=stats(m),r=[['Categoria','Z.Def 1ª','Z.Def 2ª','Z.Inter 1ª','Z.Inter 2ª','Z.Ofen 1ª','Z.Ofen 2ª','1ª','2ª','Total','Jogador']];
    for(const [n,k] of [['Recuperações de Bola','rec'],['Perdas de Bola','perda'],['Passes Errados','pe'],['Faltas Sofridas','fs'],['Faltas Cometidas','fc']]){ const o=s[k]; r.push([n,o.def[0],o.def[1],o.inter[0],o.inter[1],o.ofen[0],o.ofen[1],o.h[0],o.h[1],o.t,o.top?o.top.name+' ('+o.top.n+')':'']); }
    const sh=s.shots; r.push(['Remates (Baliza/Fora/Interc.)',sh.baliza[0],sh.baliza[1],sh.fora[0],sh.fora[1],sh.interc[0],sh.interc[1],sh.h[0],sh.h[1],sh.t,sh.top?sh.top.name+' ('+sh.top.n+')':'']);
    r.push([]); r.push(['Cantos',...CANTO.map(([k,l])=>l+': '+(s.cantos[k][0]+s.cantos[k][1])),'Total: '+s.cantos.t]);
    r.push(['Ataques (1ª+2ª)',...CORR.map(([k,l])=>l+': '+s.atk.by[k][0]+'+'+s.atk.by[k][1]),'Total: '+s.atk.t]);
    r.push(['Consequência ataques',...ATQ_CONS.map(([k,l])=>l+': '+s.atk.cons[k][0]+'+'+s.atk.cons[k][1])]);
    r.push(['Posse',s.poss!=null?s.poss+'%':'não registada']);
    return download('estatistica-'+slug(m)+'.csv',csv(r),'text/csv'); }
  if(kind==='individual'){ const r=[['Jogador','Rec 1ª','Rec 2ª','Perdas 1ª','Perdas 2ª','F.Com 1ª','F.Com 2ª','F.Sof 1ª','F.Sof 2ª','Remates 1ª','Remates 2ª','P.Err 1ª','P.Err 2ª','Golos','Saldo','Nota']]; const rts=rateMatch(m);
    for(const x of indiv(m)) r.push([x.name,x.rec1,x.rec2,x.perda1,x.perda2,x.fc1,x.fc2,x.fs1,x.fs2,x.shot1,x.shot2,x.pe1,x.pe2,x.golos,x.saldo,rts[x.id]?String(rts[x.id].r).replace('.',','):'']);
    return download('individual-'+slug(m)+'.csv',csv(r),'text/csv'); }
}

/* =========================================================
   RELATÓRIO IA (função de servidor; a chave nunca está no navegador)
   ========================================================= */
async function runAI(){
  const m=M(); if(!m) return;
  const s=stats(m), ind=indiv(m).filter(r=>r.act>0).map(r=>({jogador:r.name,rec:[r.rec1,r.rec2],perdas:[r.perda1,r.perda2],passes_errados:[r.pe1,r.pe2],faltas_com:[r.fc1,r.fc2],faltas_sof:[r.fs1,r.fs2],remates:[r.shot1,r.shot2],golos:r.golos,saldo:r.saldo}));
  const per=periodLabels(m).map((l,i)=>({periodo:l,rec:count(m.events,e=>e.type==='rec'&&periodOf(m,e)===i),perdas:count(m.events,e=>e.type==='perda'&&periodOf(m,e)===i),passes_errados:count(m.events,e=>e.type==='pe'&&periodOf(m,e)===i)}));
  const data={jogo:`${m.home} vs ${m.opp}`,data:m.date,escalao:S.team&&S.team.name,resultado:score(m)?score(m).join('-'):'não registado',duracao_parte:m.halfLen,zonas_por_parte:{recuperacoes:s.rec,perdas:s.perda,passes_errados:s.pe,faltas_sofridas:s.fs,faltas_cometidas:s.fc},remates:s.shots,ataques_por_corredor:s.atk.by,ataques_sofridos:s.atk.adv,consequencia_ataques:s.atk.cons,cantos:s.cantos,consequencia_perdas:s.cons,posse_pct:s.poss,gr:s.gk,cartoes:s.cards,por_periodo:per,individual:ind};
  S.aiBusy=true; render();
  const { data:res, error } = await sb.functions.invoke('ai-report',{body:{match_id:m.id,data}});
  S.aiBusy=false;
  let errMsg=null;
  if(error){ try{ const j=await error.context.json(); errMsg=j.error; }catch(e){ errMsg='Não foi possível gerar o relatório.'; } }
  if(errMsg){ toast(errMsg); render(); return; }
  m.ai={text:res.text,at:Date.now()}; touch(m); render();
}

/* =========================================================
   ACÇÕES DA INTERFACE
   ========================================================= */
async function call(action,body){ const { data, error } = await sb.functions.invoke('admin-users',{body:{action,...body}}); if(error){ let msg='Erro'; try{ msg=(await error.context.json()).error; }catch(e){} throw new Error(msg); } return data; }
function say(where,t,err){ S.msg[where]={t,err}; render(); setTimeout(()=>{ if(S.msg[where]&&S.msg[where].t===t){ S.msg[where]=null; render(); } },6000); }

document.addEventListener('click', async ev=>{
  const t=ev.target.closest('button,a[data-open]'); if(!t) return;
  const d=t.dataset, m=M();
  if(t.id==='btnLogout'){ await sb.auth.signOut(); location.hash=''; return; }
  if(d.act){ if(S.pending&&S.pending.type===d.act){ S.pending=null; render(); } else begin(d.act); }
  else if(d.cancel!==undefined){ S.pending=null; render(); }
  else if(d.skiploc!==undefined){ S.pending.i++; advance(); }
  else if(d.pl!==undefined){ stepValue(curStep(),d.pl||null); }
  else if(d.v){ stepValue(d.v,d.k); }
  else if(d.clock!==undefined){ if(!matchRO(m)) startPause(m); }
  else if(d.endhalf!==undefined){ if(!matchRO(m)) endHalf(m); }
  else if(d.poss){ if(!matchRO(m)) setPoss(m,d.poss); }
  else if(d.undo!==undefined) undo();
  else if(d.del) delEvent(d.del);
  else if(d.layer){ S.layer=d.layer; render(); }
  else if(d.mh){ S.mapHalf=d.mh; render(); }
  else if(d.scope){ S.scope=d.scope; render(); }
  else if(d.range){ S.range=d.range; render(); }
  else if(d.sorts){ S.sortS=S.sortS.k===d.sorts?{k:d.sorts,d:-S.sortS.d}:{k:d.sorts,d:d.sorts==='name'?1:-1}; render(); }
  else if(d.cu!==undefined&&d.cv!==undefined){ S.callup=S.callup||{}; const c=S.callup;
    if(c[d.cu]!==d.cv){ const nT=Object.values(c).filter(v=>v==='T').length, nB=Object.values(c).filter(v=>v==='B').length, maxT=maxTit();
      if(d.cv==='T'&&nT>=maxT){ toast(`Máximo de ${maxT} titulares (formação ${S.cuForm}). Passe um titular para o banco ou para fora primeiro.`); return; }
      if(d.cv==='B'&&nB>=MAX_BENCH){ toast(`Máximo de ${MAX_BENCH} suplentes no banco.`); return; } }
    c[d.cu]=d.cv; cuRefresh(); return; }
  else if(d.cuall!==undefined){ if(!d.cuall){ S.callup={}; cuRefresh(); return; }
    const c=S.callup=S.callup||{}; let nB=Object.values(c).filter(v=>v==='B').length, left=0;
    for(const p of players().filter(p=>p.active!==false)){ if(c[p.id]) continue; if(nB<MAX_BENCH){ c[p.id]='B'; nB++; } else left++; }
    if(left) toast(`Banco completo (${MAX_BENCH}). ${left} jogador(es) ficaram fora.`); cuRefresh(); return; }
  else if(d.lubench){ const m=M(); if(!m||matchRO(m)) return; const lu=luChange(m); lu.bench=lu.bench||[]; const i=lu.bench.indexOf(d.lubench); if(i>=0) lu.bench.splice(i,1); else { if(lu.bench.length>=MAX_BENCH){ toast(`Máximo de ${MAX_BENCH} suplentes no banco.`); return; } lu.bench.push(d.lubench); } S.luOpen=true; touch(m); render(); }
  else if(d.autom){ S.autoM=d.autom; render(); }
  else if(d.rate){ const am=S.matches[S.autoM]; if(!am||matchRO(am)) return; const draft=selfDraft(); am.self=Object.assign({},am.self||{},draft); am.self.ratings=Object.assign({},(am.self&&am.self.ratings)||{}); am.self.ratings[d.rate]=+d.n; render(); }
  else if(d.openscope){ S.cur=d.openscope; S.scope='jogo'; render(); }
  else if(d.sort){ S.sortI=S.sortI.k===d.sort?{k:d.sort,d:-S.sortI.d}:{k:d.sort,d:d.sort==='name'?1:-1}; render(); }
  else if(d.open){ S.cur=d.open; S.pending=null; if(t.tagName!=='A') location.hash='#'+(canEdit()?'registo':'analise'); render(); }
  else if(d.conf){ S.confirm=d.conf; render(); }
  else if(d.noconf!==undefined){ S.confirm=null; render(); }
  else if(d.delm){ S.confirm=null; const { error }=await sb.from('matches').delete().eq('id',d.delm); if(error) toast(error.message); else { delete S.matches[d.delm]; S.cur=null; pickCur(); toast('Jogo apagado.'); } render(); }
  else if(d.delp){ S.confirm=null; const { error }=await sb.from('players').delete().eq('id',d.delp); if(error) toast(error.message); else S.players=S.players.filter(p=>p.id!==d.delp); render(); }
  else if(d.exp) exp(d.exp);
  else if(d.ai!==undefined) runAI();
  else if(d.lock){ const mm=S.matches[d.lock]; const { error }=await sb.from('matches').update({locked:!mm.locked}).eq('id',mm.id); if(error) toast(error.message); else { mm.locked=!mm.locked; toast(mm.locked?'Jogo trancado.':'Jogo destrancado.'); } render(); }
  else if(d.resetpw){ const pw=$('pw-'+d.resetpw).value; S.confirm=null; try{ await call('reset_password',{user_id:d.resetpw,password:pw,club_id:S.club.id}); say('clube','Palavra-passe reposta: '+pw+' — entregue-a à pessoa.'); }catch(e){ say('clube',e.message,true); } }
  else if(d.delmem){ S.confirm=null; const { error }=await sb.from('memberships').delete().eq('club_id',S.club.id).eq('user_id',d.delmem); if(error) say('clube',error.message,true); else { await loadClubAdmin(); say('clube','Acesso retirado.'); } }
  else if(d.delteam){ S.confirm=null; const { error }=await sb.from('teams').delete().eq('id',d.delteam); if(error) say('clube',error.message,true); else { await selectClub(S.club.id,true); location.hash='#clube'; say('clube','Equipa apagada.'); } }
  else if(d.enter){ await selectClub(d.enter); location.hash='#'+(S.teams.length?'jogos':'clube'); }
  else if(d.reloadsuper!==undefined){ S.admin.loaded=false; render(); }
  else if(d.delclub){ S.confirm=null; const { error }=await sb.from('clubs').delete().eq('id',d.delclub); if(error) say('admin',error.message,true); else { if(S.club&&S.club.id===d.delclub){ S.club=null; } S.admin.loaded=false; say('admin','Clube apagado.'); } }
  else if(d.sresetpw){ const pw=$('spw-'+d.sresetpw).value; S.confirm=null; try{ await call('reset_password',{user_id:d.sresetpw,password:pw}); say('admin','Palavra-passe reposta: '+pw); }catch(e){ say('admin',e.message,true); } }
  else if(d.deluser){ S.confirm=null; try{ await call('delete_user',{user_id:d.deluser}); S.admin.loaded=false; say('admin','Conta apagada.'); }catch(e){ say('admin',e.message,true); } }
});

document.addEventListener('submit', async ev=>{
  ev.preventDefault(); const f=ev.target, g=id=>($(id)?$(id).value.trim():'');
  if(f.id==='loginForm'){
    S.loginErr=''; const btn=f.querySelector('button'); btn.disabled=true; btn.textContent='A entrar…';
    const { error } = await sb.auth.signInWithPassword({email:g('lg-email'),password:$('lg-pass').value});
    if(error){ S.loginErr=/invalid/i.test(error.message)?'Email ou palavra-passe errados.':error.message; render(); }
    return;
  }
  if(f.id==='newMatch'){
    const row={club_id:S.club.id,team_id:S.team.id,home:g('nm-home')||S.club.name,opp:g('nm-opp')||'Adversário',date:g('nm-date')||null,time:g('nm-time'),comp:g('nm-comp'),half_len:+g('nm-half')||45,status:'nova',
      data:{clock:{half:1,running:false,startedAt:null,base:0},poss:{cur:null,since:null,us:0,opp:0},events:[]}};
    const cu=S.callup||{}; const nT=Object.values(cu).filter(v=>v==='T').length, nB=Object.values(cu).filter(v=>v==='B').length;
    if(nT>maxTit()||nB>MAX_BENCH){ toast(`Convocatória inválida: máximo ${maxTit()} titulares e ${MAX_BENCH} suplentes.`); return; }
    if(Object.values(cu).some(v=>v==='T'||v==='B')){ row.data.lineup=buildLineup(cu,S.cuForm||'4-4-2'); }
    const { data, error } = await sb.from('matches').insert(row).select().single();
    if(error){ toast('Não foi possível criar o jogo: '+error.message); return; }
    S.callup={};
    S.matches[data.id]=fromRow(data); S.cur=data.id; location.hash='#registo'; render(); toast('Jogo criado. Carregue em Iniciar quando o árbitro apitar.'); return;
  }
  if(f.id==='addP'){
    const { data, error } = await sb.from('players').insert({club_id:S.club.id,team_id:S.team.id,name:g('np-name'),num:g('np-num'),pos:g('np-pos')}).select().single();
    if(error){ toast(error.message); return; } S.players.push(data); render(); setTimeout(()=>$('np-name')&&$('np-name').focus(),0); return;
  }
  if(f.id==='addTeam'){
    const { data, error } = await sb.from('teams').insert({club_id:S.club.id,name:g('at-name'),half_len:+g('at-half')}).select().single();
    if(error){ say('clube',error.message,true); return; } S.teams.push(data); if(!S.team) S.team=data; say('clube','Equipa criada: '+data.name); return;
  }
  if(f.id==='addUser'){
    const pass=g('au-pass'), email=g('au-email');
    try{ const r=await call('create',{club_id:S.club.id,email,password:pass,full_name:g('au-name'),role:g('au-role')}); await loadClubAdmin();
      say('clube', r.created?`Acesso criado. Entregue à pessoa: ${email} · palavra-passe ${pass}`:`${email} já tinha conta; foi adicionado ao clube com a mesma palavra-passe.`); }
    catch(e){ say('clube',e.message,true); }
    return;
  }
  if(f.id==='newClub'){
    const { data:club, error } = await sb.from('clubs').insert({name:g('nc-name'),short_name:g('nc-short'),color:g('nc-color'),monthly_fee:+g('nc-fee')||0,paid_until:g('nc-paid')||null,ai_enabled:g('nc-ai')==='1'}).select().single();
    if(error){ say('admin',error.message,true); return; }
    await sb.from('teams').insert({club_id:club.id,name:g('nc-team')||'Seniores',half_len:+g('nc-half')||45});
    let extra='';
    if(g('nc-aemail')){ try{ const r=await call('create',{club_id:club.id,email:g('nc-aemail'),password:g('nc-apass'),full_name:g('nc-aname'),role:'admin'}); extra=r.created?` Admin: ${g('nc-aemail')} · palavra-passe ${g('nc-apass')}`:` ${g('nc-aemail')} adicionado como admin.`; }catch(e){ extra=' Falhou criar o admin: '+e.message; } }
    S.admin.loaded=false; say('admin','Clube criado: '+club.name+'.'+extra); return;
  }
  if(f.id==='selfForm'){ const am=S.matches[S.autoM]; if(!am||matchRO(am)) return; am.self=Object.assign({ratings:{}},am.self||{},selfDraft(),{at:Date.now(),by:S.profile.full_name||S.profile.email}); touch(am); toast('Avaliação gravada.'); render(); return; }
  if(f.id==='fName'){ const { error }=await sb.from('profiles').update({full_name:g('me-name')}).eq('user_id',S.session.user.id); if(error) say('conta',error.message,true); else { S.profile.full_name=g('me-name'); say('conta','Nome gravado.'); } return; }
  if(f.id==='fPass'){
    const btn=f.querySelector('button'); btn.disabled=true; btn.textContent='A gravar…';
    const { error }=await sb.auth.updateUser({password:$('me-pass').value});
    let t='Palavra-passe alterada. Use a nova da próxima vez que entrar.';
    if(error){ t = error.code==='same_password'||/different from the old/i.test(error.message) ? 'Essa já é a sua palavra-passe actual. Para mudar, escreva uma diferente.'
      : error.code==='weak_password'||/weak|at least/i.test(error.message) ? 'Palavra-passe fraca: use pelo menos 8 caracteres, com letras e números.'
      : 'Não foi possível alterar: '+error.message; }
    say('conta',t,!!error); return;
  }
});

document.addEventListener('change', async ev=>{
  const el=ev.target, d=el.dataset;
  if(el.id==='selClub'){ await selectClub(el.value); return; }
  if(el.id==='selTeam'){ selectTeam(el.value); return; }
  if(d.luform!==undefined||d.luslot!==undefined||d.luov!==undefined){ const m=M(); if(!m||matchRO(m)) return; const lu=luChange(m); S.luOpen=true;
    if(d.luform!==undefined){ const old=lu.slots; const n=1+el.value.split('-').reduce((a,b)=>a+ +b,0); lu.formation=el.value; lu.slots=Array.from({length:n},(_,i)=>old[i]||null); }
    else if(d.luslot!==undefined){ const k=+d.luslot, v=el.value||null; const j=lu.slots.indexOf(v); if(v&&j>=0&&j!==k) lu.slots[j]=lu.slots[k]||null; lu.slots[k]=v; }
    else { lu.override=lu.override||{}; if(el.value==='') delete lu.override[d.luov]; else lu.override[d.luov]=Math.max(0,Math.min(10,+el.value)); }
    touch(m); render(); return; }
  if(el.id==='cuForm'){ const nT=Object.values(S.callup||{}).filter(v=>v==='T').length, n=Math.min(MAX_TIT,formSize(el.value));
    if(nT>n){ toast(`A formação ${el.value} só tem ${n} lugares e já há ${nT} titulares. Retire ${nT-n} titular(es) primeiro.`); el.value=S.cuForm; return; }
    S.cuForm=el.value; cuRefresh(); return; }
  if(el.id==='selSeason'){ S.season=+el.value; render(); return; }
  if(d.pf){ const p=S.players.find(x=>x.id===d.id); if(!p) return; p[d.pf]=el.value.trim(); const { error }=await sb.from('players').update({[d.pf]:p[d.pf]}).eq('id',p.id); if(error) toast(error.message); else toast('Plantel gravado.'); return; }
  if(d.tf){ const t=S.teams.find(x=>x.id===d.id); const v=d.tf==='half_len'?+el.value:el.value.trim(); const { error }=await sb.from('teams').update({[d.tf]:v}).eq('id',t.id); if(error) toast(error.message); else { t[d.tf]=v; renderHeader(); toast('Equipa gravada.'); } return; }
  if(d.role){ const { error }=await sb.from('memberships').update({role:el.value}).eq('club_id',S.club.id).eq('user_id',d.role); if(error) toast(error.message); else { toast('Perfil alterado.'); loadClubAdmin(); } return; }
  if(d.cf){ const c=S.clubs.find(x=>x.id===d.id); let v=el.type==='checkbox'?el.checked:el.value; if(d.cf==='monthly_fee') v=+v||0; if(d.cf==='ai_monthly_limit') v=parseInt(v)||0; if(d.cf==='paid_until'&&!v) v=null;
    const { error }=await sb.from('clubs').update({[d.cf]:v}).eq('id',c.id); if(error) toast(error.message); else { c[d.cf]=v; if(S.club&&S.club.id===c.id){ Object.assign(S.club,c); applyBrand(); } toast('Clube gravado.'); render(); } return; }
});
document.addEventListener('keydown', ev=>{
  if(view()!=='registo'||/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)||ev.metaKey||ev.ctrlKey||ev.altKey) return;
  if(ev.key==='Escape'&&S.pending){ S.pending=null; render(); return; }
  if(S.pending) return;
  const k=ev.key.toUpperCase(), a=Object.entries(ACT).find(([,v])=>v.k===k);
  if(a){ ev.preventDefault(); begin(a[0]); }
});
window.addEventListener('hashchange',()=>{ S.pending=null; S.confirm=null; if(view()==='clube') loadClubAdmin(); render(); });
window.addEventListener('beforeunload', e=>{ if(dirty.size){ e.preventDefault(); e.returnValue=''; } });
boot();
