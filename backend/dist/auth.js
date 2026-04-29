"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserTableMigration = ensureUserTableMigration;
exports.requireAuth = requireAuth;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("./db"));
const redis_1 = __importDefault(require("./redis"));
const router = (0, express_1.Router)();
const SESSION_DAYS = 7;
const CAPTCHA_TTL_SECONDS = 5 * 60;
const SMS_TTL_SECONDS = 10 * 60;
const SMS_RATE_LIMIT_SECONDS = 60;
const CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const memoryStore = new Map();
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
function normalizePhone(phone) {
    return String(phone || '').trim();
}
function normalizeCaptcha(value) {
    return String(value || '').trim().toLowerCase();
}
function randomCode(length, chars) {
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function randomDigits(length) {
    return randomCode(length, '0123456789');
}
function randomUsername() {
    return `User_${randomDigits(4)}`;
}
function randomNickname() {
    return `用户${randomDigits(4)}`;
}
function randomAvatar(seed) {
    return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}
async function cacheSet(key, value, ttlSeconds) {
    memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    await redis_1.default.setex(key, ttlSeconds, value).catch(() => null);
}
async function cacheGet(key) {
    const cached = await redis_1.default.get(key).catch(() => null);
    if (cached)
        return cached;
    const local = memoryStore.get(key);
    if (!local)
        return null;
    if (local.expiresAt < Date.now()) {
        memoryStore.delete(key);
        return null;
    }
    return local.value;
}
async function cacheDelete(key) {
    memoryStore.delete(key);
    await redis_1.default.del(key).catch(() => null);
}
async function getColumns(table) {
    const [rows] = await db_1.default.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table]);
    return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}
async function addColumnIfMissing(columns, column, definition) {
    if (!columns.has(column)) {
        await db_1.default.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
        columns.add(column);
    }
}
async function addIndexIfMissing(indexName, sql) {
    const [rows] = await db_1.default.query(`SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = ?`, [indexName]);
    if (rows.length === 0) {
        await db_1.default.query(sql);
    }
}
async function ensureUserTableMigration() {
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(80) NULL,
      password VARCHAR(255) NULL,
      phone VARCHAR(20) NULL,
      avatar_url VARCHAR(500) NULL,
      nickname VARCHAR(80) NOT NULL,
      gender VARCHAR(20) NULL,
      is_password_set TINYINT(1) NOT NULL DEFAULT 0,
      last_login_time DATETIME NULL,
      last_login_ip VARCHAR(64) NULL,
      session_token VARCHAR(128) NULL,
      token_expires_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    const columns = await getColumns('users');
    await addColumnIfMissing(columns, 'username', 'VARCHAR(80) NULL');
    await addColumnIfMissing(columns, 'password', 'VARCHAR(255) NULL');
    await addColumnIfMissing(columns, 'phone', 'VARCHAR(20) NULL');
    await addColumnIfMissing(columns, 'avatar_url', 'VARCHAR(500) NULL');
    await addColumnIfMissing(columns, 'nickname', 'VARCHAR(80) NOT NULL DEFAULT "用户"');
    await addColumnIfMissing(columns, 'gender', 'VARCHAR(20) NULL');
    await addColumnIfMissing(columns, 'is_password_set', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(columns, 'last_login_time', 'DATETIME NULL');
    await addColumnIfMissing(columns, 'last_login_ip', 'VARCHAR(64) NULL');
    await addColumnIfMissing(columns, 'session_token', 'VARCHAR(128) NULL');
    await addColumnIfMissing(columns, 'token_expires_at', 'DATETIME NULL');
    await addColumnIfMissing(columns, 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing(columns, 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    if (columns.has('password_hash')) {
        await db_1.default.query('UPDATE users SET password = COALESCE(password, password_hash) WHERE password_hash IS NOT NULL');
    }
    if (columns.has('display_name')) {
        await db_1.default.query('UPDATE users SET nickname = COALESCE(NULLIF(nickname, ""), display_name, username, "用户")');
    }
    await db_1.default.query('UPDATE users SET username = NULL WHERE username = ""');
    await db_1.default.query('UPDATE users SET phone = NULL WHERE phone = ""');
    await db_1.default.query('UPDATE users SET is_password_set = 1 WHERE password IS NOT NULL AND password <> ""');
    await db_1.default.query('UPDATE users SET nickname = CONCAT("用户", LPAD(id, 4, "0")) WHERE nickname IS NULL OR nickname = ""');
    await db_1.default.query('UPDATE users SET avatar_url = CONCAT("https://api.dicebear.com/9.x/initials/svg?seed=", COALESCE(username, phone, id)) WHERE avatar_url IS NULL OR avatar_url = ""');
    await addIndexIfMissing('uniq_users_username', 'CREATE UNIQUE INDEX uniq_users_username ON users (username)');
    await addIndexIfMissing('uniq_users_phone', 'CREATE UNIQUE INDEX uniq_users_phone ON users (phone)');
    await addIndexIfMissing('idx_users_session_token', 'CREATE INDEX idx_users_session_token ON users (session_token)');
}
function serializeUser(user) {
    return {
        id: user.id,
        username: user.username,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        nickname: user.nickname,
        displayName: user.nickname || user.username || user.phone || '用户',
        gender: user.gender,
        isPasswordSet: Boolean(user.is_password_set),
        lastLoginTime: user.last_login_time,
        lastLoginIp: user.last_login_ip,
    };
}
async function validateCaptcha(captchaId, captcha) {
    if (!captchaId || !captcha)
        return false;
    const expected = await cacheGet(`captcha:${captchaId}`);
    if (!expected)
        return false;
    const ok = normalizeCaptcha(expected) === normalizeCaptcha(captcha);
    if (ok)
        await cacheDelete(`captcha:${captchaId}`);
    return ok;
}
async function createSession(userId, req) {
    const token = crypto_1.default.randomUUID().replace(/-/g, '') + crypto_1.default.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const ip = getClientIp(req);
    await db_1.default.query(`UPDATE users
     SET session_token = ?, token_expires_at = ?, last_login_time = NOW(), last_login_ip = ?
     WHERE id = ?`, [token, expiresAt, ip, userId]);
    const [rows] = await db_1.default.query('SELECT * FROM users WHERE id = ?', [userId]);
    return { token, expiresAt, user: rows[0] };
}
async function generateUniqueUsername() {
    for (let i = 0; i < 20; i += 1) {
        const username = randomUsername();
        const [rows] = await db_1.default.query('SELECT id FROM users WHERE username = ?', [username]);
        if (rows.length === 0)
            return username;
    }
    return `User_${Date.now()}`;
}
function createCaptchaSvg(text) {
    const chars = text.split('');
    const noise = Array.from({ length: 8 }, (_, index) => {
        const y1 = 12 + Math.random() * 40;
        const y2 = 12 + Math.random() * 40;
        return `<line x1="${index * 18}" y1="${y1.toFixed(1)}" x2="${120 - index * 10}" y2="${y2.toFixed(1)}" stroke="#94a3b8" stroke-width="1" opacity="0.45" />`;
    }).join('');
    const letters = chars.map((char, index) => {
        const x = 18 + index * 24;
        const y = 38 + Math.random() * 8;
        const rotate = Math.round(Math.random() * 28 - 14);
        return `<text x="${x}" y="${y.toFixed(1)}" fill="#0f172a" font-size="28" font-weight="800" font-family="Arial, sans-serif" transform="rotate(${rotate} ${x} ${y.toFixed(1)})">${char}</text>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="56" viewBox="0 0 150 56" role="img" aria-label="captcha">
    <rect width="150" height="56" rx="14" fill="#f8fafc" />
    <circle cx="26" cy="18" r="18" fill="#d1fae5" opacity="0.65" />
    <circle cx="122" cy="38" r="20" fill="#e0f2fe" opacity="0.8" />
    ${noise}
    ${letters}
  </svg>`;
}
async function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token)
        return res.status(401).json({ success: false, error: '未登录' });
    const [rows] = await db_1.default.query('SELECT * FROM users WHERE session_token = ? AND token_expires_at > NOW()', [token]);
    if (rows.length === 0)
        return res.status(401).json({ success: false, error: '登录已过期' });
    req.user = rows[0];
    next();
}
router.get('/captcha', async (_req, res) => {
    const captchaId = crypto_1.default.randomUUID();
    const code = randomCode(5, CAPTCHA_CHARS);
    await cacheSet(`captcha:${captchaId}`, code, CAPTCHA_TTL_SECONDS);
    res.json({ success: true, captchaId, svg: createCaptchaSvg(code), expiresIn: CAPTCHA_TTL_SECONDS });
});
router.post('/sms/send', async (req, res) => {
    const { phone, captchaId, captcha } = req.body;
    const normalizedPhone = normalizePhone(phone);
    if (!/^1\d{10}$/.test(normalizedPhone)) {
        return res.status(400).json({ success: false, error: '请输入有效的手机号' });
    }
    if (!(await validateCaptcha(captchaId, captcha))) {
        return res.status(400).json({ success: false, error: '图形验证码错误或已过期' });
    }
    const ip = getClientIp(req);
    const rateKey = `sms:rate:${ip}`;
    if (await cacheGet(rateKey)) {
        return res.status(429).json({ success: false, error: '发送过于频繁，请稍后再试' });
    }
    const code = randomDigits(6);
    await cacheSet(`sms:${normalizedPhone}`, code, SMS_TTL_SECONDS);
    await cacheSet(rateKey, '1', SMS_RATE_LIMIT_SECONDS);
    console.log(`[模拟短信] 手机号 ${normalizedPhone} 的验证码是：${code}，10分钟内有效`);
    res.json({ success: true, message: '验证码已发送（开发模式请查看后端控制台）' });
});
router.post('/phone-login', async (req, res) => {
    const { phone, smsCode } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const expected = await cacheGet(`sms:${normalizedPhone}`);
    if (!expected || expected !== String(smsCode || '').trim()) {
        return res.status(400).json({ success: false, error: '短信验证码错误或已过期' });
    }
    try {
        let [rows] = await db_1.default.query('SELECT * FROM users WHERE phone = ?', [normalizedPhone]);
        let user = rows[0];
        if (!user) {
            const username = await generateUniqueUsername();
            const nickname = randomNickname();
            const avatarUrl = randomAvatar(nickname);
            const [result] = await db_1.default.query(`INSERT INTO users (username, phone, nickname, avatar_url, is_password_set)
         VALUES (?, ?, ?, ?, 0)`, [username, normalizedPhone, nickname, avatarUrl]);
            [rows] = await db_1.default.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
            user = rows[0];
        }
        await cacheDelete(`sms:${normalizedPhone}`);
        const session = await createSession(user.id, req);
        res.json({
            success: true,
            token: session.token,
            expiresAt: session.expiresAt,
            user: serializeUser(session.user),
            needSetPassword: !Boolean(session.user.is_password_set),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
router.post('/register', async (req, res) => {
    const { username, password, confirmPassword, phone, captchaId, captcha } = req.body;
    const account = String(username || '').trim();
    const normalizedPhone = normalizePhone(phone || '');
    if (!/^[A-Za-z0-9_]{4,32}$/.test(account)) {
        return res.status(400).json({ success: false, error: '用户名需为 4-32 位字母、数字或下划线' });
    }
    if (!password || String(password).length < 6) {
        return res.status(400).json({ success: false, error: '密码至少需要 6 位' });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
        return res.status(400).json({ success: false, error: '两次输入的密码不一致' });
    }
    if (normalizedPhone && !/^1\d{10}$/.test(normalizedPhone)) {
        return res.status(400).json({ success: false, error: '请输入有效的手机号' });
    }
    if (!(await validateCaptcha(captchaId, captcha))) {
        return res.status(400).json({ success: false, error: '图形验证码错误或已过期' });
    }
    try {
        const [existing] = await db_1.default.query(`SELECT id FROM users
       WHERE username = ? OR (? <> '' AND phone = ?)
       LIMIT 1`, [account, normalizedPhone, normalizedPhone]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, error: '用户名或手机号已被注册' });
        }
        const nickname = randomNickname();
        const avatarUrl = randomAvatar(nickname);
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const [result] = await db_1.default.query(`INSERT INTO users (username, password, phone, nickname, avatar_url, is_password_set)
       VALUES (?, ?, NULLIF(?, ''), ?, ?, 1)`, [account, passwordHash, normalizedPhone, nickname, avatarUrl]);
        const session = await createSession(result.insertId, req);
        res.json({
            success: true,
            token: session.token,
            expiresAt: session.expiresAt,
            user: serializeUser(session.user),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
router.post('/login', async (req, res) => {
    const { username, password, captchaId, captcha } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: '账号和密码不能为空' });
    }
    if (!(await validateCaptcha(captchaId, captcha))) {
        return res.status(400).json({ success: false, error: '图形验证码错误或已过期' });
    }
    try {
        const account = String(username).trim();
        const [rows] = await db_1.default.query(`SELECT * FROM users
       WHERE username = ? OR phone = ?
       LIMIT 1`, [account, account]);
        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: '账号或密码错误' });
        }
        const user = rows[0];
        const storedPassword = user.password || user.password_hash;
        if (!storedPassword) {
            return res.status(400).json({ success: false, error: '该账号尚未设置密码，请使用手机验证码登录后设置密码' });
        }
        const ok = storedPassword.startsWith('$2')
            ? await bcryptjs_1.default.compare(password, storedPassword)
            : crypto_1.default.createHash('sha256').update(password).digest('hex') === storedPassword;
        if (!ok) {
            return res.status(401).json({ success: false, error: '账号或密码错误' });
        }
        if (!storedPassword.startsWith('$2')) {
            await db_1.default.query('UPDATE users SET password = ?, is_password_set = 1 WHERE id = ?', [
                await bcryptjs_1.default.hash(password, 10),
                user.id,
            ]);
        }
        const session = await createSession(user.id, req);
        res.json({
            success: true,
            token: session.token,
            expiresAt: session.expiresAt,
            user: serializeUser(session.user),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
router.get('/verify', requireAuth, async (req, res) => {
    await db_1.default.query('UPDATE users SET last_login_time = NOW(), last_login_ip = ? WHERE id = ?', [
        getClientIp(req),
        req.user.id,
    ]);
    res.json({ success: true, user: serializeUser(req.user) });
});
router.get('/me', requireAuth, (req, res) => {
    res.json({ success: true, user: serializeUser(req.user) });
});
router.post('/change-password', requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ success: false, error: '新密码至少需要 6 位' });
    }
    const storedPassword = req.user.password || req.user.password_hash;
    if (storedPassword && oldPassword) {
        const ok = storedPassword.startsWith('$2')
            ? await bcryptjs_1.default.compare(oldPassword, storedPassword)
            : crypto_1.default.createHash('sha256').update(oldPassword).digest('hex') === storedPassword;
        if (!ok) {
            return res.status(400).json({ success: false, error: '当前密码错误' });
        }
    }
    else if (storedPassword && !oldPassword) {
        return res.status(400).json({ success: false, error: '请输入当前密码' });
    }
    const hash = await bcryptjs_1.default.hash(newPassword, 10);
    await db_1.default.query('UPDATE users SET password = ?, is_password_set = 1 WHERE id = ?', [hash, req.user.id]);
    const [rows] = await db_1.default.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, user: serializeUser(rows[0]) });
});
router.post('/logout', requireAuth, async (req, res) => {
    await db_1.default.query('UPDATE users SET session_token = NULL, token_expires_at = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true });
});
exports.default = router;
