import 'dotenv/config';
import {REST,Routes,SlashCommandBuilder} from 'discord.js';
const {DISCORD_TOKEN,DISCORD_CLIENT_ID,DISCORD_GUILD_ID}=process.env;
if(!DISCORD_TOKEN||!DISCORD_CLIENT_ID)throw Error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID');
const commands=[
 new SlashCommandBuilder().setName('rankings').setDescription('View the live UCS fighter rankings').addIntegerOption(o=>o.setName('page').setDescription('Ranking page').setMinValue(1)),
 new SlashCommandBuilder().setName('fighters').setDescription('Browse UCS fighters and select a fighter profile'),
 new SlashCommandBuilder().setName('bouts').setDescription('See upcoming UCS scheduled bouts')
].map(c=>c.toJSON());
const rest=new REST({version:'10'}).setToken(DISCORD_TOKEN);
await rest.put(DISCORD_GUILD_ID?Routes.applicationGuildCommands(DISCORD_CLIENT_ID,DISCORD_GUILD_ID):Routes.applicationCommands(DISCORD_CLIENT_ID),{body:commands});
console.log('Registered UCS slash commands');
