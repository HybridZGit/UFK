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
  return [...new Set([...(Array.isArray(saved)?saved.filter(x=>typeof x==='string'&&x.trim()&&x!=='UCS SIM World').slice(0,40):ucsDefaultDivisions),'UCS Offline'])];
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
  if(state.rankingDivision==='UCS Offline'){
    const rows=state.fighters.filter(f=>f.name.toLowerCase().includes(filter.toLowerCase())).map(f=>{
      const bouts=ucsOfflineFor(f);
      const outcomes=bouts.map(r=>r.fighter_id===f.id?r.result:r.result==='W'?'L':r.result==='L'?'W':'D');
      return {f,w:outcomes.filter(x=>x==='W').length,l:outcomes.filter(x=>x==='L').length,d:outcomes.filter(x=>x!=='W'&&x!=='L').length};
    }).sort((a,b)=>b.w-a.w||a.l-b.l||String(a.f.name).localeCompare(String(b.f.name)));
    $('#rankRows').innerHTML=rows.map(({f,w,l,d},i)=>`<tr class="fighter-rank-row" data-fighter-profile="${esc(f.id)}" tabindex="0"><td><span class="rank-number">${i+1}</span></td><td class="rank-name"><div class="rank-fighter-cell">${avatarHtml(f)}<div><strong>${ucsFlagHtml(f.region)}${esc(f.name)}</strong><span>${w}-${l}-${d} · UCS OFFLINE · ${esc(f.platform||'UNASSIGNED')}</span></div></div></td><td colspan="5">Offline bouts: ${w+l+d} · W ${w} / L ${l} / D ${d}</td><td class="overall">${w}-${l}-${d}</td></tr>`).join('')||`<tr><td colspan="8">${empty('No offline fighters found.')}</td></tr>`;
    const banner=$('#worldChampionBanner');if(banner){banner.classList.remove('ucs-banner-with-belt');banner.style.setProperty('--ucs-belt-image','none');banner.innerHTML='<small>UCS OFFLINE BOUTS</small><strong>OFFLINE RECORDS</strong><span>All fighters · wins, losses and draws from recorded UCS Offline bouts</span>';}
    renderRankingTitleFights();return;
  }

  const platform=['UCS PS5','UCS PC','UCS XBOX'].includes(state.rankingDivision)?state.rankingDivision.replace('UCS ',''):null;
  const championIds=new Set(state.champions.filter(c=>c.fighter_id&&c.division===state.rankingDivision).map(c=>String(c.fighter_id)));
  const rows=state.fighters.filter(f=>!championIds.has(String(f.id))&&f.name.toLowerCase().includes(filter.toLowerCase())&&(state.rankingDivision!=='UCS SIM World'||f.sim_division===true)&&(!platform||(f.platform||'').toUpperCase()===platform)&&ucsEligibleForDivision(f,state.rankingDivision));
  $('#rankRows').innerHTML=rows.length?rows.map((f,i)=>`<tr class="fighter-rank-row" data-fighter-profile="${f.id}" tabindex="0"><td><span class="rank-number">${i+1}</span></td><td class="rank-name"><div class="rank-fighter-cell">${avatarHtml(f)}<div><strong>${ucsFlagHtml(f.region)}${esc(f.name)}</strong><span>${esc(record(f))} · ${esc(f.platform||'UNASSIGNED')}</span></div></div></td><td>${chip(f.resume)}</td><td>${chip(f.momentum)}</td><td>${chip(f.finishing)}</td><td>${chip(f.activity)}</td><td>${chip(f.big_fight)}</td><td class="overall">${Number(f.score||0).toFixed(1)}</td></tr>`).join(''):`<tr><td colspan="8">${empty(`No ${state.rankingDivision} fighters in the database yet.`)}</td></tr>`;
  renderRankingChampion();
}
