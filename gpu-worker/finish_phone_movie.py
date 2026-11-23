"""Finish a real offline H264 movie from privately bundled phone footage.

Requires explicit human-written captions and actual recording/usage-rights
references for every original. No automatic AI-generated content, GPU, remote
API, pip dependency, model downloads, or browser-side Python execution.

python3 finish_phone_movie.py --check
python3 finish_phone_movie.py --run
"""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

import launch_phone_intake as intake
import render_video_timeline as renderer
from assemble_video_storyboard import unique_keys

ROOT = Path(__file__).resolve().parent
PLAN_NAME = "phone-movie-plan.json"
OUTPUT = "phone-movie-output"
MAX_PLAN_BYTES = 32768
PROFILES = {"landscape", "portrait", "square"}
QUALITIES = {"standard", "high"}
DELIVERIES = {"mp4", "mp4_with_subtitles", "mp4_webm", "all"}


def extra_outputs(mode):
    return (mode in ("mp4_webm", "all"), mode in ("mp4_with_subtitles", "all"))


def verified_variant(path, expected_codec, frames, size, subtitles=False):
    """Decode/count the real output and independently verify stream codecs."""
    result = renderer.verify_output(path, frames, size, False)
    streams = json.loads(renderer.execute([
        "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name",
        "-of", "json", str(path),
    ], timeout=30))["streams"]
    videos = [s for s in streams if s.get("codec_type") == "video"]
    subs = [s for s in streams if s.get("codec_type") == "subtitle"]
    if (len(videos) != 1 or videos[0].get("codec_name") != expected_codec or
            len(subs) != int(subtitles) or
            (subtitles and subs[0].get("codec_name") != "mov_text")):
        raise ValueError("Rendered delivery codec or subtitle track failed verification")
    return {**result, "codec": expected_codec, "selectable_subtitles": subtitles}


def produce_deliverables(folder, receipt, mode):
    """Create optional genuine local formats in the unpublished staging folder."""
    frames = receipt["total_frames"]
    size = (receipt["video"]["width"], receipt["video"]["height"])
    master = folder / "video.mp4"
    outputs = {
        "video.mp4": verified_variant(master, "h264", frames, size),
    }
    subtitles_path = folder / "captions.srt"
    if subtitles_path.is_symlink() or not subtitles_path.is_file():
        raise ValueError("Final authored SRT captions are missing")
    outputs["captions.srt"] = {
        "sha256": renderer.sha256(subtitles_path),
        "file_bytes": subtitles_path.stat().st_size,
    }
    webm, embedded = extra_outputs(mode)
    if webm:
        target = folder / "video.webm"
        renderer.execute([
            "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-n",
            "-threads", "2", "-i", str(master),
            "-map", "0:v:0", "-an", "-sn", "-dn",
            "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "6",
            "-b:v", "0", "-crf", "27" if receipt["quality"] == "high" else "32",
            "-pix_fmt", "yuv420p", str(target),
        ], timeout=180)
        outputs["video.webm"] = verified_variant(target, "vp9", frames, size)
    if embedded:
        target = folder / "video-subtitled.mp4"
        renderer.execute([
            "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-n",
            "-i", str(master), "-f", "srt", "-i", str(subtitles_path),
            "-map", "0:v:0", "-map", "1:s:0", "-c:v", "copy",
            "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
            "-an", "-movflags", "+faststart", str(target),
        ], timeout=90)
        outputs["video-subtitled.mp4"] = verified_variant(
            target, "h264", frames, size, subtitles=True)
    return outputs



def load_plan(root):
    path = root / PLAN_NAME
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_PLAN_BYTES:
        raise ValueError("Missing, symlinked or oversized human-authored phone movie plan")
    try:
        with path.open("rb") as stream:
            plan = json.loads(stream.read().decode("utf8"),object_pairs_hook=unique_keys)
    except (UnicodeError,ValueError,TypeError) as error:
        raise ValueError("Invalid private phone movie plan JSON") from error
    if (not isinstance(plan,dict) or set(plan) not in ({"kind","version","profile","quality","shots"},
                          {"kind","version","profile","quality","shots","delivery"}) or
        plan["kind"]!="eternyx_offline_phone_movie" or
        type(plan["version"]) is not int or plan["version"]!=1 or
        plan["profile"] not in PROFILES or plan["quality"] not in QUALITIES or
        plan.get("delivery", "mp4") not in DELIVERIES or
        not isinstance(plan["shots"],list) or not 1<=len(plan["shots"])<=8):
        raise ValueError("Unsupported or incomplete private phone movie plan")
    total=0
    for row in plan["shots"]:
        if not isinstance(row,dict) or set(row)!={"source_filename","frames","caption","rights_ref"}:
            raise ValueError("Every movie cut must include its original, frames, human caption and rights")
        if type(row["frames"]) is not int or not 16<=row["frames"]<=48 or row["frames"]%16:
            raise ValueError("Each phone movie cut must be 1, 2 or 3 whole seconds at 16 FPS")
        renderer.text_field(row["caption"],"Human caption")
        renderer.text_field(row["rights_ref"],"Recording permission/rights reference")
        total+=row["frames"]
    if total>renderer.MAX_FRAMES:
        raise ValueError("Actual phone movie cannot exceed 30 seconds / 480 frames")
    return plan


def preflight(root=ROOT):
    plan=load_plan(root)
    manifest=intake.read_manifest(root)
    if len(plan["shots"])!=len(manifest["originals"]):
        raise ValueError("Every original phone recording needs its own real movie cut")
    for shot,source in zip(plan["shots"],manifest["originals"]):
        if shot["source_filename"]!=source["filename"]:
            raise ValueError("Movie cut order/filename differs from the original verified phone inventory")
        if shot["frames"]>manifest["seconds"]*renderer.FPS:
            raise ValueError("Conversion trim is shorter than the requested movie cut")
    if (root/OUTPUT).exists() or (root/OUTPUT).is_symlink():
        raise ValueError("Finished phone movie output exists; never overwrite a completed video")
    webm, embedded = extra_outputs(plan.get("delivery", "mp4"))
    if webm:
        intake.check_tool("ffmpeg", ["-hide_banner", "-encoders"], b"libvpx-vp9")
    if embedded:
        intake.check_tool("ffmpeg", ["-hide_banner", "-encoders"], b"mov_text")
    checked=intake.preflight(root)
    return {
        "result":"ready","shots":len(plan["shots"]),
        "frames":sum(s["frames"] for s in plan["shots"]),
        "profile":plan["profile"],"quality":plan["quality"],
        "delivery":plan.get("delivery", "mp4"),
        "originals_verified":checked["source_count"],
        "private_media_uploaded":False,
        "output":OUTPUT,
    }


def build_board(root,plan,report):
    if report["source_count"]!=len(plan["shots"]):
        raise ValueError("Actual normalized MP4 inventory differs from the requested movie")
    shots=[]
    for authored,converted in zip(plan["shots"],report["clips"]):
        if converted["source_filename"]!=authored["source_filename"]:
            raise ValueError("Prepared video source order does not match the movie plan")
        if authored["frames"]>converted["prepared_frames"]:
            raise ValueError(
                "Original video "+authored["source_filename"]+
                " is too short after decoding for the requested cut. "
                "Choose a shorter cut and create a fresh private ZIP."
            )
        shots.append({
            "file":converted["prepared_filename"],
            "source_sha256":converted["prepared_sha256"],
            "start_frame":0,"frames":authored["frames"],
            "caption":authored["caption"],"rights_ref":authored["rights_ref"],
            "fade_in_frames":0,"fade_out_frames":0,
        })
    return {"version":2,"shots":shots}


def run(root=ROOT,on_stage=None):
    if on_stage is None:
        on_stage=lambda _:None
    on_stage("Verifying genuine source footage, human captions and recording rights...")
    checked=preflight(root)
    plan=load_plan(root)
    on_stage("Converting phone footage to real constant-16FPS H264 on this CPU...")
    intake.run(root,on_stage=on_stage)
    media=root/intake.OUTPUT
    report_path=media/"preparation-report.json"
    if report_path.is_symlink() or not report_path.is_file():
        raise ValueError("Offline phone video preparation report is missing")
    report=json.loads(report_path.read_text("utf8"),object_pairs_hook=unique_keys)
    board=build_board(root,plan,report)
    storyboard=media/"eternyx-phone-movie-v2.json"
    if storyboard.exists() or storyboard.is_symlink():
        raise ValueError("Refuse to overwrite the existing movie storyboard")
    storyboard.write_text(json.dumps(board,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    on_stage("Rendering full authentic CPU movie with FFmpeg, captions and verified MP4 manifest...")
    stage = Path(tempfile.mkdtemp(prefix=".eternyx-phone-delivery-", dir=root))
    try:
        unpublished = stage / "rendered"
        receipt=renderer.render(storyboard,media,unpublished,
                                profile=plan["profile"],quality=plan["quality"])
        if (receipt.get("model_generation") is not False or
            receipt.get("version")!=2 or
            receipt.get("total_frames")!=checked["frames"] or
            receipt.get("profile")!=plan["profile"] or
            receipt.get("quality")!=plan["quality"] or
            receipt.get("video",{}).get("frame_count")!=checked["frames"]):
            raise ValueError("Final local FFmpeg receipt does not match the original plan")
        on_stage("Encoding and verifying selected final deliverables on CPU...")
        receipt["delivery"] = plan.get("delivery", "mp4")
        receipt["deliverables"] = produce_deliverables(
            unpublished, receipt, receipt["delivery"])
        (unpublished/"manifest.json").write_text(
            json.dumps(receipt, indent=2, ensure_ascii=False, allow_nan=False)+"\n",
            encoding="utf8")
        if (root/OUTPUT).exists() or (root/OUTPUT).is_symlink():
            raise ValueError("Final phone video output appeared; refusing overwrite")
        unpublished.rename(root/OUTPUT)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    on_stage("Completed verified H264 master and all selected offline delivery formats.")
    return {
        "result":"completed","frames":checked["frames"],
        "shots":checked["shots"],"profile":plan["profile"],
        "quality":plan["quality"],"delivery":plan.get("delivery", "mp4"),
        "deliverables":list(receipt["deliverables"]),
        "video_sha256":receipt["video"]["sha256"],
        "output":OUTPUT,"media":intake.OUTPUT,
        "private_media_uploaded":False,"model_generation":False,
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    modes=parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--check",action="store_true",help="Verify original files, rights and available offline encoders")
    modes.add_argument("--run",action="store_true",help="Normalize phone footage then render a real final H264")
    args=parser.parse_args()
    try:
        if args.check:
            print(json.dumps(preflight(),sort_keys=True))
        else:
            print(json.dumps(run(on_stage=lambda message:print(message,flush=True)),
                             sort_keys=True))
    except (ValueError,OSError,TypeError,KeyError) as error:
        parser.exit(2,"ETERNYX CPU phone movie: "+str(error)+"\n")


if __name__=="__main__":
    main()
