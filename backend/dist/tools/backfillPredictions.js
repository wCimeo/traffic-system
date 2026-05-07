"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../env");
const axios_1 = __importDefault(require("axios"));
const db_1 = __importDefault(require("../db"));
const trafficSource_1 = require("../trafficSource");
const trafficWindow_1 = require("../trafficWindow");
const NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10', 'K11'];
const DEFAULT_HORIZONS = [15, 30, 45, 60];
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';
function getArg(name, fallback = '') {
    const prefix = `--${name}=`;
    const found = process.argv.find((item) => item.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
}
function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}
function todayText() {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}
function dateAtMinute(dateText, minute) {
    const [year, month, day] = dateText.split('-').map(Number);
    return new Date(year, month - 1, day, Math.floor(minute / 60), minute % 60, 0, 0);
}
function mysqlDateTime(value) {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    const hour = `${value.getHours()}`.padStart(2, '0');
    const minute = `${value.getMinutes()}`.padStart(2, '0');
    const second = `${value.getSeconds()}`.padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
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
async function loadBuckets(dateText, tableName) {
    const bucketMinutes = (0, trafficWindow_1.getModelBucketMinutes)();
    const start = `${dateText} 00:00:00`;
    const end = `${dateText} 23:59:59`;
    const [rows] = await db_1.default.query(`SELECT node_id, speed, collected_at
     FROM \`${tableName}\`
     WHERE collected_at BETWEEN ? AND ?
     ORDER BY collected_at ASC`, [start, end]);
    const bucketMap = new Map();
    for (const row of rows || []) {
        const collectedAt = new Date(row.collected_at);
        const minute = collectedAt.getHours() * 60 + collectedAt.getMinutes();
        const bucketMinute = Math.floor(minute / bucketMinutes) * bucketMinutes;
        if (!bucketMap.has(bucketMinute)) {
            bucketMap.set(bucketMinute, {});
        }
        const bucket = bucketMap.get(bucketMinute);
        if (!bucket[row.node_id]) {
            bucket[row.node_id] = { sum: 0, count: 0 };
        }
        bucket[row.node_id].sum += Number(row.speed || 0);
        bucket[row.node_id].count += 1;
    }
    const firstByNode = {};
    for (const [, bucket] of bucketMap) {
        for (const nodeId of NODE_IDS) {
            const item = bucket[nodeId];
            if (item && firstByNode[nodeId] === undefined) {
                firstByNode[nodeId] = item.sum / item.count;
            }
        }
    }
    const previous = {};
    for (const nodeId of NODE_IDS) {
        previous[nodeId] = firstByNode[nodeId] ?? 35;
    }
    return Array.from(bucketMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([minute, bucket]) => {
        const values = {};
        for (const nodeId of NODE_IDS) {
            const item = bucket[nodeId];
            values[nodeId] = item ? Number((item.sum / item.count).toFixed(2)) : previous[nodeId];
            previous[nodeId] = values[nodeId];
        }
        return {
            minute,
            generatedAt: dateAtMinute(dateText, minute),
            values,
        };
    });
}
async function main() {
    const dateText = getArg('date', todayText());
    const source = (0, trafficSource_1.getTrafficSourceConfig)();
    const tableName = getArg('table', source.readTable);
    const clear = hasFlag('clear');
    const windowSize = (0, trafficWindow_1.getModelWindowSize)();
    const bucketMinutes = (0, trafficWindow_1.getModelBucketMinutes)();
    const buckets = await loadBuckets(dateText, tableName);
    if (buckets.length < windowSize) {
        throw new Error(`not enough buckets for prediction backfill: ${buckets.length}/${windowSize}`);
    }
    if (clear) {
        await db_1.default.query(`DELETE FROM predictions
       WHERE source_table = ? AND target_at BETWEEN ? AND ?`, [tableName, `${dateText} 00:00:00`, `${dateText} 23:59:59`]);
    }
    let insertedRows = 0;
    for (let index = windowSize - 1; index < buckets.length; index += 1) {
        const generatedAt = buckets[index].generatedAt;
        const window = buckets.slice(index - windowSize + 1, index + 1).map((bucket) => bucket.values);
        const flaskResp = await axios_1.default.post(`${AI_SERVICE_URL}/predict`, { window });
        const flaskData = flaskResp.data;
        if (!flaskData.success) {
            throw new Error(flaskData.error || 'predict failed');
        }
        const insertValues = [];
        for (const horizon of normalizePredictionPayload(flaskData)) {
            if (!DEFAULT_HORIZONS.includes(horizon.minutes))
                continue;
            const targetAt = new Date(generatedAt.getTime() + horizon.minutes * 60 * 1000);
            for (const nodeId of NODE_IDS) {
                insertValues.push([
                    nodeId,
                    Number(horizon.predictions?.[nodeId] ?? 0),
                    generatedAt,
                    horizon.minutes,
                    targetAt,
                    tableName,
                    bucketMinutes,
                ]);
            }
        }
        if (insertValues.length) {
            await db_1.default.query(`INSERT INTO predictions
          (node_id, predicted_speed, predicted_at, horizon_minutes, target_at, source_table, model_bucket_minutes)
         VALUES ?`, [insertValues]);
            insertedRows += insertValues.length;
        }
    }
    console.log(JSON.stringify({
        success: true,
        date: dateText,
        source_table: tableName,
        buckets: buckets.length,
        inserted_rows: insertedRows,
    }, null, 2));
    await db_1.default.end();
}
main().catch(async (error) => {
    console.error(error);
    await db_1.default.end();
    process.exit(1);
});
