"""Tiny fake Kick used to test the extension end-to-end (no network, no account)."""
import json, threading
from pathlib import Path

SRC = (Path(__file__).resolve().parent.parent / "src").resolve()
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"offline": set(), "claims": 0, "case_claims": 0, "visits": []}
CHANNELS = {"alpha": 900, "bravo": 500, "charlie": 100}

PAGE = """<!doctype html><html><head><title>{slug} - Kick (mock)</title><style>
body{{font:14px sans-serif;background:#111;color:#eee;margin:0}} header{{display:flex;gap:12px;padding:10px;background:#1b1f20}}
#dlg{{position:fixed;top:80px;right:20px;background:#222;padding:16px;border:1px solid #53fc18;width:260px}}
video{{width:640px;height:360px;background:#000}}</style></head><body>
<header><b>KICK (mock)</b><button aria-label="Resgate sua recompensa" aria-haspopup="dialog" id="case">&#127873;</button>
<button id="sub">Subscribe</button><span>avatar</span></header>
<main><h2>{slug}</h2><video id="v" muted loop></video>{offline}</main>
<script>
/* mimics the real kick.com rewards dialog: carousel [Sunset Reward Case (locked) -> Daily Reward (claimable)] */
document.getElementById('case').onclick=()=>{{
  if(document.getElementById('dlg'))return;
  const d=document.createElement('div');d.id='dlg';d.setAttribute('role','dialog');
  d.style.cssText='position:fixed;top:80px;right:20px;background:#222;padding:16px;border:1px solid #53fc18;width:300px';
  d.innerHTML='<h3>Resgate suas recompensas</h3><button aria-label="Close">x</button>'+
   '<div id="s1"><b>Sunset Reward Case</b><p>Watch any stream for 3 hours</p><button aria-disabled="true">Resgatar</button><p>Assista por mais 44 minutos para resgatar.</p></div>'+
   '<div id="s2" style="display:none"><b>Daily Reward</b><p>Claim your Daily Reward</p><button id="claim">Resgatar</button></div>'+
   '<button aria-label="Próxima recompensa" id="nx">&gt;</button>';
  document.body.append(d);
  d.querySelector('#nx').onclick=()=>{{d.querySelector('#s1').style.display='none';d.querySelector('#s2').style.display='block';}};
  d.querySelector('#claim').onclick=()=>{{fetch('/__claim',{{method:'POST'}});const c=d.querySelector('#claim');c.textContent='Ver';c.id='';}};
  d.querySelector('[aria-label=Close]').onclick=()=>d.remove();
}};
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, ctype="application/json", code=200):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        if self.path == "/__claim":
            STATE["claims"] += 1
        elif self.path.startswith("/__offline/"):
            STATE["offline"].add(self.path.rsplit("/", 1)[1])
        self.send("{}")

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/__state":
            return self.send(json.dumps({**STATE, "offline": sorted(STATE["offline"])}))
        if p.startswith("/api/v2/channels/"):
            slug = p.rsplit("/", 1)[1]
            live = slug in CHANNELS and slug not in STATE["offline"]
            return self.send(json.dumps({"slug": slug, "livestream": {"is_live": True} if live else None}))
        if p.startswith("/stream/featured-livestreams/"):
            data = [{"is_live": True, "viewers": v, "channel": {"slug": s}}
                    for s, v in CHANNELS.items() if s not in STATE["offline"]]
            return self.send(json.dumps({"data": data}))
        if p.startswith("/__src/"):
            f = (SRC / p[len("/__src/"):]).resolve()
            if SRC in f.parents and f.is_file():
                ct = {".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml"}.get(f.suffix, "text/html")
                return self.send(f.read_bytes(), ct)
            return self.send("", "text/plain", 404)
        if p == "/__popup":
            return self.send((Path(__file__).parent / "popup_harness.html").read_text(encoding="utf-8"), "text/html")
        slug = p.strip("/").split("/")[0]
        if slug == "":
            return self.send("<title>home</title><h1>Home (mock)</h1>", "text/html")
        STATE["visits"].append(slug)
        off = "<h3>Channel is offline</h3>" if slug in STATE["offline"] else ""
        self.send(PAGE.format(slug=slug, offline=off), "text/html")


def start(port=8765):
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == "__main__":
    start()
    input("mock on :8765, enter to stop")
