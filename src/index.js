import "dotenv/config";
import { Bot, InlineKeyboard, session } from "grammy";
import { extractFirstUrl, loadArticleFromUrl } from "./services/article.js";
import { rewriteNews } from "./services/gemini.js";

const botToken = process.env.BOT_TOKEN;
const targetChannelId = process.env.TARGET_CHANNEL_ID;
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
      "Якщо надішлете посилання, я спробую витягнути текст самостійно, переписати його та показати попередній перегляд.",
      "Після цього можна опублікувати допис у каналі.",
    ].join("\n"),
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "Сценарій роботи:",
      "1. Надішліть текст новини або посилання.",
      "2. Отримайте рерайт.",
      "3. Натисніть «Опублікувати», «Повторити» або «Відмінити»."
    ].join("\n")
  );
});

bot.on("message:text", async (ctx) => {
  const input = ctx.message.text.trim();
  if (!input) {
    await ctx.reply("Потрібен текст новини або посилання.");
    return;
  }

  await ctx.reply("Обробляю матеріал...");

  try {
    const source = await resolveSource(input);
    const rewritten = await rewriteNews({
      articleText: source.text,
      sourceUrl: source.sourceUrl
    });

    ctx.session.pendingDraft = {
      originalText: source.text,
      sourceUrl: source.sourceUrl,
      rewrittenText: rewritten
    };

    await ctx.reply(formatPreview(source, rewritten), {
      reply_markup: draftKeyboard()
    });
  } catch (error) {
    await ctx.reply(`Не вдалося обробити матеріал.\n${error.message}`);
  }
});

bot.callbackQuery("publish", async (ctx) => {
  const draft = ctx.session.pendingDraft;
  if (!draft) {
    await ctx.answerCallbackQuery({ text: "Чернетку не знайдено." });
    return;
  }

  await bot.api.sendMessage(targetChannelId, draft.rewrittenText);
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
      sourceUrl: draft.sourceUrl
    });

    ctx.session.pendingDraft = {
      ...draft,
      rewrittenText: rewritten
    };

    await ctx.editMessageText(
      formatPreview(
        {
          text: draft.originalText,
          sourceUrl: draft.sourceUrl
        },
        rewritten
      ),
      {
        reply_markup: draftKeyboard()
      }
    );
  } catch (error) {
    await ctx.reply(`Не вдалося зробити новий рерайт.\n${error.message}`);
  }
});

bot.callbackQuery("cancel", async (ctx) => {
  ctx.session.pendingDraft = null;
  await ctx.answerCallbackQuery({ text: "Черновик видалено." });
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

function formatPreview(source, rewritten) {
  const sourceLabel = source.sourceUrl || "прямий ввод";
  const excerpt = source.text.slice(0, 700);

  return [
    `Джерело: ${sourceLabel}`,
    "",
    "Исходник:",
    excerpt + (source.text.length > excerpt.length ? "\n..." : ""),
    "",
    "Рерайт:",
    rewritten
  ].join("\n");
}

function draftKeyboard() {
  return new InlineKeyboard()
    .text("Опублікувати", "publish")
    .text("Повторити", "retry")
    .text("Відмінити", "cancel");
}
