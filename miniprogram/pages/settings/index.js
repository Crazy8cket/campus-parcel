const api = require('../../utils/api');

Page({
  data: {
    serverUrl: '',
    deviceName: '',
    testing: false,
    error: ''
  },

  onLoad() {
    const app = getApp();
    this.setData({
      serverUrl: app.globalData.serverUrl,
      deviceName: app.globalData.deviceName
    });
  },

  onServerInput(event) {
    this.setData({ serverUrl: event.detail.value });
  },

  saveServer() {
    const serverUrl = api.normalizeServerUrl(this.data.serverUrl);
    if (!/^https?:\/\/.+/.test(serverUrl)) {
      this.setData({ error: '服务地址必须以 http:// 或 https:// 开头' });
      return;
    }
    getApp().globalData.serverUrl = serverUrl;
    wx.setStorageSync('serverUrl', serverUrl);
    this.setData({ serverUrl, error: '' });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  async testConnection() {
    this.saveServer();
    this.setData({ testing: true, error: '' });
    try {
      const result = await api.request({
        path: '/api/v1/health',
        auth: false
      });
      if (!result.ok) throw new Error('服务响应异常');
      wx.showToast({ title: '连接正常', icon: 'success' });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ testing: false });
    }
  },

  resetPairing() {
    wx.showModal({
      title: '解除当前连接',
      content: '只会清除小程序本地会话，不会删除采集端或服务端数据。',
      success: (result) => {
        if (!result.confirm) return;
        getApp().clearSession();
        wx.reLaunch({ url: '/pages/pair/index' });
      }
    });
  }
});

