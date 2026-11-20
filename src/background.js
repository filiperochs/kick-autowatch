/* Kick AutoWatch - background: default settings + toolbar badge. */
const DEFAULTS = {
  enabled: false,
  autoSwitch: true,
  autoClaim: true,
  language: "en",
  fallbackChannels: [],
  blockedChannels: [],
  claimedCount: 0,
  switchCount: 0,
  log: [],
};

async function ensureDefaults() {
  const cur = await browser.storage.local.get(null);
  const missing = {};
  for (const [k, v] of Object.entries(DEFAULTS)) if (!(k in cur)) missing[k] = v;
  if (Object.keys(missing).length) await browser.storage.local.set(missing);
}

function paintBadge(enabled) {
  browser.browserAction.setBadgeText({ text: enabled ? "ON" : "" });
  browser.browserAction.setBadgeBackgroundColor({ color: "#2e9e0f" });
}

browser.runtime.onInstalled.addListener(ensureDefaults);
ensureDefaults().then(() =>
  browser.storage.local.get("enabled").then((s) => paintBadge(!!s.enabled))
);
browser.storage.onChanged.addListener((ch) => {
  if (ch.enabled) paintBadge(!!ch.enabled.newValue);
});
