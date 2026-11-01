// ============================================================================
// fingerprint-generator.js — Programmatic generation of 2000+ realistic
// browser fingerprint profiles. Each profile is internally consistent:
// UA string ↔ platform ↔ screen ↔ GPU ↔ CPU ↔ memory ↔ locale ↔ client hints.
// ============================================================================

// ---------------------------------------------------------------------------
// Device databases
// ---------------------------------------------------------------------------

const WINDOWS_VERSIONS = ['10.0', '11.0'];
const MAC_VERSIONS = ['10_15_7', '11_0', '12_0', '13_0', '13_6', '14_0', '14_5'];
const LINUX_DISTROS = ['Ubuntu', 'Fedora', 'Debian', ''];

// GPU database — realistic renderer strings
const GPU_DB = {
  nvidia: [
    'NVIDIA GeForce RTX 4090', 'NVIDIA GeForce RTX 4080 SUPER', 'NVIDIA GeForce RTX 4080',
    'NVIDIA GeForce RTX 4070 Ti SUPER', 'NVIDIA GeForce RTX 4070 Ti', 'NVIDIA GeForce RTX 4070 SUPER',
    'NVIDIA GeForce RTX 4070', 'NVIDIA GeForce RTX 4060 Ti', 'NVIDIA GeForce RTX 4060',
    'NVIDIA GeForce RTX 3090', 'NVIDIA GeForce RTX 3080', 'NVIDIA GeForce RTX 3070',
    'NVIDIA GeForce RTX 3060', 'NVIDIA GeForce RTX 3050', 'NVIDIA GeForce RTX 2080 Ti',
    'NVIDIA GeForce RTX 2080 SUPER', 'NVIDIA GeForce RTX 2070 SUPER', 'NVIDIA GeForce RTX 2070',
    'NVIDIA GeForce RTX 2060 SUPER', 'NVIDIA GeForce RTX 2060', 'NVIDIA GeForce GTX 1660 SUPER',
    'NVIDIA GeForce GTX 1660', 'NVIDIA GeForce GTX 1650', 'NVIDIA GeForce GTX 1080 Ti',
    'NVIDIA GeForce GTX 1080', 'NVIDIA GeForce GTX 1070', 'NVIDIA GeForce GTX 1060',
    'NVIDIA GeForce GTX 980 Ti', 'NVIDIA GeForce GTX 980', 'NVIDIA GeForce GTX 780 Ti',
    'NVIDIA Quadro RTX 8000', 'NVIDIA Quadro P6000', 'NVIDIA Quadro P5000',
    'NVIDIA GeForce RTX 3090 Ti', 'NVIDIA GeForce RTX 3080 Ti', 'NVIDIA GeForce RTX 5090',
    'NVIDIA GeForce RTX 5080', 'NVIDIA GeForce RTX 5070 Ti', 'NVIDIA GeForce RTX 5070',
    'NVIDIA GeForce RTX 5060 Ti', 'NVIDIA GeForce RTX 5060',
  ],
  amd: [
    'AMD Radeon RX 7900 XTX', 'AMD Radeon RX 7900 XT', 'AMD Radeon RX 7800 XT',
    'AMD Radeon RX 7700 XT', 'AMD Radeon RX 7600', 'AMD Radeon RX 6950 XT',
    'AMD Radeon RX 6900 XT', 'AMD Radeon RX 6800 XT', 'AMD Radeon RX 6800',
    'AMD Radeon RX 6750 XT', 'AMD Radeon RX 6700 XT', 'AMD Radeon RX 6650 XT',
    'AMD Radeon RX 6600 XT', 'AMD Radeon RX 6600', 'AMD Radeon RX 5700 XT',
    'AMD Radeon RX 5600 XT', 'AMD Radeon RX 5500M', 'AMD Radeon Pro W7900',
    'AMD Radeon Pro W7800', 'AMD Radeon Pro W6800', 'AMD Radeon RX 9070 XT',
    'AMD Radeon RX 9070', 'AMD Radeon RX 9060 XT',
  ],
  intel: [
    'Intel UHD Graphics 630', 'Intel UHD Graphics 620', 'Intel UHD Graphics 600',
    'Intel HD Graphics 630', 'Intel HD Graphics 520', 'Intel HD Graphics 530',
    'Intel HD Graphics 4600', 'Intel HD Graphics 4000', 'Intel HD Graphics 3000',
    'Intel Iris Xe Graphics', 'Intel Iris Plus Graphics', 'Intel Iris Graphics',
    'Intel Arc A770', 'Intel Arc A750', 'Intel Arc A380', 'Intel Arc B580',
    'Intel UHD Graphics 770', 'Intel UHD Graphics 750', 'Intel HD Graphics',
  ],
  apple: [
    'Apple M4 Max', 'Apple M4 Pro', 'Apple M4', 'Apple M3 Max', 'Apple M3 Pro',
    'Apple M3 Ultra', 'Apple M3', 'Apple M2 Ultra', 'Apple M2 Max', 'Apple M2 Pro',
    'Apple M2', 'Apple M1 Ultra', 'Apple M1 Max', 'Apple M1 Pro', 'Apple M1',
  ],
  qualcomm: [
    'Adreno 750', 'Adreno 740', 'Adreno 730', 'Adreno 720', 'Adreno 660',
    'Adreno 650', 'Adreno 640', 'Adreno 618', 'Adreno 616', 'Adreno 612',
    'Adreno 610', 'Adreno 605', 'Adreno 530', 'Adreno 540', 'Adreno 741',
  ],
  mali: [
    'Mali-G710 MC20', 'Mali-G710 MC10', 'Mali-G610 MC4', 'Mali-G610 MC3',
    'Mali-G510 MC2', 'Mali-G510 MC1', 'Mali-G68 MC3', 'Mali-G68 MC2',
    'Mali-G57 MC3', 'Mali-G57 MC2', 'Mali-G72 MP3', 'Mali-G76 MP12',
    'Mali-G76 MP15', 'Mali-G76 MP18', 'Mali-G76 MP20', 'Mali-G78 MP20',
    'Mali-G78 MP22', 'Mali-G78 MP24', 'Mali-G68 MP10', 'Mali-G68 MP12',
  ],
  powervr: [
    'PowerVR Rogue GE8320', 'PowerVR Rogue GX6250', 'PowerVR Rogue GX6250',
  ],
};

// GPU class → vendor mapping for WebGL vendor string
const GPU_VENDOR_MAP = {
  nvidia: 'Google Inc. (NVIDIA)',
  amd: 'Google Inc. (AMD)',
  intel: 'Google Inc. (Intel)',
  apple: 'Apple Inc.',
  qualcomm: 'Google Inc. (Qualcomm)',
  mali: 'Google Inc. (ARM)',
  powervr: 'Google Inc. (Imagination Technologies)',
};

// CPU profiles by device class
const CPU_PROFILES = {
  highEnd: { cores: [12, 16, 24], memory: [16, 32] },
  midRange: { cores: [6, 8], memory: [8, 12] },
  budget: { cores: [4], memory: [4, 8] },
  mobileHigh: { cores: [8], memory: [12, 16] },
  mobileMid: { cores: [6, 8], memory: [6, 8] },
  mobileBudget: { cores: [4, 6], memory: [3, 4, 6] },
  appleM: { cores: [8, 10, 12], memory: [8, 16, 24] },
};

// Android device database
const ANDROID_DEVICES = [
  { brand: 'Samsung', model: 'SM-S928B', name: 'Galaxy S24 Ultra', os: '14', screen: [3088, 1440], gpu: 'Adreno 750' },
  { brand: 'Samsung', model: 'SM-S918B', name: 'Galaxy S23 Ultra', os: '14', screen: [3088, 1440], gpu: 'Adreno 740' },
  { brand: 'Samsung', model: 'SM-S908B', name: 'Galaxy S22 Ultra', os: '13', screen: [3088, 1440], gpu: 'Adreno 730' },
  { brand: 'Samsung', model: 'SM-S808B', name: 'Galaxy S21 Ultra', os: '13', screen: [3200, 1440], gpu: 'Adreno 660' },
  { brand: 'Samsung', model: 'SM-A546B', name: 'Galaxy A54', os: '14', screen: [2340, 1080], gpu: 'Adreno 640' },
  { brand: 'Samsung', model: 'SM-A536B', name: 'Galaxy A53', os: '13', screen: [2400, 1080], gpu: 'Adreno 640' },
  { brand: 'Samsung', model: 'SM-A346B', name: 'Galaxy A34', os: '14', screen: [2340, 1080], gpu: 'Adreno 710' },
  { brand: 'Samsung', model: 'SM-G998B', name: 'Galaxy Note 20 Ultra', os: '13', screen: [3200, 1440], gpu: 'Adreno 660' },
  { brand: 'Samsung', model: 'SM-G981B', name: 'Galaxy S20 FE', os: '13', screen: [2400, 1080], gpu: 'Adreno 660' },
  { brand: 'Google', model: 'Pixel 8 Pro', name: 'Pixel 8 Pro', os: '14', screen: [2992, 1344], gpu: 'Adreno 750' },
  { brand: 'Google', model: 'Pixel 8', name: 'Pixel 8', os: '14', screen: [2400, 1080], gpu: 'Adreno 740' },
  { brand: 'Google', model: 'Pixel 7 Pro', name: 'Pixel 7 Pro', os: '13', screen: [2992, 1344], gpu: 'Adreno 730' },
  { brand: 'Google', model: 'Pixel 7', name: 'Pixel 7', os: '13', screen: [2400, 1080], gpu: 'Adreno 730' },
  { brand: 'Google', model: 'Pixel 6 Pro', name: 'Pixel 6 Pro', os: '13', screen: [3120, 1440], gpu: 'Adreno 780' },
  { brand: 'Google', model: 'Pixel 6', name: 'Pixel 6', os: '13', screen: [2400, 1080], gpu: 'Adreno 780' },
  { brand: 'Google', model: 'Pixel 5', name: 'Pixel 5', os: '12', screen: [2340, 1080], gpu: 'Adreno 660' },
  { brand: 'Google', model: 'Pixel 4a', name: 'Pixel 4a', os: '12', screen: [1080, 2220], gpu: 'Adreno 618' },
  { brand: 'Xiaomi', model: '2201123G', name: 'Xiaomi 12 Pro', os: '13', screen: [3200, 1440], gpu: 'Adreno 730' },
  { brand: 'Xiaomi', model: '2101123G', name: 'Xiaomi 12', os: '13', screen: [2400, 1080], gpu: 'Adreno 730' },
  { brand: 'Xiaomi', model: 'M2012K11AG', name: 'Redmi Note 10 Pro', os: '13', screen: [2400, 1080], gpu: 'Adreno 640' },
  { brand: 'Xiaomi', model: 'M2101K6G', name: 'Redmi Note 9 Pro', os: '12', screen: [2400, 1080], gpu: 'Adreno 618' },
  { brand: 'OnePlus', model: 'CPH2451', name: 'OnePlus 11', os: '13', screen: [3168, 1440], gpu: 'Adreno 740' },
  { brand: 'OnePlus', model: 'CPH2309', name: 'OnePlus 10 Pro', os: '13', screen: [3216, 1440], gpu: 'Adreno 730' },
  { brand: 'OnePlus', model: 'CPH2219', name: 'OnePlus Nord 2', os: '13', screen: [2400, 1080], gpu: 'Adreno 660' },
  { brand: 'Oppo', model: 'CPH2301', name: 'Oppo Find X5 Pro', os: '13', screen: [3216, 1440], gpu: 'Adreno 730' },
  { brand: 'Vivo', model: 'V2154', name: 'Vivo X70 Pro', os: '13', screen: [2400, 1080], gpu: 'Adreno 680' },
  { brand: 'Realme', model: 'RMX3300', name: 'Realme GT Neo 3', os: '13', screen: [2412, 1080], gpu: 'Adreno 740' },
  { brand: 'Motorola', model: 'XT2153-1', name: 'Moto G Stylus', os: '12', screen: [1080, 2400], gpu: 'Adreno 618' },
  { brand: 'Motorola', model: 'XT2143-1', name: 'Moto G Power', os: '12', screen: [1080, 2400], gpu: 'Adreno 618' },
  { brand: 'Huawei', model: 'ANE-LX1', name: 'P60 Pro', os: '13', screen: [2700, 1260], gpu: 'Adreno 730' },
  { brand: 'Honor', model: 'ANY-L29', name: 'Honor 80', os: '13', screen: [2400, 1080], gpu: 'Adreno 730' },
];

// iOS devices
const IOS_DEVICES = [
  { model: 'iPhone 15 Pro Max', os: '17_5', screen: [430, 932], gpu: 'Apple A17 Pro' },
  { model: 'iPhone 15 Pro', os: '17_5', screen: [393, 852], gpu: 'Apple A17 Pro' },
  { model: 'iPhone 15 Plus', os: '17_5', screen: [430, 932], gpu: 'Apple A16' },
  { model: 'iPhone 15', os: '17_5', screen: [393, 852], gpu: 'Apple A16' },
  { model: 'iPhone 14 Pro Max', os: '17_4', screen: [430, 932], gpu: 'Apple A16' },
  { model: 'iPhone 14 Pro', os: '17_4', screen: [393, 852], gpu: 'Apple A16' },
  { model: 'iPhone 14', os: '17_4', screen: [390, 844], gpu: 'Apple A15' },
  { model: 'iPhone 14 Plus', os: '17_4', screen: [430, 932], gpu: 'Apple A15' },
  { model: 'iPhone 13 Pro Max', os: '16_6', screen: [430, 932], gpu: 'Apple A15' },
  { model: 'iPhone 13 Pro', os: '16_6', screen: [393, 852], gpu: 'Apple A15' },
  { model: 'iPhone 13', os: '16_6', screen: [390, 844], gpu: 'Apple A15' },
  { model: 'iPhone 13 mini', os: '16_6', screen: [375, 812], gpu: 'Apple A15' },
  { model: 'iPhone 12 Pro Max', os: '16_6', screen: [428, 926], gpu: 'Apple A14' },
  { model: 'iPhone 12', os: '16_6', screen: [390, 844], gpu: 'Apple A14' },
  { model: 'iPhone SE', os: '17_4', screen: [375, 667], gpu: 'Apple A15' },
  { model: 'iPad Pro 12.9', os: '17_5', screen: [1024, 1366], gpu: 'Apple M2' },
  { model: 'iPad Pro 11', os: '17_5', screen: [834, 1194], gpu: 'Apple M2' },
  { model: 'iPad Air', os: '17_5', screen: [820, 1180], gpu: 'Apple M1' },
  { model: 'iPad', os: '17_5', screen: [810, 1082], gpu: 'Apple A15' },
  { model: 'iPad mini', os: '17_5', screen: [744, 1133], gpu: 'Apple A17 Pro' },
];

// Screen resolutions for desktop
const DESKTOP_SCREENS = [
  { w: 1920, h: 1080 }, { w: 1536, h: 864 }, { w: 1440, h: 900 },
  { w: 1366, h: 768 }, { w: 1280, h: 800 }, { w: 1680, h: 1050 },
  { w: 1920, h: 1200 }, { w: 2560, h: 1440 }, { w: 3440, h: 1440 },
  { w: 1280, h: 720 }, { w: 1440, h: 900 }, { w: 1600, h: 900 },
  { w: 1920, h: 1080 }, { w: 2560, h: 1080 }, { w: 1512, h: 982 },
  { w: 1536, h: 992 }, { w: 1470, h: 975 }, { w: 1312, h: 832 },
  { w: 1180, h: 820 }, { w: 1024, h: 768 }, { w: 800, h: 600 },
  { w: 1728, h: 1117 }, { w: 1860, h: 1240 }, { w: 2048, h: 1365 },
  { w: 2196, h: 1488 }, { w: 2360, h: 1612 }, { w: 2560, h: 1728 },
  { w: 2732, h: 2048 }, { w: 2880, h: 1800 }, { w: 3024, h: 2016 },
  { w: 3200, h: 1800 }, { w: 3200, h: 2000 }, { w: 3440, h: 1440 },
  { w: 3840, h: 2160 }, { w: 3840, h: 1080 }, { w: 5120, h: 2880 },
  { w: 1920, h: 1080 }, { w: 1600, h: 1200 }, { w: 1280, h: 1024 },
  { w: 1400, h: 1050 }, { w: 1152, h: 864 }, { w: 1024, h: 768 },
];

// Timezones by region
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'America/Toronto', 'America/Vancouver',
  'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon',
  'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Zurich',
  'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Warsaw',
  'Europe/Prague', 'Europe/Budapest', 'Europe/Athens', 'Europe/Helsinki',
  'Europe/Kiev', 'Europe/Kyiv', 'Europe/Moscow', 'Europe/Istanbul',
  'Asia/Dubai', 'Asia/Tehran', 'Asia/Jerusalem',
  'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Manila',
  'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul',
  'Asia/Tokyo', 'Asia/Osaka', 'Asia/Tokyo',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Pacific/Auckland', 'Pacific/Honolulu',
  'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi',
];

// Language/locale pairs
const LOCALES = [
  { code: 'en-US', lang: 'en', tz: 'America/New_York' },
  { code: 'en-GB', lang: 'en', tz: 'Europe/London' },
  { code: 'en-CA', lang: 'en', tz: 'America/Toronto' },
  { code: 'en-AU', lang: 'en', tz: 'Australia/Sydney' },
  { code: 'en-NZ', lang: 'en', tz: 'Pacific/Auckland' },
  { code: 'en-IN', lang: 'en', tz: 'Asia/Kolkata' },
  { code: 'en-SG', lang: 'en', tz: 'Asia/Singapore' },
  { code: 'en-IE', lang: 'en', tz: 'Europe/Dublin' },
  { code: 'en-ZA', lang: 'en', tz: 'Africa/Johannesburg' },
  { code: 'de-DE', lang: 'de', tz: 'Europe/Berlin' },
  { code: 'de-AT', lang: 'de', tz: 'Europe/Vienna' },
  { code: 'de-CH', lang: 'de', tz: 'Europe/Zurich' },
  { code: 'fr-FR', lang: 'fr', tz: 'Europe/Paris' },
  { code: 'fr-CA', lang: 'fr', tz: 'America/Toronto' },
  { code: 'fr-BE', lang: 'fr', tz: 'Europe/Brussels' },
  { code: 'es-ES', lang: 'es', tz: 'Europe/Madrid' },
  { code: 'es-MX', lang: 'es', tz: 'America/Mexico_City' },
  { code: 'es-AR', lang: 'es', tz: 'America/Argentina/Buenos_Aires' },
  { code: 'es-CL', lang: 'es', tz: 'America/Santiago' },
  { code: 'it-IT', lang: 'it', tz: 'Europe/Rome' },
  { code: 'pt-BR', lang: 'pt', tz: 'America/Sao_Paulo' },
  { code: 'pt-PT', lang: 'pt', tz: 'Europe/Lisbon' },
  { code: 'nl-NL', lang: 'nl', tz: 'Europe/Amsterdam' },
  { code: 'pl-PL', lang: 'pl', tz: 'Europe/Warsaw' },
  { code: 'sv-SE', lang: 'sv', tz: 'Europe/Stockholm' },
  { code: 'no-NO', lang: 'no', tz: 'Europe/Oslo' },
  { code: 'da-DK', lang: 'da', tz: 'Europe/Copenhagen' },
  { code: 'fi-FI', lang: 'fi', tz: 'Europe/Helsinki' },
  { code: 'cs-CZ', lang: 'cs', tz: 'Europe/Prague' },
  { code: 'hu-HU', lang: 'hu', tz: 'Europe/Budapest' },
  { code: 'el-GR', lang: 'el', tz: 'Europe/Athens' },
  { code: 'ro-RO', lang: 'ro', tz: 'Europe/Bucharest' },
  { code: 'tr-TR', lang: 'tr', tz: 'Europe/Istanbul' },
  { code: 'ru-RU', lang: 'ru', tz: 'Europe/Moscow' },
  { code: 'uk-UA', lang: 'uk', tz: 'Europe/Kyiv' },
  { code: 'he-IL', lang: 'he', tz: 'Asia/Jerusalem' },
  { code: 'ar-SA', lang: 'ar', tz: 'Asia/Riyadh' },
  { code: 'ar-EG', lang: 'ar', tz: 'Africa/Cairo' },
  { code: 'hi-IN', lang: 'hi', tz: 'Asia/Kolkata' },
  { code: 'bn-BD', lang: 'bn', tz: 'Asia/Dhaka' },
  { code: 'th-TH', lang: 'th', tz: 'Asia/Bangkok' },
  { code: 'id-ID', lang: 'id', tz: 'Asia/Jakarta' },
  { code: 'vi-VN', lang: 'vi', tz: 'Asia/Ho_Chi_Minh' },
  { code: 'zh-CN', lang: 'zh', tz: 'Asia/Shanghai' },
  { code: 'zh-TW', lang: 'zh', tz: 'Asia/Taipei' },
  { code: 'zh-HK', lang: 'zh', tz: 'Asia/Hong_Kong' },
  { code: 'ja-JP', lang: 'ja', tz: 'Asia/Tokyo' },
  { code: 'ko-KR', lang: 'ko', tz: 'Asia/Seoul' },
  { code: 'ms-MY', lang: 'ms', tz: 'Asia/Kuala_Lumpur' },
  { code: 'fil-PH', lang: 'fil', tz: 'Asia/Manila' },
  { code: 'ur-PK', lang: 'ur', tz: 'Asia/Karachi' },
];

// Chrome versions
const CHROME_VERSIONS = [
  '130.0.0.0', '129.0.0.0', '128.0.0.0', '127.0.0.0', '126.0.0.0',
  '125.0.0.0', '124.0.0.0', '123.0.0.0', '122.0.0.0', '121.0.0.0',
  '120.0.0.0', '119.0.0.0', '118.0.0.0', '117.0.0.0', '116.0.0.0',
  '115.0.0.0', '114.0.0.0', '113.0.0.0', '112.0.0.0', '111.0.0.0',
  '110.0.0.0', '109.0.0.0', '108.0.0.0', '107.0.0.0', '106.0.0.0',
  '105.0.0.0', '104.0.0.0', '103.0.0.0', '102.0.0.0', '101.0.0.0',
  '100.0.0.0',
];

// Chrome mobile versions (Android)
const CHROME_MOBILE_VERSIONS = [
  '130.0.6723.106', '129.0.6668.100', '128.0.6613.116', '127.0.6533.119',
  '126.0.6478.126', '125.0.6422.140', '124.0.6367.114', '123.0.6312.142',
  '122.0.6261.129', '121.0.6167.141', '120.0.6099.224', '119.0.6045.197',
  '118.0.5993.70', '117.0.5938.157', '116.0.5845.96', '115.0.5790.170',
  '114.0.5735.196', '113.0.5672.77', '112.0.5615.153', '111.0.5563.116',
  '110.0.5481.144', '109.0.5414.117', '108.0.5359.124', '107.0.5304.141',
  '106.0.5249.126', '105.0.5195.52', '104.0.5112.106', '103.0.5060.71',
  '102.0.5005.195', '101.0.4951.106', '100.0.4896.60',
];

// Firefox versions
const FIREFOX_VERSIONS = [
  '131.0', '130.0', '129.0', '128.0', '127.0', '126.0', '125.0',
  '124.0', '123.0', '122.0', '121.0', '120.0', '119.0', '118.0',
  '117.0', '116.0', '115.0', '114.0', '113.0', '112.0',
  '111.0', '110.0', '109.0', '108.0', '107.0', '106.0',
  '105.0', '104.0', '103.0', '102.0', '101.0', '100.0',
];

// Safari versions
const SAFARI_VERSIONS = [
  '17.5', '17.4', '17.3', '17.2', '17.1', '17.0',
  '16.6', '16.5', '16.4', '16.3', '16.2', '16.1', '16.0',
  '15.6', '15.5', '15.4', '15.3', '15.2', '15.1', '15.0',
  '14.1', '14.0', '13.1', '13.0', '12.1', '12.0',
];

// Edge versions
const EDGE_VERSIONS = [
  '130.0.0.0', '129.0.0.0', '128.0.0.0', '127.0.0.0', '126.0.0.0',
  '125.0.0.0', '124.0.0.0', '123.0.0.0', '122.0.0.0', '121.0.0.0',
  '120.0.0.0', '119.0.0.0', '118.0.0.0', '117.0.0.0', '116.0.0.0',
  '115.0.0.0', '114.0.0.0', '113.0.0.0', '112.0.0.0', '111.0.0.0',
  '110.0.0.0', '109.0.0.0', '108.0.0.0', '107.0.0.0', '106.0.0.0',
  '105.0.0.0', '104.0.0.0', '103.0.0.0', '102.0.0.0', '101.0.0.0',
  '100.0.0.0',
];

// ---------------------------------------------------------------------------
// Profile generators
// ---------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickIdx(rand, arr) {
  return Math.floor(rand() * arr.length);
}

function buildChromeUa(platform, version, mobile = false) {
  if (mobile) {
    return `Mozilla/5.0 (Linux; Android ${pick(mulberry32(Date.now()), ['12', '13', '14'])}; ${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Mobile Safari/537.36`;
  }
  const osStr = {
    'Win32': `Windows NT 10.0; Win64; x64`,
    'MacIntel': `Macintosh; Intel Mac OS X 10_15_7`,
    'Linux x86_64': `X11; Linux x86_64`,
    'Linux armv8l': `Linux; Android`,
  }[platform] || 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${osStr}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

function buildFirefoxUa(platform, version) {
  const osStr = {
    'Win32': `Windows NT 10.0; Win64; x64`,
    'MacIntel': `Macintosh; Intel Mac OS X 10_15_7`,
    'Linux x86_64': `X11; Linux x86_64`,
  }[platform] || 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${osStr}; rv:${version}) Gecko/20100101 Firefox/${version}`;
}

function buildSafariUa(device, osVersion, version) {
  if (device.startsWith('iPhone')) {
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Mobile/15E148 Safari/604.1`;
  }
  if (device.startsWith('iPad')) {
    return `Mozilla/5.0 (iPad; CPU OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Mobile/15E148 Safari/604.1`;
  }
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`;
}

function buildEdgeUa(platform, version) {
  const chromeUa = buildChromeUa(platform, version);
  return chromeUa.replace('Chrome/', 'Chrome/').replace(' Safari/', ` Edg/${version} Safari/`);
}

// ---------------------------------------------------------------------------
// Main generator — produces 2000+ profiles
// ---------------------------------------------------------------------------

export function generateFingerprintPool(targetCount = 2000) {
  const profiles = [];
  const rand = mulberry32(Date.now());

  // Section budgets. The desktop builders below used to guard with
  // `profiles.length < targetCount` and therefore consumed the ENTIRE pool
  // before the Android/iOS/iPad sections ever ran — the "2,000 profiles"
  // were all desktop. Budgeting guarantees the mix mirrors a real population
  // and every visit can draw a unique mobile/tablet/desktop fingerprint.
  const androidBudget = Math.floor(targetCount * 0.24);
  const iphoneBudget = Math.floor(targetCount * 0.16);
  const ipadBudget = Math.floor(targetCount * 0.05);
  const desktopBudget = Math.max(1, targetCount - androidBudget - iphoneBudget - ipadBudget);

  // ── Chrome on Windows (desktop) ─────────────────────────────────────────
  const chromeWinScreens = DESKTOP_SCREENS.slice(0, 15);
  // Per-builder quota: Chrome-Win gets 30% of the desktop budget.
  // (Previously each builder looped until the SHARED desktopBudget was
  // full, so the first builders starved Edge/Firefox/Safari entirely.)
  for (let i = 0; i < Math.floor(desktopBudget * 0.30) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, CHROME_VERSIONS);
    const screen = pick(rand, chromeWinScreens);
    const gpuCategory = pick(rand, ['nvidia', 'nvidia', 'nvidia', 'amd', 'amd', 'intel', 'intel', 'intel']);
    const gpu = pick(rand, GPU_DB[gpuCategory]);
    const cpu = CPU_PROFILES[gpuCategory === 'intel' ? 'midRange' : 'highEnd'];
    const locale = pick(rand, LOCALES);
    const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

    profiles.push({
      ua,
      platform: 'Win32',
      version,
      browser: 'chrome',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: {
        brands: [{ brand: 'Google Chrome', version: version.split('.')[0] }, { brand: 'Chromium', version: version.split('.')[0] }, { brand: 'Not_A Brand', version: '24' }],
        mobile: false,
        platform: 'Windows',
      },
      webgl: gpu,
      gpuCategory,
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
    });
  }

  // ── Chrome on macOS (desktop) ───────────────────────────────────────────
  const chromeMacScreens = DESKTOP_SCREENS.filter(s => s.w >= 1280 && s.h >= 800);
  // quota: 15% of desktop budget
  for (let i = 0; i < Math.floor(desktopBudget * 0.15) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, CHROME_VERSIONS);
    const screen = pick(rand, chromeMacScreens);
    const gpu = pick(rand, GPU_DB.apple);
    const cpu = CPU_PROFILES.appleM;
    const locale = pick(rand, LOCALES.filter(l => l.code.startsWith('en') || l.code.startsWith('de') || l.code.startsWith('fr')));
    const ua = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

    profiles.push({
      ua,
      platform: 'MacIntel',
      version,
      browser: 'chrome',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: {
        brands: [{ brand: 'Google Chrome', version: version.split('.')[0] }, { brand: 'Chromium', version: version.split('.')[0] }, { brand: 'Not_A Brand', version: '24' }],
        mobile: false,
        platform: 'macOS',
      },
      webgl: gpu,
      gpuCategory: 'apple',
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
    });
  }

  // ── Chrome on Linux (desktop) ───────────────────────────────────────────
  // quota: 8%
  for (let i = 0; i < Math.floor(desktopBudget * 0.08) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, CHROME_VERSIONS);
    const screen = pick(rand, DESKTOP_SCREENS.slice(0, 10));
    const gpuCategory = pick(rand, ['nvidia', 'amd', 'intel']);
    const gpu = pick(rand, GPU_DB[gpuCategory]);
    const cpu = CPU_PROFILES[gpuCategory === 'intel' ? 'midRange' : 'highEnd'];
    const locale = pick(rand, LOCALES.filter(l => l.code.startsWith('en') || l.code.startsWith('de') || l.code.startsWith('fr') || l.code.startsWith('es')));
    const distro = pick(rand, LINUX_DISTROS);
    const distroStr = distro ? `${distro} ` : '';
    const ua = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

    profiles.push({
      ua,
      platform: 'Linux x86_64',
      version,
      browser: 'chrome',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: {
        brands: [{ brand: 'Google Chrome', version: version.split('.')[0] }, { brand: 'Chromium', version: version.split('.')[0] }, { brand: 'Not_A Brand', version: '24' }],
        mobile: false,
        platform: 'Linux',
      },
      webgl: gpu,
      gpuCategory,
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
      distro,
    });
  }

  // ── Edge on Windows (desktop) ───────────────────────────────────────────
  // quota: 10%
  for (let i = 0; i < Math.floor(desktopBudget * 0.10) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, EDGE_VERSIONS);
    const screen = pick(rand, DESKTOP_SCREENS.slice(0, 12));
    const gpuCategory = pick(rand, ['nvidia', 'amd', 'intel']);
    const gpu = pick(rand, GPU_DB[gpuCategory]);
    const cpu = CPU_PROFILES[gpuCategory === 'intel' ? 'midRange' : 'highEnd'];
    const locale = pick(rand, LOCALES);
    const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36 Edg/${version}`;

    profiles.push({
      ua,
      platform: 'Win32',
      version,
      browser: 'edge',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: {
        brands: [{ brand: 'Microsoft Edge', version: version.split('.')[0] }, { brand: 'Chromium', version: version.split('.')[0] }, { brand: 'Not_A Brand', version: '24' }],
        mobile: false,
        platform: 'Windows',
      },
      webgl: gpu,
      gpuCategory,
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
    });
  }

  // ── Firefox on Windows (desktop) ─────────────────────────────────────────
  // quota: 12%
  for (let i = 0; i < Math.floor(desktopBudget * 0.12) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, FIREFOX_VERSIONS);
    const screen = pick(rand, DESKTOP_SCREENS.slice(0, 12));
    const gpuCategory = pick(rand, ['nvidia', 'amd', 'intel']);
    const gpu = pick(rand, GPU_DB[gpuCategory]);
    const cpu = CPU_PROFILES[gpuCategory === 'intel' ? 'midRange' : 'highEnd'];
    const locale = pick(rand, LOCALES);
    const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}) Gecko/20100101 Firefox/${version}`;

    profiles.push({
      ua,
      platform: 'Win32',
      version,
      browser: 'firefox',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: null,
      webgl: gpu,
      gpuCategory,
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
    });
  }

  // ── Firefox on macOS (desktop) ───────────────────────────────────────────
  // quota: 7%
  for (let i = 0; i < Math.floor(desktopBudget * 0.07) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, FIREFOX_VERSIONS);
    const screen = pick(rand, chromeMacScreens);
    const gpu = pick(rand, GPU_DB.apple);
    const cpu = CPU_PROFILES.appleM;
    const locale = pick(rand, LOCALES.filter(l => l.code.startsWith('en') || l.code.startsWith('de') || l.code.startsWith('fr')));
    const ua = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Firefox/${version} Gecko/20100101 Firefox/${version}`;

    profiles.push({
      ua,
      platform: 'MacIntel',
      version,
      browser: 'firefox',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: null,
      webgl: gpu,
      gpuCategory: 'apple',
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
    });
  }

  // ── Firefox on Linux (desktop) ───────────────────────────────────────────
  // quota: 5%
  for (let i = 0; i < Math.floor(desktopBudget * 0.05) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, FIREFOX_VERSIONS);
    const screen = pick(rand, DESKTOP_SCREENS.slice(0, 10));
    const gpuCategory = pick(rand, ['nvidia', 'amd', 'intel']);
    const gpu = pick(rand, GPU_DB[gpuCategory]);
    const cpu = CPU_PROFILES[gpuCategory === 'intel' ? 'midRange' : 'highEnd'];
    const locale = pick(rand, LOCALES.filter(l => l.code.startsWith('en') || l.code.startsWith('de')));
    const ua = `Mozilla/5.0 (X11; Linux x86_64; rv:${version}) Gecko/20100101 Firefox/${version}`;

    profiles.push({
      ua,
      platform: 'Linux x86_64',
      version,
      browser: 'firefox',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: null,
      webgl: gpu,
      gpuCategory,
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
    });
  }

  // ── Safari on macOS (desktop) ───────────────────────────────────────────
  // quota: 13% (sums 0.30+0.15+0.08+0.10+0.12+0.07+0.05+0.13 = 1.00)
  for (let i = 0; i < Math.floor(desktopBudget * 0.13) && profiles.length < desktopBudget; i++) {
    const version = pick(rand, SAFARI_VERSIONS);
    const screen = pick(rand, chromeMacScreens);
    const gpu = pick(rand, GPU_DB.apple);
    const cpu = CPU_PROFILES.appleM;
    const locale = pick(rand, LOCALES.filter(l => l.code.startsWith('en') || l.code.startsWith('de') || l.code.startsWith('fr') || l.code.startsWith('ja')));
    const ua = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`;

    profiles.push({
      ua,
      platform: 'MacIntel',
      version,
      browser: 'safari',
      device: 'desktop',
      isMobile: false,
      isTablet: false,
      locale: locale.code,
      screen,
      clientHints: null,
      webgl: gpu,
      gpuCategory: 'apple',
      hardwareConcurrency: pick(rand, cpu.cores),
      deviceMemory: pick(rand, cpu.memory),
      timezone: locale.tz,
      language: locale.lang,
    });
  }

  // ── Chrome on Android (mobile) ───────────────────────────────────────────
  for (const device of ANDROID_DEVICES) {
    const numVariants = Math.max(1, Math.floor(androidBudget / ANDROID_DEVICES.length));
    for (let i = 0; i < numVariants && profiles.length < desktopBudget + androidBudget; i++) {
      const version = pick(rand, CHROME_MOBILE_VERSIONS);
      const locale = pick(rand, LOCALES.filter(l => ['en', 'es', 'de', 'fr', 'ja', 'ko', 'zh', 'ar', 'pt'].includes(l.lang)));
      const screen = { w: device.screen[0], h: device.screen[1] };
      const ua = `Mozilla/5.0 (Linux; Android ${device.os}; ${device.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Mobile Safari/537.36`;

      profiles.push({
        ua,
        platform: 'Linux armv8l',
        version,
        browser: 'chrome',
        device: device.name,
        brand: device.brand,
        model: device.model,
        isMobile: true,
        isTablet: false,
        locale: locale.code,
        screen,
        clientHints: {
          brands: [{ brand: 'Google Chrome', version: version.split('.')[0] }, { brand: 'Chromium', version: version.split('.')[0] }, { brand: 'Not_A Brand', version: '24' }],
          mobile: true,
          platform: 'Android',
        },
        webgl: device.gpu,
        gpuCategory: 'qualcomm',
        hardwareConcurrency: pick(rand, [4, 6, 8]),
        deviceMemory: pick(rand, [4, 6, 8, 12]),
        timezone: locale.tz,
        language: locale.lang,
      });
    }
  }

  // ── Safari on iOS (mobile) ───────────────────────────────────────────────
  for (const device of IOS_DEVICES) {
    const numVariants = Math.max(1, Math.floor(iphoneBudget / IOS_DEVICES.length / 2));
    for (let i = 0; i < numVariants && profiles.length < desktopBudget + androidBudget + iphoneBudget; i++) {
      const version = pick(rand, SAFARI_VERSIONS.filter(v => parseFloat(v) >= 16));
      const locale = pick(rand, LOCALES.filter(l => ['en', 'ja', 'ko', 'zh'].includes(l.lang)));
      const screen = { w: device.screen[0], h: device.screen[1] };
      const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS ${device.os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Mobile/15E148 Safari/604.1`;

      profiles.push({
        ua,
        platform: 'iPhone',
        version,
        browser: 'safari',
        device: device.model,
        isMobile: true,
        isTablet: false,
        locale: locale.code,
        screen,
        clientHints: null,
        webgl: device.gpu,
        gpuCategory: 'apple',
        hardwareConcurrency: pick(rand, [6]),
        deviceMemory: pick(rand, [4, 6, 8]),
        timezone: locale.tz,
        language: locale.lang,
      });
    }
  }

  // ── Safari on iPad (tablet) ──────────────────────────────────────────────
  for (const device of IOS_DEVICES.filter(d => d.model.includes('iPad'))) {
    const numVariants = Math.max(1, Math.floor(ipadBudget / IOS_DEVICES.filter(d => d.model.includes('iPad')).length));
    for (let i = 0; i < numVariants && profiles.length < targetCount; i++) {
      const version = pick(rand, SAFARI_VERSIONS.filter(v => parseFloat(v) >= 16));
      const locale = pick(rand, LOCALES.filter(l => ['en', 'ja', 'ko', 'zh'].includes(l.lang)));
      const screen = { w: device.screen[0], h: device.screen[1] };
      const ua = `Mozilla/5.0 (iPad; CPU OS ${device.os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Mobile/15E148 Safari/604.1`;

      profiles.push({
        ua,
        platform: 'iPad',
        version,
        browser: 'safari',
        device: device.model,
        isMobile: false,
        isTablet: true,
        locale: locale.code,
        screen,
        clientHints: null,
        webgl: device.gpu,
        gpuCategory: 'apple',
        hardwareConcurrency: pick(rand, [8, 10]),
        deviceMemory: pick(rand, [4, 8]),
        timezone: locale.tz,
        language: locale.lang,
      });
    }
  }

  // ── Deduplicate by UA + screen + GPU + locale ─────────────────────────────
  // (locale in the key: without it, mobile variants collapse hard — an
  // Android model has one fixed GPU/screen, so version+locale is the only
  // differentiator — and the pool skews 80% desktop.)
  const seen = new Set();
  const unique = [];
  for (const p of profiles) {
    const key = `${p.ua}:${p.screen.w}x${p.screen.h}:${p.webgl}:${p.locale}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }

  return unique;
}

// ---------------------------------------------------------------------------
// Single fingerprint generator (picks from pool)
// ---------------------------------------------------------------------------

let _pool = null;

function getPool() {
  if (!_pool || _pool.length === 0) {
    _pool = generateFingerprintPool(10000); // 10k unique fingerprints
  }
  return _pool;
}

export function getRandomFingerprint() {
  const pool = getPool();
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}

export function getFingerprintBySeed(seed) {
  const pool = getPool();
  return { ...pool[seed % pool.length] };
}

export function getFingerprintPool() {
  return getPool();
}

export function getFingerprintPoolSize() {
  return getPool().length;
}
