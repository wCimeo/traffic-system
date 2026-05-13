"""
成都10路口实时路况采集脚本 — 矩形区域接口版
每次采集只消耗1次API配额（原圆形接口每次消耗10次）

依赖：pip install requests pymysql apscheduler redis
与 chengdu_collector.py 并行运行，数据写入同一张 traffic_flow 表
"""

import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

import time
import json
import logging
import requests
import pymysql
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from pathlib import Path


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

# ─── 配置区 ────────────────────────────────────────────────
AMAP_KEY = os.getenv('AMAP_KEY', '').strip()
REAL_TABLE = os.getenv('TRAFFIC_REAL_TABLE', 'traffic_flow')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))

DB_CONFIG = {
    "host": os.getenv('DB_HOST', 'localhost'),
    "port": int(os.getenv('DB_PORT', '3306')),
    "user": os.getenv('DB_USER', 'root'),
    "password": os.getenv('DB_PASSWORD', '123456'),
    "database": os.getenv('DB_NAME', 'traffic'),
    "charset": "utf8mb4",
}

INTERVAL_SECONDS = int(os.getenv('TRAFFIC_REAL_INTERVAL_SECONDS', '300'))

# 两个矩形区域，每个对角线控制在10公里以内
RECTANGLES = [
    "104.040,30.535;104.090,30.620",  # 区域一：天府新区核心8个路口
    "104.120,30.620;104.145,30.685",  # 区域二：C3成华大道 + J10东站
]

RECTANGLES = [
    # 单个矩形对角线尽量控制在约 10km 内，避免高德返回 INVALID_PARAMS / 20000。
    "104.040,30.535;104.090,30.580",  # 天府新区南段：A1/B2/E5/G7
    "104.040,30.580;104.090,30.620",  # 天府新区北段：D4/F6/H8/I9
    "104.120,30.620;104.145,30.685",  # 成华大道 + 东站：C3/J10
]

RECTANGLES = [
    "104.040,30.535;104.090,30.580",
    "104.040,30.580;104.090,30.625",
    "104.120,30.620;104.145,30.685",
]

MATCH_THRESHOLD = 0.015
# ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [RECT] %(message)s"
)
log = logging.getLogger(__name__)

NODES = [
    {"id": "A1",  "name": "天府大道-锦城大道路口",     "lng": 104.069093, "lat": 30.575761},
    {"id": "B2",  "name": "益州大道-锦城大道路口",     "lng": 104.059806, "lat": 30.574761},
    {"id": "C3",  "name": "成华大道-杉板桥路口",       "lng": 104.136395, "lat": 30.673074},
    {"id": "D4",  "name": "天府大道-华阳立交路口",     "lng": 104.067643, "lat": 30.598064},
    {"id": "E5",  "name": "剑南大道-锦城大道路口",     "lng": 104.047516, "lat": 30.575108},
    {"id": "F6",  "name": "益州大道-府城大道路口",     "lng": 104.060269, "lat": 30.589527},
    {"id": "G7",  "name": "天府三街-天府大道路口",     "lng": 104.069204, "lat": 30.546203},
    {"id": "H8",  "name": "科华南路-锦尚西二路路口",   "lng": 104.078500, "lat": 30.589200},
    {"id": "I9",  "name": "中环路火车南站-科华南路口", "lng": 104.077952, "lat": 30.608579},
    {"id": "J10", "name": "东站西广场-邛崃山路路口",   "lng": 104.135600, "lat": 30.629800},
]


NODES.append({"id": "K11", "name": "人民南路四段", "lng": 104.066986, "lat": 30.6194897})


def fetch_rectangle_traffic() -> list:
    """
    分两个矩形区域请求，合并路段数据返回。
    每次采集消耗2次API配额。
    """
    if not AMAP_KEY:
        log.error("AMAP_KEY 未配置，无法启动真实路况采集")
        return []

    all_roads = []
    for rect in RECTANGLES:
        url = "https://restapi.amap.com/v3/traffic/status/rectangle"
        params = {
            "key": AMAP_KEY,
            "rectangle": rect,
            "level": 6,
            "extensions": "all",
        }
        try:
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            if data.get("status") != "1":
                log.warning(f"矩形{rect}返回异常: {data.get('info')} / {data.get('infocode')}")
                continue

            roads = data.get("trafficinfo", {}).get("roads", [])
            log.info(f"矩形{rect}返回{len(roads)}条路段")
            # 临时调试：打印前5条路段的名称和polyline起点
            # for r in roads[:5]:
            #     pl = r.get("polyline", "")
            #     first_point = pl.split(";")[0] if pl else "无"
            #     log.info(f"  路段: {r.get('name','无名')} | 起点: {first_point} | 速度: {r.get('speed')}")
            all_roads.extend(roads)
            time.sleep(0.3)

        except requests.RequestException as e:
            log.error(f"矩形{rect}请求失败: {e}")

    log.info(f"两个矩形合计返回{len(all_roads)}条路段")
    return all_roads


def parse_polyline(polyline: str) -> list:
    """解析高德polyline字段，返回坐标点列表 [(lng, lat), ...]"""
    points = []
    for p in polyline.split(";"):
        parts = p.strip().split(",")
        if len(parts) == 2:
            try:
                points.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
    return points


def point_to_node_dist(lng: float, lat: float, node: dict) -> float:
    """计算一个坐标点到路口节点的欧式距离（度）"""
    return ((lng - node["lng"]) ** 2 + (lat - node["lat"]) ** 2) ** 0.5


def match_roads_to_nodes(roads: list) -> dict:
    """
    将矩形接口返回的路段数据匹配到最近的路口节点。
    每个节点找距离最近的路段，取该路段的速度和状态。
    返回：{node_id: {"speed": float, "status": int}}
    """
    result = {}

    for node in NODES:
        best_road  = None
        best_dist  = float('inf')

        for road in roads:
            polyline = road.get("polyline", "")
            if not polyline:
                continue

            points = parse_polyline(polyline)
            if not points:
                continue

            for (r_lng, r_lat) in points:
                dist = point_to_node_dist(r_lng, r_lat, node)
                if dist < best_dist:
                    best_dist = dist
                    best_road = road

        if best_road and best_dist < MATCH_THRESHOLD:
            try:
                speed  = float(best_road.get("speed", 0))
                status = int(best_road.get("status", 0))
            except (ValueError, TypeError):
                speed, status = 0.0, 0

            result[node["id"]] = {
                "speed":  round(speed, 2),
                "status": status,
                "dist":   round(best_dist, 5),
            }
        else:
            log.warning(
                f"{node['id']} 未匹配到路段"
                f"（最近距离={best_dist:.4f}度，阈值={MATCH_THRESHOLD}度）"
            )

    return result


def save_to_db(conn, record: dict):
    sql = f"""
        INSERT INTO `{REAL_TABLE}`
            (node_id, collected_at, speed, congestion_status, road_count)
        VALUES
            (%(node_id)s, %(timestamp)s, %(speed)s, %(status)s, %(road_count)s)
    """
    with conn.cursor() as cur:
        cur.execute(sql, record)
    conn.commit()


def update_redis_cache(records: list):
    try:
        import redis as redis_client
        r = redis_client.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        cache_data = json.dumps(records, default=str)
        r.setex('traffic:latest', 70, cache_data)
        log.info("Redis缓存已更新")
    except Exception as e:
        log.warning(f"Redis缓存更新失败（不影响采集）: {e}")


def init_table():
    create_sql = f"""
    CREATE TABLE IF NOT EXISTS `{REAL_TABLE}` (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        node_id VARCHAR(10) NOT NULL,
        collected_at DATETIME NOT NULL,
        speed FLOAT NOT NULL,
        congestion_status TINYINT NOT NULL,
        road_count TINYINT NOT NULL,
        INDEX idx_node_time (node_id, collected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """
    conn = pymysql.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute(create_sql)
        conn.commit()
    finally:
        conn.close()


def collect_once():
    """一次采集：1次API请求，匹配10个路口，写入数据库"""
    log.info("开始采集（矩形接口，本次消耗1次配额）...")

    roads = fetch_rectangle_traffic()
    if not roads:
        log.error("矩形接口无数据，本轮跳过")
        return

    matched = match_roads_to_nodes(roads)

    if not matched:
        log.error("所有节点均未匹配到路段，本轮跳过")
        return

    try:
        conn = pymysql.connect(**DB_CONFIG)
    except Exception as e:
        log.error(f"数据库连接失败: {e}")
        return

    success = 0
    successful_records = []
    now = datetime.now()

    for node in NODES:
        nid = node["id"]
        if nid not in matched:
            continue

        record = {
            "node_id":   nid,
            "timestamp": now,
            "speed":     matched[nid]["speed"],
            "status":    matched[nid]["status"],
            "road_count": 1,
        }

        try:
            save_to_db(conn, record)
            successful_records.append({
                "node_id":           nid,
                "speed":             record["speed"],
                "congestion_status": record["status"],
                "collected_at":      now.isoformat(),
            })
            success += 1
            log.info(
                f"  {nid} speed={record['speed']}km/h "
                f"status={record['status']} "
                f"dist={matched[nid]['dist']}度"
            )
        except Exception as e:
            log.error(f"  {nid} 写库失败: {e}")

    conn.close()

    if successful_records:
        update_redis_cache(successful_records)

    log.info(f"本轮采集完成 {success}/{len(NODES)} 个路口成功")


if __name__ == "__main__":
    init_table()
    # 先跑一次验证
    collect_once()

    scheduler = BlockingScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(collect_once, "interval", seconds=INTERVAL_SECONDS)
    log.info(f"矩形采集调度器启动，每{INTERVAL_SECONDS}秒采集一次（每天消耗约{86400 // INTERVAL_SECONDS * 2}次配额）")
    try:
        scheduler.start()
    except KeyboardInterrupt:
        log.info("采集停止")
