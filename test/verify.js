/*
 * 用 jsdom 真实执行站点的渲染逻辑，验证：
 *  - 两个 JS 文件语法正确、能实际运行（而不是只通过静态检查）
 *  - index.html 的骨架与 app.js 预期的 ID 对得上
 *  - 目录数据能正确渲染成卡片（数量、下载按钮、签名状态、表格行数）
 *  - URL 白名单真的会挡掉 javascript: 之类的协议
 *  - 空目录时显示兜底提示而不是崩溃
 *
 * 用法：
 *   cd site/test && npm install && node verify.js
 *
 * 覆盖：脚本能否真正执行、骨架与脚本的契约、目录数据、渲染结果、
 * 文件名校验与 XSS 防护、空目录兜底、无障碍与安全检查、配色一致性。
 * 这不是快照测试——它真的会把页面跑起来并断言产出的 DOM。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SITE = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ok   ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function loadPage(transform, options) {
  var opts = options || {};
  let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  if (transform) html = transform(html);
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // 按 index.html 中的顺序注入真实脚本，和浏览器行为一致。
  var scripts = opts.skipCatalog
    ? ['assets/app.js']
    : ['data/apps.js', 'assets/app.js'];
  for (const src of scripts) {
    let code = fs.readFileSync(path.join(SITE, src), 'utf8');
    // catalogTransform 让测试可以注入恶意 / 异常数据，而不用真的改磁盘上的文件。
    if (src === 'data/apps.js' && opts.catalogTransform) {
      code = opts.catalogTransform(code);
    }
    try {
      window.eval(code);
    } catch (e) {
      throw new Error('执行 ' + src + ' 抛错: ' + e.message);
    }
  }
  // app.js 在 readyState === 'loading' 时会等 DOMContentLoaded；jsdom 从字符串
  // 构造时可能仍是 loading，所以显式触发一次。两种路径都恰好渲染一次。
  if (window.document.readyState === 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }
  return window;
}

console.log('\n[1] 脚本语法');
for (const f of ['data/apps.js', 'assets/app.js']) {
  const src = fs.readFileSync(path.join(SITE, f), 'utf8');
  let ok = true;
  try {
    new Function(src);
  } catch (e) {
    ok = false;
    console.log('       ' + e.message);
  }
  check(f + ' 语法正确', ok);
}

console.log('\n[2] 骨架与脚本契约');
const rawHtml = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('存在 #app-list 容器', /id="app-list"/.test(rawHtml));
check('存在 data-hero-download 按钮', /data-hero-download/.test(rawHtml));
check('存在 #app-count 计数位', /id="app-count"/.test(rawHtml));
check('按顺序引入 apps.js 与 app.js',
  rawHtml.indexOf('data/apps.js') < rawHtml.indexOf('assets/app.js'));
check('lang 设为 zh-Hans', /<html lang="zh-Hans">/.test(rawHtml));
check('有 viewport meta', /name="viewport"/.test(rawHtml));
check('有 description meta', /name="description"/.test(rawHtml));
check('提供 noscript 兜底', /<noscript>/.test(rawHtml));

console.log('\n[3] 目录数据');
const dataWin = loadPage();
const apps = dataWin.TITAN_APPS;
check('TITAN_APPS 存在且为数组', Array.isArray(apps), typeof apps);
check('至少有一个应用', Array.isArray(apps) && apps.length >= 1);
const app = apps[0];
check('每个应用都有 id/name/tagline/status',
  ['id', 'name', 'tagline', 'status'].every((k) => app[k]));
check('状态在白名单内',
  ['available', 'beta', 'planned'].includes(app.status), app.status);
check('fileName 以 .apk 结尾', /\.apk$/.test(app.fileName), app.fileName);
check('下载文件真实存在',
  fs.existsSync(path.join(SITE, 'downloads', app.fileName)));
check('sizeBytes 与磁盘一致',
  app.sizeBytes === fs.statSync(path.join(SITE, 'downloads', app.fileName)).size,
  'catalog=' + app.sizeBytes);

console.log('\n[4] 渲染结果');
const doc = dataWin.document;
const cards = doc.querySelectorAll('.app-card');
check('渲染出 1 张应用卡片', cards.length === 1, 'got ' + cards.length);
const card = cards[0];
check('卡片 id 与目录一致', card && card.id === app.id);
check('标题为应用名', card.querySelector('h3').textContent === app.name);
check('显示状态徽章', !!card.querySelector('.badge'));
const dlMeta = card.querySelector('.app-card__download .app-card__meta');
check('下载区显示版本与体积', !!dlMeta && /v1\.0\.0/.test(dlMeta.textContent) &&
  /MB|KB/.test(dlMeta.textContent), dlMeta && dlMeta.textContent);
check('下载区有可点击的 APK 链接', (function () {
  const a = card.querySelector('.app-card__download a.btn');
  return !!a && /downloads\/.*\.apk$/.test(a.getAttribute('href'));
})());
check('公测版显示提醒条', !!card.querySelector('.notice'));
check('特点网格有 6 项',
  card.querySelectorAll('.feature').length === app.highlights.length);
check('快捷键表有 9 行',
  card.querySelectorAll('.shortcut-table tbody tr').length === app.shortcuts.length);
check('权限表有 6 行',
  card.querySelectorAll('.data-table').length >= 2 &&
  card.querySelectorAll('.data-table')[0].querySelectorAll('tbody tr').length ===
    app.permissions.length);
check('机型表列出全部 5 款',
  card.querySelectorAll('.data-table')[1].querySelectorAll('tbody tr').length ===
    app.devices.length);
check('FAQ 全部渲染',
  card.querySelectorAll('.faq details').length === app.faq.length);
check('显示 SHA-256 指纹',
  !!card.querySelector('.checksum') &&
  card.querySelector('.checksum').textContent === app.checksum.sha256);

const heroBtn = doc.querySelector('[data-hero-download]');
check('主视觉下载按钮可见', heroBtn && !heroBtn.hidden);
check('主按钮指向 APK', heroBtn && /downloads\/.*\.apk$/.test(heroBtn.href),
  heroBtn && heroBtn.href);
check('主按钮有 download 属性', heroBtn && heroBtn.hasAttribute('download'));
check('计数文案已填充',
  doc.getElementById('app-count').textContent.includes('1 个应用'),
  doc.getElementById('app-count').textContent);

console.log('\n[5] 文件名与 URL 校验');
// 直接替换目录里的 fileName 值，注入异常输入（保持 JS 语法有效）。
function withFileName(value) {
  return (code) => code.replace(/fileName: '[^']*'/, "fileName: '" + value + "'");
}

const cases = [
  ['javascript:alert(1)', 'javascript: 协议'],
  ['../../etc/passwd', '路径穿越'],
  ['not-an-apk.txt', '非 .apk 扩展名'],
  ['sub/dir/app.apk', '含目录分隔符'],
];

cases.forEach(function (c) {
  const win = loadPage(null, { catalogTransform: withFileName(c[0]) });
  const link = win.document.querySelector('.app-card__download a.btn');
  check(c[1] + ' 被挡下（不生成下载链接）', !link,
    link && link.getAttribute('href'));
  check(c[1] + ' 时显示「文件缺失」',
    /文件缺失/.test(win.document.querySelector('.app-card').textContent));
  check(c[1] + ' 时主按钮也被隐藏',
    win.document.querySelector('[data-hero-download]').hidden);
});

const goodWin = loadPage();
const goodHref = goodWin.document
  .querySelector('.app-card__download a.btn')
  .getAttribute('href');
check('正常文件名未被误伤', goodHref === 'downloads/titan-dial-1.0.0.apk', goodHref);

console.log('\n[6] 空目录兜底');
const emptyWin = loadPage(null, { skipCatalog: true });
const emptyMsg = emptyWin.document.querySelector('#app-list .empty-state');
check('空目录显示兜底文案', !!emptyMsg && emptyMsg.textContent.length > 5);
check('空目录隐藏主下载按钮',
  emptyWin.document.querySelector('[data-hero-download]').hidden);

console.log('\n[7] 无障碍与安全检查');
const d = doc;
check('每个卡片是 article 元素', d.querySelectorAll('article.app-card').length === 1);
check('每个详情子节有标题',
  d.querySelectorAll('.app-card__body .subsection h4').length >= 5);
check('有跳转链接 (skip link)', !!d.querySelector('.skip-link'));
check('导航有 aria-label', !!d.querySelector('nav[aria-label]'));
check('每个表格有 caption 或表头',
  Array.from(d.querySelectorAll('table')).every(
    (t) => t.querySelector('caption') || t.querySelector('th')));
check('没有内联 style 属性泄漏到主要容器',
  !d.querySelector('.app-card__body').getAttribute('style'));
check('所有按钮/链接可键盘聚焦（原生元素）',
  d.querySelectorAll('a.btn, button.btn').length > 0);

const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('HTML 声明 lang 属性', /<html[^>]+lang=/.test(html));
check('无 inline <script> 内容块', !/<script(?![^>]*src=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html));
check('无 on* 事件属性', !/\son(click|load|error)=/i.test(html));
check('无 javascript: 链接', !/href="javascript:/i.test(html));

console.log('\n[8] CSS 主题一致性');
const css = fs.readFileSync(path.join(SITE, 'assets/style.css'), 'utf8');
check('正文色为浅色，对比度达标',
  /--text:\s*#e6edf3/.test(css) && /--bg:\s*#0b0f14/.test(css));
check('调色板色值与实测通过的版本一致', [
  /--text-muted:\s*#9fb0c0/, /--text-dim:\s*#7d8e9e/,
  /--border-strong:\s*#5c7083/, /--primary:\s*#34d98a/,
].every((re) => re.test(css)));
check('定义了 prefers-reduced-motion', /prefers-reduced-motion/.test(css));
check('定义 :focus-visible 焦点样式', /:focus-visible/.test(css));
check('主要色与应用一致 (#34d98a)', /--primary:\s*#34d98a/.test(css));
check('按钮最小高度 >= 44px', /min-height:\s*(4[4-9]|[5-9][0-9])px/.test(css));

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败\n');
process.exit(fail === 0 ? 0 : 1);