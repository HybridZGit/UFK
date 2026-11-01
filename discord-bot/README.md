# UCS Discord bot

A live Discord bot for the UCS website. It reads the same public Supabase tables used by the website.

## Commands

- `/rankings [page]` — live rankings by rating
- `/fighters` — fighter selector, with pagination and fighter profile embeds
- `/bouts` — upcoming scheduled fights

## Setup

1. Create a bot application in the [Discord Developer Portal](https://discord.com/developers/applications). Enable the bot and invite it with the `bot` and `applications.commands` scopes, with Send Messages and Embed Links permissions.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (your server ID), `SUPABASE_URL` and `SUPABASE_ANON_KEY`. **Never commit the .env file.** Use the site's public/anon Supabase key, never a service-role key.
3. Run `npm install`, `npm run register`, and `npm start` inside `discord-bot`.
4. Host this Node process on a persistent worker or server. GitHub Pages cannot run a Discord bot.

The database must permit public read access to active fighters, champions and scheduled bouts, just as the website does. This bot is read-only.
