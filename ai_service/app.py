from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import torch.nn as nn
import numpy as np
import json
import os

app = Flask(__name__)
CORS(app)

# ─── 模型定义（必须和训练时完全一致）─────────────────────
class GCNLayer(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.weight = nn.Parameter(torch.FloatTensor(in_dim, out_dim))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, x, A):
        return torch.relu(torch.matmul(torch.matmul(A, x), self.weight))

class LSTGCN(nn.Module):
    def __init__(self, num_nodes, in_dim, hidden_dim, out_dim):
        super().__init__()
        self.gcn = GCNLayer(in_dim, hidden_dim)
        self.lstm = nn.LSTM(
            input_size=num_nodes * hidden_dim,
            hidden_size=64,
            num_layers=1,
            batch_first=True
        )
        self.fc = nn.Linear(64, num_nodes * out_dim)
        self.num_nodes = num_nodes
        self.hidden_dim = hidden_dim

    def forward(self, x, A):
        B, T, N, F = x.shape
        gcn_out = []
        for t in range(T):
            out = self.gcn(x[:, t, :, :], A)
            gcn_out.append(out.view(B, -1))
        gcn_out = torch.stack(gcn_out, dim=1)
        lstm_out, _ = self.lstm(gcn_out)
        return self.fc(lstm_out[:, -1, :]).view(B, N, 1)

# ─── 加载权重和元数据 ──────────────────────────────────────
BASE_DIR = os.path.dirname(__file__)
WEIGHT_PATH   = os.path.join(BASE_DIR, 'lst_gcn_weights_10nodes.pth')
METADATA_PATH = os.path.join(BASE_DIR, 'lst_gcn_10nodes_metadata.json')

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

with open(METADATA_PATH, 'r', encoding='utf-8') as f:
    meta = json.load(f)

NODE_IDS    = meta['node_ids']
WINDOW_SIZE = meta['window_size']
HIDDEN_DIM  = meta['hidden_dim']
MAX_VAL     = meta['max_val']
A_matrix    = np.array(meta['adjacency_matrix'], dtype=np.float32)
A_tensor    = torch.FloatTensor(A_matrix).to(device)

model = LSTGCN(
    num_nodes=len(NODE_IDS),
    in_dim=1,
    hidden_dim=HIDDEN_DIM,
    out_dim=1
).to(device)
model.load_state_dict(torch.load(WEIGHT_PATH, map_location=device))
model.eval()
print(f"模型加载完成，节点数: {len(NODE_IDS)}，设备: {device}")

# ─── 推理接口 ──────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    """
    接收最近 window_size 个时间步的速度数据，返回下一步预测。
    请求体格式：
    {
      "window": [
        {"A1": 38.3, "B2": 45.0, ...},  // 最早时间步
        ...
        {"A1": 32.1, "B2": 41.0, ...}   // 最新时间步
      ]
    }
    """
    try:
        body = request.get_json()
        window = body.get('window', [])

        if len(window) != WINDOW_SIZE:
            return jsonify({
                'success': False,
                'error': f'需要 {WINDOW_SIZE} 个时间步，收到 {len(window)} 个'
            }), 400

        # 构建输入张量 (1, T, N, 1)
        arr = np.zeros((WINDOW_SIZE, len(NODE_IDS)), dtype=np.float32)
        for t, step in enumerate(window):
            for i, nid in enumerate(NODE_IDS):
                arr[t, i] = step.get(nid, 0.0)

        arr_norm = arr / MAX_VAL
        x = torch.FloatTensor(arr_norm).unsqueeze(0).unsqueeze(-1).to(device)

        with torch.no_grad():
            pred_norm = model(x, A_tensor)

        pred_raw = pred_norm.squeeze().cpu().numpy() * MAX_VAL
        pred = np.clip(pred_raw, 0, MAX_VAL).tolist()

        result = {nid: round(float(v), 2) for nid, v in zip(NODE_IDS, pred)}
        return jsonify({'success': True, 'predictions': result})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/predict/multistep', methods=['POST'])
def predict_multistep():
    """
    多步预测：自动滚动推理，返回未来 horizon 步的预测结果
    请求体：{ "window": [...12个时间步...], "steps": 2 }
    返回：{ "predictions": [ {节点:速度}, {节点:速度} ] }  # steps个时间步
    """
    try:
        body = request.get_json()
        window = body.get('window', [])
        steps  = int(body.get('steps', 2))  # 默认预测2步=30分钟

        if len(window) != WINDOW_SIZE:
            return jsonify({'success': False,
                'error': f'需要{WINDOW_SIZE}个时间步，收到{len(window)}个'}), 400

        results = []
        current_window = [dict(step) for step in window]

        for _ in range(steps):
            arr = np.zeros((WINDOW_SIZE, len(NODE_IDS)), dtype=np.float32)
            for t, step in enumerate(current_window):
                for i, nid in enumerate(NODE_IDS):
                    arr[t, i] = step.get(nid, 0.0)

            arr_norm = arr / MAX_VAL
            x = torch.FloatTensor(arr_norm).unsqueeze(0).unsqueeze(-1).to(device)

            with torch.no_grad():
                pred_norm = model(x, A_tensor)

            pred_raw = pred_norm.squeeze().cpu().numpy() * MAX_VAL
            pred_clipped = np.clip(pred_raw, 0, MAX_VAL)
            step_result = {nid: round(float(v), 2)
                           for nid, v in zip(NODE_IDS, pred_clipped)}
            results.append(step_result)

            # 滚动窗口：把这步预测结果作为下一步的输入
            current_window = current_window[1:] + [step_result]

        return jsonify({'success': True, 'predictions': results})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'nodes': NODE_IDS})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)