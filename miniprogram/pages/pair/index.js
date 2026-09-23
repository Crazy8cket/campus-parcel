const api = require('../../utils/api');

Page({
  data: {
    loading: false,
    code: '',
    expiresAt: '',
    pairingToken: '',
    error: ''
  },

  onUnload() {
    this.stopPolling();
  },

  async createPairing() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const result = await api.request({
        path: '/api/v1/pairings',
        method: 'POST',
        auth: false
      });
      this.pairingToken = result.pairingToken;
      this.setData({
        code: result.code,
        expiresAt: result.expiresAt,
        pairingToken: result.pairingToken
      });
      this.poll();
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  poll() {
    this.stopPolling();
    this.pollTimer = setTimeout(async () => {
      try {
        const result = await api.request({
          path: `/api/v1/pairings/${this.data.code}/complete`,
          method: 'POST',
          auth: false,
          data: { pairingToken: this.data.pairingToken }
        });
        if (!result.pending) {
          getApp().setSession(result);
          wx.showToast({ title: '已连接', icon: 'success' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/home/index' });
          }, 500);
          return;
        }
        this.poll();
      } catch (error) {
        this.setData({ error: error.message });
      }
    }, 2000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  },

  copyCode() {
    if (!this.data.code) return;
    wx.setClipboardData({ data: this.data.code });
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  }
});

