// Gemini image generation (Google AI Studio / Generative Language API).
// Produces a raw photographic PNG from a text prompt. The JTE branded overlay
// (gradient + headline + "JTE RECRUIT" watermark) is applied separately by
// scripts/hero-graphic.mjs makeHero(), which takes this PNG as its `bg`.
//
// Needs the GEMINI_API_KEY env var (stored as a GitHub secret for CI). No key
// is ever hard-coded here. Billing must be enabled on the AI-Studio project.
//   GEMINI_API_KEY=... node -e "import('./scripts/gemini-image.mjs').then(m=>m.geminiImage({prompt:'...',out:'x.png'}))"
import { writeFileSync } from 'node:fs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'; // ~US$0.04/image

export function hasGeminiKey() { return !!process.env.GEMINI_API_KEY; }

export async function geminiImage({ prompt, out, model = MODEL }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 220)}`);
  const j = await res.json();
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) throw new Error('gemini: no image in response');
  const d = img.inlineData || img.inline_data;
  writeFileSync(out, Buffer.from(d.data, 'base64'));
  return out;
}
