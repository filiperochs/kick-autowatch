/* Kick AutoWatch - content script (runs on kick.com). */
(() => {
  if (window.__kawLoaded) return;
  window.__kawLoaded = true;

  const C = window.KAW_CFG;
  const S = { enabled: false, autoSwitch: true, autoClaim: true, language: "en",
              fallbackChannels: [], blockedChannels: [] };
  const run = { offlineStreak: 0, lastLiveCheck: 0, lastClaimScan: 0, lastTime: -1,
                lastTimeAt: Date.now(), switching: false, live: null,
                triggerClicks: new Map(), openedByUs: 0, lastClaimAt: 0, lastReload: 0 };

  // ---------- helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || "").replace(/\s+/g, " ").trim();

  function currentSlug() {
    const seg = location.pathname.split("/").filter(Boolean);
    if (!seg.length) return null;
    const s = seg[0].toLowerCase();
    if (C.reservedPaths.has(s) || !/^[a-z0-9_-]+$/i.test(s)) return null;
    return s;
  }

  // storage writes are serialised so concurrent log()/bump() calls never overwrite each other
  let chain = Promise.resolve();
  const queued = (fn) => (chain = chain.then(fn).catch(() => {}));
  function log(msg, extra) {
    console.log("[Kick AutoWatch]", msg, extra || "");
    return queued(async () => {
      const { log: l = [] } = await browser.storage.local.get("log");
      l.push({ t: Date.now(), m: msg });
      await browser.storage.local.set({ log: l.slice(-60) });
    });
  }
  function bump(key) {
    return queued(async () => {
      const o = await browser.storage.local.get(key);
      await browser.storage.local.set({ [key]: (o[key] || 0) + 1 });
    });
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
  }
  const disabled = (el) =>
    el.disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");

  function labelOf(el) {
    return norm(
      [el.innerText || el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")]
        .filter(Boolean).join(" ")
    );
  }
  function hintOf(el) {
    return C.triggerAttrs.map((a) => el.getAttribute(a) || "").join(" ");
  }
  function click(el) {
    el.scrollIntoView({ block: "center" });
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
    el.click(); // native click: fires handlers from the page's own world reliably
  }

  async function getJSON(url) {
    try {
      const r = await fetch(new URL(url, location.origin).href, { credentials: "include", headers: { Accept: "application/json" } });
      if (!r.ok) return { ok: false, status: r.status };
      return { ok: true, data: await r.json() };
    } catch (e) {
      run.lastFetchError = String(e);
      return { ok: false, status: 0 };
    }
  }

  // ---------- live status & switching ----------
  async function isChannelLive(slug) {
    const r = await getJSON(C.api.channel(slug));
    if (!r.ok) return null; // unknown (blocked / network) -> never act on it
    const ls = r.data && r.data.livestream;
    return !!(ls && ls.is_live !== false);
  }

  async function pickLive(exclude) {
    const blocked = new Set(S.blockedChannels.map((s) => s.toLowerCase()));
    const skip = (s) => !s || s === exclude || blocked.has(s);
    for (const raw of S.fallbackChannels.slice(0, 8)) {
      const s = raw.toLowerCase().trim();
      if (skip(s)) continue;
      if ((await isChannelLive(s)) === true) return { slug: s, why: "fallback list" };
    }
    const r = await getJSON(C.api.featured(S.language || "en"));
    if (r.ok && Array.isArray(r.data && r.data.data)) {
      const live = r.data.data
        .filter((d) => d && d.is_live !== false)
        .map((d) => ({ slug: ((d.channel && d.channel.slug) || "").toLowerCase(),
                       v: d.viewers || d.viewer_count || 0 }))
        .filter((d) => !skip(d.slug))
        .sort((a, b) => b.v - a.v)
        .slice(0, 10);
      if (live.length) {
        const p = live[Math.floor(Math.random() * live.length)];
        return { slug: p.slug, why: `featured (${S.language}), ${p.v} viewers` };
      }
    }
    return null;
  }

  async function switchChannel(reason) {
    if (run.switching) return false;
    run.switching = true;
    try {
      const cur = currentSlug();
      const pick = await pickLive(cur);
      if (!pick) { await log(`Could not find another live (${reason}); retrying later.`); return false; }
      await log(`Switching ${cur || "(none)"} -> ${pick.slug} [${reason}; ${pick.why}]`);
      await bump("switchCount");
      location.assign(`/${pick.slug}`);
      return true;
    } finally {
      setTimeout(() => (run.switching = false), 15000);
    }
  }

  // ---------- video keeper ----------
  function mainVideo() {
    const vs = [...document.querySelectorAll("video")].filter((v) => v.isConnected);
    return vs.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
  }

  function dismissMatureGate() {
    for (const b of document.querySelectorAll("button, [role=button]")) {
      if (!visible(b) || disabled(b)) continue;
      const t = labelOf(b);
      if (t.length < 50 && C.matureWords.test(t) && !C.denyWords.test(t)) {
        click(b);
        log(`Dismissed mature-content gate ("${t}")`);
        return true;
      }
    }
    return false;
  }

  async function keepPlaying(slug) {
    dismissMatureGate();
    const v = mainVideo();
    if (!v) return;
    if (v.paused && !v.ended) {
      // play() can stay pending forever (no source / buffering): never block the main loop on it
      const tryPlay = () => Promise.race([v.play().then(() => true, () => false), sleep(1500).then(() => false)]);
      if (!(await tryPlay())) {
        v.muted = true; // autoplay policies allow muted playback
        if (await tryPlay()) await log("Video was paused; resumed (muted for autoplay policy).");
      }
    }
    // stall watchdog: playing but time not advancing
    if (v.currentTime !== run.lastTime) { run.lastTime = v.currentTime; run.lastTimeAt = Date.now(); }
    else if (!v.paused && run.live !== false && Date.now() - run.lastTimeAt > C.stallReloadMs
             && Date.now() - run.lastReload > 5 * 60000) {
      run.lastReload = Date.now();
      await log(`Playback stalled on ${slug}; reloading page.`);
      location.reload();
    }
  }

  // ---------- reward claiming ----------
  function dialogs() {
    const sel = "[role=dialog], [role=alertdialog], dialog[open], [data-radix-popper-content-wrapper], [class*=modal], [class*=popover], [class*=Dialog]";
    return [...document.querySelectorAll(sel)].filter(visible);
  }
  function clickables(root) {
    return [...root.querySelectorAll("button, [role=button], a[href^='#'], a:not([href])")]
      .filter((b) => visible(b) && !disabled(b));
  }

  const claimed = new WeakSet(); // never click the same element twice

  function findClaimButton() {
    // 1) inside any reward-related dialog/popover
    for (const d of dialogs()) {
      if (!C.rewardWords.test(d.innerText || "")) continue;
      for (const b of clickables(d)) {
        const t = labelOf(b);
        if (t.length < 60 && C.claimWords.test(t) && !C.denyWords.test(t)) return { el: b, where: "dialog", t };
      }
    }
    // 2) standalone claim buttons that are themselves reward-flavoured
    for (const b of clickables(document)) {
      if (b.getAttribute("aria-haspopup")) continue; // that's a panel trigger, handled by findTrigger()
      const t = labelOf(b);
      if (t.length < 60 && C.claimWords.test(t) && !C.denyWords.test(t)
          && (C.rewardWords.test(t) || C.rewardWords.test(hintOf(b)))) return { el: b, where: "inline", t };
    }
    return null;
  }

  function findTrigger() {
    const now = Date.now();
    for (const b of clickables(document)) {
      if (b.closest("[role=dialog]")) continue;
      const hint = hintOf(b) + " " + labelOf(b);
      if (!C.rewardWords.test(hint) || C.denyWords.test(hint)) continue;
      const r = b.getBoundingClientRect();
      if (r.width > 260 || r.height > 120) continue; // icons/buttons only, not whole panels
      const key = hint.slice(0, 80);
      if (now - (run.triggerClicks.get(key) || 0) < C.triggerCooldownMs) continue;
      return { el: b, key };
    }
    return null;
  }

  // The rewards dialog on kick.com is a carousel (Sunset Reward Case -> Daily Reward -> ...).
  function rewardDialog() {
    return dialogs().find((d) => C.rewardWords.test(d.innerText || "") && !/cookie/i.test(d.innerText || ""));
  }
  function closeRewardDialog() {
    const d = rewardDialog();
    if (d) {
      const x = [...d.querySelectorAll("button, [role=button]")].find((b) => C.closeWords.test(labelOf(b)) ||
        C.closeWords.test(b.getAttribute("aria-label") || ""));
      if (x) { click(x); return; }
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  function nextSlide(d) {
    const n = [...d.querySelectorAll("button, [role=button]")].find((b) =>
      visible(b) && !disabled(b) && C.nextSlideWords.test(b.getAttribute("aria-label") || ""));
    if (n) click(n);
    return !!n;
  }

  async function scanClaims() {
    const found = findClaimButton();
    if (found) {
      if (Date.now() - run.lastClaimAt < 4000 || claimed.has(found.el)) return;
      claimed.add(found.el);
      run.lastClaimAt = Date.now();
      const title = norm((found.el.closest("[role=dialog]") || document.body).innerText).slice(0, 60);
      click(found.el);
      await log(`Clicked claim button "${found.t}" (${found.where}) | ${title}`);
      if (found.where === "dialog") await bump("claimedCount");
      run.slidesSeen = 0;
      setTimeout(closeRewardDialog, 12000); // let the opening animation finish
      return;
    }
    const d = rewardDialog();
    if (d) {
      // Panel is open but nothing claimable on this slide: look at the other slides, then close it.
      run.slidesSeen = (run.slidesSeen || 0) + 1;
      if (run.slidesSeen <= 6 && nextSlide(d)) return;
      await log("Rewards panel: nothing claimable right now (locked or already claimed); closing.");
      run.slidesSeen = 0;
      closeRewardDialog();
      return;
    }
    const trig = findTrigger();
    if (trig) {
      run.triggerClicks.set(trig.key, Date.now());
      run.slidesSeen = 0;
      click(trig.el);
      await log(`Opened rewards panel via "${trig.key.slice(0, 40)}"`);
    }
  }

  // ---------- main loop ----------
  async function tick() {
    if (!S.enabled) return;
    const slug = currentSlug();
    const now = Date.now();

    if (slug) await keepPlaying(slug);

    if (S.autoSwitch && slug && now - run.lastLiveCheck >= C.liveCheckMs) {
      run.lastLiveCheck = now;
      const live = await isChannelLive(slug);
      if (live === null && run.lastFetchError) {
        if (run.lastFetchError !== run.reportedFetchError) await log(`Live check failed: ${run.lastFetchError}`);
        run.reportedFetchError = run.lastFetchError; run.lastFetchError = null;
      }
      if (live !== run.live && live !== null) await log(`${slug} is ${live ? "live" : "OFFLINE"}`);
      run.live = live;
      if (live === false) {
        run.offlineStreak++;
        if (run.offlineStreak >= C.offlineChecksBeforeSwitch) {
          run.offlineStreak = 0;
          await switchChannel(`${slug} is offline`);
          return;
        }
      } else if (live === true) run.offlineStreak = 0;
    }

    if (S.autoClaim && now - run.lastClaimScan >= C.claimScanMs) {
      run.lastClaimScan = now;
      await scanClaims();
    }
  }

  let ticking = false;
  setInterval(async () => {
    if (ticking) return; ticking = true;
    try { await tick(); } catch (e) { console.warn("[Kick AutoWatch] tick error", e); }
    ticking = false;
  }, C.tickMs);

  // ---------- settings & popup messages ----------
  async function loadSettings() {
    Object.assign(S, await browser.storage.local.get(Object.keys(S)));
  }
  browser.storage.onChanged.addListener((ch) => {
    for (const k of Object.keys(ch)) if (k in S) S[k] = ch[k].newValue;
    if (ch.enabled) {
      Object.assign(run, { offlineStreak: 0, lastLiveCheck: 0, lastClaimScan: 0 });
      log(ch.enabled.newValue ? `Enabled on ${currentSlug() || location.pathname}` : "Disabled");
    }
  });

  function dump() {
    const rows = [];
    for (const b of document.querySelectorAll("button, [role=button], a")) {
      if (!visible(b)) continue;
      const hint = hintOf(b) + " " + labelOf(b);
      if (C.rewardWords.test(hint) || C.claimWords.test(labelOf(b)))
        rows.push({ tag: b.tagName, text: labelOf(b).slice(0, 80), attrs: hintOf(b).slice(0, 160), disabled: disabled(b) });
    }
    return { url: location.href, dialogs: dialogs().map((d) => norm(d.innerText).slice(0, 200)), candidates: rows.slice(0, 40) };
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "status") {
      const v = mainVideo();
      return Promise.resolve({ slug: currentSlug(), live: run.live, playing: !!(v && !v.paused),
                               enabled: S.enabled });
    }
    if (msg.type === "startNow") return switchChannel("manual start").then((ok) => ({ ok }));
    if (msg.type === "claimNow") return scanClaims().then(() => ({ ok: true }));
    if (msg.type === "dump") return Promise.resolve(dump());
  });

  // @test-hook

  loadSettings().then(() => { if (S.enabled) log(`Active on ${currentSlug() || location.pathname}`); });
})();
