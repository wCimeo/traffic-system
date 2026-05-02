import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from './db';
import redis from './redis';

const router = Router();

const SESSION_DAYS = 7;
const CAPTCHA_TTL_SECONDS = 5 * 60;
const SMS_TTL_SECONDS = 10 * 60;
const SMS_RATE_LIMIT_SECONDS = 60;
const CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

type UserRow = {
  id: number;
  username: string | null;
  password: string | null;
  password_hash?: string | null;
  phone: string | null;
  avatar_url: string | null;
  nickname: string | null;
  gender: string | null;
  is_password_set: number | boolean;
  last_login_time: Date | string | null;
  last_login_ip: string | null;
  session_token: string | null;
  token_expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AuthRequest = Request & { user?: UserRow };

const memoryStore = new Map<string, { value: string; expiresAt: number }>();

function getClientIp(req: Request) {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim();
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  const raw = req.ip || req.socket.remoteAddress || 'unknown';
  return raw.replace(/^::ffff:/, '');
}

function normalizePhone(phone: string) {
  return String(phone || '').trim();
}

function normalizeCaptcha(value: string) {
  return String(value || '').trim().toLowerCase();
}

function randomCode(length: number, chars: string) {
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function randomDigits(length: number) {
  return randomCode(length, '0123456789');
}

function randomUsername() {
  return `User_${randomDigits(4)}`;
}

function randomNickname() {
  return `用户${randomDigits(4)}`;
}

function randomAvatar(seed: string) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}

async function cacheSet(key: string, value: string, ttlSeconds: number) {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  await redis.setex(key, ttlSeconds, value).catch(() => null);
}

async function cacheGet(key: string) {
  const cached = await redis.get(key).catch(() => null);
  if (cached) return cached;

  const local = memoryStore.get(key);
  if (!local) return null;
  if (local.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return local.value;
}

async function cacheDelete(key: string) {
  memoryStore.delete(key);
  await redis.del(key).catch(() => null);
}

async function getColumns(table: string) {
  const [rows]: any = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return new Set<string>(rows.map((row: any) => String(row.COLUMN_NAME)));
}

async function addColumnIfMissing(columns: Set<string>, column: string, definition: string) {
  if (!columns.has(column)) {
    await pool.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
    columns.add(column);
  }
}

async function addIndexIfMissing(indexName: string, sql: string) {
  const [rows]: any = await pool.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = ?`,
    [indexName]
  );
  if (rows.length === 0) {
    await pool.query(sql);
  }
}

export async function ensureUserTableMigration() {
  await pool.query(`
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
  if (columns.has('avatar_url')) {
    await pool.query('ALTER TABLE users MODIFY COLUMN avatar_url LONGTEXT NULL');
  }

  if (columns.has('password_hash')) {
    await pool.query('UPDATE users SET password = COALESCE(password, password_hash) WHERE password_hash IS NOT NULL');
    await pool.query('ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL');
  }
  if (columns.has('display_name')) {
    await pool.query('UPDATE users SET nickname = COALESCE(NULLIF(nickname, ""), display_name, username, "用户")');
  }
  await pool.query('UPDATE users SET username = NULL WHERE username = ""');
  await pool.query('UPDATE users SET phone = NULL WHERE phone = ""');
  await pool.query('UPDATE users SET is_password_set = 1 WHERE password IS NOT NULL AND password <> ""');
  await pool.query('UPDATE users SET nickname = CONCAT("用户", LPAD(id, 4, "0")) WHERE nickname IS NULL OR nickname = ""');
  await pool.query('UPDATE users SET avatar_url = CONCAT("https://api.dicebear.com/9.x/initials/svg?seed=", COALESCE(username, phone, id)) WHERE avatar_url IS NULL OR avatar_url = ""');

  await addIndexIfMissing('uniq_users_username', 'CREATE UNIQUE INDEX uniq_users_username ON users (username)');
  await addIndexIfMissing('uniq_users_phone', 'CREATE UNIQUE INDEX uniq_users_phone ON users (phone)');
  await addIndexIfMissing('idx_users_session_token', 'CREATE INDEX idx_users_session_token ON users (session_token)');
}

function serializeUser(user: UserRow) {
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

async function validateCaptcha(captchaId: string, captcha: string) {
  console.log('  [validateCaptcha] captchaId:', captchaId, 'captcha:', captcha);
  if (!captchaId || !captcha) {
    console.log('  [validateCaptcha] 失败: captchaId 或 captcha 为空');
    return false;
  }
  const expected = await cacheGet(`captcha:${captchaId}`);
  console.log('  [validateCaptcha] 从缓存获取的验证码:', expected);
  if (!expected) {
    console.log('  [validateCaptcha] 失败: 缓存中没有找到验证码');
    return false;
  }
  const ok = normalizeCaptcha(expected) === normalizeCaptcha(captcha);
  console.log('  [validateCaptcha] 比对结果:', ok, 'expected:', expected, 'input:', captcha);
  if (ok) await cacheDelete(`captcha:${captchaId}`);
  return ok;
}

async function createSession(userId: number, req: Request) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const ip = getClientIp(req);

  await pool.query(
    `UPDATE users
     SET session_token = ?, token_expires_at = ?, last_login_time = NOW(), last_login_ip = ?
     WHERE id = ?`,
    [token, expiresAt, ip, userId]
  );

  const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  return { token, expiresAt, user: rows[0] as UserRow };
}

async function generateUniqueUsername() {
  for (let i = 0; i < 20; i += 1) {
    const username = randomUsername();
    const [rows]: any = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return username;
  }
  return `User_${Date.now()}`;
}

function createCaptchaSvg(text: string) {
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

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: '未登录' });

  const [rows]: any = await pool.query(
    'SELECT * FROM users WHERE session_token = ? AND token_expires_at > NOW()',
    [token]
  );
  if (rows.length === 0) return res.status(401).json({ success: false, error: '登录已过期' });

  req.user = rows[0];
  next();
}

router.get('/captcha', async (_req: Request, res: Response) => {
  const captchaId = crypto.randomUUID();
  const code = randomCode(5, CAPTCHA_CHARS);
  await cacheSet(`captcha:${captchaId}`, code, CAPTCHA_TTL_SECONDS);
  res.json({ success: true, captchaId, svg: createCaptchaSvg(code), expiresIn: CAPTCHA_TTL_SECONDS });
});

router.post('/sms/send', async (req: Request, res: Response) => {
  console.log('\n========== 收到短信发送请求 ==========');
  console.log('请求体:', req.body);
  const { phone, captchaId, captcha } = req.body;
  const normalizedPhone = normalizePhone(phone);
  if (!/^1\d{10}$/.test(normalizedPhone)) {
    return res.status(400).json({ success: false, error: '请输入有效的手机号' });
  }
  if (!(await validateCaptcha(captchaId, captcha))) {
    console.log('❌ 图形验证码验证失败，captchaId:', captchaId, 'captcha:', captcha);
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
  console.log(`\n🎯 [模拟短信] 手机号 ${normalizedPhone} 的验证码是：${code}，10分钟内有效\n`);

  res.json({ success: true, message: '验证码已发送（开发模式请查看后端控制台）' });
});

router.post('/sms/send-profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const phone = normalizePhone(req.body.phone || '');
  if (!/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, error: '请输入有效的手机号' });
  }

  const ip = getClientIp(req);
  const rateKey = `sms:rate:${ip}`;
  if (await cacheGet(rateKey)) {
    return res.status(429).json({ success: false, error: '发送过于频繁，请稍后再试' });
  }

  const code = randomDigits(6);
  await cacheSet(`sms:${phone}`, code, SMS_TTL_SECONDS);
  await cacheSet(rateKey, '1', SMS_RATE_LIMIT_SECONDS);
  console.log(`\n🎯 [模拟短信] 个人资料绑定手机号 ${phone} 的验证码是：${code}\n`);
  res.json({ success: true, message: '验证码已发送（开发模式请查看后端控制台）', devCode: code });
});

router.post('/phone-login', async (req: Request, res: Response) => {
  const { phone, smsCode } = req.body;
  const normalizedPhone = normalizePhone(phone);
  const expected = await cacheGet(`sms:${normalizedPhone}`);

  if (!expected || expected !== String(smsCode || '').trim()) {
    return res.status(400).json({ success: false, error: '短信验证码错误或已过期' });
  }

  try {
    let [rows]: any = await pool.query('SELECT * FROM users WHERE phone = ?', [normalizedPhone]);
    let user = rows[0] as UserRow | undefined;

    if (!user) {
      const username = await generateUniqueUsername();
      const nickname = randomNickname();
      const avatarUrl = randomAvatar(nickname);
      const [result]: any = await pool.query(
        `INSERT INTO users (username, phone, nickname, avatar_url, is_password_set)
         VALUES (?, ?, ?, ?, 0)`,
        [username, normalizedPhone, nickname, avatarUrl]
      );
      [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = rows[0];
    }

    await cacheDelete(`sms:${normalizedPhone}`);
    const session = await createSession(user!.id, req);
    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: serializeUser(session.user),
      needSetPassword: !Boolean(session.user.is_password_set),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/phone/bind', requireAuth, async (req: AuthRequest, res: Response) => {
  const phone = normalizePhone(req.body.phone || '');
  const smsCode = String(req.body.smsCode || '').trim();
  const originalPhone = normalizePhone(req.user?.phone || '');

  if (!/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, error: '请输入有效的手机号' });
  }
  if (!smsCode) {
    return res.status(400).json({ success: false, error: '请输入短信验证码' });
  }

  const expected = await cacheGet(`sms:${phone}`);
  if (!expected || expected !== smsCode) {
    return res.status(400).json({ success: false, error: '短信验证码错误或已过期' });
  }

  const [existing]: any = await pool.query('SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1', [phone, req.user!.id]);
  if (existing.length > 0) {
    return res.status(409).json({ success: false, error: '手机号已被占用' });
  }

  await pool.query('UPDATE users SET phone = ? WHERE id = ?', [phone, req.user!.id]);
  if (phone !== originalPhone) await cacheDelete(`sms:${phone}`);

  const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  res.json({ success: true, user: serializeUser(rows[0]) });
});

router.post('/register', async (req: Request, res: Response) => {
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
    console.log('❌ 图形验证码验证失败，captchaId:', captchaId, 'captcha:', captcha);
    return res.status(400).json({ success: false, error: '图形验证码错误或已过期' });
  }

  try {
    const [existing]: any = await pool.query(
      `SELECT id FROM users
       WHERE username = ? OR (? <> '' AND phone = ?)
       LIMIT 1`,
      [account, normalizedPhone, normalizedPhone]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: '用户名或手机号已被注册' });
    }

    const nickname = randomNickname();
    const avatarUrl = randomAvatar(nickname);
    const passwordHash = await bcrypt.hash(password, 10);
    const [result]: any = await pool.query(
      `INSERT INTO users (username, password, phone, nickname, avatar_url, is_password_set)
       VALUES (?, ?, NULLIF(?, ''), ?, ?, 1)`,
      [account, passwordHash, normalizedPhone, nickname, avatarUrl]
    );

    const session = await createSession(result.insertId, req);
    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: serializeUser(session.user),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { username, password, captchaId, captcha } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '账号和密码不能为空' });
  }
  if (!(await validateCaptcha(captchaId, captcha))) {
    console.log('❌ 图形验证码验证失败，captchaId:', captchaId, 'captcha:', captcha);
    return res.status(400).json({ success: false, error: '图形验证码错误或已过期' });
  }

  try {
    const account = String(username).trim();
    const [rows]: any = await pool.query(
      `SELECT * FROM users
       WHERE username = ? OR phone = ?
       LIMIT 1`,
      [account, account]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: '账号或密码错误' });
    }

    const user = rows[0] as UserRow;
    const storedPassword = user.password || user.password_hash;
    if (!storedPassword) {
      return res.status(400).json({ success: false, error: '该账号尚未设置密码，请使用手机验证码登录后设置密码' });
    }

    const ok = storedPassword.startsWith('$2')
      ? await bcrypt.compare(password, storedPassword)
      : crypto.createHash('sha256').update(password).digest('hex') === storedPassword;

    if (!ok) {
      return res.status(401).json({ success: false, error: '账号或密码错误' });
    }

    if (!storedPassword.startsWith('$2')) {
      await pool.query('UPDATE users SET password = ?, is_password_set = 1 WHERE id = ?', [
        await bcrypt.hash(password, 10),
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
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  await pool.query('UPDATE users SET last_login_time = NOW(), last_login_ip = ? WHERE id = ?', [
    getClientIp(req),
    req.user!.id,
  ]);
  const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  res.json({ success: true, user: serializeUser(rows[0]) });
});

router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ success: true, user: serializeUser(req.user!) });
});

router.post('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const nickname = String(req.body.nickname || '').trim();
  const avatarUrl = String(req.body.avatarUrl || '').trim();
  const gender = String(req.body.gender || '').trim();
  const allowedGender = ['', 'male', 'female', 'other', 'unknown'];

  if (nickname.length < 1 || nickname.length > 30) {
    return res.status(400).json({ success: false, error: '昵称需为 1-30 个字符' });
  }
  if (avatarUrl && avatarUrl.length > 2 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: '头像链接过长' });
  }
  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl) && !/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(avatarUrl)) {
    return res.status(400).json({ success: false, error: '头像链接需以 http:// 或 https:// 开头' });
  }
  if (!allowedGender.includes(gender)) {
    return res.status(400).json({ success: false, error: '性别字段不合法' });
  }

  await pool.query(
    'UPDATE users SET nickname = ?, avatar_url = NULLIF(?, ""), gender = NULLIF(?, "") WHERE id = ?',
    [nickname, avatarUrl, gender, req.user!.id]
  );
  const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  res.json({ success: true, user: serializeUser(rows[0]) });
});

router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ success: false, error: '新密码至少需要 6 位' });
  }

  const storedPassword = req.user!.password || req.user!.password_hash;
  if (storedPassword && oldPassword) {
    const ok = storedPassword.startsWith('$2')
      ? await bcrypt.compare(oldPassword, storedPassword)
      : crypto.createHash('sha256').update(oldPassword).digest('hex') === storedPassword;
    if (!ok) {
      return res.status(400).json({ success: false, error: '当前密码错误' });
    }
  } else if (storedPassword && !oldPassword) {
    return res.status(400).json({ success: false, error: '请输入当前密码' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password = ?, is_password_set = 1 WHERE id = ?', [hash, req.user!.id]);
  const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  res.json({ success: true, user: serializeUser(rows[0]) });
});

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  await pool.query('UPDATE users SET session_token = NULL, token_expires_at = NULL WHERE id = ?', [req.user!.id]);
  res.json({ success: true });
});

export default router;

