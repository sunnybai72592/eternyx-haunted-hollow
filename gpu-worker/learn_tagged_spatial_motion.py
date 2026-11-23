"""Learn spatially varying motion from locally owned neural-tag training videos.

A bounded 4x3 tile grid learns a REAL per-tag multinomial motion classifier:
9 displacements (-1..1 x -1..1), 4 features (previous predicted dx/dy,
normalized time and bias), SGD softmax cross-entropy. Labels are block-match
displacements on actual 48x28 decoded source video. Training uses only the
original 75% prefix; the unseen final quarter is measured, not optimized.

At generation, smoothly interpolate tile motion vectors and warp two past
frames BEFORE passing them to the existing real trained tagged neural video
decoder. This is a modest trained spatial-motion experiment, NOT semantic
scene understanding, dense optical flow, diffusion, or text-to-video.

Local Python stdlib + FFmpeg/FFprobe/libx264 only. No network, GPU or AI API.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import shutil
import subprocess
import tempfile
from time import perf_counter

import train_spatiotemporal_neural_video as v2
import train_tagged_neural_video as tagged
from learn_cpu_video_texture import checked_input, validate_output_dir
from render_video_timeline import FPS,render,sha256,probe,video_info

TILES_X,TILES_Y=4,3
TILES=TILES_X*TILES_Y
CLASSES=9
FEATURES=4
MAX_EPOCHS=4
MAX_SECONDS=3
MAX_BYTES=131072
MAX_VIDEO_BYTES=64*1024*1024
LR=0.12
MASK=[(-1,-1),(0,-1),(1,-1),(-1,0),(0,0),(1,0),(-1,1),(0,1),(1,1)]


def inputs(previous,moment):
    dx,dy=MASK[previous]
    return (float(dx),float(dy),float(moment),1.)


def softmax(weights,features):
    logits=[sum(w*f for w,f in zip(row,features)) for row in weights]
    peak=max(logits)
    exp=[math.exp(min(30.,v-peak)) for v in logits]
    total=sum(exp)
    return [v/total for v in exp]


def zero_motion():
    return [[[0.]*FEATURES for _ in range(CLASSES)] for _ in range(TILES)]


def coords(tile):
    tx,ty=tile%TILES_X,tile//TILES_X
    return ((tx*v2.W)//TILES_X,((tx+1)*v2.W)//TILES_X,
            (ty*v2.H)//TILES_Y,((ty+1)*v2.H)//TILES_Y)


def patch_error(previous,current,tile,dx,dy):
    x0,x1,y0,y1=coords(tile)
    mismatch=0.
    count=0
    for y in range(y0,y1):
        for x in range(x0,x1):
            old=previous[((y-dy)%v2.H)*v2.W+(x-dx)%v2.W]
            new=current[y*v2.W+x]
            mismatch+=sum(abs(a-b) for a,b in zip(v2.colors(old),v2.colors(new)))
            count+=3
    return mismatch/count


def observed_tile_shift(previous,current,tile):
    ranked=[(patch_error(previous,current,tile,*MASK[index]),
             abs(MASK[index][0])+abs(MASK[index][1]),
             index)
            for index in range(CLASSES)]
    return min(ranked)[2]


def motion_series(frames):
    return [[observed_tile_shift(frames[t-1],frames[t],tile)
             for tile in range(TILES)] for t in range(1,len(frames))]


def train_local(weights,examples,epochs,seed):
    rng=random.Random(seed)
    for epoch in range(epochs):
        order=list(examples)
        rng.shuffle(order)
        for tile,previous,target,phase in order:
            features=inputs(previous,phase)
            probs=softmax(weights[tile],features)
            for cls in range(CLASSES):
                difference=probs[cls]-(1. if cls==target else 0.)
                for k in range(FEATURES):
                    weights[tile][cls][k]-=LR*difference*features[k]


def loss(weights,examples):
    if not examples:raise ValueError("No measured source motion examples")
    value=0.
    correct=0
    for tile,previous,target,phase in examples:
        probs=softmax(weights[tile],inputs(previous,phase))
        value-=math.log(max(1e-12,probs[target]))
        correct+=int(max(range(CLASSES),key=lambda i:probs[i])==target)
    return round(value/len(examples),8),round(correct/len(examples),8)


def heldout_motion(weights,source_sets):
    """On heldout frames, previous tile input is the OWN predicted displacement."""
    n=0
    ce=0.
    accurate=0
    warped=0.
    still=0.
    for item in source_sets:
        frames=item["frames"]
        cutoff=item["cutoff"]
        observed=item["observed"]
        previous=observed[cutoff-2][:]  # last known training transition
        for t in range(cutoff,len(frames)):
            current=observed[t-1]
            next_previous=[]
            for tile,target in enumerate(current):
                features=inputs(previous[tile],t/(len(frames)-1))
                probs=softmax(weights[tile],features)
                decision=max(range(CLASSES),key=lambda index:probs[index])
                ce-=math.log(max(1e-12,probs[target]))
                accurate+=int(decision==target)
                dx,dy=MASK[decision]
                warped+=patch_error(frames[t-1],frames[t],tile,dx,dy)
                still+=patch_error(frames[t-1],frames[t],tile,0,0)
                n+=1
                next_previous.append(decision)
            previous=next_previous
    if not n:raise ValueError("No unseen spatial motion frames available")
    return {
        "observations":n,
        "free_running_motion_cross_entropy":round(ce/n,8),
        "free_running_shift_accuracy":round(accurate/n,8),
        "predicted_warp_frame_mae":round(warped/n,8),
        "zero_shift_frame_mae":round(still/n,8),
        "interpretation":"Measured local one-pixel block matching. Neither classifier accuracy nor MAE establishes realistic motion.",
    }


def reviewed_sources(base,adapter,root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Motion data must come from real local approved footage directory")
    records=adapter["file_tags"]
    sources=base["sources"]
    if (not isinstance(records,list) or len(records)!=len(sources) or
            not 2<=len(records)<=3):
        raise ValueError("Tag adapter must map exactly 2–3 verified original base sources")
    base_by_file={row["file"]:row for row in sources}
    if len(base_by_file)!=len(sources):
        raise ValueError("Original model source filenames are not distinct")
    mapped=[]
    for row in records:
        if not isinstance(row,dict) or row.get("file") not in base_by_file:
            raise ValueError("Unrecognized trained-tag source")
        expected=base_by_file[row["file"]]
        for field in ("sha256","rights_ref","used_frames","train_frames","holdout_frames"):
            if row.get(field)!=expected.get(field):
                raise ValueError("Trained tag/source provenance differs from original base")
        label=tagged.check_tag(row["tag"])
        if label not in adapter["tags"]:
            raise ValueError("Source has unknown or untrained tag label")
        path=checked_input(root,row["file"])
        if sha256(path)!=row["sha256"]:
            raise ValueError("Source MP4 SHA-256 changed after tag training")
        frames,total=v2.read_frames(path)
        if (total!=expected["decoded_frames"] or
                len(frames)!=expected["used_frames"] or
                len(frames)<32 or
                max(7,len(frames)*3//4)!=expected["train_frames"] or
                len(frames)-expected["train_frames"]<8):
            raise ValueError("Actual source frame count or original train/holdout split changed")
        mapped.append({
            "file":row["file"],"tag":label,"sha256":row["sha256"],
            "frames":frames,"cutoff":expected["train_frames"],
            "observed":motion_series(frames),
        })
    if len({item["file"] for item in mapped})!=len(sources):
        raise ValueError("Tag training must assign each verified source exactly once")
    if set(item["tag"] for item in mapped)!=set(adapter["tags"]):
        raise ValueError("Each adapter label must have matching approved training footage")
    return mapped


def train(base_path,tag_path,root,output,epochs=2,seed=42):
    validate_output_dir(output)
    if type(epochs) is not int or not 1<=epochs<=MAX_EPOCHS:
        raise ValueError("CPU motion model epochs must be 1–4")
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("CPU motion training seed must be an integer 0–2147483647")
    base=v2.read_model(base_path)
    adapter=tagged.verify_model(tag_path)
    if adapter["base_model_sha256"]!=sha256(base_path):
        raise ValueError("Trained tag adapter does not match the frozen neural base SHA-256")
    sources=reviewed_sources(base,adapter,root)
    by_tag={label:[] for label in adapter["tags"]}
    for source in sources:by_tag[source["tag"]].append(source)
    models={}
    metrics={}
    elapsed=perf_counter()
    for label,items in sorted(by_tag.items()):
        examples=[]
        for item in items:
            frames=item["frames"]
            cutoff=item["cutoff"]
            observed=item["observed"]
            for t in range(2,cutoff):
                for tile in range(TILES):
                    examples.append((tile,observed[t-2][tile],
                                     observed[t-1][tile],t/(len(frames)-1)))
        weights=zero_motion()
        baseline_ce,baseline_acc=loss(weights,examples)
        train_local(weights,examples,epochs,
                    seed+sum((i+1)*ord(c) for i,c in enumerate(label)))
        after_ce,after_acc=loss(weights,examples)
        heldout=heldout_motion(weights,items)
        models[label]={"weights":weights,
                       "source_sha256":[x["sha256"] for x in items]}
        metrics[label]={
            "training_observations":len(examples),
            "training_ce_before":baseline_ce,"training_ce_after":after_ce,
            "training_accuracy_before":baseline_acc,
            "training_accuracy_after":after_acc,
            "heldout":heldout,"source_count":len(items),
        }
    training_seconds=round(perf_counter()-elapsed,6)
    checkpoint={
        "version":1,"kind":"cpu_tagged_local_spatial_motion",
        "neural_motion_classifier":True,"text_to_video":False,
        "base_model_sha256":sha256(base_path),
        "tag_model_sha256":sha256(tag_path),
        "architecture":"4x3_tiles_9_motion_classes_4_features_softmax",
        "width":v2.W,"height":v2.H,"fps":FPS,
        "epochs":epochs,"seed":seed,
        "source_files":[{
            "file":item["file"],"tag":item["tag"],
            "sha256":item["sha256"],
            "train_frames":item["cutoff"],
            "holdout_frames":len(item["frames"])-item["cutoff"],
        } for item in sources],
        "tags":models,"metrics":metrics,
        "training_seconds":training_seconds,
    }
    content=json.dumps(checkpoint,separators=(",",":"),allow_nan=False).encode()
    if len(content)>MAX_BYTES:raise ValueError("Spatial motion adapter exceeds 128 KiB")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-spatial-motion-",dir=output.parent))
    try:
        saved=stage/"motion-model.json"
        saved.write_bytes(content+b"\n")
        verify_model(saved)
        receipt={
            "version":1,"kind":"cpu_tagged_spatial_motion_training",
            "neural_motion_classifier":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(saved),
            "architecture":checkpoint["architecture"],
            "tags":sorted(checkpoint["tags"]),
            "source_files":checkpoint["source_files"],
            "metrics":metrics,
            "training_seconds":training_seconds,
            "note":"Per-tag 4x3 learned displacement classifier, not dense optical flow or cinematic video.",
        }
        (stage/"training-report.json").write_text(json.dumps(receipt,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return receipt
    finally:
        if stage.exists():shutil.rmtree(stage)


def verify_model(path):
    if path.is_symlink() or not path.is_file() or not 0<path.stat().st_size<=MAX_BYTES:
        raise ValueError("Trained spatial motion model must be a bounded local file")
    try:
        data=json.loads(path.read_bytes())
    except (ValueError,UnicodeError) as err:
        raise ValueError("Invalid spatial-motion model JSON") from err
    if (not isinstance(data,dict) or data.get("version")!=1 or
            data.get("kind")!="cpu_tagged_local_spatial_motion" or
            data.get("neural_motion_classifier") is not True or
            data.get("text_to_video") is not False or
            data.get("architecture")!="4x3_tiles_9_motion_classes_4_features_softmax" or
            data.get("width")!=v2.W or data.get("height")!=v2.H or
            data.get("fps")!=FPS or type(data.get("epochs")) is not int or
            not 1<=data["epochs"]<=MAX_EPOCHS or
            type(data.get("seed")) is not int or not 0<=data["seed"]<=v2.MAX_SEED):
        raise ValueError("Unsupported genuine spatial motion model version")
    for key in ("base_model_sha256","tag_model_sha256"):
        val=data.get(key)
        if not isinstance(val,str) or len(val)!=64 or any(c not in "0123456789abcdef" for c in val):
            raise ValueError("Trained spatial motion missing SHA-256 provenance")
    styles=data.get("tags")
    if not isinstance(styles,dict) or not 2<=len(styles)<=3:
        raise ValueError("Need exactly 2–3 trained local motion labels")
    for label,info in styles.items():
        tagged.check_tag(label)
        if not isinstance(info,dict):raise ValueError("Invalid motion label")
        weights=info.get("weights")
        if (not isinstance(weights,list) or len(weights)!=TILES or
                any(not isinstance(tile,list) or len(tile)!=CLASSES or
                    any(not isinstance(row,list) or len(row)!=FEATURES or
                        any(type(v) not in (int,float) or
                            not math.isfinite(v) or abs(v)>30 for v in row)
                        for row in tile) for tile in weights)):
            raise ValueError("Malformed or nonfinite trained tile motion weights")
        keys=info.get("source_sha256")
        if (not isinstance(keys,list) or not 1<=len(keys)<=3 or
                any(not isinstance(x,str) or len(x)!=64 or
                    any(c not in "0123456789abcdef" for c in x) for x in keys)):
            raise ValueError("Invalid spatial motion source hash list")
    sources=data.get("source_files")
    if not isinstance(sources,list) or not 2<=len(sources)<=3:
        raise ValueError("Missing training source provenance")
    tags=set()
    for row in sources:
        if not isinstance(row,dict) or row.get("tag") not in styles:
            raise ValueError("Motion source tag was not trained")
        tags.add(row["tag"])
        for key in ("train_frames","holdout_frames"):
            if type(row.get(key)) is not int or row[key]<1 or row[key]>64:
                raise ValueError("Invalid motion source train/holdout split")
        if row["holdout_frames"]<8:
            raise ValueError("Need untouched motion holdout frames")
        file=row.get("file")
        if not isinstance(file,str) or not file.endswith(".mp4") or "/" in file or "\\" in file:
            raise ValueError("Unsafe local source file in model")
    if tags!=set(styles):raise ValueError("Trained tags and original source tags differ")
    return data


def tile_decisions(motion,label,previous,frame_index,total_frames,seeded=False,rng=None):
    weights=motion["tags"][label]["weights"]
    output=[]
    for tile in range(TILES):
        probs=softmax(weights[tile],inputs(previous[tile],frame_index/(total_frames-1)))
        if seeded:
            if rng is None:raise ValueError("Seeded tile-motion sampling requires deterministic RNG")
            decision=rng.choices(range(CLASSES),weights=probs)[0]
        else:
            decision=max(range(CLASSES),key=lambda k:probs[k])
        output.append(decision)
    return output


def warped(previous,decisions,strength):
    """Bilinear-interpolate neighboring tile displacement vectors and RGB pixels."""
    if type(strength) is not int or not 0<=strength<=100:
        raise ValueError("Spatial motion strength must be an integer 0–100")
    vectors=[MASK[index] for index in decisions]
    result=bytearray(v2.N)
    for y in range(v2.H):
        fy=(y+.5)*TILES_Y/v2.H-.5
        ylo=math.floor(fy)
        py=fy-ylo
        for x in range(v2.W):
            fx=(x+.5)*TILES_X/v2.W-.5
            xlo=math.floor(fx)
            px=fx-xlo
            dx=dy=0.
            for tx,ty,weight in (
                    (xlo,ylo,(1-px)*(1-py)),
                    (xlo+1,ylo,px*(1-py)),
                    (xlo,ylo+1,(1-px)*py),
                    (xlo+1,ylo+1,px*py)):
                tile=max(0,min(TILES_Y-1,ty))*TILES_X+max(0,min(TILES_X-1,tx))
                dx+=vectors[tile][0]*weight
                dy+=vectors[tile][1]*weight
            sx=(x-dx*strength/100)%v2.W
            sy=(y-dy*strength/100)%v2.H
            # A uniform, integral shift MUST preserve the exact original
            # quantized color ID. Floating-point tile interpolation can place
            # an integer coordinate a few ulps to either side of the boundary;
            # resampling that near-integer would spuriously mix adjacent pixels.
            # This also makes 0% strength a byte-exact stationary control.
            nearest_x=round(sx)
            nearest_y=round(sy)
            if abs(sx-nearest_x)<1e-8 and abs(sy-nearest_y)<1e-8:
                result[y*v2.W+x]=previous[(nearest_y%v2.H)*v2.W+
                                          (nearest_x%v2.W)]
                continue
            xl=int(math.floor(sx));yl=int(math.floor(sy))
            xr=(xl+1)%v2.W;yr=(yl+1)%v2.H
            ax=sx-xl;ay=sy-yl
            pts=(previous[yl*v2.W+xl],previous[yl*v2.W+xr],
                 previous[yr*v2.W+xl],previous[yr*v2.W+xr])
            weights4=((1-ax)*(1-ay),ax*(1-ay),(1-ax)*ay,ax*ay)
            channels=[sum(v2.colors(pixel)[k]*a for pixel,a in zip(pts,weights4))
                      for k in range(3)]
            result[y*v2.W+x]=v2.quantized(*[min(.999,max(0,v)) for v in channels])
    return bytes(result)


def sample_frames(base,adapter,motion,label,seconds,seed,strength=75,
                  stability=45,variation=6,seeded_motion=False,decision_fn=None):
    if label not in adapter["tags"] or label not in motion["tags"]:
        raise ValueError("Style label needs trained appearance AND spatial-motion weights")
    if type(seconds) is not int or not 1<=seconds<=MAX_SECONDS:
        raise ValueError("Spatial neural video duration must be 1–3 seconds")
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("Sample seed must be a nonnegative 31-bit integer")
    if type(strength) is not int or not 0<=strength<=100:
        raise ValueError("Spatial motion strength must be 0–100")
    if type(stability) is not int or not 0<=stability<=85:
        raise ValueError("Temporal stability must be 0–85")
    if type(variation) is not int or not 0<=variation<=20:
        raise ValueError("Seeded neural color variation must be 0–20")
    if type(seeded_motion) is not bool:
        raise ValueError("Motion mode must be deterministic argmax or seeded categorical")
    rng=random.Random(seed)
    style=adapter["tags"][label]
    first=bytearray(v2.N)
    for pos in range(v2.N):
        x,y=pos%v2.W,pos//v2.W
        cell=(y*v2.GRID_H//v2.H)*v2.GRID_W+x*v2.GRID_W//v2.W
        color=[max(0,min(.999,c+rng.uniform(-.08,.08)))
               for c in style["start_grid"][cell]]
        first[pos]=v2.quantized(*color)
    frames=[v2.sample_rgb(first)]
    older=recent=bytes(first)
    previous_motion=[4]*TILES
    innovation=[0.]*(v2.N*3)
    for t in range(1,seconds*FPS):
        new_motion=(decision_fn(motion,label,previous_motion,t,seconds*FPS,rng)
                    if decision_fn is not None else
                    tile_decisions(motion,label,previous_motion,t,seconds*FPS,
                                   seeded=seeded_motion,rng=rng))
        if (not isinstance(new_motion,list) or len(new_motion)!=TILES or
                any(type(x) is not int or not 0<=x<CLASSES for x in new_motion)):
            raise ValueError("Custom causal tile motion must be exactly 12 valid directions")
        older_warped=warped(older,new_motion,strength)
        recent_warped=warped(recent,new_motion,strength)
        updated=bytearray(v2.N)
        rgb=bytearray(v2.N*3)
        for pos in range(v2.N):
            _,prediction=tagged.styled_output(base["weights"],style["adapter_weights"],
                                                older_warped,recent_warped,pos,
                                                t/max(1,seconds*FPS-1))
            prior=v2.colors(recent_warped[pos])
            colors=[]
            for channel in range(3):
                noise=innovation[pos*3+channel]*.85+rng.gauss(0,1)*.53
                innovation[pos*3+channel]=noise
                value=max(0.,min(.999,
                    (1-stability/100)*prediction[channel]+
                    (stability/100)*prior[channel]+(variation/100)*noise))
                colors.append(value)
                rgb[pos*3+channel]=int(value*255)
            updated[pos]=v2.quantized(*colors)
        older,recent=recent,bytes(updated)
        previous_motion=new_motion
        frames.append(bytes(rgb))
    return frames


def generate(base_path,tag_path,motion_path,label,output,seconds=2,seed=42,
             strength=75,stability=45,variation=6,seeded_motion=False,
             profile="landscape",quality="standard",decision_fn=None):
    validate_output_dir(output)
    if profile not in ("landscape","portrait","square") or quality not in ("standard","high"):
        raise ValueError("Unsupported offline spatial-neural output preset")
    base=v2.read_model(base_path)
    adapter=tagged.verify_model(tag_path)
    motion=verify_model(motion_path)
    if adapter["base_model_sha256"]!=sha256(base_path):
        raise ValueError("Tag adapter does not match original base model SHA-256")
    if motion["base_model_sha256"]!=sha256(base_path) or motion["tag_model_sha256"]!=sha256(tag_path):
        raise ValueError("Spatial motion weights mismatch base and learned-tag SHA-256")
    frames=sample_frames(base,adapter,motion,label,seconds,seed,strength,
                         stability,variation,seeded_motion,decision_fn)
    raw=b"".join(frames)
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-spatial-sample-",dir=output.parent))
    try:
        clip=stage/"clip-01.mp4"
        cmd=[
            "ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
            "-f","rawvideo","-pixel_format","rgb24","-video_size",
            f"{v2.W}x{v2.H}","-framerate",str(FPS),"-i","pipe:0",
            "-map","0:v:0","-an","-sn","-dn","-map_metadata","-1",
            "-frames:v",str(len(frames)),"-c:v","libx264",
            "-preset","ultrafast","-crf","23","-pix_fmt","yuv420p",
            "-movflags","+faststart",str(clip)]
        try:
            proc=subprocess.run(cmd,input=raw,capture_output=True,check=False,timeout=90)
        except (OSError,subprocess.TimeoutExpired) as err:
            raise ValueError("Offline spatial-video encoder unavailable/timed out") from err
        if proc.returncode or not clip.is_file() or not 0<clip.stat().st_size<=MAX_VIDEO_BYTES:
            raise ValueError("Spatial-motion generated RGB was not encoded")
        if video_info(probe(clip,count_frames=True))!=(v2.W,v2.H,len(frames)):
            raise ValueError("Decoded neural sample differs from actual requested frame count")
        board={"version":2,"shots":[{
            "file":"clip-01.mp4","source_sha256":sha256(clip),
            "start_frame":0,"frames":len(frames),
            "caption":f"Locally learned neural spatial motion: {label} (not text-to-video)",
            "rights_ref":"derived-from-verified-owned-video",
            "fade_in_frames":0,"fade_out_frames":0,
        }]}
        board_path=stage/"eternyx-video-v2.json"
        board_path.write_text(json.dumps(board,indent=2)+"\n")
        result=render(board_path,stage,stage/"render",profile=profile,quality=quality)
        final=stage/"render"/"video.mp4"
        report={
            "version":1,"kind":"cpu_tagged_spatial_motion_sample",
            "neural_motion_classifier":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(motion_path),
            "tag":label,"seconds":seconds,"seed":seed,"fps":FPS,
            "width":v2.W,"height":v2.H,
            "motion_strength_percent":strength,
            "motion_sampling":"seeded" if seeded_motion else "argmax",
            "stability_percent":stability,"variation_percent":variation,
            "profile":profile,"quality":quality,
            "raw_rgb_sha256":hashlib.sha256(raw).hexdigest(),
            "source_clip_sha256":sha256(clip),
            "video_sha256":sha256(final),"video_bytes":final.stat().st_size,
            "frame_count":len(frames),
            "temporal_diagnostics":v2.raw_diagnostics(frames),
            "description":"Trained 4x3 tile motion drives a frozen-base tagged neural texture; no cinematic or semantic claim.",
        }
        if result["video"]["sha256"]!=report["video_sha256"]:
            raise ValueError("Renderer report and actual finished MP4 SHA-256 differ")
        (stage/"generation-report.json").write_text(json.dumps(report,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def compare(base_path,tag_path,motion_path,first,second,output,
            seconds=1,seed=42,strength=75):
    validate_output_dir(output)
    if first==second:raise ValueError("Compare two distinct trained spatial-motion tags")
    motion=verify_model(motion_path)
    if first not in motion["tags"] or second not in motion["tags"]:
        raise ValueError("Only trained tags may be compared")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-spatial-pair-",dir=output.parent))
    try:
        reports=[]
        for index,label in enumerate((first,second),1):
            r=generate(base_path,tag_path,motion_path,label,
                stage/f"candidate-{index:02d}",seconds=seconds,seed=seed,
                strength=strength)
            reports.append(r)
        left=stage/"candidate-01"/"render"/"video.mp4"
        right=stage/"candidate-02"/"render"/"video.mp4"
        cmd=["ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
             "-protocol_whitelist","file,pipe","-i",str(left),
             "-protocol_whitelist","file,pipe","-i",str(right),
             "-filter_complex_threads","1","-filter_complex",
             "[0:v]setpts=PTS-STARTPTS[l];[1:v]setpts=PTS-STARTPTS[r];"
             "[l][r]hstack=inputs=2[out]","-map","[out]","-an","-sn",
             "-dn","-frames:v",str(seconds*FPS),"-c:v","libx264",
             "-preset","ultrafast","-crf","23","-pix_fmt","yuv420p",
             "-movflags","+faststart",str(stage/"comparison.mp4")]
        try:
            proc=subprocess.run(cmd,capture_output=True,check=False,timeout=120)
        except (OSError,subprocess.TimeoutExpired) as err:
            raise ValueError("Offline CPU spatial pair encoder unavailable") from err
        final=stage/"comparison.mp4"
        if proc.returncode or not final.is_file() or not 0<final.stat().st_size<=MAX_VIDEO_BYTES:
            raise ValueError("No real side-by-side motion MP4 produced")
        if video_info(probe(final,count_frames=True))!=(512,144,seconds*FPS):
            raise ValueError("Wrong actual paired motion video size/frame count")
        report={
            "version":1,"kind":"cpu_tagged_spatial_motion_comparison",
            "neural_motion_classifier":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(motion_path),
            "tags":[first,second],"seconds":seconds,"seed":seed,
            "motion_strength_percent":strength,
            "candidates":[{
                "tag":tag,"file":f"candidate-{idx:02d}/render/video.mp4",
                "sha256":item["video_sha256"],"video_bytes":item["video_bytes"],
                "frame_count":item["frame_count"],"raw_rgb_sha256":item["raw_rgb_sha256"],
            } for idx,(tag,item) in enumerate(zip((first,second),reports),1)],
            "comparison":{
                "file":"comparison.mp4","sha256":sha256(final),
                "video_bytes":final.stat().st_size,"width":512,
                "height":144,"frame_count":seconds*FPS,
            },
            "interpretation":"Original local labels now have learned tile-level motion; no photorealistic or text-prompt claim.",
        }
        (stage/"comparison-report.json").write_text(json.dumps(report,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="action",required=True)
    training=sub.add_parser("train")
    for p in (training,):
        p.add_argument("--base",required=True,type=Path)
        p.add_argument("--tag-model",required=True,type=Path)
        p.add_argument("--input",required=True,type=Path)
        p.add_argument("--output",required=True,type=Path)
        p.add_argument("--epochs",type=int,default=2)
        p.add_argument("--seed",type=int,default=42)
    sampling=sub.add_parser("generate")
    sampling.add_argument("--base",required=True,type=Path)
    sampling.add_argument("--tag-model",required=True,type=Path)
    sampling.add_argument("--motion-model",required=True,type=Path)
    sampling.add_argument("--output",required=True,type=Path)
    sampling.add_argument("--tag",required=True)
    sampling.add_argument("--seconds",type=int,default=2)
    sampling.add_argument("--seed",type=int,default=42)
    sampling.add_argument("--strength",type=int,default=75)
    sampling.add_argument("--stability",type=int,default=45)
    sampling.add_argument("--variation",type=int,default=6)
    sampling.add_argument("--seeded-motion",action="store_true")
    sampling.add_argument("--profile",choices=("landscape","portrait","square"),default="landscape")
    sampling.add_argument("--quality",choices=("standard","high"),default="standard")
    comparison=sub.add_parser("compare")
    comparison.add_argument("--base",required=True,type=Path)
    comparison.add_argument("--tag-model",required=True,type=Path)
    comparison.add_argument("--motion-model",required=True,type=Path)
    comparison.add_argument("--output",required=True,type=Path)
    comparison.add_argument("--first",required=True)
    comparison.add_argument("--second",required=True)
    comparison.add_argument("--seconds",type=int,default=1)
    comparison.add_argument("--seed",type=int,default=42)
    comparison.add_argument("--strength",type=int,default=75)
    args=parser.parse_args()
    try:
        if args.action=="train":
            result=train(args.base,args.tag_model,args.input,args.output,args.epochs,args.seed)
        elif args.action=="generate":
            result=generate(args.base,args.tag_model,args.motion_model,args.tag,
                            args.output,args.seconds,args.seed,args.strength,
                            args.stability,args.variation,args.seeded_motion,
                            args.profile,args.quality)
        else:
            result=compare(args.base,args.tag_model,args.motion_model,args.first,
                           args.second,args.output,args.seconds,args.seed,args.strength)
        print(json.dumps(result,allow_nan=False))
    except (OSError,ValueError,KeyError,TypeError) as err:
        parser.error(str(err))


if __name__=="__main__":
    main()
