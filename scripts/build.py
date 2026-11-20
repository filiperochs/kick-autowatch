"""Build the extension.

  python scripts/build.py          -> dist/kick-autowatch-<version>.xpi  (production)
  python scripts/build.py --test   -> dist-test/ (unpacked, extra localhost match + fast timers)
"""
import json, shutil, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"


def main():
    test = "--test" in sys.argv
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))

    if test:
        out = ROOT / "dist-test"
        shutil.rmtree(out, ignore_errors=True)
        shutil.copytree(SRC, out)
        extra = ["http://127.0.0.1/*"]
        manifest["permissions"] += extra
        manifest["content_scripts"][0]["matches"] += extra
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        with (out / "selectors.js").open("a", encoding="utf-8") as f:
            f.write(
                "\nObject.assign(window.KAW_CFG, {tickMs:400, liveCheckMs:800, claimScanMs:800,"
                " triggerCooldownMs:60000, offlineChecksBeforeSwitch:2});\n"
            )
        with (out / "selectors.js").open("a", encoding="utf-8") as f:
            f.write("window.KAW_CFG.reservedPaths.add('hook');window.KAW_CFG.reservedPaths.add('__popup');\n")
        with (out / "background.js").open("a", encoding="utf-8") as f:
            f.write("\nbrowser.runtime.onMessage.addListener((m) => m && m.type === 'test-open-popup' &&"
                    " browser.tabs.create({ url: browser.runtime.getURL('popup/popup.html') }));\n")
        with (out / "content.js").open("a", encoding="utf-8") as f:
            f.write("\nwindow.addEventListener('message', async (e) => { const t = e.data && e.data.kawTest; if (!t) return;"
                    " if (t === 'set') await browser.storage.local.set(e.data.data);"
                    " window.postMessage({ kawResult: await browser.storage.local.get(null) }, '*'); });\n")
        print("test build ->", out)
        return

    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    xpi = out / f"kick-autowatch-{manifest['version']}.xpi"
    with zipfile.ZipFile(xpi, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(SRC.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(SRC).as_posix())
    print("built", xpi)


main()
