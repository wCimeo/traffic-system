import argparse
import os
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

from mock_collector import collect_once as collect_mock_once, log as mock_log  # noqa: E402


def run_real_once():
    import chengdu_collector_rect

    chengdu_collector_rect.collect_once()


def main():
    parser = argparse.ArgumentParser(description='Traffic collector runner')
    parser.add_argument('--once', action='store_true', help='collect one cycle and exit')
    args = parser.parse_args()

    mode = os.getenv('TRAFFIC_COLLECTION_MODE', 'off').strip().lower()
    real_interval = int(os.getenv('TRAFFIC_REAL_INTERVAL_SECONDS', '300'))
    mock_interval = int(os.getenv('TRAFFIC_MOCK_INTERVAL_SECONDS', '60'))
    real_impl = os.getenv('TRAFFIC_REAL_COLLECTOR', 'rectangle').strip().lower()

    if mode == 'off':
        mock_log.info('collector mode is off, nothing to run')
        return

    if mode == 'real':
        from apscheduler.schedulers.blocking import BlockingScheduler

        if real_impl != 'rectangle':
            raise ValueError(f'Unsupported real collector implementation: {real_impl}')
        if args.once:
            run_real_once()
            return
        scheduler = BlockingScheduler(timezone='Asia/Shanghai')
        scheduler.add_job(run_real_once, 'interval', seconds=real_interval)
        mock_log.info('collector mode=real interval=%ss implementation=%s', real_interval, real_impl)
        scheduler.start()
        return

    if mode == 'mock':
        from apscheduler.schedulers.blocking import BlockingScheduler

        if args.once:
            collect_mock_once()
            return
        scheduler = BlockingScheduler(timezone='Asia/Shanghai')
        scheduler.add_job(collect_mock_once, 'interval', seconds=mock_interval)
        mock_log.info('collector mode=mock interval=%ss table=%s', mock_interval, os.getenv('TRAFFIC_MOCK_TABLE', 'traffic_flow_mock'))
        scheduler.start()
        return

    raise ValueError(f'Unsupported TRAFFIC_COLLECTION_MODE: {mode}')


if __name__ == '__main__':
    main()
