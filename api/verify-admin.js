import crypto from 'crypto';

const SECRET = process.env.ADMIN_JWT_SECRET || (process.env.ADMIN_PIN || '123456') + '_konten_maker_secret_salt_2026';

function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        const name = parts[0]?.trim();
        if (!name) return;
        const val = parts.slice(1).join('=').trim();
        list[name] = decodeURIComponent(val);
    });
    return list;
}

function signToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return null;
    }
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    // 1. Verifikasi Status Sesi Aktif (GET)
    if (req.method === 'GET') {
        const cookies = parseCookies(req.headers.cookie);
        const payload = verifyToken(cookies.admin_token);
        if (payload && payload.role === 'admin') {
            return res.status(200).json({ authenticated: true, role: 'admin' });
        }
        return res.status(200).json({ authenticated: false });
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

        // Logout: bersihkan cookie sesi
        if (body.action === 'logout') {
            res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
            return res.status(200).json({ success: true, message: 'Logout admin berhasil.' });
        }

        // Login: cek PIN dan terbitkan token JWT aman
        const { pin } = body;
        if (!pin) {
            return res.status(400).json({ success: false, error: 'PIN/Password wajib diisi.' });
        }

        const expectedPin = process.env.ADMIN_PIN || '123456';
        if (String(pin).trim() === String(expectedPin).trim()) {
            const token = signToken({ role: 'admin', exp: Date.now() + 24 * 60 * 60 * 1000 });
            const isProd = process.env.NODE_ENV === 'production';
            res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; ${isProd ? 'Secure;' : ''}`);
            return res.status(200).json({
                success: true,
                message: 'Verifikasi admin berhasil.'
            });
        } else {
            return res.status(401).json({
                success: false,
                error: 'PIN / Password admin salah!'
            });
        }
    }

    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}