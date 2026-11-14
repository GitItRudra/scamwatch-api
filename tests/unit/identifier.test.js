const { normalizeIdentifier, parseUrl } = require('../../src/utils/identifier');

const normalized = (kind, value) => normalizeIdentifier(kind, value).normalized;

describe('normalizeIdentifier', () => {
  describe('phone', () => {
    it.each([
      ['+91 98765 43210', '9876543210'],
      ['09876543210', '9876543210'],
      ['98765-43210', '9876543210'],
      ['+1 415 555 2671', '+14155552671'],
    ])('normalizes %s', (input, expected) => {
      expect(normalized('phone', input)).toBe(expected);
    });

    it.each(['12345', '5876543210', 'call me', ''])('rejects %p', (input) => {
      expect(() => normalizeIdentifier('phone', input)).toThrow(/valid phone number/);
    });
  });

  describe('upi', () => {
    it('lowercases and trims', () => {
      expect(normalized('upi', '  Support.Refund@OKAXIS ')).toBe('support.refund@okaxis');
    });
    it('rejects values without a handle', () => {
      expect(() => normalizeIdentifier('upi', 'justaname')).toThrow();
    });
  });

  describe('url', () => {
    it.each([
      ['https://www.Example.com/path?x=1', 'example.com'],
      ['bit.ly/abc123', 'bit.ly'],
      ['http://192.168.4.20/login', '192.168.4.20'],
    ])('reduces %s to its host', (input, expected) => {
      expect(normalized('url', input)).toBe(expected);
    });

    it.each(['ftp://files.example.com', 'localhost', 'not a url'])('rejects %p', (input) => {
      expect(() => normalizeIdentifier('url', input)).toThrow();
    });

    it('records whether the user typed a scheme', () => {
      expect(parseUrl('example.com').scheme).toBeNull();
      expect(parseUrl('http://example.com').scheme).toBe('http');
    });
  });

  it('validates emails', () => {
    expect(normalized('email', 'Help.Desk@Example.COM')).toBe('help.desk@example.com');
    expect(() => normalizeIdentifier('email', 'nope@')).toThrow();
  });

  it('validates bank account numbers', () => {
    expect(normalized('bank_account', '1234 5678 9012')).toBe('123456789012');
    expect(() => normalizeIdentifier('bank_account', '12345')).toThrow();
  });

  it('rejects unknown kinds, including prototype keys', () => {
    expect(() => normalizeIdentifier('constructor', 'x')).toThrow(/Unsupported/);
  });
});
