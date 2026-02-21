// ==UserScript==
// @name         Twitter 1Click Block & Mute
// @namespace    twitter-block-userscript
// @version      1.3.4
// @description  Add one-click block/mute buttons to tweets, profiles, and search suggestions on Twitter/X
// @author       nemut.ai
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://raw.githubusercontent.com/satomasahiro2005/twitter-1click-block-and-mute/main/userscripts/twitter-block.user.js
// @downloadURL  https://raw.githubusercontent.com/satomasahiro2005/twitter-1click-block-and-mute/main/userscripts/twitter-block.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  const PROCESSED = 'data-twblock';
  const RESERVED_PATHS = new Set([
    'home', 'explore', 'search', 'notifications', 'messages',
    'settings', 'i', 'compose', 'login', 'logout', 'signup',
    'tos', 'privacy', 'about', 'help', 'jobs', 'download',
  ]);

  // ---- SVGアイコン（ストレージ or パッシブ取得で動的設定） ----
  let BLOCK_ICON = '';
  let MUTE_ICON = '';

  const CHECK_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/></svg>';

  function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getIcon(action) {
    return action === 'block' ? BLOCK_ICON : MUTE_ICON;
  }
  // ---- i18n ----
  const _L = navigator.language.startsWith('ja') ? 'ja' : 'en';
  const _M = {"en":{"extName":"Twitter 1Click Block & Mute","extDescription":"Add one-click block and mute buttons on Twitter","blockLabel":"Block","muteLabel":"Mute","blockedStatus":"Blocked","mutedStatus":"Muted","unblockLabel":"Unblock","unmuteLabel":"Unmute","toastBlocked":"Blocked @$1","toastMuted":"Muted @$1","toastUnblocked":"Unblocked @$1","toastUnmuted":"Unmuted @$1","errorTimeout":"Timed out","errorOccurred":"An error occurred","popupDescription":"One-click block & mute from tweets and profiles","settingsLabel":"Settings","sectionButtons":"Button Display","showBlockButton":"Show block button","showMuteButton":"Show mute button","confirmBlockFollowingLabel":"Confirm before blocking followed users","confirmBlockFollowing":"You are following @$1. Block anyway?","sectionStats":"Statistics","resetStats":"Reset Statistics","sectionReset":"Reset","resetHint":"Reset all data (statistics, icons, settings) to defaults","fullReset":"Full Reset Extension","confirmReset":"Reset all data (statistics and settings)?","supportLabel":"Support"},"ja":{"extName":"Twitter 1Click Block & Mute","extDescription":"Twitter でワンクリックでブロック・ミュートできるボタンを追加します","blockLabel":"ブロック","muteLabel":"ミュート","blockedStatus":"ブロック済み","mutedStatus":"ミュート済み","unblockLabel":"ブロック解除","unmuteLabel":"ミュート解除","toastBlocked":"@$1 をブロックしました","toastMuted":"@$1 をミュートしました","toastUnblocked":"@$1 のブロックを解除しました","toastUnmuted":"@$1 のミュートを解除しました","errorTimeout":"タイムアウトしました","errorOccurred":"エラーが発生しました","popupDescription":"ツイートやプロフィールに表示されるボタンでワンクリックブロック＆ミュート","settingsLabel":"設定","sectionButtons":"ボタン表示","showBlockButton":"ブロックボタンを表示","showMuteButton":"ミュートボタンを表示","confirmBlockFollowingLabel":"フォロー中のユーザーをブロックする前に確認する","confirmBlockFollowing":"@$1 はフォロー中です。ブロックしますか？","sectionStats":"統計","resetStats":"統計をリセット","sectionReset":"リセット","resetHint":"統計・アイコン・設定をすべて初期状態に戻します","fullReset":"拡張機能を完全リセット","confirmReset":"すべてのデータ（統計・設定）をリセットしますか？","supportLabel":"サポート"}};
  function _i18n(key) { return (_M[_L] || _M.en)[key] || key; }
  const i18n = {};
  function cacheI18n() {
    const keys = [
      'blockLabel', 'muteLabel', 'blockedStatus', 'mutedStatus',
      'unblockLabel', 'unmuteLabel', 'errorTimeout', 'errorOccurred',
    ];
    for (const k of keys) i18n[k] = _i18n(k);
  }
  function msg(key, sub) {
    if (sub != null) {
      const s = _i18n(key);
      return s.replace(/\$1/g, sub);
    }
    return i18n[key] || _i18n(key) || key;
  }
  // ---- 設定 ----
  let showBlock = true;
  let showMute = true;
  let confirmBlockFollowing = false;

  // ---- アイコン更新（ストレージ or パッシブ監視） ----
  let iconsExtracted = false;

  // ストレージから保存済みアイコンを読み込み
  function loadStoredIcons() {
    return new Promise((resolve) => {
      try {
        const stored = JSON.parse(localStorage.getItem('twblock_icons'));
        if (stored) {
          if (stored.block) BLOCK_ICON = stored.block;
          if (stored.mute) MUTE_ICON = stored.mute;
          iconsExtracted = true;
        }
      } catch {}
      resolve();
    });
  }

  // 設定を読み込み
  function loadSettings() {
    return new Promise((resolve) => {
      try {
        const stored = JSON.parse(localStorage.getItem('twblock_settings'));
        if (stored) {
          showBlock = stored.showBlock !== false;
          showMute = stored.showMute !== false;
          confirmBlockFollowing = stored.confirmBlockFollowing === true;
        }
      } catch {}
      resolve();
    });
  }

  // 既存ボタンのアイコンを一括差し替え
  function replaceAllButtonIcons() {
    document.querySelectorAll('.twblock-block:not(.twblock-success)').forEach(btn => {
      btn.innerHTML = BLOCK_ICON;
    });
    document.querySelectorAll('.twblock-mute:not(.twblock-success)').forEach(btn => {
      btn.innerHTML = MUTE_ICON;
    });
  }

  // メニューアイテムからBlock/MuteのSVGを抽出する共通ロジック
  function extractIconsFromMenuItems(menuItems) {
    let foundBlock = false, foundMute = false;

    for (const item of menuItems) {
      const text = item.textContent || '';
      const pathEl = item.querySelector('svg path');
      if (!pathEl) continue;
      const d = pathEl.getAttribute('d');
      if (!d) continue;

      if (!foundBlock && /\bBlock\b|ブロック/.test(text) && !/Unblock|ブロック解除/.test(text)) {
        BLOCK_ICON = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="' + escapeAttr(d) + '" fill="currentColor"/></svg>';
        foundBlock = true;
      }
      if (!foundMute && /\bMute\b|ミュート/.test(text) && !/Unmute|ミュート解除|conversation|会話/.test(text)) {
        MUTE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="' + escapeAttr(d) + '" fill="currentColor"/></svg>';
        foundMute = true;
      }
    }

    if (foundBlock || foundMute) {
      iconsExtracted = true;
      localStorage.setItem('twblock_icons', JSON.stringify({ block: BLOCK_ICON, mute: MUTE_ICON }));
      replaceAllButtonIcons();
    }
  }

  // アクティブ取得: layersを非表示にしてメニューを開き、アイコン抽出後にメニュー要素をdisplay:noneで隠す
  let extractRetries = 0;
  function extractIconsOnce() {
    if (iconsExtracted) return;

    const caret = document.querySelector('[data-testid="caret"]');
    const layers = document.getElementById('layers');
    if (!caret || !layers) {
      if (++extractRetries <= 5) {
        setTimeout(extractIconsOnce, 2000);
      }
      return;
    }

    // メニュー展開前の#layers子要素を記録
    const childrenBefore = new Set(layers.children);

    // メニューを見えなくする
    layers.style.visibility = 'hidden';

    // MutationObserverでメニュー出現を即検知
    const mo = new MutationObserver(() => {
      const menuItems = document.querySelectorAll('[role="menuitem"]');
      if (menuItems.length === 0) return;

      mo.disconnect();
      extractIconsFromMenuItems(menuItems);

      // layersのvisibilityを復元
      layers.style.visibility = '';

      // メニューで追加された要素をdisplay:noneで隠す
      // DOM削除するとReactのfiber treeが壊れるため、非表示にするだけ
      for (const child of layers.children) {
        if (!childrenBefore.has(child)) {
          child.style.display = 'none';
        }
      }
    });

    mo.observe(layers, { childList: true, subtree: true });
    caret.click();

    // タイムアウト: 3秒以内に完了しなければ中止
    setTimeout(() => {
      mo.disconnect();
      layers.style.visibility = '';
    }, 3000);
  }

  // パッシブ監視: ユーザーが⋯メニューを開いた時にアイコンを抽出・更新
  function observeLayers() {
    const layers = document.getElementById('layers');
    if (!layers) {
      setTimeout(observeLayers, 1000);
      return;
    }

    const layersObserver = new MutationObserver(() => {
      if (!iconsExtracted) {
        setTimeout(() => {
          const menuItems = document.querySelectorAll('[role="menuitem"]');
          if (menuItems.length > 0) extractIconsFromMenuItems(menuItems);
        }, 300);
      }
    });

    layersObserver.observe(layers, { childList: true, subtree: true });
  }
  // ---- ページスクリプト注入（@grant none: ページコンテキストで直接実行） ----
  function injectPageScript() {
    (function () {
  'use strict';

  let capturedHeaders = null;

  // Twitterのfetchをインターセプトして認証ヘッダーを取得
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [url, options] = args;
    if (typeof url === 'string' && url.includes('/i/api/')) {
      if (options && options.headers) {
        const headers =
          options.headers instanceof Headers
            ? Object.fromEntries(options.headers.entries())
            : options.headers;
        if (headers['authorization'] && headers['x-csrf-token']) {
          capturedHeaders = {
            authorization: headers['authorization'],
            'x-csrf-token': headers['x-csrf-token'],
          };
        }
      }
    }
    return originalFetch.apply(this, args);
  };

  // フォールバック: XMLHttpRequestもインターセプト
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._twblockUrl = url;
    this._twblockHeaders = {};
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._twblockHeaders) {
      this._twblockHeaders[name.toLowerCase()] = value;
    }
    return origSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._twblockUrl && this._twblockUrl.includes('/i/api/')) {
      const h = this._twblockHeaders;
      if (h && h['authorization'] && h['x-csrf-token']) {
        capturedHeaders = {
          authorization: h['authorization'],
          'x-csrf-token': h['x-csrf-token'],
        };
      }
    }
    return origSend.apply(this, args);
  };

  // ct0 cookieからCSRFトークンを取得
  function getCsrfToken() {
    const match = document.cookie.match(/ct0=([^;]+)/);
    return match ? match[1] : null;
  }

  // 公開ベアラートークン（Twitter Web Appに埋め込まれている固定値）
  const BEARER_TOKEN =
    'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs' +
    '%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

  function getHeaders() {
    if (capturedHeaders) return { ...capturedHeaders };
    const csrf = getCsrfToken();
    if (csrf) {
      return {
        authorization: 'Bearer ' + decodeURIComponent(BEARER_TOKEN),
        'x-csrf-token': csrf,
      };
    }
    return null;
  }

  // ブロック/ミュートAPIを呼び出す
  async function performAction(action, screenName) {
    const headers = getHeaders();
    if (!headers) {
      return { success: false, error: 'NO_AUTH', message: '認証情報が取得できません。ページを操作してから再試行してください。' };
    }

    const endpoints = {
      block: 'https://x.com/i/api/1.1/blocks/create.json',
      unblock: 'https://x.com/i/api/1.1/blocks/destroy.json',
      mute: 'https://x.com/i/api/1.1/mutes/users/create.json',
      unmute: 'https://x.com/i/api/1.1/mutes/users/destroy.json',
    };

    const url = endpoints[action];
    if (!url) {
      return { success: false, error: 'INVALID_ACTION', message: '不明なアクション: ' + action };
    }

    try {
      const response = await originalFetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: 'screen_name=' + encodeURIComponent(screenName),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      }

      // 403: CSRFトークン失効 → ct0 cookieから再取得してリトライ
      if (response.status === 403) {
        const freshCsrf = getCsrfToken();
        if (freshCsrf && freshCsrf !== headers['x-csrf-token']) {
          const retryResponse = await originalFetch(url, {
            method: 'POST',
            headers: {
              ...headers,
              'x-csrf-token': freshCsrf,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            credentials: 'include',
            body: 'screen_name=' + encodeURIComponent(screenName),
          });
          if (retryResponse.ok) {
            capturedHeaders = { ...headers, 'x-csrf-token': freshCsrf };
            const data = await retryResponse.json();
            return { success: true, data };
          }
        }
        return { success: false, error: 'FORBIDDEN', message: 'セッションが期限切れです。ページを再読み込みしてください。' };
      }

      if (response.status === 429) {
        return { success: false, error: 'RATE_LIMITED', message: 'レート制限に達しました。しばらく待ってから再試行してください。' };
      }

      return { success: false, error: 'HTTP_' + response.status, message: await response.text() };
    } catch (err) {
      return { success: false, error: 'NETWORK', message: err.message };
    }
  }

  // フォロー状態を確認するAPI
  async function checkFollowing(screenName) {
    const headers = getHeaders();
    if (!headers) {
      return { following: false };
    }

    try {
      const url = 'https://x.com/i/api/1.1/friendships/show.json?source_screen_name=&target_screen_name=' + encodeURIComponent(screenName);
      const response = await originalFetch(url, {
        method: 'GET',
        headers: { ...headers },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        return { following: data.relationship?.source?.following === true };
      }
      return { following: false };
    } catch (err) {
      return { following: false };
    }
  }

  // content.jsからのメッセージを受信
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === '__TWBLOCK_ACTION') {
      const { action, screenName, requestId } = event.data;
      const result = await performAction(action, screenName);
      window.postMessage(
        { type: '__TWBLOCK_RESULT', requestId, ...result },
        '*'
      );
    }
    if (event.data && event.data.type === '__TWBLOCK_CHECK_FOLLOWING') {
      const { screenName, requestId } = event.data;
      const result = await checkFollowing(screenName);
      window.postMessage(
        { type: '__TWBLOCK_RESULT', requestId, ...result },
        '*'
      );
    }
  });

  // 準備完了を通知
  window.postMessage({ type: '__TWBLOCK_READY' }, '*');
})();
  }
  // ---- メッセージブリッジ ----
  const pending = new Map();
  let reqId = 0;

  function sendAction(action, screenName) {
    return new Promise((resolve) => {
      const id = '__twb_' + ++reqId;
      pending.set(id, resolve);
      window.postMessage(
        { type: '__TWBLOCK_ACTION', action, screenName, requestId: id },
        '*'
      );
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve({ success: false, error: 'TIMEOUT', message: msg('errorTimeout') });
        }
      }, 15000);
    });
  }

  function checkFollowing(screenName) {
    return new Promise((resolve) => {
      const id = '__twb_' + ++reqId;
      pending.set(id, resolve);
      window.postMessage(
        { type: '__TWBLOCK_CHECK_FOLLOWING', screenName, requestId: id },
        '*'
      );
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve({ following: false });
        }
      }, 5000);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== '__TWBLOCK_RESULT') return;
    const cb = pending.get(e.data.requestId);
    if (cb) {
      pending.delete(e.data.requestId);
      cb(e.data);
    }
  });

  // ---- screen_name 抽出 ----
  function extractScreenName(el) {
    const links = el.querySelectorAll('a[role="link"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && /^\/[A-Za-z0-9_]{1,15}$/.test(href)) {
        return href.substring(1);
      }
    }
    const spans = el.querySelectorAll('span');
    for (const span of spans) {
      const m = span.textContent.match(/^@([A-Za-z0-9_]{1,15})$/);
      if (m) return m[1];
    }
    const allLinks = el.querySelectorAll('a[href]');
    for (const link of allLinks) {
      const m = link.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/status\//);
      if (m) return m[1];
    }
    return null;
  }

  function getProfileScreenName() {
    const m = window.location.pathname.match(/^\/([A-Za-z0-9_]{1,15})$/);
    if (m && !RESERVED_PATHS.has(m[1].toLowerCase())) return m[1];
    return null;
  }

  let myScreenName = null;
  function getMyScreenName() {
    if (myScreenName) return myScreenName;
    const navLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (navLink) {
      const href = navLink.getAttribute('href');
      if (href) { myScreenName = href.replace('/', ''); return myScreenName; }
    }
    return null;
  }

  // ---- トースト通知 ----
  // ---- Twitterアクセントカラー取得 ----
  const ACCENT_COLORS = new Set([
    'rgb(29, 155, 240)',   // Blue
    'rgb(255, 212, 0)',    // Yellow
    'rgb(249, 24, 128)',   // Pink
    'rgb(120, 86, 255)',   // Purple
    'rgb(255, 122, 0)',    // Orange
    'rgb(0, 186, 124)',    // Green
  ]);
  const DEFAULT_ACCENT = 'rgb(29, 155, 240)';

  function getAccentColor() {
    const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
    if (activeTab) {
      for (const div of activeTab.querySelectorAll('div')) {
        const bg = getComputedStyle(div).backgroundColor;
        if (ACCENT_COLORS.has(bg)) return bg;
      }
    }
    return DEFAULT_ACCENT;
  }

  function showToast(message) {
    const existing = document.querySelector('.twblock-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'twblock-toast';
    toast.textContent = message;
    toast.style.backgroundColor = getAccentColor();
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('twblock-toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---- ツイート非表示（共通ロジック） ----
  function createHiddenBar(screenName, action, onUndo) {
    const bar = document.createElement('div');
    bar.className = 'twblock-hidden-bar';
    const statusLabel = action === 'block' ? msg('blockedStatus') : msg('mutedStatus');
    const undoLabel = action === 'block' ? msg('unblockLabel') : msg('unmuteLabel');
    const undoAction = action === 'block' ? 'unblock' : 'unmute';
    const undoToastKey = action === 'block' ? 'toastUnblocked' : 'toastUnmuted';
    bar.innerHTML =
      '<span class="twblock-hidden-label">' + statusLabel + ' @' + screenName + '</span>' +
      '<button class="twblock-show-btn">' + undoLabel + '</button>';

    bar.querySelector('.twblock-show-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '…';

      const result = await sendAction(undoAction, screenName);
      if (result.success) {
        onUndo(action);
        bar.remove();
        showToast(msg(undoToastKey, screenName));
      } else {
        btn.disabled = false;
        btn.textContent = undoLabel;
      }
    });

    return bar;
  }

  function hideTweet(tweet, screenName, action) {
    if (tweet.querySelector(':scope > .twblock-hidden-bar')) return;

    const contentWrapper = tweet.querySelector(':scope > div');
    if (!contentWrapper) return;
    contentWrapper.style.display = 'none';

    const bar = createHiddenBar(screenName, action, (act) => {
      contentWrapper.style.display = '';
      const twblockBtn = tweet.querySelector('.twblock-' + act + '.twblock-success');
      if (twblockBtn) {
        twblockBtn.classList.remove('twblock-success');
        twblockBtn.innerHTML = getIcon(act);
        twblockBtn._isActive = false;
      }
    });

    tweet.insertBefore(bar, tweet.firstChild);
  }

  // ---- 引用ツイート非表示 ----
  function hideQuotedTweet(quotedBlock, screenName, action) {
    if (quotedBlock.querySelector('.twblock-hidden-bar')) return;

    const hiddenChildren = [];
    for (const child of quotedBlock.children) {
      child.style.display = 'none';
      hiddenChildren.push(child);
    }

    const bar = createHiddenBar(screenName, action, (act) => {
      hiddenChildren.forEach(child => { child.style.display = ''; });
      const twblockBtn = quotedBlock.querySelector('.twblock-' + act + '.twblock-success');
      if (twblockBtn) {
        twblockBtn.classList.remove('twblock-success');
        twblockBtn.innerHTML = getIcon(act);
        twblockBtn._isActive = false;
      }
    });

    quotedBlock.insertBefore(bar, quotedBlock.firstChild);
  }

  // ---- ボタン作成 ----
  function createButtons(screenName, tweet) {
    if (!showBlock && !showMute) return null;

    const container = document.createElement('div');
    container.className = 'twblock-btn-container';
    container.setAttribute('data-screen-name', screenName);

    if (showBlock) {
      container.appendChild(createButton(screenName, 'block', msg('blockLabel'), tweet));
    }
    if (showMute) {
      container.appendChild(createButton(screenName, 'mute', msg('muteLabel'), tweet));
    }

    return container;
  }

  function createButton(screenName, action, label, tweet) {
    const btn = document.createElement('button');
    btn.className = 'twblock-btn twblock-' + action;
    btn.setAttribute('aria-label', label + ' @' + screenName);
    btn.title = label + ' @' + screenName;
    btn.innerHTML = getIcon(action);

    btn._isActive = false;
    const undoAction = action === 'block' ? 'unblock' : 'unmute';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;

      btn.disabled = true;
      btn.classList.add('twblock-loading');

      const currentAction = btn._isActive ? undoAction : action;

      // フォロー中ユーザーのブロック確認
      if (confirmBlockFollowing && action === 'block' && !btn._isActive) {
        const followResult = await checkFollowing(screenName);
        if (followResult.following) {
          btn.classList.remove('twblock-loading');
          btn.disabled = false;
          if (!confirm(msg('confirmBlockFollowing', screenName))) return;
          btn.disabled = true;
          btn.classList.add('twblock-loading');
        }
      }

      const result = await sendAction(currentAction, screenName);
      btn.classList.remove('twblock-loading');

      if (result.success) {
        if (!btn._isActive) {
          btn._isActive = true;
          btn.classList.add('twblock-success');
          btn.innerHTML = CHECK_ICON;
          btn.title = (action === 'block' ? msg('blockedStatus') : msg('mutedStatus')) + ' @' + screenName;
          btn.disabled = false;
          showToast(msg(action === 'block' ? 'toastBlocked' : 'toastMuted', screenName));

          // 引用ツイート内のボタンなら引用部分にバー表示
          const btnContainer = btn.closest('.twblock-btn-container');
          if (btnContainer && btnContainer._quotedBlock) {
            setTimeout(() => hideQuotedTweet(btnContainer._quotedBlock, screenName, action), 300);
          } else {
            const parentTweet = btn.closest('article[data-testid="tweet"]');
            if (parentTweet) {
              setTimeout(() => hideTweet(parentTweet, screenName, action), 300);
            }
          }
        } else {
          btn._isActive = false;
          btn.classList.remove('twblock-success');
          btn.innerHTML = getIcon(action);
          btn.title = label + ' @' + screenName;
          btn.disabled = false;
        }
      } else {
        btn.classList.add('twblock-error');
        btn.title = result.message || msg('errorOccurred');
        btn.disabled = false;
        setTimeout(() => btn.classList.remove('twblock-error'), 3000);
      }
    });

    return btn;
  }

  // ---- Grok/caretの行を見つけて、その中にボタンを挿入 ----
  function findGrokRow(tweet) {
    const caret = tweet.querySelector('[data-testid="caret"]');
    if (!caret) return null;

    let fallbackRow = null;
    let node = caret.parentElement;
    for (let i = 0; i < 8; i++) {
      if (!node || node === tweet) break;
      const cs = getComputedStyle(node);
      if (cs.display === 'flex' && cs.flexDirection === 'row') {
        const grokBtn = node.querySelector('[aria-label^="Grok"]');
        if (grokBtn) return { row: node, grokBtn, caret };
        // caretの直近の狭い行(67px)ではなく、アクションバー全体の広い行(>200px)を使う
        if (node.contains(caret) && node.offsetWidth > 200) {
          fallbackRow = node;
          break;
        }
      }
      node = node.parentElement;
    }
    return fallbackRow ? { row: fallbackRow, grokBtn: null, caret } : null;
  }

  // ---- RT: リツイーターと元投稿者を分離抽出 ----
  function extractRetweetInfo(tweet) {
    const sc = tweet.querySelector('[data-testid="socialContext"]');
    if (!sc) return null;
    const link = sc.closest('a[href]');
    if (!link) return null;
    const href = link.getAttribute('href');
    if (!href || !/^\/[A-Za-z0-9_]{1,15}$/.test(href)) return null;
    // "reposted"リンクの親flex-row と リンク要素自体
    let scRow = link.parentElement;
    for (let i = 0; i < 3; i++) {
      if (!scRow) break;
      const cs = getComputedStyle(scRow);
      if (cs.display === 'flex' && cs.flexDirection === 'row') break;
      scRow = scRow.parentElement;
    }
    // リンクの直接の親(flex-column) — ここをflex-rowにしてボタンを横並びにする
    const scLinkParent = link.parentElement;
    return { retweeter: href.substring(1), scRow, scLinkParent };
  }

  // ツイート本文エリアからscreen_nameを抽出（socialContext内のリンクを除外）
  function extractAuthorScreenName(tweet) {
    const userName = tweet.querySelector('[data-testid="User-Name"]');
    if (userName) {
      const result = extractScreenName(userName);
      if (result) return result;
    }
    return null;
  }

  // ---- ボタン挿入: タイムラインツイート ----
  function processTweets() {
    const me = getMyScreenName();
    const tweets = document.querySelectorAll(
      'article[data-testid="tweet"]:not([' + PROCESSED + '])'
    );

    tweets.forEach((tweet) => {
      // 内部DOMが未レンダリングならスキップ（次回再試行）
      if (!tweet.querySelector('[data-testid="User-Name"]') ||
          !tweet.querySelector('[data-testid="caret"]')) return;

      try {
        tweet.setAttribute(PROCESSED, '1');

        const rtInfo = extractRetweetInfo(tweet);

        // RT者のボタンを"reposted"行に挿入
        if (rtInfo && rtInfo.retweeter !== me && rtInfo.scLinkParent) {
          const rtButtons = createButtons(rtInfo.retweeter, tweet);
          if (rtButtons) {
            rtButtons.classList.add('twblock-tweet');
            rtButtons.classList.add('twblock-repost');
            rtInfo.scLinkParent.classList.add('twblock-repost-row');
            rtInfo.scLinkParent.appendChild(rtButtons);
          }
        }

        // 元投稿者のボタンをgrok/caret行に挿入
        const authorName = rtInfo ? extractAuthorScreenName(tweet) : extractScreenName(tweet);
        if (!authorName || authorName === me) {
          processQuotedTweet(tweet, me);
          return;
        }

        const grokInfo = findGrokRow(tweet);
        if (grokInfo) {
          const { row, grokBtn } = grokInfo;
          const buttons = createButtons(authorName, tweet);
          if (!buttons) return;
          buttons.classList.add('twblock-tweet');
          buttons.style.marginLeft = 'auto';
          buttons.style.paddingLeft = '4px';
          if (grokBtn) {
            let grokChild = null;
            for (const child of row.children) {
              if (child.contains(grokBtn)) { grokChild = child; break; }
            }
            if (grokChild) {
              row.insertBefore(buttons, grokChild);
            } else {
              row.insertBefore(buttons, row.firstChild);
            }
          } else {
            // caretを含む子要素の直前に挿入（⋯の左側に配置）
            let caretChild = null;
            for (const child of row.children) {
              if (child.contains(grokInfo.caret)) { caretChild = child; break; }
            }
            if (caretChild) {
              row.insertBefore(buttons, caretChild);
            } else {
              row.appendChild(buttons);
            }
          }
        }

        processQuotedTweet(tweet, me);
      } catch (e) {
        tweet.removeAttribute(PROCESSED);
      }
    });
  }

  // ---- ボタン挿入: 引用ツイート ----
  function processQuotedTweet(parentTweet, me) {
    const candidates = parentTweet.querySelectorAll(
      'div[role="link"], div[tabindex="0"]'
    );

    candidates.forEach((block) => {
      if (block.hasAttribute(PROCESSED)) return;
      if (block.closest('article') !== parentTweet) return;

      const userName = block.querySelector('[data-testid="User-Name"]');
      if (!userName) return;

      const parentUserName = parentTweet.querySelector('[data-testid="User-Name"]');
      if (userName === parentUserName) return;

      const qtScreenName = extractScreenName(block);
      if (!qtScreenName || qtScreenName === me) return;

      block.setAttribute(PROCESSED, '1');

      const buttons = createButtons(qtScreenName, null);
      if (!buttons) return;
      buttons._quotedBlock = block;

      // User-Nameの親flex-rowを探してインラインに挿入
      let targetRow = null;
      let node = userName.parentElement;
      for (let i = 0; i < 5; i++) {
        if (!node || node === block) break;
        const cs = getComputedStyle(node);
        if (cs.display === 'flex' && cs.flexDirection === 'row') {
          targetRow = node;
          break;
        }
        node = node.parentElement;
      }
      if (!targetRow) return;

      // targetRow〜block間の祖先コンテナを広げて全幅にする
      let ancestor = targetRow;
      while (ancestor && ancestor !== block) {
        ancestor.style.flexGrow = '1';
        ancestor.style.minWidth = '0';
        ancestor = ancestor.parentElement;
      }

      buttons.classList.add('twblock-tweet');
      buttons.style.marginLeft = 'auto';
      buttons.style.paddingLeft = '8px';
      targetRow.appendChild(buttons);
    });
  }

  // ---- ボタン挿入: 全Followボタン共通処理 ----
  function processFollowButtons() {
    const me = getMyScreenName();

    const followBtns = document.querySelectorAll(
      '[data-testid$="-follow"]:not([' + PROCESSED + ']), [data-testid$="-unfollow"]:not([' + PROCESSED + '])'
    );

    followBtns.forEach((btn) => {
      if (btn.closest('article[data-testid="tweet"]')) return;

      btn.setAttribute(PROCESSED, '1');

      const hoverCard = btn.closest('[data-testid="HoverCard"]');
      const userCell = btn.closest('[data-testid="UserCell"]');
      const placement = btn.closest('[data-testid="placementTracking"]');
      const isProfile = placement && !userCell && !hoverCard;

      let screenName;
      if (isProfile) {
        screenName = getProfileScreenName();
      } else {
        const container = userCell || hoverCard || btn.parentElement;
        screenName = extractScreenName(container);
      }
      if (!screenName || screenName === me) return;

      let targetRow = null;
      let startNode = isProfile ? placement.parentElement : btn.parentElement;
      for (let i = 0; i < 4; i++) {
        if (!startNode) break;
        const cs = getComputedStyle(startNode);
        if (cs.display === 'flex' && cs.flexDirection === 'row') {
          targetRow = startNode;
          break;
        }
        startNode = startNode.parentElement;
      }
      if (!targetRow || targetRow.querySelector('.twblock-btn-container')) return;

      const cssClass = isProfile ? 'twblock-profile' : 'twblock-sidebar';
      const buttons = createButtons(screenName, null);
      if (!buttons) return;
      buttons.classList.add(cssClass);

      let followChild = isProfile ? placement : null;
      if (!followChild) {
        for (const child of targetRow.children) {
          if (child.contains(btn)) { followChild = child; break; }
        }
      }
      if (!followChild) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'twblock-follow-wrapper';
      targetRow.insertBefore(wrapper, followChild);
      wrapper.appendChild(buttons);
      wrapper.appendChild(followChild);

      // Followボタン親のmargin-leftをリセット（X側の12pxが余計）
      followChild.style.marginLeft = '0';

      if (isProfile) {
        // ボタンコンテナを上揃えにして⋯/Followと縦位置を合わせる
        buttons.style.alignSelf = 'flex-start';
        // gapを⋯のmargin-right(8px)に揃える
        buttons.style.gap = '8px';
        wrapper.style.gap = '8px';
      }
    });
  }

  // ---- 設定変更のリアルタイム反映 ----
  function applyButtonVisibility() {
    document.querySelectorAll('.twblock-block').forEach(btn => {
      btn.style.display = showBlock ? '' : 'none';
    });
    document.querySelectorAll('.twblock-mute').forEach(btn => {
      btn.style.display = showMute ? '' : 'none';
    });
    document.querySelectorAll('.twblock-btn-container').forEach(container => {
      const hasVisible = container.querySelector('.twblock-btn:not([style*="display: none"])');
      container.style.display = hasVisible ? '' : 'none';
    });
  }

  // ---- ボタン挿入: 検索候補(typeahead)のユーザー ----
  function processTypeahead() {
    const me = getMyScreenName();
    const items = document.querySelectorAll(
      '[data-testid="typeaheadRecentSearchesItem"]:not([' + PROCESSED + ']), [data-testid="typeaheadResult"]:not([' + PROCESSED + '])'
    );

    items.forEach((item) => {
      if (!item.querySelector('img')) return; // ユーザー項目のみ（検索クエリは除外）
      item.setAttribute(PROCESSED, '1');

      const screenName = extractScreenName(item);
      if (!screenName || screenName === me) return;

      // item > div > div(flex/row) > div(textArea) > div(flex/row): [名前] [Xボタン]
      const container = item.children[0]?.children[0];
      if (!container) return;
      const textArea = container.children[1];
      if (!textArea) return;
      const row = textArea.children[0];
      if (!row || row.querySelector('.twblock-btn-container')) return;

      const buttons = createButtons(screenName, null);
      if (!buttons) return;
      buttons.classList.add('twblock-typeahead');

      // Xボタン(最後の子)の前に挿入
      const xBtn = row.querySelector('button');
      if (xBtn) {
        row.insertBefore(buttons, xBtn);
      } else {
        row.appendChild(buttons);
      }
    });
  }

  // ---- メイン処理 ----
  function processAll() {
    processTweets();
    processFollowButtons();
    processTypeahead();
  }

  let rafScheduled = false;
  let trailingTimer = null;
  const observer = new MutationObserver(() => {
    // 次の描画フレームで即処理（ツイートと同フレームにボタン表示）
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        processAll();
      });
    }
    // rAF時点で未完成だった要素を拾うフォールバック
    if (trailingTimer) clearTimeout(trailingTimer);
    trailingTimer = setTimeout(processAll, 200);
  });

  let lastUrl = location.href;
  function checkUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(processAll, 500);
    }
  }
  // ---- CSS注入 ----
  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = "/* ========== Twitter 1Click Block & Mute ========== */\n\n/* Followボタン + twblockボタンのラッパー */\n.twblock-follow-wrapper {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  flex-shrink: 0;\n}\n\n/* ラッパー内のFollowボタン親のmargin-leftをリセット */\n.twblock-follow-wrapper > :not(.twblock-btn-container) {\n  margin-left: 0 !important;\n}\n\n/* ボタンコンテナ（共通） */\n.twblock-btn-container {\n  display: flex;\n  align-items: center;\n  gap: 0;\n  flex-shrink: 0;\n}\n\n/* ツイートヘッダー: Grok/caret行内に配置 (Grok/caretと同サイズ) */\n.twblock-btn-container.twblock-tweet {\n  flex: 0 0 auto;\n  gap: 8px;\n}\n\n.twblock-btn-container.twblock-tweet .twblock-btn {\n  width: 20px;\n  height: 20px;\n  position: relative;\n  overflow: visible;\n}\n\n.twblock-btn-container.twblock-tweet .twblock-btn::before {\n  content: '';\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  width: 34px;\n  height: 34px;\n  margin: -17px;\n  border-radius: 50%;\n  transition: background-color 0.15s ease;\n}\n\n.twblock-btn-container.twblock-tweet .twblock-btn svg {\n  width: 18.75px;\n  height: 18.75px;\n  position: relative;\n}\n\n/* ツイートボタン: ホバー背景は::beforeで表示、ボタン自体は透明 */\n.twblock-btn-container.twblock-tweet .twblock-block:hover:not(:disabled),\n.twblock-btn-container.twblock-tweet .twblock-mute:hover:not(:disabled) {\n  background-color: transparent;\n}\n\n.twblock-btn-container.twblock-tweet .twblock-block:hover:not(:disabled)::before {\n  background-color: rgba(244, 33, 46, 0.1);\n}\n\n.twblock-btn-container.twblock-tweet .twblock-mute:hover:not(:disabled)::before {\n  background-color: rgba(255, 173, 31, 0.1);\n}\n\n.twblock-btn-container.twblock-tweet .twblock-success:hover {\n  background-color: transparent !important;\n}\n\n.twblock-btn-container.twblock-tweet .twblock-success:hover::before {\n  background-color: rgba(244, 33, 46, 0.1);\n}\n\n/* RT(\"reposted\")行のpadding-top:12pxを上下に分散 */\n.twblock-repost-row .r-ttdzmv {\n  padding-top: 6px;\n  padding-bottom: 6px;\n}\n\n/* RT(\"reposted\")行の親をflex-rowに変更して横並びにする */\n.twblock-repost-row {\n  flex-direction: row !important;\n  align-items: center;\n  gap: 4px;\n}\n\n/* RT(\"reposted\")行: テキスト(16px/20px line-height)とアイコンの中心を揃える */\n.twblock-btn-container.twblock-repost {\n  gap: 4px;\n  margin-top: -2px;\n  margin-bottom: -2px;\n}\n\n.twblock-btn-container.twblock-repost .twblock-btn::before {\n  display: none;\n}\n\n/* プロフィール: Followボタンと同じ高さ(36px)の丸ボタン */\n.twblock-btn-container.twblock-profile {\n  gap: 8px;\n  align-self: flex-start;\n}\n\n.twblock-btn-container.twblock-profile .twblock-btn {\n  width: 36px;\n  height: 36px;\n  border-radius: 50%;\n  border: 1px solid light-dark(rgb(207, 217, 222), rgb(83, 100, 113));\n  color: light-dark(rgb(15, 20, 26), rgb(230, 233, 234));\n}\n\n.twblock-btn-container.twblock-profile .twblock-btn svg {\n  width: 20px;\n  height: 20px;\n}\n\n/* 検索候補(typeahead): Xボタンの左に配置 */\n.twblock-btn-container.twblock-typeahead {\n  gap: 4px;\n  flex-shrink: 0;\n  margin-left: auto;\n}\n\n.twblock-btn-container.twblock-typeahead .twblock-btn {\n  width: 20px;\n  height: 20px;\n}\n\n.twblock-btn-container.twblock-typeahead .twblock-btn svg {\n  width: 18px;\n  height: 18px;\n}\n\n/* サイドバー / フォロー一覧: 32px丸ボタン */\n.twblock-btn-container.twblock-sidebar {\n  gap: 4px;\n  flex-shrink: 0;\n}\n\n.twblock-btn-container.twblock-sidebar .twblock-btn {\n  width: 32px;\n  height: 32px;\n  border-radius: 50%;\n  border: 1px solid light-dark(rgb(207, 217, 222), rgb(83, 100, 113));\n  color: light-dark(rgb(15, 20, 26), rgb(230, 233, 234));\n}\n\n.twblock-btn-container.twblock-sidebar .twblock-btn svg {\n  width: 18px;\n  height: 18px;\n}\n\n/* ホバーカード */\n.twblock-btn-container.twblock-hovercard {\n  margin-right: 8px;\n}\n\n\n/* 個別ボタン（デフォルト: 34x34, アイコン20x20） */\n.twblock-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 34px;\n  height: 34px;\n  border-radius: 50%;\n  border: none;\n  background: transparent;\n  cursor: pointer;\n  padding: 0;\n  transition: background-color 0.15s ease, color 0.15s ease;\n  color: light-dark(rgb(83, 100, 113), rgb(113, 118, 123));\n  outline: none;\n}\n\n.twblock-btn:focus-visible {\n  box-shadow: 0 0 0 2px rgb(29, 155, 240);\n}\n\n.twblock-btn svg {\n  width: 20px;\n  height: 20px;\n  fill: currentColor;\n  pointer-events: none;\n}\n\n/* ブロックボタン: ホバーで赤 */\n.twblock-block:hover:not(:disabled) {\n  background-color: rgba(244, 33, 46, 0.1);\n  color: rgb(244, 33, 46);\n}\n\n/* ミュートボタン: ホバーでオレンジ */\n.twblock-mute:hover:not(:disabled) {\n  background-color: rgba(255, 173, 31, 0.1);\n  color: rgb(255, 173, 31);\n}\n\n/* ローディング状態 */\n.twblock-loading {\n  opacity: 0.5;\n  pointer-events: none;\n}\n\n.twblock-loading svg {\n  animation: twblock-spin 0.8s linear infinite;\n}\n\n@keyframes twblock-spin {\n  from { transform: rotate(0deg); }\n  to { transform: rotate(360deg); }\n}\n\n/* 成功状態: 緑 (クリックで解除可能) */\n.twblock-success {\n  color: rgb(0, 186, 124) !important;\n}\n\n.twblock-success:hover {\n  background-color: rgba(244, 33, 46, 0.1) !important;\n  color: rgb(244, 33, 46) !important;\n}\n\n/* エラー状態 */\n.twblock-error {\n  color: rgb(244, 33, 46) !important;\n  animation: twblock-shake 0.3s ease;\n}\n\n@keyframes twblock-shake {\n  0%, 100% { transform: translateX(0); }\n  25% { transform: translateX(-3px); }\n  75% { transform: translateX(3px); }\n}\n\n/* ---- ブロック/ミュート後の非表示バー ---- */\n.twblock-hidden-bar {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  padding: 12px 16px;\n  border-bottom: 1px solid light-dark(rgb(239, 243, 244), rgb(47, 51, 54));\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;\n}\n\n.twblock-hidden-label {\n  color: rgb(113, 118, 123);\n  font-size: 14px;\n}\n\n.twblock-show-btn {\n  background: none;\n  border: 1px solid light-dark(rgb(207, 217, 222), rgb(83, 100, 113));\n  border-radius: 16px;\n  color: light-dark(rgb(15, 20, 26), rgb(239, 243, 244));\n  font-size: 13px;\n  padding: 4px 14px;\n  cursor: pointer;\n  transition: background-color 0.15s ease;\n}\n\n.twblock-show-btn:hover {\n  background-color: light-dark(rgba(15, 20, 25, 0.1), rgba(239, 243, 244, 0.1));\n}\n\n/* ---- トースト通知 ---- */\n.twblock-toast {\n  position: fixed;\n  bottom: 40px;\n  left: 50%;\n  transform: translateX(-50%);\n  background: rgb(29, 155, 240);\n  color: rgb(255, 255, 255);\n  padding: 12px 24px;\n  border-radius: 4px;\n  font-size: 15px;\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\n  z-index: 10000;\n  animation: twblock-toast-in 0.3s ease;\n}\n\n.twblock-toast-hide {\n  opacity: 0;\n  transition: opacity 0.3s ease;\n}\n\n@keyframes twblock-toast-in {\n  from { opacity: 0; transform: translateX(-50%) translateY(10px); }\n  to { opacity: 1; transform: translateX(-50%) translateY(0); }\n}\n";
    document.head.appendChild(style);
  }


// ---- 初期化 ----
  async function init() {
    injectCSS();
    cacheI18n();
    injectPageScript();
    await loadStoredIcons();
    await loadSettings();
    setTimeout(processAll, 300);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(checkUrlChange, 1000);
    observeLayers();

    // ストレージに未保存ならアクティブ取得（非表示で一瞬）
    if (!iconsExtracted) {
      setTimeout(extractIconsOnce, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
