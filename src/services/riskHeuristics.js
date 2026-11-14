const { IDENTIFIER_KINDS } = require('../constants');
const { parseUrl } = require('../utils/identifier');

// Static signals only look at the identifier itself, so they work even when nobody has reported it yet.
const MAX_POINTS = 20;

const URL_KEYWORDS = [
  'kyc', 'verify', 'lottery', 'prize', 'free', 'reward', 'claim', 'login', 'update',
  'bonus', 'refund', 'winner', 'gift', 'secure', 'offer', 'recharge',
];
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at',
  'ow.ly', 'buff.ly', 'tiny.cc', 'rebrand.ly', 'bit.do',
]);
const RISKY_TLDS = new Set([
  'xyz', 'top', 'click', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'loan', 'zip', 'country', 'kim', 'men',
]);
const BRANDS = {
  sbi: ['sbi.co.in', 'onlinesbi.sbi'],
  hdfc: ['hdfcbank.com'],
  icici: ['icicibank.com'],
  axis: ['axisbank.com'],
  paytm: ['paytm.com'],
  phonepe: ['phonepe.com'],
  amazon: ['amazon.in', 'amazon.com'],
  flipkart: ['flipkart.com'],
  irctc: ['irctc.co.in'],
  google: ['google.com'],
  epfo: ['epfindia.gov.in'],
};

const KNOWN_UPI_HANDLES = new Set([
  'okaxis', 'oksbi', 'okhdfcbank', 'okicici', 'ybl', 'ibl', 'axl', 'paytm', 'apl', 'upi',
  'sbi', 'icici', 'hdfcbank', 'axisbank', 'pnb', 'boi', 'cnrb', 'idfcbank', 'kotak', 'airtel',
  'jio', 'postbank', 'fbl', 'yesbank', 'indus', 'rbl', 'freecharge', 'waicici', 'wahdfcbank',
  'waaxis', 'wasbi', 'ikwik', 'abfspay', 'slice', 'ezetap',
]);
const UPI_KEYWORDS = [
  'support', 'refund', 'kyc', 'care', 'helpdesk', 'lottery', 'prize', 'reward', 'cashback',
  'verify', 'claim', 'customer',
];

const FREE_MAIL = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'proton.me', 'protonmail.com',
]);
const DISPOSABLE_MAIL = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com',
]);
const EMAIL_ROLES = ['support', 'helpdesk', 'kyc', 'refund', 'lottery', 'prize', 'winner', 'claim', 'care', 'service'];

const flag = (code, points, message) => ({ code, points, message });
const matches = (text, words) => words.filter((word) => text.includes(word));
const tldOf = (host) => host.split('.').pop();

function impersonatedBrand(hostname) {
  const labels = hostname.split(/[.-]/);
  return Object.keys(BRANDS).find((brand) => {
    const present = brand.length >= 5 ? hostname.includes(brand) : labels.includes(brand);
    const official = BRANDS[brand].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    return present && !official;
  });
}

function evaluateUrl(value) {
  const parts = parseUrl(value);
  if (!parts) return [];

  const { hostname, path, scheme, isIp, hasCredentials } = parts;
  const flags = [];

  if (scheme === 'http') flags.push(flag('NO_HTTPS', 4, 'Link uses plain HTTP instead of HTTPS'));
  if (isIp) flags.push(flag('IP_HOST', 8, 'Link points to a raw IP address instead of a domain name'));
  if (hasCredentials) flags.push(flag('EMBEDDED_CREDENTIALS', 6, 'Link contains a username or password, a common way to disguise the real host'));
  if (hostname.includes('xn--')) flags.push(flag('PUNYCODE', 6, 'Domain uses punycode, which can imitate lookalike characters'));
  if (SHORTENERS.has(hostname)) flags.push(flag('URL_SHORTENER', 5, 'Link is hidden behind a URL shortener'));
  if (!isIp && RISKY_TLDS.has(tldOf(hostname))) flags.push(flag('RISKY_TLD', 4, `Domain ends in .${tldOf(hostname)}, which is heavily abused by scam sites`));
  if (!isIp && hostname.split('.').length > 4) flags.push(flag('DEEP_SUBDOMAINS', 3, 'Domain has an unusually long chain of subdomains'));

  const keywords = matches(`${hostname}${path}`.toLowerCase(), URL_KEYWORDS);
  if (keywords.length) {
    flags.push(flag('SCAM_KEYWORDS', Math.min(6, keywords.length * 2), `Link contains scam-typical words: ${keywords.join(', ')}`));
  }

  const brand = isIp ? undefined : impersonatedBrand(hostname);
  if (brand) flags.push(flag('BRAND_LOOKALIKE', 8, `Domain mentions "${brand}" but is not an official ${brand} domain`));

  return flags;
}

function evaluateUpi(value) {
  const [local, handle] = value.toLowerCase().split('@');
  const flags = [];

  if (!KNOWN_UPI_HANDLES.has(handle)) {
    flags.push(flag('UNKNOWN_UPI_HANDLE', 5, `"@${handle}" is not a widely used UPI handle`));
  }
  const keywords = matches(local, UPI_KEYWORDS);
  if (keywords.length) {
    flags.push(flag('UPI_KEYWORDS', 8, `UPI ID contains words used to pose as official support: ${keywords.join(', ')}`));
  }
  return flags;
}

function evaluateEmail(value) {
  const [local, domain] = value.toLowerCase().split('@');
  const flags = [];

  if (DISPOSABLE_MAIL.has(domain)) {
    flags.push(flag('DISPOSABLE_EMAIL', 10, 'Address belongs to a disposable email service'));
  }
  if (RISKY_TLDS.has(tldOf(domain))) {
    flags.push(flag('RISKY_EMAIL_TLD', 4, `Email domain ends in .${tldOf(domain)}`));
  }

  const roleWords = matches(local, EMAIL_ROLES);
  const brand = Object.keys(BRANDS).find((b) => local.includes(b));
  if (FREE_MAIL.has(domain) && (roleWords.length || brand)) {
    flags.push(flag('OFFICIAL_ROLE_ON_FREE_MAIL', 8, 'Address poses as an official sender but uses a free email provider'));
  } else if (roleWords.length) {
    flags.push(flag('EMAIL_ROLE_WORDS', 3, `Address contains: ${roleWords.join(', ')}`));
  }
  if ((local.match(/\d/g) || []).length >= 6) {
    flags.push(flag('DIGIT_HEAVY_EMAIL', 3, 'Address contains a long run of digits'));
  }
  return flags;
}

function evaluatePhone(normalized) {
  const digits = normalized.replace(/\D/g, '');
  const flags = [];

  if (/(\d)\1{5,}/.test(digits)) {
    flags.push(flag('REPEATED_DIGITS', 5, 'Number contains a long run of the same digit'));
  }
  if (/(0123456|1234567|2345678|3456789|9876543|8765432|7654321)/.test(digits)) {
    flags.push(flag('SEQUENTIAL_DIGITS', 4, 'Number contains a sequential digit pattern'));
  }
  if (normalized.startsWith('+') && !normalized.startsWith('+91')) {
    flags.push(flag('FOREIGN_NUMBER', 3, 'Number uses a foreign country code'));
  }
  return flags;
}

const EVALUATORS = {
  [IDENTIFIER_KINDS.URL]: evaluateUrl,
  [IDENTIFIER_KINDS.UPI]: evaluateUpi,
  [IDENTIFIER_KINDS.EMAIL]: evaluateEmail,
  [IDENTIFIER_KINDS.PHONE]: evaluatePhone,
};

/**
 * @param {string} kind        identifier kind
 * @param {string} value       the raw value for URLs, the normalized value for everything else
 */
function evaluateHeuristics(kind, value) {
  const evaluate = EVALUATORS[kind];
  const flags = evaluate ? evaluate(value) : [];
  const points = Math.min(MAX_POINTS, flags.reduce((sum, f) => sum + f.points, 0));
  return { points, maxPoints: MAX_POINTS, flags };
}

module.exports = { evaluateHeuristics, MAX_POINTS };
