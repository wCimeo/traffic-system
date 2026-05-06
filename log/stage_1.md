我新增了训练数据准备脚本 prepareTrainingData.ts，并在 backend/package.json 里加了 prepare-train-data 命令。这个脚本现在会做四件事：

从线上真实表 traffic_flow 按截止时间 2026-05-05 05:00:00 冻结训练快照。
写入训练原始快照表 traffic_flow_train_raw，不污染原始采集表。
生成 5 分钟粒度、11 节点完整对齐的训练表 traffic_flow_train_aligned，并标记每条数据的来源：
real / interpolate / spatial / carry_forward / carry_backward
记录版本元数据到 training_dataset_versions，同时导出文件到
model/generated/train_20260505050000
这一步我已经实际跑通，使用命令：

npm run prepare-train-data
阶段1验证结果

当前数据库里保留的训练冻结版本只有一个：
train_20260505050000

关键统计结果：

原始冻结行数：5359
对齐后训练行数：26928
时间桶数量：2448
时间范围：2026-04-26 17:00:00 到 2026-05-05 04:55:00
观测占比：0.154932
导出的摘要文件在：
summary.json

从摘要里还能确认：

K11 的原始数据确实最稀疏，只有 296 条，补全前缺失率约 89.87%
其他节点补全前缺失率也都在 83.9% 左右
这次补全主要由 interpolate 完成，共 21814 条
另有 942 条使用了基于邻接关系的 spatial 补全
这一步解决了什么

训练集已经和线上实时表解耦。
训练数据截止时间已经固定，不会再因为后续实时采集变化而漂移。
11 节点训练集已经有了统一、完整、可追溯的数据来源。
后续阶段2可以不再直接读 traffic_flow，而改读训练专用表或导出文件。
