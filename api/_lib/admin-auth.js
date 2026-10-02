import crypto from 'crypto';

const SECRET = process.env.ADMIN_JWT_SECRET || (process.env.ADMIN_PIN || '123456') + '_konten_maker_secret_salt_2026';

function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        const name = parts[0]?.trim();
        if (!name) return;
        cookies[name] = decodeURIComponent(parts.slice(1).join('=').trim());
    });
    return cookies;
}

export function verifyAdminRequest(req) {
    const token = parseCookies(req.headers.cookie).admin_token;
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [header, body, signature] = parts;
    const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        return payload.role === 'admin' && (!payload.exp || Date.now() <= payload.exp);
    } catch {
        return false;
    }
}