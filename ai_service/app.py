from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os

import numpy as np
import torch
import torch.nn as nn

app = Flask(__name__)
CORS(app)


class GCNLayer(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.weight = nn.Parameter(torch.FloatTensor(in_dim, out_dim))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, x, adjacency):
        return torch.relu(torch.matmul(torch.matmul(adjacency, x), self.weight))


class MultiHorizonLSTGCN(nn.Module):
    def __init__(self, num_nodes, in_dim, hidden_dim, out_dim):
        super().__init__()
        self.gcn = GCNLayer(in_dim, hidden_dim)
        self.lstm = nn.LSTM(
            input_size=num_nodes * hidden_dim,
            hidden_size=hidden_dim,
            num_layers=1,
            batch_first=True,
        )
        self.fc = nn.Linear(hidden_dim, num_nodes * out_dim)
        self.num_nodes = num_nodes
        self.out_dim = out_dim

    def forward(self, x, adjacency):
        batch_size, seq_len, num_nodes, _ = x.shape
        gcn_out = []
        for t in range(seq_len):
            out = self.gcn(x[:, t, :, :], adjacency)
            gcn_out.append(out.view(batch_size, -1))
        gcn_out = torch.stack(gcn_out, dim=1)
        lstm_out, _ = self.lstm(gcn_out)
        projection = self.fc(lstm_out[:, -1, :])
        return projection.view(batch_size, num_nodes, self.out_dim)


BASE_DIR = os.path.dirname(__file__)
WEIGHT_PATH = os.path.join(BASE_DIR, 'lst_gcn_weights_11nodes.pth')
METADATA_PATH = os.path.join(BASE_DIR, 'lst_gcn_11nodes_metadata.json')
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

with open(METADATA_PATH, 'r', encoding='utf-8') as handle:
    meta = json.load(handle)

NODE_IDS = meta['node_ids']
WINDOW_SIZE = meta['window_size']
HORIZON_MINUTES = meta.get('horizon_minutes', [15])
HORIZON_STEPS = meta.get('horizon_steps', [1])
HIDDEN_DIM = meta['hidden_dim']
MAX_VAL = meta['max_val']

adjacency_source = meta.get('normalized_adjacency_matrix') or meta['adjacency_matrix']
adjacency_matrix = np.array(adjacency_source, dtype=np.float32)
adjacency_tensor = torch.FloatTensor(adjacency_matrix).to(device)

model = MultiHorizonLSTGCN(
    num_nodes=len(NODE_IDS),
    in_dim=1,
    hidden_dim=HIDDEN_DIM,
    out_dim=len(HORIZON_MINUTES),
).to(device)
model.load_state_dict(torch.load(WEIGHT_PATH, map_location=device))
model.eval()

print(
    f"model ready: nodes={len(NODE_IDS)} "
    f"window={WINDOW_SIZE} buckets "
    f"horizons={HORIZON_MINUTES} minutes "
    f"device={device}"
)


def normalize_window(window):
    arr = np.zeros((WINDOW_SIZE, len(NODE_IDS)), dtype=np.float32)
    for t, step in enumerate(window):
        for i, node_id in enumerate(NODE_IDS):
            arr[t, i] = float(step.get(node_id, 0.0))
    arr_norm = arr / MAX_VAL
    return torch.FloatTensor(arr_norm).unsqueeze(0).unsqueeze(-1).to(device)


def predict_all_horizons(window):
    if len(window) != WINDOW_SIZE:
        raise ValueError(f'expected {WINDOW_SIZE} time steps, received {len(window)}')

    x = normalize_window(window)
    with torch.no_grad():
        pred_norm = model(x, adjacency_tensor)

    pred_raw = pred_norm.squeeze(0).cpu().numpy() * MAX_VAL
    pred_raw = np.clip(pred_raw, 0, MAX_VAL)

    results = []
    for horizon_index, minutes in enumerate(HORIZON_MINUTES):
        step_result = {
            node_id: round(float(pred_raw[node_index, horizon_index]), 2)
            for node_index, node_id in enumerate(NODE_IDS)
        }
        results.append({
            'minutes': minutes,
            'predictions': step_result,
        })
    return results


@app.route('/predict', methods=['POST'])
def predict():
    try:
        body = request.get_json() or {}
        window = body.get('window', [])
        all_predictions = predict_all_horizons(window)
        primary = all_predictions[0]
        return jsonify({
            'success': True,
            'predictions': primary['predictions'],
            'primary_horizon_minutes': primary['minutes'],
            'multi_horizon_predictions': all_predictions,
            'horizon_minutes': HORIZON_MINUTES,
        })
    except Exception as error:
        return jsonify({'success': False, 'error': str(error)}), 500


@app.route('/predict/multistep', methods=['POST'])
def predict_multistep():
    try:
        body = request.get_json() or {}
        window = body.get('window', [])
        steps = int(body.get('steps', len(HORIZON_MINUTES)))
        if steps <= 0:
            return jsonify({'success': False, 'error': 'steps must be positive'}), 400

        all_predictions = predict_all_horizons(window)
        if steps > len(all_predictions):
            return jsonify({
                'success': False,
                'error': f'max supported steps is {len(all_predictions)} for horizons {HORIZON_MINUTES}',
            }), 400

        selected = all_predictions[:steps]
        return jsonify({
            'success': True,
            'predictions': [item['predictions'] for item in selected],
            'horizon_minutes': [item['minutes'] for item in selected],
        })
    except Exception as error:
        return jsonify({'success': False, 'error': str(error)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'nodes': NODE_IDS,
        'window_size': WINDOW_SIZE,
        'horizon_minutes': HORIZON_MINUTES,
    })


if __name__ == '__main__':
    port = int(os.getenv('AI_SERVICE_PORT', '5001'))
    host = os.getenv('AI_SERVICE_HOST', '0.0.0.0')
    app.run(host=host, port=port, debug=False)
