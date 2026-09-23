const api = require('../../utils/api');
const { groupParcels } = require('../../utils/format');

Page({
  data: {
    loading: true,
    error: '',
    status: 'pending',
    parcels: [],
    groups: [],
    pendingCount: 0,
    deviceName: ''
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.sessionToken) {
      wx.redirectTo({ url: '/pages/pair/index' });
      return;
    }
    this.setData({ deviceName: app.globalData.deviceName });
    this.loadParcels();
  },

  onPullDownRefresh() {
    this.loadParcels().finally(() => wx.stopPullDownRefresh());
  },

  async loadParcels() {
    this.setData({ loading: true, error: '' });
    try {
      const app = getApp();
      const result = await api.request({
        path: `/api/v1/parcels?status=${this.data.status}`
      });
      const parcels = result.parcels || [];
      for (const parcel of parcels) app.globalData.parcelCache[parcel.id] = parcel;
      const pendingResult = this.data.status === 'pending'
        ? result
        : await api.request({ path: '/api/v1/parcels?status=pending' });
      this.setData({
        parcels,
        groups: groupParcels(parcels),
        pendingCount: (pendingResult.parcels || []).length,
        deviceName: result.device?.name || app.globalData.deviceName
      });
    } catch (error) {
      if (/令牌/.test(error.message)) getApp().clearSession();
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  changeStatus(event) {
    const status = event.currentTarget.dataset.status;
    if (status === this.data.status) return;
    this.setData({ status }, () => this.loadParcels());
  },

  copyCode(event) {
    const code = event.currentTarget.dataset.code;
    if (!code) {
      wx.showToast({ title: '取件码尚未生成', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: code });
  },

  async markPicked(event) {
    const id = event.currentTarget.dataset.id;
    try {
      await api.request({
        path: `/api/v1/parcels/${id}`,
        method: 'PATCH',
        data: { status: 'picked' }
      });
      wx.showToast({ title: '已标记取件', icon: 'success' });
      await this.loadParcels();
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },

  openDetail(event) {
    wx.navigateTo({
      url: `/pages/detail/index?id=${event.currentTarget.dataset.id}`
    });
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  openPairing() {
    wx.navigateTo({ url: '/pages/pair/index' });
  }
});

