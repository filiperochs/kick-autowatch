"""Interactive Firefox session on the REAL kick.com using a dedicated profile (.test-profile).

Command channel: write a line to <ctl>/cmd.txt, read the answer from <ctl>/out.txt.
 commands: goto <url> | enable | disable | dump | claim | log | shot <name> | url | quit
"""
import json, subprocess, sys, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

ROOT = Path(__file__).resolve().parent.parent
CTL = Path(sys.argv[1]); CTL.mkdir(parents=True, exist_ok=True)
CMD, OUT = CTL / "cmd.txt", CTL / "out.txt"


def say(x):
    OUT.write_text(str(x), encoding="utf-8")


subprocess.run([sys.executable, str(ROOT / "scripts/build.py"), "--live"], check=True)
o = Options()
o.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
o.set_preference("browser.startup.page", 3)  # keep session cookies/tabs across restarts
o.add_argument("-profile"); o.add_argument(str(ROOT / ".test-profile"))
d = webdriver.Firefox(options=o)
d.install_addon(str(ROOT / "dist-live"), temporary=True)
d.get("https://kick.com")
say("ready")


def hook(msg):
    d.execute_script(
        "window.__r=null; window.addEventListener('message',e=>{if(e.data&&e.data.kawResult)window.__r=e.data.kawResult});"
        "window.postMessage(arguments[0], '*')", msg)
    for _ in range(40):
        r = d.execute_script("return window.__r")
        if r: return r
        time.sleep(0.25)
    return "no answer from content script"


while True:
    if not CMD.exists():
        time.sleep(0.5); continue
    line = CMD.read_text(encoding="utf-8").strip(); CMD.unlink()
    try:
        c, _, a = line.partition(" ")
        if c == "quit": break
        elif c == "goto": d.get(a); time.sleep(4); say(d.current_url)
        elif c == "reload":  # rebuild + reinstall the extension in the running browser (keeps login)
            subprocess.run([sys.executable, str(ROOT / "scripts/build.py"), "--live"], check=True)
            d.install_addon(str(ROOT / "dist-live"), temporary=True); d.refresh(); time.sleep(4); say("reloaded")
        elif c == "eval": say(json.dumps(d.execute_script("return (" + a + ")"), ensure_ascii=False, indent=1))
        elif c == "url": say(d.current_url + " | " + d.title)
        elif c in ("enable", "disable"):
            r = hook({"kawTest": "set", "data": {"enabled": c == "enable"}}); say(r["storage"]["enabled"] if isinstance(r, dict) else r)
        elif c == "dump": say(json.dumps(hook({"kawTest": "dump"}), indent=1, ensure_ascii=False))
        elif c == "claim": r = hook({"kawTest": "claim"}); say(json.dumps(r["storage"].get("log", [])[-8:], ensure_ascii=False) if isinstance(r, dict) else r)
        elif c == "log": r = hook({"kawTest": "get"}); say(json.dumps(r["storage"].get("log", [])[-15:], ensure_ascii=False) if isinstance(r, dict) else r)
        elif c == "shot": d.save_screenshot(str(CTL / f"{a or 'shot'}.png")); say("saved")
        else: say("unknown command")
    except Exception as e:
        say(f"ERROR {type(e).__name__}: {e}")
d.quit()
