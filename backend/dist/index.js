"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./db"));
const axios_1 = __importDefault(require("axios"));
const auth_1 = __importStar(require("./auth"));
const node_cron_1 = __importDefault(require("node-cron"));
const redis_1 = __importDefault(require("./redis"));
const trafficSource_1 = require("./trafficSource");
const trafficWindow_1 = require("./trafficWindow");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.set('trust proxy', true);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '5mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '5mb' }));
app.use('/api/auth', auth_1.default);
function isValidRoleId(value) {
    if (!value)
        return false;
    return /^(S|G)\d{4,}$/.test(String(value).trim());
}
async function getUsersRoleIdSet() {
    const [rows] = await db_1.default.query(`SELECT role_id FROM users WHERE role_id IS NOT NULL AND role_id <> ''`);
    return new Set((rows || []).map((row) => String(row.role_id)));
}
async function ensureIncidentsTableMigration() {
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      node_id VARCHAR(16) NOT NULL,
      type VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      severity TINYINT NOT NULL DEFAULT 1,
      status VARCHAR(24) NOT NULL DEFAULT 'reported',
      reporter_id VARCHAR(64) NULL,
      handler_id VARCHAR(64) NULL,
      handled_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    const [columns] = await db_1.default.query(`SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'incidents'`);
    const columnSet = new Set((columns || []).map((row) => row.name));
    const addColumnIfMissing = async (name, definition) => {
        if (!columnSet.has(name)) {
            await db_1.default.query(`ALTER TABLE incidents ADD COLUMN ${name} ${definition}`);
            columnSet.add(name);
        }
    };
    await addColumnIfMissing('status', `VARCHAR(24) NOT NULL DEFAULT 'reported'`);
    await addColumnIfMissing('reporter_id', 'VARCHAR(64) NULL');
    await addColumnIfMissing('handler_id', 'VARCHAR(64) NULL');
    await addColumnIfMissing('handled_at', 'DATETIME NULL');
    await addColumnIfMissing('updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
}
// 鑺傜偣鍒楄〃
const NODES_META = [
    { id: 'A1', name: 'Node A1' },
    { id: 'B2', name: 'Node B2' },
    { id: 'C3', name: 'Node C3' },
    { id: 'D4', name: 'Node D4' },
    { id: 'E5', name: 'Node E5' },
    { id: 'F6', name: 'Node F6' },
    { id: 'G7', name: 'Node G7' },
    { id: 'H8', name: 'Node H8' },
    { id: 'I9', name: 'Node I9' },
    { id: 'J10', name: 'Node J10' },
];
// 鍋ュ悍妫€鏌?
NODES_META.push({ id: 'K11', name: 'Node K11' });
const NODE_IDS = NODES_META.map((node) => node.id);
const TRAFFIC_TABLE = (0, trafficSource_1.getTrafficReadTableSql)();
const TRAFFIC_SOURCE = (0, trafficSource_1.getTrafficSourceConfig)();
async function ensureTrafficMockTableMigration() {
    await db_1.default.query(`
    CREATE TABLE IF NOT EXISTS \`${TRAFFIC_SOURCE.mockTable}\` (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      node_id VARCHAR(10) NOT NULL,
      collected_at DATETIME NOT NULL,
      speed FLOAT NOT NULL,
      congestion_status TINYINT NOT NULL,
      road_count TINYINT NOT NULL,
      INDEX idx_node_time (node_id, collected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        traffic_source: TRAFFIC_SOURCE.readSource,
        traffic_table: TRAFFIC_SOURCE.readTable,
        model_bucket_minutes: (0, trafficWindow_1.getModelBucketMinutes)(),
        model_window_size: (0, trafficWindow_1.getModelWindowSize)(),
    });
});
// 鑾峰彇鏈€鏂颁竴杞悇璺彛璺喌
app.get('/api/traffic/latest', async (req, res) => {
    try {
        // 鍏堟煡Redis缂撳瓨
        const cacheKey = (0, trafficSource_1.getTrafficLatestCacheKey)();
        const cached = await redis_1.default.get(cacheKey).catch(() => null);
        if (cached) {
            return res.json({ success: true, data: JSON.parse(cached), source: 'cache', table: TRAFFIC_SOURCE.readTable });
        }
        // 缂撳瓨鏈懡涓紝鏌ySQL
        const [rows] = await db_1.default.query(`
      SELECT t.node_id, t.speed, t.congestion_status, t.collected_at
      FROM ${TRAFFIC_TABLE} t
      INNER JOIN (
        SELECT node_id, MAX(collected_at) as max_time
        FROM ${TRAFFIC_TABLE} GROUP BY node_id
      ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time
      ORDER BY t.node_id
    `);
        // 鍐欏叆Redis锛岀紦瀛?0绉掞紙鐣ラ暱浜庨噰闆嗛棿闅?0绉掞級
        await redis_1.default.setex(cacheKey, 70, JSON.stringify(rows)).catch(() => null);
        res.json({ success: true, data: rows, source: 'db', table: TRAFFIC_SOURCE.readTable });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
// 鍘嗗彶娴侀噺鏌ヨ锛堟煇鑺傜偣鏈€杩慛鏉¤褰曪級
app.get('/api/traffic/history', async (req, res) => {
    const { node_id, limit = 24 } = req.query;
    try {
        const [rows] = await db_1.default.query(`SELECT node_id, speed, congestion_status, collected_at
       FROM ${TRAFFIC_TABLE}
       WHERE node_id = ?
       ORDER BY collected_at DESC
       LIMIT ?`, [node_id, Number(limit)]);
        res.json({ success: true, data: rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
// 瑙﹀彂棰勬祴锛氬彇鏈€杩?2鏉℃暟鎹杺缁橣lask锛岀粨鏋滃啓鍥瀙redictions琛?
app.post('/api/predict/trigger', async (req, res) => {
    try {
        const window = await (0, trafficWindow_1.buildModelWindow)(NODE_IDS);
        const flaskResp = await axios_1.default.post('http://localhost:5001/predict', { window });
        const flaskData = flaskResp.data;
        if (!flaskData.success) {
            return res.status(500).json({ success: false, error: flaskData.error });
        }
        // 4. 鎶婇娴嬬粨鏋滃啓鍏redictions琛?
        const predictions = flaskData.predictions;
        const now = new Date();
        const insertValues = NODE_IDS.map(nid => [nid, predictions[nid], now]);
        await db_1.default.query(`INSERT INTO predictions (node_id, predicted_speed, predicted_at)
       VALUES ?`, [insertValues]);
        res.json({
            success: true,
            predictions,
            source_table: TRAFFIC_SOURCE.readTable,
            bucket_minutes: (0, trafficWindow_1.getModelBucketMinutes)(),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
// 鑾峰彇鏈€鏂伴娴嬬粨鏋?
app.get('/api/predict/latest', async (req, res) => {
    try {
        const [rows] = await db_1.default.query(`SELECT p.node_id, p.predicted_speed, p.predicted_at
       FROM predictions p
       INNER JOIN (
         SELECT node_id, MAX(predicted_at) as max_time
         FROM predictions GROUP BY node_id
       ) latest ON p.node_id = latest.node_id AND p.predicted_at = latest.max_time
       ORDER BY p.node_id`);
        res.json({ success: true, data: rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.get('/api/nodes', (req, res) => {
    res.json({ success: true, data: NODES_META });
});
// 浜嬩欢绠＄悊
app.get('/api/incidents', async (req, res) => {
    try {
        const [rows] = await db_1.default.query(`SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50`);
        res.json({ success: true, data: rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.post('/api/incidents', auth_1.requireAuth, async (req, res) => {
    const { node_id, type, description, severity, reporter_id, handler_id } = req.body;
    try {
        const reporterId = String(reporter_id || req.user?.role_id || '').trim();
        const handlerId = String(handler_id || '').trim();
        if (!isValidRoleId(reporterId)) {
            return res.status(400).json({ success: false, error: 'Invalid reporter_id format, expected S0001 or G0001' });
        }
        if (handlerId && !isValidRoleId(handlerId)) {
            return res.status(400).json({ success: false, error: 'Invalid handler_id format, expected S0001 or G0001' });
        }
        const userRoleIdSet = await getUsersRoleIdSet();
        if (!userRoleIdSet.has(reporterId)) {
            return res.status(400).json({ success: false, error: 'reporter_id does not exist in users table' });
        }
        if (handlerId && !userRoleIdSet.has(handlerId)) {
            return res.status(400).json({ success: false, error: 'handler_id does not exist in users table' });
        }
        const normalizedStatus = handlerId ? 'active' : 'reported';
        const [result] = await db_1.default.query(`INSERT INTO incidents (node_id, type, description, severity, status, reporter_id, handler_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NOW())`, [node_id, type, description, severity, normalizedStatus, reporterId, handlerId]);
        res.json({ success: true, id: result.insertId });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.put('/api/incidents/:id', auth_1.requireAuth, async (req, res) => {
    const { status, handler_id } = req.body;
    const validStatus = new Set(['reported', 'active', 'resolved', 'ignored']);
    const nextStatus = validStatus.has(status) ? status : 'active';
    try {
        const handlerId = String(handler_id || req.user?.role_id || '').trim();
        if (handlerId && !isValidRoleId(handlerId)) {
            return res.status(400).json({ success: false, error: 'Invalid handler_id format, expected S0001 or G0001' });
        }
        if (handlerId) {
            const userRoleIdSet = await getUsersRoleIdSet();
            if (!userRoleIdSet.has(handlerId)) {
                return res.status(400).json({ success: false, error: 'handler_id does not exist in users table' });
            }
        }
        await db_1.default.query(`UPDATE incidents
       SET status = ?,
           handler_id = COALESCE(NULLIF(?, ''), handler_id),
           handled_at = CASE WHEN ? IN ('resolved', 'ignored') THEN NOW() ELSE handled_at END
       WHERE id = ?`, [nextStatus, handlerId, nextStatus, req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.delete('/api/incidents/:id', async (req, res) => {
    try {
        await db_1.default.query('DELETE FROM incidents WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.post('/api/incidents/mock-seed', async (req, res) => {
    const count = Math.max(1, Math.min(30, Number(req.body?.count) || 8));
    const types = ['accident', 'road_work', 'heavy_congestion', 'signal_failure', 'breakdown'];
    const statuses = ['reported', 'active', 'resolved', 'ignored'];
    try {
        const [users] = await db_1.default.query(`SELECT role_id FROM users WHERE role_id IS NOT NULL AND role_id <> '' ORDER BY role_id ASC`);
        const roleIds = (users || []).map((u) => String(u.role_id));
        if (roleIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No usable role_id found in users table' });
        }
        const values = [];
        for (let i = 0; i < count; i += 1) {
            const node = NODES_META[Math.floor(Math.random() * NODES_META.length)];
            const type = types[Math.floor(Math.random() * types.length)];
            const severity = 1 + Math.floor(Math.random() * 3);
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const reporter = roleIds[Math.floor(Math.random() * roleIds.length)];
            const handler = Math.random() < 0.25 ? '' : roleIds[Math.floor(Math.random() * roleIds.length)];
            const minutesAgo = Math.floor(Math.random() * 360);
            values.push([
                node.id,
                type,
                `${type} 妯℃嫙浜嬩欢 #${Date.now().toString().slice(-5)}-${i + 1}`,
                severity,
                status,
                reporter,
                handler || null,
                status === 'resolved' || status === 'ignored' ? new Date() : null,
                new Date(Date.now() - minutesAgo * 60 * 1000),
            ]);
        }
        await db_1.default.query(`INSERT INTO incidents
      (node_id, type, description, severity, status, reporter_id, handler_id, handled_at, created_at)
       VALUES ?`, [values]);
        res.json({ success: true, inserted: values.length });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
// 璺嚎鎺ㄨ崘锛堝熀浜庡綋鍓嶅悇璺彛閫熷害锛岃繑鍥炴嫢鍫垫渶浣庤矾寰勶級
app.get('/api/route/recommend', async (req, res) => {
    try {
        const [rows] = await db_1.default.query(`SELECT t.node_id, t.speed, t.congestion_status
       FROM ${TRAFFIC_TABLE} t
       INNER JOIN (
         SELECT node_id, MAX(collected_at) as max_time
         FROM ${TRAFFIC_TABLE} GROUP BY node_id
       ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time`);
        const sorted = rows.sort((a, b) => b.speed - a.speed);
        res.json({ success: true, data: sorted });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.get('/api/route/decision', async (req, res) => {
    const nodeId = String(req.query.node_id || '').trim();
    const horizon = Number(req.query.horizon || 15);
    const allowedHorizons = new Set([15, 30, 45, 60]);
    const safeHorizon = allowedHorizons.has(horizon) ? horizon : 15;
    if (!nodeId) {
        return res.status(400).json({ success: false, error: 'node_id is required' });
    }
    try {
        if (!NODE_IDS.includes(nodeId)) {
            return res.status(400).json({ success: false, error: 'invalid node_id' });
        }
        const window = await (0, trafficWindow_1.buildModelWindow)(NODE_IDS);
        const steps = safeHorizon / 15;
        const flaskResp = await axios_1.default.post('http://localhost:5001/predict/multistep', { window, steps: 4 });
        const flaskData = flaskResp.data;
        if (!flaskData.success)
            throw new Error(flaskData.error || 'predict failed');
        const targetStepPred = flaskData.predictions[steps - 1] || {};
        const predictedSpeed = Number(targetStepPred[nodeId] ?? 0);
        let recommendation = '寤鸿璋ㄦ厧閫氳';
        let level = 'normal';
        if (predictedSpeed >= 40) {
            recommendation = '寤鸿閫氳';
            level = 'good';
        }
        else if (predictedSpeed < 25) {
            recommendation = '寤鸿缁曡';
            level = 'bad';
        }
        return res.json({
            success: true,
            data: {
                node_id: nodeId,
                horizon: safeHorizon,
                predicted_speed: predictedSpeed,
                recommendation,
                level,
                source_table: TRAFFIC_SOURCE.readTable,
                generated_at: new Date().toISOString(),
            },
        });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: String(err) });
    }
});
// CSV鎶ヨ〃瀵煎嚭
app.get('/api/report/export', async (req, res) => {
    const { start, end, node_id } = req.query;
    try {
        let sql = `SELECT node_id, speed, congestion_status, collected_at
               FROM ${TRAFFIC_TABLE} WHERE 1=1`;
        const params = [];
        if (start) {
            sql += ' AND collected_at >= ?';
            params.push(start);
        }
        if (end) {
            sql += ' AND collected_at <= ?';
            params.push(end);
        }
        if (node_id && node_id !== 'all') {
            sql += ' AND node_id = ?';
            params.push(node_id);
        }
        sql += ' ORDER BY collected_at DESC LIMIT 5000';
        const [rows] = await db_1.default.query(sql, params);
        const STATUS = {
            0: 'unknown', 1: 'smooth', 2: 'slow', 3: 'congested', 4: 'severe'
        };
        const header = 'node_id,speed_kmh,congestion_status,collected_at\n';
        const body = rows.map((r) => `${r.node_id},${r.speed},${STATUS[r.congestion_status] || 'unknown'},${new Date(r.collected_at).toLocaleString('zh')}`).join('\n');
        const csv = '\uFEFF' + header + body;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=traffic_report_${Date.now()}.csv`);
        res.send(csv);
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
// 棰勬祴鎶ヨ〃瀵煎嚭锛堝惈15鍒嗛挓鍜?0鍒嗛挓棰勬祴锛?
app.get('/api/report/predict-export', async (req, res) => {
    const { node_id } = req.query;
    try {
        const window = await (0, trafficWindow_1.buildModelWindow)(NODE_IDS);
        const flaskResp = await axios_1.default.post('http://localhost:5001/predict/multistep', {
            window, steps: 2
        });
        const flaskData = flaskResp.data;
        if (!flaskData.success)
            throw new Error(flaskData.error);
        const pred15 = flaskData.predictions[0]; // 15鍒嗛挓鍚?
        const pred30 = flaskData.predictions[1]; // 30鍒嗛挓鍚?
        // 3. 鍙栨渶鏂伴噰闆嗘暟鎹?
        const [current] = await db_1.default.query(`SELECT t.node_id, t.speed, t.congestion_status, t.collected_at
       FROM ${TRAFFIC_TABLE} t
       INNER JOIN (
         SELECT node_id, MAX(collected_at) as max_time
         FROM ${TRAFFIC_TABLE} GROUP BY node_id
       ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time
       ORDER BY t.node_id`);
        const STATUS = {
            0: 'unknown', 1: 'smooth', 2: 'slow', 3: 'congested', 4: 'severe'
        };
        const getStatus = (speed) => {
            if (speed >= 40)
                return 'smooth';
            if (speed >= 25)
                return 'slow';
            return 'congested';
        };
        const now = new Date();
        const t15 = new Date(now.getTime() + 15 * 60000).toLocaleString('zh');
        const t30 = new Date(now.getTime() + 30 * 60000).toLocaleString('zh');
        // 4. 杩囨护鑺傜偣
        const targetNodes = (node_id && node_id !== 'all')
            ? [node_id]
            : NODE_IDS;
        const currentMap = {};
        for (const r of current)
            currentMap[r.node_id] = r;
        // 5. 鐢熸垚CSV
        const header = [
            'node_id',
            'current_speed_kmh', 'current_status', 'collected_at',
            'predicted_speed_15min_kmh', 'predicted_status_15min',
            'predicted_speed_30min_kmh', 'predicted_status_30min',
        ].join(',') + '\n';
        const body = targetNodes.map(nid => {
            const cur = currentMap[nid];
            const curSpeed = cur ? cur.speed : '--';
            const curStatus = cur ? STATUS[cur.congestion_status] : '--';
            const curTime = cur ? new Date(cur.collected_at).toLocaleString('zh') : '--';
            const p15Speed = pred15[nid] ?? '--';
            const p30Speed = pred30[nid] ?? '--';
            return [
                nid,
                curSpeed, curStatus, curTime,
                p15Speed, typeof p15Speed === 'number' ? getStatus(p15Speed) : '--',
                p30Speed, typeof p30Speed === 'number' ? getStatus(p30Speed) : '--',
            ].join(',');
        }).join('\n');
        const csv = '\uFEFF' + header + body;
        const filename = `traffic_predict_${now.toISOString().slice(0, 16).replace('T', '_')}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(csv);
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
const PORT = process.env.PORT || 3001;
// 姣?鍒嗛挓鑷姩瑙﹀彂涓€娆￠娴?
node_cron_1.default.schedule('*/5 * * * *', async () => {
    console.log(`[${new Date().toLocaleString('zh')}] 瀹氭椂棰勬祴瑙﹀彂...`);
    try {
        const window = await (0, trafficWindow_1.buildModelWindow)(NODE_IDS);
        const flaskResp = await axios_1.default.post('http://localhost:5001/predict', { window });
        const flaskData = flaskResp.data;
        if (!flaskData.success) {
            console.error('瀹氭椂棰勬祴Flask杩斿洖閿欒:', flaskData.error);
            return;
        }
        const predictions = flaskData.predictions;
        const now = new Date();
        const insertValues = NODE_IDS.map(nid => [nid, predictions[nid] ?? 0, now]);
        await db_1.default.query(`INSERT INTO predictions (node_id, predicted_speed, predicted_at) VALUES ?`, [insertValues]);
        console.log(`瀹氭椂棰勬祴瀹屾垚:`, predictions);
    }
    catch (err) {
        console.error('瀹氭椂棰勬祴澶辫触:', err);
    }
}, { timezone: 'Asia/Shanghai' });
(0, auth_1.ensureUserTableMigration)()
    .then(async () => {
    await ensureTrafficMockTableMigration();
    await ensureIncidentsTableMigration();
    app.listen(PORT, () => {
        console.log(`鍚庣鏈嶅姟杩愯鍦?http://localhost:${PORT}`);
    });
})
    .catch((err) => {
    console.error('鐢ㄦ埛琛ㄨ縼绉诲け璐ワ紝鍚庣鍚姩涓:', err);
    process.exit(1);
});
