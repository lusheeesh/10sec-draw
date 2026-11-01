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

    if (!apiKey) {
        console.error("Missing OPENROUTER_API_KEY");
        return res.status(500).json({ error: 'API key is missing in Vercel variables.' });
    }
    
    if (!image) {
        return res.status(400).json({ error: 'Image data missing.' });
    }

    const sysPrompt = `You are a sarcastic art judge evaluating a drawing made in 10 seconds. The prompt is SECRET. NEVER reveal it. Return ONLY valid JSON. Format: {"rating": 8.5, "commentary": "sarcastic friendly review"}`;

    const models = [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.2-11b-vision-instruct:free',
        'qwen/qwen-2-vl-7b-instruct:free'
    ];

    let lastError = "All models failed.";

    for (const model of models) {
        try {
            console.log(`Trying model: ${model}`);
            
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
                                { type: 'text', text: `Secret challenge: ${prompt}. Judge this.` },
                                { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) {
                lastError = `Status ${response.status}`;
                continue;
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                continue;
            }

            const content = data.choices[0].message.content;

            const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
            const start = cleaned.indexOf("{");
            const end = cleaned.lastIndexOf("}");
            
            if (start === -1 || end === -1) {
                continue;
            }

            const result = JSON.parse(cleaned.slice(start, end + 1));

            if (result.rating !== undefined && result.commentary) {
                return res.status(200).json(result);
            }

        } catch (e) {
            console.error(`Error with model ${model}:`, e.message);
            lastError = e.message;
            continue;
        }
    }

    return res.status(503).json({ error: lastError });
}
