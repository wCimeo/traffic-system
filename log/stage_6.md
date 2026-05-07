阶段6目标是优化 Route 页面，让它从“简单阈值建议”升级为“多节点、多时域、可解释的通行评估”。

已完成

复核现状
确认原 Route 逻辑确实主要是：
预测速度 -> 阈值判断 -> 建议通行 / 谨慎 / 绕行
原逻辑缺少：

当前速度
预测速度变化幅度
评分
推荐原因
多节点横向对比
多时域趋势展示
后端 Route 接口增强
修改文件：
backend/src/index.ts
增强内容：

/api/route/decision 保留兼容，但返回字段增强
/api/route/outlook 支持多节点、多时域评估
新增评分逻辑 score
新增 speed_delta
新增 reason
结合当前速度和预测速度生成推荐
增强后的核心字段包括：

current_speed
current_status
current_collected_at
predicted_speed
speed_delta
score
recommendation
level
reason
target_at
source_table
前端 Route 页面重构
修改文件：
frontend/src/pages/Route.tsx
现在页面支持：

多节点选择
30/45/60 分钟时域选择
节点对比排序
平均通行评分
推荐优先节点
每个节点的当前速度
每个时域的预测速度
速度变化幅度
评分条
推荐原因
预测生成时间与目标时间
前端 API 层更新
修改文件：
frontend/src/api.ts
fetchRouteOutlook 已支持：

单节点参数 node_id
多节点参数 node_ids
多时域 horizons
兼容旧后端返回
因为你本地运行的后端一度还是旧接口结构，前端曾出现：
node_id is required
以及 Route 页面进不去的问题。

已做兼容处理：

单节点请求时发 node_id
前端逐节点请求后合并结果
对旧后端缺失字段自动补默认值：
score
reason
current_speed
speed_delta
horizon_minutes
所以现在即使后端没重启到最新版，Route 页面也能进入并展示基础预测结果。

验证情况
后端构建通过：

cd backend
npm run build
前端类型检查通过：

cd frontend
npx tsc -b
当前状态
阶段6已经完成第一版闭环。

现在 Route 页面已经不是单纯速度阈值翻译，而是：

当前速度 + 预测速度 + 变化幅度 + 风险评分 + 推荐原因 + 多节点排序
注意事项
要看到完整增强字段效果，需要确保后端运行的是最新版：

cd backend
npm run dev
如果后端还是旧进程，页面也能进，但当前速度、变化幅度等字段会以兼容默认值显示。