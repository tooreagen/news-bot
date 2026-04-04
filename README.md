# News Rewrite Bot

Telegram bot on `grammy` for:

- accepting raw news text or a link from an admin
- extracting article text from a URL
- rewriting the news via Gemini
- showing a preview before publishing
- publishing the approved version to a Telegram channel

## Flow

1. Admin sends the bot either plain text or a URL.
2. If a URL is detected, the bot downloads the page and extracts the article body.
3. The bot sends the source and a rewritten version back to the admin.
4. Admin can publish, regenerate, or cancel through inline buttons.
5. On publish, the bot posts the approved text to the target channel.

## Environment

Copy `.env.example` to `.env` and set:

- `BOT_TOKEN`: Telegram bot token
- `GEMINI_API_KEY`: API key from Google AI Studio
- `ADMIN_IDS`: comma-separated Telegram user IDs allowed to use the bot
- `TARGET_CHANNEL_ID`: channel username like `@channel_name` or numeric chat ID
- `GEMINI_MODEL`: optional Gemini model, default is `gemini-2.5-flash`

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## Notes

- Add the bot as an admin in the target channel before publishing.
- Article extraction is heuristic-based. Some websites will still need manual cleanup.
- The bot currently keeps rewrite drafts in memory. After restart, pending previews are lost.
