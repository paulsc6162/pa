// ElevenLabs text-to-speech proxy. The key stays on the server.
//
// Netlify env vars:
//   ELEVENLABS_API_KEY   required
//   ELEVENLABS_VOICE_ID  optional, falls back to the id below
//
// Find voice ids at elevenlabs.io → Voices → the ... menu → Copy voice ID.
// Worth auditioning for this: George (warm British narrator) and
// Daniel (deeper, news-presenter British). Verify the id in your own
// dashboard rather than trusting a hard-coded one.

const FALLBACK_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const { text } = await req.json();
  if (!text) return new Response('No text', { status: 400 });

  const voice = process.env.ELEVENLABS_VOICE_ID || FALLBACK_VOICE;

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'content-type': 'application/json',
      'accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: text.slice(0, 2500),
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.45,        // lower = more expressive, higher = more level
        similarity_boost: 0.75,
        style: 0.25,            // a little colour, not theatrical
        use_speaker_boost: true
      }
    })
  });

  // On any failure the app falls back to the on-device voice, so fail quietly.
  if (!r.ok) return new Response('tts failed', { status: 502 });

  return new Response(r.body, {
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' }
  });
};
