import requests, json

# 测试ai服务
window = [
    {"A1":35,"B2":40,"C3":30,"D4":25,"E5":32,
     "F6":28,"G7":33,"H8":38,"I9":36,"J10":29}
] * 12

resp = requests.post("http://localhost:5001/predict", json={"window": window})
print(json.dumps(resp.json(), indent=2, ensure_ascii=False))

