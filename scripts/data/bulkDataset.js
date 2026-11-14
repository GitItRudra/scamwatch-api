/*
 * Builds a realistic, repeatable demo dataset: 100 reports across 32 scam campaigns, with votes,
 * comments and the audit trail a moderator would have left. Pure function, no database access,
 * so it can be validated in tests. All identifiers are fictional.
 */
const { Types } = require('mongoose');
const { normalizeIdentifier } = require('../../src/utils/identifier');

const DAY = 86_400_000;
const HOUR = 3_600_000;

const DEMO_USER_NAMES = [
  'Aarav Sharma', 'Priya Verma', 'Rohan Mehta', 'Ananya Iyer', 'Karthik Nair', 'Sneha Patil',
  'Vikram Singh', 'Neha Gupta', 'Arjun Reddy', 'Pooja Joshi', 'Imran Khan', 'Divya Menon',
];

// Rows: [kind, values, scam types, number of reports]
const CAMPAIGNS = [
  ['upi', ['refund.support@okaxis', 'Refund.Support@okaxis'], ['upi_fraud'], 6],
  ['upi', ['paytm.kyc.care@ybl'], ['kyc_fraud'], 4],
  ['upi', ['cashback.reward@paytm'], ['upi_fraud'], 3],
  ['upi', ['customer.helpdesk@ibl'], ['impersonation'], 3],
  ['upi', ['lottery.claim@okicici'], ['lottery'], 3],
  ['upi', ['ramesh.trader786@oksbi'], ['online_shopping'], 2],
  ['upi', ['loan.verify@fakebank'], ['loan_app'], 2],
  ['url', ['http://sbi-kyc-update.xyz/login', 'sbi-kyc-update.xyz/verify?id=88'], ['kyc_fraud', 'phishing'], 4],
  ['url', ['https://hdfc-reward-claim.top/redeem', 'hdfc-reward-claim.top'], ['phishing'], 4],
  ['url', ['http://amazon-prize-winner.xyz/claim'], ['lottery'], 4],
  ['url', ['https://irctc-refund-help.top/refund'], ['phishing'], 3],
  ['url', ['https://quickloan-instant.work/apply'], ['loan_app'], 3],
  ['url', ['https://crypto-double-profit.click', 'crypto-double-profit.click/join'], ['investment'], 4],
  ['url', ['http://jio-recharge-bonus.click/offer'], ['phishing'], 3],
  ['url', ['http://203.0.113.45/netbanking/login'], ['phishing'], 2],
  ['url', ['https://bit.ly/3FreeGift', 'bit.ly/winPrize9'], ['lottery'], 3],
  ['url', ['https://freshkart-deals.top/sale'], ['online_shopping'], 3],
  ['url', ['https://trade-pro-signals.xyz'], ['investment'], 3],
  ['url', ['https://sarkari-job-apply.top/register'], ['fake_job'], 3],
  ['email', ['hr.recruitment@gmail.com'], ['fake_job'], 3],
  ['email', ['sbi.support.team@gmail.com'], ['impersonation'], 3],
  ['email', ['claim.prize.winner@mailinator.com'], ['lottery'], 2],
  ['email', ['security.alert@amaz0n-support.top'], ['phishing'], 2],
  ['phone', ['9000001101', '+91 90000 01101'], ['tech_support'], 3],
  ['phone', ['9000001202', '090000 01202'], ['investment'], 4],
  ['phone', ['9000001303', '+91 9000001303'], ['fake_job'], 4],
  ['phone', ['+92 300 1234567'], ['romance'], 3],
  ['phone', ['9000001404'], ['loan_app'], 3],
  ['phone', ['9000001505', '+91-90000-01505'], ['impersonation'], 3],
  ['phone', ['9000001606'], ['kyc_fraud'], 3],
  ['bank_account', ['123456789012', '1234 5678 9012'], ['fake_job', 'online_shopping'], 3],
  ['bank_account', ['009876543210987'], ['investment'], 2],
];

const LOSS_RANGE = {
  upi_fraud: [1500, 45000], kyc_fraud: [5000, 90000], phishing: [1000, 80000], fake_job: [1000, 15000],
  lottery: [2000, 30000], investment: [20000, 500000], loan_app: [2000, 25000], romance: [10000, 200000],
  tech_support: [3000, 60000], impersonation: [10000, 300000], online_shopping: [500, 20000],
};

const STORIES = {
  upi_fraud: {
    titles: ['Fake refund request sent through UPI', 'Collect request disguised as a refund', 'Money debited after approving a UPI request'],
    stories: [
      'A caller said a refund was pending and sent a collect request from {id}. I approved it expecting money to come in, but the amount was debited instead.',
      'I was selling an item online and the buyer, using {id}, asked me to approve a request to receive the payment. It took money out of my account.',
      'They sent a payment request from {id} with a message about cashback. After I entered my UPI PIN the money left my account.',
    ],
  },
  kyc_fraud: {
    titles: ['Fake KYC update message from my bank', 'Threat of account blocking unless KYC is updated', 'KYC verification link stole my banking details'],
    stories: [
      'I received an SMS saying my account would be blocked today unless I completed KYC at {id}. The page asked for my card number, expiry and OTP.',
      'A message pointed me to {id} to update my KYC. I entered my net banking details and money was transferred out within minutes.',
      'Someone claiming to be from my bank contacted me from {id} and pushed me to share an OTP for urgent KYC verification.',
    ],
  },
  phishing: {
    titles: ['Lookalike login page asking for card details', 'Phishing link received over SMS', 'Fake website imitating a well known service'],
    stories: [
      'I got a message with a link to {id} that looked like the real website. It asked for my login, card details and OTP.',
      'An email directed me to {id} for a supposed refund. The page copied the official design and collected my card information.',
      'A WhatsApp forward led me to {id}. After entering my details I received transaction alerts I did not make.',
    ],
  },
  fake_job: {
    titles: ['Work from home job that asked for a registration fee', 'Fake recruiter demanded a training deposit', 'Data entry job offer turned out to be a scam'],
    stories: [
      'A recruiter contacted me through {id} offering a work from home data entry role and asked for a refundable registration fee before starting.',
      'I was told I had been shortlisted and had to pay for training material. The contact at {id} stopped replying after I paid.',
      'The offer from {id} promised high pay for simple tasks, then kept asking for more fees for ID cards and software.',
    ],
  },
  lottery: {
    titles: ['Told I won a prize and asked for a processing fee', 'Lucky draw message demanding a fee to release the prize', 'Prize winner notification was a scam'],
    stories: [
      'I was informed through {id} that I had won a lucky draw and needed to pay a tax and processing fee to claim the prize.',
      'A message from {id} said I was selected for a gift worth lakhs. They kept asking for small payments to release it.',
      'The sender at {id} claimed I won a contest I never entered and asked for my bank details to transfer the winnings.',
    ],
  },
  investment: {
    titles: ['Guaranteed returns scheme that vanished with the money', 'Fake trading tips group promising quick profits', 'Crypto doubling offer was a scam'],
    stories: [
      'I was added to a group where {id} promised guaranteed daily returns. My first small deposit showed profit, then I could not withdraw.',
      'The contact at {id} shared stock tips and pushed me to deposit into a trading app, which blocked my withdrawals.',
      'An advertisement led me to {id}, which promised to double any crypto deposit within a week. Nothing was ever returned.',
    ],
  },
  loan_app: {
    titles: ['Instant loan app harassed me for repayment', 'Loan offer charged advance fees and disappeared', 'Loan app misused my contacts'],
    stories: [
      'I took a small instant loan through {id}. They demanded far more than agreed and threatened to message my contacts.',
      'The agent at {id} approved a loan but asked for processing and insurance fees up front. The loan never arrived.',
      'After installing the app linked to {id} I received abusive calls and edited photos were sent to people in my contact list.',
    ],
  },
  romance: {
    titles: ['Online friend asked for money for an emergency', 'Dating profile that led to a money request', 'Overseas contact built trust before asking for funds'],
    stories: [
      'I got to know someone through {id} over several weeks. They then said they were stuck abroad and needed money for a ticket.',
      'The person at {id} said they had sent me a gift that needed customs charges, then kept asking for more transfers.',
      'A friendly chat with {id} turned into requests for help with medical bills. I later found the profile photos were stolen.',
    ],
  },
  tech_support: {
    titles: ['Fake tech support call asked for remote access', 'Caller claimed my computer was infected', 'Support scam took control of my phone'],
    stories: [
      'A caller from {id} said my device was hacked and asked me to install a remote access app, then moved money out of my bank account.',
      'They claimed to be from a well known software company and used {id} to ask for payment for a useless security plan.',
      'The person at {id} guided me to install a screen sharing app and watched me open my banking app.',
    ],
  },
  impersonation: {
    titles: ['Caller posing as police demanded money', 'Fake officer threatened arrest over a parcel', 'Someone pretending to be a bank official'],
    stories: [
      'A person using {id} said I was linked to an illegal parcel and would be arrested unless I transferred money for verification.',
      'The contact at {id} claimed to be from a government agency and kept me on a video call while demanding payment.',
      'Someone at {id} pretended to be from my bank fraud team and asked me to move my savings to a safe account.',
    ],
  },
  online_shopping: {
    titles: ['Paid for an item that never arrived', 'Fake online store with unbelievable discounts', 'Seller disappeared after receiving advance payment'],
    stories: [
      'I ordered a product after seeing an offer linked to {id}. I paid in advance and the order never shipped.',
      'The seller at {id} asked for full payment before dispatch, then blocked me after I sent the money.',
      'The store at {id} sold branded goods at very low prices. What arrived, if anything, was fake or never delivered.',
    ],
  },
};

const NOTES = {
  verified: ['Matches other reports against this identifier', 'Details are consistent and specific', 'Reporter gave a clear timeline'],
  rejected: ['Not enough detail to confirm this is a scam', 'Reads like a dispute with a legitimate business', 'Duplicate of an existing report with no new information'],
};

const COMMENTS = [
  'Same thing happened to me last week.', 'Thanks for reporting, I nearly fell for this.',
  'Received the same message today and blocked the sender.', 'Can confirm, this matches what a friend described.',
  'Please also report it on the cybercrime portal.', 'Sharing this with my family so they stay careful.',
];

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDataset({ userIds, moderatorId, adminId, now = new Date(), seed = 20261014 }) {
  const rand = mulberry32(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const shuffle = (list) => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const nowMs = now.getTime();

  const reports = [];
  const votes = [];
  const comments = [];
  const auditLogs = [];

  for (const [kind, values, types, count] of CAMPAIGNS) {
    const reporters = shuffle(userIds).slice(0, count);

    reporters.forEach((reporter, i) => {
      const scamType = types[i % types.length];
      const identifier = normalizeIdentifier(kind, pick(values));

      // The first report of every campaign is verified so each identifier has public evidence
      const roll = rand();
      const status = i === 0 || roll < 0.72 ? 'verified' : roll < 0.88 ? 'pending' : 'rejected';

      const ageMs = status === 'pending'
        ? between(1, 9 * 24) * HOUR
        : Math.max(DAY, Math.floor(150 * DAY * rand() ** 1.6));
      const createdAt = new Date(nowMs - ageMs);

      const [lo, hi] = LOSS_RANGE[scamType];
      const amountLost = rand() < 0.25 ? 0 : Math.round(between(lo, hi) / 100) * 100;

      const story = pick(STORIES[scamType].stories).replace('{id}', identifier.value);
      const ending = amountLost > 0
        ? `I lost INR ${amountLost.toLocaleString('en-IN')} before I realised it was a scam.`
        : pick(['I caught on in time and did not send any money.', 'I did not pay, but I am reporting it so others stay careful.']);

      const reportId = new Types.ObjectId();
      const report = {
        _id: reportId,
        reporter,
        isAnonymous: rand() < 0.2,
        scamType,
        title: pick(STORIES[scamType].titles),
        description: `${story} ${ending}`,
        identifier,
        amountLost,
        evidence: [],
        status,
        upvoteCount: 0,
        commentCount: 0,
        createdAt,
        updatedAt: createdAt,
        __v: 0,
      };
      if (rand() < 0.7) report.incidentDate = new Date(createdAt.getTime() - between(0, 3) * DAY - between(0, 12) * HOUR);

      if (status !== 'pending') {
        const reviewedAt = new Date(Math.min(nowMs, createdAt.getTime() + between(2, 48) * HOUR));
        const reviewedBy = rand() < 0.85 ? moderatorId : adminId;
        const note = pick(NOTES[status]);
        report.moderation = { reviewedBy, reviewedAt, note };
        report.updatedAt = reviewedAt;
        auditLogs.push({
          _id: new Types.ObjectId(), actor: reviewedBy, action: 'report.reviewed', entityType: 'Report',
          entityId: reportId, metadata: { decision: status, note }, ip: '127.0.0.1', createdAt: reviewedAt, __v: 0,
        });

        if (status === 'verified') {
          const voters = shuffle(userIds.filter((id) => String(id) !== String(reporter)));
          const upvotes = Math.min(voters.length, Math.floor(rand() ** 1.8 * 13));
          voters.slice(0, upvotes).forEach((user) => {
            votes.push({
              _id: new Types.ObjectId(), report: reportId, user,
              createdAt: new Date(reviewedAt.getTime() + rand() * (nowMs - reviewedAt.getTime())), __v: 0,
            });
          });
          report.upvoteCount = upvotes;

          if (rand() < 0.4) {
            const total = between(1, 3);
            for (let c = 0; c < total; c += 1) {
              const at = new Date(reviewedAt.getTime() + rand() * (nowMs - reviewedAt.getTime()));
              comments.push({
                _id: new Types.ObjectId(), report: reportId, user: pick(userIds), text: pick(COMMENTS),
                createdAt: at, updatedAt: at, __v: 0,
              });
            }
            report.commentCount = total;
          }
        }
      }
      reports.push(report);
    });
  }

  return { reports, votes, comments, auditLogs };
}

module.exports = { buildDataset, DEMO_USER_NAMES, CAMPAIGNS };
