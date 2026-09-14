// Web fallback for questions the vault cannot answer.
// Netlify → Site settings → Environment variables → ANTHROPIC_API_KEY
// The key stays on the server. The phone never sees it.

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const { question } = await req.json();
  if (!question) return new Response('No question', { status: 400 });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: 'You are a personal assistant answering out loud to someone on a phone. '
            + 'Answer in at most four short sentences, plain spoken English, no markdown, '
            + 'no lists, no preamble. Prices in pounds. If you searched, name the source.',
      messages: [{ role: 'user', content: question }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }]
    })
  });

  if (!r.ok) return new Response(JSON.stringify({ answer: null }), { status: 502 });

  const data = await r.json();
  const answer = data.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .filter(Boolean).join(' ').trim();

  return new Response(JSON.stringify({ answer }), {
    headers: { 'content-type': 'application/json' }
  });
};
