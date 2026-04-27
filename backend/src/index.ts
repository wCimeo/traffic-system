import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db';
import axios from 'axios';
import authRouter from './auth';
import cron from 'node-cron';
import redis from './redis';


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);


// 节点列表
const NODES_META = [
  { id: 'A1',  name: '天府大道-锦城大道路口' },
  { id: 'B2',  name: '益州大道-锦城大道路口' },
  { id: 'C3',  name: '成华大道-杉板桥路口' },
  { id: 'D4',  name: '天府大道-华阳立交路口' },
  { id: 'E5',  name: '剑南大道-锦城大道路口' },
  { id: 'F6',  name: '益州大道-府城大道路口' },
  { id: 'G7',  name: '天府三街-天府大道路口' },
  { id: 'H8',  name: '科华南路-锦尚西二路路口' },
  { id: 'I9',  name: '中环路-科华南路路口' },
  { id: 'J10', name: '东站西广场-邛崃山路路口' },
];

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 获取最新一轮各路口路况
app.get('/api/traffic/latest', async (req, res) => {
  try {
    // 先查Redis缓存
    const cached = await redis.get('traffic:latest').catch(() => null);
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached), source: 'cache' });
    }

    // 缓存未命中，查MySQL
    const [rows] = await pool.query(`
      SELECT t.node_id, t.speed, t.congestion_status, t.collected_at
      FROM traffic_flow t
      INNER JOIN (
        SELECT node_id, MAX(collected_at) as max_time
        FROM traffic_flow GROUP BY node_id
      ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time
      ORDER BY t.node_id
    `);

    // 写入Redis，缓存70秒（略长于采集间隔60秒）
    await redis.setex('traffic:latest', 70, JSON.stringify(rows)).catch(() => null);

    res.json({ success: true, data: rows, source: 'db' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 历史流量查询（某节点最近N条记录）
app.get('/api/traffic/history', async (req, res) => {
  const { node_id, limit = 24 } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT node_id, speed, congestion_status, collected_at
       FROM traffic_flow
       WHERE node_id = ?
       ORDER BY collected_at DESC
       LIMIT ?`,
      [node_id, Number(limit)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 触发预测：取最近12条数据喂给Flask，结果写回predictions表
app.post('/api/predict/trigger', async (req, res) => {
  try {
    // 1. 从MySQL取每个节点最近12条速度数据
    const NODE_IDS = ['A1','B2','C3','D4','E5','F6','G7','H8','I9','J10'];
    const [rows]: any = await pool.query(
      `SELECT node_id, speed, collected_at
       FROM traffic_flow
       WHERE collected_at >= (
         SELECT MAX(collected_at) - INTERVAL 12 MINUTE FROM traffic_flow
       )
       ORDER BY collected_at ASC`
    );

    // 2. 按时间步组织成window格式
    const timeMap: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const t = row.collected_at.toISOString();
      if (!timeMap[t]) timeMap[t] = {};
      timeMap[t][row.node_id] = row.speed;
    }

    let window = Object.values(timeMap).slice(-12);

    // 数据不足时用最新一条填充
    if (window.length < 12) {
      const [latest]: any = await pool.query(
        `SELECT node_id, speed FROM traffic_flow
         WHERE collected_at = (SELECT MAX(collected_at) FROM traffic_flow)`
      );
      const fallback: Record<string, number> = {};
      for (const r of latest) fallback[r.node_id] = r.speed;
      while (window.length < 12) window.unshift(fallback);
    }

    // 3. 调用Flask推理
    const flaskResp = await axios.post('http://localhost:5001/predict', { window });
    const flaskData: any = flaskResp.data;

    if (!flaskData.success) {
      return res.status(500).json({ success: false, error: flaskData.error });
    }

    // 4. 把预测结果写入predictions表
    const predictions = flaskData.predictions;
    const now = new Date();
    const insertValues = NODE_IDS.map(nid => [nid, predictions[nid], now]);
    await pool.query(
      `INSERT INTO predictions (node_id, predicted_speed, predicted_at)
       VALUES ?`,
      [insertValues]
    );

    res.json({ success: true, predictions });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 获取最新预测结果
app.get('/api/predict/latest', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.node_id, p.predicted_speed, p.predicted_at
       FROM predictions p
       INNER JOIN (
         SELECT node_id, MAX(predicted_at) as max_time
         FROM predictions GROUP BY node_id
       ) latest ON p.node_id = latest.node_id AND p.predicted_at = latest.max_time
       ORDER BY p.node_id`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.get('/api/nodes', (req, res) => {
  res.json({ success: true, data: NODES_META });
});

// 事件管理
app.get('/api/incidents', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post('/api/incidents', async (req, res) => {
  const { node_id, type, description, severity } = req.body;
  try {
    const [result]: any = await pool.query(
      `INSERT INTO incidents (node_id, type, description, severity, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [node_id, type, description, severity]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.put('/api/incidents/:id', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query(
      `UPDATE incidents SET status = ? WHERE id = ?`,
      [status, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 路线推荐（基于当前各路口速度，返回拥堵最低路径）
app.get('/api/route/recommend', async (req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT t.node_id, t.speed, t.congestion_status
       FROM traffic_flow t
       INNER JOIN (
         SELECT node_id, MAX(collected_at) as max_time
         FROM traffic_flow GROUP BY node_id
       ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time`
    );
    const sorted = rows.sort((a: any, b: any) => b.speed - a.speed);
    res.json({ success: true, data: sorted });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// CSV报表导出
app.get('/api/report/export', async (req, res) => {
  const { start, end, node_id } = req.query;
  try {
    let sql = `SELECT node_id, speed, congestion_status, collected_at
               FROM traffic_flow WHERE 1=1`;
    const params: any[] = [];

    if (start) { sql += ' AND collected_at >= ?'; params.push(start); }
    if (end)   { sql += ' AND collected_at <= ?'; params.push(end); }
    if (node_id && node_id !== 'all') {
      sql += ' AND node_id = ?'; params.push(node_id);
    }
    sql += ' ORDER BY collected_at DESC LIMIT 5000';

    const [rows]: any = await pool.query(sql, params);

    const STATUS: Record<number, string> = {
      0: '未知', 1: '畅通', 2: '缓行', 3: '拥堵', 4: '严重拥堵'
    };

    const header = '路口编号,平均车速(km/h),拥堵状态,采集时间\n';
    const body = rows.map((r: any) =>
      `${r.node_id},${r.speed},${STATUS[r.congestion_status] || '未知'},${
        new Date(r.collected_at).toLocaleString('zh')
      }`
    ).join('\n');

    const csv = '\uFEFF' + header + body;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=traffic_report_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 预测报表导出（含15分钟和30分钟预测）
app.get('/api/report/predict-export', async (req, res) => {
  const { node_id } = req.query;
  try {
    const NODE_IDS = ['A1','B2','C3','D4','E5','F6','G7','H8','I9','J10'];

    // 1. 取最近12条作为输入窗口
    const [rows]: any = await pool.query(
      `SELECT node_id, speed, collected_at
       FROM traffic_flow
       WHERE collected_at >= (
         SELECT MAX(collected_at) - INTERVAL 15 MINUTE FROM traffic_flow
       )
       ORDER BY collected_at ASC`
    );

    const timeMap: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const t = new Date(row.collected_at).toISOString();
      if (!timeMap[t]) timeMap[t] = {};
      timeMap[t][row.node_id] = row.speed;
    }

    let window = Object.values(timeMap).slice(-12);
    if (window.length < 12) {
      const [latest]: any = await pool.query(
        `SELECT node_id, speed FROM traffic_flow
         WHERE collected_at = (SELECT MAX(collected_at) FROM traffic_flow)`
      );
      const fallback: Record<string, number> = {};
      for (const r of latest) fallback[r.node_id] = r.speed;
      while (window.length < 12) window.unshift({ ...fallback });
    }

    // 2. 调用多步预测（2步=15分钟+30分钟）
    const flaskResp = await axios.post('http://localhost:5001/predict/multistep', {
      window, steps: 2
    });
    const flaskData: any = flaskResp.data;
    if (!flaskData.success) throw new Error(flaskData.error);

    const pred15 = flaskData.predictions[0];  // 15分钟后
    const pred30 = flaskData.predictions[1];  // 30分钟后

    // 3. 取最新采集数据
    const [current]: any = await pool.query(
      `SELECT t.node_id, t.speed, t.congestion_status, t.collected_at
       FROM traffic_flow t
       INNER JOIN (
         SELECT node_id, MAX(collected_at) as max_time
         FROM traffic_flow GROUP BY node_id
       ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time
       ORDER BY t.node_id`
    );

    const STATUS: Record<number, string> = {
      0: '未知', 1: '畅通', 2: '缓行', 3: '拥堵', 4: '严重拥堵'
    };

    const getStatus = (speed: number) => {
      if (speed >= 40) return '畅通';
      if (speed >= 25) return '缓行';
      return '拥堵';
    };

    const now = new Date();
    const t15 = new Date(now.getTime() + 15 * 60000).toLocaleString('zh');
    const t30 = new Date(now.getTime() + 30 * 60000).toLocaleString('zh');

    // 4. 过滤节点
    const targetNodes = (node_id && node_id !== 'all')
      ? [node_id as string]
      : NODE_IDS;

    const currentMap: Record<string, any> = {};
    for (const r of current) currentMap[r.node_id] = r;

    // 5. 生成CSV
    const header = [
      '路口编号',
      '当前车速(km/h)', '当前状态', '采集时间',
      `预测车速_15min(km/h)`, `预测状态_15min`,
      `预测车速_30min(km/h)`, `预测状态_30min`,
    ].join(',') + '\n';

    const body = targetNodes.map(nid => {
      const cur = currentMap[nid];
      const curSpeed  = cur ? cur.speed : '--';
      const curStatus = cur ? STATUS[cur.congestion_status] : '--';
      const curTime   = cur ? new Date(cur.collected_at).toLocaleString('zh') : '--';
      const p15Speed  = pred15[nid] ?? '--';
      const p30Speed  = pred30[nid] ?? '--';
      return [
        nid,
        curSpeed, curStatus, curTime,
        p15Speed, typeof p15Speed === 'number' ? getStatus(p15Speed) : '--',
        p30Speed, typeof p30Speed === 'number' ? getStatus(p30Speed) : '--',
      ].join(',');
    }).join('\n');

    const csv = '\uFEFF' + header + body;
    const filename = `traffic_predict_${now.toISOString().slice(0,16).replace('T','_')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);

  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

const PORT = process.env.PORT || 3001;


// 每5分钟自动触发一次预测
cron.schedule('*/5 * * * *', async () => {
  console.log(`[${new Date().toLocaleString('zh')}] 定时预测触发...`);
  try {
    const NODE_IDS = ['A1','B2','C3','D4','E5','F6','G7','H8','I9','J10'];

    const [rows]: any = await pool.query(
      `SELECT node_id, speed, collected_at
       FROM traffic_flow
       WHERE collected_at >= (
         SELECT MAX(collected_at) - INTERVAL 15 MINUTE FROM traffic_flow
       )
       ORDER BY collected_at ASC`
    );

    const timeMap: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const t = new Date(row.collected_at).toISOString();
      if (!timeMap[t]) timeMap[t] = {};
      timeMap[t][row.node_id] = row.speed;
    }

    let window = Object.values(timeMap).slice(-12);

    if (window.length < 12) {
      const [latest]: any = await pool.query(
        `SELECT node_id, speed FROM traffic_flow
         WHERE collected_at = (SELECT MAX(collected_at) FROM traffic_flow)`
      );
      const fallback: Record<string, number> = {};
      for (const r of latest) fallback[r.node_id] = r.speed;
      while (window.length < 12) window.unshift({ ...fallback });
    }

    const flaskResp = await axios.post('http://localhost:5001/predict', { window });
    const flaskData: any = flaskResp.data;

    if (!flaskData.success) {
      console.error('定时预测Flask返回错误:', flaskData.error);
      return;
    }

    const predictions = flaskData.predictions;
    const now = new Date();
    const insertValues = NODE_IDS.map(nid => [nid, predictions[nid] ?? 0, now]);
    await pool.query(
      `INSERT INTO predictions (node_id, predicted_speed, predicted_at) VALUES ?`,
      [insertValues]
    );
    console.log(`定时预测完成:`, predictions);
  } catch (err) {
    console.error('定时预测失败:', err);
  }
}, { timezone: 'Asia/Shanghai' });


app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});