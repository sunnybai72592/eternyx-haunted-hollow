"""Write a local HTML contact sheet for the actual Wan training and evaluation windows."""
import argparse
import base64
from hashlib import sha256
from html import escape
from io import BytesIO
import json
from pathlib import Path
import tempfile
import os

import numpy as np
from PIL import Image

from prepare_training_frames import FPS, prepare_evaluation_frames, prepare_frames


def clip_card(row, window):
    frames = window["frames"]
    previews = []
    for index in (0, len(frames) // 2, len(frames) - 1):
        photo = Image.fromarray(frames[index]).resize((192, 112), Image.Resampling.LANCZOS)
        encoded = BytesIO()
        photo.save(encoded, format="PNG")
        data = base64.b64encode(encoded.getvalue()).decode("ascii")
        previews.append(f'<figure><img width="192" height="112" alt="Frame {index + 1}" '
                        f'src="data:image/png;base64,{data}"><figcaption>{index / FPS:g} s</figcaption></figure>')
    identical = sum(np.array_equal(a, b) for a, b in zip(frames, frames[1:]))
    question = row.get("quality_check")
    check = f"<p><b>Review question</b> {escape(question)}</p>" if question else ""
    return f"""<article><h3>{escape(window["scene"])}</h3><p>{escape(window["caption"])}</p>
<div class="frames">{''.join(previews)}</div>
<p>Identical adjacent frames: {identical} of {len(frames) - 1}</p>{check}
<details><summary>Source and permissions record</summary><p>{escape(row["file"])}</p>
<p>{escape(row["rights"])} · {escape(row["rights_ref"])}</p><code>{escape(window["sha256"])}</code></details></article>"""


def write_review(root, manifest_path, output):
    raw = manifest_path.read_bytes()
    manifest = json.loads(raw)
    rows = manifest["clips"]
    splits = {"train": ("Training", prepare_frames), "eval": ("Evaluation", prepare_evaluation_frames)}
    if not rows or any(row["split"] not in splits for row in rows):
        raise ValueError("Expected clips with training or evaluation splits")
    if output.exists():
        raise FileExistsError(output)
    # Stream cards to a private temporary file. Publish only after all clips decode.
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as stream:
        temp = Path(stream.name)
    try:
        with temp.open("w", encoding="utf-8") as stream:
            stream.write("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eternyx footage review</title><style>:root{color-scheme:light dark}body{font:1rem/1.5 system-ui;max-width:56rem;margin:2rem auto;padding:0 1rem}
.frames{display:flex;flex-wrap:wrap;gap:.75rem}figure{margin:0}img{max-width:100%;height:auto}article{padding:1rem 0;border-top:1px solid #888}
code{overflow-wrap:anywhere}summary,a{cursor:pointer}</style><main><h1>Footage review</h1>""")
            stream.write(f'<p>Manifest SHA-256 <code>{sha256(raw).hexdigest()}</code></p>')
            stream.write('<nav aria-label="Dataset splits"><a href="#train">Training</a> · <a href="#eval">Evaluation</a></nav>')
            for split, (title, decode) in splits.items():
                selected = [row for row in rows if row["split"] == split]
                stream.write(f'<section id="{split}"><h2>{title} ({len(selected)})</h2>')
                for row in selected:
                    stream.write(clip_card(row, decode(root, manifest, row["file"])))
                stream.write("</section>")
            stream.write("</main></html>")
        os.link(temp, output)
    finally:
        temp.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("clips", "manifest", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    write_review(args.clips, args.manifest, args.output)
