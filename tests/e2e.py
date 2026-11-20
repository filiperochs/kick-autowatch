"""End-to-end test: real Firefox + the built extension against a mock Kick.

  python tests/e2e.py [--shots]     (--shots saves docs/screenshots/*.png)

WebDriver cannot drive moz-extension:// pages, so the extension's storage is driven through a
test-only content-script hook, and the popup UI is rendered (with a stubbed `browser` API) at /__popup.
"""
import json, subprocess, sys, time, urllib.request
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options

sys.path.insert(0, str(Path(__file__).parent))
import mock_kick

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:8765"
SHOTS = "--shots" in sys.argv
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS" if ok else "FAIL"), name, detail)


def state():
    return json.load(urllib.request.urlopen(BASE + "/__state"))


def post(path):
    urllib.request.urlopen(urllib.request.Request(BASE + path, method="POST"))


def wait(cond, timeout=25, step=0.3):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = cond()
            if v:
                return v
        except Exception:
            pass
        time.sleep(step)
    return None


def ext_storage(d, data=None):
    """Read/write the extension's storage.local via the test hook (page /hook is not a channel)."""
    d.get(BASE + "/hook")
    time.sleep(0.8)
    d.execute_script(
        "window.__r=null; window.addEventListener('message',e=>{if(e.data&&e.data.kawResult)window.__r=e.data.kawResult});"
        "window.postMessage({kawTest: arguments[0] ? 'set' : 'get', data: arguments[0]}, '*')",
        data)
    return wait(lambda: d.execute_script("return window.__r"), 8)


def shot(d, name, size=None):
    if not SHOTS:
        return
    if size:
        d.set_window_size(*size)
        time.sleep(0.6)
    d.save_screenshot(str(ROOT / "docs/screenshots" / name))


def main():
    subprocess.run([sys.executable, str(ROOT / "scripts/build.py"), "--test"], check=True)
    mock_kick.start()
    o = Options()
    o.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
    d = webdriver.Firefox(options=o)
    try:
        d.set_window_size(1100, 780)
        d.install_addon(str(ROOT / "dist-test"), temporary=True)
        time.sleep(1.5)

        # 0. popup UI renders (stubbed browser API, real popup html/css/js)
        d.get(BASE + "/__popup")
        wait(lambda: d.find_element(By.ID, "enabled"))
        time.sleep(0.5)
        check("popup renders toggle + settings", d.find_element(By.ID, "language").is_displayed()
              and d.find_element(By.ID, "autoClaim").is_selected())
        check("popup shows log entries", len(d.find_elements(By.CSS_SELECTOR, "#log li")) == 5)
        check("popup shows stats", d.find_element(By.ID, "claimed").text == "3")
        shot(d, "popup.png", (400, 720))
        d.set_window_size(1100, 780)

        # 1. default state is OFF; extension does nothing while OFF
        st = ext_storage(d)
        check("defaults installed, enabled=false", st is not None and st.get("enabled") is False, str(st and st.get("enabled")))
        d.get(BASE + "/alpha")
        time.sleep(4)
        check("OFF: no claim happens", state()["claims"] == 0)

        # 2. toggle ON -> auto-claim
        ext_storage(d, {"enabled": True})
        d.get(BASE + "/alpha")
        check("ON: reward panel opened + 'Open case' clicked", wait(lambda: state()["claims"] >= 1),
              f"claims={state()['claims']}")
        shot(d, "auto-claim.png", (1100, 560))
        n = state()["claims"]
        time.sleep(4)
        check("claim is not spammed", state()["claims"] - n <= 1, f"{n}->{state()['claims']}")

        # 3. home / non-channel pages are left alone
        d.get(BASE + "/")
        time.sleep(3)
        check("home page untouched", d.current_url.rstrip("/") == BASE)

        # 4. live goes offline -> automatic switch to another live
        d.get(BASE + "/alpha")
        time.sleep(1)
        post("/__offline/alpha")
        wait(lambda: "alpha" not in d.current_url, 30)
        check("switched to a live channel", any(s in d.current_url for s in ("bravo", "charlie")), d.current_url)
        time.sleep(1.5)
        shot(d, "auto-switch.png", (1100, 560))

        # 5. fallback list has priority + blocked list respected
        ext_storage(d, {"fallbackChannels": ["charlie"], "blockedChannels": ["bravo"]})
        d.get(BASE + "/bravo")
        time.sleep(1)
        post("/__offline/bravo")
        wait(lambda: "bravo" not in d.current_url, 30)
        check("favourite channel chosen first", d.current_url.endswith("/charlie"), d.current_url)

        # 6. log + counters recorded
        st = ext_storage(d)
        check("activity log + counters stored", st and len(st["log"]) >= 3 and st["switchCount"] >= 2 and st["claimedCount"] >= 1,
              f"log={len(st['log'])} switches={st['switchCount']} claims={st['claimedCount']}")

        # 7. toggle OFF -> stays put on an offline channel
        ext_storage(d, {"enabled": False})
        d.get(BASE + "/charlie")
        post("/__offline/charlie")
        time.sleep(5)
        check("OFF again: no switching", d.current_url.endswith("/charlie"), d.current_url)
    finally:
        d.quit()
    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


main()
