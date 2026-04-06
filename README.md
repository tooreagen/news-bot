# News Rewrite Bot

Telegram bot on `grammy` for:

- accepting raw news text or a link from an admin
- extracting article text from a URL
- rewriting the news via Gemini
- generating a thematic image for the post
- showing a preview before publishing
- publishing the approved version to a Telegram channel

## Flow

1. Admin sends the bot either plain text or a URL.
2. If a URL is detected, the bot downloads the page and extracts the article body.
3. The bot rewrites the news and tries to generate a thematic image.
4. Admin can publish, regenerate, or cancel through inline buttons.
5. On publish, the bot posts either `photo + caption` or plain text to the target channel.

## Environment

Copy `.env.example` to `.env` and set:

- `BOT_TOKEN`: Telegram bot token
- `GEMINI_API_KEY`: API key from Google AI Studio
- `ADMIN_IDS`: comma-separated Telegram user IDs allowed to use the bot
- `TARGET_CHANNEL_ID`: channel username like `@channel_name` or numeric chat ID
- `GEMINI_MODEL`: optional Gemini model, default is `gemini-2.5-flash`
- `GEMINI_IMAGE_PROMPT_MODEL`: model for extracting the visual idea from the article
- `GEMINI_IMAGE_MODEL`: image model, default is `imagen-4.0-generate-001`

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
- `imagen-4.0-generate-001` must be called through the image generation API, not `generateContent`.
- Image generation is best-effort. If it fails, the bot still falls back to a text-only post.
- The bot currently keeps rewrite drafts in memory. After restart, pending previews are lost.
