import json
import os
import shutil
from pathlib import Path

os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim

matplotlib.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Arial Unicode MS']
matplotlib.rcParams['axes.unicode_minus'] = False


ROOT_DIR = Path(__file__).resolve().parents[1]
TRAIN_VERSION = os.getenv('TRAIN_VERSION', 'train_20260505050000')
DATA_DIR = ROOT_DIR / 'model' / 'generated' / TRAIN_VERSION
ALIGNED_CSV_PATH = DATA_DIR / 'aligned.csv'
SUMMARY_PATH = DATA_DIR / 'summary.json'
MODEL_OUTPUT_DIR = ROOT_DIR / 'model' / 'artifacts' / TRAIN_VERSION
SERVICE_OUTPUT_DIR = ROOT_DIR / 'ai_service'

NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10', 'K11']
BUCKET_MINUTES = 5
WINDOW_SIZE = 12
HORIZON_MINUTES = [15, 30, 45, 60]
HORIZON_STEPS = [minutes // BUCKET_MINUTES for minutes in HORIZON_MINUTES]
NUM_NODES = len(NODE_IDS)
HIDDEN_DIM = 64
LEARNING_RATE = 0.001
EPOCHS = 140
WEIGHT_DECAY = 1e-4
TRAIN_SPLIT = 0.8
PATIENCE = 20
SEED = 42

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f'training device: {device}')
if torch.cuda.is_available():
    print(f'gpu: {torch.cuda.get_device_name(0)}')

torch.manual_seed(SEED)
np.random.seed(SEED)


class GCNLayer(nn.Module):
    def __init__(self, in_dim: int, out_dim: int):
        super().__init__()
        self.weight = nn.Parameter(torch.empty(in_dim, out_dim))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, x: torch.Tensor, adjacency: torch.Tensor):
        return torch.relu(torch.matmul(torch.matmul(adjacency, x), self.weight))


class MultiHorizonLSTGCN(nn.Module):
    def __init__(self, num_nodes: int, hidden_dim: int, num_horizons: int):
        super().__init__()
        self.gcn = GCNLayer(1, hidden_dim)
        self.lstm = nn.LSTM(
            input_size=num_nodes * hidden_dim,
            hidden_size=hidden_dim,
            num_layers=1,
            batch_first=True,
        )
        self.fc = nn.Linear(hidden_dim, num_nodes * num_horizons)
        self.num_nodes = num_nodes
        self.num_horizons = num_horizons

    def forward(self, x: torch.Tensor, adjacency: torch.Tensor):
        batch_size, seq_len, num_nodes, _ = x.shape
        gcn_outputs = []
        for t in range(seq_len):
            step_out = self.gcn(x[:, t, :, :], adjacency)
            gcn_outputs.append(step_out.reshape(batch_size, num_nodes * step_out.shape[-1]))
        temporal_input = torch.stack(gcn_outputs, dim=1)
        lstm_out, _ = self.lstm(temporal_input)
        projection = self.fc(lstm_out[:, -1, :])
        return projection.view(batch_size, self.num_nodes, self.num_horizons)


def build_adjacency():
    adjacency = np.array([
        [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0],
        [1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0],
        [1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
        [0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0],
        [0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1],
        [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1],
        [0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1],
        [0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1],
    ], dtype=np.float32)
    degree = np.diag(np.sum(adjacency, axis=1))
    normalized = np.linalg.inv(np.sqrt(degree)) @ adjacency @ np.linalg.inv(np.sqrt(degree))
    return adjacency, normalized.astype(np.float32)


def ensure_inputs():
    if not ALIGNED_CSV_PATH.exists():
        raise FileNotFoundError(f'aligned dataset not found: {ALIGNED_CSV_PATH}')
    if not SUMMARY_PATH.exists():
        raise FileNotFoundError(f'summary file not found: {SUMMARY_PATH}')


def load_dataset():
    ensure_inputs()
    df = pd.read_csv(ALIGNED_CSV_PATH)
    df['bucket_time'] = pd.to_datetime(df['bucket_time'])
    pivot = (
        df.pivot_table(index='bucket_time', columns='node_id', values='speed', aggfunc='mean')
        .sort_index()
        .reindex(columns=NODE_IDS)
    )
    if pivot.isnull().any().any():
        raise ValueError('aligned dataset still contains missing values.')

    with open(SUMMARY_PATH, 'r', encoding='utf-8') as handle:
        summary = json.load(handle)

    data = pivot.values.astype(np.float32)
    max_val = float(np.max(data))
    data_norm = data / max_val
    return pivot.index.to_list(), data_norm, max_val, summary


def create_dataset(series: np.ndarray):
    horizon_count = len(HORIZON_STEPS)
    max_horizon = max(HORIZON_STEPS)
    features = []
    targets = []
    for start in range(len(series) - WINDOW_SIZE - max_horizon + 1):
        window = series[start:start + WINDOW_SIZE]
        horizon_targets = []
        for step in HORIZON_STEPS:
            horizon_targets.append(series[start + WINDOW_SIZE + step - 1])
        features.append(window)
        targets.append(np.stack(horizon_targets, axis=-1))
    return np.asarray(features, dtype=np.float32), np.asarray(targets, dtype=np.float32)


def evaluate_predictions(predictions: np.ndarray, actuals: np.ndarray, max_val: float):
    metrics = {}
    pred_raw = predictions * max_val
    actual_raw = actuals * max_val
    for idx, horizon in enumerate(HORIZON_MINUTES):
        pred_slice = pred_raw[:, :, idx]
        actual_slice = actual_raw[:, :, idx]
        mae = float(np.mean(np.abs(actual_slice - pred_slice)))
        rmse = float(np.sqrt(np.mean((actual_slice - pred_slice) ** 2)))
        mape = float(np.mean(np.abs((actual_slice - pred_slice) / np.clip(np.abs(actual_slice), 1e-6, None))) * 100)
        metrics[str(horizon)] = {
            'mae': round(mae, 4),
            'rmse': round(rmse, 4),
            'mape': round(mape, 4),
        }
    return metrics


def save_visuals(train_losses, val_losses, test_predictions, test_actuals, max_val):
    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    node_idx = 0
    horizon_idx = 0
    sample_count = min(120, len(test_predictions))
    pred_curve = test_predictions[:sample_count, node_idx, horizon_idx] * max_val
    actual_curve = test_actuals[:sample_count, node_idx, horizon_idx] * max_val

    fig, axes = plt.subplots(1, 2, figsize=(14, 4))
    axes[0].plot(train_losses, label='Train Loss', color='steelblue')
    axes[0].plot(val_losses, label='Val Loss', color='darkorange')
    axes[0].set_title('Training vs Validation Loss')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('MSE Loss')
    axes[0].legend()

    axes[1].plot(actual_curve, label='Actual A1 (+15 min)', color='royalblue', linewidth=1.8)
    axes[1].plot(pred_curve, label='Predicted A1 (+15 min)', color='tomato', linestyle='--', linewidth=1.8)
    axes[1].set_title(f'A1 direct 15-minute forecast ({sample_count} test samples)')
    axes[1].set_xlabel('Sample Index')
    axes[1].set_ylabel('Speed (km/h)')
    axes[1].legend()

    fig.tight_layout()
    fig.savefig(MODEL_OUTPUT_DIR / 'training_result.png', dpi=150)
    plt.close(fig)


def sync_artifacts(weight_path: Path, metadata_path: Path, metrics_path: Path):
    shutil.copy2(weight_path, SERVICE_OUTPUT_DIR / 'lst_gcn_weights_11nodes.pth')
    shutil.copy2(metadata_path, SERVICE_OUTPUT_DIR / 'lst_gcn_11nodes_metadata.json')
    shutil.copy2(metrics_path, SERVICE_OUTPUT_DIR / 'training_metrics_11nodes.json')


def main():
    _, normalized_data, max_val, summary = load_dataset()
    adjacency_raw, adjacency_normalized = build_adjacency()
    adjacency_tensor = torch.tensor(adjacency_normalized, dtype=torch.float32, device=device)

    x, y = create_dataset(normalized_data)
    split_index = int(len(x) * TRAIN_SPLIT)
    x_train = torch.tensor(x[:split_index], dtype=torch.float32, device=device).unsqueeze(-1)
    y_train = torch.tensor(y[:split_index], dtype=torch.float32, device=device)
    x_test = torch.tensor(x[split_index:], dtype=torch.float32, device=device).unsqueeze(-1)
    y_test = torch.tensor(y[split_index:], dtype=torch.float32, device=device)

    print(f'train samples: {len(x_train)}')
    print(f'test samples: {len(x_test)}')
    print(f'window size: {WINDOW_SIZE} buckets ({WINDOW_SIZE * BUCKET_MINUTES} minutes)')
    print(f'horizon mapping: {dict(zip(HORIZON_MINUTES, HORIZON_STEPS))}')

    model = MultiHorizonLSTGCN(
        num_nodes=NUM_NODES,
        hidden_dim=HIDDEN_DIM,
        num_horizons=len(HORIZON_MINUTES),
    ).to(device)

    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=8, min_lr=1e-5)
    criterion = nn.MSELoss()

    best_state = None
    best_val_loss = float('inf')
    patience_left = PATIENCE
    train_losses = []
    val_losses = []

    for epoch in range(EPOCHS):
        model.train()
        optimizer.zero_grad()
        train_output = model(x_train, adjacency_tensor)
        train_loss = criterion(train_output, y_train)
        train_loss.backward()
        optimizer.step()

        model.eval()
        with torch.no_grad():
          val_output = model(x_test, adjacency_tensor)
          val_loss = criterion(val_output, y_test)

        scheduler.step(val_loss)
        train_losses.append(float(train_loss.item()))
        val_losses.append(float(val_loss.item()))

        if val_loss.item() < best_val_loss:
            best_val_loss = float(val_loss.item())
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            patience_left = PATIENCE
        else:
            patience_left -= 1

        if (epoch + 1) % 10 == 0 or epoch == 0:
            current_lr = optimizer.param_groups[0]['lr']
            print(
                f'epoch {epoch + 1:03d}/{EPOCHS} '
                f'train={train_loss.item():.6f} '
                f'val={val_loss.item():.6f} '
                f'lr={current_lr:.6f}'
            )

        if patience_left <= 0:
            print(f'early stopping at epoch {epoch + 1}')
            break

    if best_state is None:
        raise RuntimeError('training did not produce a valid checkpoint')

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        test_predictions = model(x_test, adjacency_tensor).cpu().numpy()
        test_actuals = y_test.cpu().numpy()

    metrics = evaluate_predictions(test_predictions, test_actuals, max_val)
    metrics['model_selection'] = {
        'strategy': 'direct_multi_horizon_supervision',
        'reason': 'avoid cumulative error from rolling single-step prediction on 30/45/60 minute horizons',
    }
    metrics['dataset'] = {
        'train_version': TRAIN_VERSION,
        'aligned_rows': summary['alignedRowCount'],
        'bucket_minutes': BUCKET_MINUTES,
        'window_size': WINDOW_SIZE,
    }

    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    weight_path = MODEL_OUTPUT_DIR / 'lst_gcn_weights_11nodes.pth'
    metadata_path = MODEL_OUTPUT_DIR / 'lst_gcn_11nodes_metadata.json'
    metrics_path = MODEL_OUTPUT_DIR / 'training_metrics_11nodes.json'

    torch.save(model.state_dict(), weight_path)
    metadata = {
        'model_variant': 'multi_horizon_lstm_gcn',
        'node_ids': NODE_IDS,
        'num_nodes': NUM_NODES,
        'window_size': WINDOW_SIZE,
        'bucket_minutes': BUCKET_MINUTES,
        'horizon_minutes': HORIZON_MINUTES,
        'horizon_steps': HORIZON_STEPS,
        'hidden_dim': HIDDEN_DIM,
        'learning_rate': LEARNING_RATE,
        'epochs': len(train_losses),
        'max_val': max_val,
        'adjacency_matrix': adjacency_raw.tolist(),
        'normalized_adjacency_matrix': adjacency_normalized.tolist(),
        'train_version': TRAIN_VERSION,
    }

    with open(metadata_path, 'w', encoding='utf-8') as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
    with open(metrics_path, 'w', encoding='utf-8') as handle:
        json.dump(metrics, handle, ensure_ascii=False, indent=2)

    save_visuals(train_losses, val_losses, test_predictions, test_actuals, max_val)
    sync_artifacts(weight_path, metadata_path, metrics_path)

    print(f'saved weights: {weight_path}')
    print(f'saved metadata: {metadata_path}')
    print(f'saved metrics: {metrics_path}')
    print('per-horizon metrics:')
    for horizon in HORIZON_MINUTES:
        result = metrics[str(horizon)]
        print(
            f'  +{horizon}min -> '
            f'MAE={result["mae"]:.4f} '
            f'RMSE={result["rmse"]:.4f} '
            f'MAPE={result["mape"]:.4f}%'
        )


if __name__ == '__main__':
    main()
