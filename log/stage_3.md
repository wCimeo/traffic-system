这一阶段已经落地并闭环验证，系统现在具备了“模拟采集 + 真实/模拟数据源切换 + 与模型输入粒度兼容”的完整基础。

这次做了什么

新增模拟采集器
新增了 mock_collector.py
它会向 traffic_flow_mock 每次写入 11 条记录，字段与真实表一致：
node_id
collected_at
speed
congestion_status
road_count
新增统一采集入口
新增了 run_collector.py
它通过 .env 控制运行模式：
TRAFFIC_COLLECTION_MODE=mock
TRAFFIC_COLLECTION_MODE=real
TRAFFIC_COLLECTION_MODE=off
定义了模拟生成规则
在 mock_collector.py 里已经实现：
按时间段生成基础速度分布
夜间更快
早高峰、午高峰、晚高峰自动降速
引入节点差异
每个节点有不同的 NODE_BIAS
引入空间联动
通过 NEIGHBORS 和相邻节点上轮速度做混合
引入随机扰动
每轮有 cluster wave 和高斯噪声
可选突发事件扰动
由 TRAFFIC_MOCK_ENABLE_INCIDENTS 和 TRAFFIC_MOCK_INCIDENT_RATE 控制
事件会影响本节点及相邻节点
新增真实/模拟数据源切换
新增了 trafficSource.ts
现在后端通过 .env 控制读哪张表：

TRAFFIC_READ_SOURCE=real 读 traffic_flow
TRAFFIC_READ_SOURCE=mock 读 traffic_flow_mock
修了一个关键兼容点
新增了 trafficWindow.ts
这一步很重要：
你的模拟采集是“1分钟写一次”，但阶段2训练好的模型是“5分钟一个桶，12步窗口”。

所以我把后端预测入口统一改成：

从当前数据源读原始记录
聚合成 5分钟桶
再构造 12步 模型窗口
这样 mock 源接入后不会把“最近12条1分钟数据”错误地直接喂给模型。

后端主服务已切到动态数据源
修改了 index.ts
已经覆盖到：

/api/health
/api/traffic/latest
/api/traffic/history
/api/predict/trigger
/api/route/recommend
/api/route/decision
/api/report/export
/api/report/predict-export
定时预测任务
并且后端启动时会自动确保 traffic_flow_mock 存在。

补了采集依赖清单
新增 requirements.txt
.env 已新增的配置

在 .env 里我已经加了这些开关：

TRAFFIC_REAL_TABLE=traffic_flow
TRAFFIC_MOCK_TABLE=traffic_flow_mock
TRAFFIC_READ_SOURCE=real
TRAFFIC_COLLECTION_MODE=off
TRAFFIC_REAL_COLLECTOR=rectangle
TRAFFIC_REAL_INTERVAL_SECONDS=300
TRAFFIC_MOCK_INTERVAL_SECONDS=60
TRAFFIC_MOCK_ENABLE_INCIDENTS=true
TRAFFIC_MOCK_INCIDENT_RATE=0.08
MODEL_BUCKET_MINUTES=5
MODEL_WINDOW_SIZE=12
MODEL_WINDOW_LOOKBACK_MINUTES=180
默认我保守地保留为：

读取真实表 TRAFFIC_READ_SOURCE=real
采集服务关闭 TRAFFIC_COLLECTION_MODE=off
这样不会突然改变你当前系统行为。要切模拟时，只要改 .env。

闭环验证结果

我已经实际验证了这些点：

后端编译通过
执行了 npm run build

采集器脚本语法通过
验证了：

mock_collector.py
run_collector.py
模拟采集真实写库成功
我用 mock 模式跑了一次单轮采集，traffic_flow_mock 里成功写入了 11 条数据。

验证结果：

总记录数：11
最早时间 = 最晚时间：同一轮分钟级快照
节点 A1 ~ K11 全部存在
这轮样例速度大致在 43.28 ~ 56.53 km/h，说明节点间已经出现差异，不是简单复制。

数据源切换和模型窗口构建验证通过
我直接用编译后的后端 helper 验证了：
TRAFFIC_READ_SOURCE=mock 时会读 traffic_flow_mock
buildModelWindow() 能正常生成长度为 12 的窗口
窗口里包含全部 11 个节点键
怎么运行

如果你要启用模拟采集：

改 .env
TRAFFIC_COLLECTION_MODE=mock
TRAFFIC_READ_SOURCE=mock
用可用环境启动采集器
这台机器上我验证通过的是 thesis 环境：
conda run -n thesis python collector\run_collector.py
如果只想手动跑一轮：

conda run -n thesis python collector\run_collector.py --once
如果要切回真实读表：

TRAFFIC_READ_SOURCE=real
如果要完全禁用采集器：

TRAFFIC_COLLECTION_MODE=off
一个你需要知道的小点

我验证时发现系统默认 python 环境缺少 pymysql。
但 conda 的 thesis 环境里依赖是齐的，我已经用它跑通了单轮写库。

所以当前最稳的运行方式是：

conda run -n thesis python collector\run_collector.py
建议你现在做一次 git 提交