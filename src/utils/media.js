const OSS_DOMAIN = 'aigcog.com';
const LEGACY_OSS_IP = '8.149.136.249';

export const toSecureUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('blob:')) return url;

  let secureUrl = url;
  if (secureUrl.includes(LEGACY_OSS_IP)) {
    secureUrl = secureUrl.replace(LEGACY_OSS_IP, OSS_DOMAIN);
  }
  if (secureUrl.startsWith('http:')) {
    secureUrl = secureUrl.replace('http:', 'https:');
  }
  return secureUrl;
};

export const isCompletedHistoryItem = (item) => {
  if (!item) return false;
  if (item.status !== undefined && item.status !== 'SUCCESS') return false;
  const img = item.image;
  return typeof img === 'string' && img.trim() !== '';
};

