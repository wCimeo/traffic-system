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
require("./env");
const cors_1 = __importDefault(require("cors"));
const db_1 = __importDefault(require("./db"));
const axios_1 = __importDefault(require("axios"));
const auth_1 = __importStar(require("./auth"));
const node_cron_1 = __importDefault(require("node-cron"));
const redis_1 = __importDefault(require("./redis"));
const trafficSource_1 = require("./trafficSource");
const trafficWindow_1 = require("./trafficWindow");
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
function normalizeRoleId(value) {
    return String(value || '').trim();
}
async function getUsersRoleIdSet() {
    const roleIds = await getUsableUserRoleIds();
    return new Set(roleIds);
}
async function getUsableUserRoleIds() {
    const [rows] = await db_1.default.query(`SELECT role_id FROM users WHERE role_id IS NOT NULL AND role_id <> ''`);
    const roleIds = (rows || [])
        .map((row) => normalizeRoleId(row.role_id))
        .filter((roleId) => isValidRoleId(roleId));
    return Array.from(new Set(roleIds)).sort();
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
    await normalizeExistingIncidentsData();
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
const INCIDENT_TYPE_LABELS = {
    accident: '交通事故',
    road_work: '道路施工',
    heavy_congestion: '异常拥堵',
    signal_failure: '信号灯故障',
    breakdown: '车辆故障',
};
const MOCK_INCIDENT_TYPES = [
    { value: '交通事故', detail: '车辆碰撞导致通行能力下降' },
    { value: '道路施工', detail: '临时占道施工影响车流' },
    { value: '异常拥堵', detail: '短时车流积压明显' },
    { value: '信号灯故障', detail: '路口信号灯工作异常' },
    { value: '车辆故障', detail: '故障车辆停靠影响通行' },
];
const INCIDENT_NODE_NAMES = {
    A1: '天府大道-锦城大道路口',
    B2: '益州大道-锦城大道路口',
    C3: '成华大道-杉板桥路口',
    D4: '天府大道-华阳立交路口',
    E5: '剑南大道-锦城大道路口',
    F6: '益州大道-府城大道路口',
    G7: '天府三街-天府大道路口',
    H8: '科华南路-锦尚西二路口',
    I9: '中环路火车南站-科华南路口',
    J10: '东站西广场-邛崃山路路口',
    K11: '人民南路四段',
};
const INCIDENT_DIRECTIONS = ['东向西方向', '西向东方向', '南向北方向', '北向南方向', '进城方向', '出城方向'];
const TRAFFIC_TABLE = (0, trafficSource_1.getTrafficReadTableSql)();
const TRAFFIC_SOURCE = (0, trafficSource_1.getTrafficSourceConfig)();
const DEFAULT_HORIZONS = [15, 30, 45, 60];
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';
function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}
function buildIncidentDescription(node, type, severity) {
    const nodeName = INCIDENT_NODE_NAMES[node.id] || node.name || `${node.id}路口`;
    const direction = pickRandom(INCIDENT_DIRECTIONS);
    const severityText = severity >= 3
        ? '现场排队长度持续增加，建议立即安排分流处置'
        : severity === 2
            ? '通行效率下降，建议巡查人员到场确认'
            : '对通行有一定影响，需持续关注';
    const templates = {
        交通事故: [
            `${nodeName}${direction}发生两车轻微碰撞，占用一条机动车道，${severityText}。`,
            `${nodeName}${direction}有车辆追尾停留，后方车辆变道缓慢，${severityText}。`,
        ],
        道路施工: [
            `${nodeName}${direction}外侧车道临时围挡作业，可用车道减少，${severityText}。`,
            `${nodeName}${direction}路面养护施工占用部分进口道，车辆通过速度下降，${severityText}。`,
        ],
        异常拥堵: [
            `${nodeName}${direction}短时车流集中，排队已接近上游路段，${severityText}。`,
            `${nodeName}${direction}车辆等待时间明显增加，路口放行后消散较慢，${severityText}。`,
        ],
        信号灯故障: [
            `${nodeName}信号灯相位切换异常，${direction}车辆通行秩序受影响，${severityText}。`,
            `${nodeName}部分信号灯显示不稳定，现场车辆依次缓慢通过，${severityText}。`,
        ],
        车辆故障: [
            `${nodeName}${direction}有车辆抛锚停靠，占用右侧车道，${severityText}。`,
            `${nodeName}${direction}故障车辆等待拖移，后方车辆需绕行，${severityText}。`,
        ],
    };
    return pickRandom(templates[type.value] || [`${nodeName}发生${type.value}，${type.detail}，${severityText}。`]);
}
function normalizeIncidentText(value) {
    return String(value || '')
        .replace(/妯℃嫙浜嬩欢/g, '模拟事件')
        .replace(/妯℃嫙/g, '模拟')
        .replace(/浜嬩欢/g, '事件')
        .replace(/。?模拟事件\s*#[\w-]+/g, '');
}
function normalizeIncidentRow(row) {
    const rawType = String(row.type || '');
    const type = INCIDENT_TYPE_LABELS[rawType] || rawType;
    let description = normalizeIncidentText(row.description);
    for (const [legacyType, label] of Object.entries(INCIDENT_TYPE_LABELS)) {
        description = description.replace(new RegExp(`\\b${legacyType}\\b`, 'g'), label);
    }
    return { ...row, type, description };
}
async function normalizeExistingIncidentsData() {
    const textReplacements = [
        ['妯℃嫙浜嬩欢', '模拟事件'],
        ['妯℃嫙', '模拟'],
        ['浜嬩欢', '事件'],
    ];
    for (const [badText, goodText] of textReplacements) {
        await db_1.default.query('UPDATE incidents SET description = REPLACE(description, ?, ?) WHERE description LIKE ?', [badText, goodText, `%${badText}%`]);
    }
    await db_1.default.query(`UPDATE incidents
     SET description = TRIM(REGEXP_REPLACE(description, '。?模拟事件 #[[:alnum:]-]+', ''))
     WHERE description LIKE '%模拟事件 #%'
        OR description LIKE '%妯℃嫙浜嬩欢 #%'`);
    for (const [legacyType, label] of Object.entries(INCIDENT_TYPE_LABELS)) {
        await db_1.default.query(`UPDATE incidents
       SET type = ?,
           description = REPLACE(description, ?, ?)
       WHERE type = ? OR description LIKE ?`, [label, legacyType, label, legacyType, `%${legacyType}%`]);
    }
    const roleIds = await getUsableUserRoleIds();
    if (roleIds.length > 0) {
        await db_1.default.query(`UPDATE incidents
       SET handler_id = ?
       WHERE status IN ('active', 'resolved', 'ignored')
         AND (handler_id IS NULL OR handler_id = '')`, [roleIds[0]]);
    }
}
function parseHorizonList(rawValue, fallback = DEFAULT_HORIZONS) {
    const rawText = Array.isArray(rawValue) ? rawValue.join(',') : String(rawValue || '');
    const parsed = rawText
        .split(',')
        .map((value) => Number(String(value).trim()))
        .filter((value) => DEFAULT_HORIZONS.includes(value));
    return parsed.length ? Array.from(new Set(parsed)).sort((a, b) => a - b) : [...fallback];
}
function buildRecommendation(predictedSpeed) {
    if (predictedSpeed >= 40) {
        return { recommendation: 'recommended', level: 'good' };
    }
    if (predictedSpeed < 25) {
        return { recommendation: 'reroute', level: 'bad' };
    }
    return { recommendation: 'caution', level: 'normal' };
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function buildRouteAdvice(currentSpeed, predictedSpeed, horizon) {
    const delta = currentSpeed === null ? null : Number((predictedSpeed - currentSpeed).toFixed(2));
    const decline = delta === null ? 0 : Math.max(0, -delta);
    const speedDeficit = Math.max(0, 48 - predictedSpeed);
    const lowSpeedPenalty = predictedSpeed < 25
        ? speedDeficit * 1.95
        : predictedSpeed < 35
            ? speedDeficit * 1.2
            : predictedSpeed < 40
                ? speedDeficit * 0.7
                : speedDeficit * 0.28;
    const declinePenalty = decline === 0
        ? 0
        : decline >= 10
            ? decline * 1.9
            : decline >= 5
                ? decline * 1.35
                : decline * 0.75;
    const horizonPenalty = Math.max(0, horizon - 15) * 0.16;
    const score = Math.round(clamp(100 - lowSpeedPenalty - declinePenalty - horizonPenalty, 0, 100));
    let level = 'good';
    let recommendation = '建议通行';
    if (score < 55 || predictedSpeed < 25) {
        level = 'bad';
        recommendation = '建议绕行';
    }
    else if (score < 78 || predictedSpeed < 35 || decline >= 7) {
        level = 'normal';
        recommendation = '谨慎通行';
    }
    const reasonParts = [];
    reasonParts.push(`${horizon}分钟后预测速度约 ${predictedSpeed.toFixed(1)} km/h`);
    if (currentSpeed !== null) {
        const direction = delta >= 0 ? '上升' : '下降';
        reasonParts.push(`较当前${direction} ${Math.abs(delta).toFixed(1)} km/h`);
    }
    if (predictedSpeed < 25) {
        reasonParts.push('预测速度低于拥堵阈值');
    }
    else if (predictedSpeed < 35) {
        reasonParts.push('未来通行效率偏低');
    }
    else if (decline >= 8) {
        reasonParts.push('速度下滑明显');
    }
    else {
        reasonParts.push('未来速度保持在可接受区间');
    }
    return {
        recommendation,
        level,
        score,
        speed_delta: delta,
        reason: reasonParts.join('，'),
    };
}
async function getLatestTrafficMap(nodeIds = NODE_IDS) {
    const [rows] = await db_1.default.query(`SELECT t.node_id, t.speed, t.congestion_status, t.collected_at
     FROM ${TRAFFIC_TABLE} t
     INNER JOIN (
       SELECT node_id, MAX(collected_at) as max_time
       FROM ${TRAFFIC_TABLE}
       GROUP BY node_id
     ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time
     WHERE t.node_id IN (?)`, [nodeIds]);
    return new Map((rows || []).map((row) => [row.node_id, row]));
}
function parseNodeList(rawValue, fallback = []) {
    const rawText = Array.isArray(rawValue) ? rawValue.join(',') : String(rawValue || '');
    const parsed = rawText
        .split(',')
        .map((value) => String(value).trim())
        .filter((value) => NODE_IDS.includes(value));
    return parsed.length ? Array.from(new Set(parsed)) : fallback;
}
async function ensurePredictionsTableMigration() {
    const [columns] = await db_1.default.query(`SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'predictions'`);
    const columnSet = new Set((columns || []).map((row) => row.name));
    const addColumnIfMissing = async (name, definition) => {
        if (!columnSet.has(name)) {
            await db_1.default.query(`ALTER TABLE predictions ADD COLUMN ${name} ${definition}`);
            columnSet.add(name);
        }
    };
    await addColumnIfMissing('horizon_minutes', 'INT NOT NULL DEFAULT 15');
    await addColumnIfMissing('target_at', 'DATETIME NULL');
    await addColumnIfMissing('source_table', `VARCHAR(64) NULL DEFAULT '${TRAFFIC_SOURCE.readTable}'`);
    await addColumnIfMissing('model_bucket_minutes', `TINYINT NOT NULL DEFAULT ${(0, trafficWindow_1.getModelBucketMinutes)()}`);
    await db_1.default.query(`
    CREATE INDEX idx_prediction_horizon_time
    ON predictions (horizon_minutes, predicted_at, target_at, node_id)
  `).catch(() => null);
}
function normalizePredictionPayload(flaskData) {
    const horizons = flaskData?.multi_horizon_predictions;
    if (Array.isArray(horizons) && horizons.length > 0) {
        return horizons
            .filter((item) => item && typeof item.minutes === 'number' && item.predictions)
            .map((item) => ({
            minutes: Number(item.minutes),
            predictions: item.predictions,
        }));
    }
    return [{
            minutes: Number(flaskData?.primary_horizon_minutes || 15),
            predictions: (flaskData?.predictions || {}),
        }];
}
async function persistPredictionSnapshot(flaskData, generatedAt) {
    const normalized = normalizePredictionPayload(flaskData);
    const insertValues = [];
    for (const horizon of normalized) {
        const targetAt = new Date(generatedAt.getTime() + horizon.minutes * 60 * 1000);
        for (const nodeId of NODE_IDS) {
            insertValues.push([
                nodeId,
                Number(horizon.predictions?.[nodeId] ?? 0),
                generatedAt,
                horizon.minutes,
                targetAt,
                TRAFFIC_SOURCE.readTable,
                (0, trafficWindow_1.getModelBucketMinutes)(),
            ]);
        }
    }
    if (insertValues.length > 0) {
        await db_1.default.query(`INSERT INTO predictions
        (node_id, predicted_speed, predicted_at, horizon_minutes, target_at, source_table, model_bucket_minutes)
       VALUES ?`, [insertValues]);
    }
    return normalized.map((item) => ({
        horizon_minutes: item.minutes,
        target_at: new Date(generatedAt.getTime() + item.minutes * 60 * 1000).toISOString(),
        predictions: item.predictions,
    }));
}
async function inferPredictionSnapshot() {
    const window = await (0, trafficWindow_1.buildModelWindow)(NODE_IDS);
    const generatedAt = new Date();
    const flaskResp = await axios_1.default.post(`${AI_SERVICE_URL}/predict`, { window, reference_time: generatedAt.toISOString() });
    const flaskData = flaskResp.data;
    if (!flaskData.success) {
        throw new Error(flaskData.error || 'predict failed');
    }
    const snapshots = normalizePredictionPayload(flaskData).map((item) => ({
        horizon_minutes: item.minutes,
        target_at: new Date(generatedAt.getTime() + item.minutes * 60 * 1000).toISOString(),
        predictions: item.predictions,
    }));
    return {
        generatedAt,
        snapshots,
        primaryPredictions: snapshots.find((item) => item.horizon_minutes === 15)?.predictions || snapshots[0]?.predictions || {},
    };
}
async function runPredictionSnapshot() {
    const result = await inferPredictionSnapshot();
    await persistPredictionSnapshot({
        multi_horizon_predictions: result.snapshots.map((item) => ({
            minutes: item.horizon_minutes,
            predictions: item.predictions,
        })),
    }, result.generatedAt);
    return result;
}
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
    await db_1.default.query(`
    DELETE t1 FROM \`${TRAFFIC_SOURCE.mockTable}\` t1
    INNER JOIN \`${TRAFFIC_SOURCE.mockTable}\` t2
      ON t1.node_id = t2.node_id
     AND t1.collected_at = t2.collected_at
     AND t1.id > t2.id
  `);
    await db_1.default.query(`
    CREATE UNIQUE INDEX uniq_mock_node_time
    ON \`${TRAFFIC_SOURCE.mockTable}\` (node_id, collected_at)
  `).catch(() => null);
}
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        traffic_source: TRAFFIC_SOURCE.readSource,
        traffic_table: TRAFFIC_SOURCE.readTable,
        model_bucket_minutes: (0, trafficWindow_1.getModelBucketMinutes)(),
        model_window_size: (0, trafficWindow_1.getModelWindowSize)(),
        ai_service_url: AI_SERVICE_URL,
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
        const result = await runPredictionSnapshot();
        res.json({
            success: true,
            predictions: result.primaryPredictions,
            generated_at: result.generatedAt.toISOString(),
            horizons: result.snapshots.map((item) => ({
                horizon_minutes: item.horizon_minutes,
                target_at: item.target_at,
            })),
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
    const horizon = Number(req.query.horizon || 15);
    const nodeId = String(req.query.node_id || '').trim();
    try {
        const conditions = ['p.horizon_minutes = ?', 'p.source_table = ?'];
        const params = [horizon, TRAFFIC_SOURCE.readTable];
        if (nodeId) {
            conditions.push('p.node_id = ?');
            params.push(nodeId);
        }
        const [rows] = await db_1.default.query(`SELECT p.node_id, p.predicted_speed, p.predicted_at, p.horizon_minutes, p.target_at, p.source_table, p.model_bucket_minutes
       FROM predictions p
       INNER JOIN (
         SELECT MAX(predicted_at) as max_time
         FROM predictions
         WHERE horizon_minutes = ? AND target_at IS NOT NULL AND source_table = ?
       ) latest ON p.predicted_at = latest.max_time
       WHERE ${conditions.join(' AND ')} AND p.target_at IS NOT NULL
       ORDER BY p.node_id`, [horizon, TRAFFIC_SOURCE.readTable, ...params]);
        res.json({
            success: true,
            data: rows,
            meta: {
                horizon_minutes: horizon,
                generated_at: rows[0]?.predicted_at || null,
                source_table: rows[0]?.source_table || TRAFFIC_SOURCE.readTable,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.get('/api/predict/outlook', async (req, res) => {
    const nodeId = String(req.query.node_id || '').trim();
    if (!nodeId) {
        return res.status(400).json({ success: false, error: 'node_id is required' });
    }
    if (!NODE_IDS.includes(nodeId)) {
        return res.status(400).json({ success: false, error: 'invalid node_id' });
    }
    try {
        const [rows] = await db_1.default.query(`SELECT p.node_id, p.predicted_speed, p.predicted_at, p.horizon_minutes, p.target_at, p.source_table, p.model_bucket_minutes
       FROM predictions p
       INNER JOIN (
         SELECT horizon_minutes, MAX(predicted_at) AS max_time
         FROM predictions
         WHERE target_at IS NOT NULL AND source_table = ?
         GROUP BY horizon_minutes
       ) latest ON p.horizon_minutes = latest.horizon_minutes AND p.predicted_at = latest.max_time
       WHERE p.node_id = ? AND p.target_at IS NOT NULL AND p.source_table = ?
       ORDER BY p.horizon_minutes ASC`, [TRAFFIC_SOURCE.readTable, nodeId, TRAFFIC_SOURCE.readTable]);
        const data = rows.map((row) => ({
            node_id: row.node_id,
            horizon_minutes: row.horizon_minutes,
            predicted_speed: Number(row.predicted_speed),
            generated_at: new Date(row.predicted_at).toISOString(),
            target_at: row.target_at ? new Date(row.target_at).toISOString() : null,
            lead_minutes: row.horizon_minutes,
            source_table: row.source_table || TRAFFIC_SOURCE.readTable,
        }));
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.get('/api/nodes', (req, res) => {
    res.json({
        success: true,
        data: NODES_META,
        meta: {
            node_ids: NODE_IDS,
            count: NODE_IDS.length,
        },
    });
});
// 浜嬩欢绠＄悊
app.get('/api/incidents', async (req, res) => {
    try {
        const [rows] = await db_1.default.query(`SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50`);
        res.json({ success: true, data: rows.map(normalizeIncidentRow) });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.post('/api/incidents', auth_1.requireAuth, async (req, res) => {
    const { node_id, type, description, severity, reporter_id, handler_id } = req.body;
    try {
        const incidentType = INCIDENT_TYPE_LABELS[String(type || '')] || String(type || '').trim();
        const incidentDescription = normalizeIncidentText(description);
        const reporterId = normalizeRoleId(reporter_id || req.user?.role_id || '');
        const handlerId = normalizeRoleId(handler_id || '');
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
        const [result] = await db_1.default.query(`INSERT INTO incidents (node_id, type, description, severity, status, reporter_id, handler_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NOW())`, [node_id, incidentType, incidentDescription, severity, 'reported', reporterId, handlerId]);
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
        const currentRoleId = normalizeRoleId(req.user?.role_id || '');
        const handlerId = normalizeRoleId(handler_id || currentRoleId || '');
        if (!currentRoleId || !isValidRoleId(currentRoleId)) {
            return res.status(403).json({ success: false, error: 'Current user has no valid role_id' });
        }
        if (handlerId && !isValidRoleId(handlerId)) {
            return res.status(400).json({ success: false, error: 'Invalid handler_id format, expected S0001 or G0001' });
        }
        if (handlerId) {
            const userRoleIdSet = await getUsersRoleIdSet();
            if (!userRoleIdSet.has(handlerId)) {
                return res.status(400).json({ success: false, error: 'handler_id does not exist in users table' });
            }
        }
        const [incidentRows] = await db_1.default.query('SELECT id, status, handler_id FROM incidents WHERE id = ? LIMIT 1', [req.params.id]);
        if (incidentRows.length === 0) {
            return res.status(404).json({ success: false, error: 'incident not found' });
        }
        const incident = incidentRows[0];
        const assignedHandlerId = normalizeRoleId(incident.handler_id);
        if (nextStatus === 'active') {
            if (incident.status === 'reported') {
                if (assignedHandlerId && assignedHandlerId !== currentRoleId) {
                    return res.status(403).json({ success: false, error: 'Only the assigned handler can accept this incident' });
                }
            }
            else if (assignedHandlerId !== currentRoleId) {
                return res.status(403).json({ success: false, error: 'Only the assigned handler can reopen this incident' });
            }
        }
        if ((nextStatus === 'resolved' || nextStatus === 'ignored')) {
            if (incident.status !== 'active') {
                return res.status(400).json({ success: false, error: 'Only active incidents can be resolved or ignored' });
            }
            if (!assignedHandlerId || assignedHandlerId !== currentRoleId) {
                return res.status(403).json({ success: false, error: 'Only the assigned handler can resolve or ignore this incident' });
            }
        }
        const nextHandlerId = nextStatus === 'active' ? assignedHandlerId || currentRoleId : handlerId;
        await db_1.default.query(`UPDATE incidents
       SET status = ?,
           handler_id = COALESCE(NULLIF(?, ''), handler_id),
           handled_at = CASE
             WHEN ? IN ('resolved', 'ignored') THEN NOW()
             WHEN ? = 'active' THEN NULL
             ELSE handled_at
           END
       WHERE id = ?`, [nextStatus, nextHandlerId, nextStatus, nextStatus, req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
app.delete('/api/incidents/:id', auth_1.requireAuth, async (req, res) => {
    if (req.user?.role !== '管理员') {
        return res.status(403).json({ success: false, error: 'Only administrators can delete incidents' });
    }
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
    const statuses = ['reported', 'active', 'resolved', 'ignored'];
    try {
        let roleIds = await getUsableUserRoleIds();
        if (roleIds.length === 0) {
            await (0, auth_1.ensureUserTableMigration)();
            roleIds = await getUsableUserRoleIds();
        }
        if (roleIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No usable role_id found in users table' });
        }
        const values = [];
        for (let i = 0; i < count; i += 1) {
            const node = NODES_META[Math.floor(Math.random() * NODES_META.length)];
            const type = MOCK_INCIDENT_TYPES[Math.floor(Math.random() * MOCK_INCIDENT_TYPES.length)];
            const severity = 1 + Math.floor(Math.random() * 3);
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const reporter = roleIds[Math.floor(Math.random() * roleIds.length)];
            const handler = status === 'reported' && Math.random() < 0.45
                ? ''
                : roleIds[Math.floor(Math.random() * roleIds.length)];
            const minutesAgo = Math.floor(Math.random() * 360);
            values.push([
                node.id,
                type.value,
                buildIncidentDescription(node, type, severity),
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
        const result = await inferPredictionSnapshot();
        const latestMap = await getLatestTrafficMap([nodeId]);
        const current = latestMap.get(nodeId);
        const currentSpeed = current ? Number(current.speed) : null;
        const target = result.snapshots.find((item) => item.horizon_minutes === safeHorizon);
        const predictedSpeed = Number(target?.predictions?.[nodeId] ?? 0);
        const advice = buildRouteAdvice(currentSpeed, predictedSpeed, safeHorizon);
        return res.json({
            success: true,
            data: {
                node_id: nodeId,
                horizon: safeHorizon,
                horizon_minutes: safeHorizon,
                current_speed: currentSpeed,
                current_status: current?.congestion_status ?? null,
                current_collected_at: current?.collected_at ? new Date(current.collected_at).toISOString() : null,
                predicted_speed: predictedSpeed,
                speed_delta: advice.speed_delta,
                score: advice.score,
                recommendation: advice.recommendation,
                level: advice.level,
                reason: advice.reason,
                source_table: TRAFFIC_SOURCE.readTable,
                generated_at: result.generatedAt.toISOString(),
                target_at: target?.target_at || null,
                lead_minutes: safeHorizon,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: String(err) });
    }
});
app.get('/api/route/outlook', async (req, res) => {
    const nodeIds = parseNodeList(req.query.node_ids, parseNodeList(req.query.node_id, []));
    if (nodeIds.length === 0) {
        return res.status(400).json({ success: false, error: 'node_id or node_ids is required' });
    }
    const horizons = parseHorizonList(req.query.horizons, [30, 45, 60]);
    try {
        const result = await runPredictionSnapshot();
        const latestMap = await getLatestTrafficMap(nodeIds);
        const items = [];
        for (const nodeId of nodeIds) {
            const current = latestMap.get(nodeId);
            const currentSpeed = current ? Number(current.speed) : null;
            for (const item of result.snapshots.filter((snapshot) => horizons.includes(snapshot.horizon_minutes))) {
                const predictedSpeed = Number(item.predictions?.[nodeId] ?? 0);
                const advice = buildRouteAdvice(currentSpeed, predictedSpeed, item.horizon_minutes);
                items.push({
                    node_id: nodeId,
                    horizon_minutes: item.horizon_minutes,
                    current_speed: currentSpeed,
                    current_status: current?.congestion_status ?? null,
                    current_collected_at: current?.collected_at ? new Date(current.collected_at).toISOString() : null,
                    predicted_speed: predictedSpeed,
                    speed_delta: advice.speed_delta,
                    score: advice.score,
                    recommendation: advice.recommendation,
                    level: advice.level,
                    reason: advice.reason,
                    generated_at: result.generatedAt.toISOString(),
                    target_at: item.target_at,
                    lead_minutes: item.horizon_minutes,
                    source_table: TRAFFIC_SOURCE.readTable,
                });
            }
        }
        items.sort((a, b) => b.score - a.score || b.predicted_speed - a.predicted_speed);
        res.json({
            success: true,
            data: items,
            meta: {
                node_ids: nodeIds,
                horizons,
                generated_at: result.generatedAt.toISOString(),
                source_table: TRAFFIC_SOURCE.readTable,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
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
        const predictionResult = await inferPredictionSnapshot();
        const pred15 = predictionResult.snapshots.find((item) => item.horizon_minutes === 15)?.predictions || {};
        const pred30 = predictionResult.snapshots.find((item) => item.horizon_minutes === 30)?.predictions || {};
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
        const now = predictionResult.generatedAt;
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
app.get('/api/dashboard/chart', async (req, res) => {
    const nodeId = String(req.query.node_id || '').trim();
    const dateText = String(req.query.date || '').trim();
    const horizon = Number(req.query.horizon || 15);
    if (!nodeId) {
        return res.status(400).json({ success: false, error: 'node_id is required' });
    }
    if (!NODE_IDS.includes(nodeId)) {
        return res.status(400).json({ success: false, error: 'invalid node_id' });
    }
    if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        return res.status(400).json({ success: false, error: 'date must be YYYY-MM-DD' });
    }
    if (horizon !== 15) {
        return res.status(400).json({ success: false, error: 'dashboard chart currently supports 15-minute horizon only' });
    }
    const start = `${dateText} 00:00:00`;
    const end = `${dateText} 23:59:59`;
    try {
        const [actualRows] = await db_1.default.query(`SELECT node_id, speed, congestion_status, collected_at
       FROM ${TRAFFIC_TABLE}
       WHERE node_id = ? AND collected_at BETWEEN ? AND ?
       ORDER BY collected_at ASC`, [nodeId, start, end]);
        const [predictionRows] = await db_1.default.query(`SELECT p.node_id, p.predicted_speed, p.predicted_at, p.horizon_minutes, p.target_at, p.source_table, p.model_bucket_minutes
       FROM predictions p
       INNER JOIN (
         SELECT target_at, MAX(predicted_at) AS max_generated
         FROM predictions
         WHERE node_id = ? AND horizon_minutes = ? AND target_at BETWEEN ? AND ? AND source_table = ?
         GROUP BY target_at
       ) latest
         ON p.target_at = latest.target_at AND p.predicted_at = latest.max_generated
       WHERE p.node_id = ? AND p.horizon_minutes = ? AND p.source_table = ?
       ORDER BY p.target_at ASC`, [nodeId, horizon, start, end, TRAFFIC_SOURCE.readTable, nodeId, horizon, TRAFFIC_SOURCE.readTable]);
        res.json({
            success: true,
            data: {
                node_id: nodeId,
                date: dateText,
                actual_series: actualRows.map((row) => ({
                    timestamp: new Date(row.collected_at).toISOString(),
                    speed: Number(row.speed),
                    congestion_status: row.congestion_status,
                })),
                predicted_series: predictionRows.map((row) => ({
                    generated_at: new Date(row.predicted_at).toISOString(),
                    target_at: row.target_at ? new Date(row.target_at).toISOString() : null,
                    predicted_speed: Number(row.predicted_speed),
                    horizon_minutes: row.horizon_minutes,
                    lead_minutes: row.horizon_minutes,
                    is_leading_actual: row.horizon_minutes === 15,
                })),
            },
            meta: {
                source_table: TRAFFIC_SOURCE.readTable,
                horizon_minutes: horizon,
                bucket_minutes: (0, trafficWindow_1.getModelBucketMinutes)(),
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
const PORT = process.env.PORT || 3001;
// 姣?鍒嗛挓鑷姩瑙﹀彂涓€娆￠娴?
node_cron_1.default.schedule('*/5 * * * *', async () => {
    console.log(`[${new Date().toLocaleString('zh')}] Scheduled prediction triggered...`);
    try {
        const result = await runPredictionSnapshot();
        console.log(`scheduled prediction complete`, {
            generated_at: result.generatedAt.toISOString(),
            horizons: result.snapshots.map((item) => item.horizon_minutes),
            source_table: TRAFFIC_SOURCE.readTable,
        });
    }
    catch (err) {
        console.error('瀹氭椂棰勬祴澶辫触:', err);
    }
}, { timezone: 'Asia/Shanghai' });
(0, auth_1.ensureUserTableMigration)()
    .then(async () => {
    await ensureTrafficMockTableMigration();
    await ensurePredictionsTableMigration();
    await ensureIncidentsTableMigration();
    app.listen(PORT, () => {
        console.log(`Backend server running at http://localhost:${PORT}`);
    });
})
    .catch((err) => {
    console.error('User table migration failed, server startup stopped:', err);
    process.exit(1);
});
