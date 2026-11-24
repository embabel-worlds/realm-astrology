"""
The realm's battery, against a live appliance with realm-astrology installed. Keyless: the realm
computes its charts itself, and the ground truth is NASA JPL Horizons, which needs no key.

    APPLIANCE=http://127.0.0.1:11043 AUTH=user:pass sh tests/verify.sh

  L1  every view answers BY NAME on its defaults. The "yours" views read stored BirthRecords, and
      a fresh world has none, so they must answer empty or be refused for want of a stored
      record.
  L2  the positions reconcile with NASA, asked DIRECTLY here rather than through the realm's own
      audit verb: Sun, Moon and Mars at the default sky instant, within the realm's stated
      one-arcminute tolerance; and the realm's own audit reports all ten bodies agreeing.
  L3  the one pushdown: `WHERE c.body = 'Mars'` on VERIFIED_BY reaches the verb, so one body is
      audited, not ten. Read fresh, so a cached audit cannot pass it.
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ left in the checkout under test
sys.path.insert(0, str(Path(__file__).resolve().parent))
from battery_common import check, finish, invoke, kg, problem, sweep, yaml_view_names  # noqa: E402

sweep(yaml_view_names(),
      may_be_empty={"MyChart", "MyPlacements", "MyTransits", "MyReading", "PeopleIKeep", "BirthdaysComing"})

print("== L2: positions against NASA JPL Horizons, asked directly")
INSTANT = "2026-10-03T12:00:00Z"
HORIZONS_ID = {"Sun": "10", "Moon": "301", "Mars": "499"}
res = kg(f"MATCH (s:SkyMoment {{instant: '{INSTANT}'}})-[:HAS_POSITION]->(p:SkyPosition) "
         "RETURN p.body AS body, p.longitude AS lon")
ours = {r["body"]: r["lon"] for r in res.get("rows") or []}
check("SkyAtMoment has all ten bodies", len(ours) == 10, f"{sorted(ours)}")


def horizons(body_id):
    q = {"format": "json", "COMMAND": f"'{body_id}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
         "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'", "START_TIME": "'2026-Oct-03 12:00:00'",
         "STOP_TIME": "'2026-Oct-03 12:01:00'", "STEP_SIZE": "'1 m'", "QUANTITIES": "'31'",
         "CAL_FORMAT": "'CAL'", "ANG_FORMAT": "'DEG'"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    text = json.load(urllib.request.urlopen(url, timeout=60))["result"]
    block = text[text.index("$$SOE") + 5:text.index("$$EOE")]
    return float(block.strip().splitlines()[0].split()[-2])  # the 12:00 row's ecliptic longitude


for body, hid in HORIZONS_ID.items():
    nasa = horizons(hid)
    got = ours.get(body)
    off = None if got is None else abs(((got - nasa + 540) % 360) - 180) * 3600
    check(f"{body} longitude agrees with Horizons within 60\"", off is not None and off <= 60,
          f"realm {got}, NASA {nasa:.6f}, {off if off is None else round(off, 2)}\"")

env = invoke("AuditAgainstNasa")
rows = env.get("data") or []
check("AuditAgainstNasa: ten bodies audited", len(rows) == 10 and not problem(env), problem(env) or f"{len(rows)} rows")
disagree = [r for r in rows if r.get("agrees") is not True]
check("AuditAgainstNasa: every body agrees", rows and not disagree, json.dumps(disagree)[:300])

print("== L3: a one-body audit asks NASA about one body")
SPEC = "1962-05-17T14:30|51.5074,-0.1278|Europe/London"
res = kg(f"MATCH (b:BirthMoment {{spec: '{SPEC}'}})-[:VERIFIED_BY {{ai: {{fresh: true}}}}]->(c:NasaCheck) "
         "WHERE c.body = 'Mars' RETURN c.body AS body, c.agrees AS agrees")
rows = res.get("rows") or []
check("Mars only, fresh", [r.get("body") for r in rows] == ["Mars"], json.dumps(res)[:300] if not rows else "")
# The verb is one call either way; the pushdown is what that call carries. The call log records the
# rendered filter, so a pushed body shows on the call, and an unpushed one asks for all ten.
log = res.get("apiCallLog") or []
check("one nasaChecks call, asked for Mars only", len(log) == 1 and log[0].startswith("nasaChecks(") and log[0].rstrip().endswith("Mars"),
      f"apiCallLog={log}")

finish()
