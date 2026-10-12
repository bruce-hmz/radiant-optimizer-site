# AdSense 申请记录（radiantoptimizerlist.com）

## 审计结论（2026-10-12，apply 前）

全量 73 项审计结论：**Ready after fixes**。已修复：

- 隐私政策现在按构建状态生成"Advertising"披露段（AdSense 代码上线的同时披露第三方广告 Cookie、Google Ads Settings / aboutads.info 退出入口、EEA/UK 同意说明）。
- `ads.txt` 在配置 publisher ID 后自动生成（`google.com, pub-…, DIRECT, f08c47fec0942fa0`）。
- AdSense 加载器与 GA4 同一套模式：环境变量 `ADSENSE_CLIENT`（格式 `ca-pub-XXXXXXXXXXXXXXXX`）控制，非法值 WARNING 并按无广告构建。**只放加载器不等于展示广告**——过审且账户开启 Auto ads/广告位之前不会有任何广告展示。

## 已知且被接受的残余风险

- **`ADS-PUB-02` 版权关联内容（主要被拒风险）**：目录核心是指向商业游戏浏览器移植/反编译项目（SM64 反编译、GoldenEye 反编译、MK DOS、GTA 归档、Eaglercraft）。文案有合规框架（不提供文件、要求合法拷贝、非关联声明），但 AdSense 审核对 ROM/decomp 目录严格，可能直接拒绝"低价值内容"或版权依据。拒绝记录会留在账户上。
- 站点上线仅数天、无已验证流量历史，加重上述风险。

## 激活流程（拿到 publisher ID 后）

1. `ADSENSE_CLIENT=ca-pub-…` 配置到 Cloudflare Workers Builds 变量（或直接写进
   `src/build.mjs` CONFIG——ca-pub 是公开信息），推送部署。
2. 验证：首页源码含 `adsbygoogle.js?client=ca-pub-…`；`/ads.txt` 返回 200；
   `/privacy` 出现 Advertising 段。
3. AdSense 后台 Sites → Request review。

## 过审后必须完成（展示广告之前）

1. **EEA/UK 合规 CMP**：Google 要求数字广告使用 **Google 认证的 CMP**（自研
   横幅不合规）。接入 CookieYes / CookieBot 等认证 CMP 并让它同时接管 GA4
   与广告同意。仅服务非个性化广告也需 EEA 同意。
2. 账户里确认广告类型偏好（建议先保持 Auto ads 关闭，只放 1-2 个不易误点
   的位置，避免 ADS-PUB-10 布局违规）。
3. 绝不自己点击广告；流量来源保持自然搜索，勿买流量（ADS-PROG-01/04）。
4. 如账号面向儿童内容定向：本站按普通受众处理，不要开启儿童定向。

## 申请日志

| 时间 (UTC+8) | 事件 |
|---|---|
| 2026-10-12 | 审计完成；隐私披露/ads.txt/加载器代码上线（配置化）；开始账户创建 |
| 2026-10-12 15:0x | 发现原账户 pub-1367977665012576 国家锁定美国（时区底特律，非美付款资料全部灰色禁用）；经确认后关闭该账户（余额 $0，无损失） |
| 2026-10-12 15:2x | 用同一谷歌账号重新注册：国家选**中国**，站点 radiantoptimizerlist.com，新账户 **pub-7087310872799317**（时区上海，付款账号自动挂接"AdSense（中国）"资料） |
| 2026-10-12 15:3x | 新 pub ID 部署上线（加载器 + ads.txt + 隐私广告披露）；Google 验证网站所有权通过（"您的网站已通过验证"）；已点击"申请审核"，站点状态变为**正在准备** |

## 审核期间与过审后

- 审核通常 **几天到两周**；期间保持站点正常可访问、不要大改首页结构。
- AdSense 后台 ads.txt 状态可能显示"未找到"——是爬虫缓存延迟，生产
  `https://radiantoptimizerlist.com/ads.txt` 已 200 返回正确内容，会自动刷新。
- 过审后、真正展示广告前，先完成 `过审后必须完成` 清单（认证 CMP 最重要）。
- 收款前还需在 AdSense 后台完成身份/电话验证（如 Google 要求），并核对
  付款资料里的中文姓名与地址无误。
