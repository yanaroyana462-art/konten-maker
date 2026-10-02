// Konfigurasi model AI terpusat
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
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

    // UTAMAKAN Environment Variable Vercel dulu, baru ambil dari client jika env Vercel kosong
    let rawKey = process.env.GEMINI_API_KEY || body?.apiKey;
    const apiKey = (typeof rawKey === 'string') ? rawKey.trim() : '';

    if (!apiKey) {
        return res.status(500).json({ 
            error: 'GEMINI_API_KEY belum dikonfigurasi di Environment Variables Vercel atau input form.' 
        });
    }

    const { prompt } = body || {};
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt tidak boleh kosong.' });
    }

    const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
    });

    try {
        let response = await fetch(getGeminiUrl(DEFAULT_MODEL, apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        });

        let data = await response.json();

        // Fallback jika model utama 404 (Not Found)
        if (!response.ok && response.status === 404) {
            console.warn(`[Gemini API] Model ${DEFAULT_MODEL} 404, mencoba fallback ke ${FALLBACK_MODEL}...`);
            response = await fetch(getGeminiUrl(FALLBACK_MODEL, apiKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
            });
            data = await response.json();
        }

        // Jika API Key tidak valid / Error 400
        if (!response.ok) {
            return res.status(response.status).json({
                error: data.error?.message || `Gemini API Error (HTTP ${response.status})`
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({
            error: err.message || 'Terjadi kesalahan internal pada server'
        });
    }
}