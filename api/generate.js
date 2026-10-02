export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY belum dikonfigurasi di Environment Variables Vercel.' });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({ error: 'Format JSON request tidak valid.' });
        }
    }
    const { prompt } = body || {};
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt tidak boleh kosong.' });
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        const data = await response.json();
        if (!response.ok && response.status === 404) {
            // Fallback ke model gemini-1.5-flash jika model 2.0 tidak tersedia
            const fallbackRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            return res.status(fallbackRes.status).json(await fallbackRes.json());
        }
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(500).json({
            error: err.message || 'Terjadi kesalahan internal pada server'
        });
    }
}