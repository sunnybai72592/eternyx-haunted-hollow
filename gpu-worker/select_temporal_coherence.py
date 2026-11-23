"""CPU temporal-coherence audition of ETERNYX's REAL learned 4x3 neural motion.

This module selects a lightweight temporal/spatial *decision regularizer* using
an INNER portion of the ORIGINAL training footage. Outer heldout motion is
evaluated only AFTER this decision is frozen. The neural motion weights,
tagged appearance adapter and v2 weights remain unchanged. This is data-selected
inference regularization, not an additional neural network or text-to-video.

Per-tile categorical probabilities are combined with previous predicted motion
and adjacent-tile previous decisions. Causal, bounded, no future motion leakage.
The unchanged baseline is always a valid selection. No improvement is promised.

All videos are actual local FFmpeg-encoded H264 derived from sampled neural RGB.
Python stdlib + offline FFmpeg. No paid GPU, pretrained model or external API.
"""
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
from time import perf_counter

import learn_tagged_spatial_motion as motion
import train_tagged_neural_video as tags
import train_spatiotemporal_neural_video as v2
from learn_cpu_video_texture import validate_output_dir
from render_video_timeline import FPS, sha256, probe, video_info

OPTIONS=((0,0),(25,25),(50,25),(25,50))
INNER_STEPS=4
OBJECTIVE_JITTER=0.02
OBJECTIVE_SPATIAL=0.01
MAX_VIDEO_BYTES=64*1024*1024


def neighbors(tile):
    tx,ty=tile%motion.TILES_X,tile//motion.TILES_X
    indices=[]
    for x,y in ((tx-1,ty),(tx+1,ty),(tx,ty-1),(tx,ty+1)):
        if 0<=x<motion.TILES_X and 0<=y<motion.TILES_Y:
            indices.append(y*motion.TILES_X+x)
    return indices


def decision(model,label,previous,t,total,temporal=0,spatial=0):
    """Use only original trained classifier weights and previous synthetic states."""
    if (type(temporal) is not int or type(spatial) is not int or
            temporal<0 or spatial<0 or temporal+spatial>100):
        raise ValueError("Regularization percentages must be nonnegative integer percentages totaling at most 100")
    if (not isinstance(previous,list) or len(previous)!=motion.TILES or
            any(type(x) is not int or not 0<=x<motion.CLASSES for x in previous)):
        raise ValueError("Previous tile motion must be 12 actual valid classes")
    if label not in model["tags"] or type(t) is not int or \
            type(total) is not int or total<2 or not 1<=t<total:
        raise ValueError("Unknown trained tag, noncausal position or invalid duration")
    weights=model["tags"][label]["weights"]
    result=[]
    for tile in range(motion.TILES):
        probs=motion.softmax(weights[tile],motion.inputs(previous[tile],t/(total-1)))
        adjacent=neighbors(tile)
        adjacent_dist=[
            sum(previous[n]==cls for n in adjacent)/len(adjacent)
            for cls in range(motion.CLASSES)]
        combined=[
            (1-(temporal+spatial)/100)*probs[cls]+
            (temporal/100)*(cls==previous[tile])+
            (spatial/100)*adjacent_dist[cls]
            for cls in range(motion.CLASSES)]
        result.append(max(range(motion.CLASSES),key=lambda cls:combined[cls]))
    return result


def metrics(model,label,sources,start_fn,horizon):
    """Free-run multiple steps; ground truth is NEVER a prediction input."""
    if not 1<=horizon<=8:raise ValueError("Evaluate only one to eight causal frames")
    errors=still=correct=jitter=spatial_gap=0.
    observations=joins=0
    for source in sources:
        frames=source["frames"]
        observed=source["observed"]
        start=start_fn(source)
        if not 2<=start or start+horizon>len(frames):
            raise ValueError("Evaluation frame range violates source boundaries")
        prev=observed[start-2][:]
        total=len(frames)
        for t in range(start,start+horizon):
            chosen=decision(model,label,prev,t,total,
                            temporal=metrics.temporal,spatial=metrics.spatial)
            for tile,pred in enumerate(chosen):
                dx,dy=motion.MASK[pred]
                err=motion.patch_error(frames[t-1],frames[t],tile,dx,dy)
                z=motion.patch_error(frames[t-1],frames[t],tile,0,0)
                errors+=err
                still+=z
                correct+=int(pred==observed[t-1][tile])
                before=motion.MASK[prev[tile]]
                jitter+=(abs(dx-before[0])+abs(dy-before[1]))/2
                observations+=1
                for near in neighbors(tile):
                    if near>tile:
                        bx,by=motion.MASK[chosen[near]]
                        spatial_gap+=(abs(dx-bx)+abs(dy-by))/2
                        joins+=1
            prev=chosen
    if not observations or not joins:
        raise ValueError("No causal tile motion observations or neighboring tile pairs")
    result={
        "steps":horizon,"observations":observations,
        "predicted_warp_mae":round(errors/observations,8),
        "zero_shift_mae":round(still/observations,8),
        "shift_accuracy":round(correct/observations,8),
        "temporal_jitter":round(jitter/observations,8),
        "spatial_disagreement":round(spatial_gap/joins,8),
        "interpretation":"Source-frame block-match diagnostics, not generated-video perceptual quality.",
    }
    result["selection_objective"]=round(
        result["predicted_warp_mae"]+
        OBJECTIVE_JITTER*result["temporal_jitter"]+
        OBJECTIVE_SPATIAL*result["spatial_disagreement"],8)
    return result


def score(model,label,sources,start_fn,horizon,temporal,spatial):
    # Avoid shared global state and maintain deterministic evaluation calls.
    original=metrics
    return _score(model,label,sources,start_fn,horizon,temporal,spatial)


def _score(model,label,sources,start_fn,horizon,temporal,spatial):
    # The explicit configuration is passed per call; never mutate trained weights.
    return evaluate(model,label,sources,start_fn,horizon,temporal,spatial)


def evaluate(model,label,sources,start_fn,horizon,temporal,spatial):
    if type(temporal) is not int or type(spatial) is not int or \
       temporal<0 or spatial<0 or temporal+spatial>100:
        raise ValueError("Unsupported causal temporal/spatial regularization setting")
    if type(horizon) is not int or not 1<=horizon<=8:
        raise ValueError("Causal evaluation must cover 1–8 frames")
    mae=zero=accuracy=delta=seam=0.
    samples=edges=0
    for source in sources:
        frames=source["frames"]
        observed=source["observed"]
        start=start_fn(source)
        if type(start) is not int or start<2 or start+horizon>len(frames):
            raise ValueError("Evaluation window must fit the verified footage")
        previous=observed[start-2][:]  # one known motion in the allowed prefix
        for t in range(start,start+horizon):
            current=decision(model,label,previous,t,len(frames),
                             temporal,spatial)
            for tile,cls in enumerate(current):
                dx,dy=motion.MASK[cls]
                mae+=motion.patch_error(frames[t-1],frames[t],tile,dx,dy)
                zero+=motion.patch_error(frames[t-1],frames[t],tile,0,0)
                accuracy+=int(cls==observed[t-1][tile])
                before=motion.MASK[previous[tile]]
                delta+=(abs(dx-before[0])+abs(dy-before[1]))/2
                samples+=1
                for n in neighbors(tile):
                    if n>tile:
                        nx,ny=motion.MASK[current[n]]
                        seam+=(abs(dx-nx)+abs(dy-ny))/2
                        edges+=1
            previous=current
    if samples!=len(sources)*horizon*motion.TILES or not edges:
        raise ValueError("Incomplete same-window tile evaluation")
    result={
        "steps":horizon,"observations":samples,
        "predicted_warp_mae":round(mae/samples,8),
        "zero_shift_mae":round(zero/samples,8),
        "shift_accuracy":round(accuracy/samples,8),
        "temporal_jitter":round(delta/samples,8),
        "spatial_disagreement":round(seam/edges,8),
    }
    result["selection_objective"]=round(
        result["predicted_warp_mae"]+OBJECTIVE_JITTER*result["temporal_jitter"]+
        OBJECTIVE_SPATIAL*result["spatial_disagreement"],8)
    return result


def split_prefix(sources):
    splits=[]
    for source in sources:
        cutoff=source["cutoff"]
        inner=cutoff-6
        if inner<12 or inner+INNER_STEPS>cutoff:
            raise ValueError("Inner motion validation must stay inside original training prefix")
        splits.append({
            "source_sha256":source["sha256"],
            "inner_training_end":inner,
            "inner_validation_start":inner,
            "inner_validation_end_exclusive":inner+INNER_STEPS,
            "outer_holdout_start":cutoff,
        })
    return splits


def select(model,label,sources):
    """Selection reads only original prefix frames and *never* final 25%."""
    if not sources:raise ValueError("No approved source footage for trained tag")
    partitions=split_prefix(sources)
    start=lambda row:row["cutoff"]-6
    baseline=evaluate(model,label,sources,start,INNER_STEPS,0,0)
    candidates=[{"temporal_percent":0,"neighbor_percent":0,
                 "inner":baseline}]
    selected=(0,0)
    best=baseline
    for temporal,neighbor in OPTIONS[1:]:
        row=evaluate(model,label,sources,start,INNER_STEPS,temporal,neighbor)
        candidates.append({"temporal_percent":temporal,
                           "neighbor_percent":neighbor,"inner":row})
        # A smoother candidate may only win if it does NOT worsen
        # measured original-frame warp error on inner validation.
        if (row["predicted_warp_mae"]<=baseline["predicted_warp_mae"]+1e-8 and
                row["selection_objective"]<best["selection_objective"]-1e-6):
            selected=(temporal,neighbor)
            best=row
    return {
        "tag":label,"selected_temporal_percent":selected[0],
        "selected_neighbor_percent":selected[1],
        "baseline_allowed":True,
        "inner_steps":INNER_STEPS,
        "training_only_selection":True,
        "split_provenance":partitions,
        "candidates":candidates,
        "objective":{
            "warp_mae_coefficient":1.0,
            "temporal_jitter_coefficient":OBJECTIVE_JITTER,
            "spatial_disagreement_coefficient":OBJECTIVE_SPATIAL,
            "constraint":"Inner warp MAE must not exceed unchanged baseline by more than 1e-8.",
        },
    }


def final_audit(model,label,sources,selected):
    start=lambda row:row["cutoff"]
    before={}
    after={}
    for horizon in (1,4,8):
        before[str(horizon)]=evaluate(model,label,sources,start,horizon,0,0)
        after[str(horizon)]=evaluate(
            model,label,sources,start,horizon,
            selected["selected_temporal_percent"],
            selected["selected_neighbor_percent"])
        if before[str(horizon)]["zero_shift_mae"]!=after[str(horizon)]["zero_shift_mae"]:
            raise ValueError("Outer evaluation baseline differs on identical unseen frames")
    return {"steps":[1,4,8],"baseline":before,"selected":after,
            "no_outer_selection":True,
            "interpretation":"Final held-out block-motion audit may regress; never used to select smoothing."}


def joined_videos(left,right,output,frames):
    cmd=["ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
         "-protocol_whitelist","file,pipe","-i",str(left),
         "-protocol_whitelist","file,pipe","-i",str(right),
         "-filter_complex_threads","1","-filter_complex",
         "[0:v]setpts=PTS-STARTPTS[l];[1:v]setpts=PTS-STARTPTS[r];"
         "[l][r]hstack=inputs=2[out]",
         "-map","[out]","-an","-sn","-dn","-map_metadata","-1",
         "-frames:v",str(frames),"-c:v","libx264","-preset","ultrafast",
         "-crf","23","-pix_fmt","yuv420p",
         "-movflags","+faststart",str(output)]
    try:
        proc=subprocess.run(cmd,capture_output=True,check=False,timeout=120)
    except (OSError,subprocess.TimeoutExpired) as err:
        raise ValueError("Offline FFmpeg paired video failed") from err
    if proc.returncode or not output.is_file() or not 0<output.stat().st_size<=MAX_VIDEO_BYTES:
        raise ValueError("No real paired H264 video was produced")
    if video_info(probe(output,count_frames=True))!=(512,144,frames):
        raise ValueError("Actual paired MP4 decoded shape or frames invalid")
    return {"file":"comparison.mp4","sha256":sha256(output),
            "video_bytes":output.stat().st_size,"width":512,
            "height":144,"frame_count":frames}


def run(base_path,tag_path,motion_path,source_root,output,label,
        seconds=1,seed=42,strength=75,stability=45,variation=6):
    validate_output_dir(output)
    if type(seconds) is not int or not 1<=seconds<=3:
        raise ValueError("Comparison duration must be integer 1–3 seconds")
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("Seed must be nonnegative 31-bit integer")
    if type(strength) is not int or not 0<=strength<=100:
        raise ValueError("Motion strength must be 0–100")
    if type(stability) is not int or not 0<=stability<=85:
        raise ValueError("Temporal stability must be 0–85")
    if type(variation) is not int or not 0<=variation<=20:
        raise ValueError("Color variation must be 0–20")
    base=v2.read_model(base_path)
    tag_model=tags.verify_model(tag_path)
    model=motion.verify_model(motion_path)
    if tag_model["base_model_sha256"]!=sha256(base_path) or \
       model["base_model_sha256"]!=sha256(base_path) or \
       model["tag_model_sha256"]!=sha256(tag_path):
        raise ValueError("Frozen base, trained tags and tile-motion SHA-256 do not match")
    if label not in tag_model["tags"] or label not in model["tags"]:
        raise ValueError("Label must be an actually trained tag for both neural adapters")
    all_sources=motion.reviewed_sources(base,tag_model,source_root)
    sources=[x for x in all_sources if x["tag"]==label]
    if not sources:raise ValueError("Selected trained tag has no reviewed sources")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-temporal-coherence-",dir=output.parent))
    try:
        start=perf_counter()
        selected=select(model,label,sources)  # INNER only
        selection_seconds=round(perf_counter()-start,6)
        audit=final_audit(model,label,sources,selected)  # OUTER only after selection
        selection_data={
            "version":1,"kind":"cpu_tagged_motion_coherence_profile",
            "neural_motion_classifier":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(motion_path),
            "tag":label,
            "selected_temporal_percent":selected["selected_temporal_percent"],
            "selected_neighbor_percent":selected["selected_neighbor_percent"],
            "outer_holdout_used_for_selection":False,
            "source_sha256":[x["sha256"] for x in sources],
            "selection":selected,
        }
        chosen=stage/"selection-profile.json"
        chosen.write_text(json.dumps(selection_data,indent=2,allow_nan=False)+"\n")
        settings=(selected["selected_temporal_percent"],
                  selected["selected_neighbor_percent"])
        def adjusted(model,label,previous,t,total,rng):
            return decision(model,label,previous,t,total,*settings)
        start=perf_counter()
        old=motion.generate(base_path,tag_path,motion_path,label,stage/"baseline",
            seconds=seconds,seed=seed,strength=strength,stability=stability,
            variation=variation)
        new=motion.generate(base_path,tag_path,motion_path,label,stage/"coherent",
            seconds=seconds,seed=seed,strength=strength,stability=stability,
            variation=variation,decision_fn=adjusted)
        render_seconds=round(perf_counter()-start,6)
        left=stage/"baseline"/"render"/"video.mp4"
        right=stage/"coherent"/"render"/"video.mp4"
        if (sha256(left)!=old["video_sha256"] or
                sha256(right)!=new["video_sha256"]):
            raise ValueError("Actual generated MP4 does not match renderer's receipt")
        paired=joined_videos(left,right,stage/"comparison.mp4",seconds*FPS)
        report={
            "version":1,"kind":"cpu_neural_tagged_temporal_coherence_audit",
            "neural_motion_classifier":True,"text_to_video":False,
            "tag":label,"base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(motion_path),
            "selection_profile_sha256":sha256(chosen),
            "source_sha256":[x["sha256"] for x in sources],
            "selection":selected,
            "final_outer_audit":audit,
            "cpu_selection_seconds":selection_seconds,
            "cpu_render_seconds":render_seconds,
            "sampling":{"seconds":seconds,"seed":seed,"strength":strength,
                        "stability":stability,"variation":variation},
            "artifacts":{
                "baseline":{
                    "file":"baseline/render/video.mp4",
                    "sha256":sha256(left),"video_bytes":left.stat().st_size,
                    "frame_count":seconds*FPS,
                    "raw_rgb_sha256":old["raw_rgb_sha256"],
                },
                "coherent":{
                    "file":"coherent/render/video.mp4",
                    "sha256":sha256(right),"video_bytes":right.stat().st_size,
                    "frame_count":seconds*FPS,
                    "raw_rgb_sha256":new["raw_rgb_sha256"],
                },
                "comparison":paired,
            },
            "interpretation":(
                "Data-selected inference smoothing on ORIGINAL motion classifier; "
                "outer heldout never influences selection. Lower block MAE or jitter "
                "does not prove realistic motion or cinematic text-to-video."
            ),
        }
        (stage/"selection-report.json").write_text(
            json.dumps(report,indent=2,allow_nan=False)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base",type=Path,required=True)
    parser.add_argument("--tag-model",type=Path,required=True)
    parser.add_argument("--motion-model",type=Path,required=True)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--tag",required=True)
    parser.add_argument("--seconds",type=int,default=1)
    parser.add_argument("--seed",type=int,default=42)
    parser.add_argument("--strength",type=int,default=75)
    parser.add_argument("--stability",type=int,default=45)
    parser.add_argument("--variation",type=int,default=6)
    args=parser.parse_args()
    try:
        r=run(args.base,args.tag_model,args.motion_model,args.input,
              args.output,args.tag,args.seconds,args.seed,args.strength,
              args.stability,args.variation)
        print(json.dumps({
            "tag":r["tag"],
            "selection":(r["selection"]["selected_temporal_percent"],
                         r["selection"]["selected_neighbor_percent"]),
            "outer_holdout_used_for_selection":False,
            "eight_step_before":r["final_outer_audit"]["baseline"]["8"]["predicted_warp_mae"],
            "eight_step_after":r["final_outer_audit"]["selected"]["8"]["predicted_warp_mae"],
            "paired_mp4_sha256":r["artifacts"]["comparison"]["sha256"],
        }))
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError) as err:
        parser.error(str(err))


if __name__=="__main__":
    main()
