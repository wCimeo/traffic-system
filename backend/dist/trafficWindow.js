"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelBucketMinutes = getModelBucketMinutes;
exports.getModelWindowSize = getModelWindowSize;
exports.buildModelWindow = buildModelWindow;
const db_1 = __importDefault(require("./db"));
const trafficSource_1 = require("./trafficSource");
const MODEL_BUCKET_MINUTES = Number(process.env.MODEL_BUCKET_MINUTES || 5);
const MODEL_WINDOW_SIZE = Number(process.env.MODEL_WINDOW_SIZE || 12);
const MODEL_LOOKBACK_MINUTES = Number(process.env.MODEL_WINDOW_LOOKBACK_MINUTES || MODEL_BUCKET_MINUTES * MODEL_WINDOW_SIZE * 3);
function floorToBucketTime(value) {
    const date = new Date(value);
    date.setSeconds(0, 0);
    const bucketMinute = Math.floor(date.getMinutes() / MODEL_BUCKET_MINUTES) * MODEL_BUCKET_MINUTES;
    date.setMinutes(bucketMinute, 0, 0);
    return date;
}
function toBucketKey(value) {
    return value.toISOString();
}
function getModelBucketMinutes() {
    return MODEL_BUCKET_MINUTES;
}
function getModelWindowSize() {
    return MODEL_WINDOW_SIZE;
}
async function getLatestSnapshot(nodeIds) {
    const trafficTable = (0, trafficSource_1.getTrafficReadTableSql)();
    const [rows] = await db_1.default.query(`SELECT t.node_id, t.speed
     FROM ${trafficTable} t
     INNER JOIN (
       SELECT node_id, MAX(collected_at) AS max_time
       FROM ${trafficTable}
       GROUP BY node_id
     ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time`);
    const fallback = {};
    for (const nodeId of nodeIds) {
        fallback[nodeId] = 0;
    }
    for (const row of rows || []) {
        fallback[row.node_id] = Number(row.speed ?? 0);
    }
    return fallback;
}
async function buildModelWindow(nodeIds) {
    const trafficTable = (0, trafficSource_1.getTrafficReadTableSql)();
    const [rows] = await db_1.default.query(`SELECT node_id, speed, collected_at
     FROM ${trafficTable}
     WHERE collected_at >= (
       SELECT MAX(collected_at) - INTERVAL ${MODEL_LOOKBACK_MINUTES} MINUTE FROM ${trafficTable}
     )
     ORDER BY collected_at ASC`);
    const bucketMap = new Map();
    for (const row of (rows || [])) {
        const bucketKey = toBucketKey(floorToBucketTime(row.collected_at));
        if (!bucketMap.has(bucketKey)) {
            bucketMap.set(bucketKey, {});
        }
        const bucket = bucketMap.get(bucketKey);
        if (!bucket[row.node_id]) {
            bucket[row.node_id] = { sum: 0, count: 0 };
        }
        bucket[row.node_id].sum += Number(row.speed ?? 0);
        bucket[row.node_id].count += 1;
    }
    let window = Array.from(bucketMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, bucket]) => {
        const snapshot = {};
        for (const nodeId of nodeIds) {
            const item = bucket[nodeId];
            snapshot[nodeId] = item ? Number((item.sum / item.count).toFixed(2)) : NaN;
        }
        return snapshot;
    })
        .slice(-MODEL_WINDOW_SIZE);
    if (window.length === 0) {
        throw new Error('No traffic data available for model window');
    }
    const fallback = await getLatestSnapshot(nodeIds);
    window = window.map((snapshot) => {
        const filled = { ...fallback };
        for (const nodeId of nodeIds) {
            const value = snapshot[nodeId];
            filled[nodeId] = Number.isFinite(value) ? value : fallback[nodeId];
        }
        return filled;
    });
    while (window.length < MODEL_WINDOW_SIZE) {
        window.unshift({ ...fallback });
    }
    return window;
}
