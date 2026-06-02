# Railway 部署说明

## 1. Web Service

在 Railway 里从 GitHub repo 新建服务。保持默认 Next.js 构建即可：

- Build command: `npm run build`
- Start command: `npm run start`

## 2. 持久化数据

给 Web Service 添加 Volume：

- Mount path: `/data`
- 环境变量：`DATA_DIR=/data`

应用会把本地 JSON 数据库写到 `/data/db.json`，重新部署后数据不会丢。

## 3. 环境变量

在 Railway Variables 里配置：

```env
ADMIN_PASSWORD=换成你的后台密码
INITIAL_BALANCE=3000
DATA_DIR=/data

THE_ODDS_API_KEY=你的 The Odds API key
ODDS_API_IO_KEY=你的 Odds-API.io key
ODDS_API_IO_BOOKMAKERS=Bet365,BetMGM
ODDS_API_IO_SPORT=football
ODDS_API_IO_LEAGUE=international-world-cup

API_FOOTBALL_KEY=你的赛果 API key

LLM_API_KEY=你的 LLM key
LLM_BASE_URL=https://llm-api-na.wegame.com.cn
LLM_MODEL=gpt-5.4-mini
```

Railway 创建公开域名后，再加：

```env
APP_URL=https://你的服务域名
```

## 4. Cron Jobs

建议新建两个 Cron Service，使用同一个 GitHub repo 和同一组环境变量。

赔率刷新：

- Start command: `npm run refresh:odds`
- Schedule: `*/30 * * * *`

赛果结算：

- Start command: `npm run settle:railway`
- Schedule: `*/30 * * * *`

结算任务会调用 Web Service 的 `/api/admin/results/settle`，由 Web Service 读写 `/data/db.json`，避免 Cron 服务自己读不到 Volume。

## 5. API 用量估算

Odds-API.io 当前世界杯赛事每次刷新大约：

- 1 次 events 请求
- 每 10 场 1 次 odds/multi 请求
- 72 场约 9 次请求
- 104 场约 12 次请求

半小时刷新一次，大约 18-24 请求/小时，低于当前 key 的 100 请求/小时限制。

## 6. 上线后检查

1. 打开 `/login`，用邀请码登录。
2. 打开 `/admin`，输入后台密码。
3. 点一次“刷新赔率”。
4. 检查赛事页是否有让球、大小、独赢、波胆。
5. 小额下注一单，确认投注记录和余额变化。
6. 在 Railway Logs 里确认两个 Cron 正常执行。
