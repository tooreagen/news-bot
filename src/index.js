import "dotenv/config";
import { Bot, InlineKeyboard, InputFile, session } from "grammy";
import { extractFirstUrl, loadArticleFromUrl } from "./services/article.js";
import { rewriteNews } from "./services/gemini.js";
import { generateArticleImage } from "./services/image.js";

const botToken = process.env.BOT_TOKEN;
const targetChannelId = process.env.TARGET_CHANNEL_ID;
const subscribeUrl = "https://t.me/kalush_pulse";
const subscribeLabel = "Підписуйтесь";
const adminIds = new Set(
  (process.env.ADMIN_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
);

if (!botToken) {
  throw new Error("BOT_TOKEN is required.");
}

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is required.");
}

if (!targetChannelId) {
  throw new Error("TARGET_CHANNEL_ID is required.");
}

if (adminIds.size === 0) {
  throw new Error("ADMIN_IDS must contain at least one Telegram user id.");
}

const bot = new Bot(botToken);

bot.use(
  session({
    initial: () => ({
      pendingDraft: null
    })
  })
);

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !adminIds.has(userId)) {
    if (ctx.chat?.type === "private") {
      await ctx.reply("Доступ лише для адміністраторів.");
    }
    return;
  }

  await next();
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "Надішліть текст новини або посилання на статтю.",
      "Я зроблю рерайт, спробую згенерувати тематичне зображення і покажу готовий допис.",
      "Після цього його можна опублікувати у канал."
    ].join("\n")
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "Сценарій роботи:",
      "1. Надішліть текст новини або посилання.",
      "2. Отримайте рерайт і, якщо вдасться, зображення.",
      "3. Натисніть «Опублікувати», «Повторити» або «Скасувати»."
    ].join("\n")
  );
});

bot.on("message:text", async (ctx) => {
  const input = ctx.message.text.trim();
  if (!input) {
    await ctx.reply("Потрібен текст новини або посилання.");
    return;
  }

  await ctx.reply("Опрацьовую матеріал...");

  try {
    const source = await resolveSource(input);
    const draft = await buildDraft(source);
    ctx.session.pendingDraft = draft;
    await sendDraftPreview(ctx, draft);
  } catch (error) {
    await ctx.reply(`Не вдалося опрацювати матеріал.\n${error.message}`);
  }
});

bot.callbackQuery("publish", async (ctx) => {
  const draft = ctx.session.pendingDraft;
  if (!draft) {
    await ctx.answerCallbackQuery({ text: "Чернетку не знайдено." });
    return;
  }

  await publishDraft(draft);
  ctx.session.pendingDraft = null;
  await ctx.answerCallbackQuery({ text: "Опубліковано." });
  await ctx.editMessageReplyMarkup();
});

bot.callbackQuery("retry", async (ctx) => {
  const draft = ctx.session.pendingDraft;
  if (!draft) {
    await ctx.answerCallbackQuery({ text: "Чернетку не знайдено." });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Створюю новий варіант..." });

  try {
    const nextDraft = await buildDraft({
      text: draft.originalText,
      sourceUrl: draft.sourceUrl
    });

    ctx.session.pendingDraft = nextDraft;
    await ctx.editMessageReplyMarkup();
    await sendDraftPreview(ctx, nextDraft);
  } catch (error) {
    await ctx.reply(`Не вдалося зробити новий рерайт.\n${error.message}`);
  }
});

bot.callbackQuery("cancel", async (ctx) => {
  ctx.session.pendingDraft = null;
  await ctx.answerCallbackQuery({ text: "Чернетку видалено." });
  await ctx.editMessageReplyMarkup();
});

bot.catch((error) => {
  console.error("Bot error", error);
});

bot.start();

async function resolveSource(input) {
  const url = extractFirstUrl(input);
  if (url) {
    return loadArticleFromUrl(url);
  }

  return {
    sourceUrl: null,
    title: "",
    text: input
  };
}

async function buildDraft(source) {
  const rewritten = await rewriteNews({
    articleText: source.text,
    sourceUrl: source.sourceUrl
  });
  const formatted = formatChannelPost(rewritten);
  const imageDraft = await tryGenerateImage({ rewrittenText: formatted });

  return {
    originalText: source.text,
    sourceUrl: source.sourceUrl,
    rewrittenText: rewritten,
    formattedText: formatted,
    imageBase64: imageDraft?.imageBase64 || null,
    imageMimeType: imageDraft?.mimeType || null,
    imagePrompt: imageDraft?.prompt || null
  };
}

function draftKeyboard() {
  return new InlineKeyboard()
    .text("Опублікувати", "publish")
    .text("Повторити", "retry")
    .text("Скасувати", "cancel");
}

function formatChannelPost(rawText) {
  const normalized = rawText.replace(/\r/g, "").trim();
  const lines = normalized.split("\n");
  const title = escapeHtml((lines.shift() || "").trim());
  const body = escapeHtml(lines.join("\n").trim());
  const subscribeLink = `<a href="${subscribeUrl}">${subscribeLabel}</a>`;

  if (!title) {
    throw new Error("Рерайт порожній або без заголовка.");
  }

  return [`<b>${title}</b>`, body, subscribeLink].filter(Boolean).join("\n\n");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function tryGenerateImage({ rewrittenText }) {
  try {
    return await generateArticleImage({ rewrittenText });
  } catch (error) {
    console.error("Image generation error", error);
    return null;
  }
}

async function sendDraftPreview(ctx, draft) {
  if (draft.imageBase64 && draft.imageMimeType) {
    await ctx.replyWithPhoto(
      new InputFile(Buffer.from(draft.imageBase64, "base64"), buildImageFilename(draft.imageMimeType))
    );
    await ctx.reply(draft.formattedText, {
      reply_markup: draftKeyboard(),
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: true
      }
    });
    return;
  }

  await ctx.reply(draft.formattedText, {
    reply_markup: draftKeyboard(),
    parse_mode: "HTML",
    link_preview_options: {
      is_disabled: true
    }
  });
}

async function publishDraft(draft) {
  if (draft.imageBase64 && draft.imageMimeType) {
    await bot.api.sendPhoto(
      targetChannelId,
      new InputFile(Buffer.from(draft.imageBase64, "base64"), buildImageFilename(draft.imageMimeType))
    );
    await bot.api.sendMessage(targetChannelId, draft.formattedText, {
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: true
      }
    });
    return;
  }

  await bot.api.sendMessage(targetChannelId, draft.formattedText, {
    parse_mode: "HTML",
    link_preview_options: {
      is_disabled: true
    }
  });
}

function buildImageFilename(mimeType) {
  const extension = mimeType.split("/")[1] || "png";
  return `news-image.${extension}`;
}
