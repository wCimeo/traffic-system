"""
成都10路口实时路况采集脚本
依赖：pip install requests pymysql apscheduler
使用前修改下方 DB_CONFIG 和 AMAP_KEY
"""

import time
import json
import logging
import requests
import pymysql
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler

# ─── 配置区 ────────────────────────────────────────────────
AMAP_KEY = "e7fdbe9370ab98aa9b255cdac07c57f9"

DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "123456",
    "database": "traffic",
    "charset": "utf8mb4",
}

# 采集间隔（秒），高德免费配额建议不低于60
INTERVAL_SECONDS = 300
# ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# 10个路口：节点ID、显示名、经纬度（高德坐标系 GCJ-02）
# 坐标已根据路口名称预先标注，可在高德地图网页版验证
NODES = [
    {"id": "A1",  "name": "天府大道-锦城大道路口",      "lng": 104.069093, "lat": 30.575761},
    {"id": "B2",  "name": "益州大道-锦城大道路口",      "lng": 104.059806, "lat": 30.574761},
    {"id": "C3",  "name": "成华大道-杉板桥路口",        "lng": 104.136395, "lat": 30.673074},
    {"id": "D4",  "name": "天府大道-华阳立交路口",      "lng": 104.067643, "lat": 30.598064},
    {"id": "E5",  "name": "剑南大道-锦城大道路口",      "lng": 104.047516, "lat": 30.575108},
    {"id": "F6",  "name": "益州大道-府城大道路口",      "lng": 104.060269, "lat": 30.589527},
    {"id": "G7",  "name": "天府三街-天府大道路口",      "lng": 104.069204, "lat": 30.546203},
    {"id": "H8",  "name": "科华南路-锦尚西二路路口",    "lng": 104.0785, "lat": 30.5892},
    {"id": "I9",  "name": "中环路火车南站-科华南路口",  "lng": 104.077952, "lat": 30.608579},
    {"id": "J10", "name": "东站西广场-邛崃山路路口",    "lng": 104.1356, "lat": 30.6298},
]


def fetch_traffic(node: dict) -> dict | None:
    """
    调用高德圆形区域路况接口，返回该路口的速度与拥堵状态。
    返回字段：node_id, timestamp, speed, status, raw_level
    """
    url = "https://restapi.amap.com/v3/traffic/status/circle"
    params = {
        "key": AMAP_KEY,
        "location": f"{node['lng']},{node['lat']}",
        "radius": 100,   # 半径100米，聚焦路口范围
        "level": 6,      # 道路等级：1=高速 6=普通城市道路
        "extensions": "all",
    }
    try:
        resp = requests.get(url, params=params, timeout=8)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != "1":
            log.warning(f"{node['id']} API返回异常: {data.get('info')}")
            return None

        roads = data.get("trafficinfo", {}).get("roads", [])
        if not roads:
            log.warning(f"{node['id']} 无路段数据")
            return None

        # 取第一条路段的速度，若有多条则取平均
        speeds = []
        statuses = []
        for road in roads:
            try:
                speeds.append(float(road.get("speed", 0)))
                statuses.append(int(road.get("status", 0)))
            except (ValueError, TypeError):
                continue

        avg_speed = round(sum(speeds) / len(speeds), 2) if speeds else 0.0
        # status: 0=未知 1=畅通 2=缓行 3=拥堵 4=严重拥堵
        dominant_status = max(set(statuses), key=statuses.count) if statuses else 0

        return {
            "node_id": node["id"],
            "timestamp": datetime.now(),
            "speed": avg_speed,
            "status": dominant_status,
            "road_count": len(roads),
        }

    except requests.RequestException as e:
        log.error(f"{node['id']} 请求失败: {e}")
        return None


def save_to_db(conn, record: dict):
    """将一条路况记录写入 traffic_flow 表"""
    sql = """
        INSERT INTO traffic_flow
            (node_id, collected_at, speed, congestion_status, road_count)
        VALUES
            (%(node_id)s, %(timestamp)s, %(speed)s, %(status)s, %(road_count)s)
    """
    with conn.cursor() as cur:
        cur.execute(sql, record)
    conn.commit()


def collect_once():
    log.info("开始采集...")
    try:
        conn = pymysql.connect(**DB_CONFIG)
    except Exception as e:
        log.error(f"数据库连接失败: {e}")
        return

    success = 0
    successful_records = []

    for node in NODES:
        record = fetch_traffic(node)
        if record:
            try:
                save_to_db(conn, record)
                successful_records.append({
                    'node_id': record['node_id'],
                    'speed': record['speed'],
                    'congestion_status': record['status'],
                    'collected_at': record['timestamp'].isoformat(),
                })
                success += 1
                log.info(f"  {node['id']} speed={record['speed']}km/h status={record['status']}")
            except Exception as e:
                log.error(f"  {node['id']} 写库失败: {e}")
        time.sleep(0.3)

    conn.close()

    # 更新Redis缓存
    if successful_records:
        update_redis_cache(successful_records)

    log.info(f"本轮采集完成 {success}/{len(NODES)} 个路口成功")

def update_redis_cache(records: list):
    """把最新一轮采集结果写入Redis缓存"""
    try:
        import redis as redis_client
        r = redis_client.Redis(host='localhost', port=6379, decode_responses=True)
        cache_data = json.dumps(records, default=str)
        r.setex('traffic:latest', 70, cache_data)
        log.info("Redis缓存已更新")
    except Exception as e:
        log.warning(f"Redis缓存更新失败（不影响采集）: {e}")

def init_table():
    """首次运行时建表（如果表不存在）"""
    create_sql = """
    CREATE TABLE IF NOT EXISTS traffic_flow (
        id            BIGINT AUTO_INCREMENT PRIMARY KEY,
        node_id       VARCHAR(10)    NOT NULL COMMENT '路口编号，如A1',
        collected_at  DATETIME       NOT NULL COMMENT '采集时间',
        speed         FLOAT          NOT NULL COMMENT '平均车速 km/h',
        congestion_status TINYINT    NOT NULL COMMENT '0未知1畅通2缓行3拥堵4严重拥堵',
        road_count    TINYINT        NOT NULL COMMENT '该路口覆盖路段数',
        INDEX idx_node_time (node_id, collected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='实时路况采集表';
    """
    try:
        conn = pymysql.connect(**DB_CONFIG)
        with conn.cursor() as cur:
            cur.execute(create_sql)
        conn.commit()
        conn.close()
        log.info("traffic_flow 表初始化完成")
    except Exception as e:
        log.error(f"建表失败: {e}")
        raise


if __name__ == "__main__":
    init_table()
    collect_once()  # 先跑一次验证

    scheduler = BlockingScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(collect_once, "interval", seconds=INTERVAL_SECONDS)
    log.info(f"调度器启动，每 {INTERVAL_SECONDS} 秒采集一次")
    try:
        scheduler.start()
    except KeyboardInterrupt:
        log.info("采集停止")
