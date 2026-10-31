// ============================================================================
// device-manager.js — Device & platform distribution control.
// Features:
//   • Desktop 55% / Mobile 40% / Tablet 5% weighted split
//   • Viewport matched to device type
//   • Touch event generation for mobile/tablet
//   • Connection type simulation (wifi/4g/3g)
//   • User-agent matched to device
// ============================================================================

const DEVICE_PRESETS = {
  desktop: {
    name: 'desktop',
    weight: 55,
    viewports: [
      { width: 1920, height: 1080 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
    ],
    uas: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ],
    platform: 'Win32',
    touchPoints: 0,
    connectionType: null,
  },
  mobile: {
    name: 'mobile',
    weight: 40,
    viewports: [
      { width: 390, height: 844 },
      { width: 414, height: 896 },
      { width: 393, height: 851 },
      { width: 360, height: 800 },
      { width: 412, height: 915 },
    ],
    uas: [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    ],
    platform: 'iPhone',
    touchPoints: 5,
    connectionType: pickConnection(),
  },
  tablet: {
    name: 'tablet',
    weight: 5,
    viewports: [
      { width: 768, height: 1024 },
      { width: 810, height: 1080 },
      { width: 800, height: 1280 },
      { width: 834, height: 1194 },
    ],
    uas: [
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    ],
    platform: 'iPad',
    touchPoints: 5,
    connectionType: pickConnection(),
  },
};

function pickConnection() {
  const connections = ['4g', 'wifi', '5g', '3g'];
  const weights = [40, 45, 10, 5];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < connections.length; i++) {
    r -= weights[i];
    if (r <= 0) return connections[i];
  }
  return '4g';
}

export class DeviceManager {
  constructor(config = {}) {
    this.config = {
      desktopWeight: 55,
      mobileWeight: 40,
      tabletWeight: 5,
      ...config,
    };
    this.devices = { ...DEVICE_PRESETS };
    this._updateWeights();
  }

  _updateWeights() {
    this.devices.desktop.weight = this.config.desktopWeight;
    this.devices.mobile.weight = this.config.mobileWeight;
    this.devices.tablet.weight = this.config.tabletWeight;
  }

  /**
   * Pick a device based on configured weights.
   */
  pickDevice() {
    const devices = Object.values(this.devices);
    const total = devices.reduce((sum, d) => sum + d.weight, 0);
    let r = Math.random() * total;
    for (const device of devices) {
      r -= device.weight;
      if (r <= 0) return device;
    }
    return devices[0];
  }

  /**
   * Get a device-matched user-agent.
   */
  getUserAgent(device = null) {
    const d = device || this.pickDevice();
    return d.uas[Math.floor(Math.random() * d.uas.length)];
  }

  /**
   * Get a device-matched viewport.
   */
  getViewport(device = null) {
    const d = device || this.pickDevice();
    return d.viewports[Math.floor(Math.random() * d.viewports.length)];
  }

  /**
   * Get full device profile for browser mode.
   */
  getDeviceProfile(device = null) {
    const d = device || this.pickDevice();
    return {
      deviceType: d.name,
      viewport: this.getViewport(d),
      userAgent: this.getUserAgent(d),
      platform: d.platform,
      touchPoints: d.touchPoints,
      connectionType: d.connectionType,
    };
  }

  updateConfig(config) {
    Object.assign(this.config, config);
    this._updateWeights();
  }

  getStats() {
    return {
      desktopWeight: this.config.desktopWeight,
      mobileWeight: this.config.mobileWeight,
      tabletWeight: this.config.tabletWeight,
      deviceCount: Object.keys(this.devices).length,
    };
  }
}

export { DEVICE_PRESETS };
export default DeviceManager;
