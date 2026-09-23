const api = require('../../utils/api');

Page({
  data: {
    parcel: null,
    loading: true,
    error: ''
  },

  onLoad(options) {
    this.parcelId = options.id;
    this.loadParcel();
  },

  async loadParcel() {
    const cached = getApp().globalData.parcelCache[this.parcelId];
    if (cached) {
      this.setData({ parcel: cached, loading: false });
      return;
    }
    try {
      const result = await api.request({ path: '/api/v1/parcels?status=all' });
      const parcel = (result.parcels || []).find((item) => item.id === this.parcelId);
      if (!parcel) throw new Error('包裹不存在或已移除');
      getApp().globalData.parcelCache[parcel.id] = parcel;
      this.setData({ parcel });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyCode() {
    const code = this.data.parcel?.pickupCode;
    if (!code) {
      wx.showToast({ title: '取件码尚未生成', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: code });
  },

  copySummary() {
    const parcel = this.data.parcel;
    if (!parcel) return;
    const lines = [
      parcel.pickupCode ? `取件码：${parcel.pickupCode}` : '取件码：尚未生成',
      parcel.station ? `驿站：${parcel.station}` : '',
      parcel.courier ? `快递：${parcel.courier}` : '',
      parcel.orderNumber ? `订单号：${parcel.orderNumber}` : '',
      parcel.trackingNumber ? `运单号：${parcel.trackingNumber}` : ''
    ].filter(Boolean);
    wx.setClipboardData({ data: lines.join('\n') });
  },

  async markPicked() {
    const parcel = this.data.parcel;
    if (!parcel || parcel.status === 'picked') return;
    try {
      const result = await api.request({
        path: `/api/v1/parcels/${parcel.id}`,
        method: 'PATCH',
        data: { status: 'picked' }
      });
      getApp().globalData.parcelCache[parcel.id] = result.parcel;
      this.setData({ parcel: result.parcel });
      wx.showToast({ title: '已标记取件', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  }
});

