// Royalty estimator for KDP print books (paperback by default)
// Uses standard Amazon distribution (60%) and KDP printing cost tables by marketplace.
// Printing cost = fixed + perPage * page_count
// Royalty per copy = max(0, 0.60 * price - printingCost)

const MARKET_BY_COUNTRY = {
  'com': 'US',
  'us': 'US',
  'it': 'EU',
  'de': 'EU',
  'fr': 'EU',
  'es': 'EU',
  'co.uk': 'UK',
  'uk': 'UK',
};

// KDP Paperback Black & White printing costs (approximate, marketplace-local currency)
// Sources: KDP help tables. Values chosen to closely match current tables.
const PRINT_COST = {
  US: { paperback: { bw: { fixed: 0.85, perPage: 0.012 } } },
  EU: { paperback: { bw: { fixed: 0.60, perPage: 0.01 } } },
  UK: { paperback: { bw: { fixed: 0.70, perPage: 0.01 } } },
};

// Reduced VAT rates on printed books by marketplace domain
// Applied to remove VAT from list price for royalty base in EU/UK
const BOOK_VAT = {
  it: 0.04,
  de: 0.07,
  fr: 0.055,
  es: 0.04,
  'co.uk': 0.0,
  uk: 0.0,
  com: 0.0,
};

const clampPages = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 120; // conservative default if unknown
  return Math.max(24, Math.min(828, Math.round(x))); // KDP paperback bounds
};

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

export function estimatePrintingCost({ page_count, country }) {
  const market = MARKET_BY_COUNTRY[(country || '').toLowerCase()] || 'EU';
  const cfg = PRINT_COST[market]?.paperback?.bw;
  const pages = clampPages(page_count);
  if (!cfg) return 0;
  return round2(cfg.fixed + cfg.perPage * pages);
}

export function estimateRoyalty(asinData) {
  const price = Number(asinData?.price) || 0;
  if (price <= 0) return 0;
  // distribution: standard 60% on list price EX VAT (EU/UK)
  const country = (asinData?.country || '').toLowerCase();
  const vat = BOOK_VAT.hasOwnProperty(country) ? BOOK_VAT[country] : 0.0;
  const basePrice = price > 0 ? (vat > 0 ? price / (1 + vat) : price) : 0;
  const gross = 0.60 * basePrice;
  const print = estimatePrintingCost(asinData);
  const net = gross - print;
  return net > 0 ? round2(net) : 0;
}

export function explainRoyalty(asinData) {
  const country = (asinData?.country || '').toLowerCase();
  const market = MARKET_BY_COUNTRY[country] || 'EU';
  const vat = BOOK_VAT.hasOwnProperty(country) ? BOOK_VAT[country] : 0.0;
  const price = Number(asinData?.price) || 0;
  const pages = clampPages(asinData?.page_count);
  const cfg = PRINT_COST[market]?.paperback?.bw || { fixed: 0, perPage: 0 };
  const basePrice = price > 0 ? (vat > 0 ? price / (1 + vat) : price) : 0;
  const distRate = 0.60;
  const grossRoyalty = round2(distRate * basePrice);
  const perPageCost = round2(cfg.perPage * pages);
  const printTotal = round2(cfg.fixed + perPageCost);
  const netRoyalty = Math.max(0, round2(grossRoyalty - printTotal));
  return {
    country,
    market,
    vatRate: vat,
    price,
    basePrice: round2(basePrice),
    distRate,
    pages,
    print: { fixed: cfg.fixed, perPage: cfg.perPage, perPageCost, total: printTotal },
    grossRoyalty,
    netRoyalty,
  };
}
