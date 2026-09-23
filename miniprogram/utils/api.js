function getAppSafe() {
  return getApp();
}

function normalizeServerUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getServerUrl() {
  return normalizeServerUrl(getAppSafe().globalData.serverUrl);
}

function request(options) {
  const app = getAppSafe();
  const token = options.auth === false ? '' : app.globalData.sessionToken;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getServerUrl()}${options.path}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout || 10000,
      header: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }
        const message = response.data && response.data.error
          ? response.data.error
          : `请求失败 (${response.statusCode})`;
        reject(new Error(message));
      },
      fail(error) {
        reject(new Error(error.errMsg || '无法连接同步服务'));
      }
    });
  });
}

module.exports = {
  request,
  normalizeServerUrl
};

