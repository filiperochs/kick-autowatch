/*
 * Kick AutoWatch - tunable heuristics.
 * Kick's front-end changes often. Everything that depends on its markup or
 * wording lives here so it can be adjusted in one place.
 */
window.KAW_CFG = {
  // First URL segments that are NOT channel pages.
  reservedPaths: new Set([
    "", "browse", "categories", "category", "drops", "dashboard", "search",
    "following", "clips", "clip", "video", "videos", "settings", "support",
    "subscriptions", "wallet", "rewards", "terms-of-service", "privacy-policy",
    "community-guidelines", "api", "stream", "emotes", "login", "signup",
    "mobile", "kicks", "bounties", "leaderboard", "shop", "store", "help",
  ]),

  // Words that tie an element to the rewards / case feature (multi-language).
  rewardWords:
    /\b(sunset|rewards?|recompensas?|cases?|caixa|chest|bau|baú|pr[eê]mios?|drops?)\b/i,

  // Text on the button that actually claims / opens.
  claimWords:
    /^\s*(claim|collect|open|redeem|get reward|resgatar|coletar|abrir|reivindicar|reclamar|recoger|abrir caja)\b/i,

  // Never click anything whose text matches this.
  denyWords:
    /(subscribe|subscription|gift|buy|purchase|follow|assinar|comprar|presente|donate|tip|cancel|report|block|ban)/i,

  // "Are you 18+?" style gates in front of the video.
  matureWords: /(start watching|i am 18|i'm 18|18\+|continue|confirm|iniciar|tenho 18)/i,

  // Hint attributes searched for reward triggers.
  triggerAttrs: ["aria-label", "title", "data-testid", "id", "class", "alt"],

  // API endpoints (same-origin, cookies attached).
  api: {
    channel: (slug) => `/api/v2/channels/${encodeURIComponent(slug)}`,
    featured: (lang) => `/stream/featured-livestreams/${encodeURIComponent(lang)}`,
  },

  tickMs: 4000,
  liveCheckMs: 20000,
  offlineChecksBeforeSwitch: 2,
  claimScanMs: 6000,
  triggerCooldownMs: 120000,
  stallReloadMs: 90000,
};
