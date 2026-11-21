// Token Radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol the snapshot's own subject rule considers a genuine pre-token
// candidate: it records no token, and it is not a wrapped, staked or bridged product, a versioned
// pool, an exchange product or a CEX. That is the watchlist's rule, applied to the whole snapshot
// instead of only above the floor, so the board is the complete clean universe (198 rows here),
// not a capped sample. The watchlist's 40 are all in it; the other 158 are the early ones the
// radar exists to find.
//
// Implied value is one function of the snapshot's own figures, the same for every row:
//
//   implied = round( tvl_usd x M(tvl_usd) x C(category) x G x A )
//
//   M  fitted multiple = the comps curve, fit by ordinary least squares on the snapshot's
//      live-token protocols: log(FDV) = a + b x log(TVL). A large protocol trades at a lower
//      multiple than a small one (the fitted slope is below 1), so the multiple is read off
//      the curve at the protocol's own TVL instead of one median for every size. It is
//      clamped to [0.05, 0.50] so a skewed live set cannot drag it to an absurd value.
//   C  category factor = exp(offset), where offset is the category's shrunk mean residual
//      from the curve: (n / (n + 10)) x the mean of log(mcap) - curve prediction over the
//      live protocols of that category. A category whose live protocols trade above the
//      curve scores above 1, one below it scores below 1; a category with no live protocol
//      scores 1. The factor multiplies after the clamp, so the clamp governs the curve
//      multiple only: a row's final implied multiple can sit outside [0.05, 0.50].
//   G  growth = 1 + clamp(change_7d, -60, 120) / 100 x 0.5. A protocol gaining TVL is worth more
//      than one losing it; the clamp keeps one wild week (the snapshot holds a +4448% print) from
//      deciding the ranking.
//   A  maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4. Age is the days since DefiLlama began
//      tracking the protocol, the best record of how long it has run with no token; a protocol
//      with no listed date is scored at 365 days. Seasoning raises value, but it saturates: the
//      third year adds little over the second.
//
// G and A are stated assumptions, not fitted values: fitting them on the live set gives
// negative coefficients, so the model does not claim the market rewards growth or age — it
// states them as the radar's own judgement, and says so on the dashboard. The fitted parts
// are the curve and the category offsets; both are validated, not assumed: the live set is
// split 80/20 by a seeded hash of the slug, the curve and the offsets are fit on the 80%
// and scored on the 20% they never saw, and the same test is run for the old one-median
// model. The dashboard shows all three out-of-sample errors, so the reader can see the
// category model earns its place. No protocol name is ever special-cased: the same
// function scores every row, and the dashboard recomputes each row from the same figures so
// the page and board.json agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. The base multiple is derived, not set. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  /** The shrinkage strength of the category offsets: offset = (n / (n + k)) x mean residual. */
  category_shrink_k: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 0.5,
  category_shrink_k: 10,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** The protocol's risk signal: size, age, momentum and chain breadth, from its own record. */
  risk: RiskSignal;
  model: {
    base_multiple: number;
    /** The row's category factor: exp(offset) for its category, 1 when the category has no live protocol. Multiplies after the clamp. */
    category_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_multiple: number;
  /** The row's category factor, so the page recomputes the row with the same number board.json carries. */
  category_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  on_watchlist: boolean;
  /** The risk signal, flat so the page can read it without a nested lookup. */
  risk_score: number;
  risk_label: 'Low' | 'Moderate' | 'Elevated';
  risk_reasons: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** How the base multiple was derived from the snapshot's live set. */
export interface MultipleDerivation {
  live_count: number;
  median: number;
  p25: number;
  p75: number;
  clamped: boolean;
}

/** One category's fitted adjustment: how far its live protocols sit from the curve. */
export interface CategoryOffset {
  /** The category as the snapshot names it, or 'Unknown' when it names none. */
  category: string;
  /** Live protocols in this category the offset is fit on. */
  n: number;
  /** The shrunk mean residual, in log points: (n / (n + k)) x the category's mean residual. */
  offset_log: number;
  /** exp(offset_log): the factor the board multiplies the curve multiple by. */
  factor: number;
}

/** The fitted comps curve: log(FDV) = intercept + slope x log(TVL), fit by OLS on the live set. */
export interface CompsCurve {
  /** The OLS intercept, log(FDV) at log(TVL) = 0. */
  intercept: number;
  /** The OLS slope: below 1 means larger protocols trade at a lower multiple. */
  slope: number;
  /** R² of the log-log fit on the whole live set. */
  r2: number;
  /** R² of the curve plus the category offsets, on the whole live set. */
  category_r2: number;
  /** The residual standard deviation of the curve plus the category offsets, in log points. */
  category_residual_sd: number;
  /** The fitted category offsets, strongest first. */
  categories: CategoryOffset[];
  /** The live protocols the curve was fit on. */
  n: number;
  /** The residual standard deviation, in log points. */
  residual_sd: number;
  /** The clamp applied to the curve's multiple, from the model constants. */
  multiple_floor: number;
  multiple_cap: number;
  /** Board rows whose raw curve multiple hit each clamp bound. */
  at_floor: number;
  at_cap: number;
}

/** The model's out-of-sample validation: a seeded 80/20 split of the live set. */
export interface ModelValidation {
  /** Live protocols in the train and test halves. */
  train_n: number;
  test_n: number;
  /** The curve fit on the train half only, for the honest comparison. */
  train_intercept: number;
  train_slope: number;
  train_r2: number;
  /** Median absolute log error on the held-out test set: fitted curve vs one median multiple. */
  fitted_median_log_error: number;
  median_median_log_error: number;
  /** Median absolute log error of the curve plus the category offsets, on the held-out test set. */
  category_median_log_error: number;
  /** The median multiple the baseline used, fit on the train half only. */
  train_median_multiple: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  base_multiple: number;
  multiple: MultipleDerivation;
  /** The fitted comps curve the board's multiples are read from. */
  curve: CompsCurve;
  /** The out-of-sample test of the curve against the old one-median model. */
  validation: ModelValidation;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted array, or `fallback` when empty. */
function medianOf(sorted: number[], fallback: number): number {
  if (sorted.length === 0) return fallback;
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A quantile of a sorted array, or `fallback` when empty. */
function quantileOf(sorted: number[], q: number, fallback: number): number {
  if (sorted.length === 0) return fallback;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The base multiple, derived from the snapshot's own live set: the median market-cap-to-TVL
 * ratio of every protocol that records both a token market cap and a positive TVL. The median
 * is robust to the live set's long tail (a few protocols trade at 100x TVL or more); the clamp
 * keeps the multiple inside the range a token launch can plausibly sit in.
 */
export function deriveMultiple(snapshot: Snapshot, model: ModelConstants): { multiple: number; derivation: MultipleDerivation } {
  const ratios = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => (p.mcap_usd as number) / p.tvl_usd)
    .sort((a, b) => a - b);
  const raw = medianOf(ratios, 0.25);
  // The canonical multiple is rounded to 4 decimals here, once: the dashboard recomputes each
  // row from this same rounded value, so the page and board.json agree to the dollar.
  const multiple = Math.round(Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw)) * 1e4) / 1e4;
  return {
    multiple,
    derivation: {
      live_count: ratios.length,
      median: round4(raw),
      p25: round4(quantileOf(ratios, 0.25, raw)),
      p75: round4(quantileOf(ratios, 0.75, raw)),
      clamped: multiple !== raw,
    },
  };
}

/** The three multipliers and the implied value one protocol gets under `model`. The category
 * factor multiplies after the clamp: the clamp governs the curve multiple only. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  baseMultiple: number,
  categoryFactor = 1,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * baseMultiple * categoryFactor;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** A djb2 hash of a slug, for the deterministic train/test split: the same snapshot always splits the same way. */
function slugHash(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) h = ((h << 5) + h + slug.charCodeAt(i)) >>> 0;
  return h;
}

/** Ordinary least squares on log(TVL) -> log(market cap): intercept, slope, R² and residual spread. */
function olsLogLog(points: { tvl: number; mcap: number }[]): { intercept: number; slope: number; r2: number; residualSd: number } {
  const pts = points.map((p) => [Math.log(p.tvl), Math.log(p.mcap)] as const);
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  const slope = sxx === 0 ? 1 : sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  const residualSd = Math.sqrt(pts.reduce((a, [x, y]) => a + (y - (intercept + slope * x)) ** 2, 0) / Math.max(1, n));
  return { intercept, slope, r2, residualSd };
}

/** The live set: every protocol that records both a token market cap and a positive TVL. */
function liveSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * The category offsets, from the live set and one fitted curve: each category's mean
 * residual from the curve, shrunk toward zero by (n / (n + k)) so a category with one
 * live protocol cannot drag the board on a single print. A category with no live
 * protocol gets no offset, which is a factor of 1. The offsets are rounded to 4 log
 * points once, here: the board, the validation and the dashboard table all read the
 * same rounded numbers, so the page and board.json agree to the dollar.
 */
export function categoryOffsets(
  live: SnapshotProtocol[],
  intercept: number,
  slope: number,
  k: number,
): CategoryOffset[] {
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const residual = Math.log(p.mcap_usd as number) - (intercept + slope * Math.log(p.tvl_usd));
    const key = p.category ?? 'Unknown';
    const list = byCat.get(key);
    if (list === undefined) byCat.set(key, [residual]);
    else list.push(residual);
  }
  const offsets: CategoryOffset[] = [];
  for (const [category, residuals] of byCat) {
    const n = residuals.length;
    const mean = residuals.reduce((a, r) => a + r, 0) / n;
    const offsetLog = round4((n / (n + k)) * mean);
    offsets.push({ category, n, offset_log: offsetLog, factor: round4(Math.exp(offsetLog)) });
  }
  offsets.sort((a, b) => b.offset_log - a.offset_log || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return offsets;
}

/**
 * The fitted comps curve, from the snapshot's whole live set, plus its out-of-sample
 * validation. The validation splits the live set 80/20 by a seeded hash of the slug, fits the
 * curve on the 80% it is allowed to see, and scores it on the 20% it never saw — and does the
 * same for the old one-median model, so the dashboard can show whether the curve earns its
 * place. The board itself is scored with the curve fit on all live protocols: the split is
 * the test, not the model. The category model gets the same test: its offsets are fit on
 * the train half's residuals only, then applied to the held-out test rows.
 */
export function fitCompsCurve(
  snapshot: Snapshot,
  model: ModelConstants,
): { curve: CompsCurve; validation: ModelValidation; medianMultiple: number; median: MultipleDerivation } {
  const live = liveSet(snapshot);
  const full = olsLogLog(live.map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd as number })));
  const train = live.filter((p) => slugHash(p.slug) % 5 !== 0);
  const test = live.filter((p) => slugHash(p.slug) % 5 === 0);
  const trainFit = olsLogLog(train.map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd as number })));
  const trainRatios = train.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  const trainMedian = medianOf(trainRatios, 0.25);
  const absErr = (errors: number[]): number => medianOf([...errors].sort((a, b) => a - b), 0);
  const fittedErr = absErr(test.map((p) => Math.abs(Math.log(p.mcap_usd as number) - (trainFit.intercept + trainFit.slope * Math.log(p.tvl_usd)))));
  const medianErr = absErr(test.map((p) => Math.abs(Math.log(p.mcap_usd as number) - (Math.log(p.tvl_usd) + Math.log(trainMedian)))));
  // The category model, fit the same way: offsets from the full live set for the board,
  // offsets from the train half only for the honest out-of-sample test.
  const fullOffsets = categoryOffsets(live, full.intercept, full.slope, model.category_shrink_k);
  const fullOffsetByCat = new Map(fullOffsets.map((o) => [o.category, o.offset_log]));
  const meanLogMcap = live.reduce((a, p) => a + Math.log(p.mcap_usd as number), 0) / live.length;
  let ssResCat = 0;
  let ssTot = 0;
  for (const p of live) {
    const pred = full.intercept + full.slope * Math.log(p.tvl_usd) + (fullOffsetByCat.get(p.category ?? 'Unknown') ?? 0);
    ssResCat += (Math.log(p.mcap_usd as number) - pred) ** 2;
    ssTot += (Math.log(p.mcap_usd as number) - meanLogMcap) ** 2;
  }
  const categoryR2 = ssTot === 0 ? 0 : 1 - ssResCat / ssTot;
  const categoryResidualSd = Math.sqrt(ssResCat / live.length);
  const trainOffsets = categoryOffsets(train, trainFit.intercept, trainFit.slope, model.category_shrink_k);
  const trainOffsetByCat = new Map(trainOffsets.map((o) => [o.category, o.offset_log]));
  const categoryErr = absErr(
    test.map((p) => Math.abs(Math.log(p.mcap_usd as number) - (trainFit.intercept + trainFit.slope * Math.log(p.tvl_usd) + (trainOffsetByCat.get(p.category ?? 'Unknown') ?? 0)))),
  );
  const { multiple: medianMultiple, derivation: median } = deriveMultiple(snapshot, model);
  return {
    curve: {
      intercept: round2(full.intercept),
      slope: round2(full.slope),
      r2: round2(full.r2),
      category_r2: round2(categoryR2),
      category_residual_sd: round2(categoryResidualSd),
      categories: fullOffsets,
      n: live.length,
      residual_sd: round2(full.residualSd),
      multiple_floor: model.multiple_floor,
      multiple_cap: model.multiple_cap,
      at_floor: 0,
      at_cap: 0,
    },
    validation: {
      train_n: train.length,
      test_n: test.length,
      train_intercept: round2(trainFit.intercept),
      train_slope: round2(trainFit.slope),
      train_r2: round2(trainFit.r2),
      fitted_median_log_error: round2(fittedErr),
      median_median_log_error: round2(medianErr),
      category_median_log_error: round2(categoryErr),
      train_median_multiple: round4(trainMedian),
    },
    medianMultiple,
    median,
  };
}

/** The curve's raw multiple at one TVL, before the clamp: exp(a) x TVL^(b - 1). */
function rawMultiple(tvl: number, curve: CompsCurve): number {
  return Math.exp(curve.intercept) * Math.pow(tvl, curve.slope - 1);
}

/**
 * The fitted multiple for one TVL: the curve's implied FDV/TVL, clamped to the sane range.
 * The clamp is the same [0.05, 0.50] the median model used, so the curve can bend the
 * multiple with size but cannot push it to an absurd value at either end.
 */
export function fittedMultiple(tvl: number, curve: CompsCurve): number {
  return round4(Math.min(curve.multiple_cap, Math.max(curve.multiple_floor, rawMultiple(tvl, curve))));
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A protocol's risk signal: a score and a label, derived from the snapshot's own figures. */
export interface RiskSignal {
  /** 0..100: higher means riskier. Built from size, age, momentum and chain breadth. */
  score: number;
  /** Low below 40, Moderate 40..60, Elevated above 60. */
  label: 'Low' | 'Moderate' | 'Elevated';
  /** The short reasons the score moved, in the order they were applied. */
  reasons: string[];
}

/** The TVL band a protocol sits in, from its own TVL. */
function tvlBand(tvl: number): 'mega' | 'large' | 'mid' | 'small' {
  if (tvl >= 1_000_000_000) return 'mega';
  if (tvl >= 100_000_000) return 'large';
  if (tvl >= 10_000_000) return 'mid';
  return 'small';
}

/**
 * A protocol's risk signal, from its own record only: size, age, momentum and chain breadth.
 * A large, seasoned, steady protocol scores low; a small, young, violently moving one scores
 * high. The score is a warning, not a verdict: a high-risk protocol can still be worth farming,
 * it just needs a smaller position and a shorter hold. No name is special-cased.
 */
export function riskSignal(p: SnapshotProtocol, age: number | null): RiskSignal {
  let score = 50;
  const reasons: string[] = [];
  // Size: a large TVL is a deeper, more established pool; a small one is easier to move.
  const band = tvlBand(p.tvl_usd);
  if (band === 'mega') { score -= 20; reasons.push('TVL above $1B'); }
  else if (band === 'large') { score -= 10; reasons.push('TVL above $100M'); }
  else if (band === 'small') { score += 10; reasons.push('TVL below $10M'); }
  // Age: a protocol that has run for years with no token has survived; a young one has not.
  if (age !== null && age >= 730) { score -= 15; reasons.push('listed over 2 years ago'); }
  else if (age !== null && age >= 365) { score -= 5; reasons.push('listed over 1 year ago'); }
  else if (age !== null && age < 180) { score += 10; reasons.push('listed under 180 days ago'); }
  else if (age === null) { score += 5; reasons.push('listing date unknown'); }
  // Momentum: a violent week, up or down, is volatility; a steady week is not.
  const g = p.change_7d;
  if (g !== null && Math.abs(g) > 50) { score += 15; reasons.push('7-day move over 50%'); }
  else if (g !== null && g < -30) { score += 15; reasons.push('TVL down over 30% in 7 days'); }
  else if (g !== null && g > 30) { score += 5; reasons.push('TVL up over 30% in 7 days'); }
  // Breadth: one chain is a single point of failure; several chains spread it.
  const chains = p.chains.length;
  if (chains <= 1) { score += 5; reasons.push('single chain'); }
  else if (chains >= 3) { score -= 5; reasons.push(`${chains} chains`); }
  score = Math.max(0, Math.min(100, score));
  const label = score < 40 ? 'Low' : score <= 60 ? 'Moderate' : 'Elevated';
  return { score, label, reasons };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist's own rule treats as a wrapped, staked or bridged product. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a genuine pre-token subject: it records no token, and it is not a
 * wrapped, staked or bridged product of a protocol whose token already trades, a versioned pool,
 * or an exchange product. This is the watchlist's own subject rule, applied to the whole
 * snapshot rather than only above the floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !PRODUCT_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; baseMultiple: number; derivation: MultipleDerivation; curve: CompsCurve; validation: ModelValidation } {
  const { curve, validation, medianMultiple, median: derivation } = fitCompsCurve(snapshot, model);
  const index = bySlug(snapshot.protocols);
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar is every other genuine pre-token subject in the snapshot: the complete clean
  // universe, not a capped sample. A chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  let atFloor = 0;
  let atCap = 0;
  const offsetByCat = new Map(curve.categories.map((c) => [c.category, c.factor]));
  const scored = [...chosen.values()].map((p) => {
    // The multiple is read off the fitted curve at this protocol's own TVL: a large protocol
    // trades at a lower multiple than a small one, and the clamp keeps either end sane.
    // The category factor multiplies after the clamp, so the clamp governs the curve
    // multiple only; a category with no live protocol scores a factor of 1.
    const raw = rawMultiple(p.tvl_usd, curve);
    if (raw <= model.multiple_floor) atFloor++;
    else if (raw >= model.multiple_cap) atCap++;
    const baseMultiple = fittedMultiple(p.tvl_usd, curve);
    const categoryFactor = offsetByCat.get(p.category ?? 'Unknown') ?? 1;
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model, baseMultiple, categoryFactor);
    // The risk signal is scored from the same record, beside the implied value: it never
    // changes the ranking, it only warns the reader how steady the protocol behind it is.
    const risk = riskSignal(p, age);
    return { p, implied, growthPct, growthMult, maturityMult, age, risk, baseMultiple, categoryFactor };
  });
  curve.at_floor = atFloor;
  curve.at_cap = atCap;
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    risk: s.risk,
    model: {
      base_multiple: round4(s.baseMultiple),
      category_factor: round4(s.categoryFactor),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    // The farm plan's expected airdrop is priced at this row's implied multiple: the curve
    // multiple times the category factor, the same multiple the implied value is built on.
    farm_steps: farmSteps(s.p, s.age, s.risk.label, s.baseMultiple * s.categoryFactor, s.growthMult, s.maturityMult).map(stepText),
  }));
  return { board, baseMultiple: medianMultiple, derivation, curve, validation };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  // Specific sub-categories first: each of these contains a generic word (yield, lending, stable,
  // staking, chain, governance, card, index, derivative) that a later branch would catch with a
  // blunter action, so the narrow match has to win.
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s auto-compounding vault on ${chain} and let the yield stack.`;
  if (c.includes('leveraged farming')) return `Deposit $${capital} of USDC into ${name}'s leveraged farm on ${chain} and keep the leverage low.`;
  if (c.includes('uncollateralized lending')) return `Lend $${capital} of USDC through ${name} on ${chain} and check the borrower's repayment weekly.`;
  if (c.includes('cdp manager')) return `Open a $${capital} collateralised position with ${name} on ${chain} and watch the collateral ratio.`;
  if (c.includes('collateral markets')) return `Supply $${capital} of collateral to ${name}'s market on ${chain} and keep the position open.`;
  if (c.includes('cross chain')) return `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds in its app.`;
  if (c.includes('dual-token stablecoin')) return `Mint $${capital} of the dual-token stable asset through ${name} on ${chain} and hold both tokens.`;
  if (c.includes('stablecoin wrapper')) return `Wrap $${capital} of the stable asset through ${name} on ${chain} and hold the wrapped token.`;
  if (c.includes('staking pool')) return `Stake $${capital} in ${name}'s pool on ${chain} and keep the staking receipt.`;
  if (c.includes('prediction market')) return `Fund $${capital} and place one prediction-market position on ${name}.`;
  if (c.includes('governance incentives')) return `Lock $${capital} of the governance asset in ${name} on ${chain}, vote once and claim the incentive.`;
  if (c.includes('crypto card issuer')) return `Load $${capital} onto the ${name} card and make one payment through it on ${chain}.`;
  if (c.includes('indexes')) return `Buy $${capital} of the ${name} index on ${chain} and hold it through one rebalance.`;
  if (c.includes('interest rate derivatives')) return `Deposit $${capital} of USDC into ${name}'s rate market on ${chain} and hold the rate position.`;
  if (c.includes('risk curator') || c.includes('curator')) return `Deposit $${capital} into a ${name} curated vault on ${chain} and keep the vault shares.`;
  if (c.includes('allocator') || c.includes('capital allocator')) return `Deposit $${capital} into a ${name} allocation vault on ${chain} and keep the shares.`;
  if (c.includes('basis trading')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset through ${name} on ${chain} and hold it.`;
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager') || c === 'farm') return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('interest rate')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('staking') || c.includes('restak') || c.includes('anchor btc') || c.includes('decentralized btc')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name}'s custodial yield product on ${chain} and keep the position open.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} and use it in ${name}'s app.`;
  if (c.includes('payment') || c.includes('card')) return `Load $${capital} onto ${name} and make one payment through it on ${chain}.`;
  if (c.includes('governance')) return `Lock $${capital} of the governance asset in ${name} on ${chain} and vote once.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  if (c.includes('bridge') || c.includes('otc')) return `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds in its app.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the plan is not one deposit and silence. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  // Specific sub-categories first, for the same reason as in actionFor: the narrow match wins.
  if (c.includes('yield aggregator')) return 'Check the compounding weekly and top up a little once a month so the vault keeps growing.';
  if (c.includes('leveraged farming')) return 'Check the leverage ratio each week and unwind a little if the market turns against the position.';
  if (c.includes('uncollateralized lending')) return 'Check the borrower repayment schedule weekly so a missed payment is caught early.';
  if (c.includes('cdp manager')) return 'Check the collateral ratio weekly and top up collateral before it nears liquidation.';
  if (c.includes('collateral markets')) return 'Check the collateral market weekly and add a small amount when the rates are favourable.';
  if (c.includes('cross chain')) return 'Bridge a small amount each week so the route stays active.';
  if (c.includes('dual-token stablecoin') || c.includes('stablecoin wrapper')) return 'Check the peg weekly and add a small amount when it holds within its band.';
  if (c.includes('staking pool')) return 'Claim or restake the pool rewards once a week so the position compounds.';
  if (c.includes('prediction market')) return 'Settle one market position each week so the account shows steady use.';
  if (c.includes('governance incentives')) return 'Vote on one proposal each week and claim the incentive so the wallet counts as an active governor.';
  if (c.includes('crypto card issuer')) return 'Make one card payment a week so the card stays active.';
  if (c.includes('indexes')) return 'Check the index rebalance weekly and hold through it.';
  if (c.includes('interest rate derivatives')) return 'Check the rate position weekly and close or roll it before expiry.';
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return 'Make one qualifying action each week, such as a supply, a borrow or a repayment.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager') || c === 'farm') return 'Swap or add liquidity once a week, even a small amount, so the wallet stays active.';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('interest rate')) return 'Open or close one small hedge each week so the account shows steady use.';
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return 'Rebalance or top up the vault once a week, even by a small amount, so the position stays active.';
  if (c.includes('rwa')) return 'Check the yield accrual weekly and add a small amount once a month so the holding grows.';
  if (c.includes('staking') || c.includes('restak') || c.includes('anchor btc') || c.includes('decentralized btc')) return 'Claim or restake the staking rewards once a week so the position compounds.';
  if (c.includes('prediction')) return 'Place one small market position each week so the account shows steady use.';
  if (c.includes('basis trading')) return 'Check the funding rate weekly and add a small amount when it turns positive.';
  if (c.includes('governance')) return 'Vote on one proposal each week so the wallet counts as an active governor.';
  return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/** A chain-specific note for the setup step: gas, custody and verification differ by chain. */
function chainNote(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'On Ethereum mainnet, batch your actions and watch gas: do the deposit once, not in pieces.';
  if (c === 'solana') return 'On Solana, keep a little SOL in the wallet for rent and fees so the position never stalls.';
  if (c === 'base') return 'On Base, fees are small: one transaction a week is enough to keep the wallet active.';
  if (c === 'binance') return 'On BNB Chain, keep a little BNB for gas and verify the contract address on the chain explorer.';
  if (c === 'arbitrum') return 'On Arbitrum, batch the deposit and the weekly action into one visit to save a round trip.';
  if (c === 'optimism') return 'On Optimism, fees are small: one transaction a week is enough to keep the wallet active.';
  if (c === 'avalanche') return 'On Avalanche, keep a little AVAX for gas and verify the contract on the chain explorer.';
  if (c === 'polygon') return 'On Polygon, keep a little POL for gas; fees are small, so a weekly action costs almost nothing.';
  if (c === 'sui') return 'On Sui, keep a little SUI for gas and store the position object IDs in the farm log.';
  if (c === 'aptos') return 'On Aptos, keep a little APT for gas and store the position object IDs in the farm log.';
  if (c === 'monad') return 'On Monad, keep a little MON for gas and verify the contract on the chain explorer.';
  if (c === 'hyperliquid l1') return 'On Hyperliquid, do the position in the chain\u2019s own app and check its points page there.';
  if (c === 'berachain') return 'On Berachain, keep a little BERA for gas and verify the contract on the chain explorer.';
  if (c === 'bitcoin') return 'On Bitcoin, use the protocol\u2019s own app and keep the wallet recovery phrase offline.';
  return `On ${chain}, keep a little of the chain\u2019s gas token in the wallet so the position never stalls.`;
}

/** A dollar figure with no more precision than it earns: whole dollars stay whole, cents stay cents. */
function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/**
 * A typical fee for one transaction on a chain, in USD. These are estimates from the usual
 * cost of a simple transaction, not quotes: Ethereum mainnet is dollars, Solana and the cheap
 * L2s are cents. Chains the table does not name use the default, so a chain the snapshot
 * adds later never breaks the plan. The table names the chains the board's first-chain column
 * actually uses, plus the big ones.
 */
const CHAIN_FEE_USD: Record<string, number> = {
  ethereum: 3.0,
  bitcoin: 2.0,
  tron: 0.25,
  arbitrum: 0.1,
  avalanche: 0.1,
  binance: 0.1,
  base: 0.05,
  optimism: 0.05,
  monad: 0.05,
  berachain: 0.05,
  mantle: 0.05,
  'zksync era': 0.05,
  polygon: 0.02,
  flare: 0.02,
  solana: 0.01,
  sui: 0.01,
  aptos: 0.01,
  stellar: 0.01,
  ripple: 0.01,
  provenance: 0.01,
  'hyperliquid l1': 0.01,
};
const DEFAULT_CHAIN_FEE_USD = 0.5;

/** The typical fee for one transaction on `chain`, in USD. */
export function chainFee(chain: string): number {
  return CHAIN_FEE_USD[chain.toLowerCase()] ?? DEFAULT_CHAIN_FEE_USD;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. It is deposit-sized and costed: the deposit follows the TVL band, every fee is the
 * chain's typical per-transaction cost, and the last step nets the plan — the expected airdrop
 * at this protocol's implied multiple, minus the gas the plan spends. A negative net is not
 * hidden: the plan says so and names the deposit that would turn it positive, or tells the
 * reader to skip.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  riskLabel: RiskSignal['label'] = 'Moderate',
  multiple = 0.2227,
  growthMult = 1,
  maturityMult = 1,
): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const fee = chainFee(chain);
  // The plan's transactions: 1 to set up, 2 to approve and deposit, 1 a week, 1 to claim.
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const totalGas = (4 + weeks) * fee;
  // The model's expected airdrop for this deposit: the deposit's share of the implied value.
  const expected = capital * multiple * growthMult * maturityMult;
  const net = expected - totalGas;
  const breakeven = Math.ceil(totalGas / Math.max(1e-9, multiple * growthMult * maturityMult) / 50) * 50;
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. ${chainNote(chain)}`,
      cost: `about $${money(fee)} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${money(2 * fee)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: `about $${money(fee)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.${riskLabel === 'Elevated' ? ' This protocol is flagged Elevated risk, so keep the position small and unwind if its TVL falls by a third.' : ''}`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'one transaction of gas to claim, and never pay a site to claim',
      time: '10 minutes',
    },
    {
      text:
        `Add it up: a $${capital} deposit, about $${money(totalGas)} of gas over ${hold} days, and an expected airdrop of about $${money(expected)} at this protocol's implied multiple — a net of about ${net < 0 ? '-' : ''}$${money(Math.abs(net))}.` +
        (net < 0
          ? ` The gas outweighs the expected airdrop at this size: size the deposit past $${breakeven} so the fees are a smaller share, or skip this one.`
          : ` The plan pays for itself at this size.`),
      cost: `about $${money(totalGas)} of gas in total`,
      time: `${hold} days`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_multiple: row.model.base_multiple,
    category_factor: row.model.category_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    on_watchlist: onWatchlist,
    risk_score: row.risk.score,
    risk_label: row.risk.label,
    risk_reasons: row.risk.reasons,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, baseMultiple, derivation, curve, validation } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    base_multiple: round4(baseMultiple),
    multiple: derivation,
    curve,
    validation,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
