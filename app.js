const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const state = {
  fighters: [], champions: [], results: [], events: [], contracts: [], bets: [], scheduledBouts: [], news: [], photos: [], canPhotograph: false, settings: {},
  user: null, isAdmin: false, profile: null, myFighter: null, wallet: null, userBets: [],
  fighterEarnings: new Map(), formerChampionships: [], fighterContracts: [], contractTab: 'incoming', contractTarget: null,
  rankingDivision: 'UCS World', betSelection: null
};

const configured = Boolean(window.UFK_SUPABASE_URL && window.UFK_SUPABASE_ANON_KEY && window.supabase?.createClient);
const db = configured ? window.supabase.createClient(window.UFK_SUPABASE_URL, window.UFK_SUPABASE_ANON_KEY) : null;

// Twitch embeds must receive the actual hostname in the parent parameter.
// Only mount on the Watch tab, and unload when leaving so the audio stops.
let ucsTwitchMounted=false;
function ucsMountTwitch(){
  if(ucsTwitchMounted)return;
  const player=$('#ucsTwitchPlayer'),chat=$('#ucsTwitchChat');
  if(!player||!chat)return;
  const host=window.location.hostname||'ucsleague.vercel.app';
  const parent=encodeURIComponent(host);
  const playerUrl='https://player.twitch.tv/?channel=ucseries&parent='+parent+'&muted=false&autoplay=false';
  const chatUrl='https://www.twitch.tv/embed/ucseries/chat?parent='+parent+'&darkpopout';
  const frame=(url,title)=>{const el=document.createElement('iframe');el.src=url;el.title=title;el.loading='lazy';el.referrerPolicy='strict-origin-when-cross-origin';el.allow='autoplay; fullscreen; picture-in-picture';el.allowFullscreen=true;el.setAttribute('frameborder','0');return el;};
  player.replaceChildren(frame(playerUrl,'UCS Twitch live video player'));
  chat.replaceChildren(frame(chatUrl,'UCS Twitch live chat'));
  ucsTwitchMounted=true;
}
function ucsUnmountTwitch(){
  if(!ucsTwitchMounted)return;
  const player=$('#ucsTwitchPlayer'),chat=$('#ucsTwitchChat');
  player?.replaceChildren();
  chat?.replaceChildren();
  ucsTwitchMounted=false;
}
// Homepage stream starts already expanded and muted to meet autoplay rules.
// Guests can view Twitch streams without authentication; Twitch handles playback.
let ucsHomePlayerMounted=false;
function ucsMountHomeTwitch(){
  if(ucsHomePlayerMounted)return;
  const box=$('#ucsHomeTwitchPlayer');
  const details=$('#ucsHomeTwitchDetails');
  if(!box||!details?.open)return;
  const host=window.location.hostname||'ucsleague.vercel.app';
  const url='https://player.twitch.tv/?channel=ucseries&parent='+encodeURIComponent(host)+'&autoplay=true&muted=true';
  const frame=document.createElement('iframe');
  frame.src=url;
  frame.title='Watch UCS live on Twitch without leaving the website';
  frame.loading='eager';
  frame.allow='autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen=true;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.setAttribute('frameborder','0');
  box.replaceChildren(frame);
  ucsHomePlayerMounted=true;
}
function ucsUnmountHomeTwitch(){
  if(!ucsHomePlayerMounted)return;
  $('#ucsHomeTwitchPlayer')?.replaceChildren();
  ucsHomePlayerMounted=false;
}
$('#ucsHomeTwitchDetails')?.addEventListener('toggle',e=>{
  if(e.currentTarget.open&&$('#home')?.classList.contains('active'))ucsMountHomeTwitch();
  else ucsUnmountHomeTwitch();
});

function showPage(id){
  document.body.classList.remove('ucs-cinema-navigating');
  void document.body.offsetWidth;
  document.body.classList.add('ucs-cinema-navigating');
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===id));
  $('#nav')?.classList.remove('open');
  $('#menuBtn')?.setAttribute('aria-expanded','false');
  if(id==='watch')ucsMountTwitch();else ucsUnmountTwitch();
  if(id==='home')ucsMountHomeTwitch();else ucsUnmountHomeTwitch();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-page]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showPage(a.dataset.page);history.replaceState(null,'','#'+a.dataset.page)}));
$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.jump)));
$('#menuBtn').onclick=()=>{const open=$('#nav').classList.toggle('open');$('#menuBtn').setAttribute('aria-expanded',String(open));};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#nav')?.classList.contains('open')){$('#nav').classList.remove('open');$('#menuBtn').setAttribute('aria-expanded','false');$('#menuBtn').focus();}});

function toast(msg,bad=false){
  const t=$('#toast'); t.textContent=msg; t.classList.toggle('error',bad); t.classList.add('show');
  clearTimeout(window._toast); window._toast=setTimeout(()=>t.classList.remove('show'),2800);
}
// October 21, 2026 8:00 PM America/New_York (EDT = UTC-4 on this date).
// Using a fixed UTC instant makes the countdown identical for every viewer.
const UCS_FIGHT_NIGHT_AT=Date.parse('2026-10-22T00:00:00.000Z');
function ucsFeaturedEvent(){const x=state.settings?.featured_event_poster;return x&&typeof x==='object'?x:null;}
function ucsEventDate(){const x=ucsFeaturedEvent();const ms=x?.event_at?Date.parse(x.event_at):NaN;return Number.isFinite(ms)?ms:UCS_FIGHT_NIGHT_AT;}
function ucsRenderEventHero(){const x=ucsFeaturedEvent(),root=$('#ucsEventHero'),img=$('#ucsEventHeroImage');if(!root||!img)return;const shown=!!(x?.visible&&safeHttps(x?.poster_url));root.classList.toggle('hidden',!shown);if(shown){img.src=x.poster_url;img.alt=(x.title||'UCS Fight Night')+' event poster';$('#ucsEventHeroTitle').textContent=x.title||'UCS FIGHT NIGHT';}const label=$('.ucs-home-countdown-label');if(label&&x?.title)label.textContent=x.title;const form=$('#ucsEventHeroForm');if(form&&state.isAdmin){form.elements.title.value=x?.title||'';form.elements.event_at.value=x?.event_at?new Date(x.event_at).toLocaleString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(' ','T'):'';form.elements.visible.checked=x?.visible!==false;const preview=$('#ucsEventPosterPreview');if(preview)preview.innerHTML=safeHttps(x?.poster_url)?'<img src="'+esc(x.poster_url)+'" alt="Current event poster">':'No poster uploaded';}}

function ucsUpdateFightCountdown(){
  const remaining=Math.max(0,ucsEventDate()-Date.now());
  const seconds=Math.floor(remaining/1000);
  const days=Math.floor(seconds/86400);
  const hours=Math.floor((seconds%86400)/3600);
  const minutes=Math.floor((seconds%3600)/60);
  const secs=seconds%60;
  const pad=v=>String(v).padStart(2,'0');
  const values=[['ucsCDays',days],['ucsCHours',hours],['ucsCMinutes',minutes],['ucsCSeconds',secs]];
  values.forEach(([id,value])=>{const element=$('#'+id);if(element)element.textContent=pad(value);});
  const home=$('#ucsHomeCountdown');
  if(home)home.textContent=remaining?days+'d '+pad(hours)+'h '+pad(minutes)+'m '+pad(secs)+'s':'FIGHT NIGHT IS HERE';
  const status=$('#ucsCountdownStatus');
  if(status)status.textContent=remaining?'COUNTING DOWN TO THE FIRST BELL':'IT’S FIGHT NIGHT — WATCH UCS LIVE';
}
ucsUpdateFightCountdown();
setInterval(ucsUpdateFightCountdown,1000);

function fmtDate(d){ if(!d) return ''; const x=new Date(`${d}T12:00:00`); return Number.isNaN(x.getTime())?d:x.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function record(f){ return `${f?.wins ?? 0}-${f?.losses ?? 0}-${f?.draws ?? 0}${f?.region ? ` · ${f.region}` : ''}`; }
function fighterById(id){ return state.fighters.find(f=>f.id===id); }
function empty(msg){ return `<div class="data-empty">${esc(msg)}</div>`; }
function chip(v){ const n=Number(v||0); return `<span class="score-chip ${n<8?'mid':''}">${n.toFixed(1)}</span>`; }
function initials(name='UCS'){ return name.trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase() || 'UCS'; }
function ucsFighterFlag(region){
  const key=String(region||'').trim().toUpperCase();
  const flags={'UK':'🇬🇧','GB':'🇬🇧','UNITED KINGDOM':'🇬🇧','USA':'🇺🇸','US':'🇺🇸','UNITED STATES':'🇺🇸','CANADA':'🇨🇦','IRELAND':'🇮🇪','AUSTRALIA':'🇦🇺','FRANCE':'🇫🇷','GERMANY':'🇩🇪','SPAIN':'🇪🇸','ITALY':'🇮🇹','NETHERLANDS':'🇳🇱','BRAZIL':'🇧🇷','MEXICO':'🇲🇽','JAPAN':'🇯🇵','PHILIPPINES':'🇵🇭','NEW ZEALAND':'🇳🇿','NIGERIA':'🇳🇬'};
  return flags[key]||'';
}
function ucsFlagHtml(region){
  const key=String(region||'').trim().toUpperCase();
  const codes={'UK':'gb','GB':'gb','UNITED KINGDOM':'gb','ENGLAND':'gb-eng','SCOTLAND':'gb-sct','WALES':'gb-wls','USA':'us','US':'us','UNITED STATES':'us','CANADA':'ca','IRELAND':'ie','AUSTRALIA':'au','FRANCE':'fr','GERMANY':'de','SPAIN':'es','ITALY':'it','NETHERLANDS':'nl','BRAZIL':'br','MEXICO':'mx','JAPAN':'jp','PHILIPPINES':'ph','NEW ZEALAND':'nz','NIGERIA':'ng'};
  const code=codes[key];return code?'<img src="https://flagcdn.com/w40/'+code+'.png" alt="" aria-hidden="true" style="width:22px;height:15px;object-fit:cover;vertical-align:middle;margin-right:5px;border-radius:2px" loading="lazy">':'';
}
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
  const queries = await Promise.allSettled([
    db.from('fighters').select('*').eq('active',true).order('score',{ascending:false}),
    db.from('champions').select('*'),
    db.from('results').select('*').order('event_date',{ascending:false}).limit(5000),
    db.from('events').select('*').order('event_date',{ascending:true}),
    db.from('contract_activity').select('*').order('created_at',{ascending:false}).limit(20),
    db.from('betting_markets').select('*').eq('is_open',true).order('created_at',{ascending:false}),
    db.from('league_settings').select('*'),
    db.from('scheduled_bouts').select('*').eq('status','scheduled').order('bout_date',{ascending:true,nullsFirst:false}),
    db.from('fighter_earnings').select('fighter_id,amount'),
    db.from('ucs_news').select('*').order('published_at',{ascending:false}),
    db.from('ucs_photos').select('*').order('created_at',{ascending:false}).limit(120),
    db.from('ucs_former_championships').select('fighter_id,division')
  ]);
  const results=queries.map(x=>x.status==='fulfilled'?x.value:{data:null,error:x.reason});
  const firstError = results.find(x=>x.error)?.error;
  if(firstError) toast(`Supabase: ${firstError.message}`,true);
  [state.fighters,state.champions,state.results,state.events,state.contracts,state.bets]=results.slice(0,6).map(x=>x.data||[]);
  state.settings=Object.fromEntries((results[6].data||[]).map(x=>[x.key,x.value]));
  state.scheduledBouts=results[7].data||[];
  state.fighterEarnings=new Map((results[8].data||[]).map(row=>[row.fighter_id,Number(row.amount)]));
  state.news=results[9].data||[];
  state.photos=results[10].data||[];
  state.formerChampionships=results[11].data||[];
  ucsApplyRafaAvatar();
  renderAll();ucsRenderOfflineAdminList();renderChampionShowcase();ucsPopulateOfflineChampionSelect();ucsRenderHomeChampion();ucsFillBeltArtForm();ucsPosterFill();ucsRenderEventHero();ucsUpdateFightCountdown();ucsRenderEventTags();
}

// Optional live Discord avatar for RAFA. Lanyard only returns profiles for users
// enrolled in its public presence service; keep the stored UCS image as fallback.
const UCS_RAFA_DISCORD_ID='767233344634486804';
let ucsRafaDiscordAvatar=null;
function ucsApplyRafaAvatar(){
  const rafa=state.fighters.find(f=>String(f.name||'').trim().toUpperCase()==='RAFA');
  if(!rafa)return false;
  if(!rafa.ucsOriginalAvatar)rafa.ucsOriginalAvatar=rafa.avatar_url||'';
  const next=ucsRafaDiscordAvatar||rafa.ucsOriginalAvatar;
  if(rafa.avatar_url===next)return false;
  rafa.avatar_url=next;
  return true;
}
async function ucsRefreshRafaDiscordAvatar(){
  try{
    const response=await fetch('https://api.lanyard.rest/v1/users/'+UCS_RAFA_DISCORD_ID,{cache:'no-store'});
    if(!response.ok)return;
    const payload=await response.json();
    const user=payload?.data?.discord_user;
    if(!payload.success||String(user?.id)!==UCS_RAFA_DISCORD_ID)return;
    const hash=user.avatar;
    if(!hash||!/^[a-zA-Z0-9_]+$/.test(hash))return;
    const extension=hash.startsWith('a_')?'gif':'png';
    const next='https://cdn.discordapp.com/avatars/'+UCS_RAFA_DISCORD_ID+'/'+hash+'.'+extension+'?size=256';
    if(next===ucsRafaDiscordAvatar)return;
    ucsRafaDiscordAvatar=next;
    if(ucsApplyRafaAvatar())renderAll();
  }catch(error){console.info('RAFA Discord avatar unavailable; using UCS image.');}
}
setInterval(ucsRefreshRafaDiscordAvatar,300000);
ucsRefreshRafaDiscordAvatar();

// UCS Photography: public read-only gallery; approved users can upload.
function renderPhotoGallery(){
  const root=$('#ucsPhotoGallery');if(!root)return;
  const published=state.photos.filter(p=>p.published);
  root.innerHTML=published.length?published.map(p=>{
    const image=safeHttps(p.image_url)?`<img src="${esc(p.image_url)}" alt="${esc(p.caption||p.event_name||'UCS event photo')}" loading="lazy" style="object-position:center center">`:'';
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

// Tale of the Tape: interpretable data-driven scouting, never fabricated matchup odds.
let ucsTottSelection='main';
function ucsTottFeaturedBouts(){
  const bouts=state.scheduledBouts||[],featured=state.settings.featured_main_event||{};
  const featuredMatch=b=>!b.is_co_main&&((b.fighter_a_id===featured.champion_id&&b.fighter_b_id===featured.challenger_id)||(b.fighter_b_id===featured.champion_id&&b.fighter_a_id===featured.challenger_id));
  const main=bouts.find(featuredMatch)||bouts.find(b=>!b.is_co_main&&b.belt)||bouts.find(b=>!b.is_co_main)||null;
  const sameEvent=b=>main&&b.bout_date===main.bout_date;
  const co=bouts.find(b=>b.is_co_main&&sameEvent(b))||bouts.find(b=>b.is_co_main)||null;
  const undercard=bouts.filter(b=>b.id!==main?.id&&b.id!==co?.id&&sameEvent(b));
  return {main,co,undercard};
}
function ucsTottKoWins(f){
  if(!f)return 0;
  return state.results.filter(r=>r.winner_id===f.id&&/ko|tko|knockout/i.test(String(r.method||''))).length;
}
function ucsTottRank(f){
  if(!f)return '—';
  const order=[...state.fighters].sort((a,b)=>Number(b.score||0)-Number(a.score||0)||String(a.name).localeCompare(String(b.name)));
  const index=order.findIndex(x=>x.id===f.id);
  return index<0?'—':'#'+(index+1);
}
function ucsTottNumeric(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function ucsTottEdge(a,b,key){
  const x=ucsTottNumeric(a?.[key]),y=ucsTottNumeric(b?.[key]);
  if(x===null||y===null)return {winner:null,note:'N/A'};
  const delta=x-y;
  return {winner:Math.abs(delta)<0.35?null:delta>0?a:b,note:Math.abs(delta)<0.35?'EVEN':delta>0?'LEFT':'RIGHT'};
}
function renderTaleOfTheTape(){
  const root=$('#ucsTottStage'),tabMain=$('#ucsTottMainTab'),tabCo=$('#ucsTottCoMainTab'),underTabs=$('#ucsTottUndercardTabs');
  if(!root||!tabMain||!tabCo)return;
  try{
    const {main,co,undercard}=ucsTottFeaturedBouts();
    tabCo.classList.toggle('hidden',!co);
    if(!co&&ucsTottSelection==='co')ucsTottSelection='main';
    if(ucsTottSelection.startsWith('under:')&&!undercard.some(b=>b.id===ucsTottSelection.slice(6)))ucsTottSelection='main';
    for(const [tab,id] of [[tabMain,'main'],[tabCo,'co']]){
      tab.classList.toggle('active',ucsTottSelection===id);
      tab.setAttribute('aria-selected',String(ucsTottSelection===id));
    }
    if(underTabs)underTabs.innerHTML=undercard.map((b,i)=>{
      const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id),selected=ucsTottSelection==='under:'+b.id;
      return `<button type="button" role="tab" aria-controls="ucsTottStage" aria-selected="${selected}" class="${selected?'active':''}" data-tott-bout="${esc(b.id)}">UNDERCARD ${i+1} · ${esc(a?.name||'TBA')} VS ${esc(c?.name||'TBA')}</button>`;
    }).join('');
    const bout=ucsTottSelection==='co'?co:ucsTottSelection.startsWith('under:')?undercard.find(b=>b.id===ucsTottSelection.slice(6)):main;
    if(!bout){
      root.innerHTML=empty('No main event scheduled yet. The official comparison will appear automatically when an admin schedules a fight.');
      return;
    }
    const a=fighterById(bout.fighter_a_id),b=fighterById(bout.fighter_b_id);
    if(!a||!b){
      root.innerHTML=empty('Waiting for both official fighters to become available in the UCS roster.');
      return;
    }
    const keys=[['Resume','resume'],['Momentum','momentum'],['Finishing','finishing'],['Activity','activity'],['Big Fight','big_fight']];
    const rating=f=>ucsTottNumeric(f.score);
    const scoreText=f=>rating(f)===null?'—':rating(f).toFixed(1);
    const ko=f=>ucsTottKoWins(f),wins=f=>Number(f.wins||0);
    const pct=f=>wins(f)>0?Math.round(100*ko(f)/wins(f))+'%':'—';
    const officialRecord=f=>[f.wins??0,f.losses??0,f.draws??0].join('-');
    const side=(f,corner)=>`<div class="ucs-tott-fighter ${safeHttps(corner==='RED CORNER'?bout.fighter_a_bout_image:bout.fighter_b_bout_image)?'ucs-tott-has-portrait':''}">
      <span class="ucs-tott-corner">${corner}</span>
      ${safeHttps(corner==='RED CORNER'?bout.fighter_a_bout_image:bout.fighter_b_bout_image)?`<img class="ucs-tott-avatar ucs-tott-custom-portrait" src="${esc(corner==='RED CORNER'?bout.fighter_a_bout_image:bout.fighter_b_bout_image)}" alt="${esc(f.name)} matchup portrait" loading="lazy">`:avatarHtml(f,'ucs-tott-avatar')}
      <h3>${esc(f.name)}</h3>
      <strong class="ucs-tott-record">${esc(officialRecord(f))}</strong>
      <span class="ucs-tott-fighter-score">UCS SCORE <b>${esc(scoreText(f))}</b></span>
      <p>${esc(f.platform||'UCS')} · ${esc(f.region||'REGION TBA')}</p>
      <span class="ucs-tott-rank">WORLD RANK ${esc(ucsTottRank(f))}</span>
      <button type="button" data-tott-fighter="${esc(f.id)}" class="ucs-tott-view">VIEW PROFILE ↗</button>
    </div>`;
    const stat=(label,l,r,{numeric=true,decimal=true}={})=>{
      const left=numeric?ucsTottNumeric(l):null,right=numeric?ucsTottNumeric(r):null;
      const edge=numeric&&left!==null&&right!==null?Math.abs(left-right)<0.35?'EVEN':left>right?'LEFT':'RIGHT':'N/A';
      const format=v=>v===null||v===undefined||v===''?'—':decimal&&numeric?Number(v).toFixed(1):String(v);
      return `<div class="ucs-tott-stat"><strong class="${edge==='LEFT'?'ucs-tott-stat-edge':''}">${esc(format(l))}</strong><span>${esc(label)}</span><strong class="${edge==='RIGHT'?'ucs-tott-stat-edge':''}">${esc(format(r))}</strong></div>`;
    };
    const comparison=keys.map(([label,key])=>({label,...ucsTottEdge(a,b,key)}));
    const strengths=f=>comparison.filter(x=>x.winner?.id===f.id).map(x=>x.label.toLowerCase());
    const scoreA=rating(a),scoreB=rating(b),bothRated=scoreA!==null&&scoreB!==null;
    const delta=bothRated?scoreA-scoreB:0;
    const close=bothRated&&Math.abs(delta)<0.4;
    const pick=!bothRated||close?null:delta>0?a:b;
    const verdict=!bothRated?'INSUFFICIENT RATING DATA':close?'TOO CLOSE TO CALL':Math.abs(delta)<1.5?'SLIGHT RATING EDGE':'CLEAR RATING EDGE';
    const reason=pick?
      `${pick.name} has the higher current UCS rating (${Math.max(scoreA,scoreB).toFixed(1)} vs ${Math.min(scoreA,scoreB).toFixed(1)}).`:
      bothRated?'Both fighters are closely matched on the official UCS scoring system.':'Both fighters need official UCS ratings before a meaningful lean is possible.';
    const detail=f=>{
      const value=strengths(f);
      return `${f.name}: ${value.length?value.slice(0,2).join(' and '):'no clear rated-category advantage'}`;
    };
    const row=(label,key)=>stat(label,a[key],b[key]);
    root.innerHTML=`<article class="ucs-tott-card">
      <div class="ucs-tott-card-heading"><span>${ucsTottSelection==='main'?'★ MAIN EVENT':ucsTottSelection==='co'?'★ CO-MAIN EVENT':'★ UNDERCARD'}</span><strong>${esc(bout.belt?bout.belt.toUpperCase()+' TITLE FIGHT':bout.event_name||'UCS MATCHUP')}</strong><small>${esc(bout.bout_date?fmtDate(bout.bout_date):'DATE TBA')}</small></div>
      <div class="ucs-tott-main-grid">
        ${side(a,'RED CORNER')}
        <div class="ucs-tott-center"><span class="ucs-tott-vs ucs-red-vs-logo" role="img" aria-label="VS"></span><div class="ucs-tott-stat-table">
          ${stat('OFFICIAL RECORD',officialRecord(a),officialRecord(b),{numeric:false})}
          ${stat('KO WINS',ko(a),ko(b),{decimal:false})}
          ${stat('KO WIN RATE',pct(a),pct(b),{numeric:false})}
          ${keys.map(([label,key])=>row(label,key)).join('')}
          ${stat('UCS SCORE',scoreA,scoreB)}
        </div></div>
        ${side(b,'BLUE CORNER')}
      </div>
      <div class="ucs-tott-verdict"><div class="ucs-tott-verdict-head"><span>✦ UCS SCOUTING REPORT</span><strong>${esc(verdict)}</strong></div><p>${esc(reason)} ${esc(detail(a))}. ${esc(detail(b))}.</p></div>
      <div class="ucs-tott-likely"><span>★ LIKELY TO WIN · UCS SCOUTING PICK</span><strong>${pick?esc(pick.name.toUpperCase()):'EVEN MATCHUP'}</strong><p>${pick?'Based on the official UCS score advantage and current fighter ratings.':'No clear favorite from available UCS ratings.'} This is a rating-based assessment, not betting odds or a guaranteed outcome.</p></div>
    </article>`;
  }catch(error){
    console.error('UCS Tale of the Tape error',error);
    root.innerHTML=empty('Unable to display Tale of the Tape right now. Please refresh the page.');
  }
}
$('#ucsTottTabs')?.addEventListener('click',event=>{
  const tab=event.target.closest('[data-tott-slot]');
  if(!tab)return;
  ucsTottSelection=tab.dataset.tottSlot;
  renderTaleOfTheTape();
});
$('#ucsTottUndercardTabs')?.addEventListener('click',event=>{
  const tab=event.target.closest('[data-tott-bout]');
  if(!tab)return;
  ucsTottSelection='under:'+tab.dataset.tottBout;
  renderTaleOfTheTape();
});
$('#ucsTottStage')?.addEventListener('click',event=>{
  const btn=event.target.closest('[data-tott-fighter]');
  if(btn?.dataset.tottFighter)openFighterProfile(btn.dataset.tottFighter);
});

const ucsDefaultDivisions=['UCS World','UCS International','UCS EU Division','UCS PS5','UCS PC','UCS XBOX'];
function ucsDivisions(){
  const saved=state.settings.ranking_divisions;
  return Array.isArray(saved)?saved.filter(x=>typeof x==='string'&&x.trim()&&x!=='UCS SIM World').slice(0,40):ucsDefaultDivisions;
}
function ucsDivisionRegion(name){
  if(name==='UCS World'||name==='UCS International')return 'ALL';
  const saved=state.settings.division_regions||{};
  return ['ALL','EU','NA'].includes(saved[name])?saved[name]:'ALL';
}
function ucsFighterRegion(f){
  const value=String(f?.region||'').trim().toUpperCase();
  if(['EU','UK','GB','ENGLAND','SCOTLAND','WALES','IRELAND','FRANCE','GERMANY','SPAIN','ITALY','NETHERLANDS'].includes(value))return 'EU';
  if(['NA','USA','US','UNITED STATES','CANADA','CA','MEXICO'].includes(value))return 'NA';
  return '';
}
function ucsEligibleForDivision(f,name){
  const region=ucsDivisionRegion(name);
  return region==='ALL'||ucsFighterRegion(f)===region;
}
function ucsRenderDivisions(){
  const divisions=ucsDivisions();
  if(!divisions.includes(state.rankingDivision))state.rankingDivision=divisions[0]||'';
  const tabs=$('#rankingTabs');
  if(tabs)tabs.innerHTML=divisions.map(name=>'<button type="button" data-div="'+esc(name)+'" class="'+(name===state.rankingDivision?'active':'')+'">'+esc(name.toUpperCase())+'</button>').join('');
  for(const selector of ['#championForm [name="division"]','#scheduleBoutForm [name="belt"]','#editScheduledBoutForm [name="belt"]']){
    const el=$(selector);if(!el)continue;
    const current=el.value;
    el.innerHTML=(selector.includes('belt')?'<option value="">NON-TITLE FIGHT / TBA</option>':'')+(selector==='#championForm [name="division"]'?['UCS Offline',...divisions]:divisions).map(name=>'<option value="'+esc(name)+'">'+esc(name.toUpperCase())+'</option>').join('');
    if(divisions.includes(current)||(!current&&selector.includes('belt')))el.value=current;
  }
  const simRemove=$('#ucsRemoveSimDivision');if(simRemove)simRemove.classList.toggle('hidden',!(Array.isArray(state.settings.ranking_divisions)&&state.settings.ranking_divisions.includes('UCS SIM World')));
  const list=$('#ucsDivisionAdminList');
  if(list)list.innerHTML=divisions.length?divisions.map(name=>{
    const fixed=name==='UCS World'||name==='UCS International';
    const region=ucsDivisionRegion(name);
    const options=['ALL','EU','NA'].map(v=>'<option value="'+v+'" '+(v===region?'selected':'')+'>'+(v==='ALL'?'ALL FIGHTERS':v+' FIGHTERS ONLY')+'</option>').join('');
    return '<div class="ucs-division-manager-row"><strong>'+esc(name.toUpperCase())+'</strong><div class="ucs-division-actions">'+(fixed?'<small>OPEN TO EVERYONE</small>':'<button type="button" class="mini-action" data-edit-ucs-division="'+esc(name)+'">EDIT</button><button type="button" class="mini-action danger" data-remove-ucs-division="'+esc(name)+'">REMOVE</button>')+'</div>'+(fixed?'':'<label class="ucs-division-region-editor hidden" data-ucs-region-editor="'+esc(name)+'">REGION <select data-ucs-division-region="'+esc(name)+'">'+options+'</select><small>EU / NA FIGHTERS WILL APPEAR IN THIS DIVISION AUTOMATICALLY.</small></label>')+'</div>';
  }).join(''):'<p>NO DIVISIONS ADDED YET.</p>';
}
async function ucsSaveDivisions(divisions){
  if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const {error}=await db.from('league_settings').upsert({key:'ranking_divisions',value:divisions,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error)return toast('Could not save divisions: '+error.message,true);
  await loadPublicData();
  toast('RANKING DIVISIONS UPDATED.');
}
$('#ucsAddDivisionForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!state.isAdmin)return;
  const form=e.currentTarget,name=String(new FormData(form).get('division_name')||'').trim().replace(/\\s+/g,' ');
  if(name.length<3||name.length>60)return toast('Division name must be 3–60 characters.',true);
  const divisions=ucsDivisions();
  if(divisions.some(d=>d.toLowerCase()===name.toLowerCase()))return toast('Division already exists.',true);
  if(divisions.length>=40)return toast('Maximum 40 divisions.',true);
  await ucsSaveDivisions([...divisions,name]);form.reset();
});
$('#ucsDivisionAdminList')?.addEventListener('change',async e=>{
  const select=e.target.closest('[data-ucs-division-region]');
  if(!select||!state.isAdmin||!db)return;
  const name=select.dataset.ucsDivisionRegion,region=select.value;
  if(['UCS World','UCS International'].includes(name)||!ucsDivisions().includes(name)||!['ALL','EU','NA'].includes(region))return;
  const champion=state.champions.find(c=>c.division===name&&c.fighter_id);
  if(champion&&region!=='ALL'&&ucsFighterRegion(fighterById(champion.fighter_id))!==region){toast('Vacate the champion before restricting this division.',true);ucsRenderDivisions();return;}
  if(state.scheduledBouts.some(b=>b.belt===name&&region!=='ALL'&&![b.fighter_a_id,b.fighter_b_id].every(id=>ucsFighterRegion(fighterById(id))===region))){toast('Update scheduled title fights before restricting this division.',true);ucsRenderDivisions();return;}
  const next={...(state.settings.division_regions||{}),[name]:region};
  const {error}=await db.from('league_settings').upsert({key:'division_regions',value:next,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error){toast(error.message,true);ucsRenderDivisions();return;}
  await loadPublicData();toast(name.toUpperCase()+' ELIGIBILITY: '+region);
});
$('#ucsDivisionAdminList')?.addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-ucs-division]');
  if(edit&&state.isAdmin){
    const row=edit.closest('.ucs-division-manager-row'),editor=row?.querySelector('[data-ucs-region-editor]');
    if(editor){editor.classList.toggle('hidden');edit.textContent=editor.classList.contains('hidden')?'EDIT':'CLOSE';}
    return;
  }
  const btn=e.target.closest('[data-remove-ucs-division]');if(!btn||!state.isAdmin)return;
  const name=btn.dataset.removeUcsDivision;
  if(state.champions.some(c=>c.division===name&&c.fighter_id))return toast('Vacate the championship before removing this division.',true);
  if(state.scheduledBouts.some(b=>b.belt===name))return toast('Move or cancel scheduled title bouts before removing this division.',true);
  if(!confirm('REMOVE '+name.toUpperCase()+' FROM UCS RANKINGS? Fighter records will remain unchanged.'))return;
  await ucsSaveDivisions(ucsDivisions().filter(d=>d!==name));
});
async function ucsPopulateFightDetails(){
  const select=$('#ucsFightDetailsSelect'),form=$('#ucsFightDetailsForm');
  if(!select||!form||!db)return;
  const current=select.value;
  select.innerHTML='<option value="">LOADING COMPLETED FIGHTS...</option>';
  const {data,error}=await db.from('results').select('*').order('event_date',{ascending:false}).limit(1000);
  if(error){select.innerHTML='<option value="">COULD NOT LOAD FIGHTS</option>';toast('Fight details: '+error.message,true);return;}
  state.fightDetailsResults=data||[];
  select.innerHTML='<option value="">SELECT COMPLETED FIGHT ('+state.fightDetailsResults.length+')</option>'+state.fightDetailsResults.map(r=>{
    const winner=fighterById(r.winner_id),loser=fighterById(r.loser_id);
    return '<option value="'+esc(r.id)+'">'+esc(winner?.name||'UNKNOWN')+' W vs '+esc(loser?.name||'UNKNOWN')+' · '+esc(fmtDate(r.event_date))+'</option>';
  }).join('');
  if(state.fightDetailsResults.some(r=>r.id===current))select.value=current;
  const titles=ucsDivisions();
  const chosen=form.elements.fight_title.value;
  form.elements.fight_title.innerHTML='<option value="">REGULAR FIGHT — NO TITLE</option>'+titles.map(n=>'<option value="'+esc(n)+'">'+esc(n.toUpperCase())+' CHAMPIONSHIP</option>').join('');
  if(titles.includes(chosen))form.elements.fight_title.value=chosen;
  ucsFillFightDetails();
}
function ucsFillFightDetails(){
  const form=$('#ucsFightDetailsForm');if(!form)return;
  const r=(state.goodWinResults||state.fightDetailsResults||state.results).find(x=>x.id===form.elements.result_id.value);
  if(!r){form.elements.fight_description.value='';form.elements.fight_title.value='';return;}
  const title=r.fight_title||r.belt||'';
  if(title&&![...form.elements.fight_title.options].some(o=>o.value===title)){
    const option=document.createElement('option');option.value=title;option.textContent=title.toUpperCase()+' CHAMPIONSHIP';form.elements.fight_title.append(option);
  }
  form.elements.fight_title.value=title;
  form.elements.fight_description.value=r.fight_description||'';
}
$('#ucsFightDetailsSelect')?.addEventListener('change',ucsFillFightDetails);
$('#ucsFightDetailsForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('UCS admin required.',true);
  const form=e.currentTarget,d=new FormData(form),id=d.get('result_id');
  if(!(state.goodWinResults||state.fightDetailsResults||state.results).some(r=>r.id===id))return toast('Select a completed fight.',true);
  const payload={fight_title:d.get('fight_title')||null,fight_description:String(d.get('fight_description')||'').trim()||null};
  const {error}=await db.from('results').update(payload).eq('id',id);
  if(error)return toast(error.message,true);
  await loadPublicData();toast('FIGHT DETAILS SAVED TO BOTH FIGHTER PROFILES.');
});
$('#ucsMatcherinoVerificationForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const d=new FormData(e.currentTarget),id=d.get('fighter_id');
  if(!fighterById(id))return toast('Select a fighter.',true);
  const {error}=await db.from('fighters').update({matcherino_verified:d.get('matcherino_verified')==='true'}).eq('id',id);
  if(error)return toast(error.message,true);
  await loadPublicData();toast('MATCHERINO VERIFICATION UPDATED.');
});
async function ucsPopulateGoodWins(){
  const el=$('#ucsGoodWinSelect');if(!el||!db)return;
  const current=el.value;
  el.innerHTML='<option value="">LOADING COMPLETED FIGHTS...</option>';
  const {data,error}=await db.from('results').select('*').order('event_date',{ascending:false}).limit(1000);
  if(error){
    el.innerHTML='<option value="">ERROR LOADING FIGHTS — RETRY</option>';
    toast('Good win fights: '+error.message,true);return;
  }
  const rows=data||[];
  state.goodWinResults=rows;
  el.innerHTML='<option value="">SELECT COMPLETED FIGHT ('+rows.length+')</option>'+rows.map(r=>{
    const winner=fighterById(r.winner_id),loser=fighterById(r.loser_id);
    return '<option value="'+esc(r.id)+'">'+esc(winner?.name||'UNKNOWN')+' BEAT '+esc(loser?.name||'UNKNOWN')+' · '+esc(fmtDate(r.event_date))+(r.is_good_win?' ★ GOOD WIN':'')+'</option>';
  }).join('');
  if(rows.some(r=>r.id===current))el.value=current;
  ucsFillGoodWin();
}
function ucsFillGoodWin(){
  const form=$('#ucsGoodWinForm');if(!form)return;
  const r=(state.goodWinResults||state.fightDetailsResults||state.results).find(x=>x.id===form.elements.result_id.value);
  form.elements.is_good_win.value=r?.is_good_win?'true':'false';
}
$('#ucsGoodWinSelect')?.addEventListener('change',ucsFillGoodWin);
$('#ucsGoodWinSelect')?.addEventListener('focus',()=>{if(!state.goodWinResults?.length)ucsPopulateGoodWins();});
$('#ucsGoodWinForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const d=new FormData(e.currentTarget),id=d.get('result_id');
  if(!(state.fightDetailsResults||state.results).some(r=>r.id===id))return toast('Select a completed fight.',true);
  const {error}=await db.from('results').update({is_good_win:d.get('is_good_win')==='true'}).eq('id',id);
  if(error)return toast(error.message,true);
  const rank=await db.rpc('recalculate_ucs_rankings');
  if(rank.error)return toast('Win saved but ranking update failed: '+rank.error.message,true);
  await loadPublicData();toast('GOOD WIN AND RANKINGS UPDATED.');
});
function renderTitleHistory(){
 const box=$('#ucsTitleHistory');if(!box)return;
 const entries=[];
 for(const r of state.results||[]){const title=r.belt||r.fight_title;if(!title||/^(none|regular|no title)$/i.test(String(title)))continue;
 entries.push({date:r.event_date||r.created_at,type:'TITLE CONTESTED · WON',title,detail:(fighterById(r.winner_id)?.name||'Winner')+' defeated '+(fighterById(r.loser_id)?.name||'Opponent')});}
 for(const c of state.champions||[]){if(c.fighter_id&&c.granted_at)entries.push({date:c.granted_at,type:'TITLE AWARDED',title:c.division,detail:(fighterById(c.fighter_id)?.name||'Champion')+' awarded title'});}
 for(const b of state.scheduledBouts||[]){if(b.belt&&!b.is_title_eliminator&&['scheduled','confirmed','upcoming'].includes(String(b.status||'').toLowerCase()))entries.push({date:b.bout_date||b.created_at,type:'TITLE CONTEST SCHEDULED',title:b.belt,detail:(fighterById(b.fighter_a_id)?.name||'TBA')+' vs '+(fighterById(b.fighter_b_id)?.name||'TBA')});}
 entries.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 const form=$('#ucsTitleFilters');
 if(form){
 const divisions=[...new Set(entries.map(e=>String(e.title)))].sort();
 const years=[...new Set(entries.map(e=>String(e.date||'').slice(0,4)).filter(x=>/^\\d{4}$/.test(x)))].sort().reverse();
 const sync=(select,values,first)=>{const value=select.value;select.innerHTML='<option value="">'+first+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');select.value=values.includes(value)?value:'';};
 sync(form.elements.division,divisions,'All titles');sync(form.elements.year,years,'All years');
 }
 const filtered=entries.filter(e=>!form||(!form.elements.division.value||e.title===form.elements.division.value)&&(!form.elements.status.value||e.type===form.elements.status.value)&&(!form.elements.year.value||String(e.date||'').startsWith(form.elements.year.value))&&(!form.elements.fighter.value||e.detail.toLowerCase().includes(form.elements.fighter.value.trim().toLowerCase())));
 if($('#ucsTitleCount'))$('#ucsTitleCount').textContent=filtered.length+' title event'+(filtered.length===1?'':'s');
 box.innerHTML=filtered.length?filtered.map(e=>'<article style="padding:18px 4px;border-bottom:1px solid #333"><small style="color:#e0b341">'+esc(e.type)+'</small><h3>'+esc(e.title)+'</h3><p>'+esc(e.detail)+'</p><small>'+esc(String(e.date||'Date unavailable').slice(0,10))+'</small></article>').join(''):empty('No title events recorded yet.');
}
$('#ucsTitleFilters')?.addEventListener('submit',e=>{e.preventDefault();renderTitleHistory();});
$('#ucsTitleFilters')?.addEventListener('reset',()=>setTimeout(renderTitleHistory,0));
function ucsGuestFollowIds(){try{return JSON.parse(localStorage.getItem('ucs_guest_following')||'[]')}catch{return []}}
function ucsSaveGuestFollows(ids){localStorage.setItem('ucs_guest_following',JSON.stringify(ids));}
async function ucsRenderCommunity(){
 const most=$('#ucsMostFollowed');if(!most||!db)return;
 const line=(f,right)=>'<div style="display:flex;align-items:center;gap:10px;padding:12px 2px;border-bottom:1px solid #303036">'+ucsFlagHtml(f.region)+avatarHtml(f)+'<strong style="flex:1">'+esc(f.name)+'</strong><span>'+right+'</span></div>';
 const {data:counts}=await db.from('ucs_fighter_follows').select('fighter_id,follow_clicks').order('follow_clicks',{ascending:false}).limit(10);
 most.innerHTML=(counts||[]).map((x,i)=>{const f=fighterById(x.fighter_id);return f?line(f,'#'+(i+1)+' · '+Number(x.follow_clicks).toLocaleString()):''}).join('')||'No follows yet';
 const {data:trending}=await db.rpc('ucs_follow_trending');
 const trend=$('#ucsFollowTrending');if(trend)trend.innerHTML=(trending||[]).map(x=>{const f=fighterById(x.fighter_id);return f?line(f,'+'+Number(x.follow_count).toLocaleString()):''}).join('')||'No new follows in the past 24 hours';
 const ids=ucsGuestFollowIds(),following=$('#ucsGuestFollowing');
 if(following)following.innerHTML=ids.map(id=>{const f=fighterById(id);return f?line(f,'<button type="button" data-ucs-unfollow="'+esc(id)+'">Unfollow</button>'):''}).join('')||'No fighters followed on this browser yet.';
 const timeline=$('#ucsFollowingTimeline');
 if(timeline){const items=(state.results||[]).filter(r=>ids.includes(r.winner_id)||ids.includes(r.loser_id)).sort((a,b)=>String(b.event_date||'').localeCompare(String(a.event_date||''))).slice(0,10);timeline.innerHTML=items.map(r=>'<div style="padding:10px;border-bottom:1px solid #333">'+esc(fighterById(r.winner_id)?.name||'Fighter')+' defeated '+esc(fighterById(r.loser_id)?.name||'Fighter')+' · '+esc(r.event_date||'')+'</div>').join('')||'No recent recorded fights from followed fighters.';}
}
$('#ucsGuestFollowing')?.addEventListener('click',e=>{const id=e.target.closest('[data-ucs-unfollow]')?.dataset.ucsUnfollow;if(!id)return;ucsSaveGuestFollows(ucsGuestFollowIds().filter(x=>x!==id));ucsRenderCommunity();});
function ucsP4pGuestId(){let id=localStorage.getItem('ucs_p4p_guest_id');if(!id){id=crypto.randomUUID();localStorage.setItem('ucs_p4p_guest_id',id);}return id;}
function ucsP4pChoices(){try{return JSON.parse(localStorage.getItem('ucs_p4p_choices')||'[]')}catch{return []}}
function ucsP4pSave(ids){localStorage.setItem('ucs_p4p_choices',JSON.stringify(ids));}
function ucsRenderP4p(){
 const root=$('#ucsP4pChoices');if(!root)return;
 const ids=ucsP4pChoices().filter(id=>fighterById(id)).slice(0,10);
 const options=[...state.fighters].filter(f=>f.active!==false&&!ids.includes(f.id)).sort((a,b)=>a.name.localeCompare(b.name));
 root.innerHTML=ids.map((id,i)=>{const f=fighterById(id);return '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #34343a"><strong>#'+(i+1)+'</strong>'+avatarHtml(f)+'<strong>'+esc(f.name)+'</strong><span style="margin-left:auto"><button type="button" data-p4p-up="'+i+'">↑</button> <button type="button" data-p4p-down="'+i+'">↓</button> <button type="button" data-p4p-remove="'+i+'">×</button></span></div>'}).join('')+
 (ids.length<10?'<label style="display:block;margin:15px 0">Add fighter <select id="ucsP4pAdd"><option value="">Select fighter</option>'+options.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join('')+'</select></label>':'');
}
$('#ucsP4pChoices')?.addEventListener('change',e=>{if(e.target.id!=='ucsP4pAdd'||!e.target.value)return;ucsP4pSave([...ucsP4pChoices(),e.target.value].slice(0,10));ucsRenderP4p();});
$('#ucsP4pChoices')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const ids=ucsP4pChoices();let i=Number(b.dataset.p4pUp??b.dataset.p4pDown??b.dataset.p4pRemove);if(b.hasAttribute('data-p4p-remove'))ids.splice(i,1);else{const n=b.hasAttribute('data-p4p-up')?i-1:i+1;if(n<0||n>=ids.length)return;[ids[i],ids[n]]=[ids[n],ids[i]];}ucsP4pSave(ids);ucsRenderP4p();});
$('#ucsSubmitP4p')?.addEventListener('click',async()=>{const ids=ucsP4pChoices();if(!ids.length)return;const {error}=await db.rpc('ucs_submit_p4p',{p_voter_id:ucsP4pGuestId(),p_fighter_ids:ids});$('#ucsP4pMessage').textContent=error?'Could not submit: '+error.message:'Your P4P vote has been counted!';});
$('#ucsP4pVoteTab')?.addEventListener('click',()=>{$('#ucsP4pVoting').classList.remove('hidden');$('#ucsP4pResults').classList.add('hidden');});
$('#ucsP4pResultsTab')?.addEventListener('click',async()=>{$('#ucsP4pVoting').classList.add('hidden');$('#ucsP4pResults').classList.remove('hidden');const {data,error}=await db.rpc('ucs_p4p_standings');$('#ucsP4pResults').innerHTML=error?'Unable to load results':(data||[]).map((x,i)=>'<div style="padding:12px;border-bottom:1px solid #333">#'+(i+1)+' '+esc(fighterById(x.fighter_id)?.name||'Fighter')+' · '+Number(x.points)+' points · '+Number(x.votes)+' votes</div>').join('')||'No votes yet.';});
function renderAll(){ ucsRenderCommunity(); ucsRenderP4p(); renderTitleHistory(); ucsRenderDivisions(); ucsPopulateGoodWins(); ucsPopulateFightDetails(); ucsRenderEventCards(); renderTaleOfTheTape(); renderHome(); renderRanks($('#fighterSearch')?.value||''); renderBets(); renderEvents(); populateFighterSelects(); populateFighterDetailsEditor(); ucsRenderEarnings(); populateScheduledBoutSelect(); populateConcludeScheduledBoutSelect(); renderAdminRows(); renderNewsTagOptions(); renderNews(); renderPhotoGallery(); renderTopEarners(); updateAccountUI(); }

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
  const championIds=new Set(state.champions.filter(c=>c.fighter_id).map(c=>String(c.fighter_id)));
  const ranked=[...state.fighters].filter(f=>f.active!==false&&!championIds.has(String(f.id)))
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
    <div class="ucs-marquee-versus">${side(pair.a,'RED CORNER')}<div class="ucs-marquee-middle"><small>UCS</small><strong class="ucs-red-vs-logo" role="img" aria-label="VS"></strong><span>AI-STYLE MATCHUP PICK</span></div>${side(pair.b,'BLUE CORNER')}</div>
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
  // Prefer an explicitly featured pairing, falling back to the next scheduled bout.
  const scheduled=state.scheduledBouts||[];
  const selectedBout=scheduled.find(b=>
      (b.fighter_a_id===featured.champion_id&&b.fighter_b_id===featured.challenger_id)||
      (b.fighter_b_id===featured.champion_id&&b.fighter_a_id===featured.challenger_id))||null;
  const hasFeature=Boolean(fighterById(featured.champion_id)&&fighterById(featured.challenger_id));
  const bout=selectedBout||(!hasFeature?scheduled[0]||null:null);
  const left=fighterById(hasFeature?featured.champion_id:bout?.fighter_a_id);
  const right=fighterById(hasFeature?featured.challenger_id:bout?.fighter_b_id);
  const imageHtml=f=>f?.avatar_url&&safeHttps(f.avatar_url)
    ?`<img src="${esc(f.avatar_url)}" alt="" loading="lazy">`
    :`<span>${esc(initials(f?.name||'UCS'))}</span>`;
  $('#featuredChampionImage').innerHTML=imageHtml(left);
  $('#featuredChallengerImage').innerHTML=imageHtml(right);
  $('#featuredChampion').textContent=left?.name||'TBA';
  $('#featuredChampionMeta').textContent=left?`${record(left)} · ${left.platform||'UCS'}`:'Fighter to be announced';
  $('#featuredChallenger').textContent=right?.name||'TBA';
  $('#featuredChallengerMeta').textContent=right?`${record(right)} · ${right.platform||'UCS'}`:'Fighter to be announced';
  const belt=bout?.belt||null;
  const champions=state.champions||[];
  const role=f=>f&&champions.some(c=>c.fighter_id===f.id)?'UCS CHAMPION':'CONTENDER';
  $('#featuredChampionRole').textContent=role(left);
  $('#featuredChallengerRole').textContent=role(right);
  $('#featuredFightTag').textContent=belt?'CHAMPIONSHIP FIGHT':'MAIN EVENT';
  $('#featuredFightType').textContent=belt?`🏆 ${belt} TITLE`:'OFFICIAL MATCHUP';
  $('#featuredFightEvent').textContent=bout?.event_name||featured.event_label||'UCS MAIN EVENT';
  $('#featuredFightDate').textContent=bout?.bout_date?fmtDate(bout.bout_date):'DATE TO BE ANNOUNCED';

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
  const platform=['UCS PS5','UCS PC','UCS XBOX'].includes(state.rankingDivision)?state.rankingDivision.replace('UCS ',''):null;
  const championIds=new Set(state.champions.filter(c=>c.fighter_id&&c.division===state.rankingDivision).map(c=>String(c.fighter_id)));
  const rows=state.fighters.filter(f=>!championIds.has(String(f.id))&&f.name.toLowerCase().includes(filter.toLowerCase())&&(state.rankingDivision!=='UCS SIM World'||f.sim_division===true)&&(!platform||(f.platform||'').toUpperCase()===platform)&&ucsEligibleForDivision(f,state.rankingDivision));
  $('#rankRows').innerHTML=rows.length?rows.map((f,i)=>`<tr class="fighter-rank-row" data-fighter-profile="${f.id}" tabindex="0"><td><span class="rank-number">${i+1}</span></td><td class="rank-name"><div class="rank-fighter-cell">${avatarHtml(f)}<div><strong>${ucsFlagHtml(f.region)}${esc(f.name)}</strong><span>${esc(record(f))} · ${esc(f.platform||'UNASSIGNED')}</span></div></div></td><td>${chip(f.resume)}</td><td>${chip(f.momentum)}</td><td>${chip(f.finishing)}</td><td>${chip(f.activity)}</td><td>${chip(f.big_fight)}</td><td class="overall">${Number(f.score||0).toFixed(1)}</td></tr>`).join(''):`<tr><td colspan="8">${empty(`No ${state.rankingDivision} fighters in the database yet.`)}</td></tr>`;
  renderRankingChampion();
}
function renderRankingTitleFights(){
  const box=$('#ucsRankingsTitleFights');
  if(!box)return;
  const division=state.rankingDivision;
  const bouts=(state.scheduledBouts||[]).filter(b=>b.status!=='cancelled'&&b.belt===division);
  if(!bouts.length){box.innerHTML='';box.classList.add('hidden');return;}
  box.classList.remove('hidden');
  const face=(fighter,portrait)=>safeHttps(portrait)?`<img class="ucs-title-contender-avatar ucs-title-portrait" src="${esc(portrait)}" alt="${esc(fighter?.name||'Fighter')} bout portrait" loading="lazy">`:fighter?avatarHtml(fighter,'ucs-title-contender-avatar'):'<span class="ucs-title-contender-avatar ucs-title-avatar-placeholder">?</span>';
  box.innerHTML=bouts.map(b=>{
    const left=fighterById(b.fighter_a_id),right=fighterById(b.fighter_b_id);
    const date=b.bout_date?fmtDate(b.bout_date):'DATE TO BE ANNOUNCED';
    const titleBelt=ucsBeltArt(b.belt);
    const name=f=>esc(f?.name||'FIGHTER TBA');
    const contender=(f,portrait)=>`<button type="button" class="ucs-title-contender" data-title-fighter="${esc(f?.id||'')}" ${f?'':'disabled'} aria-label="View ${name(f)} fighter profile">
      ${face(f,portrait)}<span class="ucs-title-contender-copy"><strong>${name(f)}</strong><small>${f?esc(record(f)):'TO BE ANNOUNCED'}</small></span>
    </button>`;
    return `<article class="ucs-rank-title-match" aria-label="${esc(division)} championship fight">
      <header class="ucs-rank-title-heading"><span>${b.is_title_eliminator?'★ TITLE ELIMINATOR':'★ TITLE ON THE LINE'}</span><strong>${esc(division.toUpperCase())} ${b.is_title_eliminator?'TITLE ELIMINATOR':'CHAMPIONSHIP'}</strong></header>
      <div class="ucs-rank-title-fighters">${contender(left,b.fighter_a_bout_image)}<div class="ucs-rank-title-versus">${titleBelt?`<img class="ucs-title-belt-art" src="${esc(titleBelt)}" alt="${esc(b.belt)} championship belt">`:``}<span>${b.is_title_eliminator?'ELIMINATOR':'CHAMPIONSHIP'}</span><strong class="ucs-red-vs-logo" role="img" aria-label="VS"></strong><small>${esc(date)}</small></div>${contender(right,b.fighter_b_bout_image)}</div>
      <footer class="ucs-rank-title-footer"><span>${esc(b.event_name||'UCS FIGHT NIGHT')} · ${b.is_title_eliminator?'TITLE ELIMINATOR':'SCHEDULED TITLE FIGHT'}</span></footer>
    </article>`;
  }).join('');
}
$('#ucsRankingsTitleFights')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-title-fighter]');
  if(button?.dataset.titleFighter)openFighterProfile(button.dataset.titleFighter);
});
function ucsBeltArt(division){const art=state.settings?.championship_belt_art||{};const key=division==='UCS World'?'world':division==='UCS International'?'international':division==='UCS EU Division'?'eu':division==='UCS SIM World'?'sim_world':division.toLowerCase().replace(/^ucs\s*/,'').replace(/[^a-z0-9]+/g,'_');const url=art[key];return safeHttps(url)?url:null;}
function renderRankingChampion(){
  const c=state.champions.find(x=>x.division===state.rankingDivision&&x.fighter_id);
  const offlineChampion=state.rankingDivision==='UCS Offline'?fighterById(String(state.settings?.ucs_offline_champion||'2082db51-ad83-48fd-baef-9d980475c1f9')):null;
  const f=offlineChampion||(c&&fighterById(c.fighter_id));
  if(!$('#worldChampionBanner')) return;
  $('#worldChampionBanner').classList.toggle('ucs-banner-with-belt',Boolean(ucsBeltArt(state.rankingDivision)));
  $('#worldChampionBanner').style.setProperty('--ucs-belt-image',ucsBeltArt(state.rankingDivision)?`url("${ucsBeltArt(state.rankingDivision)}")`:'none');
  $('#worldChampionBanner').innerHTML=f
    ? `<small>#C · ${esc(state.rankingDivision.toUpperCase())} CHAMPION</small><div class="champion-inline">${avatarHtml(f,'champion-avatar')}<div><strong>${esc(f.name)}</strong><span>${esc(record(f))} · ${offlineChampion?0:(c?.defenses||0)} title defenses</span></div></div>`
    : `<small>${esc(state.rankingDivision.toUpperCase())} CHAMPION</small><strong>VACANT</strong><span>No champion assigned</span>`;
  renderRankingTitleFights();
}

let ucsHomeChampionIndex=0;
function ucsHomeChampionSlides(){
  const divisions=['UCS World','UCS International',...ucsDivisions().filter(d=>!['UCS World','UCS International'].includes(d))];
  return divisions.map(division=>{
    const champ=state.champions.find(c=>c.division===division&&c.fighter_id);
    const fighter=champ&&fighterById(champ.fighter_id);
    return {division,champ,fighter};
  }).filter(x=>x.fighter);
}
function ucsRenderHomeChampion(){
  const image=$('#ucsHomeChampionImage'),details=$('#ucsHomeChampionDetails'),dots=$('#ucsChampionDots');
  if(!image||!details||!dots)return;
  const slides=ucsHomeChampionSlides();
  const root=$('.ucs-home-champions');
  root?.classList.toggle('hidden',!slides.length);
  if(!slides.length)return;
  ucsHomeChampionIndex=(ucsHomeChampionIndex+slides.length)%slides.length;
  const {division,champ,fighter}=slides[ucsHomeChampionIndex];
  const picture=[champ?.showcase_image_url,fighter?.avatar_url,fighter?.profile_image_url].find(url=>safeHttps(url));
  const flag=champ?.showcase_flag||'';
  const belt=ucsBeltArt(division);
  image.parentElement?.style.setProperty('--ucs-home-belt',belt?`url("${belt}")`:'none');
  image.parentElement?.classList.toggle('ucs-home-has-belt',!!belt);
  const record=Number(fighter.wins||0)+'-'+Number(fighter.losses||0)+'-'+Number(fighter.draws||0);
  const defenses=Number(champ?.defenses||0);
  const total=Number(fighter.wins||0)+Number(fighter.losses||0)+Number(fighter.draws||0);
  const winRate=total?Math.round(Number(fighter.wins||0)/total*100):0;
  image.innerHTML=picture?'<img src="'+esc(picture)+'" alt="'+esc(fighter.name)+' champion portrait">':'<span class="ucs-home-champion-silhouette">♛</span>';
  details.innerHTML='<span class="ucs-home-champion-division">'+esc(division.toUpperCase())+' · UCS CHAMPION</span><h3>'+esc(fighter.name)+'</h3><div class="ucs-home-champion-record">OFFICIAL RECORD · '+esc(record)+(flag?' <span>'+esc(flag)+'</span>':'')+'</div><div class="ucs-home-champion-stats"><div><small>TITLE DEFENSES</small><strong>'+defenses+'</strong></div><div><small>WIN RATE</small><strong>'+winRate+'%</strong></div><div><small>WINS</small><strong>'+Number(fighter.wins||0)+'</strong></div></div><button type="button" class="ucs-home-champion-profile" data-spotlight-profile="'+esc(fighter.id)+'">VIEW FIGHTER PROFILE →</button>';
  dots.innerHTML=slides.map((x,i)=>'<button type="button" data-champion-slide="'+i+'" aria-label="Show '+esc(x.fighter.name)+'" aria-current="'+(i===ucsHomeChampionIndex)+'" class="'+(i===ucsHomeChampionIndex?'active':'')+'"></button>').join('');
}
function ucsMoveHomeChampion(step){ucsHomeChampionIndex+=step;ucsRenderHomeChampion();}
$('#ucsChampionPrev')?.addEventListener('click',()=>ucsMoveHomeChampion(-1));
$('#ucsChampionNext')?.addEventListener('click',()=>ucsMoveHomeChampion(1));
$('#ucsChampionDots')?.addEventListener('click',e=>{const b=e.target.closest('[data-champion-slide]');if(!b)return;ucsHomeChampionIndex=Number(b.dataset.championSlide);ucsRenderHomeChampion();});
$('#ucsHomeChampionDetails')?.addEventListener('click',e=>{const b=e.target.closest('[data-spotlight-profile]');if(b)openFighterProfile(b.dataset.spotlightProfile);});
let ucsChampionTouchStart=null;
$('.ucs-home-champions-stage')?.addEventListener('touchstart',e=>{ucsChampionTouchStart=e.touches[0]?.clientX??null},{passive:true});
$('.ucs-home-champions-stage')?.addEventListener('touchend',e=>{if(ucsChampionTouchStart===null)return;const delta=(e.changedTouches[0]?.clientX??ucsChampionTouchStart)-ucsChampionTouchStart;if(Math.abs(delta)>45)ucsMoveHomeChampion(delta<0?1:-1);ucsChampionTouchStart=null},{passive:true});

function ucsChampionFlagHtml(flag){
  const raw=String(flag||'').trim();
  if(!raw)return '';
  const names={UK:'gb',GB:'gb',ENGLAND:'gb',US:'us',USA:'us',MX:'mx',MEXICO:'mx',CA:'ca',CANADA:'ca',IE:'ie',IRELAND:'ie',AU:'au',AUSTRALIA:'au',FR:'fr',FRANCE:'fr',DE:'de',GERMANY:'de',ES:'es',SPAIN:'es',IT:'it',ITALY:'it',NL:'nl',NETHERLANDS:'nl',BR:'br',BRAZIL:'br',JP:'jp',JAPAN:'jp',PH:'ph',PHILIPPINES:'ph',NZ:'nz',NG:'ng',NIGERIA:'ng'};
  const chars=[...raw];
  const emojiCode=chars.length===2&&chars.every(c=>c.codePointAt(0)>=0x1f1e6&&c.codePointAt(0)<=0x1f1ff)?chars.map(c=>String.fromCharCode(c.codePointAt(0)-0x1f1e6+65)).join('').toLowerCase():null;
  const code=emojiCode||names[raw.toUpperCase()]||( /^[a-z]{2}$/i.test(raw)?raw.toLowerCase():null);
  return code?`<img class="ucs-flag-image" src="https://flagcdn.com/w80/${code}.png" alt="${esc(raw)} flag" loading="lazy">`:`<span>${esc(raw)}</span>`;
}
function renderChampionShowcase(){
  const root=$('#ucsChampionShowcase');if(!root)return;
  const ordered=['UCS World','UCS International',...ucsDivisions().filter(d=>!['UCS World','UCS International'].includes(d))];
  const offlineId=String(state.settings?.ucs_offline_champion||'2082db51-ad83-48fd-baef-9d980475c1f9');
  const offlineFighter=fighterById(offlineId);
  const offlinePhoto=offlineFighter?[state.settings?.ucs_offline_champion_image,offlineFighter.showcase_image_url,offlineFighter.avatar_url,offlineFighter.profile_image_url].find(safeHttps):null;
  const offlineCard=`<article class="ucs-champ-showcase-card ${offlineFighter?'':'ucs-champ-vacant'} ucs-offline-champion-card" ${offlineFighter?`role="button" tabindex="0" data-champ-profile="${esc(offlineFighter.id)}" aria-label="View ${esc(offlineFighter.name)} profile"`:''}>
    <span class="ucs-champ-showcase-division">UCS OFFLINE</span><span class="ucs-champ-vertical" aria-hidden="true">OFFLINE</span>
    ${offlinePhoto?`<img src="${esc(offlinePhoto)}" alt="${esc(offlineFighter.name)} portrait" loading="lazy">`:'<div class="ucs-champ-silhouette" aria-hidden="true"><span>♛</span></div>'}
    <div class="ucs-champ-showcase-info">${offlineFighter?'<small>♛ OFFLINE CHAMPION</small>':'<small>OFFLINE TITLE AVAILABLE</small>'}<div class="ucs-champ-name-line"><strong>${offlineFighter?esc(offlineFighter.name):'VACANT'}</strong></div></div>
  </article>`;
  root.innerHTML=ordered.map(division=>{
    const champ=state.champions.find(c=>c.division===division&&c.fighter_id);
    const fighter=champ&&fighterById(champ.fighter_id);
    const photo=champ&&safeHttps(champ.showcase_image_url)?champ.showcase_image_url:null;
    const beltArt=ucsBeltArt(division);
    const flag=champ?.showcase_flag||'';
    const portraitY=Number.isFinite(+champ?.portrait_y)?Math.min(100,Math.max(0,+champ.portrait_y)):50;
    const headOffset=(portraitY-50)*1.5+18;
    const recentForm=fighter?fighterForm(fighter):'—';
    const letters=recentForm==='—'?('W'.repeat(Math.min(5,Math.max(0,Number(fighter?.wins)||0)))+'L'.repeat(Math.min(5,Math.max(0,Number(fighter?.losses)||0)))).slice(0,5):recentForm;
    const boxes=letters.split('').map(letter=>`<span class="ucs-champ-form-box ucs-champ-form-${letter==='W'?'win':letter==='L'?'loss':'draw'}">${esc(letter)}</span>`).join('');
    const wins=Math.max(0,Math.min(40,Number(fighter?.wins)||0));
    const losses=Math.max(0,Math.min(40,Number(fighter?.losses)||0));
    const draws=Math.max(0,Math.min(40,Number(fighter?.draws)||0));
    const form=[...Array(wins).fill('W'),...Array(losses).fill('L'),...Array(draws).fill('D')];
    const recordStrip=fighter?`<div class="ucs-champ-record-strip" aria-label="${wins} wins, ${losses} losses, ${draws} draws">${form.length?form.map(letter=>`<span class="ucs-champ-result ucs-champ-result-${letter.toLowerCase()}">${letter}</span>`).join(''):'<span class="ucs-champ-unbeaten">0-0-0</span>'}</div>`:'';

    return `<article class="ucs-champ-showcase-card ${fighter?'':'ucs-champ-vacant'} ${beltArt?'ucs-champ-with-belt':''}" style="${beltArt?`--ucs-belt-image:url(&quot;${esc(beltArt)}&quot;)`:``}" ${fighter?`role="button" tabindex="0" data-champ-profile="${esc(fighter.id)}" aria-label="View ${esc(fighter.name)} fighter profile"`:''}>
      <span class="ucs-champ-showcase-division">${esc(division.toUpperCase())}</span>
      <span class="ucs-champ-vertical" aria-hidden="true">${esc(division.replace(/^UCS\s*/,'').toUpperCase())}</span>
      ${photo?`<img src="${esc(photo)}" alt="${esc(fighter.name)} boxer portrait" loading="lazy" style="transform:translateY(${headOffset}px)!important">`:`<div class="ucs-champ-silhouette" aria-hidden="true"><span>♟</span></div>`}
      <div class="ucs-champ-showcase-info">${fighter?'<small>♛ CHAMPION</small>':''}<div class="ucs-champ-name-line"><strong>${fighter?esc(fighter.name):'VACANT'}</strong>${flag&&fighter?`<span class="ucs-champ-flag" aria-label="Champion country flag">${ucsChampionFlagHtml(flag)}</span>`:''}${fighter&&boxes?`<div class="ucs-champ-form" aria-label="Fight form: ${esc(letters)}">${boxes}</div>`:''}</div></div>
    </article>`;
  }).join('')+offlineCard;
}
$('#ucsChampionShowcase')?.addEventListener('click',e=>{const card=e.target.closest('[data-champ-profile]');if(card)openFighterProfile(card.dataset.champProfile);});
$('#ucsChampionShowcase')?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-champ-profile]')){e.preventDefault();openFighterProfile(e.target.closest('[data-champ-profile]').dataset.champProfile);}});
$('#fighterSearch')?.addEventListener('input',e=>renderRanks(e.target.value));
$('#rankingTabs')?.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){ $$('#rankingTabs button').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');state.rankingDivision=e.target.dataset.div;renderRanks($('#fighterSearch')?.value||'');}});
$('#rankRows')?.addEventListener('click',e=>{const row=e.target.closest('[data-fighter-profile]');if(row)openFighterProfile(row.dataset.fighterProfile);});
$('#rankRows')?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-fighter-profile]')){e.preventDefault();openFighterProfile(e.target.dataset.fighterProfile);}});

$('#ucsFollowFighter')?.addEventListener('click',async e=>{
 const button=e.currentTarget,id=button.dataset.fighterId;
 if(!id||!db||button.disabled)return;
 button.disabled=true;
 const {data,error}=await db.rpc('ucs_click_follow',{p_fighter_id:id});
 if(error){button.disabled=false;toast('Could not record follow: '+error.message,true);return;}
 const count=$('#ucsFollowCount');if(count)count.textContent=Number(data||0).toLocaleString()+' followers';
 button.textContent='✓ FOLLOWED';ucsSaveGuestFollows([...new Set([...ucsGuestFollowIds(),id])]);ucsRenderCommunity();
});
function openFighterProfile(id){
  const f=fighterById(id); if(!f)return;
  const publicId=$('#ucsPublicFighterIdValue'),copyId=$('#ucsCopyFighterId');
  if(publicId)publicId.textContent=String(f.id);
  if(copyId){copyId.textContent='COPY ID';copyId.onclick=()=>{navigator.clipboard.writeText(String(f.id)).then(()=>{copyId.textContent='COPIED ✓';}).catch(()=>{copyId.textContent='SELECT ID ABOVE';});};}
  const followBtn=$('#ucsFollowFighter'),followCount=$('#ucsFollowCount');
  if(followBtn){followBtn.dataset.fighterId=f.id;followBtn.disabled=ucsGuestFollowIds().includes(String(f.id));followBtn.textContent=followBtn.disabled?'✓ FOLLOWED':'◎ FOLLOW';}
  if(followCount)followCount.textContent='Loading followers…';
  if(db)db.from('ucs_fighter_follows').select('follow_clicks').eq('fighter_id',f.id).maybeSingle().then(({data,error})=>{
    if(!error&&followCount&&followBtn?.dataset.fighterId===String(f.id))followCount.textContent=Number(data?.follow_clicks||0).toLocaleString()+' followers';
  });
  const modal=$('#fighterModal');
  const debutDates=(state.results||[]).filter(r=>r.winner_id===f.id||r.loser_id===f.id).map(r=>r.event_date).filter(Boolean).sort();
  const debutEl=$('#ucsProfileDebut');
  if(debutEl)debutEl.innerHTML='<strong style="margin-right:12px">DEBUT</strong>'+esc(debutDates[0]||'No recorded fights');
  const rank=currentRank(f),titles=state.champions.filter(c=>c.fighter_id===f.id),history=fighterResults(f);
  $('#profileName').textContent=f.name;
  const presence=$('#ucsProfileDiscordPresence');
  if(presence){presence.dataset.fighterId=String(f.id);presence.textContent='⚫ Discord Offline';presence.className='ucs-discord-presence offline';refreshUcsDiscordPresence(f.id);}
  $('#ucsChampionCrownProfile')?.classList.toggle('hidden',!titles.length);
  $('#ucsMatcherinoVerifiedProfile')?.classList.toggle('hidden',!f.matcherino_verified);
  $('#profilePlatform').textContent=`UCS ${f.platform||'WORLD'}`;
  $('#profileRegion').innerHTML=`${ucsFlagHtml(f.region)}${esc(f.region||'Region not set')}`;
  const regionFact=$('#ucsProfileRegionFact');
  if(regionFact)regionFact.innerHTML=`${ucsFlagHtml(f.region)}${f.region||'Not specified'}`;
  const activityLabel=$('#ucsProfileActivity'),activityDetail=$('#ucsProfileActivityDetail');
  const socialLinks=$('#ucsProfileSocialLinks'),matcherino=$('#ucsProfileMatcherino');
  if(activityLabel)activityLabel.textContent='UNKNOWN';
  if(activityDetail)activityDetail.textContent='No Discord activity recorded yet';
  if(socialLinks)socialLinks.textContent='No linked socials yet';
  if(matcherino)matcherino.textContent='';
  if(db)Promise.allSettled([
    db.from('ucs_fighter_activity').select('*').eq('fighter_id',f.id).maybeSingle(),
    db.from('ucs_fighter_socials').select('*').eq('fighter_id',f.id).maybeSingle(),
    db.from('ucs_matcherino_contributions').select('*').eq('fighter_id',f.id).eq('is_upcoming',true)
  ]).then(res=>{
    if(state.ucsCurrentProfile!==f.id)return;
    const activity=res[0].status==='fulfilled'?res[0].value.data:null;
    const times=[activity?.last_message_at,activity?.last_game_at].filter(Boolean).map(x=>Date.parse(x)).filter(Number.isFinite);
    const last=times.length?Math.max(...times):0;
    const status=last?(Date.now()-last<=259200000?'ACTIVE':'INACTIVE'):'UNKNOWN';
    if(activityLabel){activityLabel.textContent=status;activityLabel.style.color=status==='ACTIVE'?'#65db92':status==='INACTIVE'?'#ef7182':'#b7b5bf';}
    if(activityDetail)activityDetail.textContent=last?'Last recorded activity: '+new Date(last).toLocaleString():'No Discord activity recorded yet';
    const socials=res[1].status==='fulfilled'?res[1].value.data:null;
    const names={youtube_url:'YouTube',twitch_url:'Twitch',tiktok_url:'TikTok',instagram_url:'Instagram',x_url:'X'};
    const links=Object.entries(names).filter(([key])=>safeHttps(socials?.[key])).map(([key,name])=>'<a href="'+esc(socials[key])+'" target="_blank" rel="noopener noreferrer">'+name+'</a>');
    if(socialLinks)socialLinks.innerHTML=links.length?links.join(' · '):'No linked socials yet';
    const rows=res[2].status==='fulfilled'?(res[2].value.data||[]):[];
    if(matcherino)matcherino.innerHTML=rows.filter(row=>safeHttps(row.matcherino_url)).map(row=>'<div><a target="_blank" rel="noopener noreferrer" href="'+esc(row.matcherino_url)+'">'+esc(row.title)+'</a></div>').join('');
  });
  const banner=$('#profileBanner'),bannerImage=$('#profileBannerImage');
  const showBanner=Boolean(f.banner_url&&safeHttps(f.banner_url));
  banner?.classList.toggle('hidden',!showBanner);
  if(bannerImage){if(showBanner)bannerImage.src=f.banner_url;else bannerImage.removeAttribute('src');}

  const badge=$('#profileUnderdog'),server=$('#profileServerIcon');
  badge?.classList.toggle('hidden',!f.is_underdog);
  const former=state.formerChampionships.filter(t=>t.fighter_id===f.id&&!titles.some(c=>c.division===t.division));
  const legacy=$('#profileFormerTitles');
  if(legacy){
    legacy.classList.toggle('hidden',!former.length);
    legacy.innerHTML=former.map(t=>`<span class="ucs-former-champion-badge" title="Previously held ${esc(t.division)}">🏅 FORMER ${esc(t.division.toUpperCase())} CHAMPION</span>`).join('');
  }
  if(server){
    const url=f.server_icon_url;
    server.classList.toggle('hidden',!safeHttps(url));
    server.innerHTML=safeHttps(url)?`<img src="${esc(url)}" alt="Server icon" loading="lazy">`:'';
  }
  $('#profileBio').textContent=f.fighter_bio?.trim()||'This fighter has not added a biography yet.';
  $('#profileScoutLabel').textContent=f.is_underdog?'UNDERDOG':(former.length?'FORMER CHAMPION':titles.length?'CHAMPION':'CONTENDER');
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

  $('#profileRank').textContent=titles.length?'#C':(rank?`#${rank}`:'#—');
  $('#ucsDossierWins').textContent=String(f.wins||0);
  $('#ucsDossierLosses').textContent=String(f.losses||0);
  $('#ucsDossierDraws').textContent=String(f.draws||0);
  state.ucsCurrentProfile=f.id;state.ucsRecordTab='pro';
  ucsRenderDossierRecords(f);
  $('#profileRecord').textContent=`${f.wins||0}-${f.losses||0}-${f.draws||0}`;
  $('#profileScore').textContent=Number(f.score||0).toFixed(1);
  $('#profileStreak').textContent=fighterForm(f);
  $('#profileTitles').textContent=String(titles.length);
  const championSpotlight=$('#profileChampionSpotlight');
  championSpotlight?.classList.toggle('hidden',titles.length===0);
  modal.classList.toggle('ucs-is-champion',titles.length>0);
  if(titles.length){
    $('#profileChampionHeading').textContent='titles';
    $('#profileChampionBelts').innerHTML=titles.map(t=>`<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;line-height:1.5"><span aria-hidden="true" style="font-size:14px">🏆</span><span>${esc(t.division)} Championship</span></div>`).join('');
  }else{
    $('#profileChampionBelts').textContent='';
  }
  $('#profileFights').textContent=String((f.wins||0)+(f.losses||0)+(f.draws||0));
  $('#profileEarnings').textContent=ucsFormatEarnings(state.fighterEarnings.get(f.id)||0);
  $('#profileAvatar').innerHTML=f.avatar_url?`<img src="${esc(f.avatar_url)}" alt="${esc(f.name)}">`:`<span>${esc(initials(f.name))}</span>`;
  const metrics=[['Resume',f.resume],['Momentum',f.momentum],['Finishing',f.finishing],['Activity',f.activity],['Big fight',f.big_fight]];
  $('#profileRatingBars').innerHTML=metrics.filter(([label])=>label!=='Activity').map(([label,val])=>`<div class="ucs-reference-meter"><span class="ucs-meter-name">${esc(label)}</span><span class="ucs-meter-track"><span style="width:${Math.max(0,Math.min(100,Number(val||0)*10))}%"></span></span><strong>${Number(val||0).toFixed(1)}</strong></div>`).join('');
  $('#profileFightHistory').innerHTML=history.length?history.slice(0,10).map(r=>{
    const won=r.winner_id===f.id,opp=fighterById(won?r.loser_id:r.winner_id);
    return `<div class="profile-fight-row"><span class="result-pill ${won?'win':'loss'}">${won?'W':'L'}</span><div><strong>vs ${esc(opp?.name||'Unknown')}</strong><small>${esc(r.method)} · ${esc(fmtDate(r.event_date))}</small>${won&&(r.is_good_win||r.is_big_win)?'<div class="ucs-good-win-tag">★ GOOD WIN · RANKINGS BOOST</div>':''}${r.fight_title?`<div class="ucs-result-title">🏆 ${esc(r.fight_title.toUpperCase())} CHAMPIONSHIP</div>`:''}${r.fight_description?`<div class="ucs-result-description">${esc(r.fight_description)}</div>`:''}</div></div>`;
  }).join(''):empty('No official fight history yet.');
  ucsRenderDossierRecords(f);
  // Reference-inspired previous fights table, using official UCS result rows.
  const fightHistoryEl=$('#profileFightHistory');
  if(fightHistoryEl){
    fightHistoryEl.innerHTML=history.length?history.slice(0,10).map(r=>{
      const won=r.winner_id===f.id;
      const opponent=fighterById(won?r.loser_id:r.winner_id);
      const method=String(r.method||'—');
      const date=r.event_date?fmtDate(r.event_date):'—';
      const extra=[r.fight_title?'🏆 '+r.fight_title+' CHAMPIONSHIP':'',r.fight_description||'',won&&(r.is_good_win||r.is_big_win)?'★ GOOD WIN · RANKINGS BOOST':''].filter(Boolean);
      return `<div class="ucs-ref-fight-row"><div class="ucs-ref-opponent"><strong>${esc(opponent?.name||'Unknown opponent')}</strong>${r.fight_title?'<span class="ucs-ref-title-tag">TC</span>':''}${extra.length?`<small>${esc(extra.join(' · '))}</small>`:''}</div><span class="result-pill ${won?'win':'loss'}">${won?'W':'L'}</span><span class="ucs-ref-method">${esc(method)}</span><time class="ucs-ref-date">${esc(date)}<small style="display:block;margin-top:5px;white-space:nowrap"><img src="https://flagcdn.com/w40/gb.png" alt="UK flag" style="width:20px;height:14px;vertical-align:middle;margin-right:5px"> London, The O2 Arena</small></time></div>`;
    }).join(''):empty('No official fight history yet.');
  }
  const koPressure=$('#profileKnockoutPressure');
  const koFill=$('#profileKnockoutFill');
  if(koPressure&&koFill){
    const percentage=winsRecorded.length?Math.round(kos/winsRecorded.length*100):null;
    koPressure.textContent=percentage===null?'—':percentage+'%';
    koFill.style.width=(percentage??0)+'%';
    $('#profileKnockoutDescription').textContent=percentage===null?'No official wins recorded in the available results.':'Knockouts per win across the selected official fight sample.';
  }
  const upcoming=state.scheduledBouts.filter(b=>b.fighter_a_id===f.id||b.fighter_b_id===f.id);
  $('#profileUpcomingFights').innerHTML=upcoming.length?upcoming.map(b=>{
    const other=fighterById(b.fighter_a_id===f.id?b.fighter_b_id:b.fighter_a_id);
    const opponentRecord=other?`${other.wins||0}-${other.losses||0}-${other.draws||0}`:'—';
    const date=b.bout_date?fmtDate(b.bout_date):'DATE TBA';
    const belt=b.belt?`<span class="ucs-inline-belt">🏆 ${esc(b.belt)} TITLE FIGHT</span>`:'<span class="ucs-inline-nontitle">NON-TITLE BOUT</span>';
    const contribute=safeHttps(b.contribution_url)?`<a class="ucs-inline-contribute" href="${esc(b.contribution_url)}" target="_blank" rel="noopener noreferrer">Contribute to fight ↗</a>`:'';
    const opponentPhoto=other?[other.showcase_image_url,other.avatar_url,other.profile_image_url].find(safeHttps):null;
    return `<article class="ucs-upcoming-card">
      <div class="ucs-upcoming-main">
        <div class="ucs-upcoming-fighter">
          <div class="ucs-upcoming-avatar">${opponentPhoto?`<img src="${esc(opponentPhoto)}" alt="" loading="lazy">`:'<span>UCS</span>'}</div>
          <div class="ucs-upcoming-fighter-info"><small>NEXT OPPONENT</small><strong>${esc(other?.name||'Opponent TBA')}</strong><span>${esc(opponentRecord)} · ${esc(b.event_name||'UCS Fight Night')}</span></div>
        </div>
        <div class="ucs-upcoming-meta"><strong>${esc(date)}</strong>${belt}<span class="ucs-inline-status">● SCHEDULED</span></div>
        <button class="ucs-see-bout ucs-upcoming-action" type="button" data-see-bout="${esc(b.id)}">VIEW BOUT ↗</button>
      </div>
      ${contribute?`<div class="ucs-upcoming-footer">${contribute}</div>`:''}
    </article>`;
  }).join(''):empty('No upcoming bouts scheduled.');
  // Discord bouts: completed results supersede stale duplicate upcoming rows.
  if(db){
    const fighterId=String(f.id),upcomingTarget=$('#profileUpcomingFights'),historyTarget=$('#profileFightHistory');
    const token=String(Date.now())+':'+fighterId;
    if(upcomingTarget)upcomingTarget.dataset.discordRenderToken=token;
    db.from('ucs_signup_matches').select('id,kind,red_fighter_id,blue_fighter_id,winner_fighter_id,result_method,completed_at,created_at,status').or('red_fighter_id.eq.'+fighterId+',blue_fighter_id.eq.'+fighterId).order('created_at',{ascending:false}).limit(100).then(({data,error})=>{
      if(error||!upcomingTarget||upcomingTarget.dataset.discordRenderToken!==token||!$('#fighterModal')?.classList.contains('open'))return;
      const key=b=>b.kind+':'+[String(b.red_fighter_id),String(b.blue_fighter_id)].sort().join(':');
      const completedKeys=new Set((data||[]).filter(b=>b.status==='completed').map(key));
      const seen=new Set();
      const pending=(data||[]).filter(b=>{const k=key(b);if(b.status!=='upcoming'||completedKeys.has(k)||seen.has(k))return false;seen.add(k);return true;});
      const cards=pending.map(b=>{
        const opp=fighterById(b.red_fighter_id===fighterId?b.blue_fighter_id:b.red_fighter_id);
        const photo=opp?[opp.avatar_url,opp.profile_image_url,opp.showcase_image_url].find(safeHttps):null;
        const avatar=photo?'<img src="'+esc(photo)+'" alt="" loading="lazy" style="width:52px;height:52px;object-fit:cover;border-radius:50%">':'<span style="width:52px;height:52px;border-radius:50%;display:inline-grid;place-items:center;background:#252530">🥊</span>';
        return '<article data-ucs-discord-bout="'+esc(b.id)+'" class="ucs-upcoming-card" style="padding:16px;margin:10px 0"><div class="ucs-upcoming-main"><div class="ucs-upcoming-fighter"><div class="ucs-upcoming-avatar">'+avatar+'</div><div class="ucs-upcoming-fighter-info"><small>DISCORD '+(b.kind==='offline'?'OFFLINE':'LIVE')+' BOUT</small><strong>'+esc(opp?.name||'Opponent')+'</strong><span>10 ROUNDS · 1.5× Relative Time · 1.0 Damage</span></div></div><div class="ucs-upcoming-meta"><strong>DATE TBA</strong><span class="ucs-inline-status">● SCHEDULED</span></div></div></article>';
      }).join('');
      upcomingTarget.querySelectorAll('[data-ucs-discord-bout]').forEach(el=>el.remove());
      if(cards){if(upcomingTarget.textContent.includes('No upcoming bouts scheduled.'))upcomingTarget.innerHTML=cards;else upcomingTarget.insertAdjacentHTML('beforeend',cards);}
      // Reuse the site's existing UCS OFFLINE / ALL BOUTS record renderer.
      const offlineRows=(data||[]).filter(b=>b.kind==='offline'&&b.status==='completed'&&b.winner_fighter_id).map(b=>({
        id:'discord-'+b.id,
        fighter_id:b.winner_fighter_id,
        opponent_id:b.winner_fighter_id===b.red_fighter_id?b.blue_fighter_id:b.red_fighter_id,
        result:'W',
        method:b.result_method||'Result',
        event_date:String(b.completed_at||b.created_at||'').slice(0,10),
        event_name:'UCS Discord Offline Bout'
      }));
      state.ucsDiscordOfflineByFighter=state.ucsDiscordOfflineByFighter||{};
      state.ucsDiscordOfflineByFighter[fighterId]=offlineRows;
      ucsRenderDossierRecords(f);

    });
  }
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
    return `<article class="vault-market"><div class="market-head"><div><span class="market-number">MARKET ${String(i+1).padStart(2,'0')}</span><strong>UCS FIGHT MARKET</strong></div><span class="market-live"><i></i> OPEN</span></div><div class="market-matchup"><button class="fighter-odds" data-market="${b.id}" data-fighter="${b.fighter_a_id}" data-name="${esc(a?.name||'TBA')}" data-odds="${esc(b.odds_a)}"><span class="corner-label">RED CORNER</span><strong>${esc(a?.name||'TBA')}</strong><small>${esc(record(a||{}))}</small><b>${esc(b.odds_a)}</b></button><div class="market-vs"><span>UCS</span><strong class="ucs-red-vs-logo" role="img" aria-label="VS"></strong></div><button class="fighter-odds right" data-market="${b.id}" data-fighter="${b.fighter_b_id}" data-name="${esc(c?.name||'TBA')}" data-odds="${esc(b.odds_b)}"><span class="corner-label">BLUE CORNER</span><strong>${esc(c?.name||'TBA')}</strong><small>${esc(record(c||{}))}</small><b>${esc(b.odds_b)}</b></button></div></article>`;
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
  root.innerHTML=`${poster}<div class="ucs-bout-info"><span class="section-kicker">SCHEDULED · ${esc(b.bout_date?fmtDate(b.bout_date):'DATE TBA')}</span><h2>${esc(a?.name||'TBA')} <em class="ucs-red-vs-inline" aria-label="versus"></em> ${esc(c?.name||'TBA')}</h2><p>${esc(b.event_name)} · ${esc(b.belt?b.belt+' CHAMPIONSHIP':'Belt / title TBA')}</p><p>Fight scheduled — result not recorded.</p>${special?'<div class="ucs-matcherino-total" id="ucsMatcherinoTotal" aria-live="polite"><span class="ucs-matcherino-total-label">MATCHERINO PRIZE POOL</span><strong id="ucsMatcherinoAmount">Checking current total…</strong><a href="https://matcherino.com/tournaments/225104" target="_blank" rel="noopener noreferrer">View on Matcherino ↗</a></div>':''}<div class="ucs-bout-links"><button class="btn ghost" type="button" data-open-fights>VIEW UPCOMING FIGHTS →</button>${special?'<button class="btn primary" type="button" data-open-undercard>APPLY FOR UNDERCARD</button>':''}${boutLink(b)}</div></div>`;
  if(special)refreshMatcherinoTotal();
  root.querySelectorAll('[data-open-fights]').forEach(btn=>btn.addEventListener('click',()=>showPage('fights')));
  root.querySelectorAll('[data-open-undercard]').forEach(btn=>btn.addEventListener('click',()=>openUndercardForm(b.id)));
}

function ucsEventWinnerData(id){return state.settings?.event_winners?.[id]||{};}
function ucsRenderEventCards(){
  const grid=$('#ucsEventsGrid'),list=$('#ucsAdminEventsList');
  const events=[...state.events].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true}));
  if(grid)grid.innerHTML=events.length?events.map(event=>{
    const poster=safeHttps(event.poster_url)?'<img class="ucs-event-bg" loading="lazy" src="'+esc(event.poster_url)+'" alt="'+esc(event.name)+' event poster">':'<div class="ucs-event-poster-fallback">UCS</div>';
    const date=event.event_date?new Date(event.event_date+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase():'DATE TBA';
    const results=ucsEventWinnerData(event.id);
    return '<article class="ucs-event-card"><button type="button" class="ucs-event-open" data-open-ucs-event="'+esc(event.id)+'" aria-label="View '+esc(event.name)+' event details"><div class="ucs-event-poster">'+poster+'</div><div class="ucs-event-content"><div class="ucs-event-meta"><span>'+esc(date)+'</span><span class="ucs-event-status">'+(results.completed?'RESULTS AVAILABLE':esc(event.status||'UPCOMING'))+'</span></div><h3>'+esc(event.name)+'</h3><p>'+esc(event.details||'UCS OFFICIAL FIGHT NIGHT')+'</p><span class="ucs-event-view">VIEW EVENT & RESULTS →</span></div></button></article>';
  }).join(''):'<div class="data-empty">No events announced yet.</div>';
  if(list)list.innerHTML=events.map(event=>'<div class="ucs-admin-event-row"><strong>'+esc(event.name)+'</strong><span>'+esc(fmtDate(event.event_date))+'</span><button type="button" class="mini-action" data-ucs-edit-event="'+esc(event.id)+'">EDIT / REPLACE POSTER</button><button type="button" class="mini-action ucs-delete-event" data-ucs-delete-event="'+esc(event.id)+'">DELETE EVENT</button></div>').join('');
  const select=$('#ucsEventWinnersSelect');
  if(select){const current=select.value;select.innerHTML='<option value="">Select an event</option>'+events.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+'</option>').join('');if(events.some(e=>String(e.id)===current))select.value=current;}
}
function ucsOpenEventResults(id){
  const event=state.events.find(e=>String(e.id)===String(id)),root=$('#ucsEventResultsDetail');if(!event||!root)return;
  const data=ucsEventWinnerData(event.id);
  const lines=String(data.winners||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  root.innerHTML='<button class="ucs-event-results-back" type="button">← BACK TO EVENTS</button><div class="ucs-event-results-layout">'+(safeHttps(event.poster_url)?'<img src="'+esc(event.poster_url)+'" alt="'+esc(event.name)+' poster">':'')+'<div><span class="section-kicker">OFFICIAL UCS EVENT</span><h2>'+esc(event.name)+'</h2><p>'+esc(event.details||'')+'</p><h3>'+(data.completed?'OFFICIAL WINNERS':'EVENT RESULTS')+'</h3>'+(lines.length?'<ul>'+lines.map(line=>'<li>'+esc(line)+'</li>').join('')+'</ul>':'<p class="ucs-event-results-pending">Official results have not been published yet.</p>')+'</div></div>';
  root.classList.remove('hidden');$('#ucsEventsGrid')?.classList.add('hidden');root.scrollIntoView({behavior:'smooth',block:'start'});
}
$('#ucsEventsGrid')?.addEventListener('click',e=>{const b=e.target.closest('[data-open-ucs-event]');if(b)ucsOpenEventResults(b.dataset.openUcsEvent);});
$('#ucsEventResultsDetail')?.addEventListener('click',e=>{if(!e.target.closest('.ucs-event-results-back'))return;$('#ucsEventResultsDetail').classList.add('hidden');$('#ucsEventsGrid')?.classList.remove('hidden');});
function ucsPopulateEventWinners(){const id=$('#ucsEventWinnersSelect')?.value,record=ucsEventWinnerData(id);if($('#ucsEventWinnersInput'))$('#ucsEventWinnersInput').value=record.winners||'';if($('#ucsEventCompletedInput'))$('#ucsEventCompletedInput').checked=!!record.completed;}
$('#ucsEventWinnersSelect')?.addEventListener('change',ucsPopulateEventWinners);
$('#ucsEventWinnersForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const d=new FormData(e.currentTarget),id=String(d.get('event_id')||'');if(!state.events.some(x=>String(x.id)===id))return toast('Select an event.',true);
  const value={...(state.settings.event_winners||{}),[id]:{winners:String(d.get('winners')||'').trim(),completed:d.has('completed')}};
  const {error}=await db.from('league_settings').upsert({key:'event_winners',value,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error)return toast(error.message,true);toast('Event winners published.');await loadPublicData();
});
const ucsEventTags=new Set();
function ucsRenderEventTags(){
  const search=$('#ucsEventFighterSearch'),suggestions=$('#ucsEventFighterSuggestions'),selected=$('#ucsEventSelectedFighters');
  if(!suggestions||!selected)return;
  const query=(search?.value||'').replace(/^@/,'').trim().toLowerCase();
  const roster=state.fighters.filter(f=>!ucsEventTags.has(f.id)&&(!query||f.name.toLowerCase().includes(query))).slice(0,12);
  suggestions.innerHTML=roster.map(f=>'<button type="button" class="ucs-event-tag-option" data-ucs-event-add="'+esc(f.id)+'">'+avatarHtml(f,'ucs-mention-avatar')+'<span>'+esc(f.name)+'</span></button>').join('')||'<p class="ucs-mention-empty">No matching fighters</p>';
  selected.innerHTML=[...ucsEventTags].map(id=>fighterById(id)).filter(Boolean).map(f=>'<span class="ucs-event-tag-chip">'+avatarHtml(f,'ucs-mention-avatar')+' @'+esc(f.name)+' <button type="button" data-ucs-event-remove="'+esc(f.id)+'" aria-label="Remove '+esc(f.name)+'">×</button></span>').join('');
}
$('#ucsAdminEventsList')?.addEventListener('click',async e=>{
  const button=e.target.closest('[data-ucs-delete-event]');if(!button)return;
  if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const event=state.events.find(x=>x.id===button.dataset.ucsDeleteEvent);if(!event)return;
  const linked=(state.scheduledBouts||[]).filter(b=>b.event_id===event.id);
  if(linked.length)return toast('This event has '+linked.length+' scheduled fights. Move or unlink them in the fight manager before deleting the event.',true);
  if(!confirm('Permanently delete '+event.name+' from UCS Events? This cannot be undone.'))return;
  button.disabled=true;
  try{
    const {error}=await db.from('events').delete().eq('id',event.id);
    if(error)throw error;
    if($('#ucsEventEditor')?.elements.event_id.value===event.id){$('#ucsEventEditor').reset();$('#ucsEventEditor').elements.event_id.value='';ucsEventTags.clear();}
    await loadPublicData();toast(event.name+' deleted.');
  }catch(error){toast('Could not delete event: '+(error.message||error),true);button.disabled=false;}
});
$('#ucsEventFighterSearch')?.addEventListener('input',ucsRenderEventTags);
$('#ucsEventFighterSuggestions')?.addEventListener('click',e=>{const btn=e.target.closest('[data-ucs-event-add]');if(!btn)return;ucsEventTags.add(btn.dataset.ucsEventAdd);$('#ucsEventFighterSearch').value='';ucsRenderEventTags();});
$('#ucsEventSelectedFighters')?.addEventListener('click',e=>{const btn=e.target.closest('[data-ucs-event-remove]');if(!btn)return;ucsEventTags.delete(btn.dataset.ucsEventRemove);ucsRenderEventTags();});
$('#ucsAdminEventsList')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-ucs-edit-event]');if(!button)return;
  const event=state.events.find(x=>x.id===button.dataset.ucsEditEvent),form=$('#ucsEventEditor');
  if(!event||!form)return;
  for(const key of ['event_id','name','event_date','details','status'])form.elements[key].value=event[key]||'';
  ucsEventTags.clear();
  (state.scheduledBouts||[]).filter(b=>b.event_id===event.id).forEach(b=>{ucsEventTags.add(b.fighter_a_id);ucsEventTags.add(b.fighter_b_id);});
  const taggedNames=(event.details||'').match(/@([\\w .-]+)/g)||[];
  taggedNames.forEach(name=>{const f=state.fighters.find(f=>f.name.toLowerCase()===name.slice(1).trim().toLowerCase());if(f)ucsEventTags.add(f.id);});
  ucsRenderEventTags();
  form.scrollIntoView({behavior:'smooth',block:'center'});
});
$('#ucsEventNew')?.addEventListener('click',()=>{$('#ucsEventEditor')?.reset();$('#ucsEventEditor').elements.event_id.value='';ucsEventTags.clear();ucsRenderEventTags();});
$('#ucsEventEditor')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const form=e.currentTarget,data=new FormData(form),button=$('#ucsEventSave');
  const id=String(data.get('event_id')||'').trim();
  const payload={name:String(data.get('name')||'').trim(),event_date:data.get('event_date'),details:String(data.get('details')||'').trim()||null,status:data.get('status')};
  const file=form.elements.poster.files?.[0];
  if(!payload.name||!payload.event_date)return toast('Event name and date are required.',true);
  if(file&&!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('Use a JPG, PNG or WebP poster.',true);
  if(file&&(file.size===0||file.size>5*1024*1024))return toast('Poster must be 5 MB or smaller.',true);
  button.disabled=true;
  try{
    if(file){
      const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
      const path='event-posters/'+crypto.randomUUID()+'.'+extension;
      const {error:uploadError}=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      payload.poster_url=db.storage.from('fighter-avatars').getPublicUrl(path).data.publicUrl;
    }
    let existingEventId=id;
    if(!existingEventId){
      const {data:duplicateCheck,error:checkError}=await db.from('events').select('id').ilike('name',payload.name).limit(1);
      if(checkError)throw checkError;
      if(duplicateCheck?.length)throw new Error('An event with this name already exists. Choose EDIT / REPLACE POSTER instead.');
    }
    const query=existingEventId?db.from('events').update(payload).eq('id',existingEventId).select('id').single():db.from('events').insert(payload).select('id').single();
    const {data:savedEvent,error}=await query;if(error)throw error;
    // Automatically publish one announcement per event; future poster edits update the same article.
    const eventId=savedEvent.id,marker='[UCS_EVENT:'+eventId+']';
    const eventNumber=(payload.name.match(/UCS\\s*#?\\s*\\d+/i)||[])[0]||payload.name;
    const fight=(payload.name.match(/([A-Za-z0-9][A-Za-z0-9 .'-]{0,55})\\s+VS?\\s+([A-Za-z0-9][A-Za-z0-9 .'-]{0,55})/i)||payload.details?.match(/([A-Za-z0-9][A-Za-z0-9 .'-]{0,55})\\s+VS?\\s+([A-Za-z0-9][A-Za-z0-9 .'-]{0,55})/i));
    const taggedFighters=[...ucsEventTags].map(fighterById).filter(Boolean);
    const matchLabel=taggedFighters.length>=2?(taggedFighters[0].name+' V '+taggedFighters[1].name):(fight?(fight[1].trim()+' V '+fight[2].trim()):'FIGHTER V FIGHTER');
    const headline=(eventNumber+' HAS JUST BEEN ANNOUNCED WITH '+matchLabel+' AS THE HEADLINE').slice(0,160);
    const summary=(payload.details||'The next UCS fight night has been officially announced.').slice(0,450);
    const body=payload.name+' has officially been announced!\\n\\n'+(payload.details||'The main event will be confirmed soon.')+'\\n\\nEvent date: '+payload.event_date+'. Visit the Events tab for the official fight poster and updated fight card.\\n\\n'+marker;
    let announcementError=null;
    try{
      const {data:existing,error:findError}=await db.from('ucs_news').select('id').ilike('body','%'+marker+'%').limit(1);
      if(findError)throw findError;
      const article={headline,summary,body,image_url:payload.poster_url||null,banner_url:payload.poster_url||null,tagged_fighter_ids:taggedFighters.map(f=>f.id),is_published:true,updated_at:new Date().toISOString()};
      if(existing?.length){
        // Do not erase an existing news poster when an admin edits text without uploading a new one.
        if(!payload.poster_url){delete article.image_url;delete article.banner_url;}
        const {error:newsError}=await db.from('ucs_news').update(article).eq('id',existing[0].id);if(newsError)throw newsError;
      }else{
        article.published_at=new Date().toISOString();
        const {error:newsError}=await db.from('ucs_news').insert(article);if(newsError)throw newsError;
      }
    }catch(error){announcementError=error;console.error('UCS event news publication:',error);}
    form.reset();form.elements.event_id.value='';ucsEventTags.clear();ucsRenderEventTags();
    await loadPublicData();
    toast(announcementError?'Event saved, but news announcement failed: '+announcementError.message:(id?'Event and news updated.':'Event published to Events and News.'),!!announcementError);
  }catch(error){toast(error.message||'Could not save event.',true);}
  finally{button.disabled=false;}
});

function renderEvents(){
  const root=$('#fightList');
  if(!root)return;
  const scheduled=state.scheduledBouts||[];
  const featured=state.settings.featured_main_event||{};
  const matchesFeatured=b=>
    (b.fighter_a_id===featured.champion_id&&b.fighter_b_id===featured.challenger_id)||
    (b.fighter_b_id===featured.champion_id&&b.fighter_a_id===featured.challenger_id);
  const main=scheduled.find(b=>!b.is_co_main&&matchesFeatured(b))||scheduled.find(b=>!b.is_co_main&&b.belt)||scheduled.find(b=>!b.is_co_main)||null;
  const sameCard=b=>main&&b.event_name?.trim().toLowerCase()===main.event_name?.trim().toLowerCase()&&b.bout_date===main.bout_date;
  const coMain=scheduled.find(b=>b.is_co_main&&sameCard(b))||scheduled.find(b=>b.is_co_main)||null;
  const ordered=[...(main?[main]:[]),...(coMain?[coMain]:[]),...scheduled.filter(b=>b.id!==main?.id&&b.id!==coMain?.id)];
  const portrait=f=>{
    const img=f?.avatar_url&&safeHttps(f.avatar_url)
      ?`<img src="${esc(f.avatar_url)}" loading="lazy" alt="${esc(f.name)} profile picture" class="ucs-match-portrait-image">`
      :`<span class="ucs-match-avatar-fallback" aria-hidden="true">${esc(initials(f?.name||'UCS'))}</span>`;
    return `<span class="ucs-match-avatar">${img}</span>`;
  };
  const boutCard=b=>{
    const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
    const isMain=b.id===main?.id,isCoMain=b.id===coMain?.id;
    return `<article class="ucs-match-card${b.belt?' ucs-match-title-bout':''}${isMain?' ucs-match-featured':''}${isCoMain?' ucs-match-co-main':''}">
      <div class="ucs-match-top"><span>${isMain?'★ MAIN EVENT':isCoMain?'★ CO-MAIN EVENT':b.is_title_eliminator?'★ INTERNATIONAL TITLE ELIMINATOR':b.belt?'★ CHAMPIONSHIP FIGHT':'UCS FIGHT NIGHT'}</span><span>${esc(b.bout_date?fmtDate(b.bout_date):'DATE TBA')}</span></div>
      ${safeHttps(b.poster_url)?`<a class="ucs-match-poster-banner" href="${esc(b.poster_url)}" target="_blank" rel="noopener noreferrer" aria-label="View full fight poster for ${esc(a?.name||'fighter')} versus ${esc(c?.name||'fighter')}">
        <img src="${esc(b.poster_url)}" alt="${esc(a?.name||'Fighter')} vs ${esc(c?.name||'Fighter')} fight poster" loading="lazy">
        <span class="ucs-match-poster-caption"><strong>${esc(a?.name||'TBA')} VS ${esc(c?.name||'TBA')}</strong><small>VIEW FULL POSTER ↗</small></span>
      </a>`:''}
      <div class="ucs-match-contest">
        <div class="ucs-match-person">${portrait(a)}<div class="ucs-match-person-info"><strong>${esc(a?.name||'TBA')}</strong><small>${a?esc(record(a)):'Fighter TBA'}</small></div></div>
        <div class="ucs-match-versus ucs-red-vs-logo" role="img" aria-label="VS"></div>
        <div class="ucs-match-person ucs-match-person-right">${portrait(c)}<div class="ucs-match-person-info"><strong>${esc(c?.name||'TBA')}</strong><small>${c?esc(record(c)):'Fighter TBA'}</small></div></div>
      </div>
      <div style="padding:4px 16px 12px;font-size:12px"><img src="https://flagcdn.com/w40/gb.png" alt="UK flag" style="width:20px;height:14px;vertical-align:middle;margin-right:5px"> London, Greenwich, The O2 Arena</div><div class="ucs-match-bottom"><span>${esc(b.belt?b.belt+' TITLE FIGHT':b.event_name||'Non-title bout')} · UPCOMING</span><button type="button" class="ucs-see-bout" data-see-bout="${esc(b.id)}">SEE BOUT ↗</button>${boutLink(b)}</div>
    </article>`;
  };
  // Don't repeat scheduled pairings from legacy event rows; leave stored records untouched.
  const normalize=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const duplicate=e=>scheduled.some(b=>{
    if(!e.event_date||!b.bout_date||e.event_date!==b.bout_date)return false;
    const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
    return a&&c&&(normalize(e.name)===normalize(a.name+' vs '+c.name)||
      normalize(e.name)===normalize(c.name+' vs '+a.name));
  });
  const legacy=state.events.filter(e=>!duplicate(e)).map(e=>
    `<article class="event-row"><time>${esc(fmtDate(e.event_date))}</time><strong>${esc(e.name)}</strong><span>${esc(e.details||e.status)}</span><small><img src="https://flagcdn.com/w40/gb.png" alt="UK flag" style="width:20px;height:14px;vertical-align:middle;margin-right:5px"> London, Greenwich, The O2 Arena</small></article>`
  ).join('');
  root.innerHTML=ordered.map(boutCard).join('')+legacy||empty('No fight cards or results have been added yet.');
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
function renderTopEarners(){
  const container=$('#ucsTopEarners');if(!container)return;
  const entries=state.fighters.map(f=>({fighter:f,earnings:Number(state.fighterEarnings.get(f.id)||0)}))
    .filter(item=>Number.isFinite(item.earnings)&&item.earnings>=0)
    .sort((a,b)=>b.earnings-a.earnings||Number(b.fighter.score||0)-Number(a.fighter.score||0)||String(a.fighter.name||'').localeCompare(String(b.fighter.name||'')))
    .slice(0,10);
  if(!entries.length){container.innerHTML=empty('No fighter earnings recorded yet.');return;}
  const hasEarnings=entries.some(item=>item.earnings>0);
  if(!hasEarnings){container.innerHTML=empty('Earnings leaderboard will appear after an admin records fighter earnings.');return;}
  container.innerHTML=entries.map(({fighter,earnings},i)=>`
    <div class="ucs-earner-row">
      <span class="ucs-earner-rank">${String(i+1).padStart(2,'0')}</span>
      ${avatarHtml(fighter,'ucs-earner-avatar')}
      <div class="ucs-earner-identity"><strong>${esc(fighter.name)}</strong><small>${esc(record(fighter))} · ${esc(fighter.platform||'UCS')}</small></div>
      <strong class="ucs-earner-value">${ucsFormatEarnings(earnings)}</strong>
    </div>`).join('');
}
const selectedNewsFighters = new Set();
let newsMentionActiveInput = null;
let newsMentionHighlightedIndex = 0;
function newsMentionPopup(input){
  if(input?.id==='ucsNewsMentionInput')return $('#ucsNewsMentionResults');
  if(input?.name!=='body')return null;
  let popup=$('#ucsNewsBodyMentionResults');
  if(!popup){
    popup=document.createElement('div');
    popup.id='ucsNewsBodyMentionResults';
    popup.className='ucs-mention-popup ucs-mention-body-popup hidden';
    popup.setAttribute('role','listbox');
    popup.setAttribute('aria-label','Matching UCS fighters');
    input.parentElement.appendChild(popup);
  }
  return popup;
}
function newsMentionQuery(input){
  if(input?.id==='ucsNewsMentionInput')return input.value.replace(/^@/,'').trim();
  if(input?.name==='body'){
    const cursor=input.selectionStart??input.value.length;
    const before=input.value.slice(0,cursor);
    const match=before.match(/(?:^|[\s(])@([^@\n]{0,45})$/);
    return match?match[1].trim():null;
  }
  return null;
}
function closeNewsMentions(){
  ['#ucsNewsMentionResults','#ucsNewsBodyMentionResults'].forEach(selector=>{
    const el=$(selector);
    if(el){el.classList.add('hidden');el.innerHTML='';}
  });
  $('#ucsNewsMentionInput')?.setAttribute('aria-expanded','false');
  newsMentionActiveInput=null;
}
function showNewsMentionSuggestions(input){
  const query=newsMentionQuery(input);
  const popup=newsMentionPopup(input);
  if(!popup)return;
  const others=input?.id==='ucsNewsMentionInput'?'#ucsNewsBodyMentionResults':'#ucsNewsMentionResults';
  $(others)?.classList.add('hidden');
  if(query===null||(!state.fighters.length&&query==='')){
    closeNewsMentions();return;
  }
  const matching=state.fighters.filter(f=>!selectedNewsFighters.has(f.id)&&
    String(f.name||'').toLowerCase().includes(query.toLowerCase())).slice(0,8);
  newsMentionHighlightedIndex=0;
  newsMentionActiveInput=input;
  popup.classList.remove('hidden');
  input.setAttribute('aria-expanded','true');
  popup.innerHTML=`<div class="ucs-mention-popup-header">FIGHTERS MATCHING @${esc(query)}</div>`+
    (matching.length?matching.map((f,i)=>`
      <button type="button" role="option" class="ucs-mention-option ${i===0?'ucs-mention-selected':''}" data-mention-fighter="${esc(f.id)}" aria-selected="${i===0?'true':'false'}">
        ${avatarHtml(f,'ucs-mention-avatar')}
        <span><strong>${esc(f.name)}</strong><small>${esc(f.platform||'UCS FIGHTER')}</small></span>
      </button>`).join(''):'<p class="ucs-mention-empty">No matching fighters</p>');
}
function renderNewsTagOptions(){
  const grid=$('#ucsNewsFighterTags');if(!grid)return;
  for(const id of [...selectedNewsFighters])if(!fighterById(id))selectedNewsFighters.delete(id);
  const fighters=[...selectedNewsFighters].map(fighterById).filter(Boolean);
  grid.innerHTML=fighters.map(f=>`<span class="ucs-news-selected-fighter">
    ${avatarHtml(f,'ucs-news-selected-avatar')}
    <strong>@${esc(f.name)}</strong>
    <button type="button" data-untag-fighter="${esc(f.id)}" aria-label="Remove ${esc(f.name)} tag">×</button>
  </span>`).join('');
  updateNewsTagCount();
}
function updateNewsTagCount(){
  const count=selectedNewsFighters.size,node=$('#ucsNewsTagCount');
  if(node)node.textContent=count+' fighter'+(count===1?'':'s')+' tagged';
}
function setNewsTaggedFighters(ids){
  selectedNewsFighters.clear();
  (Array.isArray(ids)?ids:[]).forEach(id=>{if(fighterById(id))selectedNewsFighters.add(id);});
  renderNewsTagOptions();
  closeNewsMentions();
  const input=$('#ucsNewsMentionInput');
  if(input)input.value='';
}
function newsMentionPick(id){
  const fighter=fighterById(id);
  if(!fighter)return;
  const input=newsMentionActiveInput;
  if(input?.name==='body'){
    const pos=input.selectionStart??input.value.length;
    const prefix=input.value.slice(0,pos);
    const match=prefix.match(/(?:^|[\s(])@([^@\n]{0,45})$/);
    if(match){
      const beginning=pos-match[0].length+(match[0][0]==='@'?0:1);
      input.setRangeText('@'+fighter.name+' ',beginning,pos,'end');
      input.dispatchEvent(new Event('input',{bubbles:false}));
    }
  }
  selectedNewsFighters.add(fighter.id);
  renderNewsTagOptions();
  closeNewsMentions();
  if(input?.id==='ucsNewsMentionInput')input.value='';
  input?.focus();
}
function newsMentionKeydown(e){
  const popup=newsMentionPopup(e.currentTarget);
  if(!popup||popup.classList.contains('hidden'))return;
  const options=[...popup.querySelectorAll('[data-mention-fighter]')];
  if(e.key==='Escape'){e.preventDefault();closeNewsMentions();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    if(!options.length)return;
    newsMentionHighlightedIndex=(newsMentionHighlightedIndex+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
    options.forEach((option,i)=>{
      option.classList.toggle('ucs-mention-selected',i===newsMentionHighlightedIndex);
      option.setAttribute('aria-selected',String(i===newsMentionHighlightedIndex));
    });
    options[newsMentionHighlightedIndex]?.scrollIntoView({block:'nearest'});
  }else if((e.key==='Enter'||e.key==='Tab')&&options.length){
    e.preventDefault();
    newsMentionPick(options[newsMentionHighlightedIndex]?.dataset.mentionFighter);
  }
}
$('#ucsNewsMentionInput')?.addEventListener('input',e=>showNewsMentionSuggestions(e.currentTarget));
$('#ucsNewsMentionInput')?.addEventListener('focus',e=>{
  if(e.currentTarget.value)showNewsMentionSuggestions(e.currentTarget);
});
$('#ucsNewsMentionInput')?.addEventListener('keydown',newsMentionKeydown);
$('#ucsNewsForm textarea[name="body"]')?.addEventListener('input',e=>showNewsMentionSuggestions(e.currentTarget));
$('#ucsNewsForm textarea[name="body"]')?.addEventListener('keydown',newsMentionKeydown);
$('#ucsNewsForm')?.addEventListener('click',e=>{
  const pick=e.target.closest('[data-mention-fighter]');
  if(pick){newsMentionPick(pick.dataset.mentionFighter);return;}
  const remove=e.target.closest('[data-untag-fighter]');
  if(remove){
    selectedNewsFighters.delete(remove.dataset.untagFighter);
    renderNewsTagOptions();
  }
});
document.addEventListener('pointerdown',e=>{
  if(!e.target.closest('.ucs-news-mention-wrap, .ucs-mention-popup, #ucsNewsFighterTags, #ucsNewsMentionInput, #ucsNewsForm textarea[name="body"]'))
    closeNewsMentions();
});
$('#ucsNewsClearTags')?.addEventListener('click',()=>setNewsTaggedFighters([]));
function renderNewsTaggedFighters(item){
  const fighterIds=Array.isArray(item.tagged_fighter_ids)?item.tagged_fighter_ids:[];
  const fighters=fighterIds.map(fighterById).filter(Boolean);
  if(!fighters.length)return '';
  return `<section class="ucs-news-listed-fighters" aria-label="Fighters listed in this article">
    <h3>FIGHTERS LISTED</h3>
    <div class="ucs-news-listed-grid">${fighters.map(f=>`<a class="ucs-news-fighter-link" href="#rankings" data-news-fighter="${esc(f.id)}">
      ${avatarHtml(f,'ucs-news-tag-avatar')}
      <span><strong>${esc(f.name)}</strong><small>VIEW FIGHTER PROFILE ↗</small></span>
    </a>`).join('')}</div>
  </section>`;
}
$('#ucsNewsReader')?.addEventListener('click',event=>{
  const link=event.target.closest('[data-news-fighter]');if(!link)return;
  event.preventDefault();
  const fighter=fighterById(link.dataset.newsFighter);
  if(!fighter)return toast('This fighter is no longer active.',true);
  showPage('rankings');
  history.replaceState(null,'','#rankings');
  openFighterProfile(fighter.id);
});
function renderNews(){
  const grid=$('#ucsNewsGrid');if(!grid)return;
  const published=state.news.filter(x=>x.is_published);
  grid.innerHTML=published.length?published.map(item=>`
    <button type="button" class="ucs-news-card${item.is_auto_report?' ucs-auto-report':''}" data-news-open="${esc(item.id)}">
      <span class="ucs-news-image">${safeHttps(item.image_url)?`<img src="${esc(item.image_url)}" loading="lazy" alt="">`:'<span class="ucs-news-placeholder">UCS NEWS</span>'}</span>
      <span class="ucs-news-card-copy"><small>${item.is_auto_report?'🥊 OFFICIAL FIGHT RESULT · ':''}${esc(ucsNewsDate(item))}</small><strong>${esc(item.headline)}</strong><span>${esc(item.summary||item.body.slice(0,150))}</span><b>READ ARTICLE →</b></span>
    </button>`).join(''):empty('No UCS articles have been published yet.');
  const adminList=$('#ucsAdminNewsList');
  if(adminList)adminList.innerHTML=state.news.length?state.news.map(item=>`<div class="ucs-news-admin-item"><div><strong>${esc(item.headline)}</strong><small>${item.is_auto_report?'AUTOMATED RESULT · ':''}${item.is_published?'Published':'Draft'} · ${esc(ucsNewsDate(item))}</small></div><div><button type="button" class="mini-action" data-news-edit="${esc(item.id)}">EDIT</button><button type="button" class="mini-action danger" data-news-delete="${esc(item.id)}">DELETE</button></div></div>`).join(''):empty('No articles yet.');
}
$('#ucsNewsGrid')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-news-open]');if(!btn)return;
  const item=state.news.find(x=>x.id===btn.dataset.newsOpen&&x.is_published);if(!item)return;
  const reader=$('#ucsNewsReader');
  reader.innerHTML=`<button type="button" class="btn ghost" id="ucsNewsBack">← ALL NEWS</button><small>${esc(ucsNewsDate(item))} · ${item.is_auto_report?'OFFICIAL FIGHT RESULT':'UCS NEWS'}</small><h2>${esc(item.headline)}</h2>${safeHttps(item.image_url)?`<img class="ucs-news-feature-image" src="${esc(item.image_url)}" alt="">`:''}<p class="ucs-news-summary">${esc(item.summary||'')}</p>${safeHttps(item.banner_url)?`<a class="ucs-news-poster-banner" href="${esc(item.banner_url)}" target="_blank" rel="noopener noreferrer" aria-label="Open full fight poster"><img src="${esc(item.banner_url)}" alt="${esc(item.headline)} fight poster banner" loading="lazy"><span>VIEW FULL POSTER ↗</span></a>`:''}<div class="ucs-news-body">${esc(item.body)}</div>${renderNewsTaggedFighters(item)}`;
  reader.classList.remove('hidden');$('#ucsNewsGrid').classList.add('hidden');
  $('#ucsNewsBack').addEventListener('click',()=>{reader.classList.add('hidden');$('#ucsNewsGrid').classList.remove('hidden');});
  reader.scrollIntoView({behavior:'smooth',block:'start'});
});
function ucsNewsBannerPreview(url=null){
  const box=$('#ucsNewsBannerPreview');if(!box)return;
  const editor=$('#ucsNewsForm');
  const current=state.news.find(item=>item.id===editor?.elements.article_id.value);
  const image=url||(safeHttps(current?.banner_url)?current.banner_url:null);
  box.innerHTML=image?`<img src="${esc(image)}" alt="Article poster banner preview"><small>${url?'NEW POSTER BANNER':'CURRENT POSTER BANNER'}</small>`:'';
}
$('#ucsNewsBannerFile')?.addEventListener('change',e=>{
  if(window._ucsNewsBannerObjectURL)URL.revokeObjectURL(window._ucsNewsBannerObjectURL);
  const file=e.target.files?.[0];
  window._ucsNewsBannerObjectURL=file?URL.createObjectURL(file):null;
  ucsNewsBannerPreview(window._ucsNewsBannerObjectURL);
});
function resetNewsEditor(){
  const form=$('#ucsNewsForm');form?.reset();
  if(form){form.elements.article_id.value='';form.elements.is_published.checked=true;setNewsTaggedFighters([]);ucsNewsBannerPreview();}
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
    f.elements.image_url.value=item.image_url||'';f.elements.banner_url.value=item.banner_url||'';f.elements.is_published.checked=item.is_published;
    ucsNewsBannerPreview();
    setNewsTaggedFighters(item.tagged_fighter_ids);
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
    let bannerUrl=String(d.get('banner_url')||'').trim();
    if(bannerUrl&&!safeHttps(bannerUrl))throw Error('Use a secure HTTPS banner URL.');
    const bannerFile=d.get('banner_file');
    if(bannerFile instanceof File&&bannerFile.size){
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'},ext=types[bannerFile.type];
      if(!ext||bannerFile.size>5*1024*1024)throw Error('Banner must be PNG, JPG or WebP, maximum 5 MB.');
      const path='articles/banners/'+crypto.randomUUID()+'.'+ext;
      const {error}=await db.storage.from('ucs-news').upload(path,bannerFile,{contentType:bannerFile.type,upsert:false});
      if(error)throw error;
      bannerUrl=db.storage.from('ucs-news').getPublicUrl(path).data.publicUrl;
    }
    const id=String(d.get('article_id')||'');
    const taggedIds=[...selectedNewsFighters].filter(id=>state.fighters.some(f=>f.id===id));
    const payload={headline:String(d.get('headline')||'').trim(),summary:String(d.get('summary')||'').trim(),body:String(d.get('body')||'').trim(),image_url:url||null,banner_url:bannerUrl||null,tagged_fighter_ids:taggedIds,is_published:d.has('is_published'),updated_at:new Date().toISOString()};
    if(payload.is_published)payload.published_at=new Date().toISOString();
    const q=id?db.from('ucs_news').update(payload).eq('id',id):db.from('ucs_news').insert(payload);
    const {error}=await q;if(error)throw error;
    resetNewsEditor();await loadPublicData();toast(id?'Article updated.':'Article published.');
  }catch(error){toast(error.message||'Could not save article.',true);}
  finally{button.disabled=false;}
});

function populateConcludeScheduledBoutSelect(){
  const select=$('#ucsConcludeBoutSelect');if(!select)return;
  const current=select.value;
  const upcoming=state.scheduledBouts.filter(b=>b.status==='scheduled');
  select.innerHTML='<option value="">SELECT SCHEDULED FIGHT</option>'+upcoming.map(b=>{
    const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
    return '<option value="'+esc(b.id)+'">'+esc(a?.name||'TBA')+' VS '+esc(c?.name||'TBA')+' — '+esc(b.event_name||'UCS')+'</option>';
  }).join('');
  if(upcoming.some(b=>b.id===current))select.value=current;
  updateConcludeScheduledBout();
}
function updateConcludeScheduledBout(){
  const form=$('#concludeScheduledBoutForm');if(!form)return;
  const b=state.scheduledBouts.find(x=>x.id===form.elements.bout_id.value&&x.status==='scheduled');
  const winner=form.elements.winner_id,previous=winner.value;
  winner.innerHTML='<option value="">SELECT WINNER</option>'+(b?[b.fighter_a_id,b.fighter_b_id].map(id=>{
    const fighter=fighterById(id);return '<option value="'+esc(id)+'">'+esc(fighter?.name||'TBA')+'</option>';
  }).join(''):'');
  if(b&&[b.fighter_a_id,b.fighter_b_id].includes(previous))winner.value=previous;
  form.elements.event_date.value=b?.bout_date||new Date().toISOString().slice(0,10);
}
$('#ucsConcludeBoutSelect')?.addEventListener('change',updateConcludeScheduledBout);
$('#concludeScheduledBoutForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('Admin permission required.',true);
  const form=e.currentTarget,button=form.querySelector('[type="submit"]'),data=new FormData(form);
  const bout=state.scheduledBouts.find(b=>b.id===data.get('bout_id')&&b.status==='scheduled');
  if(!bout)return toast('Select an upcoming scheduled fight.',true);
  const winnerId=data.get('winner_id');
  if(![bout.fighter_a_id,bout.fighter_b_id].includes(winnerId))return toast('Select one of the two scheduled fighters.',true);
  const winner=fighterById(winnerId),loser=fighterById(winnerId===bout.fighter_a_id?bout.fighter_b_id:bout.fighter_a_id);
  if(!confirm('CONCLUDE '+(bout.event_name||'UCS')+'?\\n\\nWINNER: '+(winner?.name||'TBA')+'\\nLOSER: '+(loser?.name||'TBA')+'\\nMETHOD: '+data.get('method')+'\\n\\nThis permanently publishes the result and updates both fighter records and rankings.'))return;
  button.disabled=true;
  try{
    const {error}=await db.rpc('conclude_ucs_scheduled_bout',{p_bout_id:bout.id,p_winner_id:winnerId,p_method:data.get('method'),p_event_date:data.get('event_date')});
    if(error)throw error;
    await loadPublicData();toast('Fight concluded. Official result and rankings updated.');
  }catch(error){toast('Could not conclude fight: '+(error.message||error),true);}
  finally{button.disabled=false;}
});
function populateScheduledBoutSelect(){
  const select=$('#scheduledBoutSelect');if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">Select scheduled fight</option>'+state.scheduledBouts.map(b=>{
    const a=fighterById(b.fighter_a_id),c=fighterById(b.fighter_b_id);
    return `<option value="${esc(b.id)}">${esc(a?.name||'TBA')} vs ${esc(c?.name||'TBA')} (${esc(b.belt||'non-title')}${b.is_title_eliminator?' — TITLE ELIMINATOR':''})</option>`;
  }).join('');
  if(state.scheduledBouts.some(b=>b.id===current))select.value=current;
  else if(state.scheduledBouts.length)select.value=state.scheduledBouts[0].id;
  fillScheduledBoutEditor();
  ucsFillBoutStudioSelect();
}
function fillScheduledBoutEditor(){
  const form=$('#editScheduledBoutForm');if(!form)return;
  const b=state.scheduledBouts.find(x=>x.id===$('#scheduledBoutSelect').value);
  for(const field of ['event_name','bout_date','belt','poster_url','contribution_url'])form.elements[field].value=b?.[field]||'';
  form.elements.is_title_eliminator.value=b?.is_title_eliminator?'true':'false';
  form.elements.is_co_main.value=b?.is_co_main?'true':'false';
  if(form.elements.poster_file)form.elements.poster_file.value='';
  updateBoutPosterPreview();
}
$('#scheduledBoutSelect')?.addEventListener('change',fillScheduledBoutEditor);
function updateBoutPosterPreview(file=null){
  const box=$('#ucsBoutPosterPreview');
  if(!box)return;
  if(window._ucsBoutPosterPreviewUrl)URL.revokeObjectURL(window._ucsBoutPosterPreviewUrl);
  window._ucsBoutPosterPreviewUrl=file?URL.createObjectURL(file):null;
  const existing=state.scheduledBouts.find(b=>b.id===$('#scheduledBoutSelect')?.value);
  const url=window._ucsBoutPosterPreviewUrl||(safeHttps(existing?.poster_url)?existing.poster_url:null);
  box.innerHTML=url?`<img src="${esc(url)}" alt="Fight poster banner preview" loading="lazy"><span>${file?'NEW BANNER PREVIEW':'CURRENT FIGHT POSTER'}</span>`:'<small>No fight poster uploaded for this bout yet.</small>';
}
$('#ucsBoutPosterFile')?.addEventListener('change',e=>updateBoutPosterPreview(e.target.files?.[0]||null));


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

$('#ucsDiscordSignIn')?.addEventListener('click',async()=>{
 if(!db)return toast('Discord login is not configured yet.',true);
 const {error}=await db.auth.signInWithOAuth({provider:'discord',options:{redirectTo:window.location.origin+'/?ucs_discord_login=1',scopes:'identify email'}});
 if(error)toast(error.message,true);
});

let ucsSessionRefreshInFlight=null;
async function refreshSession(){
  if(ucsSessionRefreshInFlight)return ucsSessionRefreshInFlight;
  ucsSessionRefreshInFlight=refreshSessionInner().finally(()=>{ucsSessionRefreshInFlight=null;});
  return ucsSessionRefreshInFlight;
}
async function refreshSessionInner(){
  if(!db){updateAdminUI();updateAccountUI();updatePhotographerUI();return;}
  const params=new URLSearchParams(location.search);
  // Supabase JS handles the OAuth callback during client initialization.
  // Avoid exchanging the same authorization code a second time.
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(session&&params.has('code')){params.delete('code');params.set('ucs_discord_login','1');history.replaceState(null,'',location.pathname+'?'+params.toString());}
  if(sessionError)console.error('UCS login session:',sessionError.message);
  state.user=session?.user||null;state.isAdmin=false;state.profile=null;state.myFighter=null;state.wallet=null;state.userBets=[];state.fighterContracts=[];state.canPhotograph=false;
  if(state.user){
    const [{data:profile,error:profileError},{data:myFighter}]=await Promise.all([
      db.from('profiles').select('id,is_admin,display_name,region,platform,avatar_url').eq('id',state.user.id).single(),
      db.from('fighters').select('*').eq('user_id',state.user.id).maybeSingle()
    ]);
    if(!profileError&&profile){state.profile=profile;state.isAdmin=Boolean(profile.is_admin);}state.myFighter=myFighter||null;
    try{const {data:photoPermission}=await db.rpc('is_ucs_photographer');state.canPhotograph=Boolean(photoPermission);}catch(error){console.warn('Photographer role:',error.message);}
    if(state.user.app_metadata?.provider==='discord'||state.user.identities?.some(identity=>identity.provider==='discord')){
      const {data:claimedId,error:claimError}=await db.rpc('ucs_claim_discord_fighter');
      if(claimError)console.warn('Discord fighter link:',claimError.message);
      if(claimedId){const {data:linked}=await db.from('fighters').select('*').eq('id',claimedId).maybeSingle();if(linked)state.myFighter=linked;}
    }
    try{await refreshWallet();}catch(error){console.warn('Wallet:',error.message);}
    try{await refreshContracts();}catch(error){console.warn('Contracts:',error.message);}
  } else {renderBets();renderContractCenter();}
  updateAdminUI();updateAccountUI();updatePhotographerUI();
  if(state.myFighter&&(state.user?.app_metadata?.provider==='discord'||state.user?.identities?.some(identity=>identity.provider==='discord'))&&(location.hash==='#account'||new URLSearchParams(location.search).has('ucs_discord_login'))){
    showPage('rankings');history.replaceState(null,'','#fighter/'+encodeURIComponent(state.myFighter.id));openFighterProfile(state.myFighter.id);
  }
}
function updateAdminUI(){
  $('#loginForm').classList.toggle('hidden',Boolean(state.user));$('#adminSession').classList.toggle('hidden',!state.user);$('#adminIdentity').textContent=state.user?`${state.user.email}${state.isAdmin?' · ADMIN':' · NOT ADMIN'}`:'';$('#adminControls').classList.toggle('hidden',!state.isAdmin);if(!state.isAdmin){ucsEarningsState.records=new Map();ucsEarningsState.loaded=false;ucsShowAdminTab('operations');}$('#adminLocked').classList.toggle('hidden',state.isAdmin);
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

$('#adminFighterBannerFile')?.addEventListener('change',e=>{
  const preview=$('#adminFighterBannerPreview'),file=e.target.files?.[0];
  if(!preview)return;
  if(window._ucsBannerPreviewUrl)URL.revokeObjectURL(window._ucsBannerPreviewUrl);
  window._ucsBannerPreviewUrl=file?URL.createObjectURL(file):null;
  preview.innerHTML=file?`<img src="${window._ucsBannerPreviewUrl}" alt="Fighter banner preview"><span>${esc(file.name)}</span>`:'';
});
$('#adminFighterBannerForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!state.user||!state.isAdmin)return toast('UCS admin permission required.',true);
  const form=e.currentTarget,data=new FormData(form);
  const fighter=fighterById(data.get('fighter_id'));
  const file=$('#adminFighterBannerFile')?.files?.[0];
  const submit=$('#adminFighterBannerSubmit');
  if(!fighter)return toast('Choose a fighter.',true);
  if(!file)return toast('Select a banner image.',true);
  const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  const extension=extensions[file.type];
  if(!extension||file.size===0||file.size>5*1024*1024)return toast('Upload a JPG, PNG or WebP banner up to 5 MB.',true);
  submit.disabled=true;
  submit.textContent='UPLOADING...';
  try{
    const path=`admin/${fighter.id}/banners/${crypto.randomUUID()}.${extension}`;
    const {error:uploadError}=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
    if(uploadError)throw uploadError;
    const {data:publicData}=db.storage.from('fighter-avatars').getPublicUrl(path);
    const {error:saveError}=await db.from('fighters').update({banner_url:publicData.publicUrl,updated_at:new Date().toISOString()}).eq('id',fighter.id);
    if(saveError)throw saveError;
    form.reset();
    $('#adminFighterBannerPreview').innerHTML='';
    if(window._ucsBannerPreviewUrl)URL.revokeObjectURL(window._ucsBannerPreviewUrl);
    window._ucsBannerPreviewUrl=null;
    await loadPublicData();
    toast(`${fighter.name} banner updated!`);
  }catch(error){toast(error.message||'Could not upload fighter banner.',true);}
  finally{submit.disabled=false;submit.textContent='UPLOAD FIGHTER BANNER';}
});

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
  const earnings=tab==='earnings'&&state.isAdmin,news=tab==='news'&&state.isAdmin,event=tab==='event'&&state.isAdmin,results=tab==='results'&&state.isAdmin;
  $('#adminOperationsPanel')?.classList.toggle('hidden',earnings||news||event||results);
  for(const [id,active] of [['adminEarningsPanel',earnings],['adminNewsPanel',news],['adminEventHeroPanel',event],['adminEventResultsPanel',results]]){
    $('#'+id)?.classList.toggle('hidden',!active);
    $('#'+id)?.setAttribute('aria-hidden',String(!active));
  }
  for(const [id,active] of [['adminOperationsTab',!earnings&&!news&&!event&&!results],['adminEarningsTab',earnings],['adminNewsTab',news],['adminEventHeroTab',event],['adminEventResultsTab',results]]){
    $('#'+id)?.classList.toggle('active',active);
    $('#'+id)?.setAttribute('aria-selected',String(active));
  }
  if(earnings)ucsLoadEarnings();
  if(news)renderNews();
  if(event)ucsRenderEventHero();
  if(results){ucsRenderEventCards();ucsPopulateEventWinners();}
}
function ucsFormatEarnings(value){
  return String.fromCharCode(36)+Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
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
$('#adminEventHeroTab')?.addEventListener('click',()=>ucsShowAdminTab('event'));
$('#adminEventResultsTab')?.addEventListener('click',()=>ucsShowAdminTab('results'));
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
$('#championForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!state.isAdmin)return toast('Admin permission required.',true);
  const form=e.target,d=new FormData(form),button=form.querySelector('[type="submit"]');
  const division=String(d.get('division')),fighterId=String(d.get('fighter_id'));
  if(division==='UCS Offline'){
    const file=d.get('showcase_image');
    const current=state.settings?.ucs_offline_champion||'';
    const button=form.querySelector('[type="submit"]');
    button.disabled=true;
    try{
      let photo=state.settings?.ucs_offline_champion_image||'';
      if(file instanceof File&&file.size){
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Use PNG, JPG or WEBP under 5 MB.');
        const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
        const path='admin/offline-champion/'+crypto.randomUUID()+'.'+ext;
        const {error}=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,upsert:false});
        if(error)throw error;
        photo=db.storage.from('fighter-avatars').getPublicUrl(path).data.publicUrl;
      }else if(current!==fighterId)photo='';
      const values={ucs_offline_champion:fighterId,ucs_offline_champion_image:photo,ucs_offline_champion_flag:String(d.get('showcase_flag')||''),ucs_offline_champion_portrait_y:Number(d.get('portrait_y'))||50};
      for(const [key,value] of Object.entries(values)){const {error}=await db.from('league_settings').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});if(error)throw error;}
      toast('UCS Offline champion granted.');await loadPublicData();
    }catch(error){toast(error.message||'Could not grant offline champion.',true)}finally{button.disabled=false;}
    return;
  }
  const existing=state.champions.find(c=>c.division===division);
  const payload={division,fighter_id:fighterId,defenses:+d.get('defenses')||0,showcase_flag:String(d.get('showcase_flag')||''),portrait_y:Math.min(100,Math.max(0,Number(d.get('portrait_y'))||50)),granted_at:new Date().toISOString()};
  const file=d.get('showcase_image');
  button.disabled=true;
  try{
    if(file instanceof File&&file.size){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPG or WEBP images.');
      if(file.size>5*1024*1024)throw new Error('Champion image must be under 5 MB.');
      const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
      const path='admin/champion-showcase/'+crypto.randomUUID()+'.'+ext;
      const {error:uploadError}=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      payload.showcase_image_url=db.storage.from('fighter-avatars').getPublicUrl(path).data.publicUrl;
    }else if(existing?.fighter_id===fighterId&&existing.showcase_image_url){
      payload.showcase_image_url=existing.showcase_image_url;
    }else{
      payload.showcase_image_url=null;
    }
    const {error}=await db.from('champions').upsert(payload,{onConflict:'division'});
    if(error)throw error;
    await db.rpc('recalculate_ucs_rankings');
    toast(division+' champion granted.');form.querySelector('[name="showcase_image"]').value='';
    await loadPublicData();
  }catch(error){toast(error.message||'Could not save champion image.',true)}
  finally{button.disabled=false}
});
$('#vacateTitleBtn')?.addEventListener('click',async()=>{const f=$('#championForm'),division=new FormData(f).get('division');if(!state.isAdmin)return;if(division==='UCS Offline'){const {error}=await db.from('league_settings').upsert({key:'ucs_offline_champion',value:'',updated_at:new Date().toISOString()},{onConflict:'key'});if(error)return toast(error.message,true);toast('UCS Offline title vacated.');await loadPublicData();return;}const {error}=await db.from('champions').upsert({division,fighter_id:null,defenses:0,showcase_image_url:null,showcase_flag:null,granted_at:new Date().toISOString()},{onConflict:'division'});if(error)return toast(error.message,true);await db.rpc('recalculate_ucs_rankings');toast(`${division} title vacated.`);await loadPublicData();});
$('#resultForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);if(d.get('winner_id')===d.get('loser_id'))return toast('Winner and loser must be different.',true);if(!state.isAdmin)return toast('Admin permission required.',true);const {error}=await db.rpc('publish_ucs_result',{p_winner_id:d.get('winner_id'),p_loser_id:d.get('loser_id'),p_method:d.get('method'),p_event_date:d.get('event_date')});if(error)return toast(error.message,true);toast('Result published, records and rankings updated.');await loadPublicData();});
$('#scheduleBoutForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('UCS admin required.',true);
  const d=new FormData(e.currentTarget),a=d.get('fighter_a_id'),b=d.get('fighter_b_id');
  if(a===b)return toast('Select two different fighters.',true);
  if(d.get('is_title_eliminator')==='true'&&!d.get('belt'))return toast('Choose which championship the eliminator is for.',true);
  const url=(d.get('contribution_url')||'').trim();
  if(url&&!safeHttps(url))return toast('Use a valid HTTPS contribution link.',true);
  const payload={fighter_a_id:a,fighter_b_id:b,event_name:d.get('event_name').trim(),bout_date:d.get('bout_date')||null,belt:d.get('belt')||null,is_title_eliminator:d.get('is_title_eliminator')==='true',contribution_url:url||null,is_co_main:d.get('is_co_main')==='true'};
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
  if(d.get('is_title_eliminator')==='true'&&!d.get('belt'))return toast('Choose which championship the eliminator is for.',true);
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
    const payload={event_name:d.get('event_name').trim(),bout_date:d.get('bout_date')||null,belt:d.get('belt')||null,is_title_eliminator:d.get('is_title_eliminator')==='true',poster_url:posterUrl||null,contribution_url:contribution||null,is_co_main:d.get('is_co_main')==='true',updated_at:new Date().toISOString()};
    const {error}=await db.from('scheduled_bouts').update(payload).eq('id',boutId);
    if(error)throw error;
    await loadPublicData();updateBoutPosterPreview();toast('Scheduled bout updated. Poster banner refreshed.');
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
    .on('postgres_changes',{event:'*',schema:'public',table:'fighter_earnings'},refreshMatchupsFromDb)
    .on('postgres_changes',{event:'*',schema:'public',table:'ucs_news'},refreshMatchupsFromDb)
    .on('postgres_changes',{event:'*',schema:'public',table:'scheduled_bouts'},refreshMatchupsFromDb)
    .on('postgres_changes',{event:'*',schema:'public',table:'league_settings'},refreshMatchupsFromDb)
    .on('postgres_changes',{event:'*',schema:'public',table:'champions'},refreshMatchupsFromDb)
    .on('postgres_changes',{event:'*',schema:'public',table:'ucs_former_championships'},refreshMatchupsFromDb)
    .subscribe();
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')refreshMatchupsFromDb();
  });
}
(async function init(){
  try{ucsMountHomeTwitch();}catch(error){console.error('UCS player',error);}
  try{await loadPublicData();}catch(error){console.error('UCS public rankings/events load',error);}
  try{renderAll();}catch(error){console.error('UCS render',error);}
  try{if(location.hash.startsWith('#fighter/')){showPage('rankings');openFighterProfile(decodeURIComponent(location.hash.slice(9)));}else if(location.hash.startsWith('#bout/'))ucsOpenBout(decodeURIComponent(location.hash.slice(6)));else if(location.hash&&$(location.hash))showPage(location.hash.slice(1));}catch(error){console.error('UCS navigation',error);}
  try{updateAdminUI();await refreshSession();}catch(error){console.error('UCS account',error);}
})();

$('#ucsEventPosterInput')?.addEventListener('change',e=>{
  const file=e.target.files?.[0],preview=$('#ucsEventPosterPreview');if(!preview)return;
  if(!file){preview.textContent='No poster selected';return;}
  const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{preview.replaceChildren(img);if(img.naturalWidth!==1920||img.naturalHeight!==1080)toast('1920 × 1080 is recommended, but other dimensions are allowed.');URL.revokeObjectURL(url);};img.onerror=()=>{preview.textContent='Could not preview image';URL.revokeObjectURL(url);};img.src=url;
});
$('#ucsEventHeroForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!db||!state.isAdmin)return toast('Admin access required.',true);
  const form=e.currentTarget,button=form.querySelector('[type="submit"]'),data=new FormData(form),file=data.get('poster'),old=ucsFeaturedEvent()||{};
  const local=String(data.get('event_at')||'');const eventDate=new Date(local);
  if(!local||Number.isNaN(eventDate.getTime()))return toast('Choose a valid event date.',true);
  let posterUrl=old.poster_url||null;button.disabled=true;
  try{
    if(file instanceof File&&file.size){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use JPG, PNG or WEBP.');
      if(file.size>8*1024*1024)throw Error('Poster must be 8 MB or smaller.');
      const dimensions=await new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{resolve([img.naturalWidth,img.naturalHeight]);URL.revokeObjectURL(url)};img.onerror=()=>{reject(Error('Could not read poster'));URL.revokeObjectURL(url)};img.src=url});
      if(dimensions[0]!==1920||dimensions[1]!==1080)toast('Non-standard poster size accepted. It will be fitted to the banner.');
      const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
      const path='event-posters/'+crypto.randomUUID()+'.'+ext;
      const uploaded=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,upsert:false});
      if(uploaded.error)throw uploaded.error;
      posterUrl=db.storage.from('fighter-avatars').getPublicUrl(path).data.publicUrl;
    }
    const value={title:String(data.get('title')||'UCS FIGHT NIGHT').trim().slice(0,100),event_at:eventDate.toISOString(),poster_url:posterUrl,visible:data.has('visible')};
    const {error}=await db.from('league_settings').upsert({key:'featured_event_poster',value,updated_at:new Date().toISOString()},{onConflict:'key'});
    if(error)throw error;
    toast('Event poster and countdown saved.');form.elements.poster.value='';await loadPublicData();
  }catch(err){toast(err.message||'Could not save event poster',true)}finally{button.disabled=false}
});
$('#ucsEventHideBtn')?.addEventListener('click',async()=>{
  if(!db||!state.isAdmin)return;
  const value={...(ucsFeaturedEvent()||{}),visible:false};
  const {error}=await db.from('league_settings').upsert({key:'featured_event_poster',value,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error)return toast(error.message,true);
  await loadPublicData();toast('Event poster hidden.');
});

let ucsBoutReturnPage='rankings';
let ucsCurrentBoutId=null;
function ucsBoutPortrait(f,url,side){
  const src=safeHttps(url)?url:(safeHttps(f?.avatar_url)?f.avatar_url:null);
  return `<div class="ucs-bout-poster ucs-bout-poster-${side}"><div class="ucs-bout-poster-art">${src?`<img src="${esc(src)}" alt="${esc(f?.name||'Fighter')} fight portrait">`:`<span class="ucs-bout-poster-placeholder">${esc(initials(f?.name||'UCS'))}</span>`}</div><div class="ucs-bout-poster-info"><span>${side==='red'?'RED CORNER':'BLUE CORNER'}</span><strong>${esc(f?.name||'TBA')}</strong><small>${f?esc(record(f)):'RECORD TBA'} · ${esc(f?.country||f?.region||'UCS')}</small></div></div>`;
}
function ucsOpenBout(id){
  const b=state.scheduledBouts.find(x=>x.id===id);
  if(!b)return toast('This bout is no longer scheduled.',true);
  ucsCurrentBoutId=id;
  ucsBoutReturnPage=$('#fighterModal')?.classList.contains('open')?'rankings':(document.querySelector('.page.active')?.id||'fights');
  closeFighterProfile();
  const fa=fighterById(b.fighter_a_id),fb=fighterById(b.fighter_b_id);
  const title=b.belt?b.belt+' CHAMPIONSHIP':b.is_title_eliminator?'TITLE ELIMINATOR':'OFFICIAL UCS BOUT';
  $('#ucsBoutDetail').innerHTML=`<div class="ucs-bout-heading"><span>UCS / OFFICIAL BOUT PROFILE</span><h1>${esc(title)}</h1><p>${esc(b.event_name||'UCS Fight Night')} · ${esc(b.bout_date?fmtDate(b.bout_date):'DATE TBA')}</p></div><div class="ucs-bout-posters">${ucsBoutPortrait(fa,b.fighter_a_bout_image,'red')}<div class="ucs-bout-center"><span>${b.belt?'★ TITLE ON THE LINE':'FIGHT NIGHT'}</span><strong class="ucs-red-vs-logo" role="img" aria-label="VS"></strong><small>${esc(b.bout_date?fmtDate(b.bout_date):'DATE TBA')}</small></div>${ucsBoutPortrait(fb,b.fighter_b_bout_image,'blue')}</div><div class="ucs-bout-facts"><div><span>FIGHT TYPE</span><strong>${esc(b.belt?'TITLE BOUT':b.is_title_eliminator?'TITLE ELIMINATOR':'REGULAR BOUT')}</strong></div><div><span>CHAMPIONSHIP</span><strong>${esc(b.belt||'NONE')}</strong></div><div><span>SCHEDULED ROUNDS</span><strong>${b.scheduled_rounds?esc(b.scheduled_rounds)+' ROUNDS':'TBA'}</strong></div><div><span>STATUS</span><strong>SCHEDULED</strong></div></div><p class="ucs-bout-disclaimer">Official scheduled bout details. Fighter images and round counts are managed by UCS administrators. Results and records are not affected.</p>${boutLink(b)}`;
  showPage('bout');history.replaceState(null,'','#bout/'+encodeURIComponent(id));
}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-see-bout]');if(btn){e.preventDefault();ucsOpenBout(btn.dataset.seeBout);}});
$('#ucsBoutBack')?.addEventListener('click',()=>{showPage(ucsBoutReturnPage);history.replaceState(null,'','#'+ucsBoutReturnPage);});

function ucsFillBoutStudioSelect(){
 const el=$('#ucsBoutStudioSelect');if(!el)return;
 const old=el.value;
 el.innerHTML='<option value="">SELECT A BOUT</option>'+state.scheduledBouts.map(b=>'<option value="'+esc(b.id)+'">'+esc(fighterById(b.fighter_a_id)?.name||'TBA')+' VS '+esc(fighterById(b.fighter_b_id)?.name||'TBA')+'</option>').join('');
 el.value=state.scheduledBouts.some(b=>b.id===old)?old:(state.scheduledBouts[0]?.id||'');
 ucsFillBoutStudio();
}
function ucsFillBoutStudio(){
 const form=$('#ucsBoutStudioForm');if(!form)return;
 const b=state.scheduledBouts.find(x=>x.id===form.elements.bout_id.value);
 form.elements.scheduled_rounds.value=b?.scheduled_rounds??'';
 for(const field of ['fighter_a_bout_image','fighter_b_bout_image'])form.elements[field].value=b?.[field]||'';
 for(const field of ['fighter_a_bout_file','fighter_b_bout_file'])form.elements[field].value='';
 form.elements.remove_red_portrait.checked=false;
 form.elements.remove_blue_portrait.checked=false;
 $('#ucsStudioRedName').textContent=fighterById(b?.fighter_a_id)?.name||'TBA';
 $('#ucsStudioBlueName').textContent=fighterById(b?.fighter_b_id)?.name||'TBA';
}
$('#ucsBoutStudioSelect')?.addEventListener('change',ucsFillBoutStudio);
$('#ucsStudioViewBout')?.addEventListener('click',()=>{const id=$('#ucsBoutStudioSelect')?.value;if(id)ucsOpenBout(id);});
$('#ucsBoutStudioForm')?.addEventListener('submit',async e=>{
 e.preventDefault();if(!db||!state.isAdmin)return toast('UCS admin required.',true);
 const form=e.currentTarget,d=new FormData(form),boutId=d.get('bout_id');
 if(!state.scheduledBouts.some(b=>b.id===boutId))return toast('Select a scheduled bout.',true);
 const raw=String(d.get('scheduled_rounds')||'').trim(),rounds=raw?Number(raw):null;
 if(raw&&(!Number.isInteger(rounds)||rounds<1||rounds>15))return toast('Rounds must be between 1 and 15.',true);
 const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{
  const payload={scheduled_rounds:rounds,updated_at:new Date().toISOString()};
  for(const field of ['fighter_a_bout_image','fighter_b_bout_image']){
   let url=String(d.get(field)||'').trim();
   if(url&&!safeHttps(url))throw Error('Image URL must use HTTPS.');
   const file=d.get(field.replace('_image','_file'));
   if(file instanceof File&&file.size){
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
    if(!ext||file.size>5*1024*1024)throw Error('Portraits must be JPG, PNG or WebP under 5 MB.');
    const path=`bout-fighters/${boutId}/${field}/${crypto.randomUUID()}.${ext}`;
    const {error}=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,upsert:false});
    if(error)throw error;
    url=db.storage.from('fighter-avatars').getPublicUrl(path).data.publicUrl;
   }
   if(d.get(field==='fighter_a_bout_image'?'remove_red_portrait':'remove_blue_portrait')==='on')url='';
   payload[field]=url||null;
  }
  const {error}=await db.from('scheduled_bouts').update(payload).eq('id',boutId);
  if(error)throw error;
  await loadPublicData();toast('Bout profile saved successfully.');
 }catch(err){toast(err.message||'Could not save bout profile.',true);}finally{button.disabled=false;}
});

function ucsFillBeltArtForm(){
 const form=$('#ucsBeltArtForm');if(!form)return;
 const art=state.settings?.championship_belt_art||{};
 form.elements.world_url.value=safeHttps(art.world)?art.world:'';
 form.elements.international_url.value=safeHttps(art.international)?art.international:'';
 for(const [key,field] of [['eu','eu_url'],['sim_world','sim_world_url']])if(form.elements[field])form.elements[field].value=safeHttps(art[key])?art[key]:'';
}
$('#ucsBeltArtForm')?.addEventListener('submit',async e=>{
 e.preventDefault();if(!db||!state.isAdmin)return toast('UCS admin required.',true);
 const form=e.currentTarget,d=new FormData(form),button=form.querySelector('[type="submit"]');
 button.disabled=true;
 try{
  const current=state.settings?.championship_belt_art||{};
  const art={...current};
  for(const type of ['world','international','eu','sim_world']){
   let url=String(d.get(type+'_url')||'').trim();
   if(url&&!safeHttps(url))throw Error('Belt image URL must use HTTPS.');
   const file=d.get(type+'_file');
   if(file instanceof File&&file.size){
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
    if(!ext||file.size>5*1024*1024)throw Error('Belt images must be JPG, PNG or WebP under 5 MB.');
    const path='championship-belts/'+type+'/'+crypto.randomUUID()+'.'+ext;
    const {error}=await db.storage.from('fighter-avatars').upload(path,file,{contentType:file.type,upsert:false});
    if(error)throw error;
    url=db.storage.from('fighter-avatars').getPublicUrl(path).data.publicUrl;
   }
   if(url)art[type]=url;
  }
  const {error}=await db.from('league_settings').upsert({key:'championship_belt_art',value:art,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error)throw error;
  state.settings.championship_belt_art=art;
  renderRankingChampion();renderChampionShowcase();ucsRenderHomeChampion();ucsFillBeltArtForm();
  toast('Official championship belt artwork saved.');
 }catch(err){toast(err.message||'Could not save belt artwork.',true);}finally{button.disabled=false;}
});

/* UCS poster generator: deterministic, editable client-side artwork, no AI service required. */
function ucsPosterFill(){
 const form=$('#ucsPosterForm');if(!form)return;
 const fighters=[...state.fighters].sort((x,y)=>String(x.name).localeCompare(String(y.name)));
 const choices='<option value="">SELECT FIGHTER</option>'+fighters.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join('');
 for(const name of ['red','blue']){const sel=form.elements[name],prior=sel.value;sel.innerHTML=choices;if(fighters.some(f=>String(f.id)===prior))sel.value=prior;}
 const divisions=[...new Set([...ucsDivisions(),'UCS EU Division'])],sel=form.elements.division,prior=sel.value;
 sel.innerHTML=divisions.map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join('');
 if(divisions.includes(prior))sel.value=prior;
 ucsPosterToggle();
}
function ucsPosterToggle(){const f=$('#ucsPosterForm');if(!f)return;f.elements.division.disabled=f.elements.bout_type.value!=='title';}
$('#ucsPosterType')?.addEventListener('change',ucsPosterToggle);
function ucsPosterImage(src){return new Promise(resolve=>{
 if(!src)return resolve(null);
 const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src=src;
});}
function ucsPosterFitText(ctx,text,x,y,maxWidth,size,minSize=28){
 ctx.font='900 '+size+'px Impact, "Arial Narrow", sans-serif';
 while(ctx.measureText(text).width>maxWidth&&size>minSize){size-=2;ctx.font='900 '+size+'px Impact, "Arial Narrow", sans-serif';}
 ctx.fillText(text,x,y);
}
function ucsPosterDrawImage(ctx,im,x,y,w,h,contain=false){
 if(!im)return;
 const ratio=contain?Math.min(w/im.width,h/im.height):Math.max(w/im.width,h/im.height);
 const dw=im.width*ratio,dh=im.height*ratio;
 ctx.drawImage(im,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
async function ucsPosterGenerate(e){
 e?.preventDefault();
 const f=$('#ucsPosterForm'),canvas=$('#ucsPosterCanvas'),status=$('#ucsPosterStatus');
 const red=fighterById(f.elements.red.value),blue=fighterById(f.elements.blue.value);
 if(!red||!blue||red.id===blue.id){status.textContent='Choose two different fighters.';return;}
 const title=f.elements.bout_type.value==='title',division=f.elements.division.value;
 const button=f.querySelector('[type="submit"]');button.disabled=true;status.textContent='Composing fight poster…';
 try{
  const pick=(file,fighter)=>file?.size?URL.createObjectURL(file):[fighter.showcase_image_url,fighter.profile_image_url,fighter.avatar_url].find(safeHttps);
  const redFile=f.elements.red_file.files[0],blueFile=f.elements.blue_file.files[0];
  if([redFile,blueFile].some(file=>file&&file.size>8*1024*1024))throw Error('Each fighter portrait must be under 8 MB.');
  const redUrl=pick(redFile,red),blueUrl=pick(blueFile,blue);
  const [redIm,blueIm,beltIm]=await Promise.all([ucsPosterImage(redUrl),ucsPosterImage(blueUrl),ucsPosterImage(title?ucsBeltArt(division):null)]);
  if(redFile)URL.revokeObjectURL(redUrl);if(blueFile)URL.revokeObjectURL(blueUrl);
  const ctx=canvas.getContext('2d');const W=1080,H=1350;ctx.clearRect(0,0,W,H);
  const gold=f.elements.theme.value==='gold',accent=gold?'#e9be62':'#f02d55';
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#19171e');bg.addColorStop(.5,'#090a10');bg.addColorStop(1,gold?'#322416':'#310e1c');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.globalAlpha=.14;ctx.strokeStyle=accent;ctx.lineWidth=2;for(let x=-1300;x<1400;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+1350,H);ctx.stroke();}ctx.restore();
  ctx.fillStyle=accent;ctx.fillRect(58,62,90,7);ctx.fillStyle='#fff';ctx.textAlign='center';
  ctx.font='900 112px Impact, "Arial Narrow", sans-serif';ctx.fillText('UCS',540,170);
  ctx.fillStyle=accent;ctx.font='bold 22px Arial,sans-serif';ctx.letterSpacing='7px';ctx.fillText('UNDISPUTED CHAMPIONSHIP SERIES',540,218);ctx.letterSpacing='0px';
  ctx.fillStyle='#d4d2da';ctx.font='bold 25px Arial,sans-serif';ctx.fillText(String(f.elements.event.value||'UCS FIGHT NIGHT').toUpperCase().slice(0,65),540,285);
  ctx.fillStyle=accent;ctx.fillRect(70,319,940,3);
  const drawFighter=(im,x,side)=>{
    ctx.save();ctx.beginPath();ctx.rect(x,350,460,650);ctx.clip();
    const grad=ctx.createLinearGradient(x,350,x+460,1000);grad.addColorStop(0,side==='red'?'#4a1b2a':'#182946');grad.addColorStop(1,'#0a0b10');ctx.fillStyle=grad;ctx.fillRect(x,350,460,650);
    if(im)ucsPosterDrawImage(ctx,im,x,350,460,650,true);
    else{ctx.fillStyle='#ffffff22';ctx.font='bold 170px Impact';ctx.textAlign='center';ctx.fillText('?',x+230,690);}
    const fade=ctx.createLinearGradient(0,740,0,1010);fade.addColorStop(0,'#090a1000');fade.addColorStop(1,'#090a10');ctx.fillStyle=fade;ctx.fillRect(x,740,460,270);
    ctx.restore();
  };
  drawFighter(redIm,70,'red');drawFighter(blueIm,550,'blue');
  ctx.textAlign='center';ctx.fillStyle=accent;ctx.font='900 32px Impact';ctx.fillText('VS',540,705);
  if(title&&beltIm){ctx.save();ctx.shadowColor='#000';ctx.shadowBlur=24;ucsPosterDrawImage(ctx,beltIm,385,770,310,180,true);ctx.restore();}
  ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=18;ucsPosterFitText(ctx,String(red.name).toUpperCase(),300,1072,455,82);ucsPosterFitText(ctx,String(blue.name).toUpperCase(),780,1072,455,82);ctx.shadowBlur=0;
  ctx.font='bold 23px Arial,sans-serif';ctx.fillStyle='#d5cbd0';ctx.fillText(record(red),300,1111);ctx.fillText(record(blue),780,1111);
  ctx.fillStyle=accent;ctx.fillRect(75,1140,930,3);
  ctx.fillStyle='#fff';ctx.font='900 42px Impact';ctx.fillText(title?division.toUpperCase()+' CHAMPIONSHIP':'OFFICIAL UCS BOUT',540,1202);
  ctx.font='bold 25px Arial,sans-serif';ctx.fillStyle='#e5cda2';ctx.fillText(f.elements.rounds.value+' ROUNDS  •  '+(String(f.elements.event_details.value||'DATE TO BE ANNOUNCED').toUpperCase().slice(0,70)),540,1253);
  ctx.font='bold 17px Arial,sans-serif';ctx.fillStyle='#b7a6ad';ctx.fillText('OFFICIAL UCS FIGHT PROMOTION',540,1310);
  $('#ucsPosterDownload').disabled=false;status.textContent='Poster ready. Review the preview, then download your PNG.';
 }catch(err){status.textContent='Could not generate poster: '+err.message;}finally{button.disabled=false;}
}
$('#ucsPosterForm')?.addEventListener('submit',ucsPosterGenerate);
$('#ucsPosterDownload')?.addEventListener('click',()=>{
 const canvas=$('#ucsPosterCanvas');try{const link=document.createElement('a');link.download='UCS-Fight-Poster.png';link.href=canvas.toDataURL('image/png');link.click();}catch{$('#ucsPosterStatus').textContent='Export blocked by an external image. Upload the portraits as local files and try again.';}
});

/* Offline bouts: separate from official PRO result and ranking calculations. */
function ucsOfflineBouts(){return Array.isArray(state.settings?.ucs_offline_bouts)?state.settings.ucs_offline_bouts:[];}
function ucsOfflineFor(f){return [...ucsOfflineBouts().filter(r=>r.fighter_id===f.id||r.opponent_id===f.id),...(state.ucsDiscordOfflineByFighter?.[f.id]||[])];}
function ucsRenderDossierRecords(f){
 const mode=state.ucsRecordTab||'pro',offline=ucsOfflineFor(f),pro=fighterResults(f);
 const ow=offline.filter(r=>(r.fighter_id===f.id?r.result:r.result==='W'?'L':r.result==='L'?'W':'D')==='W').length;
 const ol=offline.filter(r=>(r.fighter_id===f.id?r.result:r.result==='W'?'L':r.result==='L'?'W':'D')==='L').length;
 const od=offline.length-ow-ol;
 const pw=Number(f.wins)||0,pl=Number(f.losses)||0,pd=Number(f.draws)||0;
 const w=mode==='pro'?pw:mode==='offline'?ow:pw+ow,l=mode==='pro'?pl:mode==='offline'?ol:pl+ol,d=mode==='pro'?pd:mode==='offline'?od:pd+od;
 [['#ucsDossierWins',w],['#ucsDossierLosses',l],['#ucsDossierDraws',d],['#profileRecord',w+'-'+l+'-'+d],['#profileFights',w+l+d]].forEach(([sel,val])=>{const el=$(sel);if(el)el.textContent=val;});
 const heading=$('#ucsDossierRecordHeading');if(heading)heading.textContent=mode==='pro'?'UCS PRO RECORD':mode==='offline'?'UCS OFFLINE RECORD':'ALL UCS BOUTS';
 $$('#ucsDossierTabs [data-ucs-record-tab]').forEach(b=>{const active=b.dataset.ucsRecordTab===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 const entries=[];
 if(mode!=='offline')for(const r of pro){const won=r.winner_id===f.id,opp=fighterById(won?r.loser_id:r.winner_id);entries.push({date:r.event_date,html:`<div class="profile-fight-row"><span class="result-pill ${won?'win':'loss'}">${won?'W':'L'}</span><div><strong>vs ${esc(opp?.name||'Unknown')}</strong><small><b class="ucs-bout-kind">PRO</b> ${esc(r.method||'Result')} · ${esc(fmtDate(r.event_date))}</small><small style="display:block"><img src="https://flagcdn.com/w40/gb.png" alt="UK flag" style="width:20px;height:14px;vertical-align:middle;margin-right:5px"> London, The O2 Arena</small></div></div>`});}
 if(mode!=='pro')for(const r of offline){const own=r.fighter_id===f.id,code=own?r.result:r.result==='W'?'L':r.result==='L'?'W':'D',opp=fighterById(own?r.opponent_id:r.fighter_id);entries.push({date:r.event_date,html:`<div class="profile-fight-row"><span class="result-pill ${code==='W'?'win':code==='L'?'loss':''}">${code}</span><div><strong>vs ${esc(opp?.name||'Unknown')}</strong><small><b class="ucs-bout-kind offline">OFFLINE</b> ${esc(r.method)} · ${esc(fmtDate(r.event_date))}</small><small>${esc(r.event_name||'Offline bout')}</small></div></div>`});}
 entries.sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')));
 const root=$('#profileFightHistory');if(root)root.innerHTML=entries.length?entries.slice(0,50).map(x=>x.html).join(''):empty('No '+(mode==='offline'?'offline':'recorded')+' bouts yet.');
}
$('#ucsDossierTabs')?.addEventListener('click',e=>{const b=e.target.closest('[data-ucs-record-tab]');if(!b||!state.ucsCurrentProfile)return;state.ucsRecordTab=b.dataset.ucsRecordTab;const f=fighterById(state.ucsCurrentProfile);if(f)ucsRenderDossierRecords(f);});
function ucsRenderOfflineAdminList(){
 const root=$('#ucsOfflineAdminList');if(!root)return;
 root.innerHTML=ucsOfflineBouts().slice().reverse().map(r=>`<div class="ucs-offline-admin-row"><span>${esc(fighterById(r.fighter_id)?.name||'Unknown')} vs ${esc(fighterById(r.opponent_id)?.name||'Unknown')} · ${esc(r.result)} · ${esc(r.event_date)}</span><button type="button" data-delete-offline="${esc(r.id)}">REMOVE</button></div>`).join('');
}
$('#ucsOfflineResultForm')?.addEventListener('submit',async e=>{
 e.preventDefault();if(!db||!state.isAdmin)return toast('Admin permission required.',true);
 const d=new FormData(e.currentTarget),fighter_id=String(d.get('fighter_id')),opponent_id=String(d.get('opponent_id'));
 if(!fighter_id||!opponent_id||fighter_id===opponent_id)return toast('Choose two different fighters.',true);
 const rows=[...ucsOfflineBouts(),{id:crypto.randomUUID(),fighter_id,opponent_id,result:String(d.get('result')),method:String(d.get('method')).trim().slice(0,80),event_date:String(d.get('event_date')),event_name:String(d.get('event_name')||'').slice(0,120)}];
 const {error}=await db.from('league_settings').upsert({key:'ucs_offline_bouts',value:rows,updated_at:new Date().toISOString()},{onConflict:'key'});
 if(error)return toast('Could not save offline result: '+error.message,true);
 e.currentTarget.reset();toast('Offline result saved.');await loadPublicData();ucsRenderOfflineAdminList();
});
$('#ucsOfflineAdminList')?.addEventListener('click',async e=>{
 const b=e.target.closest('[data-delete-offline]');if(!b||!state.isAdmin||!db)return;
 if(!confirm('Remove this offline result?'))return;
 const rows=ucsOfflineBouts().filter(r=>r.id!==b.dataset.deleteOffline);
 const {error}=await db.from('league_settings').upsert({key:'ucs_offline_bouts',value:rows,updated_at:new Date().toISOString()},{onConflict:'key'});
 if(error)return toast(error.message,true);await loadPublicData();ucsRenderOfflineAdminList();toast('Offline result removed.');
});

/* Retire the old SIM division from saved league settings on admin request. */
$('#ucsRemoveSimDivision')?.addEventListener('click',async()=>{
 if(!state.isAdmin||!db)return toast('Admin permission required.',true);
 const saved=state.settings.ranking_divisions;
 const next=(Array.isArray(saved)?saved:ucsDefaultDivisions).filter(x=>x!=='UCS SIM World');
 if(!confirm('Remove UCS SIM World from saved ranking divisions? Fighter records are preserved.'))return;
 await ucsSaveDivisions(next);
});

// Public Discord status is synced by the UCS bot; stale entries display as offline.
async function refreshUcsDiscordPresence(fighterId){
 if(!db)return;
 const {data,error}=await db.from('ucs_fighter_presence').select('status,updated_at').eq('fighter_id',fighterId).maybeSingle();
 const node=$('#ucsProfileDiscordPresence');
 if(!node||node.dataset.fighterId!==String(fighterId))return;
 const status=!error&&data&&Date.now()-new Date(data.updated_at).getTime()<10*60*1000?data.status:'offline';
 const labels={online:'🟢 Discord Online',idle:'🟡 Discord Idle',dnd:'🔴 Do Not Disturb',offline:'⚫ Discord Offline'};
 node.textContent=labels[status]||labels.offline;
 node.className='ucs-discord-presence '+status;
}
setInterval(()=>{const n=$('#ucsProfileDiscordPresence');if(n?.dataset.fighterId)refreshUcsDiscordPresence(n.dataset.fighterId);},30000);

function ucsPopulateOfflineChampionSelect(){
 const select=$('#ucsOfflineChampionSelect');if(!select)return;
 const current=String(state.settings?.ucs_offline_champion||'');
 select.innerHTML='<option value="">VACANT — NO CHAMPION</option>'+state.fighters.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join('');
 select.value=current;
}
$('#ucsOfflineChampionForm')?.addEventListener('submit',async e=>{
 e.preventDefault();if(!state.isAdmin||!db)return toast('Admin access required.',true);
 const id=$('#ucsOfflineChampionSelect')?.value||'';
 const {error}=await db.from('league_settings').upsert({key:'ucs_offline_champion',value:id,updated_at:new Date().toISOString()},{onConflict:'key'});
 if(error)return toast('Could not update offline champion: '+error.message,true);
 state.settings.ucs_offline_champion=id;renderChampionShowcase();toast('Offline champion updated.');
});
