// Konfigurasi model AI terpusat
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-flash';

function getGeminiUrl(model, key) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({ error: 'Format JSON request tidak valid.' });
        }
    }

    // Gunakan apiKey dari client jika dikirim, atau fallback ke Environment Variable server
    const apiKey = (body?.apiKey && typeof body.apiKey === 'string') ? body.apiKey.trim() : process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY belum dikonfigurasi di Environment Variables Vercel atau form.' });
    }

    const { prompt } = body || {};
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt tidak boleh kosong.' });
    }

    const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
    });

    try {
        const response = await fetch(getGeminiUrl(DEFAULT_MODEL, apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        });

        const data = await response.json();
        if (!response.ok && response.status === 404) {
            // Fallback ke model cadangan jika model utama tidak tersedia
            const fallbackRes = await fetch(getGeminiUrl(FALLBACK_MODEL, apiKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
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