# 打牌记账应用 (Poker Score)

多人云端协作的打牌记账应用，通过房间码共享数据，实时同步牌局记录。

## 技术架构

- 前端：React + TypeScript + Tailwind CSS + shadcn/ui
- 后端：NestJS + Drizzle ORM + PostgreSQL
- 实时同步：前端轮询（5秒间隔）
- 无需注册登录，通过房间码访问

## 数据库设计

### rooms 房间表
- id: uuid (PK)
- roomCode: varchar (唯一索引，房间码/邀请码)
- roomName: varchar (房间名称)
- createdAt / updatedAt: timestamptz

### players 人员表
- id: uuid (PK)
- roomId: uuid (FK → rooms.id)
- name: varchar (人员姓名)
- createdAt: timestamptz

### games 牌局表
- id: uuid (PK)
- roomId: uuid (FK → rooms.id)
- gameDate: date (牌局日期)
- createdAt / updatedAt: timestamptz

### game_players 牌局人员明细表
- id: uuid (PK)
- gameId: uuid (FK → games.id)
- playerId: uuid (FK → players.id)
- buyIn: numeric (买入金额)
- balance: numeric (结余金额)
- netProfit: numeric (净盈亏 = 结余 - 买入)
- createdAt / updatedAt: timestamptz

## 设计规范

### 主题：深绿色牌桌 + 金色强调

- 牌桌深绿背景：`#0d4f2c` (主背景) / `#0a3d22` (次级背景)
- 牌桌绿色渐变：从 `#0d4f2c` 到 `#07301a`
- 金色强调色：`#d4af37` / `#f0c84a` (亮金)
- 金色文字：`#e8c96a`
- 卡片背景：`rgba(255,255,255,0.06)` 半透明白 + 边框 `rgba(212,175,55,0.3)`
- 文字颜色：`#f0f0e8` (主文字) / `#b8b8a8` (次级文字)
- 盈利色（红）：`#ef4444`
- 亏损色（绿）：`#22c55e`

### 布局
- 最大内容宽度：960px，居中
- 页面内边距：水平 20px，垂直 24px
- 卡片间距：16px
- 圆角：12px
- 阴影：柔和金色光晕 `0 4px 20px rgba(212,175,55,0.15)`

### 字体
- 标题：font-semibold，金色
- 正文：text-base，浅灰白色
- 数字金额：font-mono，等宽字体
