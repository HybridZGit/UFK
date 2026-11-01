import 'dotenv/config';
import {Client,GatewayIntentBits,EmbedBuilder,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
import {createClient} from '@supabase/supabase-js';
const {DISCORD_TOKEN,SUPABASE_URL,SUPABASE_ANON_KEY}=process.env;
if(!DISCORD_TOKEN||!SUPABASE_URL||!SUPABASE_ANON_KEY)throw Error('Missing bot environment variables');
const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const HOME='https://hybridzgit.github.io/UFK/';
const GOLD=0xd7ac60;
const clean=s=>String(s??'—').slice(0,1000);
async function data(){
 const [fighters,champions,bouts]=await Promise.all([
  db.from('fighters').select('id,name,wins,losses,draws,score,avatar_url,region,platform,active').eq('active',true).order('score',{ascending:false}),
  db.from('champions').select('division,fighter_id,defenses'),
  db.from('scheduled_bouts').select('*').eq('status','scheduled').order('bout_date',{ascending:true,nullsFirst:false})
 ]);
 for(const [name,res] of [['fighters',fighters],['champions',champions],['bouts',bouts]])if(res.error)throw Error(name+': '+res.error.message);
 return {fighters:fighters.data||[],champions:champions.data||[],bouts:bouts.data||[]};
}
const record=f=>[f.wins||0,f.losses||0,f.draws||0].join('-');
const rank=(f,list)=>list.findIndex(x=>x.id===f.id)+1;
function fighterEmbed(f,d){
 const titles=d.champions.filter(x=>x.fighter_id===f.id);
 const embed=new EmbedBuilder().setColor(GOLD).setTitle('🥊 '+clean(f.name).slice(0,200)).setURL(HOME+'#rankings')
 .setDescription('**UCS OFFICIAL FIGHTER PROFILE**'+(titles.length?'\n🏆 '+titles.map(t=>t.division+' · '+(t.defenses||0)+' defenses').join('\n🏆 '):''))
 .addFields(
 {name:'Record (W-L-D)',value:record(f),inline:true},
 {name:'World rank',value:'#'+rank(f,d.fighters),inline:true},
 {name:'Rating',value:Number(f.score||0).toFixed(1),inline:true},
 {name:'Platform',value:clean(f.platform),inline:true},
 {name:'Region',value:clean(f.region),inline:true},
 {name:'Status',value:titles.length?'Champion':'Contender',inline:true})
 .setFooter({text:'UCS · Live league records'});
 if(f.avatar_url&&/^https:\/\//.test(f.avatar_url))embed.setThumbnail(f.avatar_url);
 return embed;
}
function fighterMenu(d,page=0){
 const size=25,total=Math.max(1,Math.ceil(d.fighters.length/size)),p=Math.max(0,Math.min(total-1,page)),subset=d.fighters.slice(p*size,(p+1)*size);
 const components=[];
 if(subset.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ucs_fighter:'+p).setPlaceholder('Select a UCS fighter…').addOptions(subset.map(f=>({label:clean(f.name).slice(0,100),description:('Rank #'+rank(f,d.fighters)+' · '+record(f)).slice(0,100),value:String(f.id)})))));
 if(total>1)components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ucs_page:'+Math.max(0,p-1)).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(p===0),new ButtonBuilder().setCustomId('ucs_page:'+Math.min(total-1,p+1)).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(p===total-1)));
 return {embeds:[new EmbedBuilder().setColor(GOLD).setTitle('UCS FIGHTER ROSTER').setDescription(d.fighters.length?'Choose a fighter below to view their full UCS profile.\n**'+d.fighters.length+' active fighters** · Page '+(p+1)+'/'+total:'No active fighters found.').setURL(HOME+'#rankings')],components};
}
function rankings(d,page=0){
 const size=15,p=Math.max(0,page),rows=d.fighters.slice(p*size,(p+1)*size);
 return new EmbedBuilder().setColor(GOLD).setTitle('🏆 UCS OFFICIAL RANKINGS').setURL(HOME+'#rankings').setDescription(rows.length?rows.map((f,i)=>'**#'+(p*size+i+1)+' '+clean(f.name)+'** · '+record(f)+' · '+Number(f.score||0).toFixed(1)+' rating'+(d.champions.some(c=>c.fighter_id===f.id)?' 👑':'')).join('\n'):'No rankings on this page.').setFooter({text:'Ranked by UCS rating · Live database'});
}
function boutsEmbed(d){
 const rows=d.bouts.slice(0,20),lookup=new Map(d.fighters.map(f=>[f.id,f.name]));
 return new EmbedBuilder().setColor(GOLD).setTitle('🥊 UCS UPCOMING BOUTS').setURL(HOME+'#fights').setDescription(rows.length?rows.map(b=>{
 const a=clean(lookup.get(b.fighter_a_id)||'TBA'),c=clean(lookup.get(b.fighter_b_id)||'TBA');
 return '**'+a+' vs '+c+'**\n'+clean(b.event_name||'UCS Fight Night')+' · '+clean(b.bout_date||'Date TBA')+(b.belt?' · 🏆 '+clean(b.belt):'');
 }).join('\n\n').slice(0,4000):'No upcoming bouts currently scheduled.').setFooter({text:'Scheduled bouts only · Live UCS data'});
}
client.on('interactionCreate',async interaction=>{
 if(!interaction.isChatInputCommand()&&!interaction.isStringSelectMenu()&&!interaction.isButton())return;
 try{
 await interaction.deferReply({ephemeral:interaction.isStringSelectMenu()||interaction.isButton()});
 const d=await data();
 if(interaction.isChatInputCommand()){
 if(interaction.commandName==='rankings')return interaction.editReply({embeds:[rankings(d,(interaction.options.getInteger('page')||1)-1)]});
 if(interaction.commandName==='fighters')return interaction.editReply(fighterMenu(d));
 if(interaction.commandName==='bouts')return interaction.editReply({embeds:[boutsEmbed(d)]});
 }
 if(interaction.isStringSelectMenu()&&interaction.customId.startsWith('ucs_fighter:')){
 const f=d.fighters.find(x=>String(x.id)===interaction.values[0]);
 return interaction.editReply(f?{embeds:[fighterEmbed(f,d)],components:fighterMenu(d,Number(interaction.customId.split(':')[1])).components}:{content:'Fighter no longer available.'});
 }
 if(interaction.isButton()&&interaction.customId.startsWith('ucs_page:'))return interaction.editReply(fighterMenu(d,Number(interaction.customId.split(':')[1])));
 }catch(err){console.error(err);const msg='Could not load UCS data. Please try again.';if(interaction.deferred||interaction.replied)await interaction.editReply({content:msg,embeds:[],components:[]}).catch(()=>{});else await interaction.reply({content:msg,ephemeral:true}).catch(()=>{});}
});
client.once('ready',()=>console.log('UCS Discord bot online as '+client.user.tag));
await client.login(DISCORD_TOKEN);
