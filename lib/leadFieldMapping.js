const LEAD_FIELDS = [
  { id: 'email', label: 'Email', required: true },
  { id: 'firstName', label: 'First name' },
  { id: 'lastName', label: 'Last name' },
  { id: 'fullName', label: 'Full name' },
  { id: 'country', label: 'Country' },
  { id: 'language', label: 'Language' },
  { id: 'phone', label: 'Phone' },
  { id: 'company', label: 'Company' },
  { id: 'city', label: 'City' },
  { id: 'region', label: 'Region' },
  { id: 'consentStatus', label: 'Consent status' },
  { id: 'conversionStage', label: 'Conversion stage' },
  { id: 'tags', label: 'Tags (comma-separated)' },
  { id: 'sourceLabel', label: 'Source label' },
];

const HEADER_ALIASES = {
  email: ['email', 'e-mail', 'email address', 'email_address', 'mail'],
  firstName: ['first_name', 'firstname', 'first name', 'given name', 'prenom', 'prénom'],
  lastName: ['last_name', 'lastname', 'last name', 'surname', 'nom'],
  fullName: ['full_name', 'fullname', 'full name', 'name'],
  country: ['country', 'country code', 'country_code', 'pays', 'nation'],
  language: ['language', 'lang', 'locale', 'language code'],
  phone: ['phone', 'telephone', 'mobile', 'tel'],
  company: ['company', 'organization', 'organisation', 'org'],
  city: ['city', 'ville'],
  region: ['region', 'state', 'province'],
  consentStatus: ['consent', 'consent_status', 'opt_in', 'optin', 'subscription status', 'status consent'],
  conversionStage: ['stage', 'conversion_stage', 'status', 'lead_status', 'funnel_stage'],
  tags: ['tags', 'labels'],
  sourceLabel: ['source', 'utm_source', 'lead_source'],
};

function suggestMapping(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map((h) => String(h || '').trim());
  for (const field of LEAD_FIELDS) {
    const aliases = HEADER_ALIASES[field.id] || [field.id];
    const match = normalizedHeaders.find((h) =>
      aliases.some((a) => h.toLowerCase() === a.toLowerCase()),
    );
    if (match) mapping[match] = field.id;
  }
  return mapping;
}

const DEFAULT_CONVERSION_STAGES = ['lead', 'contacted', 'qualified', 'trial', 'paid', 'churned'];

const CONSENT_VALUES = {
  opted_in: ['yes', 'y', 'true', '1', 'subscribed', 'opted_in', 'opt-in', 'optin'],
  opted_out: ['no', 'n', 'false', '0', 'unsubscribed', 'opted_out', 'opt-out', 'optout'],
  pending: ['pending', 'waiting'],
};

function normalizeConsentStatus(raw, fallback = 'opted_in') {
  if (raw == null || raw === '') return fallback;
  const s = String(raw).trim().toLowerCase();
  for (const [status, aliases] of Object.entries(CONSENT_VALUES)) {
    if (aliases.includes(s) || s === status) return status;
  }
  return fallback;
}

module.exports = {
  LEAD_FIELDS,
  HEADER_ALIASES,
  suggestMapping,
  DEFAULT_CONVERSION_STAGES,
  normalizeConsentStatus,
};
