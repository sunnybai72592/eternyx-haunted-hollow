"""Build short real MP4 timelines on CPU from licensed local video and optional audio.

Unlike the 4-second frame-audit fixture, the v2 editor streams up to 30 seconds
through FFmpeg, without loading every RGB frame into process memory.
It is not an AI image/video generator.
"""
import argparse
from fractions import Fraction
import hashlib
from html import escape
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from assemble_video_storyboard import subtitle_time, unique_keys
from audit_video_render import png

FPS = 16
MAX_SHOTS = 8
MAX_FRAMES = 480
MAX_SOURCE_FRAMES = 960
MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_AUDIO_BYTES = 16 * 1024 * 1024
MAX_STORYBOARD_BYTES = 32 * 1024
MAX_RENDER_BYTES = 64 * 1024 * 1024
HASH = re.compile(r"[0-9a-f]{64}\Z")
PROFILES = {"landscape": (256, 144), "portrait": (144, 256), "square": (256, 256)}
SOURCE_KEYS = {"file", "source_sha256", "start_frame", "frames", "caption", "rights_ref"}
AUDIO_KEYS = {"file", "source_sha256", "rights_ref", "volume_percent"}


def execute(args, timeout=120):
    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Local FFmpeg/FFprobe failed or exceeded its CPU time limit") from error
    if proc.returncode:
        raise ValueError("Local FFmpeg/FFprobe rejected the media or operation")
    return proc.stdout


def read_board(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Storyboard must be a regular local JSON file")
    with path.open("rb") as stream:
        content = stream.read(MAX_STORYBOARD_BYTES + 1)
    if len(content) > MAX_STORYBOARD_BYTES:
        raise ValueError("Storyboard exceeds 32 KiB")
    board = json.loads(content, object_pairs_hook=unique_keys)
    if (not isinstance(board, dict) or type(board.get("version")) is not int or
            board["version"] != 2 or set(board) - {"version", "shots", "soundtrack"}):
        raise ValueError("Expected a v2 storyboard with shots and optional soundtrack")
    shots = board.get("shots")
    if not isinstance(shots, list) or not 1 <= len(shots) <= MAX_SHOTS:
        raise ValueError("Supply 1-8 video shots")
    return board, hashlib.sha256(content).hexdigest()


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_path(root, name, suffixes, size_limit):
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Media root must be an existing non-symlink directory")
    if (not isinstance(name, str) or len(name) == 0 or len(name) > 240 or
            "\\" in name or "\x00" in name or ":" in name or name.startswith("~")):
        raise ValueError("Media must have a safe relative local path")
    rel = Path(name)
    if (rel.is_absolute() or any(part in ("", ".", "..") for part in rel.parts) or
            rel.suffix.lower() not in suffixes):
        raise ValueError("Unsafe local media path or unsupported extension")
    path = root
    for part in rel.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError("Symlinked media paths are forbidden")
    if not path.is_file() or not 0 < path.stat().st_size <= size_limit:
        raise ValueError("Source media missing or exceeds allowed size")
    return path


def text_field(value, label):
    if (not isinstance(value, str) or not value.strip() or len(value) > 180 or
            any(ord(char) < 32 or ord(char) == 127 for char in value)):
        raise ValueError(f"{label} must be nonblank printable text (180 characters maximum)")
    return value


def hash_field(value):
    if not isinstance(value, str) or not HASH.fullmatch(value):
        raise ValueError("Source SHA-256 must be 64 lowercase hexadecimal characters")
    return value


def probe(path, *, count_frames=False):
    args = ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe"]
    if count_frames:
        args.append("-count_frames")
    args += ["-show_entries",
             "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames",
             "-of", "json", str(path)]
    try:
        data = json.loads(execute(args, timeout=90))
        if not isinstance(data, dict) or not isinstance(data.get("streams"), list):
            raise ValueError("Invalid local media metadata")
        return data["streams"]
    except (UnicodeError, TypeError, KeyError, json.JSONDecodeError) as error:
        raise ValueError("Invalid local media metadata") from error


def video_info(streams):
    videos = [item for item in streams if item.get("codec_type") == "video"]
    if len(videos) != 1:
        raise ValueError("Exactly one local video stream is required")
    item = videos[0]
    width, height = item.get("width"), item.get("height")
    if (type(width) is not int or type(height) is not int or
            not 16 <= width <= 512 or not 16 <= height <= 512 or width * height > 512 * 512):
        raise ValueError("Video dimensions must be at most 512x512")
    try:
        fps = Fraction(item["avg_frame_rate"])
        nominal = Fraction(item["r_frame_rate"])
        count = int(item.get("nb_read_frames") or item.get("nb_frames"))
    except (ValueError, KeyError, TypeError, ZeroDivisionError) as error:
        raise ValueError("Unverifiable frame count or frame rate") from error
    if fps != FPS or nominal != FPS or not 1 <= count <= MAX_SOURCE_FRAMES:
        raise ValueError("Source video must be CFR 16 FPS with 1-960 real frames")
    if item.get("nb_frames") not in (None, "N/A", "") and int(item["nb_frames"]) != count:
        raise ValueError("Declared frame count disagrees with decoded frames")
    return width, height, count


def check_shots(board, root):
    total = 0
    sources = {}
    validated = []
    for i, raw in enumerate(board["shots"]):
        if not isinstance(raw, dict) or set(raw) - (SOURCE_KEYS | {"fade_in_frames", "fade_out_frames"}) or not SOURCE_KEYS <= set(raw):
            raise ValueError("Shot requires file, digest, cut, caption and rights; optional fade frames")
        file = raw["file"]
        path = safe_path(root, file, {".mp4"}, MAX_SOURCE_BYTES)
        hash_field(raw["source_sha256"])
        if file not in sources:
            if sha256(path) != raw["source_sha256"]:
                raise ValueError("Source video SHA-256 disagrees with storyboard")
            width, height, count = video_info(probe(path, count_frames=True))
            sources[file] = (width, height, count)
        elif sha256(path) != raw["source_sha256"]:
            raise ValueError("Repeated source SHA-256 disagrees with storyboard")
        available = sources[file][2]
        start, frames = raw["start_frame"], raw["frames"]
        if (type(start) is not int or type(frames) is not int or
                start < 0 or not 1 <= frames <= MAX_FRAMES or start + frames > available):
            raise ValueError("Shot cut exceeds real available frames or is invalid")
        fades = []
        for field in ("fade_in_frames", "fade_out_frames"):
            value = raw.get(field, 0)
            if type(value) is not int or not 0 <= value <= min(16, frames // 2):
                raise ValueError("Shot fades must be 0-16 frames and <= half the cut duration")
            fades.append(value)
        text_field(raw["caption"], "Caption")
        text_field(raw["rights_ref"], "Rights reference")
        if total + frames > MAX_FRAMES:
            raise ValueError("Maximum timeline length is 480 frames (30 seconds)")
        validated.append({"index": i, "file": file, "source_sha256": raw["source_sha256"],
                          "start_frame": start, "frames": frames,
                          "fade_in_frames": fades[0], "fade_out_frames": fades[1],
                          "timeline_start_frame": total, "caption": raw["caption"],
                          "rights_ref": raw["rights_ref"], "path": path})
        total += frames
    return validated, total


def check_soundtrack(board, root):
    raw = board.get("soundtrack")
    if raw is None:
        return None
    if not isinstance(raw, dict) or set(raw) != AUDIO_KEYS:
        raise ValueError("Soundtrack requires file, digest, rights_ref and volume_percent")
    path = safe_path(root, raw["file"], {".wav", ".mp3", ".m4a"}, MAX_AUDIO_BYTES)
    hash_field(raw["source_sha256"])
    if sha256(path) != raw["source_sha256"]:
        raise ValueError("Soundtrack SHA-256 disagrees with storyboard")
    text_field(raw["rights_ref"], "Soundtrack rights reference")
    volume = raw["volume_percent"]
    if type(volume) is not int or not 0 <= volume <= 100:
        raise ValueError("Soundtrack volume_percent must be an integer from 0 to 100")
    streams = probe(path)
    if len([item for item in streams if item.get("codec_type") == "audio"]) != 1:
        raise ValueError("Exactly one audio stream is required for the soundtrack")
    return {**raw, "path": path}


def build_command(shots, total, destination, size, soundtrack):
    width, height = size
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
           "-filter_complex_threads", "1", "-threads", "1"]
    for shot in shots:
        cmd += ["-protocol_whitelist", "file,pipe", "-i", str(shot["path"])]
    if soundtrack is not None:
        cmd += ["-stream_loop", "-1", "-protocol_whitelist", "file,pipe",
                "-i", str(soundtrack["path"])]
    graph = []
    for i, shot in enumerate(shots):
        start, end = shot["start_frame"], shot["start_frame"] + shot["frames"]
        filters = [f"[{i}:v:0]trim=start_frame={start}:end_frame={end}",
                   "setpts=PTS-STARTPTS",
                   f"scale={width}:{height}:force_original_aspect_ratio=decrease",
                   f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                   "setsar=1", "format=yuv420p"]
        if shot["fade_in_frames"]:
            filters += [f"fade=t=in:st=0:d={shot['fade_in_frames']/FPS:.4f}"]
        if shot["fade_out_frames"]:
            remaining = (shot["frames"] - shot["fade_out_frames"]) / FPS
            filters += [f"fade=t=out:st={remaining:.4f}:d={shot['fade_out_frames']/FPS:.4f}"]
        graph.append(",".join(filters) + f"[shot{i}]")
    graph.append("".join(f"[shot{i}]" for i in range(len(shots))) +
                 f"concat=n={len(shots)}:v=1:a=0[outv]")
    if soundtrack is not None:
        duration = total / FPS
        graph.append(f"[{len(shots)}:a:0]atrim=duration={duration:.4f},asetpts=PTS-STARTPTS,"
                     f"volume={soundtrack['volume_percent']/100:.2f}[outa]")
    cmd += ["-filter_complex", ";".join(graph), "-map", "[outv]"]
    if soundtrack is None:
        cmd += ["-an"]
    else:
        cmd += ["-map", "[outa]", "-c:a", "aac", "-b:a", "96k"]
    cmd += ["-sn", "-dn", "-frames:v", str(total), "-r", str(FPS), "-t", f"{total/FPS:.4f}",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", str(destination)]
    return cmd


def verify_output(path, total, size, with_soundtrack):
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_RENDER_BYTES:
        raise ValueError("Rendered output missing or exceeds 64 MiB")
    streams = probe(path, count_frames=True)
    width, height, frames = video_info(streams)
    if (width, height) != size or frames != total:
        raise ValueError("Rendered dimensions or actual decoded frame count do not match timeline")
    if len([s for s in streams if s.get("codec_type") == "audio"]) != int(with_soundtrack):
        raise ValueError("Rendered audio streams do not match requested soundtrack")
    return {"sha256": sha256(path), "width": width, "height": height,
            "frame_count": frames, "fps": f"{FPS}/1",
            "duration_seconds": total / FPS, "audio": bool(with_soundtrack),
            "file_bytes": path.stat().st_size}


def srt(shots):
    chunks = []
    for i, shot in enumerate(shots, 1):
        start = shot["timeline_start_frame"]
        chunks.append(f'{i}\n{subtitle_time(start)} --> {subtitle_time(start + shot["frames"])}\n'
                      f'{shot["caption"]}\n')
    return "\n".join(chunks) + "\n"


def preview_frames(path, shots):
    # One decode pass, not an N-times-decode of 30 seconds for N thumbnails.
    selected = [shot["timeline_start_frame"] + shot["frames"] // 2 for shot in shots]
    expression = "+".join(f"eq(n\\,{frame})" for frame in selected)
    raw = execute(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-threads", "1",
                   "-protocol_whitelist", "file,pipe", "-i", str(path),
                   "-map", "0:v:0", "-vf",
                   f"select={expression},scale=160:90:force_original_aspect_ratio=decrease,"
                   "pad=160:90:(ow-iw)/2:(oh-ih)/2,setsar=1",
                   "-vsync", "0", "-an", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], timeout=90)
    frame_bytes = 160 * 90 * 3
    if len(raw) != frame_bytes * len(selected):
        raise ValueError("Could not verify each rendered shot preview frame")
    # PNG conversion stays offline and is bounded to one 160x90 preview per shot.
    return [png(raw[i * frame_bytes:(i + 1) * frame_bytes], 160, 90)
            for i in range(len(selected))]


def html(shots, previews, video):
    cards = []
    for shot, preview in zip(shots, previews):
        cards.append(
            f'<article><h2>Shot {shot["index"] + 1}: {escape(shot["caption"])}</h2>'
            f'<img alt="Rendered shot" src="data:image/png;base64,{preview}">'
            f'<p>Frames {shot["timeline_start_frame"]}-'
            f'{shot["timeline_start_frame"] + shot["frames"] - 1} '
            f'· Fade in/out {shot["fade_in_frames"]}/{shot["fade_out_frames"]} frames'
            f' · Source {escape(shot["file"])} · Rights {escape(shot["rights_ref"])}</p></article>')
    return ("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Eternyx offline CPU video timeline</title><style>:root{color-scheme:light dark}
body{font:1rem/1.5 system-ui;max-width:64rem;margin:2rem auto;padding:0 1rem}
article{padding:1rem 0;border-bottom:1px solid #777}img{max-width:100%;height:auto}p{overflow-wrap:anywhere}</style>
<main><h1>Locally assembled MP4 timeline</h1><p>Real footage and optional licensed sound.
Audio, captions and source footage were provided by the operator; none were synthesized by AI.
Hard cuts with optional fade-to/from-black. The preview requires no web services.</p>
""" + "".join(cards) + f'<p>{video["frame_count"]} frames at 16 FPS. '
        + 'See <a href="manifest.json">signed-off input/output digests</a> and '
          '<a href="captions.srt">editable subtitles</a>.</p></main></html>\n')


def render(storyboard, root, output, profile="landscape", quality="standard"):
    if profile not in PROFILES or quality not in ("standard", "high"):
        raise ValueError("Output profile and quality must be supported presets")
    factor = 2 if quality == "high" else 1
    size = tuple(value * factor for value in PROFILES[profile])
    board, board_hash = read_board(storyboard)
    shots, total = check_shots(board, root)
    soundtrack = check_soundtrack(board, root)
    if output.exists() or output.is_symlink():
        raise ValueError("Output directory already exists; no overwriting")
    if output.parent.is_symlink() or not output.parent.is_dir():
        raise ValueError("Output parent must be an existing non-symlink directory")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-v2-", dir=output.parent))
    try:
        video_path = stage / "video.mp4"
        execute(build_command(shots, total, video_path, size, soundtrack), timeout=120)
        video = verify_output(video_path, total, size, soundtrack is not None)
        public_shots = [{key: value for key, value in shot.items() if key != "path"} for shot in shots]
        audio = None if soundtrack is None else {key: value for key, value in soundtrack.items() if key != "path"}
        receipt = {"version": 2, "type": "local CPU video editing",
                   "storyboard_sha256": board_hash, "video": video,
                   "profile": profile, "quality": quality,
                   "total_frames": total, "shots": public_shots,
                   "soundtrack": audio, "captions": "captions.srt", "model_generation": False}
        (stage / "captions.srt").write_text(srt(shots), encoding="utf-8")
        (stage / "manifest.json").write_text(json.dumps(receipt, indent=2, allow_nan=False) + "\n",
                                              encoding="utf-8")
        images = preview_frames(video_path, shots)
        (stage / "preview.html").write_text(html(shots, images, video), encoding="utf-8")
        if output.exists() or output.is_symlink():
            raise ValueError("Output directory appeared while rendering; refusing overwrite")
        stage.rename(output)
        return receipt
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storyboard", type=Path, required=True)
    parser.add_argument("--media", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", choices=list(PROFILES), default="landscape")
    parser.add_argument("--quality", choices=["standard", "high"], default="standard")
    args = parser.parse_args()
    try:
        result = render(args.storyboard, args.media, args.output, args.profile, args.quality)
        print(json.dumps({"output": str(args.output), "frames": result["total_frames"],
                          "video_sha256": result["video"]["sha256"],
                          "audio": result["video"]["audio"]}))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
