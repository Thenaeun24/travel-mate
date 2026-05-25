// Supported trip currencies for the household ledger (가계부).
// `code` matches ISO 4217 codes used by the open.er-api.com exchange rate API.
export const CURRENCIES = [
  { code: 'JPY', symbol: '¥', label: '엔', flag: '🇯🇵' },
  { code: 'KRW', symbol: '₩', label: '원', flag: '🇰🇷' },
  { code: 'USD', symbol: '$', label: '달러', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', label: '유로', flag: '🇪🇺' },
  { code: 'THB', symbol: '฿', label: '바트', flag: '🇹🇭' },
  { code: 'VND', symbol: '₫', label: '동', flag: '🇻🇳' },
  { code: 'CNY', symbol: '元', label: '위안', flag: '🇨🇳' },
  { code: 'TWD', symbol: 'NT$', label: '대만달러', flag: '🇹🇼' },
  { code: 'HKD', symbol: 'HK$', label: '홍콩달러', flag: '🇭🇰' },
  { code: 'GBP', symbol: '£', label: '파운드', flag: '🇬🇧' },
  { code: 'SGD', symbol: 'S$', label: '싱가포르달러', flag: '🇸🇬' },
  { code: 'PHP', symbol: '₱', label: '페소', flag: '🇵🇭' },
  { code: 'AUD', symbol: 'A$', label: '호주달러', flag: '🇦🇺' },
  { code: 'NZD', symbol: 'NZ$', label: '뉴질랜드달러', flag: '🇳🇿' },
];

export const DEFAULT_CURRENCY = 'JPY';
export const HOME_CURRENCY = 'KRW';

const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

export const currencySymbol = (code) => CURRENCY_MAP[code]?.symbol ?? code;
export const currencyLabel = (code) => CURRENCY_MAP[code]?.label ?? code;
