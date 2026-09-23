# 同步服务

服务端只负责设备配对、包裹摘要同步和待取状态管理，不接收电商账号密码或 Cookie。

## 启动

```bash
node src/index.mjs
```

可选参数：

```bash
node src/index.mjs --host 0.0.0.0 --port 8787 --data ./data/state.json
```

## API

- `POST /api/v1/pairings`：小程序生成 6 位配对码。
- `POST /api/v1/pairings/claim`：Android 采集端领取设备令牌。
- `POST /api/v1/pairings/:code/complete`：小程序完成配对并获得会话令牌。
- `POST /api/v1/parcels/sync`：Android 上传结构化包裹摘要。
- `GET /api/v1/parcels?status=pending`：小程序读取包裹。
- `PATCH /api/v1/parcels/:id`：修改待取或已取状态。
- `POST /api/v1/parse`：调试文本解析规则。

## 数据与安全

- 令牌在服务端只保存 SHA-256 哈希。
- 配对码十分钟过期，并且只能被领取一次。
- 当前使用 JSON 文件持久化，适合本地 MVP。
- 正式环境应替换为 PostgreSQL 或 MySQL，并增加 HTTPS、速率限制、审计和数据保留策略。

