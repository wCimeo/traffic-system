# 智能交通流量监测与预测系统

本项目是一个面向城市路口级交通态势监测、预测与演示汇报的全栈系统。系统围绕 11 个核心路口节点构建，完成了“采集/生成数据 -> 数据冻结与补全 -> 模型训练 -> 预测服务 -> 可视化展示 -> 事件上报与路线建议”的完整闭环。

当前仓库已经完成以下核心能力：

- 11 节点统一建模与统一推理，节点为 `A1` 到 `K11`
- 真实采集表与模拟采集表并存，可通过 `.env` 切换数据源
- 训练集冻结到固定截止时间，避免训练数据持续漂移
- LST-GCN 多时域直接监督训练，支持 `15/30/45/60` 分钟预测
- Dashboard、Route、预测导出接口共用同一套预测逻辑
- 登录、图形验证码、邮箱验证码、事件上报、地图聚焦、报表导出均已打通

---

## 1. 项目目标

系统目标不是单纯展示地图，而是构建一个可以解释、可以演示、可以持续迭代的数据驱动交通研判平台：

- 对重点路口进行持续交通状态监测
- 通过历史与实时数据预测未来短时速度变化
- 为调度人员提供事件记录、地图定位、趋势图表和通行建议
- 在真实数据不足的情况下，利用模拟数据维持系统运行与前端演示

---

## 2. 数据来源与口径说明

### 2.1 真实数据来源

真实交通数据来源于高德地图路况接口，采集对象是 11 个固定路口节点周边的道路通行状态。高德 API 能直接提供的是：

- 路段速度 `speed`
- 拥堵状态 `congestion_status`
- 路段空间覆盖信息，可进一步统计为 `road_count`

地图展示同样基于高德地图 JavaScript SDK，前端地图页为 [frontend/src/pages/MapView.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\MapView.tsx)。

### 2.2 当前真实采集数据时间范围

训练冻结前的真实采集数据已经确认如下：

- 真实采集表：`traffic_flow`
- 原始样本量：`5359` 条
- 原始时间范围：`2026-04-26 17:00:10` 到 `2026-05-05 04:59:15`
- 训练冻结截止时间：`2026-05-05 05:00:00`

对应冻结摘要见 [summary.json](D:\Projects\VS_Code\traffic-system\model\generated\train_20260505050000\summary.json)。

### 2.3 采集频率说明

这里有两个层面的口径，需要区分：

- 代码当前真实采集器默认频率由 `.env` 中 `TRAFFIC_REAL_INTERVAL_SECONDS` 控制，生产样例默认是 `300` 秒，也就是 5 分钟一次
- 模拟采集器默认频率由 `TRAFFIC_MOCK_INTERVAL_SECONDS` 控制，当前默认是 `60` 秒，也就是 1 分钟一次

如果是项目答辩或演示口径，你要求的表述可以写成：

> 演示中可说明“11 个路口的真实交通流量数据按 15 分钟粒度进行采集展示；预测数据与后续动态数据由系统自定义策略生成，用于补充训练与演示链路”。

这句话适合汇报，但需要明确：它是“演示表达口径”，不是当前仓库默认运行参数。当前仓库实际运行频率仍以 `.env` 配置为准。

### 2.4 为什么需要模拟数据

高德 API 调用额度有限，无法支撑“全天候、1 分钟级、长周期”持续采集。结果就是：

- 真实采集时间不连续
- 数据跨度不足
- 11 个节点的时空覆盖不均匀
- 直接训练会让模型学习效果很差

因此系统引入了两套补偿机制：

1. 训练前先做“冻结 + 对齐 + 补全”，产出训练专用数据集
2. 在线运行时新增模拟采集器，持续向 `traffic_flow_mock` 写入 11 个节点的新记录

---

## 3. 数据表与数据流闭环

### 3.1 运行期核心表

- `traffic_flow`
  - 真实采集表
  - 保留原始真实数据，不直接污染
- `traffic_flow_mock`
  - 模拟采集表
  - 结构与真实表一致
  - 用于无 API 或高频演示场景
- `predictions`
  - 保存每次预测快照
  - 包含 `node_id`、`predicted_speed`、`predicted_at`、`horizon_minutes`、`target_at`、`source_table`
- `incidents`
  - 事件上报与处理表
- `users`
  - 用户登录、会话、角色与安全信息表

### 3.2 训练专用表

- `traffic_flow_train_raw`
  - 冻结后的训练原始快照
- `traffic_flow_train_aligned`
  - 按 5 分钟粒度对齐后的训练集
- `training_dataset_versions`
  - 冻结版本与摘要元信息

### 3.3 数据闭环

完整数据流程如下：

1. 真实采集器或模拟采集器写入 `traffic_flow` / `traffic_flow_mock`
2. 后端根据配置读取当前启用的数据源
3. 训练阶段使用 `prepareTrainingData.ts` 冻结真实数据，生成训练专用数据
4. `model/train_real.py` 读取冻结后的对齐数据，训练多时域 LST-GCN
5. 权重与元数据同步到 `ai_service`
6. `ai_service/app.py` 提供统一预测接口
7. `backend/src/index.ts` 负责组装模型窗口、触发预测、保存快照并对前端提供 API
8. Dashboard、Route、导出接口、地图页、事件页消费这些 API

---

## 4. 技术栈

### 4.1 前端

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Recharts
- Motion
- Lucide React
- 高德地图 JavaScript SDK

前端关键页面位于 `frontend/src/pages/`：

- [Dashboard.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Dashboard.tsx)
- [MapView.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\MapView.tsx)
- [Incidents.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Incidents.tsx)
- [Route.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Route.tsx)
- [Settings.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Settings.tsx)
- [Login.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Login.tsx)

### 4.2 后端

- Node.js
- Express
- TypeScript
- MySQL
- Redis
- Axios
- node-cron

后端入口是 [backend/src/index.ts](D:\Projects\VS_Code\traffic-system\backend\src\index.ts)。

### 4.3 AI 服务

- Python
- Flask
- PyTorch
- NumPy / Pandas / Matplotlib

AI 推理入口是 [ai_service/app.py](D:\Projects\VS_Code\traffic-system\ai_service\app.py)。

### 4.4 采集与部署

- Python 采集器
- APScheduler
- Nginx
- Gunicorn
- PM2
- systemd

部署样例见 [DEPLOYMENT.md](D:\Projects\VS_Code\traffic-system\deploy\DEPLOYMENT.md)。

---

## 5. 模型训练数据更迭过程

你要求 README 中明确说明“系统初期使用模拟数据预训练权重验证链路，后期用真实采集数据重新训练”，这里给出系统口径：

### 5.1 初期阶段：用模拟数据验证全链路

在系统刚搭建完成、真实数据量明显不足时，可以先使用模拟数据或人工生成数据跑通以下链路：

- 训练脚本是否可执行
- AI 服务是否能加载权重
- 后端是否能正确构造窗口并调用预测
- 前端图表和路线页是否能显示预测结果

这一步的意义不是追求高精度，而是验证“从数据到页面”的工程闭环。

### 5.2 后期阶段：用真实采集数据重新训练

随着真实采集数据积累，系统切换到真实数据重训，当前仓库已经完成这一口径下的训练冻结：

- 冻结版本：`train_20260505050000`
- 原始真实行数：`5359`
- 对齐后训练行数：`26928`
- 时间桶数量：`2448`
- 节点数：`11`
- 粒度：`5` 分钟

训练摘要说明：

- 原始数据非常稀疏，观测占比只有 `0.154932`
- 大量时间桶通过 `interpolate` 和 `spatial` 方式补全
- `K11` 的观测最少，因此更依赖空间补全

### 5.3 为什么要冻结训练集

冻结训练集有三个目的：

- 避免模型训练时数据不断变化，导致结果不可复现
- 保留一份可以追溯的训练版本
- 让线上运行数据与训练数据解耦

冻结与补全脚本位于 [prepareTrainingData.ts](D:\Projects\VS_Code\traffic-system\backend\src\tools\prepareTrainingData.ts)。

---

## 6. 训练原理与模型调用机制

### 6.1 模型类型

当前模型是多时域直接监督训练的 `LST-GCN`：

- `GCN` 负责建模节点之间的空间关联
- `LSTM` 负责建模时间序列变化
- 输出层一次性预测多个未来时域

训练脚本见 [model/train_real.py](D:\Projects\VS_Code\traffic-system\model\train_real.py)。

### 6.2 节点与邻接矩阵

系统统一采用 11 个节点顺序：

`A1, B2, C3, D4, E5, F6, G7, H8, I9, J10, K11`

邻接矩阵在训练脚本中显式定义，并写入元数据文件：

- [lst_gcn_11nodes_metadata.json](D:\Projects\VS_Code\traffic-system\model\artifacts\train_20260505050000\lst_gcn_11nodes_metadata.json)

后端和 AI 服务都依赖这份统一顺序，避免训练/推理节点错位。

### 6.3 输入窗口长度、采样粒度、预测步长

当前模型契约如下：

- 输入窗口长度：`12`
- 时间粒度：`5` 分钟
- 输入覆盖时长：`12 x 5 = 60` 分钟
- 支持预测时域：`15/30/45/60` 分钟
- 对应预测步长：`3/6/9/12`

这意味着：

- Dashboard 的 15 分钟预测，本质是预测未来第 3 个 5 分钟桶
- Route 的 30/45/60 分钟预测，本质是预测未来第 6/9/12 个 5 分钟桶

### 6.4 为什么不是单步滚动预测

系统已经做过一个关键优化：不再用“单步模型反复滚动”去预测 30/45/60 分钟，因为这样误差会累计。

当前采用的是：

- `direct_multi_horizon_supervision`
- 一次前向同时输出 15/30/45/60 分钟结果

训练指标文件见 [training_metrics_11nodes.json](D:\Projects\VS_Code\traffic-system\model\artifacts\train_20260505050000\training_metrics_11nodes.json)。

当前测试集指标为：

- `15min`: `MAE 3.1770`, `RMSE 4.6180`, `MAPE 8.7262%`
- `30min`: `MAE 3.3691`, `RMSE 4.8239`, `MAPE 9.1368%`
- `45min`: `MAE 3.8223`, `RMSE 5.1951`, `MAPE 10.4247%`
- `60min`: `MAE 3.6398`, `RMSE 5.1076`, `MAPE 10.0174%`

### 6.5 预测服务调用原理

预测调用分三层：

1. 后端从当前启用的数据表中取最近一段数据
2. [trafficWindow.ts](D:\Projects\VS_Code\traffic-system\backend\src\trafficWindow.ts) 按 5 分钟聚合、补齐窗口，形成长度为 12 的 `window`
3. 后端把 `window` POST 到 AI 服务 `/predict`

AI 服务返回：

- 主预测 `predictions`
- 主时域 `primary_horizon_minutes`
- 全部多时域预测 `multi_horizon_predictions`

后端再把结果：

- 写入 `predictions` 表
- 提供给 Dashboard、Route、导出接口复用

---

## 7. 模拟采集器原理

模拟采集器见 [collector/mock_collector.py](D:\Projects\VS_Code\traffic-system\collector\mock_collector.py)。

它不是简单随机数，而是按交通规律构造：

- 按时间段生成基础速度分布
  - 早高峰、午高峰、晚高峰速度下降
  - 夜间速度回升
- 引入节点偏置
  - 每个路口有自己的基础快慢差异
- 引入空间联动
  - 邻接节点会互相影响
- 引入随机扰动
  - 让数据不至于完全平滑
- 可选引入突发事件扰动
  - 某个节点速度骤降，并波及邻居
- 优先参考历史训练画像
  - 如果 `aligned.csv` 中存在该分钟附近的历史模式，会优先用历史模式插值

它支持：

- 每分钟写入 11 条记录
- 写入表结构与真实采集一致
- 更新 Redis 的 `traffic:latest:mock` 缓存

运行模式由 `.env` 控制：

- `TRAFFIC_COLLECTION_MODE=off`
- `TRAFFIC_COLLECTION_MODE=real`
- `TRAFFIC_COLLECTION_MODE=mock`

读取数据源由 `TRAFFIC_READ_SOURCE` 决定：

- `real` 读 `traffic_flow`
- `mock` 读 `traffic_flow_mock`

实现见 [trafficSource.ts](D:\Projects\VS_Code\traffic-system\backend\src\trafficSource.ts)。

---

## 8. 用户登录逻辑与用户表设计

### 8.1 登录方式

系统支持三种用户进入方式：

1. 用户名 + 密码 + 图形验证码登录
2. 邮箱 + 邮箱验证码登录
3. 用户注册后自动创建会话

实现文件是 [auth.ts](D:\Projects\VS_Code\traffic-system\backend\src\auth.ts)。

### 8.2 登录核心流程

#### 账号密码登录

1. 前端先请求 `/api/auth/captcha`
2. 用户输入图形验证码
3. 前端提交 `/api/auth/login`
4. 后端校验验证码
5. 查询 `users`
6. 使用 `bcrypt` 校验密码
7. 生成 `session_token`
8. 写回 `token_expires_at`、`last_login_time`、`last_login_ip`

#### 邮箱验证码登录

1. 前端先获取图形验证码
2. 提交 `/api/auth/email/send`
3. 后端校验图形验证码
4. 生成 6 位邮箱验证码并写入缓存
5. 前端提交 `/api/auth/email-login`
6. 若邮箱不存在则自动创建用户
7. 创建登录会话

### 8.3 图形验证码与防刷机制

当前验证码确实是 `Redis + 进程内存兜底` 的方案，不是纯终端控制台方案。

具体逻辑：

- 图形验证码缓存键：`captcha:<captchaId>`
- 邮箱验证码缓存键：`email:<email>`
- 刷新频率限制：`captcha:rate:<ip>`
- 邮箱验证码发送频率限制：`email:rate:<ip>`

实现特征：

- 优先写 Redis
- Redis 不可用时退回到进程内 `memoryStore`
- 图形验证码默认 5 分钟过期
- 邮箱验证码默认 10 分钟过期
- 邮箱验证码发送默认 60 秒限流

是否在终端输出验证码由环境变量控制：

- `AUTH_DEV_LOG_CODES=true`：开发模式打印验证码
- `AUTH_DEV_LOG_CODES=false`：生产模式不打印

邮箱验证码需要配置 SMTP 发信账号。开发环境可把所有验证码实际投递到同一个测试邮箱：

```env
EMAIL_SMTP_HOST=smtp.qq.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=3379556417@qq.com
EMAIL_SMTP_PASS=QQ 邮箱 SMTP 授权码
EMAIL_FROM=智能交通系统 <3379556417@qq.com>
EMAIL_TEST_RECIPIENT=3379556417@qq.com
```

### 8.4 用户表设计

`users` 表由后端自动迁移创建，核心字段包括：

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

角色体系：

- `管理员`
- `执行者`

`role_id` 采用编码方式：

- 管理员：`G0001` 起
- 执行者：`S0001` 起

系统会自动修复历史数据中不规范的 `role_id`。

---

## 9. 为什么用“速度”代替“车辆数量”描述交通状况

这是答辩中非常重要的一部分，系统的解释口径如下。

### 9.1 `congestion_status` 不是我们主观定义的

`congestion_status` 直接来自高德 API 返回字段，不是系统自己发明的标准。高德官方定义为：

- `1 = 畅通`
- `2 = 缓行`
- `3 = 拥堵`
- `4 = 严重拥堵`

因此前端和后端只是沿用高德的拥堵状态解释。

### 9.2 `road_count` 的含义

采集脚本以路口坐标为圆心、半径约 100 米范围统计覆盖的路段数，得到 `road_count`。

例如：

- 如果 A1 周围覆盖到 3 条道路，则 `road_count = 3`

它的主要作用是描述这次采样覆盖面，而不是直接用于模型推理。当前系统中：

- 已存储
- 训练数据冻结时会保留
- 前端和推理阶段暂未作为主要特征使用

### 9.3 为什么拿不到车辆数

高德本质上是导航与路况服务商，普通开发者通常拿不到“单位时间通过路口的车辆计数”。真正的车辆数往往依赖：

- 路口摄像头
- 地感线圈
- 交警部门信号机数据

这些通常不对普通开发场景开放。

### 9.4 学术上为什么速度可以作为代理变量

交通流理论中有经典的速度-流量-密度关系，Greenshields 模型可以概括为：

- 流量 `q = 速度 v × 密度 k`
- 随着密度升高，速度通常下降
- 当密度超过临界值，通行能力也会下降，拥堵加剧

所以：

- 速度不是车辆数本身
- 但速度可以作为交通状态的高价值代理变量

在交通预测研究中，这种做法是被广泛接受的，很多论文直接预测的目标也是速度。

---

## 10. 页面功能与业务流程

### 10.1 登录页 Login

文件：[Login.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Login.tsx)

功能：

- 账号密码登录
- 邮箱验证码登录
- 注册新用户
- 图形验证码刷新
- 登录后进入 Dashboard 或引导到 Settings 设置密码

流程：

1. 请求图形验证码
2. 用户输入账号/密码或邮箱/邮箱验证码
3. 后端验证后签发会话
4. token 存储到 `localStorage`

### 10.2 Dashboard 页面

文件：[Dashboard.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Dashboard.tsx)

功能：

- 展示 11 节点最新交通摘要
- 按日期查看 `00:00-24:00` 日内速度曲线
- 实际数据与 15 分钟预测同图展示
- 高峰时段背景标注
- 支持图表缩放与局部放大

核心流程：

1. 调用 `/api/traffic/latest` 获取当前概况
2. 调用 `/api/dashboard/chart?node_id=...&date=...&horizon=15`
3. 后端从实际数据表与 `predictions` 表拼接同一天曲线
4. 前端以折线形式展示“历史/实际 + 15 分钟预测”

说明：

- 当前 Dashboard 主要使用 `15` 分钟预测
- 图表的预测点是按 `target_at` 落点，而不是按生成时间落点

### 10.3 地图页 MapView

文件：[MapView.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\MapView.tsx)

功能：

- 高德底图展示 11 个路口节点
- 根据实时状态着色
- 支持节点点击聚焦
- 支持从事件页跳转并自动定位到对应路口
- 支持全屏查看

核心流程：

1. 调用 `/api/traffic/latest`
2. 在地图上绘制 CircleMarker
3. 根据 `congestion_status` 设置颜色
4. 如果 URL 中带 `?node=A1`，则自动聚焦对应节点

### 10.4 事件页 Incidents

文件：[Incidents.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Incidents.tsx)

功能：

- 查看事件列表
- 根据状态筛选事件
- 上报新事件
- 管理员分配/修改处理身份
- 点击节点 ID 跳转地图页聚焦对应路口

核心流程：

1. 调用 `/api/incidents`
2. 如需用户下拉列表，则调用 `/api/auth/users`
3. 新增事件时 POST `/api/incidents`
4. 更新状态时 PUT `/api/incidents/:id`

### 10.5 Route 页面

文件：[Route.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Route.tsx)

功能：

- 查看 30/45/60 分钟多时域通行建议
- 多节点对比
- 展示当前速度、预测速度、变化幅度、推荐原因、评分

核心流程：

1. 前端选择节点和时域
2. 调用 `/api/route/outlook`
3. 后端统一构造模型窗口并调用 AI 服务
4. 根据预测速度和速度变化构造评分与建议

当前建议逻辑不是简单“速度阈值翻译”，而是综合：

- 当前速度
- 预测速度
- 速度下降幅度
- 低速惩罚

最终输出：

- `建议通行`
- `谨慎通行`
- `建议绕行`

### 10.6 Settings 页面

文件：[Settings.tsx](D:\Projects\VS_Code\traffic-system\frontend\src\pages\Settings.tsx)

功能：

- 用户资料查看与编辑
- 头像上传
- 密码设置/修改
- 邮箱绑定与邮箱验证码校验
- 历史数据导出
- 预测报表导出
- 系统说明内嵌展示

导出接口：

- `/api/report/export`
- `/api/report/predict-export`

---

## 11. 后端主要接口

### 11.1 健康检查

- `GET /api/health`

返回当前：

- 数据源类型
- 当前读取表
- 模型粒度
- 窗口长度
- AI 服务地址

### 11.2 交通数据接口

- `GET /api/traffic/latest`
- `GET /api/traffic/history`

### 11.3 预测接口

- `POST /api/predict/trigger`
  - 触发一次预测并把结果写入 `predictions`
- `GET /api/predict/latest`
  - 获取最新某时域预测
- `GET /api/predict/outlook`
  - 获取某节点多个时域的最新预测快照

### 11.4 Dashboard 专用接口

- `GET /api/dashboard/chart`

职责：

- 输入：日期 + 节点 + 时域
- 输出：当天实际曲线 + 当天预测曲线

### 11.5 Route 专用接口

- `GET /api/route/decision`
- `GET /api/route/outlook`

职责：

- 提供当前速度、预测速度、变化幅度、建议、评分与原因解释

### 11.6 事件接口

- `GET /api/incidents`
- `POST /api/incidents`
- `PUT /api/incidents/:id`
- `DELETE /api/incidents/:id`

### 11.7 认证接口

- `GET /api/auth/captcha`
- `POST /api/auth/email/send`
- `POST /api/auth/login`
- `POST /api/auth/email-login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/profile`

---

## 12. 运行方式

### 12.1 本地开发

后端：

```powershell
cd backend
npm install
npm run dev
```

前端：

```powershell
cd frontend
npm install
npm run dev
```

AI 服务：

```powershell
pip install -r ai_service\requirements.txt
python ai_service\app.py
```

模拟采集器单次执行：

```powershell
python collector\run_collector.py --once
```

模拟采集器持续运行：

```powershell
python collector\run_collector.py
```

训练数据冻结：

```powershell
cd backend
npm run prepare-train-data
```

重新训练模型：

```powershell
python model\train_real.py
```

### 12.2 生产部署建议

当前仓库推荐的 Linux 生产结构是：

- Nginx：静态前端 + `/api` 反向代理
- PM2：Node 后端
- Gunicorn + systemd：AI 服务
- systemd：采集器
- MySQL：业务数据
- Redis：验证码、限流、缓存

部署文档见 [deploy/DEPLOYMENT.md](D:\Projects\VS_Code\traffic-system\deploy\DEPLOYMENT.md)。

如果你的电脑不能一直开着，确实应该把采集器与后端迁到云服务器长期运行。当前仓库已经有 `nginx + gunicorn + systemd/pm2` 的部署模板，可以直接作为云端版本基础。

---

## 13. 重要环境变量

核心环境变量如下：

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

- `TRAFFIC_COLLECTION_MODE` 决定采集器写什么
- `TRAFFIC_READ_SOURCE` 决定后端读什么
- `AUTH_DEV_LOG_CODES` 决定验证码是否打印到控制台

---

## 14. 项目演示建议口径

为了让答辩或演示更顺畅，推荐这样表述：

1. 系统监测 11 个核心路口节点，地图、图表、事件和路线建议围绕这 11 个节点统一展开。
2. 真实交通状态最初来自高德路况接口，但由于额度限制，真实数据并不连续。
3. 为了让系统具备持续运行与训练能力，我们增加了模拟采集器，形成真实数据与模拟数据双轨机制。
4. 模型初期可用模拟数据验证工程链路，后期再基于冻结后的真实采集数据重训。
5. 系统当前能对未来 15/30/45/60 分钟的路口平均速度做短时预测，并分别用于 Dashboard 与 Route 页面。
6. Dashboard 侧重“历史 + 15 分钟预测 + 日内规律”，Route 侧重“多时域通行建议”。

如果现场一定要简化口径，可以说：

> 系统对 11 个重点路口进行周期性采集，结合模型预测未来短时交通速度变化，并将结果同步到地图、监控面板、路线建议与事件调度页面。

---

## 15. 当前局限与后续优化方向

### 15.1 当前局限

- 真实采样仍然稀疏，补全数据比例较高
- `road_count` 已存储但尚未进入主推理特征
- 车辆数不可得，因此目前以速度作为代理变量
- 模拟数据虽然比随机数更合理，但仍不等价于真实交通流

### 15.2 后续优化方向

- 引入更多真实采集周期，降低补全比例
- 将天气、节假日、工作日/周末等外生变量纳入模型
- 将 `road_count` 或历史事件作为辅助特征
- 优化 Dashboard 中预测曲线与实际曲线的贴合度
- 增加云端定时训练与权重自动发布能力

---

## 16. 代码索引

- 后端入口：[backend/src/index.ts](D:\Projects\VS_Code\traffic-system\backend\src\index.ts)
- 认证模块：[backend/src/auth.ts](D:\Projects\VS_Code\traffic-system\backend\src\auth.ts)
- 数据源切换：[backend/src/trafficSource.ts](D:\Projects\VS_Code\traffic-system\backend\src\trafficSource.ts)
- 模型窗口构造：[backend/src/trafficWindow.ts](D:\Projects\VS_Code\traffic-system\backend\src\trafficWindow.ts)
- 训练数据冻结：[backend/src/tools/prepareTrainingData.ts](D:\Projects\VS_Code\traffic-system\backend\src\tools\prepareTrainingData.ts)
- 训练脚本：[model/train_real.py](D:\Projects\VS_Code\traffic-system\model\train_real.py)
- AI 推理服务：[ai_service/app.py](D:\Projects\VS_Code\traffic-system\ai_service\app.py)
- 模拟采集器：[collector/mock_collector.py](D:\Projects\VS_Code\traffic-system\collector\mock_collector.py)
- 采集调度入口：[collector/run_collector.py](D:\Projects\VS_Code\traffic-system\collector\run_collector.py)
- 部署说明：[deploy/DEPLOYMENT.md](D:\Projects\VS_Code\traffic-system\deploy\DEPLOYMENT.md)

---

## 17. 一句话总结

这个系统的核心价值在于：即使真实交通数据有限，也通过“冻结真实数据 + 补全训练集 + 持续模拟采集 + 多时域预测服务 + 前端统一展示”构建了一个完整、可解释、可部署、可演示的智能交通监测与预测闭环。
