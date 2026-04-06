export function buildImageIdeaPrompt({ rewrittenText }) {
  return `
You are preparing an image-generation prompt for a local news Telegram post.

Task:
- Identify the main topic of the news.
- Propose one concrete visual scene for a cover image.
- The scene must be photorealistic, editorial, and clear at a glance.
- No text in frame, no logos, no watermarks, no banners, no UI, no collage.
- If the news is about infrastructure, transport, heating, utilities, repair, playgrounds, or public spaces, show the actual object or place.
- If the news is abstract, choose a neutral editorial illustration without recognizable public figures.

Return only one short prompt in English, as a single paragraph, with no explanations.

News text:
"""
${rewrittenText}
"""
`.trim();
}
