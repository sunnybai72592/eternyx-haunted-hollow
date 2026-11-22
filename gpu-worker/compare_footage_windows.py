"""Preview candidate offsets for a single reviewed local clip."""
import argparse
import base64
from html import escape
import json
from pathlib import Path

import numpy as np

from prepare_training_frames import FPS, IncompleteWindow, prepare_evaluation_frames, prepare_frames
from review_training_footage import clip_card


def candidate_page(root, manifest, filename, starts):
    matches = [row for row in manifest["clips"] if row["file"] == filename]
    if len(matches) != 1:
        raise ValueError("Select one clip by its exact manifest path")
    if not starts or len(set(starts)) != len(starts):
        raise ValueError("Provide distinct start frames")
    source = matches[0]
    decode = {"train": prepare_frames, "eval": prepare_evaluation_frames}[source["split"]]
    sections = []
    for start in starts:
        selected = {**source, "start_frame": start}
        candidate = {**manifest, "clips": [selected if row is source else row for row in manifest["clips"]]}
        heading = f"<h2>Frame {start} · {start / FPS:g} s</h2>"
        try:
            window = decode(root, candidate, filename)
        except IncompleteWindow:
            sections.append(heading + "<p>Too few frames remain for a complete window.</p>")
            continue
        frames = window["frames"].astype(np.int16)
        change = np.abs(np.diff(frames, axis=0)).mean()
        payload = json.dumps(candidate, ensure_ascii=False, indent=2).encode("utf-8")
        link = base64.b64encode(payload).decode("ascii")
        sections.append(heading + clip_card(selected, window)
                        + f"<p>Mean adjacent-frame RGB change: {change:.2f} / 255</p>"
                        + f'<a download="dataset-frame-{start}.json" href="data:application/json;base64,{link}">'
                          'Save manifest with this window</a>')
    return f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compare footage windows</title><style>:root{{color-scheme:light dark}}body{{font:1rem/1.5 system-ui;max-width:54rem;margin:2rem auto;padding:0 1rem}}
.frames{{display:flex;gap:.7rem;flex-wrap:wrap}}figure{{margin:0}}img{{max-width:100%;height:auto}}code{{overflow-wrap:anywhere}}
h2{{border-top:1px solid #888;padding-top:1rem}}</style><main><h1>Compare footage windows</h1>
<p>{escape(filename)} · Current start frame {source.get("start_frame", 0):d}</p>
<p>Compare the action with the caption before saving a window. RGB change measures differences between consecutive frames.</p>
{''.join(sections)}</main></html>"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clips", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("file")
    parser.add_argument("output", type=Path)
    parser.add_argument("--starts", type=int, nargs="+", required=True)
    args = parser.parse_args()
    page = candidate_page(args.clips, json.loads(args.manifest.read_bytes()), args.file, args.starts)
    with args.output.open("x", encoding="utf-8") as stream:
        stream.write(page)
