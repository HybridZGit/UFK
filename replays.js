/* Isolated UCS Replay feature. Does not modify existing rankings, profiles or event logic. */
(()=>{
'use strict';
const $=s=>document.querySelector(s);
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=window.supabase?.createClient&&window.UFK_SUPABASE_URL&&window.UFK_SUPABASE_ANON_KEY?window.supabase.createClient(window.UFK_SUPABASE_URL,window.UFK_SUPABASE_ANON_KEY):null;
let fighters=[],replays=[],activeVideo=null,profileId=null;
const name=id=>fighters.find(f=>String(f.id)===String(id))?.name||'Unknown fighter';
const date=r=>r.fought_on||'';
const visible=()=>replays.filter(r=>r.published);
const replayLink=id=>location.origin+location.pathname+'#replay/'+encodeURIComponent(id);
const copyText=async text=>{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}const el=document.createElement('textarea');el.value=text;document.body.append(el);el.select();document.execCommand('copy');el.remove();};
const shareStatus=msg=>{const el=$('#ucsReplayShareStatus');if(el)el.textContent=msg;};
const status=(msg)=>{const el=$('#ucsReplayStatus');if(el)el.textContent=msg;};
function selectOptions(){
 const opts=fighters.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(f=>'<option value="'+escapeHtml(f.id)+'">@'+escapeHtml(f.name)+'</option>').join('');
 for(const id of ['ucsReplayTagA','ucsReplayTagB']){const el=$('#'+id);if(el){const prev=el.value;el.innerHTML='<option value="">Select fighter</option>'+opts;el.value=prev;}}
 const el=$('#ucsReplayFilter');if(el){const prev=el.value;el.innerHTML='<option value="">All fighters</option>'+opts;el.value=prev;}
}
function closePlayer(){if(activeVideo){activeVideo.pause();activeVideo.removeAttribute('src');activeVideo.load();activeVideo=null;}$('#ucsReplayPlayer')?.classList.add('hidden');$('#ucsReplayCards')?.classList.remove('hidden');}
function openReplay(id,updateHash=true){
 const r=visible().find(x=>x.id===id);if(!r)return;
 const player=$('#ucsReplayPlayer'),video=$('#ucsReplayVideo');if(!player||!video)return;
 closePlayer();$('#ucsReplayTitlePlaying').textContent=r.title;$('#ucsReplayMetaPlaying').textContent=[name(r.fighter_a_id)+' vs '+name(r.fighter_b_id),r.event_name,date(r)].filter(Boolean).join(' · ');
 if(!/^https:\/\//i.test(r.video_url)){status('Video URL is invalid');return;}
 video.src=r.video_url;activeVideo=video;player.classList.remove('hidden');$('#ucsReplayCards').classList.add('hidden');if(updateHash)history.replaceState(null,'','#replay/'+encodeURIComponent(id));player.scrollIntoView({block:'start',behavior:'smooth'});
}
function render(){
 const grid=$('#ucsReplayCards');if(!grid)return;
 const term=($('#ucsReplaySearch')?.value||'').trim().replace(/^@/,'').toLowerCase(),id=$('#ucsReplayFilter')?.value||'';
 const rows=visible().filter(r=>(!id||r.fighter_a_id===id||r.fighter_b_id===id)&&(!term||[r.title,r.event_name,name(r.fighter_a_id),name(r.fighter_b_id)].some(x=>String(x||'').toLowerCase().includes(term))));
 grid.innerHTML=rows.length?rows.map(r=>'<button class="ucs-rp-card" type="button" data-replay="'+escapeHtml(r.id)+'"><span>▶ UCS FIGHT REPLAY</span><strong>'+escapeHtml(r.title)+'</strong><small>@'+escapeHtml(name(r.fighter_a_id))+' vs @'+escapeHtml(name(r.fighter_b_id))+'</small><small>'+escapeHtml([r.event_name,date(r)].filter(Boolean).join(' · '))+'</small><b>WATCH FIGHT →</b></button><button type="button" class="ucs-rp-share" data-copy-replay="'+escapeHtml(r.id)+'">🔗 COPY DISCORD LINK</button>').join(''):'<p>No replays found yet.</p>';
 renderAdmin();renderProfile();
}
function renderProfile(){
 const root=$('#ucsReplayProfileList');if(!root)return;
 const rows=visible().filter(r=>r.fighter_a_id===profileId||r.fighter_b_id===profileId);
 root.innerHTML=rows.length?rows.slice(0,5).map(r=>'<button type="button" class="mini-action" data-profile-replay="'+escapeHtml(r.id)+'">▶ '+escapeHtml(r.title)+'</button>').join(''):'<p style="opacity:.7">No fight videos uploaded yet.</p>';
}
function renderAdmin(){
 const root=$('#ucsReplayManage');if(!root)return;
 root.innerHTML=replays.length?replays.map(r=>'<div class="ucs-rp-row"><span>'+escapeHtml(r.title)+' <small>('+escapeHtml(r.published?'Published':'Hidden')+')</small></span><span><button type="button" data-toggle-replay="'+escapeHtml(r.id)+'">'+(r.published?'Unpublish':'Publish')+'</button> <button type="button" data-delete-replay="'+escapeHtml(r.id)+'">Delete</button></span></div>').join(''):'<p>No replays uploaded.</p>';
}
async function load(){
 if(!client)return status('Replay service is not configured.');
 const [f,r]=await Promise.all([client.from('fighters').select('id,name').limit(1000),client.from('ucs_fight_replays').select('*').order('created_at',{ascending:false}).limit(500)]);
 if(f.error||r.error){status('Unable to load replays: '+(f.error?.message||r.error?.message));return;}
 fighters=f.data||[];replays=r.data||[];selectOptions();render();status('');openDeepLink();
}
async function upload(e){
 e.preventDefault();const form=e.currentTarget,button=$('#ucsReplaySubmit'),message=$('#ucsReplayUploadMessage');
 const file=$('#ucsReplayUploadFile').files?.[0],a=$('#ucsReplayTagA').value,b=$('#ucsReplayTagB').value,title=$('#ucsReplayFightName').value.trim();
 if(!file||!a||!b||a===b||title.length<3){message.textContent='Enter a fight name, two different fighters and a video.';return;}
 const mime={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'}[file.type];
 if(!mime||file.size>50*1024*1024){message.textContent='Use MP4, WebM or MOV under 50 MB.';return;}
 button.disabled=true;message.textContent='Uploading video, please keep this page open…';
 let path='';
 try{
  path='replays/'+crypto.randomUUID()+'.'+mime;
  const uploaded=await client.storage.from('ucs-fight-replays').upload(path,file,{contentType:file.type,upsert:false});
  if(uploaded.error)throw uploaded.error;
  const url=client.storage.from('ucs-fight-replays').getPublicUrl(path).data.publicUrl;
  const inserted=await client.from('ucs_fight_replays').insert({title,fighter_a_id:a,fighter_b_id:b,event_name:$('#ucsReplayEvent').value.trim()||null,fought_on:$('#ucsReplayFightDate').value||null,video_url:url,storage_path:path,published:$('#ucsReplayPublish').checked});
  if(inserted.error){await client.storage.from('ucs-fight-replays').remove([path]);throw inserted.error;}
  form.reset();message.textContent='Replay uploaded successfully.';await load();
 }catch(err){message.textContent='Upload failed: '+(err.message||err);}
 finally{button.disabled=false;}
}
async function manage(e){
 const toggle=e.target.closest('[data-toggle-replay]'),del=e.target.closest('[data-delete-replay]');if(!toggle&&!del)return;
 const id=toggle?.dataset.toggleReplay||del?.dataset.deleteReplay,r=replays.find(x=>x.id===id);if(!r)return;
 if(del&&!confirm('Delete this replay permanently?'))return;
 let response;
 if(toggle)response=await client.from('ucs_fight_replays').update({published:!r.published}).eq('id',id);
 else response=await client.from('ucs_fight_replays').delete().eq('id',id);
 if(response.error){$('#ucsReplayUploadMessage').textContent=response.error.message;return;}
 if(del&&r.storage_path)await client.storage.from('ucs-fight-replays').remove([r.storage_path]);
 if(activeVideo&&del)closePlayer();await load();
}
function openDeepLink(){const match=location.hash.match(/^#replay\/([a-f0-9-]{36})$/i);if(!match)return;if(typeof showPage==='function')showPage('replays');if(visible().some(r=>r.id===match[1]))openReplay(match[1],false);else status('This replay is not published or is unavailable.');}
function goToReplays(fighter){
 closePlayer();const filter=$('#ucsReplayFilter');if(filter)filter.value=fighter||'';const search=$('#ucsReplaySearch');if(search)search.value='';
 render();if(typeof closeFighterProfile==='function')closeFighterProfile();
 if(typeof showPage==='function')showPage('replays');history.replaceState(null,'','#replays');
}
window.ucsReplayProfile=id=>{profileId=id;renderProfile();};
document.addEventListener('DOMContentLoaded',()=>{
 $('#ucsReplaySearch')?.addEventListener('input',render);
 $('#ucsReplayFilter')?.addEventListener('change',render);
 $('#ucsReplayCards')?.addEventListener('click',async e=>{const copy=e.target.closest('[data-copy-replay]');if(copy){try{await copyText(replayLink(copy.dataset.copyReplay));copy.textContent='✓ LINK COPIED';setTimeout(()=>copy.textContent='🔗 COPY DISCORD LINK',1800);}catch(err){status('Could not copy link: '+err.message);}return;}const btn=e.target.closest('[data-replay]');if(btn)openReplay(btn.dataset.replay);});
 $('#ucsReplayBack')?.addEventListener('click',()=>{closePlayer();history.replaceState(null,'','#replays');});
$('#ucsReplayCopyLink')?.addEventListener('click',async()=>{const match=location.hash.match(/^#replay\/([a-f0-9-]{36})$/i);if(!match)return;try{await copyText(replayLink(match[1]));shareStatus('Replay link copied for Discord.');}catch(e){shareStatus('Unable to copy link.');}});
$('#ucsReplayCopyVideo')?.addEventListener('click',async()=>{const video=activeVideo;if(!video)return;try{await copyText(video.src);shareStatus('Direct video URL copied. Discord may preview MP4 files depending on its settings.');}catch(e){shareStatus('Unable to copy video URL.');}});
window.addEventListener('hashchange',openDeepLink);
 $('#ucsReplayUploadForm')?.addEventListener('submit',upload);
 $('#ucsReplayManage')?.addEventListener('click',manage);
 $('#ucsReplayProfileList')?.addEventListener('click',e=>{const btn=e.target.closest('[data-profile-replay]');if(btn){goToReplays('');openReplay(btn.dataset.profileReplay);}});
 $('#ucsReplayProfileAll')?.addEventListener('click',()=>goToReplays(profileId));
 document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.page!=='replays')closePlayer();}));
 const admin=$('#adminControls'),manager=$('#ucsReplayAdmin');if(admin&&manager){const update=()=>manager.classList.toggle('hidden',admin.classList.contains('hidden'));new MutationObserver(update).observe(admin,{attributes:true,attributeFilter:['class']});update();}
 load();
});
})();