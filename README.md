# Titan 应用

发布与下载 Unihertz Titan 系列全键盘手机应用的网站。

**线上地址**：<https://adam-ikari.github.io/titan-apps/>

本站是纯静态站点：一个 HTML、一个 CSS、一个 JS，没有构建步骤、没有运行时依赖。
应用源码在另一个私有仓库里，这里只存放站点文件与已签名的 APK。

---

## 与应用源码仓库的关系

| | 仓库 | 可见性 | 内容 |
| --- | --- | --- | --- |
| 应用 | `adam-ikari/titan_dial` | 私有 | Android 工程、签名密钥、测试 |
| 网站 | `adam-ikari/titan-apps`（本仓库） | 公开 | 站点文件、已签名 APK |

应用源码暂不公开，因为该应用**尚未在真机上完成验证**（详见下方「当前状态」）。
验证完成后再决定是否公开源码，届时网站无需改动。

站点内容以本仓库为准：`index.html`、`assets/`、`data/`、`downloads/` 就是线上实际
提供的文件。应用更新后，把新的 APK 与目录数据复制过来即可。

---

## 结构

```
index.html          页面骨架（不依赖 JS 也能看到框架与 noscript 提示）
assets/style.css    样式与设计令牌
assets/app.js       渲染逻辑
data/apps.js        应用目录 —— 要新增应用只改这里
downloads/          已签名的 APK
test/verify.js      jsdom 验证脚本
.nojekyll           让 GitHub Pages 跳过 Jekyll 处理
```

## 新增一个应用

只需要编辑 `data/apps.js`，追加一个对象。页面会自动渲染，**不需要动
`index.html`**。文件顶部有完整的字段说明。

最小可用条目：

```js
{
  id: 'my-app',
  name: '我的应用',
  tagline: '一句话说明',
  status: 'available',        // available | beta | planned
  version: '1.0.0',
  fileName: 'my-app-1.0.0.apk',
  sizeBytes: 123456,
  minAndroid: 'Android 8.0（API 26）',
  keywords: ['标签'],
  highlights: [{ title: '卖点', body: '说明' }],
}
```

把 APK 放进 `downloads/`，文件名与 `fileName` 一致。`sizeBytes` 可用
`stat -c%s downloads/xxx.apk` 取得，`checksum.sha256` 用 `sha256sum` 取得。

### 状态说明

| status | 页面表现 |
| --- | --- |
| `available` | 绿色徽章「可下载」，显示下载按钮 |
| `beta` | 黄色徽章「公测版」，显示下载按钮，并自动显示未实机验证的提醒条 |
| `planned` | 灰色徽章「开发中」，按钮为不可点击的「即将推出」 |

`fileName` 会经过校验：必须是 `.apk` 结尾、不含目录分隔符、不带任何协议前缀。
不合规时不会生成下载链接，而是显示「文件缺失」——这样编辑目录时打错字会立刻
暴露，而不是留下一个死链。

### 为什么目录是 JS 而不是 JSON

站点同时会被部署到 HTTP 服务器，也可能被直接用浏览器打开本地文件。
`fetch()` 在 `file://` 下会被 CORS 拦掉，所以目录数据用全局变量
（`window.TITAN_APPS`）声明，任何环境都能用。

---

## 本地预览

```bash
python3 -m http.server 8099
# 打开 http://127.0.0.1:8099/
```

直接双击 `index.html` 也能看。站点内所有路径都是相对路径，因此在
`/titan-apps/` 这样的子路径下同样正常（已验证）。

## 验证

```bash
cd test
npm install
node verify.js
```

`verify.js` 用 jsdom 真的把两个脚本跑起来，然后断言产出的 DOM，共 66 项检查：
脚本能否执行、骨架与脚本的契约、目录数据完整性、渲染结果、文件名与 URL 校验
（含 `javascript:`、路径穿越等注入用例）、空目录兜底、无障碍与安全检查、
以及配色与实测对比度是否一致。

这不是快照测试。它抓到过两个真实缺陷，值得保留：

- `subsection()` 原本无条件 `appendChild(node)`，传 `null` 会抛异常并让整页白屏。
- `safeUrl()` 原本只接受以 `/`、`./`、`../` 开头的路径，导致
  `downloads/app.apk` 被判非法——**页面上所有下载按钮都是死的**。

---

## 发布

站点由 GitHub Pages 直接从 `main` 分支的仓库根目录提供，无需 CI。

更新流程：

```bash
# 1. 在应用仓库构建并签名
./gradlew :app:assembleRelease

# 2. 复制 APK 与目录数据
cp app-release.apk <本站仓库>/downloads/titan-dial-1.0.0.apk
#    并更新 data/apps.js 里的 sizeBytes / checksum.sha256 / version

# 3. 验证后再提交
cd <本站仓库>/test && node verify.js
```

`.nojekyll` 是必要的：本站根目录的 `_` 前缀路径会被 Jekyll 忽略，
加上这个空文件可以让 Pages 完全跳过 Jekyll 处理。

---

## 无障碍与配色

配色沿用应用的深色 + 绿色主题。色值不是拍脑袋选的，是按 WCAG 反解出来的，
括号里的对比度是实测最低值（取自 bg / surface / surface-2 三种底色）：

| 令牌 | 色值 | 最低对比度 | 用途 |
| --- | --- | --- | --- |
| `--text` | `#e6edf3` | 13.26:1 | 正文 |
| `--text-muted` | `#9fb0c0` | 7.05:1 | 次要正文 |
| `--text-dim` | `#7d8e9e` | 4.65:1 | 辅助信息 |
| `--primary` | `#34d98a` | 8.54:1 | 强调、链接 |
| `--border-strong` | `#5c7083` | 3.06:1 | 按钮/按键的可辨识边界 |

正文全部满足 AA 的 4.5:1；`--border-strong` 满足 WCAG 1.4.11 对非文字元素
边界的 3:1 要求。`--border` 只用于纯装饰分隔线，不承载信息。

另外：所有可点击元素最小 44×44px，焦点样式用 `:focus-visible`，动画全部受
`prefers-reduced-motion` 控制，页面骨架提供 `noscript` 与跳转链接。

---

## 当前状态

| 项目 | 状态 |
| --- | --- |
| 应用单元测试 | 54 项通过 |
| 静态检查 | 0 错误 |
| APK 签名 | 已签署并验证（v2 + v3） |
| 网站验证 | 66 项通过 |
| **真机验证** | **尚未完成** |

真机验证是唯一还缺的一环。应用在逻辑层有测试覆盖，但键盘事件在不同厂商固件上
的行为仍需实测确认——具体来说，Unihertz 固件的 Sym 数字层是否真的会送出数字
键码，决定了用户是否需要手动切换数字模式。

在完成实机验证之前，网站上的应用标示为「公测版」。

---

Unihertz 与 Titan 是 Unihertz 的商标，本站与其无关。