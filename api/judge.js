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

    if (!apiKey) return res.status(500).json({ error: 'Server misconfiguration' });
    if (!image || !prompt) return res.status(400).json({ error: 'Invalid data' });

    const models = [
        'google/gemini-2.0-flash-exp:free',
        'google/gemini-1.5-pro-exp:free',
        'qwen/qwen-2-vl-7b-instruct:free'
    ];

    const sysPrompt = `You are a sarcastic art judge evaluating a drawing made in 10 seconds. The prompt is SECRET. NEVER reveal it. NEVER say the answer. You should try guessing what they actually drew. Return ONLY valid JSON in this exact format: {"rating": 8.5, "commentary": "sarcastic friendly review"}`;

    for (const model of models) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: sysPrompt },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: `Secret challenge: ${prompt}. Judge this.` },
                                { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) continue;

            const data = await response.json();
            const content = data.choices[0].message.content;

            const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
            const start = cleaned.indexOf("{");
            const end = cleaned.lastIndexOf("}");
            const result = JSON.parse(cleaned.slice(start, end + 1));

            if (result.rating !== undefined && result.commentary) {
                return res.status(200).json(result);
            }
        } catch (e) {
            continue;
        }
    }

    res.status(503).json({ error: 'All models failed.' });
}
