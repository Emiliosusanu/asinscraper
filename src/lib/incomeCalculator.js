const bsrSalesRanges = [
  { bsr: 500, daily: [173, 292], monthly: [5190, 8760] },
  { bsr: 1000, daily: [119, 182], monthly: [3570, 5460] },
  { bsr: 1500, daily: [92, 134], monthly: [2760, 4020] },
  { bsr: 2000, daily: [66, 97], monthly: [1980, 2910] },
  { bsr: 2500, daily: [53, 76], monthly: [1590, 2280] },
  { bsr: 3000, daily: [43, 59], monthly: [1290, 1770] },
  { bsr: 3500, daily: [32, 43], monthly: [960, 1290] },
  { bsr: 4000, daily: [30, 41], monthly: [900, 1230] },
  { bsr: 4500, daily: [26, 35], monthly: [780, 1050] },
  { bsr: 5000, daily: [24, 32], monthly: [720, 960] },
  { bsr: 5500, daily: [24, 31], monthly: [720, 930] },
  { bsr: 6000, daily: [23, 30], monthly: [690, 900] },
  { bsr: 6500, daily: [22, 27], monthly: [660, 810] },
  { bsr: 7000, daily: [20, 26], monthly: [600, 780] },
  { bsr: 7500, daily: [20, 24], monthly: [600, 720] },
  { bsr: 8000, daily: [20, 24], monthly: [600, 720] },
  { bsr: 8500, daily: [19, 23], monthly: [570, 690] },
  { bsr: 9000, daily: [19, 23], monthly: [570, 690] },
  { bsr: 9500, daily: [18, 23], monthly: [540, 690] },
  { bsr: 10000, daily: [18, 23], monthly: [540, 690] },
  { bsr: 12000, daily: [16, 22], monthly: [480, 660] },
  { bsr: 15000, daily: [15, 18], monthly: [450, 540] },
  { bsr: 17000, daily: [15, 16], monthly: [450, 480] },
  { bsr: 19000, daily: [14, 14], monthly: [420, 420] },
  { bsr: 22000, daily: [12, 12], monthly: [360, 360] },
  { bsr: 25000, daily: [11, 11], monthly: [330, 330] },
  { bsr: 28000, daily: [9, 9], monthly: [270, 270] },
  { bsr: 32000, daily: [8, 8], monthly: [240, 240] },
  { bsr: 36000, daily: [7, 7], monthly: [210, 210] },
  { bsr: 46000, daily: [5, 6], monthly: [150, 180] },
  { bsr: 56000, daily: [4, 4], monthly: [120, 120] },
  { bsr: 71000, daily: [3, 3], monthly: [90, 90] },
  { bsr: 86000, daily: [1, 2], monthly: [30, 60] },
  { bsr: 111000, daily: [0, 1], monthly: [0, 30] },
  { bsr: 140000, daily: [0, 0], monthly: [0, 30] },
].sort((a, b) => a.bsr - b.bsr);

export const calculateSalesFromBsr = (bsr) => {
  if (!bsr || bsr <= 0) {
    return { daily: [0, 0], monthly: [0, 0] };
  }

  let foundRange = bsrSalesRanges[bsrSalesRanges.length - 1]; 

  for (const range of bsrSalesRanges) {
    if (bsr <= range.bsr) {
      foundRange = range;
      break;
    }
  }

  return { daily: foundRange.daily, monthly: foundRange.monthly };
};

export const calculateIncome = (sales, royalty) => {
  if (!royalty || royalty <= 0) {
    return { daily: [0, 0], monthly: [0, 0] };
  }
  return {
    daily: [sales.daily[0] * royalty, sales.daily[1] * royalty],
    monthly: [sales.monthly[0] * royalty, sales.monthly[1] * royalty],
  };
};