const config = require('./config');

App({
  globalData: {
    serverUrl: '',
    sessionToken: '',
    deviceName: '',
    parcelCache: {}
  },

  onLaunch() {
    const storedUrl = wx.getStorageSync('serverUrl');
    const sessionToken = wx.getStorageSync('sessionToken');
    this.globalData.serverUrl = storedUrl || config.defaultServerUrl;
    this.globalData.sessionToken = sessionToken || '';
    this.globalData.deviceName = wx.getStorageSync('deviceName') || '';
  },

  setSession(session) {
    this.globalData.sessionToken = session.sessionToken;
    this.globalData.deviceName = session.deviceName || 'Android 采集端';
    wx.setStorageSync('sessionToken', session.sessionToken);
    wx.setStorageSync('deviceName', this.globalData.deviceName);
  },

  clearSession() {
    this.globalData.sessionToken = '';
    this.globalData.deviceName = '';
    this.globalData.parcelCache = {};
    wx.removeStorageSync('sessionToken');
    wx.removeStorageSync('deviceName');
  }
});

