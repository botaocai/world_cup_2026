# Railway 部署说明

## 1. Web Service

在 Railway 里从 GitHub repo 新建服务。保持默认 Next.js 构建即可：

- Build command: `npm run build`
- Start command: `npm run start`

如果服务显示 `Unexposed service`，到服务的 `Settings` 或 `Networking` 里生成一个公开域名。

## 2. 持久化数据

给 Web Service 添加 Volume：

- Mount path: `/data`
- 环境变量：`DATA_DIR=/data`

应用会把线上 JSON 数据库写到 `/data/db.json`。只要保留这个 Volume，重新部署代码不会清空玩家、下注、积分和结算数据。

系统每次写入数据前，会自动把旧的 `/data/db.json` 复制到 `/data/backups/`。默认保留最近 50 份，可以用 `DB_MAX_BACKUPS` 调整。

如果每次重新部署后数据都会丢，优先检查这两项：

- Volume 必须挂在 Web Service 上，不是只挂在 Cron Service 上。
- Web Service 的 Variables 必须有 `DATA_DIR=/data`。新版代码在 Railway 里也会默认优先使用 `/data`，但手动写上最稳。

没有 Volume 的情况下，Railway 重新部署会换一个临时容器，本地文件会被清空。

## 3. 环境变量

在 Railway Variables 里配置：

```env
ADMIN_PASSWORD=换成你的后台密码
INITIAL_BALANCE=3000
DATA_DIR=/data
DB_MAX_BACKUPS=50

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

## 5. 手动对账和容灾

后台 `/admin` 输入管理员密码后，可以导出：

- 玩家汇总：每个玩家余额、总下注、待结算、已结算盈亏。
- 下注明细：每一单下注、赔率、本金、状态、盈亏、结算时间。
- 资金流水：初始积分、下注扣款、派彩结算、后台加减分。
- 完整数据：当前数据库 JSON，适合做整库备份。

后台也可以“导入完整数据”。如果线上数据重新部署后丢失，可以先用本地或上一次导出的 `worldcup-db.json` 恢复线上数据库。导入前，当前线上数据库会自动备份一次。

如果线上数据出现异常，优先用“玩家汇总 + 下注明细 + 资金流水”手动复核每个玩家输赢。需要恢复旧数据时，可以在 Railway Volume 的 `/data/backups/` 里找到自动备份，或者用后台导入完整 JSON。

## 6. API 用量估算

Odds-API.io 当前世界杯赛事每次刷新大约：

- 1 次 events 请求
- 每 10 场 1 次 odds/multi 请求
- 72 场约 9 次请求
- 104 场约 12 次请求

半小时刷新一次，大约 18-24 请求/小时，低于当前 key 的 100 请求/小时限制。

## 7. 上线后检查

1. 打开 `/login`，用邀请码登录。
2. 打开 `/admin`，输入后台密码。
3. 点一次“刷新赔率”。
4. 检查赛事页是否有让球、大小、独赢、波胆。
5. 小额下注一单，确认投注记录和余额变化。
6. 在后台导出玩家汇总、下注明细、资金流水，确认能下载。
7. 在 Railway Logs 里确认两个 Cron 正常执行。
