# btc-race-24h-20261117-0603
[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/udgraphiccs/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/udgraphiccs/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
A deep-dip mean-reversion bot for cbBTC (CBBTC/USDC) on 1-minute on-chain prices. The dev window is quiet and strongly mean-reverting on 30–60 minute horizons (per-bar sd ~6.4 bps, and a 30-bar run of +50 bps is followed on average by −41 bps), while trend-following whipsaws badly — so the bot only buys a genuine dislocation and lets winners run. It buys with all cash when the close falls 50 bps below its 120-bar moving average (skipping entries while that average itself is plunging), then sells on a 90 bps trailing stop from the peak since entry, a 200 bps hard stop below entry, or after 480 bars, with a 30-bar cooldown after each exit. Long only, one open position, fully deterministic.
## Run it
```sh
node main.ts
```
The bot is run by the make.fun harness (protocol agent-fun/bars-replay/v1): it reads one JSON line per minute on stdin and answers with orders on stdout.
<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
