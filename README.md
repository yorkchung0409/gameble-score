# 牌局记账应用

一个支持多人云端协作的打牌记账应用，包含德州扑克和麻将两种记账模式。

## 功能特性

### 德州扑克
- 创建/加入房间（房间码共享）
- 人员管理（弹窗添加/删除）
- 牌局记录（一场多人，日期+人员行：买入、结余、净盈亏自动计算）
- 统计：总场次、总买入、流水差、本局流水
- 支持编辑和删除牌局

### 麻将
- 设备绑定身份（一人一设备）
- 4个座位（东南西北）
- 手动转账记账（付款方固定为自己，收款方可选玩家或茶水费）
- 座位快速转账（点击其他玩家座位上的转账图标）
- 积分看板（实时计算每人积分、茶水费、流水、守恒校验）
- 转账记录列表（可删除）

### 通用
- 多人实时同步（5秒轮询）
- 最近进入房间历史
- 响应式设计，支持移动端

## 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS + Radix UI
- **后端**：NestJS 10 + TypeScript
- **数据库**：MySQL + Drizzle ORM
- **数据存储**：本地 localStorage（设备身份）+ MySQL（业务数据）

## 快速开始

### 前置要求
- Node.js >= 22.0.0
- npm >= 10.0.0
- MySQL 8 数据库

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
```
编辑 `.env` 文件，配置 MySQL 连接：
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=gameble
DB_PASSWORD=your-password
DB_NAME=gameble_score
```

### 3. 初始化数据库
```bash
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME" < init.sql
```

### 4. 开发模式
```bash
npm run dev
```
- 后端运行在 http://localhost:3000
- 前端运行在 http://localhost:5173（自动代理 API 请求到后端）

### 5. 生产构建
```bash
npm run build
npm start
```
应用运行在 http://localhost:3000

## 部署

### 方式一：自己的服务器
1. 安装 Node.js 和 MySQL 8
2. 上传代码到服务器
3. `npm install --production`
4. `npm run build`
5. 配置 `.env`
6. 初始化数据库 `mysql -u gameble -p gameble_score < init.sql`
7. 使用 pm2 或 systemd 启动 `npm start`

### 方式二：Railway / Render 等 PaaS 平台
1. 推送代码到 GitHub
2. 在 Railway/Render 导入仓库
3. 添加 MySQL 插件或连接已有 MySQL 实例
4. 配置环境变量 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
5. 构建命令：`npm run build`
6. 启动命令：`npm start`
7. 在平台的数据库控制台执行 `init.sql` 初始化表结构

### 方式三：微信云托管（小程序推荐）
1. 在微信开发者工具中开通云开发环境，并在云托管中使用本仓库的 `Dockerfile` 部署服务。
2. 服务名填写 `express-drsy`，容器端口填写 `3000`，访问方式选择仅小程序私有访问，不开启公网访问。
3. 在同一云开发环境创建或关联 MySQL 实例。云托管会自动提供 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`，因此只需在服务环境变量中额外配置 `DB_NAME`（例如 `gameble_score`）。本地或其他平台则配置 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`。
4. 云托管会注入 `PORT`；应用在启动前会自动执行 `init.sql` 创建表结构。小程序通过 `wx.cloud.callContainer` 调用服务，因此不需要在小程序后台填写合法 request 域名，也不需要配置 `WECHAT_APP_SECRET`。
5. 部署完成后查看 `/health` 云端调试接口，确认返回 `status: ok`，再在微信开发者工具运行小程序。

云托管服务的环境变量只绑定到服务版本；`DB_PASSWORD` 和 `MYSQL_PASSWORD` 都属于密钥，应仅填写在云托管控制台，绝不能提交到 Git 仓库。

### 方式四：Vercel + MySQL
- 前端部署到 Vercel
- 数据库使用可公网访问的 MySQL 实例
- 后端需要单独部署（Vercel Serverless Functions 或其他平台）

## 微信小程序

微信小程序客户端已独立至 [gameble-score-miniprogram](https://github.com/yorkchung0409/gameble-score-miniprogram)。它使用本仓库后端的微信登录与麻将 API。默认通过微信云托管私有链路调用 `express-drsy`，不需要 HTTPS API 域名或 `WECHAT_APP_SECRET`；公网 `wx.login` 回退模式才需要配置 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`。

## 项目结构

```
├── client/              # 前端代码
│   └── src/
│       ├── api/         # API 调用层
│       ├── components/  # UI 组件
│       ├── pages/       # 页面组件
│       ├── hooks/       # 自定义 Hooks
│       └── app.tsx      # 路由配置
├── server/              # 后端代码
│   ├── database/        # 数据库 schema 和模块
│   ├── modules/         # 业务模块
│   │   ├── poker/       # 德州模块
│   │   ├── mahjong/     # 麻将模块
│   │   ├── room-visits/ # 房间访问历史
│   │   └── view/        # 视图渲染
│   ├── common/          # 公共组件
│   ├── main.ts          # 入口
│   └── app.module.ts    # 根模块
├── shared/              # 前后端共享类型
├── init.sql             # 数据库初始化脚本
├── package.json
├── vite.config.ts
├── tsconfig.app.json
├── tsconfig.node.json
└── .env.example
```

## 数据迁移

从妙搭平台导出的数据可以通过以下方式迁移：
1. 在妙搭平台导出数据为 JSON
2. 编写脚本将 JSON 数据导入新的 MySQL 数据库
3. 表结构与 `init.sql` 一致

## License

MIT
