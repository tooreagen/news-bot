import "dotenv/config";
import { Bot, InlineKeyboard, session } from "grammy";
import { extractFirstUrl, loadArticleFromUrl } from "./services/article.js";
import { rewriteNews } from "./services/gemini.js";

const botToken = process.env.BOT_TOKEN;
const targetChannelId = process.env.TARGET_CHANNEL_ID;
const subscribeUrl = "https://t.me/kalush_pulse";
const subscribeLabel = "👉 Підписуйтесь 🔥";
const adminIds = new Set(
  (process.env.ADMIN_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value)),
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
      pendingDraft: null,
    }),
  }),
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
      "Якщо надішлете посилання, я спробую витягнути текст, зробити рерайт і показати попередній перегляд.",
      "Після цього можна опублікувати допис у канал.",
    ].join("\n"),
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "Сценарій роботи:",
      "1. Надішліть текст новини або посилання.",
      "2. Отримайте рерайт.",
      "3. Натисніть «Опублікувати», «Повторити» або «Скасувати».",
    ].join("\n"),
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
    const rewritten = await rewriteNews({
      articleText: source.text,
      sourceUrl: source.sourceUrl,
    });
    const formatted = formatChannelPost(rewritten);

    ctx.session.pendingDraft = {
      originalText: source.text,
      sourceUrl: source.sourceUrl,
      rewrittenText: rewritten,
      formattedText: formatted,
    };

    await ctx.reply(formatPreview(source, formatted), {
      reply_markup: draftKeyboard(),
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: true,
      },
    });
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

  await bot.api.sendMessage(targetChannelId, draft.formattedText, {
    parse_mode: "HTML",
    link_preview_options: {
      is_disabled: true,
    },
  });
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
    const rewritten = await rewriteNews({
      articleText: draft.originalText,
      sourceUrl: draft.sourceUrl,
    });
    const formatted = formatChannelPost(rewritten);

    ctx.session.pendingDraft = {
      ...draft,
      rewrittenText: rewritten,
      formattedText: formatted,
    };

    await ctx.editMessageText(
      formatPreview(
        {
          text: draft.originalText,
          sourceUrl: draft.sourceUrl,
        },
        formatted,
      ),
      {
        reply_markup: draftKeyboard(),
        parse_mode: "HTML",
        link_preview_options: {
          is_disabled: true,
        },
      },
    );
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
    text: input,
  };
}

function formatPreview(source, formattedPost) {
  return formattedPost;
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
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
