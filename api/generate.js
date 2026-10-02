// Konfigurasi model AI terpusat
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const SECONDARY_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';

function getGeminiUrl(model, key) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

// Fungsi bantu delay/pause
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    let rawKey = process.env.GEMINI_API_KEY || body?.apiKey;
    const apiKey = (typeof rawKey === 'string') ? rawKey.trim() : '';

    if (!apiKey) {
        return res.status(500).json({ 
            error: 'GEMINI_API_KEY belum dikonfigurasi di Environment Variables Vercel.' 
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
        // Percobaan 1: Panggil model utama
        let response = await fetch(getGeminiUrl(PRIMARY_MODEL, apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        });

        // Jika kena 503 (High Demand) atau 429 (Rate Limit), coba retry setelah jeda 2 detik
        if (response.status === 503 || response.status === 429) {
            console.warn(`[Gemini API] Model ${PRIMARY_MODEL} sibuk (${response.status}). Mencoba retry dalam 2 detik...`);
            await delay(2000);
            
            response = await fetch(getGeminiUrl(PRIMARY_MODEL, apiKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
            });
        }

        // Jika masih gagal / 503 lagi, fallback ke model sekunder
        if (!response.ok && (response.status === 503 || response.status === 404)) {
            console.warn(`[Gemini API] Fallback switch ke model sekunder: ${SECONDARY_MODEL}`);
            response = await fetch(getGeminiUrl(SECONDARY_MODEL, apiKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
            });
        }

        const data = await response.json();

        if (!response.ok) {
            console.error('[Gemini API Final Error]', data);
            return res.status(response.status).json({
                error: data.error?.message || `Server Google Gemini sedang padat (${response.status}). Silakan coba beberapa saat lagi.`
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({
            error: err.message || 'Terjadi kesalahan internal pada server'
        });
    }
}