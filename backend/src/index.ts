import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 节点列表
const NODES_META = [
  { id: 'A1',  name: '天府大道-锦城大道路口' },
  { id: 'B2',  name: '益州大道-锦城大道路口' },
  { id: 'C3',  name: '天府大道-府城大道路口' },
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
    const [rows] = await pool.query(`
      SELECT t.node_id, t.speed, t.congestion_status, t.collected_at
      FROM traffic_flow t
      INNER JOIN (
        SELECT node_id, MAX(collected_at) as max_time
        FROM traffic_flow
        GROUP BY node_id
      ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time
      ORDER BY t.node_id
    `);
    res.json({ success: true, data: rows });
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});