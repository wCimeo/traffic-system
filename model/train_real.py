import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

"""
LST-GCN 重训练脚本 — 基于高德API真实采集数据
运行环境: 本机 NVIDIA GPU + miniconda thesis 环境
依赖: pip install torch pymysql numpy pandas matplotlib

使用方式:
  python train_real.py

输出:
  model/lst_gcn_weights_10nodes.pth
  model/lst_gcn_10nodes_metadata.json
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import json
import math
from pathlib import Path
from sqlalchemy import create_engine
import matplotlib
matplotlib.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Arial Unicode MS']
matplotlib.rcParams['axes.unicode_minus'] = False

# ==========================================
# 0. 基础配置
# ==========================================
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"当前训练设备: {device}")
if torch.cuda.is_available():
    print(f"GPU型号: {torch.cuda.get_device_name(0)}")

NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10']
num_nodes = len(NODE_IDS)

OUTPUT_DIR = Path('./model')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ==========================================
# 1. 从MySQL读取真实采集数据
# ==========================================
print("正在从MySQL读取真实路况数据...")

import pymysql

DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "123456",
    "database": "traffic",
    "charset": "utf8mb4",
}

try:
    conn = pymysql.connect(**DB_CONFIG)
    query = """
        SELECT node_id, collected_at, speed
        FROM traffic_flow
        ORDER BY collected_at ASC
    """
    engine = create_engine('mysql+pymysql://root:123456@localhost:3306/traffic?charset=utf8mb4')
    df = pd.read_sql(query, engine)
    engine.dispose()
    conn.close()
    print(f"读取到 {len(df)} 条记录，时间范围: {df['collected_at'].min()} ~ {df['collected_at'].max()}")
except Exception as e:
    print(f"数据库连接失败: {e}")
    raise

# ==========================================
# 2. 数据预处理
# ==========================================
df['collected_at'] = pd.to_datetime(df['collected_at'])
df['node_id'] = df['node_id'].astype(str).str.upper().str.strip()
df['speed'] = pd.to_numeric(df['speed'], errors='coerce')
df = df.dropna(subset=['collected_at', 'node_id', 'speed'])
df = df[df['node_id'].isin(NODE_IDS)]

# 按时间戳和节点透视，每个时间步一行，每个节点一列
data_df = (
    df.pivot_table(index='collected_at', columns='node_id', values='speed', aggfunc='mean')
    .sort_index()
    .reindex(columns=NODE_IDS)
)

print(f"透视后数据形状: {data_df.shape}（时间步 × 节点）")
print(f"各节点缺失率:\n{data_df.isnull().mean().round(3)}")

# 插值填充缺失值（高德偶发无数据的情况）
data_df = data_df.interpolate(method='time').ffill().bfill()
data = data_df.values.astype(np.float32)

print(f"填充后数据形状: {data.shape}")
print(f"速度范围: {data.min():.2f} ~ {data.max():.2f} km/h")

# 样本数检查
if len(data) < 50:
    print("WARNING: 数据量过少（<50条），训练结果可能不稳定，建议积累更多数据后重训练")

# 归一化
max_val = float(np.max(data))
data_norm = data / max_val
print(f"归一化最大值（max_val）: {max_val:.4f}")

# ==========================================
# 3. 邻接矩阵（与原脚本一致）
# ==========================================
A = np.array([
    [1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
    [1, 1, 0, 0, 1, 1, 0, 0, 0, 0],
    [1, 0, 1, 1, 0, 0, 1, 0, 0, 0],
    [1, 0, 1, 1, 0, 0, 0, 1, 0, 0],
    [0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    [0, 1, 0, 0, 1, 1, 1, 0, 0, 1],
    [0, 0, 1, 0, 0, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 1, 1, 0],
    [0, 0, 0, 0, 1, 0, 0, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 0, 0, 1, 1],
], dtype=np.float32)

D = np.diag(np.sum(A, axis=1))
D_inv_sqrt = np.linalg.inv(np.sqrt(D))
A_hat = np.dot(np.dot(D_inv_sqrt, A), D_inv_sqrt)
A_hat_tensor = torch.FloatTensor(A_hat).to(device)
print("邻接矩阵构建完成。")

# ==========================================
# 4. 模型定义（与app.py保持完全一致）
# ==========================================
class GCNLayer(nn.Module):
    def __init__(self, in_features, out_features):
        super().__init__()
        self.weight = nn.Parameter(torch.FloatTensor(in_features, out_features))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, x, adj):
        support = torch.matmul(x, self.weight)
        output = torch.matmul(adj, support)
        return torch.relu(output)

class LSTGCN(nn.Module):
    def __init__(self, num_nodes, in_dim, hidden_dim, out_dim):
        super().__init__()
        self.gcn = GCNLayer(in_dim, hidden_dim)
        self.lstm = nn.LSTM(num_nodes * hidden_dim, hidden_dim, batch_first=True)
        self.fc = nn.Linear(hidden_dim, num_nodes * out_dim)
        self.num_nodes = num_nodes

    def forward(self, x, adj):
        batch_size, seq_len, num_nodes = x.shape
        gcn_out = torch.zeros(
            batch_size, seq_len, num_nodes,
            self.gcn.weight.shape[1], device=x.device
        )
        for t in range(seq_len):
            gcn_out[:, t, :, :] = self.gcn(x[:, t, :].unsqueeze(-1), adj)
        lstm_in = gcn_out.view(batch_size, seq_len, -1)
        lstm_out, _ = self.lstm(lstm_in)
        out = self.fc(lstm_out[:, -1, :])
        return out.view(batch_size, num_nodes)

# ==========================================
# 5. 滑动窗口构建数据集
# ==========================================
def create_dataset(data, window_size, horizon):
    X, Y = [], []
    for i in range(len(data) - window_size - horizon):
        X.append(data[i: i + window_size])
        Y.append(data[i + window_size + horizon - 1])
    return torch.FloatTensor(np.array(X)), torch.FloatTensor(np.array(Y))

window_size = 12
horizon = 1

X, Y = create_dataset(data_norm, window_size, horizon)

if len(X) < 20:
    print(f"ERROR: 滑动窗口后样本数仅 {len(X)}，无法训练，请继续积累数据。")
    raise SystemExit

split = int(0.8 * len(X))
X_train, Y_train = X[:split].to(device), Y[:split].to(device)
X_test,  Y_test  = X[split:].to(device),  Y[split:].to(device)

print(f"训练集样本数: {len(X_train)}")
print(f"测试集样本数: {len(X_test)}")

# ==========================================
# 6. 训练
# ==========================================
hidden_dim    = 64
learning_rate = 0.005
epochs        = 100

model     = LSTGCN(num_nodes=num_nodes, in_dim=1, hidden_dim=hidden_dim, out_dim=1).to(device)
criterion = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=learning_rate)

train_losses, test_losses = [], []

print("开始训练 LST-GCN...")
for epoch in range(epochs):
    model.train()
    optimizer.zero_grad()
    outputs = model(X_train, A_hat_tensor)
    loss = criterion(outputs, Y_train)
    loss.backward()
    optimizer.step()

    model.eval()
    with torch.no_grad():
        test_outputs = model(X_test, A_hat_tensor)
        test_loss    = criterion(test_outputs, Y_test)

    train_losses.append(loss.item())
    test_losses.append(test_loss.item())

    if (epoch + 1) % 10 == 0:
        print(f"Epoch [{epoch+1}/{epochs}]  "
              f"Train Loss: {loss.item():.6f}  "
              f"Test Loss: {test_loss.item():.6f}")

# ==========================================
# 7. 保存权重与元数据
# ==========================================
weight_path   = OUTPUT_DIR / 'lst_gcn_weights_10nodes.pth'
metadata_path = OUTPUT_DIR / 'lst_gcn_10nodes_metadata.json'

torch.save(model.state_dict(), weight_path)

metadata = {
    'node_ids':         NODE_IDS,
    'window_size':      window_size,
    'horizon':          horizon,
    'hidden_dim':       hidden_dim,
    'learning_rate':    learning_rate,
    'epochs':           epochs,
    'max_val':          max_val,
    'adjacency_matrix': A.tolist(),
}
with open(metadata_path, 'w', encoding='utf-8') as f:
    json.dump(metadata, f, ensure_ascii=False, indent=2)

print(f"\n权重已保存: {weight_path}")
print(f"元数据已保存: {metadata_path}")

# ==========================================
# 8. 评估
# ==========================================
model.eval()
with torch.no_grad():
    preds   = model(X_test, A_hat_tensor).cpu().numpy() * max_val
    actuals = Y_test.cpu().numpy() * max_val

mae  = np.mean(np.abs(actuals - preds))
rmse = np.sqrt(np.mean((actuals - preds) ** 2))
mape = np.mean(np.abs((actuals - preds) / np.maximum(np.abs(actuals), 1e-6))) * 100

print(f"\n评估结果（测试集）:")
print(f"  MAE  : {mae:.4f} km/h")
print(f"  RMSE : {rmse:.4f} km/h")
print(f"  MAPE : {mape:.4f}%")

# ==========================================
# 9. 可视化
# ==========================================
plt.figure(figsize=(12, 4))

plt.subplot(1, 2, 1)
plt.plot(train_losses, label='Train Loss')
plt.plot(test_losses,  label='Test Loss')
plt.title('Training Loss')
plt.xlabel('Epoch')
plt.ylabel('MSE Loss')
plt.legend()

plt.subplot(1, 2, 2)
plt.plot(actuals[:50, 0], label='实际车速 (A1)', color='blue')
plt.plot(preds[:50,   0], label='预测车速 (A1)', color='red', linestyle='dashed')
plt.title('预测 vs 实际 (节点A1，前50样本)')
plt.xlabel('样本序号')
plt.ylabel('车速 km/h')
plt.legend()

plt.tight_layout()
plt.savefig(str(OUTPUT_DIR / 'training_result.png'), dpi=150)
plt.show()
print("\n训练完成，图表已保存到 model/training_result.png")
print("\n下一步: 将 model/ 目录下的两个文件复制到 ai_service/ 目录，重启 Flask 服务。")
