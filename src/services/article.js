import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

export async function loadArticleFromUrl(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Не вдалося завантажити статтю: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.textContent) {
    throw new Error("Не вдалося видобути текст статті з сторінки.");
  }

  return {
    sourceUrl: url,
    title: article.title?.trim() || "",
    text: normalizeWhitespace(article.textContent)
  };
}

function normalizeWhitespace(value) {
  return value
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
