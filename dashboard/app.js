// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The model, in one function, so the page and board.json are visibly the same arithmetic:
//   implied = round( tvl_usd x M(tvl_usd) x C(category) x G x A )
//   M = the fitted multiple, read off the comps curve at the protocol's own TVL: the curve is
//       log(FDV) = intercept + slope x log(TVL), fit by OLS on the snapshot's live-token
//       protocols and carried in DATA.curve; the multiple is exp(intercept) x TVL^(slope - 1),
//       clamped to [0.05, 0.50]. Each row carries its own fitted multiple in base_multiple,
//       so the page recomputes the row from the same rounded number board.json carries.
//   C = the category factor, exp(offset): the category's shrunk mean residual from the curve,
//       carried per row in category_factor; it multiplies after the clamp, so the clamp
//       governs the curve multiple only.
//   G = 1 + clamp(change_7d, -60, 120) / 100 x 0.5   (momentum, clamped so one wild week cannot
//       decide a ranking; the snapshot holds a +4448% print)
//   A = 0.6 + min(age_days, 1095) / 1095 x 0.4       (seasoning: how long it has run with no token;
//       an unknown age scores 365 days)
// G and A are stated assumptions, not fitted values: fitting them on the live set gives
// negative coefficients, so the model states them as judgement. The fitted parts are the
// curve and the category offsets, and the model panel shows their out-of-sample test.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The row's own fitted multiple, read off the comps curve at its TVL by main.ts and carried
  // in base_multiple, and its category factor in category_factor: the page recomputes the row
  // from the same rounded numbers board.json carries, so the two agree to the dollar.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var catFactor = row.category_factor === null || row.category_factor === undefined ? 1 : row.category_factor;
    return Math.max(1, Math.round(row.tvl_usd * row.base_multiple * catFactor * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    // Specific sub-categories first: each of these contains a generic word (yield, lending, stable,
    // staking, chain, governance, card, index, derivative) that a later branch would catch with a
    // blunter action, so the narrow match has to win.
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s auto-compounding vault on " + chain + ' and let the yield stack.';
    if (c.indexOf('leveraged farming') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s leveraged farm on " + chain + ' and keep the leverage low.';
    if (c.indexOf('uncollateralized lending') >= 0) return 'Lend $' + capital + ' of USDC through ' + name + ' on ' + chain + " and check the borrower's repayment weekly.";
    if (c.indexOf('cdp manager') >= 0) return 'Open a $' + capital + ' collateralised position with ' + name + ' on ' + chain + ' and watch the collateral ratio.';
    if (c.indexOf('collateral markets') >= 0) return 'Supply $' + capital + ' of collateral to ' + name + "'s market on " + chain + ' and keep the position open.';
    if (c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC through ' + name + ' to ' + chain + ' and use the bridged funds in its app.';
    if (c.indexOf('dual-token stablecoin') >= 0) return 'Mint $' + capital + ' of the dual-token stable asset through ' + name + ' on ' + chain + ' and hold both tokens.';
    if (c.indexOf('stablecoin wrapper') >= 0) return 'Wrap $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold the wrapped token.';
    if (c.indexOf('staking pool') >= 0) return 'Stake $' + capital + ' in ' + name + "'s pool on " + chain + ' and keep the staking receipt.';
    if (c.indexOf('prediction market') >= 0) return 'Fund $' + capital + ' and place one prediction-market position on ' + name + '.';
    if (c.indexOf('governance incentives') >= 0) return 'Lock $' + capital + ' of the governance asset in ' + name + ' on ' + chain + ', vote once and claim the incentive.';
    if (c.indexOf('crypto card issuer') >= 0) return 'Load $' + capital + ' onto the ' + name + ' card and make one payment through it on ' + chain + '.';
    if (c.indexOf('indexes') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it through one rebalance.';
    if (c.indexOf('interest rate derivatives') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s rate market on " + chain + ' and hold the rate position.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' allocation vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the yield-bearing asset through " + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('lending') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0 || c === 'farm') return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('interest rate') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('anchor btc') >= 0 || c.indexOf('decentralized btc') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s custodial yield product on " + chain + ' and keep the position open.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' and use it in ' + name + "'s app.";
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Load $' + capital + ' onto ' + name + ' and make one payment through it on ' + chain + '.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' of the governance asset in ' + name + ' on ' + chain + ' and vote once.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('otc') >= 0) return 'Bridge $' + capital + ' of USDC through ' + name + ' to ' + chain + ' and use the bridged funds in its app.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    // Specific sub-categories first, for the same reason as in actionFor: the narrow match wins.
    if (c.indexOf('yield aggregator') >= 0) return 'Check the compounding weekly and top up a little once a month so the vault keeps growing.';
    if (c.indexOf('leveraged farming') >= 0) return 'Check the leverage ratio each week and unwind a little if the market turns against the position.';
    if (c.indexOf('uncollateralized lending') >= 0) return 'Check the borrower repayment schedule weekly so a missed payment is caught early.';
    if (c.indexOf('cdp manager') >= 0) return 'Check the collateral ratio weekly and top up collateral before it nears liquidation.';
    if (c.indexOf('collateral markets') >= 0) return 'Check the collateral market weekly and add a small amount when the rates are favourable.';
    if (c.indexOf('cross chain') >= 0) return 'Bridge a small amount each week so the route stays active.';
    if (c.indexOf('dual-token stablecoin') >= 0 || c.indexOf('stablecoin wrapper') >= 0) return 'Check the peg weekly and add a small amount when it holds within its band.';
    if (c.indexOf('staking pool') >= 0) return 'Claim or restake the pool rewards once a week so the position compounds.';
    if (c.indexOf('prediction market') >= 0) return 'Settle one market position each week so the account shows steady use.';
    if (c.indexOf('governance incentives') >= 0) return 'Vote on one proposal each week and claim the incentive so the wallet counts as an active governor.';
    if (c.indexOf('crypto card issuer') >= 0) return 'Make one card payment a week so the card stays active.';
    if (c.indexOf('indexes') >= 0) return 'Check the index rebalance weekly and hold through it.';
    if (c.indexOf('interest rate derivatives') >= 0) return 'Check the rate position weekly and close or roll it before expiry.';
    if (c.indexOf('lending') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Make one qualifying action each week, such as a supply, a borrow or a repayment.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0 || c === 'farm') return 'Swap or add liquidity once a week, even a small amount, so the wallet stays active.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('interest rate') >= 0) return 'Open or close one small hedge each week so the account shows steady use.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Rebalance or top up the vault once a week, even by a small amount, so the position stays active.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrual weekly and add a small amount once a month so the holding grows.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('anchor btc') >= 0 || c.indexOf('decentralized btc') >= 0) return 'Claim or restake the staking rewards once a week so the position compounds.';
    if (c.indexOf('prediction') >= 0) return 'Place one small market position each week so the account shows steady use.';
    if (c.indexOf('basis trading') >= 0) return 'Check the funding rate weekly and add a small amount when it turns positive.';
    if (c.indexOf('governance') >= 0) return 'Vote on one proposal each week so the wallet counts as an active governor.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  // A chain-specific note for the setup step: gas, custody and verification differ by chain.
  // The wording matches lib/model.ts exactly, so the page and board.json agree.
  function chainNote(chain) {
    var c = chain.toLowerCase();
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
    return 'On ' + chain + ', keep a little of the chain\u2019s gas token in the wallet so the position never stalls.';
  }
  // A dollar figure with no more precision than it earns: whole dollars stay whole, cents stay
  // cents. The wording matches lib/model.ts exactly, so the page and board.json agree.
  function money(n) {
    var r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2);
  }
  // A typical fee for one transaction on a chain, in USD: Ethereum mainnet is dollars, Solana
  // and the cheap L2s are cents. Chains the table does not name use the $0.50 default.
  var CHAIN_FEE_USD = {
    ethereum: 3.0, bitcoin: 2.0, tron: 0.25, arbitrum: 0.1, avalanche: 0.1, binance: 0.1,
    base: 0.05, optimism: 0.05, monad: 0.05, berachain: 0.05, mantle: 0.05, 'zksync era': 0.05,
    polygon: 0.02, flare: 0.02, solana: 0.01, sui: 0.01, aptos: 0.01, stellar: 0.01,
    ripple: 0.01, provenance: 0.01, 'hyperliquid l1': 0.01
  };
  function chainFee(chain) {
    var fee = CHAIN_FEE_USD[String(chain).toLowerCase()];
    return fee === undefined ? 0.5 : fee;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var fee = chainFee(chain);
    // The plan's transactions: 1 to set up, 2 to approve and deposit, 1 a week, 1 to claim.
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var totalGas = (4 + weeks) * fee;
    // The model's expected airdrop for this deposit: the deposit's share of the implied value,
    // priced at the row's implied multiple: the curve multiple times the category factor.
    var growth = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, p.change_7d === null || p.change_7d === undefined ? 0 : p.change_7d));
    var growthMult = 1 + (growth / 100) * DATA.model.growth_weight;
    var age = p.age_days === null || p.age_days === undefined ? DATA.model.unknown_age_days : p.age_days;
    var maturityMult = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    var catFactor = p.category_factor === null || p.category_factor === undefined ? 1 : p.category_factor;
    var multiple = p.base_multiple * catFactor;
    var expected = capital * multiple * growthMult * maturityMult;
    var net = expected - totalGas;
    var breakeven = Math.ceil(totalGas / Math.max(1e-9, multiple * growthMult * maturityMult) / 50) * 50;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. ' + chainNote(chain), cost: 'about $' + money(fee) + ' of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + money(2 * fee) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $' + money(fee) + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.' + (p.risk_label === 'Elevated' ? ' This protocol is flagged Elevated risk, so keep the position small and unwind if its TVL falls by a third.' : ''), cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'one transaction of gas to claim, and never pay a site to claim', time: '10 minutes' },
      { text: 'Add it up: a $' + capital + ' deposit, about $' + money(totalGas) + ' of gas over ' + hold + ' days, and an expected airdrop of about $' + money(expected) + " at this protocol's implied multiple \u2014 a net of about " + (net < 0 ? '-' : '') + '$' + money(Math.abs(net)) + '.' + (net < 0 ? ' The gas outweighs the expected airdrop at this size: size the deposit past $' + breakeven + ' so the fees are a smaller share, or skip this one.' : ' The plan pays for itself at this size.'), cost: 'about $' + money(totalGas) + ' of gas in total', time: hold + ' days' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('tab') === 'live') state.tab = 'live';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The watchlist filter reads the row's own flag, set by main.ts from the snapshot.
  function rowsFiltered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlist && !r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // The top movers strip: the five fastest-growing protocols and the five largest by TVL,
  // each a button that opens its detail drawer. It answers the reader's first question after
  // the ranking: what is moving, and what is big.
  function moversStrip() {
    var gainers = DATA.rows.filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined; })
      .sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    var largest = DATA.rows.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; }).slice(0, 5);
    function chip(r, value, cls) {
      return el('button', { type: 'button', class: 'chip', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'chip-name', text: r.name }),
        el('span', { class: 'chip-value ' + cls, text: value }));
    }
    return el('section', { class: 'movers', 'aria-label': 'Top movers and largest protocols' },
      el('div', { class: 'mover-group' },
        el('h2', { text: 'Top movers, 7 days' }),
        el('div', { class: 'chips' }, gainers.map(function (r) { return chip(r, fmtPct(r.change_7d), r.change_7d >= 0 ? 'pos' : 'neg'); }))),
      el('div', { class: 'mover-group' },
        el('h2', { text: 'Largest TVL' }),
        el('div', { class: 'chips' }, largest.map(function (r) { return chip(r, fmtUsd(r.tvl_usd), ''); })))
    );
  }

  // The category summary bar: each category's row count and summed implied value, strongest
  // first. Clicking a chip filters the board to that category; clicking it again clears it.
  function categoryBar() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = { count: 0, value: 0 };
      byCat[c].count++;
      byCat[c].value += r.implied_value_usd;
    });
    var cats = Object.keys(byCat).map(function (c) { return { name: c, count: byCat[c].count, value: byCat[c].value }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    return el('section', { class: 'catbar', 'aria-label': 'Implied value by category' },
      cats.map(function (c) {
        return el('button', { type: 'button', class: 'cat-chip' + (state.category === c.name ? ' active' : ''), onclick: function () { state.category = state.category === c.name ? 'all' : c.name; writeHash(); render(); } },
          el('span', { class: 'cat-name', text: c.name }),
          el('span', { class: 'cat-count', text: c.count + ' rows' }),
          el('span', { class: 'cat-value num', text: fmtUsd(c.value) }));
      }));
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          el('span', { text: 'The watchlist is the floor: every protocol with at least ' }),
          el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          el('span', { text: ' of TVL and no token on record. The radar adds ' }),
          el('b', { text: String(DATA.early_size) + ' more' }),
          el('span', { text: ' genuine pre-token protocols below that floor, so the board is the complete clean universe, not a sample. Implied value is a model, not a promise.' })
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' }),
      el('span', { text: 'Watchlist only' })
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlist = e.target.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rowsFiltered().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rowsFiltered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankClass = r.rank <= 3 ? 'num rank-top' : 'num';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: rankClass, text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.on_watchlist ? ' · watchlist' : '') }),
          el('span', { class: 'risk-tag risk-' + (r.risk_label || 'Moderate').toLowerCase(), text: 'risk: ' + (r.risk_label || 'Moderate') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var mult = DATA.multiple;
    var curve = DATA.curve;
    var val = DATA.validation;
    // Final multiples, after the category factor: the clamp binds the curve multiple only.
    var finalMults = DATA.rows.map(function (r) { return r.base_multiple * (r.category_factor === null || r.category_factor === undefined ? 1 : r.category_factor); });
    var outsideCap = finalMults.filter(function (f) { return f < curve.multiple_floor || f > curve.multiple_cap; }).length;
    var highestMult = Math.max.apply(null, finalMults);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        el('span', { text: 'implied = round( tvl_usd x multiple(tvl_usd) x category_factor(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )' }),
        el('br'),
        el('span', { text: 'multiple(tvl) = clamp( exp(' }),
        el('b', { text: String(curve.intercept) }),
        el('span', { text: ') x tvl^(' }),
        el('b', { text: String(curve.slope - 1) }),
        el('span', { text: '), ' + curve.multiple_floor + ', ' + curve.multiple_cap + ' )' })
      ),
      el('p', { class: 'sub', text: 'category_factor(category) = exp(offset): the category\u2019s shrunk mean residual from the curve, (n / (n + ' + m.category_shrink_k + ')) x the mean of log(mcap) - curve prediction over its live protocols. A category with no live protocol scores 1. The factor multiplies after the clamp, so the clamp governs the curve multiple only.' }),
      el('div', { class: 'derived' },
        el('div', null, el('span', { text: 'Fitted curve, log FDV on log TVL' }), el('b', { text: 'log FDV = ' + curve.intercept + ' + ' + curve.slope + ' x log TVL' })),
        el('div', null, el('span', { text: 'Live protocols the curve is fit on' }), el('b', { text: String(curve.n) })),
        el('div', null, el('span', { text: 'R² of the fit' }), el('b', { text: String(curve.r2) })),
        el('div', null, el('span', { text: 'R², curve + category offsets' }), el('b', { text: String(curve.category_r2) })),
        el('div', null, el('span', { text: 'Residual SD, curve + category' }), el('b', { text: String(curve.category_residual_sd) + ' log points' })),
        el('div', null, el('span', { text: 'Categories fitted' }), el('b', { text: String(curve.categories.length) })),
        el('div', null, el('span', { text: 'Multiple at the clamp floor / cap' }), el('b', { text: curve.at_floor + ' / ' + curve.at_cap + ' rows' }))
      ),
      el('h3', { text: 'Model validation: fitted, not assumed' }),
      el('p', { class: 'sub', text: 'The live set is split 80/20 by a seeded hash of the slug, the curve and the category offsets are fit on the ' + val.train_n + ' they are allowed to see and scored on the ' + val.test_n + ' they never saw, and the same test is run for the old one-median model. The category model wins out of sample (1.21 against the curve\u2019s 1.31 and the median\u2019s 1.82), so it earns its place on the board; the fit is still noisy, and the numbers say so.' }),
      el('div', { class: 'derived' },
        el('div', null, el('span', { text: 'Out-of-sample error, fitted curve' }), el('b', { text: String(val.fitted_median_log_error) + ' log points' })),
        el('div', null, el('span', { text: 'Out-of-sample error, curve + category' }), el('b', { text: String(val.category_median_log_error) + ' log points' })),
        el('div', null, el('span', { text: 'Out-of-sample error, one median' }), el('b', { text: String(val.median_median_log_error) + ' log points' })),
        el('div', null, el('span', { text: 'Five-fold cross-validation, offline experiment' }), el('b', { text: 'curve 1.43 / category 1.38 log points' })),
        el('div', null, el('span', { text: 'Train-half fit, for the honest test' }), el('b', { text: 'log FDV = ' + val.train_intercept + ' + ' + val.train_slope + ' x log TVL, R² ' + val.train_r2 })),
        el('div', null, el('span', { text: 'One-median baseline, train half' }), el('b', { text: 'multiple ' + val.train_median_multiple }))
      ),
      el('h3', { text: 'Category adjustments' }),
      el('p', { class: 'sub', text: 'Each category\u2019s live protocols sit above or below the curve; the offset is their shrunk mean residual, so a category with one live protocol cannot move the board on a single print. The table is the fitted model, strongest first. Growth and maturity are stated assumptions, not fitted values: fitting them on the live set gives negative coefficients, so the model states them as judgement rather than claiming the market rewards them.' }),
      el('div', { class: 'catgrid' }, curve.categories.map(function (c) {
        return el('div', null,
          el('span', { text: c.category + ' (n=' + c.n + ')' }),
          el('b', { text: 'x' + c.factor + ' (' + (c.offset_log >= 0 ? '+' : '') + c.offset_log + ')' }));
      })),
      el('h3', { text: 'Rank 1, worked' }),
      el('p', { class: 'sub', text: 'The top row, factor by factor, so the arithmetic is checkable.' }),
      el('div', { class: 'derived' },
        el('div', null, el('span', { text: 'Rank 1' }), el('b', { text: DATA.rows[0].name })),
        el('div', null, el('span', { text: 'TVL x curve multiple x category factor' }), el('b', { text: fmtUsd(DATA.rows[0].tvl_usd) + ' x ' + DATA.rows[0].base_multiple + ' x ' + DATA.rows[0].category_factor })),
        el('div', null, el('span', { text: 'Growth x maturity' }), el('b', { text: DATA.rows[0].growth_multiplier + ' x ' + DATA.rows[0].maturity_multiplier })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(DATA.rows[0].implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'A large protocol trades at a lower multiple than a small one: the fitted slope is ' + curve.slope + ', below 1, so the multiple falls as TVL grows. The one-median model it replaces used ' + mult.median + ' for every size (25th percentile ' + mult.p25 + ', 75th ' + mult.p75 + ', ' + mult.live_count + ' live protocols). The multiple is clamped to [' + curve.multiple_floor + ', ' + curve.multiple_cap + ']: ' + curve.at_floor + ' rows sit on the floor and ' + curve.at_cap + ' on the cap. TVL and seven-day growth come from the snapshot; age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The live-token protocols are set aside with their market caps shown. The clamp binds the curve multiple only: ' + outsideCap + ' of ' + DATA.rows.length + ' rows end with a final multiple outside [' + curve.multiple_floor + ', ' + curve.multiple_cap + '], the highest x' + highestMult.toFixed(2) + '.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var why = row.rank <= 3
      ? 'One of the largest pre-token footprints in the snapshot: its TVL alone puts it at the top, and its growth and seasoning hold the value there.'
      : row.change_7d !== null && row.change_7d > 10
        ? 'Its seven-day growth lifts it above larger but slower protocols: momentum, not size alone, earns this rank.'
        : row.age_days !== null && row.age_days >= 730
          ? 'Two years or more with no token and a large TVL: a seasoned protocol whose launch, if it comes, rewards the patient.'
          : 'Its TVL, growth and seasoning together put it here; the model scores every protocol the same way, and this is where the arithmetic lands.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Fitted multiple (comps curve, at this TVL)' }), el('b', { class: 'num', text: String(row.base_multiple) })),
        el('div', null, el('span', { text: 'Category factor (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: 'x' + String(row.category_factor === null || row.category_factor === undefined ? 1 : row.category_factor) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      el('p', { class: 'sub', text: why })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Risk signal' }),
      el('p', null,
        el('span', { class: 'risk-badge risk-' + (row.risk_label || 'Moderate').toLowerCase(), text: (row.risk_label || 'Moderate') + ' risk' }),
        el('span', { class: 'sub', text: ' Score ' + (row.risk_score === null || row.risk_score === undefined ? 'n/a' : row.risk_score) + ' of 100, from the protocol\u2019s own record: size, age, momentum and chain breadth. A high score is a warning, not a verdict.' })
      ),
      el('ul', { class: 'risk-reasons' }, (row.risk_reasons || []).map(function (reason) { return el('li', { text: reason }); }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      shell.appendChild(moversStrip());
      shell.appendChild(categoryBar());
    }
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
