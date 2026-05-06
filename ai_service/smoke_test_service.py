import json
from pathlib import Path

import pandas as pd

from app import NODE_IDS, WINDOW_SIZE, app


def build_window():
    csv_path = Path(__file__).resolve().parents[1] / 'model' / 'generated' / 'train_20260505050000' / 'aligned.csv'
    frame = pd.read_csv(csv_path)
    frame['bucket_time'] = pd.to_datetime(frame['bucket_time'])
    pivot = (
        frame.pivot_table(index='bucket_time', columns='node_id', values='speed', aggfunc='mean')
        .sort_index()
        .reindex(columns=NODE_IDS)
    )
    window_frame = pivot.iloc[:WINDOW_SIZE]
    return [
        {node_id: float(row[node_id]) for node_id in NODE_IDS}
        for _, row in window_frame.iterrows()
    ]


def main():
    window = build_window()
    client = app.test_client()

    single_response = client.post('/predict', json={'window': window})
    multi_response = client.post('/predict/multistep', json={'window': window, 'steps': 4})

    print('single_status', single_response.status_code)
    print(json.dumps(single_response.get_json(), ensure_ascii=False, indent=2))
    print('multi_status', multi_response.status_code)
    print(json.dumps(multi_response.get_json(), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
