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
