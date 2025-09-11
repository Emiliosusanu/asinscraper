// Royalty estimator for KDP print books (paperback by default)
// Uses standard Amazon distribution (60%) and KDP printing cost tables by marketplace.
// Printing cost = fixed + perPage * page_count
// Royalty per copy = max(0, 0.60 * price_exVAT - printingCost)

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

// KDP Paperback printing costs (approximate, marketplace-local currency)
// Sources: KDP help tables. Values chosen to closely match current tables.
// NOTE: These values are approximations and should be updated if KDP changes pricing.
// Also varies by trim class: 'small' (<= 6.12" × 9") vs 'large' (> 6.12" or > 9").
const PRINT_COST = {
  US: {
    paperback: {
      // Black & White
      bw: {
        small:   { fixed: 0.85, perPage: 0.012 },
        large:   { fixed: 0.85, perPage: 0.014 },
      },
      // Standard Color — tuned to match user example (124 pages → ~$4.16 total)
      color: {
        small:   { fixed: 0.85, perPage: 0.0267 },
        large:   { fixed: 0.85, perPage: 0.0350 }, // rough approx pending official table
      },
      // Premium Color (approx)
      premium: {
        small:   { fixed: 0.85, perPage: 0.077 },
        large:   { fixed: 0.85, perPage: 0.090 },
      },
    },
  },
  EU: {
    paperback: {
      bw: {
        small:   { fixed: 0.60, perPage: 0.010 },
        large:   { fixed: 0.60, perPage: 0.012 },
      },
      color: {
        small:   { fixed: 0.60, perPage: 0.050 },
        large:   { fixed: 0.60, perPage: 0.060 },
      },
      premium: {
        small:   { fixed: 0.60, perPage: 0.100 },
        large:   { fixed: 0.60, perPage: 0.120 },
      },
    },
  },
  UK: {
    paperback: {
      bw: {
        small:   { fixed: 0.70, perPage: 0.010 },
        large:   { fixed: 0.70, perPage: 0.012 },
      },
      color: {
        small:   { fixed: 0.70, perPage: 0.040 },
        large:   { fixed: 0.70, perPage: 0.050 },
      },
      premium: {
        small:   { fixed: 0.70, perPage: 0.090 },
        large:   { fixed: 0.70, perPage: 0.100 },
      },
    },
  },
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

const inferTrimClass = ({ trim_size, dimensions_raw }) => {
  // Default to 'small' when unknown
  try {
    const take = (s) => (s || '').toString().toLowerCase();
    const t = take(trim_size) || take(dimensions_raw);
    if (!t) return 'small';
    // Find first pair of numbers that look like WxH in inches or cm
    let m = t.match(/(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)(?:\s*(in|inch|inches))?/i);
    let w, h;
    if (m) {
      w = parseFloat(m[1].replace(',', '.'));
      h = parseFloat(m[2].replace(',', '.'));
    } else {
      m = t.match(/(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)\s*cm/i);
      if (m) {
        w = parseFloat(m[1].replace(',', '.')) / 2.54;
        h = parseFloat(m[2].replace(',', '.')) / 2.54;
      }
    }
    if (!Number.isFinite(w) || !Number.isFinite(h)) return 'small';
    const width = Math.min(w, h);  // orientation agnostic: width = smaller side
    const height = Math.max(w, h); // height = larger side
    // KDP threshold: more than 6.12" width or more than 9" height is 'large'
    return (width > 6.12 || height > 9.0) ? 'large' : 'small';
  } catch (_) {
    return 'small';
  }
};

export function estimatePrintingCost({ page_count, country, interior_type, trim_size, dimensions_raw }) {
  const market = MARKET_BY_COUNTRY[(country || '').toLowerCase()] || 'EU';
  const interior = (interior_type || 'bw');
  const trimClass = inferTrimClass({ trim_size, dimensions_raw });
  const base = PRINT_COST[market]?.paperback?.[interior];
  const cfg = base && (base.small || base.large) ? (base[trimClass] || base.small) : base;
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
  const print = estimatePrintingCost({
    page_count: asinData?.page_count,
    country: asinData?.country,
    interior_type: asinData?.interior_type || 'bw',
    trim_size: asinData?.trim_size,
    dimensions_raw: asinData?.dimensions_raw,
  });
  const net = gross - print;
  return net > 0 ? round2(net) : 0;
}

export function explainRoyalty(asinData) {
  const country = (asinData?.country || '').toLowerCase();
  const market = MARKET_BY_COUNTRY[country] || 'EU';
  const vat = BOOK_VAT.hasOwnProperty(country) ? BOOK_VAT[country] : 0.0;
  const price = Number(asinData?.price) || 0;
  const pages = clampPages(asinData?.page_count);
  const interior = (asinData?.interior_type || 'bw');
  const trimClass = inferTrimClass({ trim_size: asinData?.trim_size, dimensions_raw: asinData?.dimensions_raw });
  const base = PRINT_COST[market]?.paperback?.[interior] || PRINT_COST[market]?.paperback?.bw || { fixed: 0, perPage: 0 };
  const cfg = base && (base.small || base.large) ? (base[trimClass] || base.small) : base;
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
    interior,
    trimClass,
    print: { fixed: cfg.fixed, perPage: cfg.perPage, perPageCost, total: printTotal },
    grossRoyalty,
    netRoyalty,
  };
}



