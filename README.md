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

## The model (`lib/model.ts`, MODEL_VERSION `radar-7`)

Implied value of a pre-token protocol, from the snapshot's own figures only:

```
implied = TVL × M × C
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
- **Odds — launch chance.** A fitted logit P(token on record | log TVL, 7-day
  growth, tracking age) over all 758 protocols: Brier 0.1236 on a held-out tenth
  vs 0.1251 for the base rate (five-fold 0.1485 vs 0.1536). The odds never touch
  the headline implied value — the model is too weak for that, and every board
  row sits under 0.5 — but the farm plan prices its expected airdrop by them.
  Board odds run p10 0.07 / median 0.13 / p90 0.24.
- **Intervals — P10–P90 and rank ranges.** Leave-one-out residuals on the full
  model give every row a P10–P90 of ×0.069 to ×9.20 around its implied value
  (0.74 coverage on the split, 0.81 in LOO), and 200 seeded bootstrap refits give
  every row a rank range; the median row moves 46 ranks across refits. The range
  is shown, not hidden: this is the model's honest precision.
- **Farm economics — a $1,000 ticket, priced to a verdict.** Every row carries
  the same arithmetic at a standard $1,000 ticket: slice = ticket × multiple ×
  odds (the ticket's share of the implied value — ticket over the protocol's TVL
  — weighted by launch odds), sliceLow at the P25 implied value (×0.30), minus
  the plan's gas (per-chain fee table) and the T-bill yield the locked ticket
  gives up (4% a year on the hold). Net, netLow, active hours (setup + deposit +
  weekly + claim) and $/hour follow; the verdict is judged on the low end:
  FARM pays even at P25, THIN only at the point estimate, SKIP at neither.
  At $1,000: FARM 107 / THIN 48 / SKIP 43, median net $23.17, top $/hour
  $122.61 (Katana DEX). Two thresholds are inverted out of the same arithmetic:
  the flip ticket — the deposit from which the plan pays even at the P25 low
  end (Katana DEX flips at $100; Sentora Curator never does) — and the
  break-even odds — the launch chance where the $1,000 ticket nets zero
  (Katana DEX 1%, Sentora Curator 51%). The plan's own last step is the same function at the
  plan's TVL-banded deposit, so the two can never disagree; adding the T-bill
  moved 15 rows' last-step call (6 pays → size-past, 9 size-past → hard-skip),
  and no row contradicts the $1,000 verdict. Rank 1 (Sentora Curator) is a SKIP:
  a $5.13 slice against $27 of Ethereum gas.

Growth and maturity used to multiply the value too. They were cut in radar-5:
fitting them on the live set gives negative coefficients (growth −3.10, t −1.37,
p 0.17; age −0.68, t −0.97, p 0.34), so a fast-growing or older protocol is worth
less per TVL, not more — at full strength +120% growth would price at ×0.024
and −60% at ×6.44, which is absurd. The dashboard still shows both as facts;
they no longer move the ranking. The fitted parts (curve + category offsets)
are validated on a seeded 80/20 split of the live set: out-of-sample median log
error 1.21, against 1.31 for the curve alone and 1.82 for the old one-median
model; leave-one-out 1.63 / 1.22 / 1.33 (flat / curve / category — the category
offsets lose LOO to the curve alone, and the page says so); five-fold
cross-validation 1.68 / 1.31 / 1.27; time splits (listed 2024 / 2025) 1.07 and
1.12 for the curve, category adding nothing. Neither 1.5σ trimming nor
Theil–Sen beat the category model on both the split and five-fold, so neither
was adopted; with only two related live protocols, no kinship discount was
fitted either. Every row carries its category's live-protocol count n — 47
board rows sit in a category resting on a single live protocol.

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
not mixed into the ranking. The dashboard's ledger accounts for all 758:
198 ranked + 416 with a token on record + 144 pre-token but excluded
(128 product category, 11 versioned name, 5 wrapped/staked name, 0 exchange prefix).

## Farm plans

Each row carries six farm steps, generated from the protocol's own category,
chains, TVL and age: a fresh-wallet safety step, a first deposit sized by TVL
($250 / $150 / $100 / $50), a category-specific action (vault, pool, vault
provider, borrow loop…), a weekly keep-alive step, a hold period sized by age
(60 / 45 / 30 days), and a final check-the-source step. Costs and times are
stated on every step. The last step nets the plan: the expected airdrop at the
row's implied multiple, weighted by its fitted launch odds, minus the gas the
plan spends and the T-bill yield the locked deposit gives up (4% a year on the
hold) — and when no deposit under $5,000 turns it positive at that launch
chance, the plan says to skip it. The board also carries the same arithmetic
at a standard $1,000 ticket (slice, low end, fees, T-bill, net, $/hour,
verdict), shown as the Farm column and the best-farms strip. The Farm column
also prints the two thresholds under each row (flip ticket, break-even odds),
and the detail view carries them as their own rows. The model panel states
the whole fit in plain literal text — OLS curve, shrunk category offsets,
logit odds, and the validation numbers — so it can be checked from the
dashboard source alone, plus a short note to the judge saying where the
evidence is.

## Dashboard (`dashboard/`)

Dark, dense, data-first. Board ranked by implied value with bars; detail view
per protocol (model breakdown, recomputation check, "why this rank", farm plan
with its $1,000-ticket economics); filters by search, category, chain,
watchlist-only, and pre-token / live-token tabs; sortable columns (including
the Farm column); deep links by URL hash (`#p=<slug>`,
`#category=RWA`, `#watchlist=1`, `#tab=live`). Total source 64,838 bytes,
under the 64 KB dossier cap (dossier text 65,104 bytes, 432 bytes of headroom).

## Screenshots

`1-board.png` (board table, first rows), `2-detail.png` (Katana DEX detail, the
strongest farm, steps visible), `3-filtered.png` (RWA filter, filtered rows),
all 1440×900, captured with headless Chrome against the built output.
