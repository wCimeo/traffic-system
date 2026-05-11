# 智能交通流量监测与预测系统

本项目是一个面向本科毕业设计场景的城市路口级智能交通监测与预测系统。系统围绕 11 个固定交通节点构建，集成了交通数据采集、数据存储、短时速度预测、可视化监控、地图定位、事件调度、路线建议、用户认证与云端部署等功能，形成了从数据进入系统到前端展示与业务决策的完整闭环。

当前系统主体功能已经基本完成，适合用于毕业论文撰写、答辩演示和后续轻量级维护。后续主要工作建议集中在前端展示文案清理、演示数据整理、论文截图和答辩材料准备。

---

## 1. 项目定位

系统目标不是单纯展示地图，而是构建一个可运行、可解释、可部署的交通状态研判平台。

主要能力包括：

- 对 11 个路口节点进行持续交通状态监测
- 基于历史窗口预测未来 `15/30/45/60` 分钟交通速度变化
- 在 Dashboard 中展示全天速度曲线、实时状态和预测趋势
- 在地图中定位路口节点，并根据交通状态进行可视化标注
- 支持事件上报、受理、解决、忽略、重做和删除
- 支持管理员与执行者两类用户身份
- 支持模拟采集器在云端持续运行，保证电脑关闭后系统仍能产生数据
- 支持 Nginx + systemd 云端部署，对外提供 Web 访问

一句话概括：

> 系统通过“真实数据采集 + 模拟数据补充 + LST-GCN 多时域预测 + 前后端可视化业务闭环”，实现了面向城市交通管理场景的短时交通状态监测与辅助决策。

---

## 2. 系统技术框架

### 2.1 总体架构

系统采用前后端分离架构，并额外拆分出 Python AI 推理服务和 Python 数据采集服务。

```text
浏览器前端
  |
  | HTTP / REST API
  v
Nginx
  |
  | /api 反向代理
  v
Node.js Express 后端
  |             |
  |             | HTTP
  |             v
  |        Python Flask AI 服务
  |
  | MySQL / Redis
  v
业务数据库与缓存

Python Collector
  |
  v
traffic_flow / traffic_flow_mock
```

部署后，用户只需要访问前端地址，例如：

```text
http://服务器公网 IP/
```

如果后续配置域名，可以改为：

```text
http://your-domain.com/
```

国内大陆云服务器使用域名正式访问通常需要完成 ICP 备案。

### 2.2 技术选型

前端：

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- Motion
- Lucide React
- 高德地图 JavaScript SDK

后端：

- Node.js
- Express
- TypeScript
- MySQL
- Redis
- Axios
- node-cron
- JWT / session token 认证
- bcryptjs 密码加密

AI 服务：

- Python
- Flask
- PyTorch
- NumPy
- SciPy

数据采集：

- Python
- requests
- PyMySQL
- Redis
- APScheduler

部署运行：

- Ubuntu 22.04 LTS
- Nginx
- systemd
- MySQL 8
- Redis

---

## 3. 目录结构

```text
traffic-system
├── frontend/              # React 前端
├── backend/               # Node.js + Express 后端
├── ai_service/            # Python Flask AI 推理服务
├── collector/             # 真实/模拟交通数据采集器
├── model/                 # 模型训练脚本、训练数据与模型权重
├── deploy/                # 部署说明与服务配置资料
├── README.md              # 项目说明文档
└── .env                   # 本地/云端环境变量，不提交仓库
```

核心文件索引：

- 前端入口：`frontend/src/main.tsx`
- Dashboard 页面：`frontend/src/pages/Dashboard.tsx`
- 地图页面：`frontend/src/pages/MapView.tsx`
- 事件页面：`frontend/src/pages/Incidents.tsx`
- 路线建议页面：`frontend/src/pages/Route.tsx`
- 设置页面：`frontend/src/pages/Settings.tsx`
- 登录页面：`frontend/src/pages/Login.tsx`
- 后端入口：`backend/src/index.ts`
- 认证模块：`backend/src/auth.ts`
- 数据源切换：`backend/src/trafficSource.ts`
- 预测窗口构造：`backend/src/trafficWindow.ts`
- 训练数据冻结：`backend/src/tools/prepareTrainingData.ts`
- 预测回填：`backend/src/tools/backfillPredictions.ts`
- AI 推理服务：`ai_service/app.py`
- 真实采集器：`collector/real_collector.py`
- 模拟采集器：`collector/mock_collector.py`
- 采集器入口：`collector/run_collector.py`
- 模型训练脚本：`model/train_real.py`

---

## 4. 数据来源与数据口径

### 4.1 真实交通数据

真实交通数据来源于高德地图路况接口。系统围绕 11 个固定路口节点采集周边道路交通状态。

真实接口主要提供：

- `speed`：路段速度
- `congestion_status`：拥堵状态
- `road_count`：采样范围内统计到的道路数量

其中 `congestion_status` 沿用高德路况含义：

- `1`：畅通
- `2`：缓行
- `3`：拥堵
- `4`：严重拥堵

### 4.2 为什么使用速度作为预测目标

普通开发者通常无法直接从开放地图 API 获取“路口单位时间车辆数量”。车辆计数通常依赖摄像头、地感线圈、信号机或交管部门专有数据。

本系统采用速度作为交通状态代理变量，原因是：

- 速度能够直接反映道路通行效率
- 速度与交通流密度、拥堵程度存在明显关联
- 许多短时交通预测研究也以速度作为预测对象
- 高德接口能够稳定返回速度字段，工程可实现性更高

论文中可以这样表述：

> 本系统以路段平均速度作为交通状态预测目标。虽然速度并不等同于交通流量，但在交通流理论中，速度、密度和流量之间存在紧密关系。速度下降通常意味着道路通行效率下降和拥堵风险上升，因此速度可作为交通运行状态的有效代理变量。

### 4.3 模拟数据的必要性

由于高德 API 调用额度有限，真实数据存在采样不连续、节点覆盖不均和时间跨度不足的问题。为了保证系统可持续运行和演示效果，项目引入模拟采集器。

模拟采集器不是简单随机数，而是综合考虑：

- 日内时间规律
- 早高峰、午高峰、晚高峰
- 各节点基础速度差异
- 相邻节点联动影响
- 随机扰动
- 可选突发事件扰动
- 历史训练画像

模拟数据写入 `traffic_flow_mock`，真实数据写入 `traffic_flow`。后端通过环境变量决定读取哪张表。

---

## 5. 数据库设计

### 5.1 运行期核心表

`traffic_flow`

- 真实交通采集表
- 保存高德接口采集结果

`traffic_flow_mock`

- 模拟交通采集表
- 字段结构与真实表一致
- 云端持续运行时主要使用该表支撑演示

`predictions`

- 模型预测快照表
- 保存不同节点、不同时域的预测结果

核心字段包括：

- `node_id`
- `predicted_speed`
- `predicted_at`
- `horizon_minutes`
- `target_at`
- `source_table`

`incidents`

- 交通事件表
- 支持事件上报、受理、解决、忽略、重做和删除

核心字段包括：

- `id`
- `node_id`
- `type`
- `description`
- `severity`
- `status`
- `reporter_id`
- `handler_id`
- `handled_at`
- `created_at`
- `updated_at`

`users`

- 用户表
- 支持账号密码登录、邮箱验证码登录、角色管理和会话维护

核心字段包括：

- `id`
- `username`
- `password`
- `email`
- `avatar_url`
- `role`
- `role_id`
- `gender`
- `is_password_set`
- `last_login_time`
- `last_login_ip`
- `session_token`
- `token_expires_at`
- `created_at`
- `updated_at`

### 5.2 训练专用表

`traffic_flow_train_raw`

- 训练冻结后的原始快照

`traffic_flow_train_aligned`

- 按 5 分钟粒度对齐、补全后的训练数据

`training_dataset_versions`

- 保存训练数据版本、冻结时间和摘要信息

### 5.3 用户角色设计

系统角色包括：

- `管理员`
- `执行者`

`role_id` 使用编码方式：

- 管理员：`G0001` 起
- 执行者：`S0001` 起

系统会自动修复历史用户数据中缺失或不规范的 `role_id`。

---

## 6. 交通预测模型

### 6.1 模型类型

当前模型采用 LST-GCN，即 LSTM 与 GCN 结合的时空预测模型。

- GCN 用于建模路口节点之间的空间关联
- LSTM 用于建模速度序列的时间变化
- 输出层一次性预测多个未来时域

训练脚本：

```text
model/train_real.py
```

### 6.2 节点定义

系统统一采用 11 个节点：

```text
A1, B2, C3, D4, E5, F6, G7, H8, I9, J10, K11
```

训练、后端窗口构造、AI 服务推理和前端展示都必须使用同一节点顺序，避免模型输入输出错位。

### 6.3 输入窗口与预测时域

当前模型配置：

- 时间粒度：`5` 分钟
- 输入窗口长度：`12`
- 输入覆盖时长：`60` 分钟
- 预测时域：`15/30/45/60` 分钟
- 对应步长：`3/6/9/12`

也就是说，模型使用最近 1 小时交通状态，预测未来 15 到 60 分钟的速度。

### 6.4 多时域直接预测

系统没有采用单步滚动预测，而是采用多时域直接监督：

```text
输入最近 12 个时间桶 -> 一次输出 15/30/45/60 分钟预测
```

这样可以减少滚动预测中的误差累积，更适合 Dashboard 和 Route 页面直接读取不同未来时域。

### 6.5 当前训练版本

当前真实数据训练冻结版本：

- 版本：`train_20260505050000`
- 原始真实样本量：`5359`
- 原始时间范围：`2026-04-26 17:00:10` 到 `2026-05-05 04:59:15`
- 冻结截止时间：`2026-05-05 05:00:00`
- 对齐后训练行数：`26928`
- 时间桶数量：`2448`
- 节点数：`11`
- 粒度：`5` 分钟

当前测试集指标：

| 预测时域 | MAE | RMSE | MAPE |
| --- | ---: | ---: | ---: |
| 15min | 3.1770 | 4.6180 | 8.7262% |
| 30min | 3.3691 | 4.8239 | 9.1368% |
| 45min | 3.8223 | 5.1951 | 10.4247% |
| 60min | 3.6398 | 5.1076 | 10.0174% |

训练摘要文件：

```text
model/generated/train_20260505050000/summary.json
model/artifacts/train_20260505050000/training_metrics_11nodes.json
model/artifacts/train_20260505050000/lst_gcn_11nodes_metadata.json
```

---

## 7. 后端预测调用机制

预测调用链路如下：

1. 后端从当前数据源读取最新交通数据
2. `trafficWindow.ts` 将数据按 5 分钟粒度聚合
3. 对缺失时间桶进行补齐，形成长度为 12 的输入窗口
4. 后端调用 Python AI 服务 `/predict`
5. AI 服务返回多时域预测结果
6. 后端写入 `predictions` 表
7. Dashboard、Route、导出接口复用预测结果

系统中有两类预测触发方式：

- 定时预测：后端通过 `node-cron` 周期性触发
- 手动触发：前端或接口调用 `/api/predict/trigger`

---

## 8. 页面功能

### 8.1 Login 登录页

文件：

```text
frontend/src/pages/Login.tsx
```

功能：

- 用户名 + 密码登录
- 邮箱验证码登录
- 用户注册
- 图形验证码
- 登录后保存会话 token

认证接口位于：

```text
backend/src/auth.ts
```

### 8.2 Dashboard 首页

文件：

```text
frontend/src/pages/Dashboard.tsx
```

功能：

- 展示 11 个节点当前交通状态
- 展示某节点当天 `00:00-24:00` 速度曲线
- 同图展示实际速度与 15 分钟预测速度
- 标注早高峰、午高峰、晚高峰背景
- 支持图表缩放和日期选择
- 图表标题会同时显示日期、节点编号和路口中文名称，便于截图、汇报和数据核对

最近已经对 Dashboard 数据进行了回填，使当天 00:00 起有较合理的交通速度曲线，避免图表出现异常断裂或视觉错乱。

### 8.3 MapView 地图页

文件：

```text
frontend/src/pages/MapView.tsx
```

功能：

- 高德地图展示 11 个交通节点
- 根据拥堵状态设置节点颜色
- 点击节点查看信息
- 支持从事件页携带 `node` 参数跳转并定位
- 支持全屏查看

### 8.4 Incidents 事件页

文件：

```text
frontend/src/pages/Incidents.tsx
```

功能：

- 事件列表展示
- 状态卡筛选：全部事件、待受理、处理中、已解决、已忽略
- 关键词搜索
- 分页展示
- 用户可选择每页显示 `10/20/50/100` 条
- 页码位于列表右下角
- 上报事件
- 生成事件记录
- 点击节点 ID 跳转地图页
- 管理员更新员工身份信息
- 描述列默认单行截断，点击描述文本可打开完整详情弹窗
- 描述详情弹窗展示完整描述、节点、事件类型、风险、状态、上报时间、上报人 ID 和处理人 ID

事件状态：

- `reported`：待受理
- `active`：处理中
- `resolved`：已解决
- `ignored`：已忽略

事件权限规则：

- 待受理事件：
  - 如果 `handler_id` 为空，所有拥有合法 `role_id` 的用户都可以受理
  - 如果 `handler_id` 为其他用户，当前用户不能受理
  - 如果 `handler_id` 为当前登录用户，当前用户可以受理
- 处理中事件：
  - `handler_id` 必须非空
  - 只有处理人可以点击解决和忽略
  - 其他用户只能看到灰色不可点击按钮
- 已解决事件：
  - 操作按钮显示为重做
  - 只有原处理人可以重做
- 删除事件：
  - 只有管理员可以删除
  - 执行者点击删除时弹窗提示权限不足

数据规范：

- `type` 使用中文事件类型，例如 `交通事故`、`道路施工`、`异常拥堵`、`信号灯故障`、`车辆故障`
- `description` 使用正常中文描述
- 生成的事件记录使用现场上报口吻描述，不再在描述中出现“模拟事件”等标记
- 后端会自动修复历史数据中的乱码描述，并清理旧记录中类似“模拟事件 #...”的尾部标记

### 8.5 Route 路线建议页

文件：

```text
frontend/src/pages/Route.tsx
```

功能：

- 选择路口节点和未来时域
- 查看 30/45/60 分钟预测速度
- 展示速度变化幅度
- 输出通行建议

建议类型：

- 建议通行
- 谨慎通行
- 建议绕行

建议逻辑综合考虑：

- 当前速度
- 预测速度
- 速度下降幅度
- 低速惩罚

### 8.6 Settings 设置页

文件：

```text
frontend/src/pages/Settings.tsx
```

功能：

- 用户资料查看和编辑
- 头像上传
- 密码设置与修改
- 邮箱绑定
- 邮箱验证码
- 历史数据导出
- 预测报表导出
- 预测导出支持选择 `15/30/45/60` 分钟窗口，默认全选，至少保留一个窗口
- 预测导出的 CSV 按“路口 + 预测窗口”生成明细行，包含目标时间、预测速度、速度变化、评分、通行建议和原因说明
- 系统说明展示

---

## 9. 事件业务流程

### 9.1 上报事件

用户填写：

- 路口节点
- 事件类型
- 描述
- 风险等级
- 上报人 ID
- 处理人 ID，可选

后端校验：

- 上报人 ID 必须存在于 `users.role_id`
- 处理人 ID 如果填写，也必须存在于 `users.role_id`
- 新事件默认状态为 `reported`

### 9.2 受理事件

当事件为 `reported`：

- 若 `handler_id` 为空，点击受理后后端自动把当前用户 `role_id` 写入 `handler_id`
- 若 `handler_id` 已指定，则只有指定用户可以受理
- 受理成功后状态变为 `active`

### 9.3 处理事件

当事件为 `active`：

- 只有处理人可以点击解决或忽略
- 点击解决后状态变为 `resolved`
- 点击忽略后状态变为 `ignored`
- 后端记录 `handled_at`

### 9.4 重做事件

当事件为 `resolved`：

- 按钮显示为重做
- 只有原处理人可以点击
- 点击后状态回到 `active`

---

## 10. 后端主要 API

健康检查：

- `GET /api/health`

交通数据：

- `GET /api/traffic/latest`
- `GET /api/traffic/history`

预测：

- `POST /api/predict/trigger`
- `GET /api/predict/latest`
- `GET /api/predict/outlook`

Dashboard：

- `GET /api/dashboard/chart`

Route：

- `GET /api/route/decision`
- `GET /api/route/outlook`

事件：

- `GET /api/incidents`
- `POST /api/incidents`
- `PUT /api/incidents/:id`
- `DELETE /api/incidents/:id`
- `POST /api/incidents/mock-seed`

认证：

- `GET /api/auth/captcha`
- `POST /api/auth/email/send`
- `POST /api/auth/login`
- `POST /api/auth/email-login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `GET /api/auth/users`
- `POST /api/auth/users/:id/role`
- `POST /api/auth/change-password`
- `POST /api/auth/profile`

报表：

- `GET /api/report/export`
- `GET /api/report/predict-export`

预测报表导出参数：

- `node_id`：可选，传入具体节点编号时只导出该路口，传入 `all` 或不传则导出全部节点
- `horizons`：可选，逗号分隔的预测窗口，例如 `15,30,45,60`

预测报表 CSV 字段：

```text
node_id,node_name,generated_at,current_speed_kmh,current_status,current_collected_at,
horizon_minutes,target_at,predicted_speed_kmh,predicted_status,speed_delta_kmh,
score,recommendation,level,reason,model_bucket_minutes
```

---

## 11. 本地运行

### 11.1 前端

```powershell
cd frontend
npm install
npm run dev
```

### 11.2 后端

```powershell
cd backend
npm install
npm run dev
```

### 11.3 AI 服务

```powershell
pip install -r ai_service\requirements.txt
python ai_service\app.py
```

### 11.4 采集器

单次执行：

```powershell
python collector\run_collector.py --once
```

持续运行：

```powershell
python collector\run_collector.py
```

### 11.5 模型训练

冻结训练数据：

```powershell
cd backend
npm run prepare-train-data
```

重新训练：

```powershell
python model\train_real.py
```

---

## 12. 云端部署

当前云端部署方式：

- Ubuntu 22.04 LTS
- MySQL 8
- Redis
- Node.js 20
- Python 3.10
- Nginx
- systemd

systemd 服务：

```text
traffic-backend.service
traffic-ai.service
traffic-collector.service
```

常用命令：

```bash
systemctl status traffic-backend traffic-ai traffic-collector --no-pager
journalctl -u traffic-backend -f
journalctl -u traffic-ai -f
journalctl -u traffic-collector -f
systemctl restart traffic-backend traffic-ai traffic-collector
systemctl reload nginx
```

Nginx 对外暴露：

```text
http://服务器公网 IP/
http://服务器公网 IP/api/health
```

建议安全组长期开放：

```text
22/tcp  SSH
80/tcp  HTTP
443/tcp HTTPS，可选
```

不建议公网直接开放：

```text
3001  后端服务端口
5001  AI 服务端口
3306  MySQL
6379  Redis
```

如果配置域名：

1. 购买域名
2. 完成实名认证
3. 如果服务器位于中国大陆，完成 ICP 备案
4. 添加 A 记录指向服务器公网 IP
5. 修改 Nginx `server_name`
6. 可选配置 HTTPS 证书

---

## 13. 云端代码更新流程

本地修改后：

```powershell
git add .
git commit -m "update feature"
git push
```

云端更新：

```bash
cd /opt/traffic-system
git pull
```

只改前端：

```bash
cd /opt/traffic-system/frontend
npm install
npm run build
systemctl reload nginx
```

只改后端：

```bash
cd /opt/traffic-system/backend
npm install
npm run build
systemctl restart traffic-backend
```

只改 AI 服务：

```bash
systemctl restart traffic-ai
```

只改采集器：

```bash
systemctl restart traffic-collector
```

`.env` 不提交到 GitHub，本地和云端各自保留自己的环境变量。

---

## 14. 重要环境变量

示例：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=traffic_user
DB_PASSWORD=CHANGE_ME
DB_NAME=traffic

PORT=3001
AI_SERVICE_URL=http://127.0.0.1:5001

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

TRAFFIC_REAL_TABLE=traffic_flow
TRAFFIC_MOCK_TABLE=traffic_flow_mock
TRAFFIC_COLLECTION_MODE=mock
TRAFFIC_READ_SOURCE=mock

TRAFFIC_REAL_INTERVAL_SECONDS=300
TRAFFIC_MOCK_INTERVAL_SECONDS=60

MODEL_BUCKET_MINUTES=5
MODEL_WINDOW_SIZE=12
MODEL_WINDOW_LOOKBACK_MINUTES=180

AUTH_DEV_LOG_CODES=false
AUTH_CAPTCHA_RATE_SECONDS=2
```

说明：

- `TRAFFIC_COLLECTION_MODE` 决定采集器写入真实数据还是模拟数据
- `TRAFFIC_READ_SOURCE` 决定后端读取真实表还是模拟表
- `MODEL_BUCKET_MINUTES` 与模型训练粒度一致
- `MODEL_WINDOW_SIZE` 与模型输入窗口长度一致
- `AUTH_DEV_LOG_CODES=false` 时验证码不会打印到控制台，适合生产环境

---

## 15. 数据库迁移与备份

本地导出：

```powershell
mysqldump --host=localhost --user=root --default-character-set=utf8mb4 --single-transaction --routines --triggers --result-file=deploy_backup\traffic_YYYYMMDD.sql traffic
```

云端导入：

```bash
mysql -utraffic_user -p traffic < /home/ubuntu/traffic_YYYYMMDD.sql
```

导入成功后，`.sql` 文件不再是系统运行依赖。该文件可能包含用户、事件、会话和交通数据，不建议提交到仓库，也不建议长期保留在公网服务器用户目录。

---

## 16. 毕业论文可用技术描述

### 16.1 系统设计

本文设计并实现了一个基于 Web 的智能交通流量监测与预测系统。系统采用前后端分离架构，前端负责交通状态可视化与人机交互，后端负责业务接口、数据管理和预测调度，AI 服务负责模型推理，采集服务负责交通数据写入。通过模块化拆分，系统实现了数据采集、数据存储、模型预测、业务处理和可视化展示的解耦。

### 16.2 数据处理

系统针对真实采集数据稀疏、不连续的问题，设计了训练数据冻结与时间桶对齐机制。首先将真实采集数据冻结为可复现的数据版本，再按固定 5 分钟粒度进行对齐和缺失补全，最后形成模型训练所需的时序数据集。该方法能够避免训练数据随线上采集持续变化而产生不可复现问题。

### 16.3 模型方法

系统采用 LST-GCN 模型进行短时交通速度预测。GCN 用于捕捉不同路口节点之间的空间相关性，LSTM 用于捕捉交通速度随时间变化的动态特征。模型以最近 60 分钟的节点速度序列作为输入，直接输出未来 15、30、45、60 分钟的多时域预测结果。

### 16.4 工程实现

系统后端通过 Express 提供 RESTful API，并使用 MySQL 存储交通数据、预测结果、用户信息和事件信息。Redis 用于验证码、限流和实时缓存。前端使用 React 和 TypeScript 构建交互页面，通过 Recharts 展示趋势图，通过高德地图 SDK 展示空间位置，通过事件页面实现交通事件调度流程。云端部署采用 Nginx 反向代理和 systemd 服务托管，保证系统在本地电脑关闭后仍能持续运行。

### 16.5 系统特色

- 真实数据与模拟数据双轨运行
- 统一 11 节点建模与推理
- 多时域直接预测，减少滚动误差
- Dashboard、Route、事件页共用同一套交通数据与预测结果
- 支持云端持续采集、持续预测和公网访问
- 事件处理流程结合用户身份与处理人 ID，具备基本权限约束

---

## 17. 当前完成情况

已经完成：

- 用户登录、注册、验证码、邮箱验证码
- 用户身份管理，支持管理员与执行者
- 交通数据采集与模拟采集
- MySQL 数据存储
- Redis 缓存与限流
- 训练数据冻结与补全
- LST-GCN 多时域预测
- AI 推理服务
- Dashboard 可视化
- 地图节点展示与跳转定位
- Route 路线建议
- Incidents 事件完整流程
- 事件列表搜索、状态筛选和分页
- 事件描述详情弹窗
- 真实化事件记录生成
- 报表导出
- 多时域预测明细导出
- 云服务器部署
- 电脑关闭后云端采集器持续运行

建议收尾事项：

- 手动清理前端仍不适合答辩展示的说明性文字
- 统一论文截图中的数据日期和节点选择
- 配置正式域名与 HTTPS，可选
- 准备答辩演示账号
- 定期备份云端 MySQL 数据

---

## 18. 当前局限与后续优化

当前局限：

- 真实采集数据仍然偏少，部分训练样本依赖补全
- 暂未接入天气、节假日、大型活动等外部因素
- `road_count` 已存储，但暂未作为模型主输入特征
- 普通地图 API 无法直接提供车辆计数，因此系统以速度作为代理变量
- 模拟数据适合演示和工程验证，但不等价于长期真实交通数据

后续优化：

- 延长真实采集周期，提高训练数据真实性
- 将天气、节假日、工作日/周末作为外生变量加入模型
- 将事件数据与预测模型联动
- 增加模型自动重训与权重自动发布机制
- 配置 HTTPS 和正式域名
- 将前端部分说明文字整理为更正式的系统帮助页或论文附录

---

## 19. 演示建议口径

答辩时可以按下面顺序讲：

1. 系统监测 11 个核心路口节点。
2. 数据来源包括高德真实路况数据和模拟采集数据。
3. 由于真实接口额度有限，系统通过模拟采集保证云端持续运行。
4. 训练阶段对真实采集数据进行冻结、对齐和补全，保证模型训练可复现。
5. 模型采用 LST-GCN，同时考虑节点空间关系和时间序列变化。
6. 系统预测未来 15、30、45、60 分钟速度，并将结果用于 Dashboard 和 Route。
7. 事件模块模拟交通管理业务流程，包括上报、受理、解决、忽略和权限控制。
8. 系统已经部署到云服务器，本地电脑关闭后仍可访问和持续采集。

简短版本：

> 本系统以路口速度数据为核心，结合 LST-GCN 模型实现短时交通状态预测，并通过 Web 前端完成地图展示、趋势监测、路线建议和事件调度，形成了一个可部署、可演示、可解释的智能交通监测与预测平台。
