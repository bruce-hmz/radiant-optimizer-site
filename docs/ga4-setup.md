# GA4 接入说明（RadiantOptimizerList.com）

状态（2026-10-12）：**代码已上线，但生产尚未注入 GA4 脚本** —— 因为还没有
Measurement ID。构建脚本的设计是：没有 ID 就完全不注入任何统计代码，所以
当前生产环境保持零统计状态，隐私政策也如实显示 "no analytics"。

## 人工需要完成的两步

### 第 1 步：创建 GA4 Property 并拿到 Measurement ID

1. 打开 <https://analytics.google.com> → 管理（Admin）→ 创建媒体资源（Property）。
2. 媒体资源名建议：`RadiantOptimizerList`；时区/币种按运营者所在地区选。
3. 添加「数据流」（Data Stream）→ 类型选 **Web** → 网站网址填
   `https://radiantoptimizerlist.com`，流名称 `radiantoptimizerlist-web`。
4. 记下网页数据流详情页顶部的 **衡量 ID（Measurement ID）**，格式 `G-XXXXXXXXXX`。

### 第 2 步：把 ID 配置到 Cloudflare 构建环境（推荐）或代码里

推荐方式（不改代码、ID 不进仓库历史）：

1. Cloudflare Dashboard → Workers & Pages → `radiant-optimizer-site` →
   Settings → Build → **Variables and Secrets** → 添加构建变量：
   - 名称：`GA4_MEASUREMENT_ID`
   - 值：`G-XXXXXXXXXX`（第 1 步拿到的）
2. 触发一次重新部署（推送任意提交到 `main`，或在 Deployments 页点 Retry）。

备选方式：直接把 ID 写进 `src/build.mjs` 的
`CONFIG.ga4MeasurementId`（Measurement ID 本身是公开信息，会出现在页面
HTML 里，写死并不泄密，但之后换 ID 需要改代码）。

**验证注入成功**：部署完成后查看页面源码，`<head>` 里应出现
`googletagmanager.com/gtag/js?id=G-XXXX`；`</body>` 前应加载
`/assets/analytics.js`。ID 格式非法时构建会打 WARNING 并按无统计构建。

## 数据流开启后需要在 GA4 后台确认的三项

1. **增强型衡量（Enhanced measurement）**：Admin → 数据流 → 网页流详情 →
   确认 "Enhanced measurement" 开关为 **ON**（新建流默认开启）。保持
   `Page changes based on browser history events` 之外的默认项即可——本站
   是纯静态多页站，page_view 只会发一次，不会重复。
2. **事件级自定义维度**：Admin → 数据定义 → 自定义定义 → 创建自定义维度
   （范围一律选 **事件（Event）**）：

   | 维度名 | 事件参数 | 出现在哪些事件 |
   |---|---|---|
   | Game slug | `game_slug` | game_outbound_click |
   | Game category | `game_category` | game_outbound_click |
   | Destination domain | `destination_domain` | game_outbound_click |
   | Click location | `click_location` | game_outbound_click |
   | Filter group | `filter_group` | game_filter_use |
   | Filter value | `filter_value` | game_filter_use |
   | Search result count | `result_count` | game_search |

   `search_term` 是 GA4 标准参数，无需注册。维度注册后最多 24–48 小时才在
   报表中可拆分，但 DebugView 立即可见。
3. **数据保留**：Admin → 数据设置 → 数据保留，建议从默认 2 个月改为 14 个月
   （便于 7 天观测后的趋势复盘）。

## 上线验收（提供 ID 并部署后 10 分钟内可完成）

1. GA4 → 报告 → 实时（Realtime）：打开 `https://radiantoptimizerlist.com/`，
   应出现 1 个活跃用户；Landing page 显示 `/`。
2. GA4 → 管理 → DebugView：先在本机浏览器任一页面地址后加
   `?gtm_debug=x` 或直接看 DebugView（gtag 无需额外 debug 标志，
   DebugView 会显示同浏览器的命中），依次操作并核对：
   - 打开首页 → `page_view` ×1
   - 点击任一筛选 chip → `game_filter_use` ×1（filter_group/filter_value 正确）
   - 搜索框输入一个词停顿 1 秒 → `game_search` ×1（不是每按键一次）
   - 进任意游戏页点击 "Open project page" → `game_outbound_click` ×1
     （game_slug/destination_domain/click_location=primary_button）
   - Source 段落点击原始链接 → 第二个 `game_outbound_click`
     （click_location=source_inline）
3. 首次访问会出现底部同意横幅；点 Accept 后 GA4 开始设 `_ga` cookie。
   拒绝（Decline）的访客仍会被无 Cookie 聚合计量（Consent Mode v2）。
4. 隐私政策页 `/privacy` 应显示 Google Analytics 使用说明（该段落由构建
   按"是否配置了 ID"自动切换文案）。

## 事件规格（已实现，见 `src/assets/analytics.js`）

| 事件 | 触发 | 参数 | 防重复机制 |
|---|---|---|---|
| `game_outbound_click` | 点击游戏页"Open project page"按钮或 Source 段原始链接 | `game_slug` `game_category` `destination_domain` `click_location`(primary_button/source_inline) | 事件委托单次绑定；一次点击恰好一条 |
| `game_search` | 目录搜索输入停顿 1.2s、按回车或失焦 | `search_term` `result_count` | 防抖 + 连续相同词去重；<2 字符不发送 |
| `game_filter_use` | 点击目录筛选 chip | `filter_group`(cat/dev/col) `filter_value` | 一次点击一条 |

增强型衡量的 `click`（外链点击）事件与 `game_outbound_click` 并存是**有意
设计**：前者是 GA4 自动采集（只有链接 URL），后者带游戏维度，二者不重复
计数 page_view。

## 合规要点

- Consent Mode v2 默认全 denied，横幅只有 Accept/Decline 两键，无暗模式
  （不接受也能正常用站，Declined 流量走无 Cookie 聚合计量）。
- 不采集任何个人身份信息；事件参数只有游戏 slug、类目、目标域名、位置。
- `ad_storage`/`ad_user_data`/`ad_personalization` 永久保持 denied（本站
  无广告），只切换 `analytics_storage`。
- 同意记录存 localStorage（键 `rol-consent`），清除站点数据即可重选。
