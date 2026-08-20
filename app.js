const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const state = {
  fighters: [], champions: [], results: [], events: [], contracts: [], bets: [], settings: {},
  user: null, isAdmin: false, profile: null, myFighter: null, wallet: null, userBets: [],
  rankingDivision: 'UCS World', betSelection: null
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

function toast(msg,bad=false){
  const t=$('#toast'); t.textContent=msg; t.classList.toggle('error',bad); t.classList.add('show');
  clearTimeout(window._toast); window._toast=setTimeout(()=>t.classList.remove('show'),2800);
}
function fmtDate(d){ if(!d) return ''; const x=new Date(`${d}T12:00:00`); return Number.isNaN(x.getTime())?d:x.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function record(f){ return `${f?.wins ?? 0}-${f?.losses ?? 0}-${f?.draws ?? 0}${f?.region ? ` · ${f.region}` : ''}`; }
function fighterById(id){ return state.fighters.find(f=>f.id===id); }
function empty(msg){ return `<div class="data-empty">${esc(msg)}</div>`; }
function chip(v){ const n=Number(v||0); return `<span class="score-chip ${n<8?'mid':''}">${n.toFixed(1)}</span>`; }
function initials(name='UCS'){ return name.trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase() || 'UCS'; }
function avatarHtml(f,size='rank-avatar'){
  return f?.avatar_url ? `<img class="${size}" src="${esc(f.avatar_url)}" alt="${esc(f.name)} profile picture" loading="lazy">` : `<div class="${size} avatar-fallback">${esc(initials(f?.name))}</div>`;
}
function currentRank(f){
  const ordered=[...state.fighters].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const idx=ordered.findIndex(x=>x.id===f.id); return idx>=0?idx+1:null;
}
function fighterResults(f){ return state.results.filter(r=>r.winner_id===f.id||r.loser_id===f.id); }
function fighterForm(f){
  const recent=fighterResults(f).slice(0,5);
  if(!recent.length) return '—';
  return recent.map(r=>r.winner_id===f.id?'W':r.loser_id===f.id?'L':'D').join('');
}

async function loadPublicData(){
  if(!db){ renderAll(); return; }
  const queries = await Promise.all([
    db.from('fighters').select('*').eq('active',true).order('score',{ascending:false}),
    db.from('champions').select('*'),
    db.from('results').select('*').order('event_date',{ascending:false}).limit(100),
    db.from('events').select('*').order('event_date',{ascending:true}),
    db.from('contract_activity').select('*').order('created_at',{ascending:false}).limit(20),
    db.from('betting_markets').select('*').eq('is_open',true).order('created_at',{ascending:false}),
    db.from('league_settings').select('*')
  ]);
  const firstError = queries.find(x=>x.error)?.error;
  if(firstError) toast(`Supabase: ${firstError.message}`,true);
  [state.fighters,state.champions,state.results,state.events,state.contracts,state.bets]=queries.slice(0,6).map(x=>x.data||[]);
  state.settings=Object.fromEntries((queries[6].data||[]).map(x=>[x.key,x.value]));
  renderAll();
}

function renderAll(){ renderHome(); renderRanks($('#fighterSearch')?.value||''); renderBets(); renderEvents(); populateFighterSelects(); renderAdminRows(); updateAccountUI(); }

function renderHome(){
  const featured=state.settings.featured_main_event||{};
  const left=fighterById(featured.champion_id), right=fighterById(featured.challenger_id);
  $('#featuredChampion').textContent=left?.name||'TBA';
  $('#featuredChampionMeta').textContent=left?record(left):(featured.event_label||'No featured fight set');
  $('#featuredChallenger').textContent=right?.name||'TBA';
  $('#featuredChallengerMeta').textContent=right?record(right):'Waiting for admin update';

  $('#recentResults').innerHTML=state.results.length?state.results.slice(0,4).map(r=>{
    const w=fighterById(r.winner_id),l=fighterById(r.loser_id);
    return `<div class="mini-row"><div class="mini-badge">W</div><div class="mini-copy"><strong>${esc(w?.name||'Unknown')} def. ${esc(l?.name||'Unknown')}</strong><span>${esc(r.method)}</span></div><div class="mini-time">${esc(fmtDate(r.event_date))}</div></div>`;
  }).join(''):empty('No results yet.');

  $('#championList').innerHTML=state.champions.filter(c=>c.fighter_id).length?state.champions.filter(c=>c.fighter_id).map(c=>{
    const f=fighterById(c.fighter_id); return `<div class="mini-row champion-row"><div class="mini-badge">🏆</div><div class="mini-copy"><span>${esc(c.division)} Champion</span><strong>${esc(f?.name||'Vacant')}</strong></div></div>`;
  }).join(''):empty('No champions assigned.');

  $('#homeBettingSummary').textContent=state.bets.length?`${state.bets.length} UCS betting market${state.bets.length===1?' is':'s are'} open.`:'No open markets right now.';
  $('#contractFeed').innerHTML=state.contracts.length?state.contracts.slice(0,4).map(c=>{
    const f=fighterById(c.fighter_id); return `<div class="mini-row"><div class="mini-copy"><strong>${esc(f?.name||'Unknown')} ${esc(c.action)}</strong><span>${new Date(c.created_at).toLocaleDateString()}</span></div></div>`;
  }).join(''):empty('No contract activity.');

  renderRankingChampion();
}

function renderRanks(filter=''){
  const platform=state.rankingDivision==='UCS World'?null:state.rankingDivision.replace('UCS ','');
  const rows=state.fighters.filter(f=>f.name.toLowerCase().includes(filter.toLowerCase())&&(!platform||(f.platform||'').toUpperCase()===platform));
  $('#rankRows').innerHTML=rows.length?rows.map((f,i)=>`<tr class="fighter-rank-row" data-fighter-profile="${f.id}" tabindex="0"><td><span class="rank-number">${i+1}</span></td><td class="rank-name"><div class="rank-fighter-cell">${avatarHtml(f)}<div><strong>${esc(f.name)}</strong><span>${esc(record(f))} · ${esc(f.platform||'UNASSIGNED')}</span></div></div></td><td>${chip(f.resume)}</td><td>${chip(f.momentum)}</td><td>${chip(f.finishing)}</td><td>${chip(f.activity)}</td><td>${chip(f.big_fight)}</td><td class="overall">${Number(f.score||0).toFixed(1)}</td></tr>`).join(''):`<tr><td colspan="8">${empty(`No ${state.rankingDivision} fighters in the database yet.`)}</td></tr>`;
  renderRankingChampion();
}
function renderRankingChampion(){
  const c=state.champions.find(x=>x.division===state.rankingDivision&&x.fighter_id);
  const f=c&&fighterById(c.fighter_id);
  if(!$('#worldChampionBanner')) return;
  $('#worldChampionBanner').innerHTML=f
    ? `<small>${esc(state.rankingDivision.toUpperCase())} CHAMPION</small><div class="champion-inline">${avatarHtml(f,'champion-avatar')}<div><strong>${esc(f.name)}</strong><span>${esc(record(f))} · ${c.defenses||0} title defenses</span></div></div>`
    : `<small>${esc(state.rankingDivision.toUpperCase())} CHAMPION</small><strong>VACANT</strong><span>No champion assigned</span>`;
}
$('#fighterSearch')?.addEventListener('input',e=>renderRanks(e.target.value));
$('#rankingTabs')?.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){ $$('#rankingTabs button').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');state.rankingDivision=e.target.dataset.div;renderRanks($('#fighterSearch')?.value||'');}});
$('#rankRows')?.addEventListener('click',e=>{const row=e.target.closest('[data-fighter-profile]');if(row)openFighterProfile(row.dataset.fighterProfile);});
$('#rankRows')?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-fighter-profile]')){e.preventDefault();openFighterProfile(e.target.dataset.fighterProfile);}});

function openFighterProfile(id){
  const f=fighterById(id); if(!f)return;
  const modal=$('#fighterModal');
  const rank=currentRank(f),titles=state.champions.filter(c=>c.fighter_id===f.id),history=fighterResults(f);
  $('#profileName').textContent=f.name;
  $('#profilePlatform').textContent=`UCS ${f.platform||'WORLD'}`;
  $('#profileRegion').textContent=f.region||'Region not set';
  $('#profileRank').textContent=rank?`#${rank}`:'#—';
  $('#profileRecord').textContent=`${f.wins||0}-${f.losses||0}-${f.draws||0}`;
  $('#profileScore').textContent=Number(f.score||0).toFixed(1);
  $('#profileStreak').textContent=fighterForm(f);
  $('#profileTitles').textContent=String(titles.length);
  $('#profileFights').textContent=String((f.wins||0)+(f.losses||0)+(f.draws||0));
  $('#profileAvatar').innerHTML=f.avatar_url?`<img src="${esc(f.avatar_url)}" alt="${esc(f.name)}">`:`<span>${esc(initials(f.name))}</span>`;
  const metrics=[['Resume',f.resume],['Momentum',f.momentum],['Finishing',f.finishing],['Activity',f.activity],['Big fight',f.big_fight]];
  $('#profileRatingBars').innerHTML=metrics.map(([label,val])=>`<div class="profile-meter"><div><span>${label}</span><b>${Number(val||0).toFixed(1)}</b></div><i><em style="width:${Math.max(0,Math.min(100,Number(val||0)*10))}%"></em></i></div>`).join('');
  $('#profileFightHistory').innerHTML=history.length?history.slice(0,10).map(r=>{
    const won=r.winner_id===f.id,opp=fighterById(won?r.loser_id:r.winner_id);
    return `<div class="profile-fight-row"><span class="result-pill ${won?'win':'loss'}">${won?'W':'L'}</span><div><strong>vs ${esc(opp?.name||'Unknown')}</strong><small>${esc(r.method)} · ${esc(fmtDate(r.event_date))}</small></div></div>`;
  }).join(''):empty('No official fight history yet.');
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
}
function closeFighterProfile(){const modal=$('#fighterModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');}
$$('[data-close-profile]').forEach(x=>x.addEventListener('click',closeFighterProfile));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeFighterProfile();});

function americanReturn(stake,odds){
  const n=parseFloat(String(odds||'').replace(/[^0-9+.-]/g,'')); if(!Number.isFinite(n)||n===0)return stake;
  const profit=n>0?stake*(n/100):stake*(100/Math.abs(n)); return Math.round((stake+profit)*100)/100;
}
function formatCredits(v){return `UC ${Number(v||0).toLocaleString(undefined,{maximumFractionDigits:2})}`;}
function renderBets(){
  $('#marketCount').textContent=`${state.bets.length} LIVE MARKET${state.bets.length===1?'':'S'}`;
  const balance=$('#walletBalance'),sub=$('#walletSubtext');
  if(state.user&&state.wallet){balance.textContent=formatCredits(state.wallet.balance);sub.textContent='Stored securely with your UCS account';}
  else if(state.user){balance.textContent='UC 0';sub.textContent='Wallet setup required — run the latest Supabase schema';}
  else {balance.textContent='SIGN IN';sub.textContent='Sign in to access your account balance';}
  $('#betGrid').innerHTML=state.bets.length?state.bets.map((b,i)=>{
    const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
    return `<article class="vault-market"><div class="market-head"><div><span class="market-number">MARKET ${String(i+1).padStart(2,'0')}</span><strong>UCS FIGHT MARKET</strong></div><span class="market-live"><i></i> OPEN</span></div><div class="market-matchup"><button class="fighter-odds" data-market="${b.id}" data-fighter="${b.fighter_a_id}" data-name="${esc(a?.name||'TBA')}" data-odds="${esc(b.odds_a)}"><span class="corner-label">RED CORNER</span><strong>${esc(a?.name||'TBA')}</strong><small>${esc(record(a||{}))}</small><b>${esc(b.odds_a)}</b></button><div class="market-vs"><span>UCS</span><strong>VS</strong></div><button class="fighter-odds right" data-market="${b.id}" data-fighter="${b.fighter_b_id}" data-name="${esc(c?.name||'TBA')}" data-odds="${esc(b.odds_b)}"><span class="corner-label">BLUE CORNER</span><strong>${esc(c?.name||'TBA')}</strong><small>${esc(record(c||{}))}</small><b>${esc(b.odds_b)}</b></button></div></article>`;
  }).join(''):empty('No open UCS betting markets right now.');
  $('#myBetRows').innerHTML=!state.user?'Sign in to view your bets.':state.userBets.length?state.userBets.slice(0,6).map(b=>{const f=fighterById(b.selection_fighter_id);return `<div class="user-bet-row"><div><strong>${esc(f?.name||'Fighter')}</strong><span>${esc(b.odds)} · ${esc(b.status.toUpperCase())}</span></div><b>${formatCredits(b.stake)}</b></div>`;}).join(''):'No bets placed yet.';
  updateBetSlip();
}
function updateBetSlip(){const selected=state.betSelection;$('#slipEmpty').classList.toggle('hidden',Boolean(selected));$('#placeBetForm').classList.toggle('hidden',!selected);if(!selected){$('#slipMarketLabel').textContent='NO SELECTION';return;}$('#slipMarketLabel').textContent='MARKET SELECTED';$('#slipFighter').textContent=selected.name;$('#slipOdds').textContent=selected.odds;updatePotentialReturn();}
function updatePotentialReturn(){const stake=Number($('#betStake')?.value||0);$('#potentialReturn').textContent=formatCredits(americanReturn(stake,state.betSelection?.odds));}
$('#betGrid')?.addEventListener('click',e=>{const b=e.target.closest('.fighter-odds');if(!b)return;if(!state.user){toast('Sign in to your UCS account before placing a bet.',true);showPage('account');return;}state.betSelection={marketId:b.dataset.market,fighterId:b.dataset.fighter,name:b.dataset.name,odds:b.dataset.odds};$$('.fighter-odds').forEach(x=>x.classList.toggle('selected',x===b));updateBetSlip();});
$('#walletAccountBtn').onclick=()=>showPage('account');
$('#betStake')?.addEventListener('input',updatePotentialReturn);
$$('.quick-stakes button').forEach(b=>b.addEventListener('click',()=>{$('#betStake').value=b.dataset.stake;updatePotentialReturn();}));
$('#placeBetForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db||!state.user||!state.betSelection)return toast('Sign in and select a market first.',true);const stake=Math.floor(Number($('#betStake').value||0));if(stake<1)return toast('Enter a valid UCS Credit stake.',true);if(!state.wallet||Number(state.wallet.balance)<stake)return toast('Not enough UCS Credits in your wallet.',true);const {error}=await db.rpc('place_ufk_bet',{p_market_id:state.betSelection.marketId,p_selection_id:state.betSelection.fighterId,p_stake:stake});if(error)return toast(error.message,true);state.betSelection=null;$('#betStake').value='';$$('.fighter-odds').forEach(x=>x.classList.remove('selected'));await refreshWallet();toast('UCS bet placed.');});
async function refreshWallet(){if(!db||!state.user){state.wallet=null;state.userBets=[];renderBets();return;}const [{data:wallet},{data:bets}]=await Promise.all([db.from('wallets').select('user_id,balance').eq('user_id',state.user.id).maybeSingle(),db.from('user_bets').select('*').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(20)]);state.wallet=wallet||null;state.userBets=bets||[];renderBets();}

function renderEvents(){$('#fightList').innerHTML=state.events.length?state.events.map(e=>`<article class="event-row"><time>${esc(fmtDate(e.event_date))}</time><strong>${esc(e.name)}</strong><span>${esc(e.details||e.status)}</span></article>`).join(''):empty('No fight cards or results have been added yet.');}
function populateFighterSelects(){const html=`<option value="">Select fighter</option>`+state.fighters.map(f=>`<option value="${f.id}">${esc(f.name)} (${f.wins}-${f.losses}-${f.draws})</option>`).join('');$$('.fighter-select').forEach(s=>{const current=s.value;s.innerHTML=html;if([...s.options].some(o=>o.value===current))s.value=current;});}

async function refreshSession(){
  if(!db){updateAdminUI();updateAccountUI();return;}
  const {data:{session}}=await db.auth.getSession();state.user=session?.user||null;state.isAdmin=false;state.profile=null;state.myFighter=null;state.wallet=null;state.userBets=[];
  if(state.user){
    const [{data:profile,error:profileError},{data:myFighter}]=await Promise.all([
      db.from('profiles').select('id,is_admin,display_name,region,platform,avatar_url').eq('id',state.user.id).single(),
      db.from('fighters').select('*').eq('user_id',state.user.id).maybeSingle()
    ]);
    if(!profileError&&profile){state.profile=profile;state.isAdmin=Boolean(profile.is_admin);}state.myFighter=myFighter||null;await refreshWallet();
  } else renderBets();
  updateAdminUI();updateAccountUI();
}
function updateAdminUI(){
  $('#connectionStatus').textContent=configured?'Supabase connected':'Supabase not configured';
  $('#setupNotice').classList.toggle('hidden',configured&&state.isAdmin);$('#loginForm').classList.toggle('hidden',Boolean(state.user));$('#adminSession').classList.toggle('hidden',!state.user);$('#adminIdentity').textContent=state.user?`${state.user.email}${state.isAdmin?' · ADMIN':' · NOT ADMIN'}`:'';$('#adminControls').classList.toggle('hidden',!state.isAdmin);$('#adminLocked').classList.toggle('hidden',state.isAdmin);
  if(state.user&&!state.isAdmin)$('#adminLocked').textContent='This account is signed in but is not marked as a UCS admin in public.profiles.';else if(!configured)$('#adminLocked').textContent='Add your Supabase URL and anon/publishable key to config.js, then run supabase-schema.sql.';else $('#adminLocked').textContent='Sign in with an account marked as an admin in Supabase to unlock league controls.';
}
function updateAccountUI(){
  const guest=$('#accountGuest'),member=$('#accountMember');if(!guest||!member)return;guest.classList.toggle('hidden',Boolean(state.user));member.classList.toggle('hidden',!state.user);$('#fighterAccountStatus').textContent=!configured?'Supabase not configured':state.user?(state.isAdmin?'Admin / fighter account':'Fighter account active'):'Create an account or sign in';if(!state.user)return;
  $('#memberEmail').textContent=state.user.email||'Signed in';$('#memberRole').textContent=state.isAdmin?'UCS Administrator':'UCS Fighter';$('#memberWallet').textContent=state.wallet?formatCredits(state.wallet.balance):'UC 0';
  const form=$('#profileForm');if(form){form.elements.display_name.value=state.profile?.display_name||state.user.user_metadata?.fighter_name||'';form.elements.region.value=state.profile?.region||state.user.user_metadata?.region||'';form.elements.platform.value=state.profile?.platform||state.user.user_metadata?.platform||'PS5';}
  const preview=$('#avatarPreview');if(preview)preview.innerHTML=state.profile?.avatar_url?`<img src="${esc(state.profile.avatar_url)}" alt="Profile picture">`:`<span>${esc(initials(state.profile?.display_name||'UCS'))}</span>`;
  const f=state.myFighter;$('#createMyFighterBtn').classList.toggle('hidden',Boolean(f));
  $('#myFighterDetails').innerHTML=f?`<div class="my-fighter-head">${avatarHtml(f,'my-fighter-avatar')}<div><strong>${esc(f.name)}</strong><span class="fighter-badge">OFFICIAL UCS FIGHTER</span></div></div><div class="my-record"><div><strong>${f.wins}</strong><span>WINS</span></div><div><strong>${f.losses}</strong><span>LOSSES</span></div><div><strong>${f.draws}</strong><span>DRAWS</span></div></div><small>Platform: ${esc(f.platform||'—')} · Region: ${esc(f.region||'—')} · Rating: ${Number(f.score||0).toFixed(1)}</small>`:'No official fighter profile linked yet. Create yours below with a clean 0-0-0 record.';
}

$('#fighterSignupForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db)return toast('Configure Supabase first.',true);const d=new FormData(e.target),fighter_name=d.get('fighter_name').trim(),region=d.get('region').trim(),platform=d.get('platform');const {data,error}=await db.auth.signUp({email:d.get('email'),password:d.get('password'),options:{data:{fighter_name,region,platform}}});if(error)return toast(error.message,true);if(data.session){await refreshSession();toast('Account created and signed in.');}else toast('Account created. Check your email to confirm your UCS account.');});
$('#fighterLoginForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db)return toast('Configure Supabase first.',true);const d=new FormData(e.target),{error}=await db.auth.signInWithPassword({email:d.get('email'),password:d.get('password')});if(error)return toast(error.message,true);await refreshSession();toast('Signed in to UCS.');});
$('#fighterSignOutBtn')?.addEventListener('click',async()=>{if(db)await db.auth.signOut();state.user=null;state.isAdmin=false;state.profile=null;state.myFighter=null;state.wallet=null;state.userBets=[];updateAdminUI();updateAccountUI();renderBets();toast('Signed out.');});
$('#profileForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db||!state.user)return toast('Sign in first.',true);const d=new FormData(e.target),display_name=d.get('display_name').trim(),region=d.get('region').trim(),platform=d.get('platform');const {error}=await db.from('profiles').update({display_name,region:region||null,platform,updated_at:new Date().toISOString()}).eq('id',state.user.id);if(error)return toast(error.message,true);if(state.myFighter){const {error:syncError}=await db.rpc('sync_my_fighter_identity');if(syncError)return toast(syncError.message,true);}await refreshSession();await loadPublicData();toast('Profile saved.');});
$('#avatarFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file);$('#avatarPreview').innerHTML=`<img src="${url}" alt="Profile preview">`;});
$('#uploadAvatarBtn')?.addEventListener('click',async()=>{
  if(!db||!state.user)return toast('Sign in first.',true);const file=$('#avatarFile')?.files?.[0];if(!file)return toast('Choose a PNG, JPG or WebP image first.',true);if(file.size>5*1024*1024)return toast('Profile picture must be 5 MB or smaller.',true);
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');const path=`${state.user.id}/avatar.${ext}`;
  const {error:uploadError}=await db.storage.from('fighter-avatars').upload(path,file,{upsert:true,contentType:file.type,cacheControl:'3600'});if(uploadError)return toast(uploadError.message,true);
  const {data:publicData}=db.storage.from('fighter-avatars').getPublicUrl(path);const avatar_url=`${publicData.publicUrl}?v=${Date.now()}`;
  const {error:profileError}=await db.from('profiles').update({avatar_url,updated_at:new Date().toISOString()}).eq('id',state.user.id);if(profileError)return toast(profileError.message,true);
  if(state.myFighter){const {error:syncError}=await db.rpc('sync_my_fighter_identity');if(syncError)return toast(syncError.message,true);}
  await refreshSession();await loadPublicData();toast('Profile picture updated.');
});
$('#createMyFighterBtn')?.addEventListener('click',async()=>{if(!db||!state.user)return toast('Sign in first.',true);if(state.myFighter)return toast('Your fighter profile already exists.',true);const name=(state.profile?.display_name||state.user.user_metadata?.fighter_name||'').trim();if(!name)return toast('Add a display name to your profile first.',true);const {error}=await db.from('fighters').insert({user_id:state.user.id,name,region:state.profile?.region||null,platform:state.profile?.platform||'PS5',avatar_url:state.profile?.avatar_url||null,wins:0,losses:0,draws:0,resume:0,momentum:0,finishing:0,activity:0,big_fight:0,score:0,active:true});if(error)return toast(error.message,true);await refreshSession();await loadPublicData();toast('Official fighter profile created.');});

$('#loginForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db)return toast('Configure Supabase first.',true);const d=new FormData(e.target),{error}=await db.auth.signInWithPassword({email:d.get('email'),password:d.get('password')});if(error)return toast(error.message,true);await refreshSession();toast(state.isAdmin?'Admin signed in.':'Signed in, but this user is not an admin.',!state.isAdmin);});
$('#signOutBtn')?.addEventListener('click',async()=>{if(db)await db.auth.signOut();state.user=null;state.isAdmin=false;state.profile=null;state.myFighter=null;state.wallet=null;state.userBets=[];updateAdminUI();updateAccountUI();renderBets();toast('Signed out.');});
$('#refreshAdmin')?.addEventListener('click',async()=>{await loadPublicData();toast('Database refreshed.');});
$('#smartRankingsBtn')?.addEventListener('click',async()=>{if(!state.isAdmin)return toast('Admin permission required.',true);const {error}=await db.rpc('recalculate_ucs_rankings');if(error)return toast(error.message,true);await loadPublicData();toast('UCS smart rankings recalculated.');});

async function adminInsert(table,payload,msg){if(!state.isAdmin)return toast('Admin permission required.',true);const {error}=await db.from(table).insert(payload);if(error)return toast(error.message,true);toast(msg);await loadPublicData();}
async function adminUpdate(table,payload,match,msg){if(!state.isAdmin)return toast('Admin permission required.',true);let q=db.from(table).update(payload);Object.entries(match).forEach(([k,v])=>q=q.eq(k,v));const {error}=await q;if(error)return toast(error.message,true);toast(msg);await loadPublicData();}

$('#fighterCreateForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('fighters',{name:d.get('name').trim(),wins:+d.get('wins'),losses:+d.get('losses'),draws:+d.get('draws'),region:d.get('region').trim()||null,platform:d.get('platform')},'Fighter added.');if(state.isAdmin)e.target.reset();});
$('#recordForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminUpdate('fighters',{wins:+d.get('wins'),losses:+d.get('losses'),draws:+d.get('draws'),updated_at:new Date().toISOString()},{id:d.get('fighter_id')},'Record updated.');if(state.isAdmin){await db.rpc('recalculate_ucs_rankings');await loadPublicData();}});
$('#championForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(!state.isAdmin)return;const payload={division:d.get('division'),fighter_id:d.get('fighter_id'),defenses:+d.get('defenses')||0,granted_at:new Date().toISOString()};const {error}=await db.from('champions').upsert(payload,{onConflict:'division'});if(error)return toast(error.message,true);await db.rpc('recalculate_ucs_rankings');toast(`${d.get('division')} champion granted.`);await loadPublicData();});
$('#vacateTitleBtn')?.addEventListener('click',async()=>{const f=$('#championForm'),division=new FormData(f).get('division');if(!state.isAdmin)return;const {error}=await db.from('champions').upsert({division,fighter_id:null,defenses:0,granted_at:new Date().toISOString()},{onConflict:'division'});if(error)return toast(error.message,true);await db.rpc('recalculate_ucs_rankings');toast(`${division} title vacated.`);await loadPublicData();});
$('#resultForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('winner_id')===d.get('loser_id'))return toast('Winner and loser must be different.',true);if(!state.isAdmin)return toast('Admin permission required.',true);const {error}=await db.rpc('publish_ucs_result',{p_winner_id:d.get('winner_id'),p_loser_id:d.get('loser_id'),p_method:d.get('method'),p_event_date:d.get('event_date')});if(error)return toast(error.message,true);toast('Result published, records and rankings updated.');await loadPublicData();});
$('#eventForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('events',{name:d.get('name').trim(),event_date:d.get('event_date'),details:d.get('details').trim()||null,status:d.get('status')},'Event created.');});
$('#contractForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('contract_activity',{fighter_id:d.get('fighter_id'),action:d.get('action')},'Contract activity posted.');});
$('#betForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('fighter_a_id')===d.get('fighter_b_id'))return toast('Choose two different fighters.',true);await adminInsert('betting_markets',{fighter_a_id:d.get('fighter_a_id'),fighter_b_id:d.get('fighter_b_id'),odds_a:d.get('odds_a'),odds_b:d.get('odds_b'),is_open:true},'Betting market opened.');});
$('#featureForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('champion_id')===d.get('challenger_id'))return toast('Choose two different fighters.',true);if(!state.isAdmin)return;const {error}=await db.from('league_settings').upsert({key:'featured_main_event',value:{champion_id:d.get('champion_id'),challenger_id:d.get('challenger_id'),event_label:d.get('event_label')},updated_at:new Date().toISOString()},{onConflict:'key'});if(error)return toast(error.message,true);toast('Featured fight updated.');await loadPublicData();});

function renderAdminRows(){if(!$('#adminFighterRows'))return;$('#adminFighterRows').innerHTML=state.fighters.length?state.fighters.map(f=>{const titles=state.champions.filter(c=>c.fighter_id===f.id).map(c=>c.division).join(', ')||'—';return `<tr><td><div class="rank-fighter-cell">${avatarHtml(f)}<strong>${esc(f.name)}</strong></div></td><td>${esc(record(f))}</td><td>${esc(f.region||'—')} · ${esc(f.platform||'—')}</td><td>${esc(titles)}</td><td><button class="mini-action" data-load-record="${f.id}">Edit record</button><button class="mini-action danger" data-delete-fighter="${f.id}">Delete</button></td></tr>`;}).join(''):`<tr><td colspan="5">${empty('No fighters yet.')}</td></tr>`;}
$('#adminFighterRows')?.addEventListener('click',async e=>{const edit=e.target.closest('[data-load-record]'),del=e.target.closest('[data-delete-fighter]');if(edit){const f=fighterById(edit.dataset.loadRecord),form=$('#recordForm');form.elements.fighter_id.value=f.id;form.elements.wins.value=f.wins;form.elements.losses.value=f.losses;form.elements.draws.value=f.draws;form.scrollIntoView({behavior:'smooth',block:'center'});}if(del){const f=fighterById(del.dataset.deleteFighter);if(!confirm(`Delete ${f?.name||'this fighter'}? Related rows may also be affected.`))return;const {error}=await db.from('fighters').delete().eq('id',del.dataset.deleteFighter);if(error)return toast(error.message,true);toast('Fighter deleted.');await loadPublicData();}});
$('#clearLeagueData')?.addEventListener('click',async()=>{if(!state.isAdmin)return;if(prompt('Type DELETE UCS DATA to clear the entire league database.')!=='DELETE UCS DATA')return toast('Clear cancelled.',true);for(const table of ['league_settings','betting_markets','contract_activity','results','champions','events','fighters']){const {error}=await db.from(table).delete().neq('created_at','1900-01-01T00:00:00Z');if(error&&table!=='champions'&&table!=='league_settings')return toast(`${table}: ${error.message}`,true);if(error&&(table==='champions'||table==='league_settings')){const key=table==='champions'?'division':'key';const {error:retry}=await db.from(table).delete().neq(key,'__never__');if(retry)return toast(`${table}: ${retry.message}`,true);}}toast('League data cleared.');await loadPublicData();});

if(db)db.auth.onAuthStateChange(()=>setTimeout(refreshSession,0));
(async function init(){renderAll();updateAdminUI();await refreshSession();await loadPublicData();if(location.hash&&$(location.hash))showPage(location.hash.slice(1));})();
