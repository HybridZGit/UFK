const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const state = {
  fighters: [], champions: [], results: [], events: [], contracts: [], bets: [], scheduledBouts: [], news: [], photos: [], canPhotograph: false, settings: {},
  user: null, isAdmin: false, profile: null, myFighter: null, wallet: null, userBets: [],
  fighterEarnings: new Map(), fighterContracts: [], contractTab: 'incoming', contractTarget: null,
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
    db.from('league_settings').select('*'),
    db.from('scheduled_bouts').select('*').eq('status','scheduled').order('bout_date',{ascending:true,nullsFirst:false}),
    db.from('fighter_earnings').select('fighter_id,amount'),
    db.from('ucs_news').select('*').order('published_at',{ascending:false}),
    db.from('ucs_photos').select('*').order('created_at',{ascending:false}).limit(120)
  ]);
  const firstError = queries.find(x=>x.error)?.error;
  if(firstError) toast(`Supabase: ${firstError.message}`,true);
  [state.fighters,state.champions,state.results,state.events,state.contracts,state.bets]=queries.slice(0,6).map(x=>x.data||[]);
  state.settings=Object.fromEntries((queries[6].data||[]).map(x=>[x.key,x.value]));
  state.scheduledBouts=queries[7].data||[];
  state.fighterEarnings=new Map((queries[8].data||[]).map(row=>[row.fighter_id,Number(row.amount)]));
  state.news=queries[9].data||[];
  state.photos=queries[10].data||[];
  renderAll();
}

// UCS Photography: public read-only gallery; approved users can upload.
function renderPhotoGallery(){
  const root=$('#ucsPhotoGallery');if(!root)return;
  const published=state.photos.filter(p=>p.published);
  root.innerHTML=published.length?published.map(p=>{
    const image=safeHttps(p.image_url)?`<img src="${esc(p.image_url)}" alt="${esc(p.caption||p.event_name||'UCS event photo')}" loading="lazy">`:'';
    return `<figure class="ucs-photo-card">${image}<figcaption><strong>${esc(p.event_name||'UCS Photography')}</strong><span>${esc(p.caption||'Official UCS event photo')}</span></figcaption></figure>`;
  }).join(''):'<p class="data-empty">No photography has been published yet.</p>';
  const mine=$('#ucsMyPhotoList');if(!mine)return;
  const own=state.photos.filter(p=>p.photographer_id===state.user?.id);
  mine.innerHTML=own.length?own.map(p=>`<div class="ucs-photo-my-row"><span>${esc(p.event_name||'UCS photo')} · ${new Date(p.created_at).toLocaleDateString()}</span><button type="button" class="mini-action" data-photo-publish="${esc(p.id)}">${p.published?'UNPUBLISH':'PUBLISH'}</button></div>`).join(''):'';
}
function updatePhotographerUI(){
  const guest=$('#ucsPhotographerGuest'),pending=$('#ucsPhotographerPending'),tools=$('#ucsPhotographerTools');
  if(!guest||!pending||!tools)return;
  guest.classList.toggle('hidden',Boolean(state.user));
  pending.classList.toggle('hidden',!state.user||state.canPhotograph);
  tools.classList.toggle('hidden',!state.user||!state.canPhotograph);
  renderPhotoGallery();
}
$('#ucsPhotographerLoginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db)return toast('Supabase unavailable.',true);
  const d=new FormData(e.currentTarget);
  const {error}=await db.auth.signInWithPassword({email:d.get('email'),password:d.get('password')});
  if(error)return toast(error.message,true);
  await refreshSession();
  toast(state.canPhotograph?'Photographer studio unlocked!':'Signed in. Awaiting photographer approval.');
});
$('#ucsPhotographerApprovalForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('Admin access required.',true);
  const d=new FormData(e.currentTarget);
  const {data,error}=await db.rpc('set_ucs_photographer',{p_email:String(d.get('email')||'').trim(),p_approved:d.get('approved')==='true'});
  if(error)return toast(error.message,true);
  toast(data||'Photographer permissions updated.');
});
$('#ucsPhotographerUploadForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.user||!state.canPhotograph)return toast('Approved photographer login required.',true);
  const form=e.currentTarget,files=[...form.elements.images.files];
  if(!files.length)return toast('Choose one or more photos.',true);
  if(files.length>12)return toast('Upload up to 12 photos at a time.',true);
  const btn=$('#ucsPhotoUploadButton'),types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  const eventName=String(form.elements.event_name.value||'').trim().slice(0,100);
  const caption=String(form.elements.caption.value||'').trim().slice(0,350);
  btn.disabled=true;
  try{
    for(const file of files){
      if(!types[file.type]||file.size>10*1024*1024||!file.size)throw Error('Each photo must be JPG, PNG or WebP and under 10 MB.');
      const storagePath=state.user.id+'/'+crypto.randomUUID()+'.'+types[file.type];
      const {error:uploadErr}=await db.storage.from('ucs-photography').upload(storagePath,file,{contentType:file.type,upsert:false});
      if(uploadErr)throw uploadErr;
      const url=db.storage.from('ucs-photography').getPublicUrl(storagePath).data.publicUrl;
      const {error:saveErr}=await db.from('ucs_photos').insert({photographer_id:state.user.id,image_url:url,event_name:eventName,caption,published:true});
      if(saveErr)throw saveErr;
    }
    form.reset();await loadPublicData();toast(files.length+' photo(s) published!');
  }catch(error){toast(error.message||'Photo upload failed.',true);await loadPublicData();}
  finally{btn.disabled=false;}
});
$('#ucsMyPhotoList')?.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-photo-publish]');if(!btn||!db||!state.canPhotograph)return;
  const photo=state.photos.find(p=>p.id===btn.dataset.photoPublish&&p.photographer_id===state.user?.id);
  if(!photo)return;
  const {error}=await db.from('ucs_photos').update({published:!photo.published}).eq('id',photo.id);
  if(error)return toast(error.message,true);
  await loadPublicData();toast('Photo visibility updated.');
});

function renderAll(){ renderHome(); renderRanks($('#fighterSearch')?.value||''); renderBets(); renderEvents(); populateFighterSelects(); populateFighterDetailsEditor(); ucsRenderEarnings(); populateScheduledBoutSelect(); renderAdminRows(); renderNews(); renderPhotoGallery(); updateAccountUI(); }

// Client-side matchup recommender: compares official records and ranking scores.
// Suggestions are not bookings, predictions, or real fight results.
let marqueeMatchups=[];
let marqueeIndex=0;
let marqueeSignature='';
function marqueeRecord(f){return `${Number(f.wins||0)}-${Number(f.losses||0)}-${Number(f.draws||0)}`;}
function marqueePlatformCompatible(a,b){
  const platforms=f=>String(f.platform||'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const aPlatforms=platforms(a),bPlatforms=platforms(b);
  return !aPlatforms.length||!bPlatforms.length||aPlatforms.some(p=>bPlatforms.includes(p));
}
function marqueeCandidates(){
  // Mirror the UCS World leaderboard: rank 1 vs rank 2, 3 vs 4, etc.
  // Losses and draws are allowed; official score decides ranking order.
  const ranked=[...state.fighters].filter(f=>f.active!==false)
    .sort((a,b)=>Number(b.score||0)-Number(a.score||0)
      ||Number(b.wins||0)-Number(a.wins||0)
      ||String(a.name||'').localeCompare(String(b.name||'')));
  const selected=[];
  for(let i=0;i+1<ranked.length&&selected.length<5;i+=2){
    const a=ranked[i],b=ranked[i+1];
    selected.push({a,b,rankA:i+1,rankB:i+2,key:[a.id,b.id].join(':')});
  }
  return selected;
}
function renderMarquee(){
  const stage=$('#ucsMarqueeStage'),dots=$('#ucsMarqueeDots');
  if(!stage||!dots)return;
  const next=marqueeCandidates();
  const signature=next.map(p=>[p.key,marqueeRecord(p.a),marqueeRecord(p.b),p.a.score,p.b.score,p.a.avatar_url,p.b.avatar_url].join('|')).join(';');
  if(signature!==marqueeSignature){marqueeIndex=0;marqueeSignature=signature;}
  marqueeMatchups=next;
  if(!next.length){
    stage.innerHTML=empty('Two ranked fighters are needed to show a marquee matchup.');
    dots.innerHTML='';
    $('#ucsMarqueePrev').disabled=true;$('#ucsMarqueeNext').disabled=true;
    return;
  }
  marqueeIndex=(marqueeIndex+next.length)%next.length;
  const pair=next[marqueeIndex],label=`WORLD RANK #${pair.rankA} VS #${pair.rankB}`;
  const side=(f,sideName)=>`<div class="ucs-marquee-fighter">
    <div class="ucs-marquee-avatar">${avatarHtml(f,'ucs-marquee-profile-pic')}</div>
    <span class="ucs-marquee-corner">${sideName}</span>
    <h3>${esc(f.name)}</h3>
    <strong class="ucs-marquee-record">${esc(marqueeRecord(f))}</strong>
    <span class="ucs-marquee-meta">${esc(f.region||'UCS')} · ${esc(f.platform||'Platform TBA')}</span>
    <span class="ucs-marquee-score">RATING ${Number(f.score||0).toFixed(1)}</span>
  </div>`;
  stage.innerHTML=`<div class="ucs-marquee-slide" key="${esc(pair.key)}">
    <div class="ucs-marquee-tag"><span class="ucs-marquee-pulse"></span> ${label} · MATCHUP PICK ${marqueeIndex+1}/${next.length}</div>
    <div class="ucs-marquee-versus">${side(pair.a,'RED CORNER')}<div class="ucs-marquee-middle"><small>UCS</small><strong>VS</strong><span>AI-STYLE MATCHUP PICK</span></div>${side(pair.b,'BLUE CORNER')}</div>
    <div class="ucs-marquee-bottom">Paired by live UCS World rankings · Losses allowed · Not an official booked fight</div>
  </div>`;
  dots.innerHTML=next.map((p,i)=>`<button type="button" class="${i===marqueeIndex?'active':''}" data-marquee-index="${i}" aria-label="Show matchup ${i+1}" aria-pressed="${i===marqueeIndex}"></button>`).join('');
  $('#ucsMarqueePrev').disabled=next.length<2;$('#ucsMarqueeNext').disabled=next.length<2;
}
function marqueeStep(delta){
  if(marqueeMatchups.length<2)return;
  marqueeIndex=(marqueeIndex+delta+marqueeMatchups.length)%marqueeMatchups.length;
  renderMarquee();
}
$('#ucsMarqueePrev')?.addEventListener('click',()=>marqueeStep(-1));
$('#ucsMarqueeNext')?.addEventListener('click',()=>marqueeStep(1));
$('#ucsMarqueeDots')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-marquee-index]');
  if(!b)return;
  marqueeIndex=Number(b.dataset.marqueeIndex)||0;
  renderMarquee();
});
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
if(!reducedMotion)setInterval(()=>{
  if(document.visibilityState==='visible'&&$('#home')?.classList.contains('active'))marqueeStep(1);
},7000);

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
  renderUpcomingSpotlight();
  renderMarquee();
}

function renderRanks(filter=''){
  const platform=(state.rankingDivision==='UCS World'||state.rankingDivision==='UCS SIM World')?null:state.rankingDivision.replace('UCS ','');
  const rows=state.fighters.filter(f=>f.name.toLowerCase().includes(filter.toLowerCase())&&(state.rankingDivision!=='UCS SIM World'||f.sim_division===true)&&(!platform||(f.platform||'').toUpperCase()===platform));
  $('#rankRows').innerHTML=rows.length?rows.map((f,i)=>`<tr class="fighter-rank-row"><td><span class="rank-number">${i+1}</span></td><td class="rank-name"><div class="rank-fighter-cell ucs-ranking-fighter">${avatarHtml(f)}<div class="ucs-ranking-name-copy"><strong>${esc(f.name)}</strong><span>${esc(record(f))} · ${esc(f.platform||'UNASSIGNED')}</span></div><button type="button" class="ucs-rank-info" data-fighter-info="${esc(f.id)}" aria-label="About ${esc(f.name)}" title="About this fighter">ⓘ</button></div></td><td>${chip(f.resume)}</td><td>${chip(f.momentum)}</td><td>${chip(f.finishing)}</td><td>${chip(f.activity)}</td><td>${chip(f.big_fight)}</td><td class="overall">${Number(f.score||0).toFixed(1)}</td></tr>`).join(''):`<tr><td colspan="8">${empty(`No ${state.rankingDivision} fighters in the database yet.`)}</td></tr>`;
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
$('#rankRows')?.addEventListener('click',e=>{const button=e.target.closest('[data-fighter-info]');if(button)openFighterProfile(button.dataset.fighterInfo);});

function openFighterProfile(id){
  const f=fighterById(id); if(!f)return;
  const modal=$('#fighterModal');
  const rank=currentRank(f),titles=state.champions.filter(c=>c.fighter_id===f.id),history=fighterResults(f);
  $('#profileName').textContent=f.name;
  $('#profilePlatform').textContent=`UCS ${f.platform||'WORLD'}`;
  $('#profileRegion').textContent=f.region||'Region not set';
  const badge=$('#profileUnderdog'),server=$('#profileServerIcon');
  badge?.classList.toggle('hidden',!f.is_underdog);
  if(server){
    const url=f.server_icon_url;
    server.classList.toggle('hidden',!safeHttps(url));
    server.innerHTML=safeHttps(url)?`<img src="${esc(url)}" alt="Server icon" loading="lazy">`:'';
  }
  $('#profileBio').textContent=f.fighter_bio?.trim()||'This fighter has not added a biography yet.';
  $('#profileScoutLabel').textContent=f.is_underdog?'UNDERDOG':'CONTENDER';
  const winsRecorded=history.filter(x=>x.winner_id===f.id);
  const kos=winsRecorded.filter(x=>/\b(KO|TKO|KNOCKOUT)\b/i.test(String(x.method||''))).length;
  const recordWins=Number(f.wins||0);
  const ratio=winsRecorded.length&&recordWins>0?Math.round(kos/recordWins*100)+'%':'—';
  $('#profileKOs').textContent=winsRecorded.length?String(kos):'—';
  $('#profileKoRatio').textContent=ratio;
  $('#profileKOInsight').textContent=ratio;
  const booked=state.scheduledBouts.filter(b=>b.fighter_a_id===f.id||b.fighter_b_id===f.id);
  const soon=booked[0],opp=soon?fighterById(soon.fighter_a_id===f.id?soon.fighter_b_id:soon.fighter_a_id):null;
  $('#profileNextFight').textContent=opp?'vs '+opp.name:'Not booked';

  $('#profileRank').textContent=rank?`#${rank}`:'#—';
  $('#profileRecord').textContent=`${f.wins||0}-${f.losses||0}-${f.draws||0}`;
  $('#profileScore').textContent=Number(f.score||0).toFixed(1);
  $('#profileStreak').textContent=fighterForm(f);
  $('#profileTitles').textContent=String(titles.length);
  const championSpotlight=$('#profileChampionSpotlight');
  championSpotlight?.classList.toggle('hidden',titles.length===0);
  modal.classList.toggle('ucs-is-champion',titles.length>0);
  if(titles.length){
    $('#profileChampionHeading').textContent=titles.length===1?titles[0].division.toUpperCase()+' CHAMPION':'MULTI-DIVISION UCS CHAMPION';
    $('#profileChampionBelts').innerHTML=titles.map(t=>`<span class="ucs-champion-belt">🏆 ${esc(t.division)} <small>${Number(t.defenses||0)} defenses</small></span>`).join('');
  }else{
    $('#profileChampionBelts').textContent='';
  }
  $('#profileFights').textContent=String((f.wins||0)+(f.losses||0)+(f.draws||0));
  $('#profileEarnings').textContent=Number(state.fighterEarnings.get(f.id)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  $('#profileAvatar').innerHTML=f.avatar_url?`<img src="${esc(f.avatar_url)}" alt="${esc(f.name)}">`:`<span>${esc(initials(f.name))}</span>`;
  const metrics=[['Resume',f.resume],['Momentum',f.momentum],['Finishing',f.finishing],['Activity',f.activity],['Big fight',f.big_fight]];
  $('#profileRatingBars').innerHTML=metrics.map(([label,val])=>`<div class="profile-meter"><div><span>${label}</span><b>${Number(val||0).toFixed(1)}</b></div><i><em style="width:${Math.max(0,Math.min(100,Number(val||0)*10))}%"></em></i></div>`).join('');
  $('#profileFightHistory').innerHTML=history.length?history.slice(0,10).map(r=>{
    const won=r.winner_id===f.id,opp=fighterById(won?r.loser_id:r.winner_id);
    return `<div class="profile-fight-row"><span class="result-pill ${won?'win':'loss'}">${won?'W':'L'}</span><div><strong>vs ${esc(opp?.name||'Unknown')}</strong><small>${esc(r.method)} · ${esc(fmtDate(r.event_date))}</small></div></div>`;
  }).join(''):empty('No official fight history yet.');
  const upcoming=state.scheduledBouts.filter(b=>b.fighter_a_id===f.id||b.fighter_b_id===f.id);
  $('#profileUpcomingFights').innerHTML=upcoming.length?upcoming.map(b=>{
    const other=fighterById(b.fighter_a_id===f.id?b.fighter_b_id:b.fighter_a_id);
    const opponentRecord=other?`${other.wins||0}-${other.losses||0}-${other.draws||0}`:'—';
    const date=b.bout_date?fmtDate(b.bout_date):'DATE TBA';
    const belt=b.belt?`<span class="ucs-inline-belt">🏆 ${esc(b.belt)} TITLE FIGHT</span>`:'<span class="ucs-inline-nontitle">NON-TITLE BOUT</span>';
    const contribute=safeHttps(b.contribution_url)?`<a class="ucs-inline-contribute" href="${esc(b.contribution_url)}" target="_blank" rel="noopener noreferrer">Contribute to fight ↗</a>`:'';
    return `<div class="profile-fight-row ucs-inline-bout">
      <span class="result-pill">VS</span>
      <div class="ucs-inline-bout-details">
        <span class="ucs-inline-date">${esc(date)}</span>
        <span class="ucs-inline-opponent">${esc(other?.name||'Unknown')} (${esc(opponentRecord)})</span>
        <span class="ucs-inline-event">${esc(b.event_name||'UCS scheduled bout')}</span>
        ${belt}
        ${contribute}
        <span class="ucs-inline-status">SCHEDULED</span>
      </div>
    </div>`;
  }).join(''):empty('No upcoming bouts scheduled.');
  const contractBtn=$('#profileContractBtn');
  // Keep the contract CTA visible on every opponent profile. The click handler
  // will guide guests to sign in/create a fighter profile, and will explain if
  // the opponent has not linked a UCS account yet. Only hide it on your own profile.
  const isOwnProfile=Boolean(state.myFighter&&f.id===state.myFighter.id);
  if(contractBtn){
    contractBtn.classList.toggle('hidden',isOwnProfile);
    contractBtn.dataset.fighterId=isOwnProfile?'':f.id;
    contractBtn.textContent='SEND CONTRACT';
  }
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
}
function closeFighterProfile(){const modal=$('#fighterModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');if(!$('#contractModal')?.classList.contains('open')&&!$('#ucsUndercardModal')?.classList.contains('hidden'))return;document.body.classList.remove('modal-open');}
$$('[data-close-profile]').forEach(x=>x.addEventListener('click',closeFighterProfile));

function openContractModal(fighterId){
  if(!state.user){toast('Sign in to send a contract.',true);closeFighterProfile();showPage('account');return;}
  if(!state.myFighter){toast('Create your official fighter profile before sending contracts.',true);closeFighterProfile();showPage('account');return;}
  const opponent=fighterById(fighterId);
  if(!opponent||opponent.id===state.myFighter.id)return toast('Choose another fighter.',true);
  if(!opponent.user_id)return toast('That fighter is not linked to a UCS account yet.',true);
  state.contractTarget=opponent;
  $('#contractReceiverId').value=opponent.id;
  $('#contractOpponentCard').innerHTML=`${avatarHtml(opponent,'contract-avatar')}<div><small>CHALLENGING</small><strong>${esc(opponent.name)}</strong><span>${esc(record(opponent))} · UCS ${esc(opponent.platform||'WORLD')}</span></div>`;
  const max=Math.floor(Number(state.wallet?.balance||0)*.25);
  $('#contractWager').max=String(max);
  $('#contractWagerHint').textContent=`Max ${formatCredits(max)} — 25% of balance`;
  closeFighterProfile();
  const modal=$('#contractModal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
}
function closeContractModal(){const modal=$('#contractModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');state.contractTarget=null;document.body.classList.remove('modal-open');}
$('#profileContractBtn')?.addEventListener('click',e=>{const id=e.currentTarget.dataset.fighterId;if(id)openContractModal(id);});
$$('[data-close-contract]').forEach(x=>x.addEventListener('click',closeContractModal));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFighterProfile();closeContractModal();}});

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

function safeHttps(url){try{return new URL(url).protocol==='https:';}catch{return false;}}
function boutLink(b){return safeHttps(b.contribution_url)?`<a class="btn outline" href="${esc(b.contribution_url)}" target="_blank" rel="noopener noreferrer">CONTRIBUTE TO FIGHT ↗</a>`:'';}
// Read the current Matcherino prize-pool total through our server-side proxy.
// The official tournament remains the source of truth; no guessed values.
let ucsMatcherinoRequest=null;
async function refreshMatcherinoTotal(){
  const node=$('#ucsMatcherinoAmount');
  if(!db||!node||!window.UFK_SUPABASE_URL)return;
  if(ucsMatcherinoRequest)return ucsMatcherinoRequest;
  ucsMatcherinoRequest=(async()=>{
    try{
      const resp=await fetch(window.UFK_SUPABASE_URL+'/functions/v1/ucs-matcherino-total',{headers:{'apikey':window.UFK_SUPABASE_ANON_KEY},cache:'no-store'});
      if(!resp.ok)throw Error('Matcherino not available');
      const data=await resp.json();
      const amount=Number(data.amount);
      const current=$('#ucsMatcherinoAmount');
      if(!current)return;
      if(data.available===true&&data.currency==='USD'&&Number.isFinite(amount)&&amount>=0){
        current.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount);
        current.title='Latest verified prize pool reported by Matcherino';
      }else{
        current.textContent='Live total unavailable';
        current.title='Open Matcherino to see its current total';
      }
    }catch(error){
      const current=$('#ucsMatcherinoAmount');
      if(current){current.textContent='Live total unavailable';current.title='Open Matcherino to see its current total';}
    }finally{ucsMatcherinoRequest=null;}
  })();
  return ucsMatcherinoRequest;
}
setInterval(()=>{if($('#home')?.classList.contains('active')&&$('#ucsMatcherinoAmount'))refreshMatcherinoTotal();},300000);

function renderUpcomingSpotlight(){
  const root=$('#upcomingBoutSpotlight');if(!root)return;
  const b=state.scheduledBouts.find(x=>x.event_name==='RAFA vs BBK')||state.scheduledBouts[0];
  if(!b){root.innerHTML=empty('No upcoming fight announced yet.');return;}
  const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
  const special=b.event_name==='RAFA vs BBK' && b.bout_date==='2026-10-21';
  const poster=safeHttps(b.poster_url)?`<div class="ucs-poster-shell"><img class="ucs-bout-poster" src="${esc(b.poster_url)}" alt="${esc(a?.name||'Fighter')} versus ${esc(c?.name||'Fighter')} fight poster" loading="lazy">${special?'<div class="ucs-poster-hover"><span>UCS FIGHT NIGHT</span><h3>WANT TO FIGHT ON THE UNDERCARD?</h3><button type="button" class="btn primary" data-open-undercard>APPLY FOR UNDERCARD</button><button type="button" class="btn ghost" data-open-fights>SEE EVENT</button></div>':''}</div>`:'';
  root.innerHTML=`${poster}<div class="ucs-bout-info"><span class="section-kicker">SCHEDULED · ${esc(b.bout_date?fmtDate(b.bout_date):'DATE TBA')}</span><h2>${esc(a?.name||'TBA')} <em>VS</em> ${esc(c?.name||'TBA')}</h2><p>${esc(b.event_name)} · ${esc(b.belt?b.belt+' CHAMPIONSHIP':'Belt / title TBA')}</p><p>Fight scheduled — result not recorded.</p>${special?'<div class="ucs-matcherino-total" id="ucsMatcherinoTotal" aria-live="polite"><span class="ucs-matcherino-total-label">MATCHERINO PRIZE POOL</span><strong id="ucsMatcherinoAmount">Checking current total…</strong><a href="https://matcherino.com/tournaments/225104" target="_blank" rel="noopener noreferrer">View on Matcherino ↗</a></div>':''}<div class="ucs-bout-links"><button class="btn ghost" type="button" data-open-fights>VIEW UPCOMING FIGHTS →</button>${special?'<button class="btn primary" type="button" data-open-undercard>APPLY FOR UNDERCARD</button>':''}${boutLink(b)}</div></div>`;
  if(special)refreshMatcherinoTotal();
  root.querySelectorAll('[data-open-fights]').forEach(btn=>btn.addEventListener('click',()=>showPage('fights')));
  root.querySelectorAll('[data-open-undercard]').forEach(btn=>btn.addEventListener('click',()=>openUndercardForm(b.id)));
}
function renderEvents(){
  const upcoming=state.scheduledBouts.map(b=>{
    const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
    return `<article class="event-row ucs-scheduled-row"><time>${esc(b.bout_date?fmtDate(b.bout_date):'DATE TBA')}</time><strong>${esc(a?.name||'TBA')} vs ${esc(c?.name||'TBA')}</strong><span>${esc(b.event_name)} · ${esc(b.belt?b.belt+' TITLE FIGHT':'Non-title / TBA')} · UPCOMING</span>${boutLink(b)}</article>`;
  }).join('');
  const events=state.events.map(e=>`<article class="event-row"><time>${esc(fmtDate(e.event_date))}</time><strong>${esc(e.name)}</strong><span>${esc(e.details||e.status)}</span></article>`).join('');
  $('#fightList').innerHTML=upcoming+events||empty('No fight cards or results have been added yet.');
}
// Undercard application is handled by a secure Supabase Edge Function; Discord webhook never reaches browser.
function openUndercardForm(boutId){
  const modal=$('#ucsUndercardModal');if(!modal)return;
  $('#ucsUndercardBoutId').value=boutId;
  $('#ucsUndercardFeedback').textContent='';
  modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  modal.querySelector('input[name="discord_name"]')?.focus();
}
function closeUndercardForm(){
  const modal=$('#ucsUndercardModal');modal?.classList.add('hidden');modal?.setAttribute('aria-hidden','true');
  if(!$('#fighterModal')?.classList.contains('open')&&!$('#contractModal')?.classList.contains('open'))document.body.classList.remove('modal-open');
}
$$('[data-close-undercard]').forEach(el=>el.addEventListener('click',closeUndercardForm));
$('#ucsUndercardForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db)return toast('UCS connection unavailable.',true);
  const form=e.currentTarget,d=new FormData(form),button=$('#ucsUndercardSubmit'),message=$('#ucsUndercardFeedback');
  if(d.get('website'))return;
  button.disabled=true;message.textContent='Sending your application...';
  try{
    const resp=await fetch(window.UFK_SUPABASE_URL+'/functions/v1/ucs-undercard-apply',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':window.UFK_SUPABASE_ANON_KEY},
      body:JSON.stringify({bout_id:d.get('bout_id'),discord_name:String(d.get('discord_name')||'').trim(),wants_to_participate:d.get('wants_to_participate')==='true',available_at_8pm_eastern:d.get('available_at_8pm_eastern')==='true',website:''})
    });
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok)throw Error(data.error||'Could not submit application.');
    form.reset();message.textContent='Application sent to the UCS team!';
    toast('Undercard application sent!');
  }catch(error){message.textContent=error.message||'Please try again.';}
  finally{button.disabled=false;}
});
// News page and admin publishing tools.
function ucsNewsDate(item){
  const stamp=item.published_at||item.created_at;
  return stamp?new Date(stamp).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'UCS NEWS';
}
function renderNews(){
  const grid=$('#ucsNewsGrid');if(!grid)return;
  const published=state.news.filter(x=>x.is_published);
  grid.innerHTML=published.length?published.map(item=>`
    <button type="button" class="ucs-news-card" data-news-open="${esc(item.id)}">
      <span class="ucs-news-image">${safeHttps(item.image_url)?`<img src="${esc(item.image_url)}" loading="lazy" alt="">`:'<span class="ucs-news-placeholder">UCS NEWS</span>'}</span>
      <span class="ucs-news-card-copy"><small>${esc(ucsNewsDate(item))}</small><strong>${esc(item.headline)}</strong><span>${esc(item.summary||item.body.slice(0,150))}</span><b>READ ARTICLE →</b></span>
    </button>`).join(''):empty('No UCS articles have been published yet.');
  const adminList=$('#ucsAdminNewsList');
  if(adminList)adminList.innerHTML=state.news.length?state.news.map(item=>`<div class="ucs-news-admin-item"><div><strong>${esc(item.headline)}</strong><small>${item.is_published?'Published':'Draft'} · ${esc(ucsNewsDate(item))}</small></div><div><button type="button" class="mini-action" data-news-edit="${esc(item.id)}">EDIT</button><button type="button" class="mini-action danger" data-news-delete="${esc(item.id)}">DELETE</button></div></div>`).join(''):empty('No articles yet.');
}
$('#ucsNewsGrid')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-news-open]');if(!btn)return;
  const item=state.news.find(x=>x.id===btn.dataset.newsOpen&&x.is_published);if(!item)return;
  const reader=$('#ucsNewsReader');
  reader.innerHTML=`<button type="button" class="btn ghost" id="ucsNewsBack">← ALL NEWS</button><small>${esc(ucsNewsDate(item))} · UCS NEWS</small><h2>${esc(item.headline)}</h2>${safeHttps(item.image_url)?`<img class="ucs-news-feature-image" src="${esc(item.image_url)}" alt="">`:''}<p class="ucs-news-summary">${esc(item.summary||'')}</p><div class="ucs-news-body">${esc(item.body)}</div>`;
  reader.classList.remove('hidden');$('#ucsNewsGrid').classList.add('hidden');
  $('#ucsNewsBack').addEventListener('click',()=>{reader.classList.add('hidden');$('#ucsNewsGrid').classList.remove('hidden');});
  reader.scrollIntoView({behavior:'smooth',block:'start'});
});
function resetNewsEditor(){
  const form=$('#ucsNewsForm');form?.reset();
  if(form){form.elements.article_id.value='';form.elements.is_published.checked=true;}
  $('#ucsNewsEditorHeading').textContent='New article';
  $('#ucsNewsSave').textContent='PUBLISH ARTICLE';
}
$('#ucsNewsReset')?.addEventListener('click',resetNewsEditor);
$('#ucsAdminNewsList')?.addEventListener('click',async e=>{
  if(!state.isAdmin)return;
  const edit=e.target.closest('[data-news-edit]'),del=e.target.closest('[data-news-delete]');
  if(edit){
    const item=state.news.find(x=>x.id===edit.dataset.newsEdit);if(!item)return;
    const f=$('#ucsNewsForm');
    f.elements.article_id.value=item.id;f.elements.headline.value=item.headline;
    f.elements.summary.value=item.summary||'';f.elements.body.value=item.body;
    f.elements.image_url.value=item.image_url||'';f.elements.is_published.checked=item.is_published;
    $('#ucsNewsEditorHeading').textContent='Edit article';
    $('#ucsNewsSave').textContent='SAVE CHANGES';
    f.scrollIntoView({behavior:'smooth',block:'center'});
  }
  if(del){
    const item=state.news.find(x=>x.id===del.dataset.newsDelete);
    if(!item||!confirm('Delete the article "'+item.headline+'"?'))return;
    const {error}=await db.from('ucs_news').delete().eq('id',item.id);
    if(error)return toast(error.message,true);
    resetNewsEditor();await loadPublicData();toast('Article deleted.');
  }
});
$('#ucsNewsForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('Admin required.',true);
  const form=e.currentTarget,d=new FormData(form),file=d.get('news_image');
  let url=String(d.get('image_url')||'').trim();const button=$('#ucsNewsSave');button.disabled=true;
  try{
    if(url&&!safeHttps(url))throw Error('Use a secure HTTPS image URL.');
    if(file instanceof File&&file.size){
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'},ext=types[file.type];
      if(!ext||file.size>5*1024*1024)throw Error('Image must be PNG, JPG or WebP, maximum 5 MB.');
      const path='articles/'+crypto.randomUUID()+'.'+ext;
      const {error}=await db.storage.from('ucs-news').upload(path,file,{contentType:file.type,upsert:false});
      if(error)throw error;
      url=db.storage.from('ucs-news').getPublicUrl(path).data.publicUrl;
    }
    const id=String(d.get('article_id')||'');
    const payload={headline:String(d.get('headline')||'').trim(),summary:String(d.get('summary')||'').trim(),body:String(d.get('body')||'').trim(),image_url:url||null,is_published:d.has('is_published'),updated_at:new Date().toISOString()};
    if(payload.is_published)payload.published_at=new Date().toISOString();
    const q=id?db.from('ucs_news').update(payload).eq('id',id):db.from('ucs_news').insert(payload);
    const {error}=await q;if(error)throw error;
    resetNewsEditor();await loadPublicData();toast(id?'Article updated.':'Article published.');
  }catch(error){toast(error.message||'Could not save article.',true);}
  finally{button.disabled=false;}
});

function populateScheduledBoutSelect(){
  const select=$('#scheduledBoutSelect');if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">Select scheduled fight</option>'+state.scheduledBouts.map(b=>{
    const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
    return `<option value="${esc(b.id)}">${esc(a?.name||'TBA')} vs ${esc(c?.name||'TBA')} (${esc(b.belt||'non-title')})</option>`;
  }).join('');
  if(state.scheduledBouts.some(b=>b.id===current))select.value=current;
  else if(state.scheduledBouts.length)select.value=state.scheduledBouts[0].id;
  fillScheduledBoutEditor();
}
function fillScheduledBoutEditor(){
  const form=$('#editScheduledBoutForm');if(!form)return;
  const b=state.scheduledBouts.find(x=>x.id===$('#scheduledBoutSelect').value);
  for(const field of ['event_name','bout_date','belt','poster_url','contribution_url'])form.elements[field].value=b?.[field]||'';
}
$('#scheduledBoutSelect')?.addEventListener('change',fillScheduledBoutEditor);

function populateFighterSelects(){const html=`<option value="">Select fighter</option>`+state.fighters.map(f=>`<option value="${f.id}">${esc(f.name)} (${f.wins}-${f.losses}-${f.draws})</option>`).join('');$$('.fighter-select').forEach(s=>{const current=s.value;s.innerHTML=html;if([...s.options].some(o=>o.value===current))s.value=current;});}


function contractStatusLabel(status){
  return ({pending:'PENDING',accepted:'ACCEPTED',declined:'DECLINED',cancelled:'CANCELLED',expired:'EXPIRED',completed:'COMPLETE'}[status]||String(status||'').toUpperCase());
}
function contractOpponent(c){
  if(!state.myFighter)return null;
  return fighterById(c.sender_fighter_id===state.myFighter.id?c.receiver_fighter_id:c.sender_fighter_id);
}
function contractTerms(c){
  const pieces=[`${c.rounds||10} RDS`,`${Number(c.damage||1).toFixed(1)} DMG`,c.purse_split||'100/0'];
  if(c.weight_class)pieces.push(c.weight_class);
  if(c.rating_limit)pieces.push(`≤ ${c.rating_limit} OVR`);
  if(c.bans&&c.bans!=='No bans')pieces.push(c.bans);
  if(c.rematch_clause)pieces.push('REMATCH');
  if(c.live_fight)pieces.push('LIVE');
  return pieces.join(' · ');
}
async function refreshContracts(){
  if(!db||!state.user||!state.myFighter){state.fighterContracts=[];renderContractCenter();return;}
  try{await db.rpc('expire_my_fighter_contracts');}catch(_e){}
  const {data,error}=await db.from('fighter_contracts').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){state.fighterContracts=[];renderContractCenter();return;}
  state.fighterContracts=data||[];
  renderContractCenter();
}
function renderContractCenter(){
  const center=$('#contractCenter');if(!center)return;
  $('#contractWalletBalance').textContent=state.wallet?formatCredits(state.wallet.balance):'UC 0';
  if(!state.user||!state.myFighter){$('#incomingContractCount').textContent='0';$('#contractRows').innerHTML=empty('Create an official fighter profile to send and receive contracts.');return;}
  const pendingIncoming=state.fighterContracts.filter(c=>c.status==='pending'&&c.receiver_fighter_id===state.myFighter.id);
  $('#incomingContractCount').textContent=String(pendingIncoming.length);
  let rows=[];
  if(state.contractTab==='incoming')rows=pendingIncoming;
  else if(state.contractTab==='sent')rows=state.fighterContracts.filter(c=>c.status==='pending'&&c.sender_fighter_id===state.myFighter.id);
  else rows=state.fighterContracts.filter(c=>c.status!=='pending');
  $('#contractRows').innerHTML=rows.length?rows.map(c=>{
    const opp=contractOpponent(c),incoming=c.receiver_fighter_id===state.myFighter.id,status=contractStatusLabel(c.status);
    let actions='';
    if(c.status==='pending'&&incoming)actions=`<button class="contract-action accept" data-contract-action="accept" data-contract-id="${c.id}">ACCEPT</button><button class="contract-action decline" data-contract-action="decline" data-contract-id="${c.id}">DECLINE</button>`;
    else if(c.status==='pending'&&!incoming)actions=`<button class="contract-action decline" data-contract-action="cancel" data-contract-id="${c.id}">CANCEL</button>`;
    return `<article class="contract-row">
      <div class="contract-row-main">${avatarHtml(opp,'contract-row-avatar')}<div><small>${incoming?'CHALLENGE FROM':'CHALLENGE SENT TO'}</small><strong>${esc(opp?.name||'Unknown fighter')}</strong><span>${esc(contractTerms(c))}</span></div></div>
      <div class="contract-row-wager"><small>WAGER</small><strong>${formatCredits(c.wager)}</strong><span>${c.status==='pending'?`Expires ${new Date(c.expires_at).toLocaleString()}`:new Date(c.updated_at||c.created_at).toLocaleDateString()}</span></div>
      <div class="contract-status status-${esc(c.status)}">${esc(status)}</div>
      <div class="contract-row-actions">${actions}</div>
    </article>`;
  }).join(''):empty(state.contractTab==='incoming'?'No incoming contract challenges.':state.contractTab==='sent'?'No pending contracts sent.':'No contract history yet.');
}
$('#contractTabs')?.addEventListener('click',e=>{const b=e.target.closest('[data-contract-tab]');if(!b)return;state.contractTab=b.dataset.contractTab;$$('#contractTabs button').forEach(x=>x.classList.toggle('active',x===b));renderContractCenter();});
$('#contractRows')?.addEventListener('click',async e=>{
  const b=e.target.closest('[data-contract-action]');if(!b||!db)return;
  const action=b.dataset.contractAction,id=b.dataset.contractId;
  b.disabled=true;
  const {error}=await db.rpc('respond_fighter_contract',{p_contract_id:id,p_action:action});
  if(error){b.disabled=false;return toast(error.message,true);}
  await refreshWallet();await refreshContracts();toast(action==='accept'?'Contract accepted. Fight is locked in.':action==='decline'?'Contract declined.':'Contract cancelled.');
});
$('#fighterContractForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!state.user||!state.myFighter||!state.contractTarget)return toast('Open a fighter profile and choose Send Contract.',true);
  const d=new FormData(e.target),wager=Math.floor(Number(d.get('wager')||0)),max=Math.floor(Number(state.wallet?.balance||0)*.25);
  if(wager<0)return toast('Wager cannot be negative.',true);
  if(wager>max)return toast(`Maximum contract wager is ${formatCredits(max)}.`,true);
  const payload={
    p_receiver_fighter_id:d.get('receiver_fighter_id'),
    p_wager:wager,
    p_purse_split:d.get('purse_split'),
    p_rounds:Number(d.get('rounds')),
    p_damage:Number(d.get('damage')),
    p_weight_class:(d.get('weight_class')||'').trim()||null,
    p_rating_limit:d.get('rating_limit')?Number(d.get('rating_limit')):null,
    p_bans:d.get('bans'),
    p_rematch_clause:d.get('rematch_clause')==='true',
    p_live_fight:d.get('live_fight')==='true'
  };
  const submit=e.submitter; if(submit)submit.disabled=true;
  const {error}=await db.rpc('create_fighter_contract',payload);
  if(submit)submit.disabled=false;
  if(error)return toast(error.message,true);
  e.target.reset();closeContractModal();await refreshWallet();await refreshContracts();state.contractTab='sent';$$('#contractTabs button').forEach(x=>x.classList.toggle('active',x.dataset.contractTab==='sent'));renderContractCenter();showPage('account');toast('Contract challenge sent.');
});

async function refreshSession(){
  if(!db){updateAdminUI();updateAccountUI();updatePhotographerUI();return;}
  const {data:{session}}=await db.auth.getSession();state.user=session?.user||null;state.isAdmin=false;state.profile=null;state.myFighter=null;state.wallet=null;state.userBets=[];state.fighterContracts=[];state.canPhotograph=false;
  if(state.user){
    const [{data:profile,error:profileError},{data:myFighter}]=await Promise.all([
      db.from('profiles').select('id,is_admin,display_name,region,platform,avatar_url').eq('id',state.user.id).single(),
      db.from('fighters').select('*').eq('user_id',state.user.id).maybeSingle()
    ]);
    if(!profileError&&profile){state.profile=profile;state.isAdmin=Boolean(profile.is_admin);}state.myFighter=myFighter||null;
    const {data:photoPermission}=await db.rpc('is_ucs_photographer');state.canPhotograph=Boolean(photoPermission);
    await refreshWallet();await refreshContracts();
  } else {renderBets();renderContractCenter();}
  updateAdminUI();updateAccountUI();updatePhotographerUI();
}
function updateAdminUI(){
  $('#connectionStatus').textContent=configured?'Supabase connected':'Supabase not configured';
  $('#setupNotice').classList.toggle('hidden',configured&&state.isAdmin);$('#loginForm').classList.toggle('hidden',Boolean(state.user));$('#adminSession').classList.toggle('hidden',!state.user);$('#adminIdentity').textContent=state.user?`${state.user.email}${state.isAdmin?' · ADMIN':' · NOT ADMIN'}`:'';$('#adminControls').classList.toggle('hidden',!state.isAdmin);if(!state.isAdmin){ucsEarningsState.records=new Map();ucsEarningsState.loaded=false;ucsShowAdminTab('operations');}$('#adminLocked').classList.toggle('hidden',state.isAdmin);
  if(state.user&&!state.isAdmin)$('#adminLocked').textContent='This account is signed in but is not marked as a UCS admin in public.profiles.';else if(!configured)$('#adminLocked').textContent='Add your Supabase URL and anon/publishable key to config.js, then run supabase-schema.sql.';else $('#adminLocked').textContent='Sign in with an account marked as an admin in Supabase to unlock league controls.';
}
function updateAccountUI(){
  const guest=$('#accountGuest'),member=$('#accountMember');if(!guest||!member)return;guest.classList.toggle('hidden',Boolean(state.user));member.classList.toggle('hidden',!state.user);$('#fighterAccountStatus').textContent=!configured?'Supabase not configured':state.user?(state.isAdmin?'Admin / fighter account':'Fighter account active'):'Create an account or sign in';if(!state.user)return;
  $('#memberEmail').textContent=state.user.email||'Signed in';$('#memberRole').textContent=state.isAdmin?'UCS Administrator':'UCS Fighter';$('#memberWallet').textContent=state.wallet?formatCredits(state.wallet.balance):'UC 0';
  const form=$('#profileForm');if(form){form.elements.display_name.value=state.profile?.display_name||state.user.user_metadata?.fighter_name||'';form.elements.region.value=state.profile?.region||state.user.user_metadata?.region||'';form.elements.platform.value=state.profile?.platform||state.user.user_metadata?.platform||'PS5';}
  const preview=$('#avatarPreview');if(preview)preview.innerHTML=state.profile?.avatar_url?`<img src="${esc(state.profile.avatar_url)}" alt="Profile picture">`:`<span>${esc(initials(state.profile?.display_name||'UCS'))}</span>`;
  const f=state.myFighter;$('#createMyFighterBtn').classList.toggle('hidden',Boolean(f));
  $('#myFighterDetails').innerHTML=f?`<div class="my-fighter-head">${avatarHtml(f,'my-fighter-avatar')}<div><strong>${esc(f.name)}</strong><span class="fighter-badge">OFFICIAL UCS FIGHTER</span></div></div><div class="my-record"><div><strong>${f.wins}</strong><span>WINS</span></div><div><strong>${f.losses}</strong><span>LOSSES</span></div><div><strong>${f.draws}</strong><span>DRAWS</span></div></div><small>Platform: ${esc(f.platform||'—')} · Region: ${esc(f.region||'—')} · Rating: ${Number(f.score||0).toFixed(1)}</small>`:'No official fighter profile linked yet. Create yours below with a clean 0-0-0 record.';
  renderContractCenter();
}

$('#fighterSignupForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db)return toast('Configure Supabase first.',true);const d=new FormData(e.target),fighter_name=d.get('fighter_name').trim(),region=d.get('region').trim(),platform=d.get('platform');const {data,error}=await db.auth.signUp({email:d.get('email'),password:d.get('password'),options:{data:{fighter_name,region,platform}}});if(error)return toast(error.message,true);if(data.session){await refreshSession();toast('Account created and signed in.');}else toast('Account created. Check your email to confirm your UCS account.');});
$('#fighterLoginForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!db)return toast('Configure Supabase first.',true);const d=new FormData(e.target),{error}=await db.auth.signInWithPassword({email:d.get('email'),password:d.get('password')});if(error)return toast(error.message,true);await refreshSession();toast('Signed in to UCS.');});
$('#fighterSignOutBtn')?.addEventListener('click',async()=>{if(db)await db.auth.signOut();state.user=null;state.isAdmin=false;state.profile=null;state.myFighter=null;state.wallet=null;state.userBets=[];state.fighterContracts=[];updateAdminUI();updateAccountUI();renderBets();renderContractCenter();toast('Signed out.');});
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
$('#signOutBtn')?.addEventListener('click',async()=>{if(db)await db.auth.signOut();state.user=null;state.isAdmin=false;state.profile=null;state.myFighter=null;state.wallet=null;state.userBets=[];state.fighterContracts=[];updateAdminUI();updateAccountUI();renderBets();renderContractCenter();toast('Signed out.');});
$('#refreshAdmin')?.addEventListener('click',async()=>{await loadPublicData();toast('Database refreshed.');});
$('#smartRankingsBtn')?.addEventListener('click',async()=>{if(!state.isAdmin)return toast('Admin permission required.',true);const {error}=await db.rpc('recalculate_ucs_rankings');if(error)return toast(error.message,true);await loadPublicData();toast('UCS smart rankings recalculated.');});

async function adminInsert(table,payload,msg){if(!state.isAdmin)return toast('Admin permission required.',true);const {error}=await db.from(table).insert(payload);if(error)return toast(error.message,true);toast(msg);await loadPublicData();}
async function adminUpdate(table,payload,match,msg){if(!state.isAdmin)return toast('Admin permission required.',true);let q=db.from(table).update(payload);Object.entries(match).forEach(([k,v])=>q=q.eq(k,v));const {error}=await q;if(error)return toast(error.message,true);toast(msg);await loadPublicData();}

$('#fighterCreateForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('fighters',{name:d.get('name').trim(),wins:+d.get('wins'),losses:+d.get('losses'),draws:+d.get('draws'),region:d.get('region').trim()||null,platform:d.get('platform')},'Fighter added.');if(state.isAdmin)e.target.reset();});
$('#adminFighterAvatarFile')?.addEventListener('change',e=>{
  const target=$('#adminFighterAvatarPreview'),file=e.target.files?.[0];
  if(!target)return;
  if(window._adminAvatarPreviewUrl)URL.revokeObjectURL(window._adminAvatarPreviewUrl);
  window._adminAvatarPreviewUrl=file?URL.createObjectURL(file):null;
  target.innerHTML=file?`<img src="${window._adminAvatarPreviewUrl}" alt="Selected fighter picture preview" style="width:100px;height:100px;object-fit:cover;border-radius:12px"><p>${esc(file.name)}</p>`:'';
});
$('#adminFighterAvatarForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!state.user||!state.isAdmin)return toast('UCS admin permission required.',true);
  const form=e.currentTarget,details=new FormData(form),fighterId=details.get('fighter_id');
  const fighter=fighterById(fighterId),file=$('#adminFighterAvatarFile')?.files?.[0],submit=$('#adminFighterAvatarSubmit');
  if(!fighter)return toast('Select a valid fighter.',true);
  if(!file)return toast('Choose a picture first.',true);
  const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  const extension=types[file.type];
  if(!extension)return toast('Upload PNG, JPG or WebP only.',true);
  if(file.size>5*1024*1024)return toast('Picture must be 5 MB or smaller.',true);
  if(!file.size)return toast('Picture file is empty.',true);
  submit.disabled=true;submit.textContent='UPLOADING...';
  try{
    const path=`admin/${fighter.id}/${crypto.randomUUID()}.${extension}`;
    const {error:uploadError}=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
    if(uploadError)throw uploadError;
    const {data:publicData}=db.storage.from('fighter-avatars').getPublicUrl(path);
    const {error:saveError}=await db.from('fighters').update({avatar_url:publicData.publicUrl,updated_at:new Date().toISOString()}).eq('id',fighter.id);
    if(saveError)throw saveError;
    form.reset();$('#adminFighterAvatarPreview').innerHTML='';
    if(window._adminAvatarPreviewUrl)URL.revokeObjectURL(window._adminAvatarPreviewUrl);
    window._adminAvatarPreviewUrl=null;
    await loadPublicData();toast(`${fighter.name} picture updated.`);
  }catch(error){toast(error.message||'Could not upload fighter picture.',true);}
  finally{submit.disabled=false;submit.textContent='UPLOAD FIGHTER PICTURE';}
});


const ucsEarningsState={records:new Map(),loaded:false};
function ucsShowAdminTab(tab){
  const earnings=tab==='earnings'&&state.isAdmin,news=tab==='news'&&state.isAdmin;
  $('#adminOperationsPanel')?.classList.toggle('hidden',earnings||news);
  $('#adminEarningsPanel')?.classList.toggle('hidden',!earnings);
  $('#adminNewsPanel')?.classList.toggle('hidden',!news);
  $('#adminEarningsPanel')?.setAttribute('aria-hidden',String(!earnings));
  $('#adminNewsPanel')?.setAttribute('aria-hidden',String(!news));
  for(const [id,active] of [['adminOperationsTab',!earnings&&!news],['adminEarningsTab',earnings],['adminNewsTab',news]]){
    $('#'+id)?.classList.toggle('active',active);
    $('#'+id)?.setAttribute('aria-selected',String(active));
  }
  if(earnings)ucsLoadEarnings();
  if(news)renderNews();
}
function ucsFormatEarnings(value){
  return Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
}
async function ucsLoadEarnings(){
  if(!db||!state.isAdmin)return;
  const {data,error}=await db.from('fighter_earnings').select('fighter_id,amount');
  if(error)return toast('Could not load earnings: '+error.message,true);
  ucsEarningsState.records=new Map((data||[]).map(x=>[x.fighter_id,Number(x.amount)]));
  state.fighterEarnings=new Map(ucsEarningsState.records);
  const shownProfile=$('#fighterModal')?.classList.contains('open')?state.fighters.find(f=>f.name===$('#profileName')?.textContent):null;
  if(shownProfile)$('#profileEarnings').textContent=ucsFormatEarnings(state.fighterEarnings.get(shownProfile.id)||0);
  ucsEarningsState.loaded=true;
  ucsRenderEarnings();
}
function ucsRenderEarnings(){
  if(!ucsEarningsState.loaded)return;
  const tbody=$('#adminEarningsRows');
  if(!tbody)return;
  tbody.innerHTML=state.fighters.length?state.fighters.map(f=>{
    const amount=ucsEarningsState.records.get(f.id)||0;
    return `<tr><td><div class="rank-fighter-cell">${avatarHtml(f)}<strong>${esc(f.name)}</strong></div></td><td>${esc(f.wins+'-'+f.losses+'-'+f.draws)}</td><td class="ucs-earnings-value">${ucsFormatEarnings(amount)}</td><td><button type="button" class="mini-action" data-earnings-fighter="${esc(f.id)}">EDIT</button></td></tr>`;
  }).join(''):'<tr><td colspan="4">No fighters on roster yet.</td></tr>';
  const selected=$('#earningsFighterSelect')?.value;
  if(selected)ucsPopulateEarningsInput(selected);
}
function ucsPopulateEarningsInput(fighterId){
  const f=fighterById(fighterId);
  if(!f)return;
  $('#earningsFighterSelect').value=f.id;
  $('#earningsAmount').value=String(ucsEarningsState.records.get(f.id)||0);
}
$('#adminOperationsTab')?.addEventListener('click',()=>ucsShowAdminTab('operations'));
$('#adminEarningsTab')?.addEventListener('click',()=>ucsShowAdminTab('earnings'));
$('#adminNewsTab')?.addEventListener('click',()=>ucsShowAdminTab('news'));
$('#earningsFighterSelect')?.addEventListener('change',e=>ucsPopulateEarningsInput(e.target.value));
$('#adminEarningsRows')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-earnings-fighter]');
  if(!button)return;
  ucsPopulateEarningsInput(button.dataset.earningsFighter);
  $('#fighterEarningsForm')?.scrollIntoView({block:'nearest',behavior:'smooth'});
});
$('#fighterEarningsForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const form=e.currentTarget,d=new FormData(form),fighter_id=d.get('fighter_id');
  const amount=Number(d.get('amount'));
  if(!fighterById(fighter_id))return toast('Choose a valid fighter.',true);
  if(!Number.isFinite(amount)||amount<0||!Number.isInteger(amount*100))return toast('Enter a valid non-negative amount with at most 2 decimals.',true);
  const submit=$('#saveFighterEarnings');submit.disabled=true;
  try{
    const {error}=await db.from('fighter_earnings').upsert({fighter_id,amount,updated_at:new Date().toISOString()},{onConflict:'fighter_id'});
    if(error)throw error;
    await ucsLoadEarnings();
    toast('Fighter earnings saved.');
  }catch(error){toast(error.message||'Could not save earnings.',true);}
  finally{submit.disabled=false;}
});

$('#recordForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminUpdate('fighters',{wins:+d.get('wins'),losses:+d.get('losses'),draws:+d.get('draws'),updated_at:new Date().toISOString()},{id:d.get('fighter_id')},'Record updated.');if(state.isAdmin){await db.rpc('recalculate_ucs_rankings');await loadPublicData();}});
function populateFighterDetailsEditor(){
  const form=$('#fighterDetailsForm'),id=$('#fighterDetailsSelect')?.value;
  if(!form)return;
  const fighter=fighterById(id);
  form.elements.fighter_bio.value=fighter?.fighter_bio||'';
  form.elements.server_icon_url.value=fighter?.server_icon_url||'';
  form.elements.is_underdog.value=fighter?.is_underdog?'true':'false';
}
$('#fighterDetailsSelect')?.addEventListener('change',populateFighterDetailsEditor);
$('#fighterDetailsForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const d=new FormData(e.currentTarget),id=d.get('fighter_id');
  if(!fighterById(id))return toast('Choose a fighter.',true);
  const iconUrl=String(d.get('server_icon_url')||'').trim();
  if(iconUrl&&!safeHttps(iconUrl))return toast('Server icon must be HTTPS.',true);
  const {error}=await db.from('fighters').update({
    fighter_bio:String(d.get('fighter_bio')||'').trim(),
    server_icon_url:iconUrl||null,
    is_underdog:d.get('is_underdog')==='true',
    updated_at:new Date().toISOString()
  }).eq('id',id);
  if(error)return toast(error.message,true);
  await loadPublicData();toast('Fighter About page updated.');
});
$('#simDivisionForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!state.isAdmin)return toast('UCS admin permission required.',true);
  const d=new FormData(e.currentTarget);
  const fighter_id=d.get('fighter_id');
  const sim_division=d.get('sim_division')==='true';
  const {error}=await db.from('fighters').update({sim_division,updated_at:new Date().toISOString()}).eq('id',fighter_id);
  if(error)return toast(error.message,true);
  await loadPublicData();
  toast(sim_division?'Fighter added to UCS SIM World.':'Fighter removed from UCS SIM World.');
});
$('#championForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(!state.isAdmin)return;const payload={division:d.get('division'),fighter_id:d.get('fighter_id'),defenses:+d.get('defenses')||0,granted_at:new Date().toISOString()};const {error}=await db.from('champions').upsert(payload,{onConflict:'division'});if(error)return toast(error.message,true);await db.rpc('recalculate_ucs_rankings');toast(`${d.get('division')} champion granted.`);await loadPublicData();});
$('#vacateTitleBtn')?.addEventListener('click',async()=>{const f=$('#championForm'),division=new FormData(f).get('division');if(!state.isAdmin)return;const {error}=await db.from('champions').upsert({division,fighter_id:null,defenses:0,granted_at:new Date().toISOString()},{onConflict:'division'});if(error)return toast(error.message,true);await db.rpc('recalculate_ucs_rankings');toast(`${division} title vacated.`);await loadPublicData();});
$('#resultForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('winner_id')===d.get('loser_id'))return toast('Winner and loser must be different.',true);if(!state.isAdmin)return toast('Admin permission required.',true);const {error}=await db.rpc('publish_ucs_result',{p_winner_id:d.get('winner_id'),p_loser_id:d.get('loser_id'),p_method:d.get('method'),p_event_date:d.get('event_date')});if(error)return toast(error.message,true);toast('Result published, records and rankings updated.');await loadPublicData();});
$('#scheduleBoutForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('UCS admin required.',true);
  const d=new FormData(e.currentTarget),a=d.get('fighter_a_id'),b=d.get('fighter_b_id');
  if(a===b)return toast('Select two different fighters.',true);
  const url=(d.get('contribution_url')||'').trim();
  if(url&&!safeHttps(url))return toast('Use a valid HTTPS contribution link.',true);
  const payload={fighter_a_id:a,fighter_b_id:b,event_name:d.get('event_name').trim(),bout_date:d.get('bout_date')||null,belt:d.get('belt')||null,contribution_url:url||null};
  const {error}=await db.from('scheduled_bouts').insert(payload);
  if(error)return toast(error.message,true);
  e.currentTarget.reset();await loadPublicData();toast('Bout scheduled. Fight records unchanged.');
});
$('#editScheduledBoutForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('UCS admin required.',true);
  const form=e.currentTarget,d=new FormData(form),boutId=d.get('bout_id');
  const original=state.scheduledBouts.find(x=>x.id===boutId);
  if(!original)return toast('Select a scheduled bout.',true);
  const posterFile=d.get('poster_file'),contribution=(d.get('contribution_url')||'').trim();
  let posterUrl=(d.get('poster_url')||'').trim();
  if(contribution&&!safeHttps(contribution))return toast('Use a valid HTTPS contribution link.',true);
  if(posterUrl&&!safeHttps(posterUrl))return toast('Use an HTTPS poster image URL.',true);
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
    if(posterFile instanceof File&&posterFile.size){
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'},ext=types[posterFile.type];
      if(!ext)throw Error('Poster must be PNG, JPG, or WebP.');
      if(posterFile.size>5*1024*1024)throw Error('Poster must be under 5 MB.');
      const path=`bout-posters/${boutId}/${crypto.randomUUID()}.${ext}`;
      const {error:uploadError}=await db.storage.from('fighter-avatars').upload(path,posterFile,{contentType:posterFile.type,upsert:false});
      if(uploadError)throw uploadError;
      posterUrl=db.storage.from('fighter-avatars').getPublicUrl(path).data.publicUrl;
    }
    const payload={event_name:d.get('event_name').trim(),bout_date:d.get('bout_date')||null,belt:d.get('belt')||null,poster_url:posterUrl||null,contribution_url:contribution||null,updated_at:new Date().toISOString()};
    const {error}=await db.from('scheduled_bouts').update(payload).eq('id',boutId);
    if(error)throw error;
    await loadPublicData();toast('Scheduled bout updated. No result recorded.');
  }catch(error){toast(error.message||'Could not save bout.',true);}finally{button.disabled=false;}
});
$('#cancelScheduledBout')?.addEventListener('click',async()=>{
  if(!db||!state.isAdmin)return toast('UCS admin required.',true);
  const id=$('#scheduledBoutSelect').value;if(!id)return;
  if(!confirm('Cancel this scheduled bout? Fight records will not change.'))return;
  const {error}=await db.from('scheduled_bouts').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return toast(error.message,true);await loadPublicData();toast('Scheduled bout cancelled.');
});
$('#eventForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('events',{name:d.get('name').trim(),event_date:d.get('event_date'),details:d.get('details').trim()||null,status:d.get('status')},'Event created.');});
$('#contractForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await adminInsert('contract_activity',{fighter_id:d.get('fighter_id'),action:d.get('action')},'Contract activity posted.');});
$('#betForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('fighter_a_id')===d.get('fighter_b_id'))return toast('Choose two different fighters.',true);await adminInsert('betting_markets',{fighter_a_id:d.get('fighter_a_id'),fighter_b_id:d.get('fighter_b_id'),odds_a:d.get('odds_a'),odds_b:d.get('odds_b'),is_open:true},'Betting market opened.');});
$('#featureForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('champion_id')===d.get('challenger_id'))return toast('Choose two different fighters.',true);if(!state.isAdmin)return;const {error}=await db.from('league_settings').upsert({key:'featured_main_event',value:{champion_id:d.get('champion_id'),challenger_id:d.get('challenger_id'),event_label:d.get('event_label')},updated_at:new Date().toISOString()},{onConflict:'key'});if(error)return toast(error.message,true);toast('Featured fight updated.');await loadPublicData();});

function renderAdminRows(){if(!$('#adminFighterRows'))return;$('#adminFighterRows').innerHTML=state.fighters.length?state.fighters.map(f=>{const titles=state.champions.filter(c=>c.fighter_id===f.id).map(c=>c.division).join(', ')||'—';return `<tr><td><div class="rank-fighter-cell">${avatarHtml(f)}<strong>${esc(f.name)}</strong></div></td><td>${esc(record(f))}</td><td>${esc(f.region||'—')} · ${esc(f.platform||'—')}</td><td>${esc(titles)}</td><td><button class="mini-action" data-load-record="${f.id}">Edit record</button><button class="mini-action danger" data-delete-fighter="${f.id}">Delete</button></td></tr>`;}).join(''):`<tr><td colspan="5">${empty('No fighters yet.')}</td></tr>`;}
$('#adminFighterRows')?.addEventListener('click',async e=>{const edit=e.target.closest('[data-load-record]'),del=e.target.closest('[data-delete-fighter]');if(edit){const f=fighterById(edit.dataset.loadRecord),form=$('#recordForm');form.elements.fighter_id.value=f.id;form.elements.wins.value=f.wins;form.elements.losses.value=f.losses;form.elements.draws.value=f.draws;form.scrollIntoView({behavior:'smooth',block:'center'});}if(del){const f=fighterById(del.dataset.deleteFighter);if(!confirm(`Delete ${f?.name||'this fighter'}? Related rows may also be affected.`))return;const {error}=await db.from('fighters').delete().eq('id',del.dataset.deleteFighter);if(error)return toast(error.message,true);toast('Fighter deleted.');await loadPublicData();}});
$('#clearLeagueData')?.addEventListener('click',async()=>{if(!state.isAdmin)return;if(prompt('Type DELETE UCS DATA to clear the entire league database.')!=='DELETE UCS DATA')return toast('Clear cancelled.',true);for(const table of ['league_settings','betting_markets','contract_activity','results','champions','events','fighters']){const {error}=await db.from(table).delete().neq('created_at','1900-01-01T00:00:00Z');if(error&&table!=='champions'&&table!=='league_settings')return toast(`${table}: ${error.message}`,true);if(error&&(table==='champions'||table==='league_settings')){const key=table==='champions'?'division':'key';const {error:retry}=await db.from(table).delete().neq(key,'__never__');if(retry)return toast(`${table}: ${retry.message}`,true);}}toast('League data cleared.');await loadPublicData();});

if(db)db.auth.onAuthStateChange(()=>setTimeout(refreshSession,0));
// Supabase change events refresh the recommendations after the official record is saved.
let marqueeRefreshPending=false;
async function refreshMatchupsFromDb(){
  if(marqueeRefreshPending)return;
  marqueeRefreshPending=true;
  try{await loadPublicData();}finally{marqueeRefreshPending=false;}
}
if(db){
  db.channel('ucs-marquee-live-records')
    .on('postgres_changes',{event:'*',schema:'public',table:'fighters'},refreshMatchupsFromDb)
    .on('postgres_changes',{event:'*',schema:'public',table:'results'},refreshMatchupsFromDb)
    .on('postgres_changes',{event:'*',schema:'public',table:'scheduled_bouts'},refreshMatchupsFromDb)
    .subscribe();
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')refreshMatchupsFromDb();
  });
}
(async function init(){renderAll();updateAdminUI();await refreshSession();await loadPublicData();if(location.hash.startsWith('#fighter/')){showPage('rankings');openFighterProfile(decodeURIComponent(location.hash.slice(9)));}else if(location.hash&&$(location.hash))showPage(location.hash.slice(1));})();
