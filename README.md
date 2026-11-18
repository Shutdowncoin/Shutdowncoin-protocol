# Shutdown

**One switch. A live Solana board.**

[![Live site](https://img.shields.io/badge/live-shutdown.codes-efefef?style=flat-square&labelColor=000000)](https://shutdown.codes)
[![Chain](https://img.shields.io/badge/chain-Solana-efefef?style=flat-square&labelColor=000000)](https://solana.com)
[![License](https://img.shields.io/badge/license-MIT-efefef?style=flat-square&labelColor=000000)](LICENSE)

- **Chain:** Solana mainnet
- **Contract address:** _not announced yet_ (the site slot stays inert until an address is stated in `src/register.json`)

## Overview

Shutdown is a static site built around one idea: when everything else goes quiet, the tape keeps talking. The page pairs a dark, animated hero with a live board of the Solana tokens the market is chasing right now.

Every external fact (contract address, social links, market sources) lives in a single register. A record is either `stated`, `absent` or `unconfirmed`, and anything that is not stated renders inert: no link, no copy button, no fetch.

## Features

- Live market board: top boosted Solana tokens with logo, price, 24h change, 24h volume and liquidity
- Ticker strip driven by the same data, polled every 60 seconds, paused while the tab is hidden
- Skeleton loaders, count-up values, flash on change, last good data kept when a refresh fails
- Pinned own-token row: placeholder with the brand mark until the mint is stated, then live data from DexScreener and pump.fun fetched in parallel
- Address checker: matches any pasted address against the registry instead of rejecting by shape
- Spring-physics reveals, hero parallax, spotlight hover, scroll progress; every motion has an instant reduced-motion fallback

## Links

- Site: https://shutdown.codes
- X: https://x.com/shutdowncoin
- GitHub: _not available yet_

## Develop

```bash
npm run build     # src/ -> dist/ (deploy output)
npm run verify    # gate runner, both contract-address branches
npm run serve     # static preview of dist/ on http://localhost:4173
```

No runtime dependencies. To state the contract address, edit the `ca` record in `src/register.json` (`"state": "stated"`, `"value": "<mint>"`) and rebuild.

## License

MIT. See [LICENSE](LICENSE).
