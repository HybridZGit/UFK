const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const state = {
  fighters: [], champions: [], results: [], events: [], contracts: [], bets: [], settings: {},
  user: null, isAdmin: false, profile: null, myFighter: null
};

const configured = Boolean(window.UFK_SUPABASE_URL && window.UFK_SUPABASE_ANON_KEY && window.supabase?.createClient);
const db = configured ? window.supabase.createClient(window.UFK_SUPABASE_URL, window.UFK_SUPABASE_ANON_KEY) : null;

function showPage(id){
  $$('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  $$('nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===id));
  $('#nav')?.classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-page]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showPage(a.dataset.page);history.replaceState(null,'','#'+a.dataset.page)}));
$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.jump)));
$('#menuBtn').onclick=()=>$('#nav').classList.toggle('open');

function toast(msg, bad=false){
  const t=$('#toast'); t.textContent=msg; t.classList.toggle('error',bad); t.classList.add('show');
  clearTimeout(window._toast); window._toast=setTimeout(()=>t.classList.remove('show'),2800);
}
function fmtDate(d){ if(!d) return ''; const x=new Date(`${d}T12:00:00`); return Number.isNaN(x.getTime())?d:x.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function record(f){ return `${f.wins ?? 0}-${f.losses ?? 0}-${f.draws ?? 0}${f.region ? ` · ${f.region}` : ''}`; }
function fighterById(id){ return state.fighters.find(f=>f.id===id); }
function empty(msg){ return `<div class="data-empty">${esc(msg)}</div>`; }
function chip(v){ const n=Number(v||0); return `<span class="score-chip ${n<8?'mid':''}">${n.toFixed(1)}</span>`; }

async function loadPublicData(){
  if(!db){ renderAll(); return; }
  const queries = await Promise.all([
    db.from('fighters').select('*').eq('active',true).order('score',{ascending:false}),
    db.from('champions').select('*'),
    db.from('results').select('*').order('event_date',{ascending:false}).limit(20),
    db.from('events').select('*').order('event_date',{ascending:true}),
    db.from('contract_activity').select('*').order('created_at',{ascending:false}).limit(20),
    db.from('betting_markets').select('*').eq('is_open',true).order('created_at',{ascending:false}),
    db.from('league_settings').select('*')
  ]);
  const firstError = queries.find(x=>x.error)?.error;
  if(firstError){ toast(`Supabase: ${firstError.message}`, true); }
  [state.fighters,state.champions,state.results,state.events,state.contracts,state.bets] = queries.slice(0,6).map(x=>x.data||[]);
  state.settings = Object.fromEntries((queries[6].data||[]).map(x=>[x.key,x.value]));
  renderAll();
}

function renderAll(){ renderHome(); renderRanks($('#fighterSearch')?.value||''); renderBets(); renderEvents(); renderLegacy(); populateFighterSelects(); renderAdminRows(); updateAccountUI(); }

function renderHome(){
  const featured=state.settings.featured_main_event||{};
  const left=fighterById(featured.champion_id), right=fighterById(featured.challenger_id);
  $('#featuredChampion').textContent=left?.name||'TBA';
  $('#featuredChampionMeta').textContent=left?record(left):(featured.event_label||'No featured fight set');
  $('#featuredChallenger').textContent=right?.name||'TBA';
  $('#featuredChallengerMeta').textContent=right?record(right):'Waiting for admin update';

  $('#recentResults').innerHTML = state.results.length ? state.results.slice(0,4).map(r=>{
    const w=fighterById(r.winner_id), l=fighterById(r.loser_id);
    return `<div class="mini-row"><div class="mini-badge">W</div><div class="mini-copy"><strong>${esc(w?.name||'Unknown')} def. ${esc(l?.name||'Unknown')}</strong><span>${esc(r.method)}</span></div><div class="mini-time">${esc(fmtDate(r.event_date))}</div></div>`;
  }).join('') : empty('No results yet.');

  $('#championList').innerHTML = state.champions.filter(c=>c.fighter_id).length ? state.champions.filter(c=>c.fighter_id).map(c=>{
    const f=fighterById(c.fighter_id); return `<div class="mini-row champion-row"><div class="mini-badge">🏆</div><div class="mini-copy"><span>${esc(c.division)} Champion</span><strong>${esc(f?.name||'Vacant')}</strong></div></div>`;
  }).join('') : empty('No champions assigned.');

  $('#contractFeed').innerHTML = state.contracts.length ? state.contracts.slice(0,4).map(c=>{
    const f=fighterById(c.fighter_id); return `<div class="mini-row"><div class="mini-copy"><strong>${esc(f?.name||'Unknown')} ${esc(c.action)}</strong><span>${new Date(c.created_at).toLocaleDateString()}</span></div></div>`;
  }).join('') : empty('No contract activity.');

  const wc=state.champions.find(c=>c.division==='UFK World' && c.fighter_id);
  const wf=wc && fighterById(wc.fighter_id);
  $('#worldChampionBanner').innerHTML = wf
    ? `<small>UFK WORLD CHAMPION</small><strong>${esc(wf.name)}</strong><span>${esc(record(wf))} · ${wc.defenses||0} title defenses</span>`
    : `<small>UFK WORLD CHAMPION</small><strong>VACANT</strong><span>No champion assigned</span>`;
}

function renderRanks(filter=''){
  const rows=state.fighters.filter(f=>f.name.toLowerCase().includes(filter.toLowerCase()));
  $('#rankRows').innerHTML = rows.length ? rows.map((f,i)=>`<tr><td>${i+1}</td><td class="rank-name"><strong>${esc(f.name)}</strong><span>${esc(record(f))}</span></td><td>${chip(f.resume)}</td><td>${chip(f.momentum)}</td><td>${chip(f.finishing)}</td><td>${chip(f.activity)}</td><td>${chip(f.big_fight)}</td><td class="overall">${Number(f.score||0).toFixed(1)}</td></tr>`).join('') : `<tr><td colspan="8">${empty('No fighters in the database yet.')}</td></tr>`;
}
$('#fighterSearch').addEventListener('input',e=>renderRanks(e.target.value));
$('#rankingTabs').addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){$$('#rankingTabs button').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');toast(`${e.target.textContent} selected.`)}});

function renderBets(){
  $('#betGrid').innerHTML = state.bets.length ? state.bets.map((b,i)=>{
    const a=fighterById(b.fighter_a_id), c=fighterById(b.fighter_b_id);
    return `<article class="bet-card"><header><span>UFK MARKET ${String(i+1).padStart(2,'0')}</span><span>BETTING OPEN</span></header><div class="matchup"><strong>${esc(a?.name||'TBA')}</strong><span>VS</span><strong>${esc(c?.name||'TBA')}</strong></div><div class="odds"><button data-bet="${esc(a?.name||'TBA')}">${esc(a?.name||'TBA')} ${esc(b.odds_a)}</button><button data-bet="${esc(c?.name||'TBA')}">${esc(c?.name||'TBA')} ${esc(b.odds_b)}</button></div></article>`;
  }).join('') : empty('No open betting markets.');
}
$('#betGrid').addEventListener('click',e=>{const b=e.target.closest('[data-bet]');if(b)toast(`Bet slip opened for ${b.dataset.bet} (demo currency).`)});
$('#resetWallet').onclick=()=>toast('Wallet reset locally.');

function renderEvents(){
  $('#fightList').innerHTML = state.events.length ? state.events.map(e=>`<article class="event-row"><time>${esc(fmtDate(e.event_date))}</time><strong>${esc(e.name)}</strong><span>${esc(e.details||e.status)}</span></article>`).join('') : empty('No fight cards or results have been added yet.');
}

function renderLegacy(){
  if(!state.fighters.length){ $('#legacyRecords').innerHTML='<div class="empty-card">No legacy records yet.</div>'; return; }
  const mostFights=[...state.fighters].sort((a,b)=>(b.wins+b.losses+b.draws)-(a.wins+a.losses+a.draws))[0];
  const mostWins=[...state.fighters].sort((a,b)=>b.wins-a.wins)[0];
  const defenseChamp=[...state.champions].sort((a,b)=>(b.defenses||0)-(a.defenses||0))[0];
  const defenseF=defenseChamp&&fighterById(defenseChamp.fighter_id);
  $('#legacyRecords').innerHTML=`<div class="record"><span>MOST WINS</span><strong>${mostWins?.wins||0}</strong><p>${esc(mostWins?.name||'—')}</p></div><div class="record"><span>MOST TITLE DEFENSES</span><strong>${defenseChamp?.defenses||0}</strong><p>${esc(defenseF?.name||'—')}</p></div><div class="record"><span>MOST FIGHTS</span><strong>${mostFights?(mostFights.wins+mostFights.losses+mostFights.draws):0}</strong><p>${esc(mostFights?.name||'—')}</p></div>`;
}

function populateFighterSelects(){
  const html = `<option value="">Select fighter</option>` + state.fighters.map(f=>`<option value="${f.id}">${esc(f.name)} (${f.wins}-${f.losses}-${f.draws})</option>`).join('');
  $$('.fighter-select').forEach(s=>{const current=s.value;s.innerHTML=html;if([...s.options].some(o=>o.value===current))s.value=current;});
}

async function refreshSession(){
  if(!db){ updateAdminUI(); updateAccountUI(); return; }
  const {data:{session}}=await db.auth.getSession();
  state.user=session?.user||null; state.isAdmin=false; state.profile=null; state.myFighter=null;
  if(state.user){
    const [{data:profile,error:profileError},{data:myFighter}] = await Promise.all([
      db.from('profiles').select('id,is_admin,display_name,region').eq('id',state.user.id).single(),
      db.from('fighters').select('*').eq('user_id',state.user.id).maybeSingle()
    ]);
    if(!profileError && profile){ state.profile=profile; state.isAdmin=Boolean(profile.is_admin); }
    state.myFighter=myFighter||null;
  }
  updateAdminUI(); updateAccountUI();
}
function updateAdminUI(){
  $('#connectionStatus').textContent=configured?'Supabase connected':'Supabase not configured';
  $('#setupNotice').classList.toggle('hidden',configured && state.isAdmin);
  $('#loginForm').classList.toggle('hidden',Boolean(state.user));
  $('#adminSession').classList.toggle('hidden',!state.user);
  $('#adminIdentity').textContent=state.user?`${state.user.email}${state.isAdmin?' · ADMIN':' · NOT ADMIN'}`:'';
  $('#adminControls').classList.toggle('hidden',!state.isAdmin);
  $('#adminLocked').classList.toggle('hidden',state.isAdmin);
  if(state.user && !state.isAdmin) $('#adminLocked').textContent='This account is signed in but is not marked as a UFK admin in public.profiles.';
  else if(!configured) $('#adminLocked').textContent='Add your Supabase URL and anon/publishable key to config.js, then run supabase-schema.sql.';
  else $('#adminLocked').textContent='Sign in with an account marked as an admin in Supabase to unlock league controls.';
}


function updateAccountUI(){
  const guest=$('#accountGuest'), member=$('#accountMember');
  if(!guest||!member) return;
  guest.classList.toggle('hidden',Boolean(state.user));
  member.classList.toggle('hidden',!state.user);
  $('#fighterAccountStatus').textContent = !configured ? 'Supabase not configured' : state.user ? (state.isAdmin?'Admin / fighter account':'Fighter account active') : 'Create an account or sign in';
  if(!state.user) return;
  $('#memberEmail').textContent=state.user.email||'Signed in';
  $('#memberRole').textContent=state.isAdmin?'UFK Administrator':'UFK Fighter';
  const form=$('#profileForm');
  if(form){ form.elements.display_name.value=state.profile?.display_name||state.user.user_metadata?.fighter_name||''; form.elements.region.value=state.profile?.region||state.user.user_metadata?.region||''; }
  const f=state.myFighter;
  $('#createMyFighterBtn').classList.toggle('hidden',Boolean(f));
  $('#myFighterDetails').innerHTML = f ? `<strong>${esc(f.name)}</strong><span class="fighter-badge">OFFICIAL UFK FIGHTER</span><div class="my-record"><div><strong>${f.wins}</strong><span>WINS</span></div><div><strong>${f.losses}</strong><span>LOSSES</span></div><div><strong>${f.draws}</strong><span>DRAWS</span></div></div><small>Region: ${esc(f.region||'—')} · Rating: ${Number(f.score||0).toFixed(1)}</small>` : 'No official fighter profile linked yet. Create yours below with a clean 0-0-0 record.';
}

$('#fighterSignupForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); if(!db) return toast('Configure Supabase first.',true);
  const d=new FormData(e.target); const fighter_name=d.get('fighter_name').trim(), region=d.get('region').trim();
  const {data,error}=await db.auth.signUp({email:d.get('email'),password:d.get('password'),options:{data:{fighter_name,region}}});
  if(error) return toast(error.message,true);
  if(data.session){ await refreshSession(); toast('Account created and signed in.'); }
  else toast('Account created. Check your email to confirm your UFK account.');
});
$('#fighterLoginForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); if(!db) return toast('Configure Supabase first.',true);
  const d=new FormData(e.target); const {error}=await db.auth.signInWithPassword({email:d.get('email'),password:d.get('password')});
  if(error) return toast(error.message,true); await refreshSession(); toast('Signed in to UFK.');
});
$('#fighterSignOutBtn')?.addEventListener('click',async()=>{ if(db) await db.auth.signOut(); state.user=null;state.isAdmin=false;state.profile=null;state.myFighter=null;updateAdminUI();updateAccountUI();toast('Signed out.'); });
$('#profileForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); if(!db||!state.user) return toast('Sign in first.',true);
  const d=new FormData(e.target), display_name=d.get('display_name').trim(), region=d.get('region').trim();
  const {error}=await db.from('profiles').update({display_name,region:region||null,updated_at:new Date().toISOString()}).eq('id',state.user.id);
  if(error)return toast(error.message,true); await refreshSession(); toast('Profile saved.');
});
$('#createMyFighterBtn')?.addEventListener('click',async()=>{
  if(!db||!state.user) return toast('Sign in first.',true); if(state.myFighter)return toast('Your fighter profile already exists.',true);
  const name=(state.profile?.display_name||state.user.user_metadata?.fighter_name||'').trim();
  if(!name) return toast('Add a display name to your profile first.',true);
  const {error}=await db.from('fighters').insert({user_id:state.user.id,name,region:state.profile?.region||null,wins:0,losses:0,draws:0,resume:0,momentum:0,finishing:0,activity:0,big_fight:0,score:0,active:true});
  if(error)return toast(error.message,true); await refreshSession(); await loadPublicData(); toast('Official fighter profile created.');
});

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!db) return toast('Configure Supabase first.',true);
  const d=new FormData(e.target); const {error}=await db.auth.signInWithPassword({email:d.get('email'),password:d.get('password')});
  if(error) return toast(error.message,true); await refreshSession(); toast(state.isAdmin?'Admin signed in.':'Signed in, but this user is not an admin.',!state.isAdmin);
});
$('#signOutBtn').addEventListener('click',async()=>{if(db)await db.auth.signOut();state.user=null;state.isAdmin=false;state.profile=null;state.myFighter=null;updateAdminUI();updateAccountUI();toast('Signed out.');});
$('#refreshAdmin').addEventListener('click',async()=>{await loadPublicData();toast('Database refreshed.');});

async function adminInsert(table,payload,msg){
  if(!state.isAdmin) return toast('Admin permission required.',true);
  const {error}=await db.from(table).insert(payload); if(error)return toast(error.message,true); toast(msg); await loadPublicData();
}
async function adminUpdate(table,payload,match,msg){
  if(!state.isAdmin) return toast('Admin permission required.',true);
  let q=db.from(table).update(payload); Object.entries(match).forEach(([k,v])=>q=q.eq(k,v)); const {error}=await q; if(error)return toast(error.message,true); toast(msg); await loadPublicData();
}

$('#fighterCreateForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('fighters',{name:d.get('name').trim(),wins:+d.get('wins'),losses:+d.get('losses'),draws:+d.get('draws'),region:d.get('region').trim()||null},'Fighter added.');if(state.isAdmin)e.target.reset();});
$('#recordForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminUpdate('fighters',{wins:+d.get('wins'),losses:+d.get('losses'),draws:+d.get('draws'),updated_at:new Date().toISOString()},{id:d.get('fighter_id')},'Record updated.');});
$('#championForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(!state.isAdmin)return;const payload={division:d.get('division'),fighter_id:d.get('fighter_id'),defenses:+d.get('defenses')||0,granted_at:new Date().toISOString()};const {error}=await db.from('champions').upsert(payload,{onConflict:'division'});if(error)return toast(error.message,true);toast(`${d.get('division')} champion granted.`);await loadPublicData();});
$('#vacateTitleBtn').addEventListener('click',async()=>{const f=$('#championForm');const division=new FormData(f).get('division');if(!state.isAdmin)return;const {error}=await db.from('champions').upsert({division,fighter_id:null,defenses:0,granted_at:new Date().toISOString()},{onConflict:'division'});if(error)return toast(error.message,true);toast(`${division} title vacated.`);await loadPublicData();});
$('#resultForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('winner_id')===d.get('loser_id'))return toast('Winner and loser must be different.',true);await adminInsert('results',{winner_id:d.get('winner_id'),loser_id:d.get('loser_id'),method:d.get('method'),event_date:d.get('event_date')},'Result published.');});
$('#eventForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('events',{name:d.get('name').trim(),event_date:d.get('event_date'),details:d.get('details').trim()||null,status:d.get('status')},'Event created.');});
$('#contractForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('contract_activity',{fighter_id:d.get('fighter_id'),action:d.get('action')},'Contract activity posted.');});
$('#betForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('fighter_a_id')===d.get('fighter_b_id'))return toast('Choose two different fighters.',true);await adminInsert('betting_markets',{fighter_a_id:d.get('fighter_a_id'),fighter_b_id:d.get('fighter_b_id'),odds_a:d.get('odds_a'),odds_b:d.get('odds_b'),is_open:true},'Betting market opened.');});
$('#featureForm').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('champion_id')===d.get('challenger_id'))return toast('Choose two different fighters.',true);if(!state.isAdmin)return;const {error}=await db.from('league_settings').upsert({key:'featured_main_event',value:{champion_id:d.get('champion_id'),challenger_id:d.get('challenger_id'),event_label:d.get('event_label')},updated_at:new Date().toISOString()},{onConflict:'key'});if(error)return toast(error.message,true);toast('Featured fight updated.');await loadPublicData();});

function renderAdminRows(){
  if(!$('#adminFighterRows'))return;
  $('#adminFighterRows').innerHTML = state.fighters.length ? state.fighters.map(f=>{
    const titles=state.champions.filter(c=>c.fighter_id===f.id).map(c=>c.division).join(', ')||'—';
    return `<tr><td><strong>${esc(f.name)}</strong></td><td>${esc(record(f))}</td><td>${esc(f.region||'—')}</td><td>${esc(titles)}</td><td><button class="mini-action" data-load-record="${f.id}">Edit record</button><button class="mini-action danger" data-delete-fighter="${f.id}">Delete</button></td></tr>`;
  }).join('') : `<tr><td colspan="5">${empty('No fighters yet.')}</td></tr>`;
}
$('#adminFighterRows').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-load-record]'); const del=e.target.closest('[data-delete-fighter]');
  if(edit){const f=fighterById(edit.dataset.loadRecord);const form=$('#recordForm');form.elements.fighter_id.value=f.id;form.elements.wins.value=f.wins;form.elements.losses.value=f.losses;form.elements.draws.value=f.draws;form.scrollIntoView({behavior:'smooth',block:'center'});}
  if(del){const f=fighterById(del.dataset.deleteFighter);if(!confirm(`Delete ${f?.name||'this fighter'}? Related rows may also be affected.`))return;const {error}=await db.from('fighters').delete().eq('id',del.dataset.deleteFighter);if(error)return toast(error.message,true);toast('Fighter deleted.');await loadPublicData();}
});

$('#clearLeagueData').addEventListener('click',async()=>{
  if(!state.isAdmin||!confirm('Clear ALL UFK league data? This deletes settings, betting, contracts, results, champions, events and fighters.'))return;
  for(const table of ['league_settings','betting_markets','contract_activity','results','champions','events','fighters']){
    const {error}=await db.from(table).delete().neq('created_at','1900-01-01T00:00:00Z');
    if(error && table!=='champions' && table!=='league_settings') return toast(`${table}: ${error.message}`,true);
    if(error && (table==='champions'||table==='league_settings')){
      const key=table==='champions'?'division':'key';
      const {error:retry}=await db.from(table).delete().neq(key,'__never__'); if(retry)return toast(`${table}: ${retry.message}`,true);
    }
  }
  toast('League data cleared.'); await loadPublicData();
});

if(db){ db.auth.onAuthStateChange(()=>setTimeout(refreshSession,0)); }
(async function init(){
  renderAll(); updateAdminUI(); await refreshSession(); await loadPublicData();
  if(location.hash && $(location.hash)) showPage(location.hash.slice(1));
})();
