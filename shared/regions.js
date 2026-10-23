// Region packs: everything that changes by country, held as data so adding a country is
// configuration, not code. A team picks its region (Team → Region & currency); the region sets the
// default currency, the tax name and rate the receipt reader and exports use, the business number
// label, heavy-vehicle licence classes, driver work-hour rules, vehicle inspections, the default
// units and which accounting connector is suggested first.
//
// These are starting points, not compliance advice: check each country's rules with a local adviser
// before relying on them.

export const REGIONS = {
  AU: {
    label: 'Australia', currency: 'AUD', units: 'metric', date: 'DD/MM/YYYY',
    tax: { name: 'GST', rate: 10, registration: 'BAS' },
    business_no: 'ABN',
    licence_classes: ['C (car)', 'LR (light rigid)', 'MR (medium rigid)', 'HR (heavy rigid)', 'HC (heavy combination)', 'MC (multi-combination)'],
    heavy_classes: ['HR (heavy rigid)', 'HC (heavy combination)', 'MC (multi-combination)'],
    hours: { name: 'NHVR fatigue rules', record: 'NHVR work diary', provider: 'an NHVR-approved electronic work diary', link: 'https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management' },
    inspections: ['Registration', 'CTP insurance', 'Safety / roadworthy inspection', 'Heavy vehicle inspection'],
    accounting: ['xero', 'myob', 'quickbooks', 'sage', 'csv'],
    privacy: 'Privacy Act 1988',
  },
  NZ: {
    label: 'New Zealand', currency: 'NZD', units: 'metric', date: 'DD/MM/YYYY',
    tax: { name: 'GST', rate: 15, registration: 'GST return' },
    business_no: 'GST number',
    licence_classes: ['Class 1 (car)', 'Class 2 (medium rigid)', 'Class 3 (medium combination)', 'Class 4 (heavy rigid)', 'Class 5 (heavy combination)'],
    heavy_classes: ['Class 2 (medium rigid)', 'Class 3 (medium combination)', 'Class 4 (heavy rigid)', 'Class 5 (heavy combination)'],
    hours: { name: 'NZTA work-time rules', record: 'logbook', provider: 'an NZTA-approved electronic logbook', link: 'https://www.nzta.govt.nz/commercial-driving/commercial-driver-rules-and-obligations/work-time-and-logbooks/' },
    inspections: ['Registration (licence)', 'Warrant of Fitness / Certificate of Fitness', 'Road user charges'],
    accounting: ['xero', 'myob', 'quickbooks', 'sage', 'csv'],
    privacy: 'Privacy Act 2020',
  },
  US: {
    label: 'United States', currency: 'USD', units: 'imperial', date: 'MM/DD/YYYY',
    tax: { name: 'Sales tax', rate: 0, registration: 'state sales tax return', varies: true },
    business_no: 'EIN',
    licence_classes: ['Class D (car)', 'CDL Class C', 'CDL Class B', 'CDL Class A'],
    heavy_classes: ['CDL Class B', 'CDL Class A'],
    hours: { name: 'FMCSA hours of service', record: 'ELD / logbook', provider: 'an FMCSA-registered ELD where the rules apply', link: 'https://www.fmcsa.dot.gov/regulations/hours-of-service' },
    inspections: ['Registration', 'DOT annual inspection', 'IFTA decals', 'Insurance'],
    accounting: ['quickbooks', 'xero', 'sage', 'myob', 'csv'],
    privacy: 'State privacy laws',
  },
  UK: {
    label: 'United Kingdom', currency: 'GBP', units: 'mixed', date: 'DD/MM/YYYY',
    tax: { name: 'VAT', rate: 20, registration: 'Making Tax Digital VAT return' },
    business_no: 'VAT number',
    licence_classes: ['B (car)', 'B+E', 'C1 (medium goods)', 'C1+E', 'C (large goods)', 'C+E'],
    heavy_classes: ['C1 (medium goods)', 'C1+E', 'C (large goods)', 'C+E'],
    hours: { name: 'GB drivers’ hours and tachograph rules', record: 'tachograph', provider: 'a tachograph and analysis service', link: 'https://www.gov.uk/drivers-hours' },
    inspections: ['Vehicle tax', 'MOT', 'Annual test (goods vehicle)', 'Operator licence'],
    accounting: ['xero', 'quickbooks', 'sage', 'myob', 'csv'],
    privacy: 'UK GDPR', gdpr: true,
  },
  EU: {
    label: 'Europe (EU)', currency: 'EUR', units: 'metric', date: 'DD/MM/YYYY',
    tax: { name: 'VAT', rate: 21, registration: 'VAT return', varies: true },
    business_no: 'VAT number',
    licence_classes: ['B (car)', 'BE', 'C1', 'C1E', 'C', 'CE'],
    heavy_classes: ['C1', 'C1E', 'C', 'CE'],
    hours: { name: 'EU driving-time and tachograph rules', record: 'tachograph', provider: 'a tachograph and analysis service', link: 'https://transport.ec.europa.eu/transport-modes/road/social-provisions/driving-time-and-rest-periods_en' },
    inspections: ['Registration', 'Periodic roadworthiness test', 'Insurance'],
    accounting: ['xero', 'quickbooks', 'sage', 'myob', 'csv'],
    privacy: 'GDPR', gdpr: true,
  },
};
export const DEFAULT_REGION = 'AU';
export const CURRENCIES = ['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD'];

/** The team's region pack, with its own currency and tax rate where the team set them. */
export function regionOf(settings) {
  const key = REGIONS[settings?.region] ? settings.region : DEFAULT_REGION;
  const r = REGIONS[key];
  const rate = settings?.tax_rate !== undefined && settings?.tax_rate !== '' && Number.isFinite(Number(settings?.tax_rate)) ? Number(settings.tax_rate) : r.tax.rate;
  return { key, ...r, currency: CURRENCIES.includes(settings?.currency) ? settings.currency : r.currency, tax: { ...r.tax, rate } };
}

/** Every licence class from every region (for forms that are shared by teams in different countries). */
export const ALL_LICENCE_CLASSES = [...new Set(Object.values(REGIONS).flatMap((r) => r.licence_classes))];

/** "A$1,234.50" style money in a currency. */
export function fmtMoney(n, currency = 'AUD') {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  try { return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(x); } catch { return `${currency} ${x.toFixed(2)}`; }
}
