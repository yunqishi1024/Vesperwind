# vesperwind · 64×64 双角色像素换装游戏

> Cloudflare 上的双角色换装游戏 + MCP Server,可被 Claude / Mira 等 AI 调用。

## 角色

- **Vesper** · 18-20 岁女大学生 · 174cm · 深棕近黑长发 · 可拆卸黑色猫耳/猫尾(灵动动画)
- **Cedar** · 40 岁男教授 · 188cm · 圆/方框眼镜 · 西装马甲 · 手持粉笔/书

## 项目结构

```
vesperwind/
├── src/
│   ├── Vesperwind.jsx              # 主组件
│   └── sprites/
│       ├── palette.js              # 64×64 调色板
│       ├── characters.js           # 两个角色的身体/头发/猫耳/猫尾精灵图
│       └── clothing.js             # 衣物素材库
├── worker/
│   └── index.js                    # Cloudflare Worker + MCP Server + Durable Object
├── wrangler.toml                   # Cloudflare 部署配置
└── package.json
```

## 已实现功能

### 前端
- [x] 64×64 双角色 Canvas 像素渲染(沿用米色+栗棕 UI 美学)
- [x] 猫耳:3 帧颤动循环 + 随机扰动
- [x] 猫尾:6 帧 S 形摆动
- [x] 整体呼吸动画(头部/躯干上半正弦浮动)
- [x] 猫耳/猫尾可拆卸开关
- [x] Cedar 眼镜切换(无 / 圆框 / 方框)
- [x] 衣物分槽位(top/bottom/dress/shoes/accessory + 男版 shirt/vest/jacket/tie/handheld)
- [x] dress 与 top+bottom 互斥逻辑
- [x] 预设保存/加载

### MCP Server(基础版)
- [x] `list_items` — 列出某角色所有可装备衣物
- [x] `get_state` — 获取双角色当前完整状态
- [x] `equip` — 装备一件衣物(已穿则脱)
- [x] `unequip` — 卸下指定槽位
- [x] `toggle_cat` — 切换 Vesper 猫耳/猫尾
- [x] `save_preset` / `load_preset` — 预设管理

### 持久化
- [x] Durable Object 按 `x-user-id` 多租户隔离

## 本地运行

```bash
# 安装依赖
npm install

# 前端开发服务器
npm run dev          # → http://localhost:5173

# Worker 本地调试
npm run worker:dev   # → http://localhost:8787
```

## 部署到 Cloudflare

```bash
# 部署 Worker(包含 MCP + API + Durable Object)
npm run worker:deploy

# 部署前端到 Cloudflare Pages
npm run deploy
```

部署后:
- 前端:`https://vesperwind.pages.dev`
- Worker / MCP:`https://vesperwind.<your-subdomain>.workers.dev`
- MCP endpoint:`POST https://vesperwind.<your>.workers.dev/mcp`

## MCP 客户端配置示例

### Claude Desktop / Mira

```json
{
  "mcpServers": {
    "vesperwind": {
      "url": "https://vesperwind.<your>.workers.dev/mcp",
      "transport": "http"
    }
  }
}
```

### AI 调用示例

```
User: 让 Vesper 穿薄荷糖色连衣裙配白帆布鞋,并打开猫耳
AI:   → equip(character="vesper", item_id="mint_dress")
      → equip(character="vesper", item_id="canvas_white")
      → toggle_cat(part="catEars")  // 如果当前是关
```

## 扩展方向

- [ ] 进阶 MCP:主题套装(`apply_theme: "lecture_day" | "rainy_campus"`)
- [ ] 完整 MCP:情绪/姿势控制(让 AI 控制 Vesper "害羞低头")
- [ ] R2 存储自定义衣物 PNG 切片
- [ ] 双人合影渲染(`render_scene` 返回 PNG URL)
- [ ] WebSocket 实时联动(AI 改装扮 → 网页同步动画)

## 设计备注

- 像素精度选 64×64 是甜点区:Cedar 的圆框眼镜(2px 框)、Vesper 的猫耳粉色内衬(1px 高光)、领带结、扣子都能清晰表达
- 字符画 grid 形式保留:便于人类和 AI 直接编辑素材
- 渲染管线:多层 grid → compose → Canvas 2D fillRect。零 GPU 压力,移动端流畅
- 呼吸动画:头部和躯干上半 y 偏移 ±1px,周期 2s,正弦曲线
