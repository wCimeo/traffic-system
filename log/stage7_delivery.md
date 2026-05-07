# Stage 7 Verification And Delivery

## Current Data Mode

The default local mode is mock traffic:

```env
TRAFFIC_COLLECTION_MODE=mock
TRAFFIC_READ_SOURCE=mock
TRAFFIC_MOCK_TABLE=traffic_flow_mock
MODEL_BUCKET_MINUTES=5
MODEL_WINDOW_SIZE=12
```

Real traffic data remains in `traffic_flow`. Mock data is written to `traffic_flow_mock`.

## Training Dataset

Training data is frozen at:

```text
2026-05-05 05:00:00
```

Verified training artifact:

```text
model/generated/train_20260505050000/summary.json
```

Key values:

```text
rawMaxTime: 2026-05-05 04:59:15
endBucket: 2026-05-05 04:55:00
alignedRowCount: 26928
bucketMinutes: 5
```

## Model Contract

Training metadata and AI service metadata must match:

```text
node_ids: A1,B2,C3,D4,E5,F6,G7,H8,I9,J10,K11
window_size: 12
bucket_minutes: 5
horizon_minutes: 15,30,45,60
horizon_steps: 3,6,9,12
max_val: 65.0
```

Model input is a 12-step window of 5-minute buckets. The model outputs direct multi-horizon predictions for 15, 30, 45, and 60 minutes.

## Startup

Start AI service:

```powershell
conda run -n thesis python ai_service\app.py
```

Start backend:

```powershell
cd backend
npm run dev
```

Start frontend:

```powershell
cd frontend
npm run dev
```

Check backend mode:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

Expected:

```text
traffic_source: mock
traffic_table: traffic_flow_mock
model_bucket_minutes: 5
model_window_size: 12
```

## Mock Collection

Run one mock collection cycle:

```powershell
conda run -n thesis python collector\run_collector.py --once
```

Run continuous mock collection every minute:

```powershell
conda run -n thesis python collector\run_collector.py
```

Backfill mock history:

```powershell
conda run -n thesis python collector\run_collector.py --backfill-hours 18
```

The mock table enforces uniqueness on `(node_id, collected_at)`, so each minute contains one row per node.

Verification SQL:

```powershell
mysql -uroot -p123456 traffic -e "SELECT collected_at, COUNT(*) AS rows_written, COUNT(DISTINCT node_id) AS node_count FROM traffic_flow_mock WHERE collected_at = (SELECT MAX(collected_at) FROM traffic_flow_mock) GROUP BY collected_at;"
```

Expected:

```text
rows_written: 11
node_count: 11
```

## Prediction Flow

Shared model window logic:

```text
backend/src/trafficWindow.ts
```

Shared prediction helpers:

```text
inferPredictionSnapshot()
runPredictionSnapshot()
persistPredictionSnapshot()
```

Consumers:

```text
POST /api/predict/trigger
GET  /api/dashboard/chart
GET  /api/route/outlook
GET  /api/route/decision
GET  /api/report/predict-export
```

`POST /api/predict/trigger` writes 15/30/45/60 minute predictions to `predictions`.

`GET /api/dashboard/chart` reads actual traffic and persisted 15-minute predictions for one node and one date.

`GET /api/route/outlook` runs the same prediction model and returns route scoring, current speed, predicted speed, speed delta, recommendation, and reason.

`GET /api/report/predict-export` uses the same prediction snapshot logic and exports current traffic plus 15/30 minute predictions.

## Useful Verification Commands

Trigger a prediction:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/predict/trigger
```

Dashboard chart:

```powershell
Invoke-RestMethod "http://localhost:3001/api/dashboard/chart?node_id=A1&date=2026-05-07&horizon=15"
```

Route outlook:

```powershell
Invoke-RestMethod "http://localhost:3001/api/route/outlook?node_id=A1&horizons=30,45,60"
```

Prediction export:

```powershell
Invoke-WebRequest "http://localhost:3001/api/report/predict-export?node_id=A1" -UseBasicParsing
```

Backfill prediction history for Dashboard:

```powershell
cd backend
npm run backfill-predictions -- --date=2026-05-07 --table=traffic_flow_mock --clear
```

## Build Checks

Backend:

```powershell
cd backend
npm run build
```

Frontend type check:

```powershell
cd frontend
npx tsc -b
```

Collector syntax:

```powershell
conda run -n thesis python -m py_compile collector\mock_collector.py collector\run_collector.py
```
