import json
import logging
import math
import os
import random
import csv
from datetime import datetime, timedelta
from pathlib import Path

import pymysql


def load_env():
    env_path = Path(__file__).resolve().parents[1] / '.env'
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env()


logging.basicConfig(level=logging.INFO, format='%(asctime)s [MOCK] %(message)s')
log = logging.getLogger(__name__)

MOCK_TABLE = os.getenv('TRAFFIC_MOCK_TABLE', 'traffic_flow_mock')
REAL_TABLE = os.getenv('TRAFFIC_REAL_TABLE', 'traffic_flow')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
ENABLE_INCIDENTS = os.getenv('TRAFFIC_MOCK_ENABLE_INCIDENTS', 'false').lower() == 'true'
INCIDENT_RATE = float(os.getenv('TRAFFIC_MOCK_INCIDENT_RATE', '0.004'))
NOISE_STD = float(os.getenv('TRAFFIC_MOCK_NOISE_STD', '0.45'))
MAX_STEP_DELTA = float(os.getenv('TRAFFIC_MOCK_MAX_STEP_DELTA', '2.4'))
HISTORICAL_PROFILE_PATH = Path(
    os.getenv(
        'TRAFFIC_MOCK_HISTORICAL_PROFILE',
        str(Path(__file__).resolve().parents[1] / 'model' / 'generated' / 'train_20260505050000' / 'aligned.csv'),
    )
)

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', '3306')),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', '123456'),
    'database': os.getenv('DB_NAME', 'traffic'),
    'charset': 'utf8mb4',
}

NODES = [
    {'id': 'A1', 'name': 'Node A1'},
    {'id': 'B2', 'name': 'Node B2'},
    {'id': 'C3', 'name': 'Node C3'},
    {'id': 'D4', 'name': 'Node D4'},
    {'id': 'E5', 'name': 'Node E5'},
    {'id': 'F6', 'name': 'Node F6'},
    {'id': 'G7', 'name': 'Node G7'},
    {'id': 'H8', 'name': 'Node H8'},
    {'id': 'I9', 'name': 'Node I9'},
    {'id': 'J10', 'name': 'Node J10'},
    {'id': 'K11', 'name': 'Node K11'},
]

NEIGHBORS = {
    'A1': ['B2', 'C3', 'D4'],
    'B2': ['A1', 'E5', 'F6'],
    'C3': ['A1', 'D4', 'G7'],
    'D4': ['A1', 'C3', 'H8'],
    'E5': ['B2', 'F6', 'I9'],
    'F6': ['B2', 'E5', 'G7', 'J10', 'K11'],
    'G7': ['C3', 'F6', 'H8'],
    'H8': ['D4', 'G7', 'I9'],
    'I9': ['E5', 'H8', 'J10', 'K11'],
    'J10': ['F6', 'I9', 'K11'],
    'K11': ['F6', 'I9', 'J10'],
}

NODE_BIAS = {
    'A1': -2.0,
    'B2': -1.5,
    'C3': 1.8,
    'D4': -1.2,
    'E5': -0.8,
    'F6': -3.0,
    'G7': 1.2,
    'H8': 0.4,
    'I9': -1.7,
    'J10': 2.1,
    'K11': -2.3,
}

CLUSTERS = {
    'south': ['A1', 'B2', 'E5', 'G7'],
    'central': ['D4', 'F6', 'H8', 'I9', 'K11'],
    'east': ['C3', 'J10'],
}

ROAD_COUNTS = {node['id']: max(1, len(NEIGHBORS[node['id']])) for node in NODES}
ACTIVE_INCIDENTS = []
HISTORICAL_PROFILE = None


def connect_db():
    return pymysql.connect(**DB_CONFIG)


def ensure_mock_table():
    sql = f"""
    CREATE TABLE IF NOT EXISTS `{MOCK_TABLE}` (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        node_id VARCHAR(10) NOT NULL,
        collected_at DATETIME NOT NULL,
        speed FLOAT NOT NULL,
        congestion_status TINYINT NOT NULL,
        road_count TINYINT NOT NULL,
        INDEX idx_node_time (node_id, collected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """
    conn = connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    finally:
        conn.close()


def gaussian(value: float, center: float, spread: float):
    return math.exp(-((value - center) ** 2) / (2 * spread ** 2))


def load_historical_profile():
    global HISTORICAL_PROFILE
    if HISTORICAL_PROFILE is not None:
        return HISTORICAL_PROFILE

    profile = {node['id']: {} for node in NODES}
    if not HISTORICAL_PROFILE_PATH.exists():
        HISTORICAL_PROFILE = profile
        log.warning('historical mock profile missing: %s', HISTORICAL_PROFILE_PATH)
        return HISTORICAL_PROFILE

    with HISTORICAL_PROFILE_PATH.open('r', encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            node_id = row.get('node_id')
            if node_id not in profile:
                continue
            try:
                bucket_time = datetime.fromisoformat(str(row.get('bucket_time')))
                speed = float(row.get('speed') or 0)
            except (TypeError, ValueError):
                continue
            minute = bucket_time.hour * 60 + bucket_time.minute
            profile[node_id].setdefault(minute, []).append(speed)

    HISTORICAL_PROFILE = {
        node_id: {
            minute: sum(values) / len(values)
            for minute, values in minute_map.items()
            if values
        }
        for node_id, minute_map in profile.items()
    }
    loaded = sum(len(minute_map) for minute_map in HISTORICAL_PROFILE.values())
    log.info('historical mock profile loaded path=%s minute_profiles=%s', HISTORICAL_PROFILE_PATH, loaded)
    return HISTORICAL_PROFILE


def historical_profile_speed(node_id: str, current_time: datetime):
    profile = load_historical_profile().get(node_id, {})
    if not profile:
        return None

    minute = current_time.hour * 60 + current_time.minute
    lower = (minute // 5) * 5
    upper = min(24 * 60 - 5, lower + 5)
    lower_value = profile.get(lower)
    upper_value = profile.get(upper, lower_value)
    if lower_value is None:
        nearest_minute = min(profile, key=lambda item: abs(item - minute))
        return profile[nearest_minute]
    if upper_value is None or upper == lower:
        return lower_value
    ratio = (minute - lower) / max(1, upper - lower)
    return lower_value * (1 - ratio) + upper_value * ratio


def base_speed_for_time(current_time: datetime):
    minute_of_day = current_time.hour * 60 + current_time.minute
    hour = minute_of_day / 60.0
    base = 50.0
    base -= 18.0 * gaussian(hour, 8.1, 1.2)
    base -= 9.5 * gaussian(hour, 13.0, 1.1)
    base -= 21.0 * gaussian(hour, 18.1, 1.5)
    base += 4.0 * gaussian(hour, 2.5, 1.8)
    return max(14.0, min(58.0, base))


def target_speed_for_node(node_id: str, current_time: datetime, cluster_adjustment: float):
    historical = historical_profile_speed(node_id, current_time)
    if historical is not None:
        return historical + cluster_adjustment + random.gauss(0, NOISE_STD)
    return base_speed_for_time(current_time) + NODE_BIAS[node_id] + cluster_adjustment + random.gauss(0, NOISE_STD)


def congestion_status_from_speed(speed: float):
    if speed >= 40:
        return 1
    if speed >= 28:
        return 2
    if speed >= 18:
        return 3
    return 4


def get_latest_snapshot(table_name: str):
    sql = f"""
    SELECT t.node_id, t.speed
    FROM `{table_name}` t
    INNER JOIN (
        SELECT node_id, MAX(collected_at) AS max_time
        FROM `{table_name}`
        GROUP BY node_id
    ) latest ON t.node_id = latest.node_id AND t.collected_at = latest.max_time
    """
    conn = connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    finally:
        conn.close()
    return {row[0]: float(row[1]) for row in rows}


def bootstrap_previous_snapshot(current_time: datetime):
    mock_snapshot = get_latest_snapshot(MOCK_TABLE)
    if len(mock_snapshot) == len(NODES):
        return mock_snapshot

    real_snapshot = get_latest_snapshot(REAL_TABLE)
    if len(real_snapshot) == len(NODES):
        return real_snapshot

    base = base_speed_for_time(current_time)
    return {node['id']: max(12.0, min(60.0, base + NODE_BIAS[node['id']])) for node in NODES}


def update_incidents():
    global ACTIVE_INCIDENTS
    next_incidents = []
    for incident in ACTIVE_INCIDENTS:
        incident['remaining_cycles'] -= 1
        if incident['remaining_cycles'] > 0:
            next_incidents.append(incident)
    ACTIVE_INCIDENTS = next_incidents

    if not ENABLE_INCIDENTS or random.random() >= INCIDENT_RATE:
        return

    occupied = {incident['node_id'] for incident in ACTIVE_INCIDENTS}
    candidates = [node['id'] for node in NODES if node['id'] not in occupied]
    if not candidates:
        return

    incident = {
        'node_id': random.choice(candidates),
        'remaining_cycles': random.randint(8, 18),
        'penalty': random.uniform(3.0, 7.0),
        'neighbor_ratio': random.uniform(0.15, 0.28),
    }
    ACTIVE_INCIDENTS.append(incident)
    log.info(
        'start incident node=%s duration=%s penalty=%.1f',
        incident['node_id'],
        incident['remaining_cycles'],
        incident['penalty'],
    )


def build_cluster_wave(current_time: datetime):
    minute_of_day = current_time.hour * 60 + current_time.minute
    return {
        'south': math.sin(minute_of_day / 26.0) * 1.2 + random.gauss(0, 0.18),
        'central': math.cos(minute_of_day / 34.0) * 1.4 + random.gauss(0, 0.2),
        'east': math.sin(minute_of_day / 41.0 + 0.8) * 0.9 + random.gauss(0, 0.15),
    }


def apply_incident_penalty(node_id: str, speed: float):
    adjusted = speed
    for incident in ACTIVE_INCIDENTS:
        if incident['node_id'] == node_id:
            adjusted -= incident['penalty']
        elif node_id in NEIGHBORS[incident['node_id']]:
            adjusted -= incident['penalty'] * incident['neighbor_ratio']
    return adjusted


def generate_snapshot(current_time: datetime, previous_snapshot: dict):
    base_speed = base_speed_for_time(current_time)
    cluster_wave = build_cluster_wave(current_time)
    snapshot = {}

    for node in NODES:
        node_id = node['id']
        node_cluster = next(
            (cluster_name for cluster_name, members in CLUSTERS.items() if node_id in members),
            'central',
        )
        neighbor_values = [previous_snapshot.get(neighbor, base_speed) for neighbor in NEIGHBORS[node_id]]
        neighbor_avg = sum(neighbor_values) / len(neighbor_values) if neighbor_values else base_speed
        prev_value = previous_snapshot.get(node_id, base_speed)
        target = target_speed_for_node(node_id, current_time, cluster_wave[node_cluster])
        blended = prev_value * 0.62 + neighbor_avg * 0.06 + target * 0.32
        adjusted = apply_incident_penalty(node_id, blended)
        lower_bound = prev_value - MAX_STEP_DELTA
        upper_bound = prev_value + MAX_STEP_DELTA
        smoothed = max(lower_bound, min(upper_bound, adjusted))
        snapshot[node_id] = round(max(10.0, min(62.0, smoothed)), 2)

    return snapshot


def save_records(records: list):
    sql = f"""
    INSERT INTO `{MOCK_TABLE}`
      (node_id, collected_at, speed, congestion_status, road_count)
    VALUES
      (%(node_id)s, %(collected_at)s, %(speed)s, %(congestion_status)s, %(road_count)s)
    """
    conn = connect_db()
    try:
        with conn.cursor() as cur:
            cur.executemany(sql, records)
        conn.commit()
    finally:
        conn.close()


def update_redis_cache(records: list):
    try:
        import redis as redis_client

        payload = json.dumps(records, default=str)
        cache = redis_client.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        cache.setex('traffic:latest:mock', 70, payload)
    except Exception as error:
        log.warning('redis cache update skipped: %s', error)


def build_records(current_time: datetime, previous_snapshot: dict):
    update_incidents()
    snapshot = generate_snapshot(current_time, previous_snapshot)

    records = []
    for node in NODES:
        node_id = node['id']
        speed = snapshot[node_id]
        records.append({
            'node_id': node_id,
            'collected_at': current_time,
            'speed': speed,
            'congestion_status': congestion_status_from_speed(speed),
            'road_count': ROAD_COUNTS[node_id],
        })
    return records, snapshot


def collect_once(current_time: datetime | None = None):
    ensure_mock_table()
    current_time = (current_time or datetime.now()).replace(second=0, microsecond=0)
    previous_snapshot = bootstrap_previous_snapshot(current_time)
    records, _snapshot = build_records(current_time, previous_snapshot)
    save_records(records)
    update_redis_cache(records)
    log.info('mock cycle complete table=%s rows=%s incidents=%s', MOCK_TABLE, len(records), len(ACTIVE_INCIDENTS))
    return records


def collect_backfill(hours: float = 24.0, interval_minutes: int = 1):
    ensure_mock_table()
    now = datetime.now().replace(second=0, microsecond=0)
    start_time = now - timedelta(hours=hours)
    current_time = start_time.replace(second=0, microsecond=0)
    previous_snapshot = bootstrap_previous_snapshot(current_time)
    all_records = []
    latest_records = []

    while current_time <= now:
        records, previous_snapshot = build_records(current_time, previous_snapshot)
        all_records.extend(records)
        latest_records = records
        current_time += timedelta(minutes=interval_minutes)

    if all_records:
        save_records(all_records)
    if latest_records:
        update_redis_cache(latest_records)
    log.info(
        'mock backfill complete table=%s hours=%.2f interval=%sm rows=%s',
        MOCK_TABLE,
        hours,
        interval_minutes,
        len(all_records),
    )
    return all_records


if __name__ == '__main__':
    collect_once()
