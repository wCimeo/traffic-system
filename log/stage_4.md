这一阶段已经把“预测接口层”整理成了统一语义，并且做了真实联调验证。现在后端已经能稳定区分：

什么接口负责“触发并写库”
什么接口负责“读最新预测快照”
什么接口直接给 Dashboard 图表
什么接口直接给 Route 多时域建议
这次完成了什么

统一了节点集合来源
后端现在仍然只使用一份 NODE_IDS / NODES_META，并通过 index.ts 对外暴露 /api/nodes。
返回里还补了 meta.node_ids 和 meta.count，避免以后 10/11 节点再分叉。

给 predictions 表补齐了时间语义
在 index.ts 里新增了 ensurePredictionsTableMigration()，会自动补这些列：

horizon_minutes
target_at
source_table
model_bucket_minutes
这样现在一条预测记录不再只是“某节点某时刻预测了个速度”，而是明确包含：

预测生成时间：predicted_at
预测目标时间：target_at
预测时域：horizon_minutes
来源数据表：source_table
统一了预测写库逻辑
新增了几组 helper，在 index.ts：
normalizePredictionPayload()
persistPredictionSnapshot()
inferPredictionSnapshot()
runPredictionSnapshot()
现在：

inferPredictionSnapshot()：只推理，不写库
runPredictionSnapshot()：推理后写库
这样职责已经分开了，后面不会再出现“读接口顺手污染 predictions 表”的情况。

明确了接口职责
现在这几个接口已经各自稳定下来：
POST /api/predict/trigger
职责：用当前数据源构造模型窗口，触发一次多时域预测，并把 15/30/45/60 全部写入 predictions 表。

GET /api/predict/latest?horizon=15
职责：读取“某个 horizon 最新一轮”的全节点预测快照。
它现在只读取“有完整 target_at 语义”的新记录，自动避开旧结构脏数据。

GET /api/predict/outlook?node_id=A1
职责：读取某个节点最新一轮的 15/30/45/60 全时域预测。

GET /api/dashboard/chart?node_id=A1&date=2026-05-07&horizon=15
职责：专门给 Dashboard 图表用。返回：

actual_series
predicted_series
meta
这样前端不需要自己拼“历史 + 预测”。
GET /api/route/outlook?node_id=A1&horizons=30,45,60
职责：给 Route 页面返回某节点 30/45/60 分钟预测建议，包含：

predicted_speed
recommendation
level
generated_at
target_at
lead_minutes
GET /api/route/decision?node_id=A1&horizon=30
职责：保留兼容单个 horizon 的旧接口，但内部已经走新的推理语义。

明确了“预测时间语义”
现在系统里这几个时间含义已经固定：
predicted_at：预测生成时间
target_at：预测目标时间
horizon_minutes：预测领先分钟数
lead_minutes：前端可直接用来表达“是否领先真实 15 分钟/30 分钟/45 分钟/60 分钟”
对于 Dashboard 的 15min 预测，接口已经明确返回：

is_leading_actual: true
lead_minutes: 15
新增了专门图表接口
这一步已经做了，不需要前端再自己从 /traffic/history 和 /predict/latest 硬拼。
接口是：
dashboard chart endpoint

AI 服务地址也配置化了
后端现在支持通过 AI_SERVICE_URL 指向不同 Flask 服务。
这次联调我就是靠这个，把新 ai_service 放到隔离端口验证的。
关键修改在 index.ts 附近。

另外我还让 Flask 服务支持通过环境变量改端口，改动在 app.py。

前端 API 层预埋好了新方法
我在 api.ts 里加了这些语义化调用：
fetchNodes
fetchLatestTraffic
fetchTrafficHistory
triggerPrediction
fetchLatestPrediction
fetchPredictionOutlook
fetchDashboardChart
fetchRouteOutlook
这样阶段5/6改页面时不用再手写 URL。

闭环验证结果

我做了两轮验证。

第一轮发现了一个真实问题：

机器上 3001 和 5001 已经有旧服务在跑
旧 Flask 只会返回单 horizon
旧 predictions 表里还有没有 target_at 的历史记录
我没有绕过去，而是继续修到了可验证为止。

第二轮我做了隔离联调：

新 ai_service 跑在 5011
新 backend 跑在 3011
backend 用 AI_SERVICE_URL=http://127.0.0.1:5011
验证结果通过：

/api/health 正确返回
traffic_source
traffic_table
model_bucket_minutes
model_window_size
ai_service_url
POST /api/predict/trigger 正确返回了四个 horizon
15
30
45
60
GET /api/predict/latest?horizon=15
正确返回 11 个节点的最新 15 分钟预测快照，并且包含：
predicted_at
target_at
horizon_minutes
GET /api/predict/outlook?node_id=A1
正确返回 A1 的 15/30/45/60 四个时域预测。
GET /api/route/outlook?node_id=A1&horizons=30,45,60
正确返回三条 Route 建议，并带：
predicted_speed
recommendation
level
generated_at
target_at
GET /api/dashboard/chart?...
正确返回：
actual_series
predicted_series
meta
一个你需要知道的兼容处理

因为数据库里已经有阶段4之前写入的旧预测记录，它们没有 target_at。
所以我让新的“latest/outlook”查询只消费 target_at IS NOT NULL 的新记录。这样旧数据不会再混进新接口结果里。

本阶段涉及的核心文件

后端：

index.ts
trafficSource.ts
trafficWindow.ts
AI 服务：

app.py
前端 API：

api.ts
验证时的一个残留说明

前端整体 build 还是会被之前就存在的未使用变量拦住，问题仍在：

Dashboard.tsx
Login.tsx
这不是阶段4新增问题，但阶段5做 Dashboard 改造时我会顺手一起清掉。

你现在可以做一次 git 提交
阶段4已经适合作为稳定节点保存。