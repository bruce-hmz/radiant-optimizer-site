# 7 天流量观测表（P0）

目的：为后续广告 / Affiliate 变现决策积累第一手数据。每天同一时间（建议
UTC 早上，覆盖前一天完整数据）填一行。GA4 数据有 24–48h 延迟处理是正常
的，前两天的行允许后补。

## 前置条件（一次性）

- [ ] GA4 Property 已创建，`GA4_MEASUREMENT_ID` 已配置到 Cloudflare 构建变量并重新部署（见 `docs/ga4-setup.md`）。
- [ ] GA4 事件级自定义维度已注册（Game slug / Game category / Destination domain / Click location / Filter group / Filter value / Search result count）。
- [ ] Google Search Console 已验证 `radiantoptimizerlist.com`（DNS TXT 或 HTML 标记方式）；若尚未验证，GSC 列先留空并在备注写 "GSC 未验证"。

## 每日记录表

| 日期 | GSC 点击 | GSC 展示 | GSC CTR | GSC Top 查询 | GA4 Sessions | GA4 用户数 | Top Landing Page | Top 国家 | 移动端占比 | game_outbound_click 总数 | Top 3 游戏（按外链点击） | 外链点击用户占比* | game_search 次数 | game_filter_use 次数 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 __-__-__ | | | | | | | | | | | | | | | |
| D2 __-__-__ | | | | | | | | | | | | | | | |
| D3 __-__-__ | | | | | | | | | | | | | | | |
| D4 __-__-__ | | | | | | | | | | | | | | | |
| D5 __-__-__ | | | | | | | | | | | | | | | |
| D6 __-__-__ | | | | | | | | | | | | | | | |
| D7 __-__-__ | | | | | | | | | | | | | | | |

\* 外链点击用户占比 = 触发过 game_outbound_click 的去重用户 ÷ 总用户。
GA4 里用「探索（Explore）→ 自由形式」：维度选 Game slug，指标选事件数
和用户数；或报表 → 事件 → game_outbound_click → 按用户数排序。

## 数据出处对照

| 列 | 在哪里取 |
|---|---|
| GSC 点击/展示/CTR/查询 | GSC → 效果（Performance）→ 筛选"国家/全球"，对比前一天 |
| Sessions / 用户 / Landing page | GA4 → 报告 → 获取流量 → 着陆页 |
| 国家 / 设备 | GA4 → 报告 → 用户 → 地理位置 / 技术设备类别 |
| 外链点击排名 | GA4 → 报告 → 事件 → game_outbound_click → 按次维度 Game slug 二级展开（维度注册 48h 后可用） |
| 外链点击来源页面 | GA4 探索 → 维度"着陆页/页面" × 指标"事件数"，筛选事件=game_outbound_click |

## 每日 5 分钟检查清单（防止观测期白跑）

1. GA4 实时报告有流量（哪怕 1–2 个自己的访问）；连续两天零数据 → 按
   `docs/ga4-setup.md` 的验收段排查。
2. `game_outbound_click` 有事件但参数全是 "(unknown)" → 说明页面缓存了旧
   版本 HTML，检查 Cloudflare 缓存。
3. GSC 覆盖率报告看索引页数是否从 0 增长；7 天内至少首页应被收录。

## 第 7 天复盘要回答的问题（下一轮 P0/P1 的依据）

1. 自然搜索有没有真实点击？Top 查询和现有 10 个 genre hub 页匹配吗？
2. 哪 3 个游戏贡献了最多外链点击？它们的落地页是游戏详情页还是目录页？
3. 搜索词里有没有目录没覆盖的游戏名（内容缺口信号）？
4. 移动端占比是否 >60%？如果是，游戏详情页的移动端体验优先级提高。
5. 外链点击用户占比 ≥10% 即可认为"目录 → 项目"的引导有效，可以开始评估
   Affiliate 替换方案；<3% 则先优化引导文案而不是变现。
6. 同意横幅的接受率（GA4 里 consent 相关维度或 `_ga` cookie 设置率）能否
   支撑足够样本；接受率过低时考虑更轻量的横幅文案。
