import { verifyAdminRequest } from './_lib/admin-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rpsrkyjlrwlvepyjtegb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ARTICLE_FIELDS = [
    'title', 'category', 'category_label', 'tone', 'audience', 'words', 'read_time', 'snippet', 'content',
    'title_en', 'snippet_en', 'content_en', 'title_ar', 'snippet_ar', 'content_ar'
];
const MULTILINGUAL_FIELDS = ['title_en', 'snippet_en', 'content_en', 'title_ar', 'snippet_ar', 'content_ar'];

function sendError(res, status, message) {
    return res.status(status).json({ error: message });
}

async function supabaseRequest(path, options = {}) {
    if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || data?.details || `Supabase HTTP ${response.status}`);
    return data;
}

function parseBody(req) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
}

function articlePayload(body) {
    return Object.fromEntries(ARTICLE_FIELDS.filter(field => body[field] !== undefined).map(field => [field, body[field]]));
}

function stripMultilingual(data) {
    if (Array.isArray(data)) return data.map(item => stripMultilingual(item));
    const copy = { ...data };
    for (const f of MULTILINGUAL_FIELDS) delete copy[f];
    return copy;
}

async function saveWithSchemaFallback(path, options, payload) {
    try {
        return await supabaseRequest(path, { ...options, body: JSON.stringify(payload) });
    } catch (err) {
        // Jika Supabase belum memiliki kolom multibahasa baru di schema cache
        if (err.message && err.message.includes('in the schema cache')) {
            const stripped = stripMultilingual(payload);
            return await supabaseRequest(path, { ...options, body: JSON.stringify(stripped) });
        }
        throw err;
    }
}

export default async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const resource = req.query?.resource || url.searchParams.get('resource');
    const id = req.query?.id || url.searchParams.get('id');

    try {
        if (resource === 'articles' && req.method === 'GET') {
            const query = id ? `?id=eq.${encodeURIComponent(id)}&select=*` : '?select=*&order=created_at.desc';
            const articles = await supabaseRequest(`articles${query}`);
            return res.status(200).json(articles);
        }

        if (resource === 'requests' && req.method === 'POST') {
            const body = parseBody(req);
            if (!body.title?.trim() || !body.theme?.trim()) return sendError(res, 400, 'Judul dan tema wajib diisi.');
            const request = {
                title: body.title.trim(),
                theme: body.theme.trim(),
                tone: body.tone || 'santai',
                user_name: body.user_name || 'Pengunjung Portal',
                user_phone: body.user_phone || ''
            };
            await supabaseRequest('article_requests', {
                method: 'POST',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify(request)
            });
            return res.status(201).json({ success: true });
        }

        if (!verifyAdminRequest(req)) return sendError(res, 401, 'Sesi admin tidak valid atau telah berakhir.');

        if (resource === 'requests' && req.method === 'GET') {
            const requests = await supabaseRequest('article_requests?select=*&order=created_at.desc');
            return res.status(200).json(requests);
        }

        if (resource === 'articles' && req.method === 'POST') {
            const article = articlePayload(parseBody(req));
            if (!article.title?.trim() || !article.content?.trim()) return sendError(res, 400, 'Judul dan konten wajib diisi.');
            const saved = await saveWithSchemaFallback('articles', {
                method: 'POST',
                headers: { Prefer: 'return=representation' }
            }, article);
            return res.status(201).json(saved?.[0] || saved);
        }

        if (resource === 'legacy-articles' && req.method === 'POST') {
            const legacyArticles = parseBody(req);
            if (!Array.isArray(legacyArticles) || legacyArticles.length > 500) {
                return sendError(res, 400, 'Data impor harus berupa daftar maksimal 500 artikel.');
            }
            const articles = legacyArticles.filter(item => item?.title && item?.content).map(item => {
                const article = articlePayload({
                    ...item,
                    category_label: item.category_label || item.categoryLabel,
                    read_time: item.read_time || item.readTime
                });
                const id = Number(item.id);
                if (Number.isSafeInteger(id) && id > 0) article.id = id;
                return article;
            });
            if (!articles.length) return sendError(res, 400, 'Tidak ada artikel lokal yang valid untuk diimpor.');
            try {
                await saveWithSchemaFallback('articles?on_conflict=id', {
                    method: 'POST',
                    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
                }, articles);
            } catch (err) {
                if (err.message && err.message.includes('column "id"')) {
                    // Jika tabel di Postgres menggunakan GENERATED ALWAYS AS IDENTITY,
                    // buang id eksplisit agar Supabase membuat id secara otomatis.
                    const articlesWithoutId = articles.map(item => {
                        const copy = { ...item };
                        delete copy.id;
                        return copy;
                    });
                    await saveWithSchemaFallback('articles', {
                        method: 'POST',
                        headers: { Prefer: 'return=minimal' }
                    }, articlesWithoutId);
                } else {
                    throw err;
                }
            }
            return res.status(200).json({ imported: articles.length });
        }

        if (resource === 'legacy-requests' && req.method === 'POST') {
            const legacyRequests = parseBody(req);
            if (!Array.isArray(legacyRequests) || legacyRequests.length > 500) {
                return sendError(res, 400, 'Data impor harus berupa daftar maksimal 500 permintaan.');
            }
            const requests = legacyRequests.filter(item => item?.title && item?.theme).map(item => ({
                title: String(item.title).trim(),
                theme: String(item.theme).trim(),
                tone: item.tone || 'santai',
                user_name: item.user_name || 'Pengunjung Portal',
                user_phone: item.user_phone || ''
            }));
            if (!requests.length) return sendError(res, 400, 'Tidak ada permintaan lokal yang valid untuk diimpor.');
            await supabaseRequest('article_requests', {
                method: 'POST',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify(requests)
            });
            return res.status(200).json({ imported: requests.length });
        }

        if (resource === 'articles' && req.method === 'PATCH' && id) {
            const article = articlePayload(parseBody(req));
            const saved = await saveWithSchemaFallback(`articles?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { Prefer: 'return=representation' }
            }, article);
            if (!saved?.length) return sendError(res, 404, 'Artikel tidak ditemukan.');
            return res.status(200).json(saved[0]);
        }

        if (resource === 'articles' && req.method === 'DELETE' && id) {
            await supabaseRequest(`articles?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
            return res.status(200).json({ success: true });
        }

        return sendError(res, 405, 'Metode atau resource tidak didukung.');
    } catch (error) {
        console.error('Supabase content API:', error);
        return sendError(res, 502, error.message || 'Gagal menghubungi Supabase.');
    }
}