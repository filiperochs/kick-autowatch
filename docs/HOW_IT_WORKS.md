# How it works

```
content.js (every 4 s, only when enabled, only on kick.com/<channel>)
 ├─ keepPlaying      resume paused <video> (muted fallback), dismiss 18+ gate, reload if time stalls 90 s
 ├─ live check (20 s) GET /api/v2/channels/<slug>  -> livestream == null ? offline
 │    └─ 2 offline checks -> pickLive() -> location.assign('/<new>')
 │         pickLive: favourites (live?) -> /stream/featured-livestreams/<lang> -> random of top 10 by viewers
 └─ claim scan (6 s)  findClaimButton() in reward dialogs  ->  else findTrigger() opens the panel
```

* **State** lives in `browser.storage.local` (`enabled`, `autoSwitch`, `autoClaim`, `language`, lists, counters, log).
* **Heuristics** (`src/selectors.js`): reward words, claim words, deny words, reserved paths, timings.
* **Safety:** deny-list for purchase/subscribe-like buttons; each claim element is clicked once; trigger cooldown 2 min; unknown API results (blocked/offline network) never cause a switch.
* **Test build** (`scripts/build.py --test`) adds a localhost match, fast timers and a storage hook; production builds do not.
