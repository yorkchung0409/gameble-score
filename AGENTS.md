# 打牌记账应用 (Poker Score)

多人云端协作的打牌记账应用，通过房间码共享数据，实时同步牌局记录。

## 技术架构

- 前端：React + TypeScript + Tailwind CSS + shadcn/ui
- 后端：NestJS + Drizzle ORM + MySQL 8
- 小程序实时同步：WebSocket，断线回退长轮询，跨实例版本通过 MySQL 共享
- 微信小程序通过云托管注入的 OpenID 登录；Web 旧版房间仍通过房间码访问

## 数据库设计

### rooms 房间表
- id: CHAR(36) UUID (PK)
- roomCode: varchar (唯一索引，房间码/邀请码)
- roomName: varchar (房间名称)
- createdAt / updatedAt: DATETIME，统一按东八区驱动转换

### players 人员表
- id: CHAR(36) UUID (PK)
- roomId: CHAR(36) (FK → rooms.id)
- name: varchar (人员姓名)
- createdAt: DATETIME

### games 牌局表
- id: CHAR(36) UUID (PK)
- roomId: CHAR(36) (FK → rooms.id)
- gameDate: date (牌局日期)
- operationId: varchar（新建牌局防重复）
- createdAt: DATETIME

### game_players 牌局人员明细表
- id: CHAR(36) UUID (PK)
- gameId: CHAR(36) (FK → games.id)
- playerId: CHAR(36) (FK → players.id)
- buyIn / balance / netProfit: DECIMAL(14,2)
- createdAt: DATETIME

## 设计规范

### 主题：浅色工作界面 + 牌桌绿强调

- 页面背景：`#F4F6F1`
- 主操作绿：`#1E7A46`
- 主文字：`#222B26`，次文字：`#6B7A70`
- 卡片背景：`#FFFFFF`，边框：`#E6EAE2`
- 茶水费使用统一 SVG 图标；头像颜色按用户 ID 确定性生成

### 布局
- 最大内容宽度：520px，居中
- 页面内边距：水平 20px，垂直 24px
- 卡片间距：16px
- 紧凑排版优先，但所有文本必须完整显示
- 弹窗居中，底部自定义 TabBar 不得遮挡弹窗内容

### 字体
- 标题：font-semibold，深色
- 正文：text-base，深色或中性灰
- 数字金额：font-mono，等宽字体
