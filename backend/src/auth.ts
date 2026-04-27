import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from './db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'traffic_secret_2026';

// 登录
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }

  try {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const [rows]: any = await pool.query(
      'SELECT id, username, display_name FROM users WHERE username = ? AND password_hash = ?',
      [username, hash]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { username: user.username, displayName: user.display_name }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 验证token
router.get('/verify', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ success: false });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch {
    res.status(401).json({ success: false, error: 'token无效或已过期' });
  }
});

router.post('/change-password', async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ success: false, error: '未登录' });
  const token = auth.split(' ')[1];

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { oldPassword, newPassword } = req.body;
    const oldHash = crypto.createHash('sha256').update(oldPassword).digest('hex');
    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');

    const [rows]: any = await pool.query(
      'SELECT id FROM users WHERE id = ? AND password_hash = ?',
      [decoded.id, oldHash]
    );
    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: '当前密码错误' });
    }

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, decoded.id]);
    res.json({ success: true });
  } catch {
    res.status(401).json({ success: false, error: 'token无效' });
  }
});

export default router;