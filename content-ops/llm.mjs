// Provider-agnostic LLM client for the Growth Engine. Default: OpenAI.
// Swap this one file to change provider; nothing else in content-ops cares.
//
// Env:
//   OPENAI_API_KEY   (required to run; absent = engine no-ops)
//   OPENAI_BASE      (optional, default https://api.openai.com/v1)
//   MODEL_FLAGSHIP   (writing / fact-check / planning — default gpt-4.1)
//   MODEL_MINI       (mechanical roles — default gpt-4.1-mini)

const KEY = process.env.OPENAI_API_KEY || '';
const BASE = process.env.OPENAI_BASE || 'https://api.openai.com/v1';
export const MODELS = {
  flagship: process.env.MODEL_FLAGSHIP || 'gpt-4.1',
  mini: process.env.MODEL_MINI || 'gpt-4.1-mini',
};
export const hasKey = () => !!KEY;

// URLs the web_search tool actually cited in the most recent ask() — the only links
// we trust (models often put a description, not a URL, in a "source_url" field).
let _cites = [];
export const lastCitations = () => _cites;

// One call. `web:true` lets the model search the web (research + fact-check roles).
// Returns the model's text output. Throws on hard API errors (caller decides).
export async function ask({ system, user, tier = 'flagship', web = false, maxTokens = 2000 }) {
  if (!KEY) throw new Error('OPENAI_API_KEY not set');
  const body = {
    model: MODELS[tier] || MODELS.flagship,
    input: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user },
    ],
    max_output_tokens: maxTokens,
    ...(web ? { tools: [{ type: 'web_search' }] } : {}),
  };
  const r = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error('llm: ' + (j.error.message || JSON.stringify(j.error)));
  _cites = (j.output || []).flatMap((o) => o.content || []).flatMap((c) => c.annotations || [])
    .filter((a) => a.type === 'url_citation' && /^https?:\/\//.test(a.url || ''))
    .map((a) => ({ url: a.url, title: a.title || '' }));
  // Responses API: prefer output_text; fall back to walking the output array.
  if (typeof j.output_text === 'string' && j.output_text.trim()) return j.output_text.trim();
  const parts = (j.output || [])
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text' || c.text)
    .map((c) => c.text || '');
  return parts.join('\n').trim();
}

// Ask for strict JSON and parse it (tolerates ```json fences).
export async function askJSON(opts) {
  const raw = await ask({ ...opts, system: (opts.system || '') + '\nReply with ONLY valid JSON, no prose, no code fences.' });
  const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(m ? m[0] : raw);
}
