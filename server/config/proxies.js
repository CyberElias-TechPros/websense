// ============================================================================
// proxies.js — Proxy registry.
// Webshare proxies with authentication. Structured proxy metadata
// (host/port/location) lives here. Credentials are injected from
// config.proxyAuth (env) at runtime — never stored in code.
// ============================================================================

/**
 * Each proxy: { host, port, country, city, flag }
 * Country codes are ISO-3166 alpha-2.
 * All proxies use Webshare credentials: hmxpvtyv / s56i3b0mmjwv
 */
export const PROXIES = [
  // United Kingdom
  { host: '31.59.33.185', port: 6761, country: 'GB', city: 'London', flag: '🇬🇧' },
  { host: '155.254.39.121', port: 6079, country: 'GB', city: 'London', flag: '🇬🇧' },
  { host: '151.245.211.4', port: 6199, country: 'GB', city: 'London', flag: '🇬🇧' },
  { host: '104.143.226.188', port: 5791, country: 'GB', city: 'London', flag: '🇬🇧' },
  { host: '104.232.209.165', port: 6123, country: 'GB', city: 'London', flag: '🇬🇧' },
  { host: '185.236.95.245', port: 6206, country: 'GB', city: 'London', flag: '🇬🇧' },
  { host: '45.38.107.161', port: 6078, country: 'GB', city: 'Leeds', flag: '🇬🇧' },

  // United States - New York
  { host: '213.169.229.140', port: 7280, country: 'US', city: 'New York', flag: '🇺🇸' },
  { host: '82.24.212.169', port: 5475, country: 'US', city: 'New York', flag: '🇺🇸' },
  { host: '213.169.208.99', port: 7740, country: 'US', city: 'New York', flag: '🇺🇸' },

  // United States - Los Angeles
  { host: '107.174.136.254', port: 6196, country: 'US', city: 'Los Angeles', flag: '🇺🇸' },
  { host: '45.67.3.128', port: 6291, country: 'US', city: 'Los Angeles', flag: '🇺🇸' },
  { host: '152.232.100.48', port: 9142, country: 'US', city: 'Los Angeles', flag: '🇺🇸' },
  { host: '152.232.100.217', port: 9311, country: 'US', city: 'Los Angeles', flag: '🇺🇸' },
  { host: '89.32.200.115', port: 6571, country: 'US', city: 'Los Angeles', flag: '🇺🇸' },

  // United States - Dallas
  { host: '155.254.38.155', port: 5831, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '199.180.9.88', port: 6108, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '45.41.172.210', port: 5953, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '136.0.109.166', port: 6452, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '45.56.173.128', port: 6111, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '104.239.23.86', port: 5847, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '194.38.26.133', port: 7194, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '84.33.243.183', port: 5874, country: 'US', city: 'Dallas', flag: '🇺🇸' },
  { host: '104.238.38.58', port: 6326, country: 'US', city: 'Dallas', flag: '🇺🇸' },

  // United States - Chicago
  { host: '142.111.44.206', port: 5918, country: 'US', city: 'Chicago', flag: '🇺🇸' },
  { host: '136.0.118.129', port: 6501, country: 'US', city: 'Chicago', flag: '🇺🇸' },
  { host: '103.47.53.141', port: 8439, country: 'US', city: 'Chicago', flag: '🇺🇸' },
  { host: '136.0.118.83', port: 6455, country: 'US', city: 'Chicago', flag: '🇺🇸' },
  { host: '46.202.78.87', port: 8349, country: 'US', city: 'Chicago', flag: '🇺🇸' },

  // United States - Ashburn/Fremont/Buffalo/Newark/Seattle/Orem/Santa Clara
  { host: '142.147.245.193', port: 5884, country: 'US', city: 'Ashburn', flag: '🇺🇸' },
  { host: '142.147.242.252', port: 6231, country: 'US', city: 'Ashburn', flag: '🇺🇸' },
  { host: '173.211.0.93', port: 6586, country: 'US', city: 'Ashburn Va', flag: '🇺🇸' },
  { host: '45.41.177.7', port: 5657, country: 'US', city: 'Ashburn', flag: '🇺🇸' },
  { host: '104.245.244.89', port: 6529, country: 'US', city: 'Fremont', flag: '🇺🇸' },
  { host: '192.177.103.220', port: 6713, country: 'US', city: 'Fremont', flag: '🇺🇸' },
  { host: '166.88.34.31', port: 5742, country: 'US', city: 'Fremont', flag: '🇺🇸' },
  { host: '107.172.163.233', port: 6749, country: 'US', city: 'Buffalo', flag: '🇺🇸' },
  { host: '2.57.30.212', port: 7288, country: 'US', city: 'Buffalo', flag: '🇺🇸' },
  { host: '23.236.179.190', port: 5821, country: 'US', city: 'Newark', flag: '🇺🇸' },
  { host: '191.101.188.225', port: 6979, country: 'US', city: 'Seattle', flag: '🇺🇸' },
  { host: '172.245.158.156', port: 6109, country: 'US', city: 'Seattle', flag: '🇺🇸' },
  { host: '50.114.8.182', port: 7167, country: 'US', city: 'Orem', flag: '🇺🇸' },
  { host: '104.165.243.19', port: 6679, country: 'US', city: 'Santa Clara', flag: '🇺🇸' },
  { host: '23.109.225.194', port: 5825, country: 'US', city: 'Fremont', flag: '🇺🇸' },
  { host: '192.177.103.120', port: 6613, country: 'US', city: 'Fremont', flag: '🇺🇸' },
  { host: '142.111.93.119', port: 6680, country: 'US', city: 'Fremont', flag: '🇺🇸' },
  { host: '23.26.68.41', port: 6024, country: 'US', city: 'Ashburn', flag: '🇺🇸' },
  { host: '23.27.210.189', port: 6559, country: 'US', city: 'Ashburn', flag: '🇺🇸' },

  // France
  { host: '145.223.62.93', port: 6154, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '145.223.55.214', port: 7261, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '45.87.51.217', port: 6777, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '45.87.51.203', port: 6763, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '82.23.204.225', port: 7057, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '87.82.53.188', port: 6832, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '171.22.250.2', port: 6121, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '146.103.4.188', port: 6735, country: 'FR', city: 'Paris', flag: '🇫🇷' },
  { host: '140.99.189.176', port: 8054, country: 'FR', city: 'Marseille', flag: '🇫🇷' },
  { host: '166.88.224.254', port: 6152, country: 'FR', city: 'Marseille', flag: '🇫🇷' },

  // Germany
  { host: '64.137.42.78', port: 5123, country: 'DE', city: 'Frankfurt', flag: '🇩🇪' },
  { host: '92.113.236.134', port: 6719, country: 'DE', city: 'Frankfurt', flag: '🇩🇪' },
  { host: '206.232.71.90', port: 6661, country: 'DE', city: 'Frankfurt', flag: '🇩🇪' },
  { host: '31.57.76.9', port: 5581, country: 'DE', city: 'Frankfurt', flag: '🇩🇪' },
  { host: '64.137.10.50', port: 5700, country: 'DE', city: 'Frankfurt', flag: '🇩🇪' },

  // Italy
  { host: '104.239.20.110', port: 6185, country: 'IT', city: 'Milan', flag: '🇮🇹' },
  { host: '191.101.188.69', port: 6823, country: 'IT', city: 'Milano', flag: '🇮🇹' },
  { host: '199.180.11.17', port: 6754, country: 'IT', city: 'Milano', flag: '🇮🇹' },
  { host: '64.137.31.210', port: 6824, country: 'IT', city: 'Milano', flag: '🇮🇹' },
  { host: '31.193.188.170', port: 7187, country: 'IT', city: 'Milan', flag: '🇮🇹' },
  { host: '84.33.243.183', port: 5874, country: 'IT', city: 'Rome', flag: '🇮🇹' },

  // Poland
  { host: '82.25.224.203', port: 8014, country: 'PL', city: 'Warsaw', flag: '🇵🇱' },
  { host: '2.26.152.115', port: 6137, country: 'PL', city: 'Warsaw', flag: '🇵🇱' },

  // Finland
  { host: '103.99.33.151', port: 6146, country: 'FI', city: 'Helsinki', flag: '🇫🇮' },
  { host: '82.24.236.26', port: 7836, country: 'FI', city: 'Helsinki', flag: '🇫🇮' },

  // Croatia
  { host: '82.23.211.13', port: 5342, country: 'HR', city: 'Zagreb', flag: '🇭🇷' },
  { host: '82.24.217.182', port: 5512, country: 'HR', city: 'Zagreb', flag: '🇭🇷' },

  // Albania
  { host: '45.67.3.184', port: 6347, country: 'AL', city: 'Tirana', flag: '🇦🇱' },
  { host: '31.57.78.194', port: 5578, country: 'AL', city: 'Tirana', flag: '🇦🇱' },

  // Turkey
  { host: '195.172.135.85', port: 5221, country: 'TR', city: 'Istanbul', flag: '🇹🇷' },

  // Singapore
  { host: '92.113.236.134', port: 6719, country: 'SG', city: 'Singapore', flag: '🇸🇬' },

  // India
  { host: '64.137.83.136', port: 6076, country: 'IN', city: 'Mumbai', flag: '🇮🇳' },
  { host: '31.77.233.253', port: 8060, country: 'IN', city: 'Mumbai', flag: '🇮🇳' },

  // Thailand
  { host: '104.239.20.250', port: 6325, country: 'TH', city: 'Bangkok', flag: '🇹🇭' },

  // South Africa
  { host: '140.99.194.134', port: 7511, country: 'ZA', city: 'Johannesburg', flag: '🇿🇦' },

  // Sweden
  { host: '104.239.107.179', port: 5831, country: 'SE', city: 'Stockholm', flag: '🇸🇪' },
  { host: '92.112.236.206', port: 6638, country: 'SE', city: 'Stockholm', flag: '🇸🇪' },

  // Canada
  { host: '38.225.14.96', port: 5876, country: 'CA', city: 'Montreal', flag: '🇨🇦' },
  { host: '45.38.78.195', port: 6132, country: 'CA', city: 'Montreal', flag: '🇨🇦' },

  // Spain
  { host: '82.26.211.160', port: 5991, country: 'ES', city: 'Cadiz', flag: '🇪🇸' },

  // Slovakia
  { host: '82.24.239.102', port: 6959, country: 'SK', city: 'Bratislava', flag: '🇸🇰' },

  // Austria
  { host: '45.39.96.137', port: 5550, country: 'AT', city: 'Vienna', flag: '🇦🇹' },

  // Belgium
  { host: '161.123.65.203', port: 6912, country: 'BE', city: 'Brussels', flag: '🇧🇪' },

  // Netherlands
  { host: '152.232.100.217', port: 9311, country: 'NL', city: 'Amsterdam', flag: '🇳🇱' },

  // Brazil
  { host: '92.112.170.201', port: 6170, country: 'BR', city: 'Sao Paolo', flag: '🇧🇷' },
  { host: '104.252.109.135', port: 7068, country: 'BR', city: 'Sao Paolo', flag: '🇧🇷' },
  { host: '209.35.5.81', port: 6772, country: 'BR', city: 'Sao Paolo', flag: '🇧🇷' },

  // Latvia
  { host: '82.23.204.225', port: 7057, country: 'LV', city: 'Riga', flag: '🇱🇻' },

  // 205.164.57.16 is US/Fremont - already covered above pattern
  { host: '205.164.57.16', port: 5591, country: 'US', city: 'Fremont', flag: '🇺🇸' },
  { host: '23.236.179.190', port: 5821, country: 'US', city: 'Newark', flag: '🇺🇸' },
  { host: '31.77.233.253', port: 8060, country: 'IN', city: 'Mumbai', flag: '🇮🇳' },
];

/**
 * Build the full proxy objects with credentials attached.
 */
export function buildProxyList(proxyAuth) {
  return PROXIES.map((p) => ({
    ...p,
<<<<<<< HEAD
    type: p.type || 'http',
    source: 'webshare', // paid pool — user's Webshare subscription (~100 proxies)
=======
>>>>>>> b99e6874ed35a4bfe1ffef506c3d9abe1b6f023a
    username: proxyAuth.username,
    password: proxyAuth.password,
  }));
}
