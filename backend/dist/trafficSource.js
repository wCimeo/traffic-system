"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrafficReadSource = getTrafficReadSource;
exports.getTrafficReadTableName = getTrafficReadTableName;
exports.getTrafficReadTableSql = getTrafficReadTableSql;
exports.getTrafficLatestCacheKey = getTrafficLatestCacheKey;
exports.getTrafficSourceConfig = getTrafficSourceConfig;
function validateTableName(name) {
    const normalized = String(name || '').trim();
    if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
        throw new Error(`Invalid traffic table name: ${name}`);
    }
    return normalized;
}
const REAL_TABLE = validateTableName(process.env.TRAFFIC_REAL_TABLE || 'traffic_flow');
const MOCK_TABLE = validateTableName(process.env.TRAFFIC_MOCK_TABLE || 'traffic_flow_mock');
function getTrafficReadSource() {
    return String(process.env.TRAFFIC_READ_SOURCE || 'real').trim().toLowerCase() === 'mock'
        ? 'mock'
        : 'real';
}
function getTrafficReadTableName() {
    return getTrafficReadSource() === 'mock' ? MOCK_TABLE : REAL_TABLE;
}
function getTrafficReadTableSql() {
    return `\`${getTrafficReadTableName()}\``;
}
function getTrafficLatestCacheKey() {
    return `traffic:latest:${getTrafficReadSource()}`;
}
function getTrafficSourceConfig() {
    return {
        readSource: getTrafficReadSource(),
        readTable: getTrafficReadTableName(),
        realTable: REAL_TABLE,
        mockTable: MOCK_TABLE,
    };
}
