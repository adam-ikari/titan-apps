/*
 * 从 data/apps.js 渲染页面。
 *
 * 采用渐进增强：index.html 里已经有静态的页头与页脚（不依赖 JS 也能看到框架），
 * 这里只负责填充应用目录。若脚本未执行，会显示 <noscript> 提示而不是空白页。
 *
 * 所有来自目录的文本都经过 textContent 写入，链接的 href 经过协议白名单校验，
 * 避免以后编辑目录时不小心引入可执行的 URL。
 */
(function () {
  'use strict';

  var STATUS_LABELS = {
    available: '可下载',
    beta: '公测版',
    planned: '开发中',
  };

  /* ---------- 工具函数 ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * 校验目录里给出的 APK 文件名。
   *
   * 必须单独校验文件名本身：只校验拼好的 'downloads/' + fileName 是不够的，
   * 因为 fileName 里的 'javascript:alert(1)' 会被拼成
   * 'downloads/javascript:alert(1)'，看起来就像一个正常的相对路径而通过检查，
   * 结果是指向一个 404 的死链而不是给出提示。
   */
  function safeFileName(name) {
    if (typeof name !== 'string') return null;
    var value = name.trim();
    if (value === '') return null;
    if (/[\/\\]/.test(value)) return null;              // 不允许目录分隔符
    if (/^[a-z][a-z0-9+.\-]*:/i.test(value)) return null; // 不允许带协议
    if (!/^[A-Za-z0-9._\-]+\.apk$/i.test(value)) return null; // 只接受 .apk
    return value;
  }

  /** 指向某个 APK 的站内地址；文件名不合法时返回 null。 */
  function downloadHref(fileName) {
    var file = safeFileName(fileName);
    return file ? safeUrl('downloads/' + file) : null;
  }

  /**
   * 只放行站内相对路径与 http(s) 链接，挡掉 javascript: 之类的协议。
   *
   * 早期版本只接受以 / 、./ 、../ 开头的路径，结果把 downloads/app.apk
   * 这种正常的相对路径也判为非法，导致页面上所有下载按钮都失效。
   */
  function safeUrl(url) {
    if (typeof url !== 'string') return null;
    var value = url.trim();
    if (value === '') return null;

    // 指向外部发布页（GitHub Releases 等）是可以的。
    if (/^https?:\/\//i.test(value)) return value;

    // 其余任何带协议前缀的形式一律拒绝：javascript:、data:、file: 等。
    if (/^[a-z][a-z0-9+.\-]*:/i.test(value)) return null;

    // 协议相对地址（//evil.example）会跳到站外，也拒绝。
    if (value.slice(0, 2) === '//') return null;

    // 剩下只可能是站内相对路径；含空白或引号的一律拒绝，避免拼进属性时出问题。
    if (/[\s<>"'`]/.test(value)) return null;

    return value;
  }

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || bytes <= 0) return null;
    if (bytes < 1024) return bytes + ' B';
    var mb = bytes / (1024 * 1024);
    if (mb < 1) return (bytes / 1024).toFixed(0) + ' KB';
    return mb.toFixed(1) + ' MB';
  }

  /* ---------- 组件 ---------- */

  function renderStatus(status) {
    var key = STATUS_LABELS[status] ? status : 'planned';
    return el('span', 'badge badge--' + key, STATUS_LABELS[key]);
  }

  function renderDownload(app) {
    var wrap = el('div', 'app-card__download');
    var href = downloadHref(app.fileName);

    if (app.status === 'available' || app.status === 'beta') {
      if (!href) {
        var missing = el('span', 'badge', '文件缺失');
        wrap.appendChild(missing);
        return wrap;
      }
      var a = el('a', 'btn btn--primary btn--sm');
      a.href = href;
      a.setAttribute('download', '');
      a.appendChild(el('span', null, '下载 APK'));
      wrap.appendChild(a);

      var meta = [app.version ? 'v' + app.version : null, formatBytes(app.sizeBytes)]
        .filter(Boolean)
        .join(' · ');
      if (meta) wrap.appendChild(el('span', 'app-card__meta', meta));
    } else {
      var btn = el('button', 'btn btn--ghost btn--sm');
      btn.type = 'button';
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = '即将推出';
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function renderFeatureGrid(features) {
    var grid = el('div', 'feature-grid');
    (features || []).forEach(function (f) {
      var card = el('div', 'feature');
      card.appendChild(el('h5', null, f.title));
      card.appendChild(el('p', null, f.body));
      grid.appendChild(card);
    });
    return grid;
  }

  function renderShortcutTable(shortcuts) {
    var table = el('table', 'shortcut-table');
    var caption = el(
      'caption',
      null,
      '在拨号盘、通话记录、通讯录三个分页中都可以使用。'
    );
    table.appendChild(caption);
    var body = el('tbody');
    (shortcuts || []).forEach(function (s) {
      var tr = el('tr');
      var th = el('th');
      var kbd = el('kbd', null, s.key);
      th.appendChild(kbd);
      tr.appendChild(th);
      tr.appendChild(el('td', null, s.desc));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function renderPermissionTable(permissions) {
    var table = el('table', 'data-table');
    var thead = el('thead');
    var htr = el('tr');
    htr.appendChild(el('th', null, '权限'));
    htr.appendChild(el('th', null, '用途'));
    thead.appendChild(htr);
    table.appendChild(thead);
    var body = el('tbody');
    (permissions || []).forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('td', null, p.name));
      tr.appendChild(el('td', null, p.why));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function renderDeviceTable(devices) {
    var table = el('table', 'data-table');
    var thead = el('thead');
    var htr = el('tr');
    htr.appendChild(el('th', null, '机型'));
    htr.appendChild(el('th', null, '系统'));
    htr.appendChild(el('th', null, '状态'));
    thead.appendChild(htr);
    table.appendChild(thead);
    var body = el('tbody');
    (devices || []).forEach(function (d) {
      var tr = el('tr');
      tr.appendChild(el('td', null, d.name));
      tr.appendChild(el('td', null, d.os));
      tr.appendChild(
        el(
          'td',
          null,
          d.verified
            ? '已在真机验证'
            : '待真机验证（理论兼容）'
        )
      );
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function renderFaq(faq) {
    var wrap = el('div', 'faq');
    (faq || []).forEach(function (item) {
      var d = el('details');
      var summary = el('summary', null, item.q);
      d.appendChild(summary);
      d.appendChild(el('p', null, item.a));
      wrap.appendChild(d);
    });
    return wrap;
  }

  function subsection(title, node) {
    var s = el('div', 'subsection');
    s.appendChild(el('h4', null, title));
    // node is optional: some sections build their own children (e.g. the
    // checksum block, which needs two elements rather than one).
    if (node) s.appendChild(node);
    return s;
  }

  function renderApp(app) {
    var card = el('article', 'app-card');
    card.id = app.id;

    /* 顶部：图标 + 名称 + 下载 */
    var top = el('div', 'app-card__top');
    top.appendChild(el('div', 'app-card__icon', '☎'));

    var idBlock = el('div', 'app-card__id');
    var title = el('div', 'app-card__title');
    title.appendChild(el('h3', null, app.name));
    title.appendChild(renderStatus(app.status));
    idBlock.appendChild(title);
    idBlock.appendChild(el('p', 'app-card__tagline', app.tagline));

    var metaBits = [];
    if (app.minAndroid) metaBits.push(app.minAndroid);
    if (app.updated) metaBits.push('更新于 ' + app.updated);
    if (metaBits.length) {
      idBlock.appendChild(el('span', 'app-card__meta', metaBits.join(' · ')));
    }
    top.appendChild(idBlock);
    top.appendChild(renderDownload(app));
    card.appendChild(top);

    /* 主体 */
    var body = el('div', 'app-card__body');
    if (app.intro) body.appendChild(el('p', 'app-card__intro', app.intro));

    if (app.keywords && app.keywords.length) {
      var ul = el('ul', 'keywords');
      app.keywords.forEach(function (k) {
        ul.appendChild(el('li', null, k));
      });
      body.appendChild(ul);
    }

    if (app.status === 'beta') {
      var notice = el('div', 'notice');
      notice.appendChild(el('span', 'notice__icon', '!'));
      var np = el('p');
      np.textContent =
        '本应用尚未在真机上完成验证：逻辑层有自动化测试覆盖，' +
        '但不同厂商固件对键盘事件的处理存在差异。建议安装后先用测试号码确认数字输入正常。';
      notice.appendChild(np);
      body.appendChild(notice);
    }

    if (app.highlights && app.highlights.length) {
      body.appendChild(
        subsection('特点', renderFeatureGrid(app.highlights))
      );
    }
    if (app.shortcuts && app.shortcuts.length) {
      body.appendChild(
        subsection('实体键盘快捷键', renderShortcutTable(app.shortcuts))
      );
    }
    if (app.permissions && app.permissions.length) {
      body.appendChild(
        subsection('权限说明', renderPermissionTable(app.permissions))
      );
    }
    if (app.devices && app.devices.length) {
      body.appendChild(
        subsection('兼容机型', renderDeviceTable(app.devices))
      );
    }

    if (app.checksum && app.checksum.sha256) {
      var verify = subsection('校验与签名', null);
      var sumBox = el('div');
      sumBox.appendChild(el('div', 'checksum', app.checksum.sha256));
      if (app.checksum.verifiedWith) {
        sumBox.appendChild(
          el('p', 'app-card__meta', app.checksum.verifiedWith)
        );
      }
      verify.appendChild(sumBox);
      body.appendChild(verify);
    }

    if (app.faq && app.faq.length) {
      body.appendChild(subsection('常见问题', renderFaq(app.faq)));
    }

    card.appendChild(body);
    return card;
  }

  /* ---------- 主流程 ---------- */

  function render() {
    var apps = window.TITAN_APPS || [];
    var list = document.getElementById('app-list');
    if (!list) return;

    list.textContent = '';

    if (!apps.length) {
      list.appendChild(
        el(
          'p',
          'empty-state',
          '目前还没有发布任何应用。这里会展示 Titan 系列的全键盘应用。'
        )
      );
      return;
    }

    var frag = document.createDocumentFragment();
    apps.forEach(function (app) {
      frag.appendChild(renderApp(app));
    });
    list.appendChild(frag);

    /* 页头的主下载按钮指向第一个可下载的应用 */
    var heroBtn = document.querySelector('[data-hero-download]');
    if (heroBtn) {
      var target = apps.filter(function (a) {
        return a.status === 'available' || a.status === 'beta';
      })[0];
      if (target) {
        var href = downloadHref(target.fileName);
        if (href) {
          heroBtn.href = href;
          heroBtn.setAttribute('download', '');
          heroBtn.textContent = '下载 ' + target.name;
          heroBtn.hidden = false;
        }
      } else {
        heroBtn.hidden = true;
      }
    }

    /* 应用数量 */
    var countNode = document.getElementById('app-count');
    if (countNode) {
      countNode.textContent =
        apps.length === 1 ? '目前有 1 个应用' : '目前有 ' + apps.length + ' 个应用';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();