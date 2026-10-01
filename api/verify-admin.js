export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const { pin } = req.body || {};
    if (!pin) {
        return res.status(400).json({ success: false, error: 'PIN/Password wajib diisi.' });
    }

    // Mengambil PIN dari Environment Variables Vercel (ADMIN_PIN), atau default '123456'
    const expectedPin = process.env.ADMIN_PIN || '123456';

    if (String(pin).trim() === String(expectedPin).trim()) {
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