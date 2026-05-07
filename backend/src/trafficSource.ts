type TrafficReadSource = 'real' | 'mock';

function validateTableName(name: string) {
  const normalized = String(name || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error(`Invalid traffic table name: ${name}`);
  }
  return normalized;
}

const REAL_TABLE = validateTableName(process.env.TRAFFIC_REAL_TABLE || 'traffic_flow');
const MOCK_TABLE = validateTableName(process.env.TRAFFIC_MOCK_TABLE || 'traffic_flow_mock');

export function getTrafficReadSource(): TrafficReadSource {
  return String(process.env.TRAFFIC_READ_SOURCE || 'real').trim().toLowerCase() === 'mock'
    ? 'mock'
    : 'real';
}

export function getTrafficReadTableName() {
  return getTrafficReadSource() === 'mock' ? MOCK_TABLE : REAL_TABLE;
}

export function getTrafficReadTableSql() {
  return `\`${getTrafficReadTableName()}\``;
}

export function getTrafficLatestCacheKey() {
  return `traffic:latest:${getTrafficReadSource()}`;
}

export function getTrafficSourceConfig() {
  return {
    readSource: getTrafficReadSource(),
    readTable: getTrafficReadTableName(),
    realTable: REAL_TABLE,
    mockTable: MOCK_TABLE,
  };
}
