export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { image, prompt } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY.' });
    if (!image) return res.status(400).json({ error: 'Image data missing.' });
    if (!prompt) return res.status(400).json({ error: 'Secret prompt missing.' });

    const sysPrompt = `You are a harsh but fair art judge for a 10-second drawing challenge.
The player was given a SECRET drawing prompt: "${prompt}".
Your job is to evaluate how well their drawing matches that secret prompt and score it out of 10.

SCORING RULES:
- Score based on BOTH (a) how recognizable the drawing is and (b) how well it matches the secret prompt.
- Clearly shows the prompt subject: 7-10 (rough but readable = 7-8, surprisingly good = 9-10).
- Somewhat related but unclear: 4-6.
- Shows something completely different: 1-3.
- Empty canvas / random scribbles: 0-1.
- Be honest. Do NOT inflate scores. A 5 must feel average.

COMMENTARY RULES:
- You MUST reference the secret prompt subject in your commentary (e.g., "your bicycle looks like a deflated balloon") so the player knows you actually saw what they drew.
- Be sarcastic, snarky, and funny. Roast their attempt creatively.
- Keep it 1-3 sentences. Punchy.
- NEVER just say "great job!" or "nice drawing!" — always tie the comment to how well the drawing matches the prompt.
- Do NOT quote the prompt verbatim like "your prompt was a bicycle". Refer to the subject naturally ("your bicycle...", "this bicycle...").

Return ONLY valid JSON in this exact format:
{"rating": 7.5, "commentary": "sarcastic review here"}

rating must be a number 0-10 with one decimal. commentary must be a string.`;

    const models = [
        'google/gemma-4-26b-a4b-it:free',
        'google/gemma-4-31b-it:free',
        'nvidia/nemotron-nano-12b-v2-vl:free',
        'nvidia/nemotron-3.5-super-vl:free',
        'inclusionai/ling-3.0-flash-vl:free'
    ];

    let errorLog = [];

    for (const model of models) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/lusheeesh',
                    'X-Title': '10-Second Sketch'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: sysPrompt },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: `Here is my 10-second drawing of "${prompt}". Judge it.` },
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errData = await response.text();
                errorLog.push(`[${model} failed: ${response.status} - ${errData.substring(0, 80)}]`);
                continue;
            }

            const data = await response.json();

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                errorLog.push(`[${model} returned empty/invalid response]`);
                continue;
            }

            const content = data.choices[0].message.content;
            const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
            const start = cleaned.indexOf("{");
            const end = cleaned.lastIndexOf("}");

            if (start === -1 || end === -1) {
                errorLog.push(`[${model} failed to format JSON: ${content.substring(0, 30)}]`);
                continue;
            }

            const result = JSON.parse(cleaned.slice(start, end + 1));

            if (typeof result.rating === 'number' && typeof result.commentary === 'string') {
                result.rating = Math.max(0, Math.min(10, result.rating));
                return res.status(200).json(result);
            } else {
                errorLog.push(`[${model} returned JSON but missed rating/commentary keys]`);
            }
        } catch (e) {
            errorLog.push(`[${model} crashed: ${e.message}]`);
            continue;
        }
    }

    return res.status(503).json({ error: `AI Error Log: ${errorLog.join(" ")}` });
}
