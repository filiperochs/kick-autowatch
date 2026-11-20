const $ = (id) => document.getElementById(id);
const lines = (s) => s.split(/\s*[\n,]+\s*/).map((x) => x.trim().toLowerCase()).filter(Boolean);

async function kickTab() {
  const tabs = await browser.tabs.query({ url: ["*://kick.com/*", "*://*.kick.com/*"] });
  return tabs.find((t) => t.active && t.currentWindow) || tabs[0] || null;
}
async function ask(type) {
  const t = await kickTab();
  if (!t) return null;
  try { return await browser.tabs.sendMessage(t.id, { type }); } catch (_) { return null; }
}

function renderLog(log) {
  $("log").innerHTML = "";
  for (const e of [...log].reverse().slice(0, 25)) {
    const li = document.createElement("li");
    const t = document.createElement("time");
    t.textContent = new Date(e.t).toLocaleTimeString();
    li.append(t, document.createTextNode(e.m));
    $("log").append(li);
  }
  if (!log.length) $("log").innerHTML = "<li>No activity yet.</li>";
}

async function refreshStatus() {
  const s = await ask("status");
  const el = $("status");
  if (!(await kickTab())) el.textContent = "Open kick.com to use it";
  else if (!s) el.textContent = "Reload the Kick tab to attach";
  else if (!s.enabled) el.textContent = "Paused";
  else if (!s.slug) el.textContent = "Active - not on a channel page";
  else el.textContent = `Watching ${s.slug}${s.live === false ? " (offline)" : s.playing ? " (playing)" : ""}`;
}

async function init() {
  const st = await browser.storage.local.get(null);
  $("enabled").checked = !!st.enabled;
  $("autoSwitch").checked = st.autoSwitch !== false;
  $("autoClaim").checked = st.autoClaim !== false;
  $("language").value = st.language || "en";
  $("fallbackChannels").value = (st.fallbackChannels || []).join("\n");
  $("blockedChannels").value = (st.blockedChannels || []).join("\n");
  $("claimed").textContent = st.claimedCount || 0;
  $("switches").textContent = st.switchCount || 0;
  renderLog(st.log || []);
  refreshStatus();

  const save = (k, v) => browser.storage.local.set({ [k]: v });
  $("enabled").onchange = (e) => save("enabled", e.target.checked).then(() => setTimeout(refreshStatus, 400));
  $("autoSwitch").onchange = (e) => save("autoSwitch", e.target.checked);
  $("autoClaim").onchange = (e) => save("autoClaim", e.target.checked);
  $("language").onchange = (e) => save("language", e.target.value);
  $("fallbackChannels").onchange = (e) => save("fallbackChannels", lines(e.target.value));
  $("blockedChannels").onchange = (e) => save("blockedChannels", lines(e.target.value));
  $("startNow").onclick = async () => { $("enabled").checked = true; await save("enabled", true); await ask("startNow"); };
  $("claimNow").onclick = () => ask("claimNow");
  $("dump").onclick = async () => {
    const d = await ask("dump");
    await navigator.clipboard.writeText(JSON.stringify(d, null, 2));
    $("dump").textContent = d ? "Copied!" : "Open a Kick tab first";
    setTimeout(() => ($("dump").textContent = "Copy diagnostics"), 1500);
  };
}

browser.storage.onChanged.addListener((ch) => {
  if (ch.log) renderLog(ch.log.newValue || []);
  if (ch.claimedCount) $("claimed").textContent = ch.claimedCount.newValue;
  if (ch.switchCount) $("switches").textContent = ch.switchCount.newValue;
});
init();
setInterval(refreshStatus, 3000);
