"""Generate packages/scenario-runner/scenarios/media-animation-sound-cutscene.json.

Synthetic phase-4 scenario (all names and texts invented for the project).
Run from the project root: python -I tools/scenarios/gen-media-scenario.py
"""
import io
import json


def rect(x, y, w, h):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def eq(v, c):
    return {"eq": [{"var": v}, {"const": c}]}


def chain(name, nodes, modal=False):
    """An entry followed by `nodes` in sequence."""
    ids = [f"{name}_{i}" for i in range(len(nodes))]
    out = [{"id": f"{name}_e", "type": "entry", "name": name, "modal": modal, "next": [ids[0]]}]
    for i, n in enumerate(nodes):
        n = dict(n)
        n["id"] = ids[i]
        n["next"] = [ids[i + 1]] if i + 1 < len(nodes) else []
        out.append(n)
    return out


def setv(v):
    return {"type": "set", "var": v, "value": True}


def tl(*frames):
    return [{"atMs": t, "textKey": k} for t, k in frames]


g = []
g += chain("anim_finite", [{"type": "play_animation", "entity": "hero", "animation": "wave"}, setv("wave_done")])
g += chain("anim_loop", [{"type": "play_animation", "entity": "hero", "animation": "idle"}, setv("idle_done")])
g += chain("anim_timeout", [{"type": "play_animation", "entity": "hero", "animation": "slow"}, setv("slow_done")])
g += chain("sound_finite", [{"type": "sound_play", "entity": "owl", "sound": "chirp", "times": 2}, setv("chirp_done")])
g += chain("sound_loops", [
    {"type": "sound_play", "entity": "hall", "sound": "hum", "times": "loop"},
    {"type": "sound_play", "entity": "hall", "sound": "theme", "times": "loop"},
    setv("loops_started"),
])
g += chain("hum_only", [{"type": "sound_play", "entity": "hall", "sound": "hum", "times": "loop"}])
g += chain("stop_hum", [{"type": "sound_stop", "entity": "hall", "sound": "hum"}, {"type": "sound_stop", "entity": "hall", "sound": "hum"}])
g += chain("doomed", [
    {"type": "sound_play", "entity": "owl", "sound": "chirp", "times": "loop"},
    {"type": "play_animation", "entity": "hero", "animation": "slow"},
    setv("doomed_done"),
])
g += chain("doomed_cut", [{"type": "cutscene", "name": "longone"}, setv("long_done")])
g += chain("cut_intro", [{"type": "cutscene", "name": "intro"}, setv("intro_done")])
g += chain("cut_storm", [{"type": "cutscene", "name": "storm"}, setv("storm_done")])
g += chain("cut_finale", [{"type": "cutscene", "name": "finale"}, setv("finale_done")])
g += chain("clear", [{"type": "cutscene_clear"}])
g += chain("leave", [{"type": "portal_use", "portal": "p_out"}], modal=True)

owl = [
    {"id": "owl_e", "type": "entry", "name": "main", "next": ["owl_g"]},
    {"id": "owl_g", "type": "guard", "expr": eq("$action", "signal"), "next": ["owl_s"]},
    {"id": "owl_s", "type": "set", "var": "owl_heard", "value": True, "next": []},
]

content = {
    "game": {"id": "media-test", "version": "0.0.1", "formatVersion": 1, "languages": ["da", "en"], "defaultLanguage": "da",
             "player": {"actor": "hero"}, "entry": None, "globals": {}},
    "scenes": [
        {"id": "hall", "nameKey": "s.hall", "size": {"width": 1280, "height": 720}, "entry": None, "walkSpeed": 400,
         "spots": {"a": {"x": 200, "y": 650}, "door": {"x": 1200, "y": 650}}, "defaultSpot": "a",
         "walkable": [rect(0, 600, 1280, 120)],
         "sounds": {"hum": "s.hum", "theme": "s.theme"},
         "cutscenes": {
             "intro": {"variants": {"da": {"timeline": tl((0, "c.da1"), (300, "c.da2")), "durationMs": 1500},
                                    "default": {"timeline": tl((0, "c.def")), "durationMs": 1500}},
                       "skippable": True, "skipAfterMs": 1000},
             "storm": {"variants": {"sv": {"timeline": tl((0, "c.sv")), "durationMs": 200}}},
             "finale": {"variants": {"default": {"timeline": tl((0, "c.f1"), (100, "c.f2")), "durationMs": 400}}, "hold": True},
             "longone": {"variants": {"default": {"timeline": tl((0, "c.long")), "durationMs": 5000}}},
         }},
        {"id": "yard", "nameKey": "s.yard", "size": {"width": 1280, "height": 720}, "entry": None,
         "spots": {"b": {"x": 100, "y": 650}}, "defaultSpot": "b", "walkable": [rect(0, 600, 1280, 120)]},
    ],
    "portals": [
        {"id": "p_out", "from": "hall", "to": "yard", "entry": None, "exitSpot": "door", "arrivalSpot": "b"},
        {"id": "p_in", "from": "yard", "to": "hall", "entry": None, "exitSpot": "b", "arrivalSpot": "a"},
    ],
    "actors": [
        {"id": "hero", "nameKey": "a.hero", "scene": "hall", "spot": "a", "entry": None,
         "variants": {"default": {"animations": {"wave": "a.wave", "idle": "a.idle", "slow": "a.slow", "march": "a.march"}}}},
        {"id": "owl", "nameKey": "a.owl", "scene": "hall", "spot": "a", "entry": "owl#main", "sounds": {"chirp": "s.chirp"},
         "variants": {"default": {}}},
    ],
    "animations": [
        {"id": "a.wave", "atlas": "atlas.hero", "instructions": [{"op": "fps", "n": 10}, {"op": "play", "from": 0, "to": 3},
                                                                 {"op": "signal", "entity": "owl", "name": "hello"}, {"op": "wait", "frames": 1}]},
        {"id": "a.idle", "atlas": "atlas.hero", "instructions": [{"op": "fps", "n": 10}, {"op": "frame", "n": 4}, {"op": "loopRange", "from": 4, "to": 6}]},
        {"id": "a.slow", "atlas": "atlas.hero", "instructions": [{"op": "fps", "n": 5}, {"op": "play", "from": 0, "to": 9}], "maxDuration": 500},
        {"id": "a.march", "atlas": "atlas.hero", "instructions": [{"op": "signal", "entity": "owl", "name": "early"}, {"op": "fps", "n": 10},
                                                                  {"op": "play", "from": 0, "to": 1}, {"op": "signal", "entity": "owl", "name": "late"}]},
    ],
    "sounds": [
        {"id": "s.hum", "asset": "snd.hum", "channel": "ambient", "durationMs": 1000},
        {"id": "s.theme", "asset": "snd.theme", "channel": "music", "durationMs": 4000, "persistAcrossScenes": True},
        {"id": "s.chirp", "asset": "snd.chirp", "channel": "sfx", "durationMs": 300},
    ],
    "graphs": [{"id": "g", "kind": "logic", "nodes": g}, {"id": "owl", "kind": "logic", "nodes": owl}],
    "i18n": {
        "da": {"s.hall": "Hal", "s.yard": "Gård", "a.hero": "Helt", "a.owl": "Ugle", "c.da1": "Først", "c.da2": "Så",
               "c.def": "Neutral", "c.sv": "Svensk", "c.f1": "Slut 1", "c.f2": "Slut 2", "c.long": "Lang"},
        "en": {"s.hall": "Hall", "s.yard": "Yard", "a.hero": "Hero", "a.owl": "Owl", "c.da1": "First", "c.da2": "Then",
               "c.def": "Neutral", "c.sv": "Swedish", "c.f1": "End 1", "c.f2": "End 2", "c.long": "Long"},
    },
}

S = []


def do(op, **k):
    S.append({"do": op, **k})


def ex(op, **k):
    S.append({"expect": op, **k})


do("newGame")
ex("warning", code="W-ANIM-DURATION", phase="validation", note="a.slow varer 2000 ms, men maxDuration er 500")
# Finite animation with a signal
do("run", entry="g#anim_finite")
ex("animation", entity="hero", name="wave", status="playing", frame=0)
ex("mediaPending", count=1)
do("advance", ms=399)
ex("signalCount", entity="owl", name="hello", count=0)
ex("globals", lacks=["wave_done"])
do("advance", ms=1)
ex("signalCount", entity="owl", name="hello", count=1)
ex("globals", equals={"owl_heard": True}, lacks=["wave_done"], note="signalet blokerer ikke animationen")
do("advance", ms=100)
ex("globals", equals={"wave_done": True})
ex("animation", entity="hero", none=True)
ex("mediaPending", count=0)
ex("signalCount", entity="owl", name="hello", count=1)
# Loop animation
do("run", entry="g#anim_loop")
ex("globals", equals={"idle_done": True}, note="loop: Done, så snart loopet er etableret (TS-F04)")
ex("animation", entity="hero", name="idle", status="looping", frame=4)
do("advance", ms=250)
ex("animation", entity="hero", name="idle", status="looping", frame=6)
ex("mediaPending", count=0)
# Silent seek
do("seekAnimation", entity="hero", animation="march", at=1, note="startAt(1): signalet 'early' springes stille over (TS-F03)")
do("advance", ms=1000)
ex("signalCount", entity="owl", name="early", count=0)
ex("signalCount", entity="owl", name="late", count=1)
# maxDuration timeout
do("run", entry="g#anim_timeout")
do("advance", ms=499)
ex("globals", lacks=["slow_done"])
do("advance", ms=1)
ex("warning", code="W-COMMAND-TIMEOUT", note="TS-F01: maxDuration bruges som timeout")
ex("globals", equals={"slow_done": True})
ex("animation", entity="hero", none=True)
ex("mediaPending", count=0)
# Finite sound
do("run", entry="g#sound_finite")
do("advance", ms=599)
ex("globals", lacks=["chirp_done"])
do("advance", ms=1)
ex("globals", equals={"chirp_done": True}, note="to gentagelser à 300 ms, ét svar")
# Loop sounds and stop
do("run", entry="g#sound_loops")
ex("globals", equals={"loops_started": True}, note="loop-lyd fuldføres straks (TS-F04)")
ex("sounds", equals=["hall:hum", "hall:theme"])
do("run", entry="g#stop_hum")
ex("sounds", equals=["hall:theme"], fading=1, note="anden sound_stop er en sikker no-op")
do("advance", ms=500)
ex("sounds", fading=0)
do("run", entry="g#hum_only")
# Cancellation
do("run", entry="g#doomed")
ex("sounds", equals=["hall:theme", "hall:hum", "owl:chirp"])
ex("mediaPending", count=1)
do("cancelRuns", reason="scenario")
ex("sounds", equals=["hall:theme", "hall:hum"])
ex("animation", entity="hero", none=True)
ex("mediaPending", count=0)
do("advance", ms=1000)
ex("globals", lacks=["doomed_done"])
ex("idle")
do("run", entry="g#doomed_cut")
ex("modal", value=True)
ex("cutscene", state="playing", name="longone")
do("cancelRuns", reason="scenario")
ex("modal", value=False)
ex("cutscene", state="idle")
ex("mediaPending", count=0)
do("advance", ms=6000)
ex("globals", lacks=["long_done"], note="TS-F02: intet sent svar efter annullering")
ex("idle")
# Cutscenes: language, skip, fallback, hold and clear
do("run", entry="g#cut_intro")
ex("modal", value=True)
ex("cutscene", state="playing", name="intro", variant="da", frame=0)
do("advance", ms=300)
ex("cutscene", frame=1)
do("skipCutscene", expectSkipped=False, note="før skipAfterMs ignoreres skip")
do("advance", ms=700)
do("skipCutscene", expectSkipped=True)
ex("cutscene", state="idle")
ex("globals", equals={"intro_done": True})
ex("modal", value=False)
do("setLanguage", language="en")
do("run", entry="g#cut_intro")
ex("cutscene", state="playing", variant="default", note="en mangler → default (TS-F06)")
do("advance", ms=1500)
ex("cutscene", state="idle")
ex("modal", value=False)
do("run", entry="g#cut_storm")
ex("warning", code="W-CUTSCENE-LANG", note="hverken en eller default → første variant + advarsel (TS-F06)")
ex("cutscene", variant="sv")
do("advance", ms=200)
ex("globals", equals={"storm_done": True})
do("run", entry="g#cut_finale")
do("advance", ms=400)
ex("globals", equals={"finale_done": True})
ex("cutscene", state="held", name="finale", frame=1)
ex("modal", value=False)
do("run", entry="g#clear")
ex("cutscene", state="idle")
# Scene exit: ambient loop stops, persistent music stays (TS-F05)
do("run", entry="g#leave")
do("runUntilIdle")
ex("actorScene", actor="hero", equals="yard")
ex("sounds", equals=["hall:theme"], note="TS-F05: hum fader ud; theme (persistAcrossScenes) overlever")
do("advance", ms=500)
ex("sounds", fading=0)
ex("idle")
ex("mediaPending", count=0)
ex("modal", value=False)
do("newGame")
ex("sounds", equals=[])
ex("cutscene", state="idle")

scenario = {
    "scenario": "media-animation-sound-cutscene",
    "description": "Fase 4: finite/loop-animation, signal, stille seek, timeout, finite/loop-lyd, stop, annullering, "
                   "cutscene-sprogvalg, skip, hold/clear og sceneoprydning af loop-lyde. Syntetisk.",
    "covers": ["TS-F01", "TS-F02", "TS-F03", "TS-F04", "TS-F05", "TS-F06"],
    "harness": "media-headless",
    "content": content,
    "steps": S,
}

with io.open("packages/scenario-runner/scenarios/media-animation-sound-cutscene.json", "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(scenario, ensure_ascii=False, indent=1) + "\n")
print(len(S), "steps")
