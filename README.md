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
- **数据库**：PostgreSQL + Drizzle ORM
- **数据存储**：本地 localStorage（设备身份）+ PostgreSQL（业务数据）

## 快速开始

### 前置要求
- Node.js >= 22.0.0
- npm >= 10.0.0
- PostgreSQL 数据库

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
```
编辑 `.env` 文件，配置数据库连接：
```
DATABASE_URL=postgresql://username:password@localhost:5432/poker_score?schema=public
```

### 3. 初始化数据库
```bash
psql -U username -d poker_score -f init.sql
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
1. 安装 Node.js 和 PostgreSQL
2. 上传代码到服务器
3. `npm install --production`
4. `npm run build`
5. 配置 `.env`
6. 初始化数据库 `psql -d poker_score -f init.sql`
7. 使用 pm2 或 systemd 启动 `npm start`

### 方式二：Railway / Render 等 PaaS 平台
1. 推送代码到 GitHub
2. 在 Railway/Render 导入仓库
3. 添加 PostgreSQL 插件
4. 配置环境变量 `DATABASE_URL`
5. 构建命令：`npm run build`
6. 启动命令：`npm start`
7. 在平台的数据库控制台执行 `init.sql` 初始化表结构

### 方式三：Vercel + Supabase
- 前端部署到 Vercel
- 数据库用 Supabase（PostgreSQL）
- 后端需要单独部署（Vercel Serverless Functions 或其他平台）

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
2. 编写脚本将 JSON 数据导入新的 PostgreSQL 数据库
3. 表结构与 `init.sql` 一致

## License

MIT
