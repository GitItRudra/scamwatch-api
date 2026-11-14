const { IDENTIFIER_KINDS } = require('../constants');
const AppError = require('./AppError');

const UPI_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31}$/;
const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOSTNAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const LABELS = {
  [IDENTIFIER_KINDS.PHONE]: 'phone number',
  [IDENTIFIER_KINDS.UPI]: 'UPI ID',
  [IDENTIFIER_KINDS.EMAIL]: 'email address',
  [IDENTIFIER_KINDS.URL]: 'URL',
  [IDENTIFIER_KINDS.BANK_ACCOUNT]: 'bank account number',
};

function normalizePhone(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  if (/^[6-9]\d{9}$/.test(digits)) return digits;

  // Foreign numbers must be written with an explicit + so they are not confused with Indian ones.
  if (raw.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function normalizeUpi(raw) {
  const value = raw.trim().toLowerCase();
  return UPI_PATTERN.test(value) ? value : null;
}

function normalizeEmail(raw) {
  const value = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(value) ? value : null;
}

function normalizeBankAccount(raw) {
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{9,18}$/.test(digits) ? digits : null;
}

/**
 * Splits a user supplied link into the parts the rest of the system cares about.
 * Returns null when the input is not a plausible http(s) link.
 */
function parseUrl(raw) {
  const input = raw.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);

  let url;
  try {
    url = new URL(hasScheme ? input : `http://${input}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const hostname = url.hostname.replace(/^www\./, '');
  const isIp = IPV4_PATTERN.test(hostname);
  if (!isIp && !HOSTNAME_PATTERN.test(hostname)) return null;

  return {
    hostname,
    isIp,
    path: `${url.pathname}${url.search}`,
    // null when the user did not type a scheme, so we never penalise a missing https:// they never wrote
    scheme: hasScheme ? url.protocol.slice(0, -1) : null,
    hasCredentials: Boolean(url.username || url.password),
  };
}

const NORMALIZERS = {
  [IDENTIFIER_KINDS.PHONE]: normalizePhone,
  [IDENTIFIER_KINDS.UPI]: normalizeUpi,
  [IDENTIFIER_KINDS.EMAIL]: normalizeEmail,
  [IDENTIFIER_KINDS.BANK_ACCOUNT]: normalizeBankAccount,
  // Scam sites rotate paths constantly, so URLs are matched on the host only.
  [IDENTIFIER_KINDS.URL]: (raw) => parseUrl(raw)?.hostname ?? null,
};

function normalizeIdentifier(kind, rawValue) {
  if (!Object.hasOwn(NORMALIZERS, kind)) {
    throw AppError.unprocessable(`Unsupported identifier kind "${kind}"`);
  }

  const value = String(rawValue ?? '').trim();
  const normalized = value ? NORMALIZERS[kind](value) : null;

  if (!normalized) {
    const message = `"${value}" is not a valid ${LABELS[kind]}`;
    throw AppError.unprocessable(message, [{ field: 'identifier.value', message }]);
  }

  return { kind, value, normalized };
}

module.exports = { normalizeIdentifier, parseUrl };
