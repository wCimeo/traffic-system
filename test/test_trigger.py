# 测试后端触发预测
import requests, json


resp = requests.post("http://localhost:3001/api/predict/trigger")
print(json.dumps(resp.json(), indent=2, ensure_ascii=False))