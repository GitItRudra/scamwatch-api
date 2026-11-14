const ROLES = Object.freeze({ USER: 'user', MODERATOR: 'moderator', ADMIN: 'admin' });

const USER_STATUS = Object.freeze({ ACTIVE: 'active', SUSPENDED: 'suspended' });

const REPORT_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
});

const IDENTIFIER_KINDS = Object.freeze({
  PHONE: 'phone',
  UPI: 'upi',
  EMAIL: 'email',
  URL: 'url',
  BANK_ACCOUNT: 'bank_account',
});

const SCAM_TYPES = Object.freeze([
  'phishing',
  'upi_fraud',
  'kyc_fraud',
  'fake_job',
  'lottery',
  'investment',
  'loan_app',
  'romance',
  'tech_support',
  'impersonation',
  'online_shopping',
  'other',
]);

const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const AUDIT_ACTIONS = Object.freeze({
  REPORT_REVIEWED: 'report.reviewed',
  REPORT_DELETED: 'report.deleted',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_STATUS_CHANGED: 'user.status_changed',
});

const MAX_EVIDENCE_FILES = 5;

module.exports = {
  ROLES,
  USER_STATUS,
  REPORT_STATUS,
  IDENTIFIER_KINDS,
  SCAM_TYPES,
  RISK_LEVELS,
  AUDIT_ACTIONS,
  MAX_EVIDENCE_FILES,
  ROLE_VALUES: Object.values(ROLES),
  USER_STATUS_VALUES: Object.values(USER_STATUS),
  REPORT_STATUS_VALUES: Object.values(REPORT_STATUS),
  IDENTIFIER_KIND_VALUES: Object.values(IDENTIFIER_KINDS),
  AUDIT_ACTION_VALUES: Object.values(AUDIT_ACTIONS),
};
