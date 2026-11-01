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
        return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY.' });
    }
    
    if (!image) {
        return res.status(400).json({ error: 'Image data missing.' });
    }

    const sysPrompt = `You are a sarcastic art judge evaluating a drawing made in 10 seconds. The prompt is SECRET. NEVER reveal it. Return ONLY valid JSON. Format: {"rating": 8.5, "commentary": "sarcastic friendly review"}`;

    // Updated list of active free OpenRouter vision models
    const models = [
        'meta-llama/llama-3.2-11b-vision-instruct:free',
        'meta-llama/llama-3.2-90b-vision-instruct:free',
        'google/gemini-2.0-flash-lite-preview-02-05:free',
        'google/gemini-2.0-pro-exp-02-05:free',
        'google/gemini-2.0-flash-exp:free'
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
                                { type: 'text', text: `Secret challenge: ${prompt}. Judge this.` },
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errData = await response.text();
                // Save the exact reason this specific model failed
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

            if (result.rating !== undefined && result.commentary) {
                // Success! Return immediately.
                return res.status(200).json(result);
            } else {
                errorLog.push(`[${model} returned JSON but missed rating/commentary keys]`);
            }

        } catch (e) {
            errorLog.push(`[${model} crashed: ${e.message}]`);
            continue;
        }
    }

    // If we reach this point, all 5 models failed. Print the combined log so we know exactly why.
    return res.status(503).json({ error: `AI Error Log: ${errorLog.join(" ")}` });
}
