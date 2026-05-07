阶段5的目标是让 Dashboard 真正体现“真实历史 + 15 分钟预测 + 日内规律”。目前已经完成页面改造、数据源联动、图表缩放、mock 数据修正和预测回填能力。

已完成

Dashboard 图表改造
Dashboard.tsx
现在支持：

日期选择，按单日展示 00:00-24:00
节点选择，单节点查看
同图展示真实采集曲线和 15分钟预测 曲线
标注早高峰 07:00-09:00、午高峰 12:00-14:00、晚高峰 17:00-19:00
隐藏密集散点，只保留平滑折线和悬停焦点
图表底部缩放条
缩放时真正放大曲线细节，X/Y 轴都会跟随缩放范围调整
缩放条保留完整 00:00-24:00 时间轴
页面布局优化
右侧卡片已移动到图表下方，图表恢复全宽展示。下方卡片包括：
当前节点信息
图表统计
高峰时段说明
前端 API 接入
Dashboard 已接入阶段4新增接口：
GET /api/dashboard/chart?node_id=A1&date=2026-05-07&horizon=15
前端不再自己拼历史和预测，而是消费后端专门图表接口。

数据源切换修复
修复了后端 .env 加载顺序问题，保证：
TRAFFIC_READ_SOURCE=mock
可以正确让后端读取：

traffic_flow_mock
涉及文件：
env.ts
index.ts
db.ts
trafficSource.ts
trafficWindow.ts

mock 数据生成器优化
原 mock 数据太像数学函数，也和模型预测不匹配。已改为：
默认关闭强随机突发事件
降低噪声
限制速度跳变
新增历史训练集底稿机制
优先读取阶段1生成的 aligned.csv，按真实历史时刻和节点生成 mock 曲线
涉及文件：
mock_collector.py
run_collector.py
.env

mock 历史回填能力
新增命令支持一次性生成历史 mock 数据，不用等待实时采集：
conda run -n thesis python collector\run_collector.py --backfill-hours 18
预测查询按数据源过滤
修复了 Dashboard 显示 traffic_flow_mock，但预测线可能混入 traffic_flow 旧预测的问题。现在预测查询会按当前 source_table 过滤。

预测历史回填能力
新增脚本：
backfillPredictions.ts

命令：

cd backend
npm run backfill-predictions -- --date=2026-05-07 --table=traffic_flow_mock --clear
作用：

按 mock 历史数据每 5 分钟构造模型窗口
调用 AI 服务生成 15/30/45/60 分钟预测
写入 predictions
让 Dashboard 能看到连续蓝色预测曲线
验证情况
已通过：

cd frontend
npx tsc -b
已通过：

cd backend
npm run build
已通过：

conda run -n thesis python -m py_compile collector\mock_collector.py collector\run_collector.py
当前手动联调流程
推荐顺序：

# 1. 清理当天旧 mock 与旧预测
mysql -uroot -p123456 traffic -e "DELETE FROM traffic_flow_mock WHERE DATE(collected_at)=CURDATE(); DELETE FROM predictions WHERE source_table='traffic_flow_mock' AND DATE(target_at)=CURDATE();"
# 2. 回填 mock 历史数据
conda run -n thesis python collector\run_collector.py --backfill-hours 18
# 3. 启动 AI 服务
conda run -n thesis python ai_service\app.py
# 4. 回填预测历史
cd backend
npm run backfill-predictions -- --date=2026-05-07 --table=traffic_flow_mock --clear
# 5. 启动后端和前端
cd backend
npm run dev

cd frontend
npm run dev
阶段5当前状态
阶段5已经基本闭环。Dashboard 的展示能力已经具备，数据源切换、mock 数据生成、预测曲线回填也都补齐了。

剩余注意点：

如果只执行一次 /api/predict/trigger，蓝线只有一个预测点，不会形成曲线。
要展示连续蓝色预测线，需要执行 backfill-predictions。
mock 数据的“真实感”现在明显依赖阶段1的 aligned.csv，这是合理的，因为它让 mock 数据与模型训练分布保持一致。