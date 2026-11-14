const { evaluateHeuristics, MAX_POINTS } = require('../../src/services/riskHeuristics');

const codes = (result) => result.flags.map((f) => f.code);

describe('evaluateHeuristics', () => {
  it('flags a lookalike banking domain', () => {
    const result = evaluateHeuristics('url', 'http://sbi-kyc-update.xyz/login');
    expect(codes(result)).toEqual(
      expect.arrayContaining(['NO_HTTPS', 'RISKY_TLD', 'SCAM_KEYWORDS', 'BRAND_LOOKALIKE'])
    );
  });

  it('does not flag the real domain of a brand', () => {
    expect(codes(evaluateHeuristics('url', 'https://www.onlinesbi.sbi'))).not.toContain('BRAND_LOOKALIKE');
    expect(codes(evaluateHeuristics('url', 'https://netbanking.hdfcbank.com'))).not.toContain('BRAND_LOOKALIKE');
  });

  it('does not penalise a missing scheme the user never typed', () => {
    expect(codes(evaluateHeuristics('url', 'example.com'))).not.toContain('NO_HTTPS');
  });

  it('flags IP hosts, shorteners and embedded credentials', () => {
    expect(codes(evaluateHeuristics('url', 'https://10.0.0.5/pay'))).toContain('IP_HOST');
    expect(codes(evaluateHeuristics('url', 'https://bit.ly/x1'))).toContain('URL_SHORTENER');
    expect(codes(evaluateHeuristics('url', 'https://google.com@evil.example.net'))).toContain('EMBEDDED_CREDENTIALS');
  });

  it('flags UPI IDs that pose as support desks', () => {
    const result = evaluateHeuristics('upi', 'refund.support@fakebank');
    expect(codes(result)).toEqual(expect.arrayContaining(['UNKNOWN_UPI_HANDLE', 'UPI_KEYWORDS']));
    expect(codes(evaluateHeuristics('upi', 'ramesh@oksbi'))).toEqual([]);
  });

  it('flags official-sounding addresses on free mail providers', () => {
    expect(codes(evaluateHeuristics('email', 'sbi.support@gmail.com'))).toContain('OFFICIAL_ROLE_ON_FREE_MAIL');
    expect(codes(evaluateHeuristics('email', 'x@mailinator.com'))).toContain('DISPOSABLE_EMAIL');
  });

  it('flags repeated and sequential phone digits', () => {
    expect(codes(evaluateHeuristics('phone', '9999999912'))).toContain('REPEATED_DIGITS');
    expect(codes(evaluateHeuristics('phone', '9812345678'))).toContain('SEQUENTIAL_DIGITS');
  });

  it('never exceeds the cap and ignores kinds without rules', () => {
    const noisy = evaluateHeuristics('url', 'http://10.1.1.1/kyc-verify-lottery-prize-free');
    expect(noisy.points).toBeLessThanOrEqual(MAX_POINTS);
    expect(evaluateHeuristics('bank_account', '123456789012').points).toBe(0);
  });
});
