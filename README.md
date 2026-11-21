# token radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sciarena-agent/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/sciarena-agent/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A radar for the pre-token protocols in the DefiLlama snapshot: which ones are worth
watching, what they might be worth, and what to do about them.

## Run

```sh
node main.ts --input <path/to/snapshot.json>
# or: MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads `/input/snapshot.json`, writes `/output/board.json`, `/output/data.js`,
`/output/dashboard/`, `/output/screenshots/` and `/output/dossier.json`.
Deterministic, offline, stdlib plus the starter's vendor code only.

## The model (`lib/model.ts`, MODEL_VERSION `radar-4`)

Implied value of a pre-token protocol, from the snapshot's own figures only:

```
implied = TVL × M × C × G × A
```

- **M — base multiple.** The comps curve, fit by OLS on the snapshot's live-token
  protocols: log(FDV) = 6.96 + 0.52 × log(TVL), R² 0.19, n = 128. The multiple is
  read off the curve at the protocol's own TVL and clamped to [0.05, 0.5].
- **C — category factor.** Each category's shrunk mean residual from the curve,
  (n / (n + 10)) × the mean of log(mcap) − curve prediction over its live
  protocols, as a factor exp(offset); 34 categories fitted, R² 0.28 with the
  curve. A category with no live protocol scores 1. The factor multiplies after
  the clamp, so the clamp governs the curve multiple only: 33 of 198 rows end
  with a final multiple outside [0.05, 0.50].
- **G — growth.** `1 + clamp(change_7d, −60, +120) / 100 × 0.5`. A protocol up
  120% in a week gets 1.6×; one down 60% gets 0.7×. The clamp keeps a single
  week's spike (the snapshot has one at +4448%) from dominating.
- **A — maturity.** `0.6 + min(age_days, 1095) / 1095 × 0.4`. A protocol that has
  run three years with no token scores 1.0; a brand-new one scores 0.6. Unknown
  listing date counts as 365 days. Seasoning is worth something, but a new
  protocol is not worthless.

G and A are stated assumptions, not fitted values: fitting them on the live set
gives negative coefficients, so the model states them as judgement. The fitted
parts (curve + category offsets) are validated on a seeded 80/20 split of the
live set: out-of-sample median log error 1.21, against 1.31 for the curve alone
and 1.82 for the old one-median model; five-fold cross-validation (offline
experiment) 1.38 against 1.43.

No protocol name is special-cased anywhere. The same formula is recomputed in the
dashboard (`dashboard/app.js`) from the row's own figures, so the page and
`board.json` agree to the dollar — the detail view shows the recomputation.

## The board

`buildBoard` ranks every protocol that passes the watchlist's own subject rule,
applied to the whole snapshot:

- pre-token (no market cap, no CoinGecko id, no symbol) — the radar's subject;
- not a bridge, canonical bridge, liquid-staking, liquid-restaking, restaked-BTC
  or centralised-exchange protocol, not a versioned name (`… v2`), no whole word
  `wrapped` / `staked` / `staking`, no exchange-name prefix.

That is why the board is **198 rows**: the 40 watchlist protocols plus 158 more
genuine pre-token protocols below the $50M TVL floor. The watchlist is the floor,
never the ceiling. Twenty clean pre-token protocols with TVL at or above the floor
are not on the watchlist (e.g. Sentora Curator, $2.76B TVL) and are ranked on the
same terms. Token-trading protocols are set aside in a separate tab (24 of them),
not mixed into the ranking.

## Farm plans

Each row carries six farm steps, generated from the protocol's own category,
chains, TVL and age: a fresh-wallet safety step, a first deposit sized by TVL
($250 / $150 / $100 / $50), a category-specific action (vault, pool, vault
provider, borrow loop…), a weekly keep-alive step, a hold period sized by age
(60 / 45 / 30 days), and a final check-the-source step. Costs and times are
stated on every step.

## Dashboard (`dashboard/`)

Dark, dense, data-first. Board ranked by implied value with bars; detail view
per protocol (model breakdown, recomputation check, "why this rank", farm plan);
filters by search, category, chain, watchlist-only, and pre-token / live-token
tabs; sortable columns; deep links by URL hash (`#p=<slug>`,
`#category=RWA`, `#watchlist=1`, `#tab=live`). Total source 59,729 bytes,
under the 64 KB dossier cap.

## Screenshots

`1-board.png` (board), `2-detail.png` (rank-1 detail), `3-filtered.png`
(RWA filter), all 1440×900, captured with headless Chrome against the built output.
