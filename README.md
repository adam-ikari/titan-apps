# Titan 应用网站

介绍与分发 Unihertz Titan 系列全键盘手机应用的静态站点。

## 为什么是静态站

零构建、零依赖、零运行时：一个 HTML、一个 CSS、一个 JS。所有内容都在
`data/apps.js` 里。丢进 GitHub Pages、Netlify、对象存储，或者直接双击
`index.html` 打开都能工作——没有需要维护的构建链，也没有会过期的依赖。

## 结构

```
site/
  index.html          页面骨架（不依赖 JS 也能看到框架与 noscript 提示）
  assets/style.css    样式与设计令牌
  assets/app.js       渲染逻辑
  data/apps.js        应用目录 —— 要新增应用只改这里
  downloads/          APK 文件
  test/verify.js      jsdom 验证脚本
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

把 APK 放进 `downloads/`，文件名与 `fileName` 一致。`sizeBytes` 用于显示
体积，可用 `stat -c%s downloads/xxx.apk` 取得。

### 状态说明

| status | 页面表现 |
| --- | --- |
| `available` | 绿色徽章「可下载」，显示下载按钮 |
| `beta` | 黄色徽章「公测版」，显示下载按钮，并自动显示未实机验证的提醒条 |
| `planned` | 灰色徽章「开发中」，按钮为不可点击的「即将推出」 |

`fileName` 会经过校验：必须是 `.apk` 结尾、不含目录分隔符、不带任何协议前缀。
不合规时不会生成下载链接，而是显示「文件缺失」——这样编辑目录时打错字会立刻
暴露，而不是留下一个死链。

## 本地预览

```bash
cd site
python3 -m http.server 8099
# 打开 http://127.0.0.1:8099/
```

直接双击 `index.html` 也能看。目录数据用的是全局变量而不是 `fetch()`
加载 JSON，因此在 `file://` 下不会被 CORS 拦住。

## 验证

```bash
cd site/test
npm install
node verify.js
```

`verify.js` 用 jsdom 真的把两个脚本跑起来，然后断言产出的 DOM，共 66 项检查：
脚本能否执行、骨架与脚本的契约、目录数据完整性、渲染结果、文件名与 URL 校验
（含 `javascript:`、路径穿越等注入用例）、空目录兜底、无障碍与安全检查、
以及配色与实测对比度是否一致。

这个脚本抓到过两个真实缺陷，值得保留：

- `subsection()` 原本无条件 `appendChild(node)`，传 `null` 会抛异常并让整页白屏。
- `safeUrl()` 原本只接受以 `/`、`./`、`../` 开头的路径，导致
  `downloads/app.apk` 被判非法——**页面上所有下载按钮都是死的**。

## 无障碍与配色

配色沿用 App 的深色 + 绿色主题。色值不是拍脑袋选的，是按 WCAG 反解出来的，
括号里的对比度是实测最低值（取自三种底色）：

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

## 发布

```bash
VERSION=1.1.0

# 1. 先升版本：app/build.gradle.kts 里的 versionCode 与 versionName。
#    versionCode 不升，已安装的使用者就拿不到可以覆盖安装的 APK。

# 2. 构建并签名
./gradlew :app:assembleRelease

# 3. 放进下载目录，文件名与目录里的 fileName 一致；旧版 APK 可以删掉，
#    页面只链当前版本
cp app/build/outputs/apk/release/app-release.apk \
   site/downloads/titan-dial-$VERSION.apk

# 4. 取新的体积与指纹，填进 data/apps.js 的 sizeBytes 与 checksum.sha256
stat -c%s site/downloads/titan-dial-$VERSION.apk
sha256sum site/downloads/titan-dial-$VERSION.apk

# 5. 同步 data/apps.js 的 version / updated / fileName / changelog

# 6. 验证
cd site/test && node verify.js
```

`verify.js` 里与版本有关的断言都从目录数据推导（版本号、各表格行数），不发新版
不需要动测试；真正会失败的是「磁盘上的 APK 与 `sizeBytes` 不一致」这类实质错误。

`site/downloads/` 里的 APK **是**提交进 Git 的（约 1 MB），这样仓库本身就是
一个完整可部署的站点，`git push` 之后可以直接开 GitHub Pages，不用另外传文件。

如果你更希望把 APK 放在 GitHub Releases 或对象存储上：

1. 把 `site/downloads/` 加进 `.gitignore`；
2. 把目录里的 `fileName` 换成完整 URL，`safeUrl()` 允许 `http`/`https`；
3. 部署站点时不必带上 `downloads/`。

两种方式 `verify.js` 都能正常通过——文件名不合规时它会报「文件缺失」而不是
悄悄留下死链。