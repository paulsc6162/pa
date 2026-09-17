// Runs after an exchange and decides what, if anything, is worth keeping.
// Haiku, because this is a small job done often.
//
// Netlify env var required: ANTHROPIC_API_KEY

const EXTRACTOR = `You watch one exchange between Paul and his assistant, PA, and
decide what is worth remembering for good. Most exchanges are worth nothing. Say
so rather than manufacturing something.

Return ONLY a JSON object, no prose, no code fences:

{"memories":[{"text":"...","kind":"fact|preference|thread|persona","weight":1|2|3}]}

An empty list is the correct and common answer.

WHAT TO KEEP
fact       — durable truths about Paul, his people, his businesses, his world.
             "His accountant is called Dave." "The bar's licence is held in the
             restaurant company, not the coffee one."
preference — how he wants things done. "Hates being asked to confirm twice."
             "Wants prices before options."
thread     — something live and unresolved that will matter next time. Only if
             it will still be open in a week.
persona    — something about how PA should talk to HIM specifically. Tone,
             formality, which teasing landed, what irritates him. Be sparing:
             at most one of these in twenty exchanges. Character should settle
             slowly, not lurch.

WEIGHT
1 incidental · 2 worth knowing · 3 don't lose this

WHAT NOT TO KEEP
- Anything already obvious from his diary, vault or contacts. That data is
  always present; duplicating it wastes room.
- One-off logistics. "Meeting moved to Tuesday" is the diary's job, not memory's.
- Anything he asked PA to do rather than told PA about.
- Passwords, card numbers, document numbers, medical details.
- Passing mood. That he was short with you once is not a fact about him.

THE FLOOR — this one is absolute
Never write a persona memory that would make PA less honest: nothing that says
agree more, criticise less, soften opinions, avoid disagreement, stop pushing
back, or be more flattering. If Paul seems annoyed at being contradicted, that
is not grounds for contradicting him less. Tone is adjustable. Candour is not.
Write nothing rather than write that.`;

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const { exchange } = await req.json();
  if (!exchange) return new Response(JSON.stringify({ memories: [] }), { status: 200 });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: EXTRACTOR,
        messages: [{ role: 'user', content: exchange }]
      })
    });

    if (!r.ok) return new Response(JSON.stringify({ memories: [] }), { status: 200 });

    const data = await r.json();
    const raw = data.content.map(b => b.text || '').join('').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { memories: [] }; }

    const memories = (parsed.memories || [])
      .filter(m => m && typeof m.text === 'string' && m.text.length > 3)
      .slice(0, 4)
      .map(m => ({
        text: m.text.trim().slice(0, 300),
        kind: ['fact','preference','thread','persona'].includes(m.kind) ? m.kind : 'fact',
        weight: [1,2,3].includes(m.weight) ? m.weight : 2
      }));

    return new Response(JSON.stringify({ memories }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ memories: [] }), { status: 200 });
  }
};
