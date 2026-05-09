"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const promise_1 = __importDefault(require("mysql2/promise"));
const ROOT_DIR = path_1.default.resolve(__dirname, '../../..');
const ENV_PATH = path_1.default.join(ROOT_DIR, '.env');
dotenv_1.default.config({ path: ENV_PATH });
const TRAFFIC_READ_SOURCE = String(process.env.TRAFFIC_READ_SOURCE || 'real').trim().toLowerCase();
const SOURCE_TABLE = TRAFFIC_READ_SOURCE === 'mock'
    ? (process.env.TRAFFIC_MOCK_TABLE || 'traffic_flow_mock')
    : (process.env.TRAFFIC_REAL_TABLE || 'traffic_flow');
const RAW_TABLE = 'traffic_flow_train_raw';
const ALIGNED_TABLE = 'traffic_flow_train_aligned';
const VERSION_TABLE = 'training_dataset_versions';
const EXPORT_DIR = path_1.default.join(ROOT_DIR, 'model', 'generated');
const BUCKET_MINUTES = 5;
const CUTOFF_AT = process.env.TRAINING_CUTOFF_AT || '2026-05-05 05:00:00';
const NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10', 'K11'];
const NEIGHBORS = {
    A1: ['B2', 'C3', 'D4'],
    B2: ['A1', 'E5', 'F6'],
    C3: ['A1', 'D4', 'G7'],
    D4: ['A1', 'C3', 'H8'],
    E5: ['B2', 'F6', 'I9'],
    F6: ['B2', 'E5', 'G7', 'J10', 'K11'],
    G7: ['C3', 'F6', 'H8'],
    H8: ['D4', 'G7', 'I9'],
    I9: ['E5', 'H8', 'J10', 'K11'],
    J10: ['F6', 'I9', 'K11'],
    K11: ['F6', 'I9', 'J10'],
};
function toSqlDateTime(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function toVersionStamp(dateTime) {
    return dateTime.replace(/[-: ]/g, '').slice(0, 14);
}
function parseSqlDateTime(value) {
    const [datePart, timePart] = value.trim().split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, seconds);
}
function cloneDate(date) {
    return new Date(date.getTime());
}
function floorToBucket(date, bucketMinutes) {
    const floored = cloneDate(date);
    floored.setSeconds(0, 0);
    const minute = floored.getMinutes();
    floored.setMinutes(minute - (minute % bucketMinutes));
    return floored;
}
function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}
function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function mode(values) {
    const counts = new Map();
    for (const value of values) {
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    let winner = values[0];
    let winnerCount = -1;
    for (const [value, count] of counts.entries()) {
        if (count > winnerCount) {
            winner = value;
            winnerCount = count;
        }
    }
    return winner;
}
function speedToStatus(speed) {
    if (speed >= 40)
        return 1;
    if (speed >= 25)
        return 2;
    if (speed >= 15)
        return 3;
    return 4;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function buildTimeAxis(start, end, bucketMinutes) {
    const axis = [];
    let cursor = cloneDate(start);
    while (cursor <= end) {
        axis.push(toSqlDateTime(cursor));
        cursor = addMinutes(cursor, bucketMinutes);
    }
    return axis;
}
async function ensureTables(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS ${RAW_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      freeze_version VARCHAR(32) NOT NULL,
      source_row_id BIGINT NOT NULL,
      node_id VARCHAR(10) NOT NULL,
      collected_at DATETIME NOT NULL,
      speed FLOAT NOT NULL,
      congestion_status TINYINT NOT NULL,
      road_count TINYINT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_version_source (freeze_version, source_row_id),
      KEY idx_version_node_time (freeze_version, node_id, collected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS ${ALIGNED_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      freeze_version VARCHAR(32) NOT NULL,
      bucket_time DATETIME NOT NULL,
      node_id VARCHAR(10) NOT NULL,
      speed FLOAT NOT NULL,
      congestion_status TINYINT NOT NULL,
      road_count TINYINT NOT NULL,
      fill_method VARCHAR(24) NOT NULL,
      is_observed TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_version_bucket_node (freeze_version, bucket_time, node_id),
      KEY idx_version_node_bucket (freeze_version, node_id, bucket_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS ${VERSION_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      freeze_version VARCHAR(32) NOT NULL,
      source_table VARCHAR(64) NOT NULL,
      cutoff_at DATETIME NOT NULL,
      bucket_minutes INT NOT NULL,
      raw_row_count INT NOT NULL,
      aligned_row_count INT NOT NULL,
      observed_ratio DECIMAL(10,6) NOT NULL,
      summary_json JSON NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_freeze_version (freeze_version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
function aggregateRows(rows) {
    const bucketMap = new Map();
    const rawCounts = Object.fromEntries(NODE_IDS.map((nodeId) => [nodeId, 0]));
    for (const row of rows) {
        const nodeId = String(row.node_id).toUpperCase();
        if (!NODE_IDS.includes(nodeId))
            continue;
        rawCounts[nodeId] += 1;
        const bucket = toSqlDateTime(floorToBucket(new Date(row.collected_at), BUCKET_MINUTES));
        const nodeMap = bucketMap.get(bucket) ||
            new Map();
        const current = nodeMap.get(nodeId);
        if (!current) {
            nodeMap.set(nodeId, {
                speed: 0,
                congestionStatus: 0,
                roadCount: 0,
                _speeds: [Number(row.speed)],
                _statuses: [Number(row.congestion_status)],
                _roads: [Number(row.road_count)],
            });
        }
        else {
            current._speeds.push(Number(row.speed));
            current._statuses.push(Number(row.congestion_status));
            current._roads.push(Number(row.road_count));
        }
        bucketMap.set(bucket, nodeMap);
    }
    for (const nodeMap of bucketMap.values()) {
        for (const [nodeId, value] of nodeMap.entries()) {
            const mutable = value;
            nodeMap.set(nodeId, {
                speed: Number(average(mutable._speeds).toFixed(2)),
                congestionStatus: mode(mutable._statuses),
                roadCount: Math.max(1, Math.round(average(mutable._roads))),
            });
        }
    }
    return { bucketMap, rawCounts };
}
function fillNodeSeries(nodeId, axis, observedMap, neighborSeries) {
    const aligned = new Map();
    const observedIndices = [];
    const observedValues = [];
    const observedRoadCounts = [];
    let missingBeforeFill = 0;
    for (let i = 0; i < axis.length; i += 1) {
        const bucket = axis[i];
        const point = observedMap.get(bucket)?.get(nodeId);
        if (point) {
            observedIndices.push(i);
            observedValues.push(point.speed);
            observedRoadCounts.push(point.roadCount);
            aligned.set(bucket, {
                speed: point.speed,
                congestionStatus: point.congestionStatus,
                roadCount: point.roadCount,
                fillMethod: 'real',
                isObserved: 1,
            });
        }
        else {
            missingBeforeFill += 1;
        }
    }
    if (observedIndices.length === 0) {
        throw new Error(`Node ${nodeId} has no rows before cutoff.`);
    }
    const observedMin = Math.min(...observedValues);
    const observedMax = Math.max(...observedValues);
    for (let i = 0; i < axis.length; i += 1) {
        const bucket = axis[i];
        if (aligned.has(bucket))
            continue;
        const prevObservedIdx = [...observedIndices].reverse().find((index) => index < i);
        const nextObservedIdx = observedIndices.find((index) => index > i);
        let speed = null;
        let roadCount = null;
        let fillMethod = 'interpolate';
        if (prevObservedIdx !== undefined && nextObservedIdx !== undefined) {
            const prevBucket = axis[prevObservedIdx];
            const nextBucket = axis[nextObservedIdx];
            const prevPoint = aligned.get(prevBucket);
            const nextPoint = aligned.get(nextBucket);
            const ratio = (i - prevObservedIdx) / (nextObservedIdx - prevObservedIdx);
            speed = prevPoint.speed + (nextPoint.speed - prevPoint.speed) * ratio;
            roadCount = prevPoint.roadCount + (nextPoint.roadCount - prevPoint.roadCount) * ratio;
            fillMethod = 'interpolate';
        }
        else {
            const neighborPoints = NEIGHBORS[nodeId]
                .map((neighborId) => neighborSeries.get(neighborId)?.get(bucket))
                .filter((point) => Boolean(point));
            if (neighborPoints.length > 0) {
                speed = average(neighborPoints.map((point) => point.speed));
                roadCount = average(neighborPoints.map((point) => point.roadCount));
                fillMethod = 'spatial';
            }
            else if (prevObservedIdx !== undefined) {
                const prevPoint = aligned.get(axis[prevObservedIdx]);
                speed = prevPoint.speed;
                roadCount = prevPoint.roadCount;
                fillMethod = 'carry_forward';
            }
            else if (nextObservedIdx !== undefined) {
                const nextPoint = aligned.get(axis[nextObservedIdx]);
                speed = nextPoint.speed;
                roadCount = nextPoint.roadCount;
                fillMethod = 'carry_backward';
            }
        }
        const safeSpeed = clamp(Number((speed ?? observedValues[0]).toFixed(2)), observedMin, observedMax);
        const safeRoadCount = Math.max(1, Math.round(roadCount ?? observedRoadCounts[0] ?? 1));
        aligned.set(bucket, {
            speed: safeSpeed,
            congestionStatus: speedToStatus(safeSpeed),
            roadCount: safeRoadCount,
            fillMethod,
            isObserved: 0,
        });
    }
    return { aligned, missingBeforeFill };
}
async function main() {
    const pool = promise_1.default.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '123456',
        database: process.env.DB_NAME || 'traffic',
        waitForConnections: true,
        connectionLimit: 4,
    });
    const cutoffAt = parseSqlDateTime(CUTOFF_AT);
    const freezeVersion = `train_${toVersionStamp(toSqlDateTime(cutoffAt))}`;
    try {
        await ensureTables(pool);
        const [rowsResult] = await pool.query(`
        SELECT id, node_id, collected_at, speed, congestion_status, road_count
        FROM ${SOURCE_TABLE}
        WHERE collected_at <= ?
        ORDER BY collected_at ASC, node_id ASC
      `, [toSqlDateTime(cutoffAt)]);
        const rows = rowsResult;
        if (!rows.length) {
            throw new Error(`No rows found in ${SOURCE_TABLE} before ${toSqlDateTime(cutoffAt)}.`);
        }
        const filteredRows = rows.filter((row) => NODE_IDS.includes(String(row.node_id).toUpperCase()));
        const rawMinTime = new Date(filteredRows[0].collected_at);
        const rawMaxTime = new Date(filteredRows[filteredRows.length - 1].collected_at);
        const { bucketMap, rawCounts } = aggregateRows(filteredRows);
        const startBucket = floorToBucket(rawMinTime, BUCKET_MINUTES);
        const endBucket = floorToBucket(rawMaxTime, BUCKET_MINUTES);
        const axis = buildTimeAxis(startBucket, endBucket, BUCKET_MINUTES);
        const alignedByNode = new Map();
        const perNodeSummary = {};
        const fillMethodCounts = {
            real: 0,
            interpolate: 0,
            spatial: 0,
            carry_forward: 0,
            carry_backward: 0,
        };
        for (const nodeId of NODE_IDS) {
            const { aligned, missingBeforeFill } = fillNodeSeries(nodeId, axis, bucketMap, alignedByNode);
            alignedByNode.set(nodeId, aligned);
            let observedRows = 0;
            for (const point of aligned.values()) {
                if (point.isObserved)
                    observedRows += 1;
                fillMethodCounts[point.fillMethod] += 1;
            }
            perNodeSummary[nodeId] = {
                rawRows: rawCounts[nodeId],
                alignedRows: axis.length,
                observedRows,
                missingBeforeFill,
                missingRateBeforeFill: Number((missingBeforeFill / axis.length).toFixed(6)),
            };
        }
        const alignedRows = [];
        for (const bucket of axis) {
            for (const nodeId of NODE_IDS) {
                const point = alignedByNode.get(nodeId).get(bucket);
                alignedRows.push([
                    freezeVersion,
                    bucket,
                    nodeId,
                    point.speed,
                    point.congestionStatus,
                    point.roadCount,
                    point.fillMethod,
                    point.isObserved,
                ]);
            }
        }
        const observedRows = Object.values(perNodeSummary).reduce((sum, item) => sum + item.observedRows, 0);
        const summary = {
            version: freezeVersion,
            cutoffAt: toSqlDateTime(cutoffAt),
            bucketMinutes: BUCKET_MINUTES,
            rawRowCount: filteredRows.length,
            alignedRowCount: alignedRows.length,
            bucketCount: axis.length,
            startBucket: axis[0],
            endBucket: axis[axis.length - 1],
            rawMinTime: toSqlDateTime(rawMinTime),
            rawMaxTime: toSqlDateTime(rawMaxTime),
            observedRatio: Number((observedRows / alignedRows.length).toFixed(6)),
            perNode: perNodeSummary,
            fillMethodCounts,
        };
        await pool.query(`DELETE FROM ${RAW_TABLE} WHERE freeze_version = ?`, [freezeVersion]);
        await pool.query(`DELETE FROM ${ALIGNED_TABLE} WHERE freeze_version = ?`, [freezeVersion]);
        await pool.query(`DELETE FROM ${VERSION_TABLE} WHERE freeze_version = ?`, [freezeVersion]);
        if (filteredRows.length > 0) {
            const rawValues = filteredRows.map((row) => [
                freezeVersion,
                row.id,
                String(row.node_id).toUpperCase(),
                toSqlDateTime(new Date(row.collected_at)),
                row.speed,
                row.congestion_status,
                row.road_count,
            ]);
            await pool.query(`
          INSERT INTO ${RAW_TABLE}
            (freeze_version, source_row_id, node_id, collected_at, speed, congestion_status, road_count)
          VALUES ?
        `, [rawValues]);
        }
        if (alignedRows.length > 0) {
            await pool.query(`
          INSERT INTO ${ALIGNED_TABLE}
            (freeze_version, bucket_time, node_id, speed, congestion_status, road_count, fill_method, is_observed)
          VALUES ?
        `, [alignedRows]);
        }
        await pool.query(`
        INSERT INTO ${VERSION_TABLE}
          (freeze_version, source_table, cutoff_at, bucket_minutes, raw_row_count, aligned_row_count, observed_ratio, summary_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
            freezeVersion,
            SOURCE_TABLE,
            toSqlDateTime(cutoffAt),
            BUCKET_MINUTES,
            summary.rawRowCount,
            summary.alignedRowCount,
            summary.observedRatio,
            JSON.stringify(summary),
        ]);
        fs_1.default.mkdirSync(EXPORT_DIR, { recursive: true });
        const exportBase = path_1.default.join(EXPORT_DIR, freezeVersion);
        fs_1.default.mkdirSync(exportBase, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(exportBase, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
        fs_1.default.writeFileSync(path_1.default.join(exportBase, 'aligned.csv'), [
            'freeze_version,bucket_time,node_id,speed,congestion_status,road_count,fill_method,is_observed',
            ...alignedRows.map((row) => row.join(',')),
        ].join('\n'), 'utf8');
        console.log(`[prepare-training-data] freeze version: ${freezeVersion}`);
        console.log(`[prepare-training-data] raw rows: ${summary.rawRowCount}`);
        console.log(`[prepare-training-data] aligned rows: ${summary.alignedRowCount}`);
        console.log(`[prepare-training-data] observed ratio: ${summary.observedRatio}`);
        console.log(`[prepare-training-data] export dir: ${exportBase}`);
    }
    finally {
        await pool.end();
    }
}
main().catch((error) => {
    console.error('[prepare-training-data] failed:', error);
    process.exitCode = 1;
});
