"""Learn local block motion from verified footage for ETERNYX tiny neural video.

An actual trainable 9-class, 7-feature softmax motion classifier learns 3x3
pixel displacements from 4x3 spatial tiles and preceding-frame appearance.
Training targets are local block matches from REAL licensed decoded frames,
not source filenames or magic prompt words. Per-tag base and RGB adapters stay
FROZEN. Held-out evaluation reports cross-entropy and accuracy against static
and empirical-majority baselines. Inference uses the learned motion probabilities
with interpolation across tile boundaries and produces real CPU H264 video.
This is NOT optical flow at professional resolution, semantic text-to-video,
photorealistic motion or guaranteed improved appearance.
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

import adapt_neural_rollout as adaptation
import train_spatiotemporal_neural_video as v2
import train_tagged_neural_video as tagged
from learn_cpu_video_texture import validate_output_dir
from render_video_timeline import FPS, probe, video_info, render, sha256

TILES_X,TILES_Y=4,3
TILES=TILES_X*TILES_Y
FEATURES=7
CLASSES=9
MAX_SOURCES=3
MAX_EPOCHS=4
MAX_SECONDS=2
MAX_MODEL_BYTES=131072
MAX_VIDEO_BYTES=64*1024*1024
RATE=.075


def tile_bounds(cell):
    tx,ty=cell%TILES_X,cell//TILES_X
    return (tx*v2.W//TILES_X,(tx+1)*v2.W//TILES_X,
            ty*v2.H//TILES_Y,(ty+1)*v2.H//TILES_Y)


def tile_features(frame,cell):
    if len(frame)!=v2.N or type(cell) is not int or not 0<=cell<TILES:
        raise ValueError("Invalid 48x28 neural tile frame")
    x0,x1,y0,y1=tile_bounds(cell)
    means=[0.,0.,0.]
    gx=gy=0.
    n=0
    for y in range(y0,y1):
        for x in range(x0,x1):
            here=v2.colors(frame[y*v2.W+x])
            for k in range(3):means[k]+=here[k]
            right=v2.colors(frame[y*v2.W+min(v2.W-1,x+1)])
            below=v2.colors(frame[min(v2.H-1,y+1)*v2.W+x])
            gx+=sum(abs(a-b) for a,b in zip(here,right))/3
            gy+=sum(abs(a-b) for a,b in zip(here,below))/3
            n+=1
    return [*(v/n for v in means),gx/n,gy/n,
            ((cell%TILES_X)+.5)/TILES_X,
            ((cell//TILES_X)+.5)/TILES_Y]


def measured_shift(prev,current,cell):
    if len(prev)!=v2.N or len(current)!=v2.N:
        raise ValueError("Observed shift requires real equal-sized decoded frames")
    x0,x1,y0,y1=tile_bounds(cell)
    # Compare interior pixels against 3x3 candidate local predecessor displacements.
    # Tie-break favors zero motion; score is an empirical correspondence proxy.
    results=[]
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            total=count=0
            for y in range(y0+1,y1-1,2):
                for x in range(x0+1,x1-1,2):
                    a=v2.colors(current[y*v2.W+x])
                    b=v2.colors(prev[(y-dy)*v2.W+x-dx])
                    total+=sum(abs(i-j) for i,j in zip(a,b))
                    count+=3
            if count==0:raise ValueError("Motion tile has no interior measurement pixels")
            label=(dy+1)*3+dx+1
            results.append((total/count,abs(dx)+abs(dy),label))
    return min(results)[2]


def new_weights(seed):
    rng=random.Random(seed)
    return [[rng.uniform(-.01,.01) for _ in range(FEATURES+1)]
            for _ in range(CLASSES)]


def probabilities(weights,features):
    if len(features)!=FEATURES:
        raise ValueError("Classifier requires seven actual tile appearance features")
    inputs=features+[1.]
    logits=[sum(a*b for a,b in zip(row,inputs)) for row in weights]
    mx=max(logits)
    exp=[math.exp(min(30,value-mx)) for value in logits]
    norm=sum(exp)
    return [value/norm for value in exp]


def update(weights,features,label):
    prob=probabilities(weights,features)
    inputs=features+[1.]
    for k in range(CLASSES):
        delta=(prob[k]-(1 if k==label else 0))*RATE
        for j in range(FEATURES+1):
            weights[k][j]-=delta*inputs[j]


def accuracy_metrics(weights,examples,majority):
    if not examples:raise ValueError("Training/validation must contain real local tile shifts")
    loss=0.
    correct=stationary=prior=0
    for feat,label in examples:
        probs=probabilities(weights,feat)
        prediction=max(range(CLASSES),key=lambda k:probs[k])
        loss-=math.log(max(1e-12,probs[label]))
        correct+=int(prediction==label)
        stationary+=int(label==4)
        prior+=int(label==majority)
    n=len(examples)
    return {
        "evaluated_tiles":n,
        "cross_entropy":round(loss/n,8),
        "classifier_accuracy":round(correct/n,8),
        "stationary_baseline_accuracy":round(stationary/n,8),
        "training_majority_baseline_accuracy":round(prior/n,8),
    }


def samples_for_frames(frames,cutoff):
    fit=[];holdout=[]
    for t in range(1,len(frames)):
        seq=[(tile_features(frames[t-1],cell),
              measured_shift(frames[t-1],frames[t],cell))
             for cell in range(TILES)]
        (fit if t<cutoff else holdout).extend(seq)
    return fit,holdout


def verified_tag_sources(base,tag_model,root):
    datasets=adaptation.training_sources(base,root)
    source_map={s["file"]:(s,frames,cutoff) for s,frames,cutoff in datasets}
    trained_files=tag_model.get("file_tags")
    if not isinstance(trained_files,list) or len(trained_files)!=len(datasets):
        raise ValueError("Frozen tag adapter's original source list does not match base model")
    groups={tag:[] for tag in tag_model["tags"]}
    seen=set()
    for entry in trained_files:
        name=entry.get("file")
        if name not in source_map or name in seen or entry.get("tag") not in groups:
            raise ValueError("Tag mapping does not match the verified original sources")
        seen.add(name)
        source,frames,cutoff=source_map[name]
        if (entry.get("sha256")!=source["sha256"] or
                entry.get("used_frames")!=len(frames) or
                entry.get("train_frames")!=cutoff or
                entry.get("holdout_frames")!=len(frames)-cutoff):
            raise ValueError("Tag checkpoint source SHA or training/holdout split changed")
        groups[entry["tag"]].append((source,frames,cutoff))
    if len(groups)<2 or len(groups)>3 or any(not items for items in groups.values()):
        raise ValueError("Every learned motion tag needs at least one original source")
    return groups


def train(base_path,tag_path,root,output,epochs=2,seed=42):
    validate_output_dir(output)
    if type(epochs) is not int or not 1<=epochs<=MAX_EPOCHS:
        raise ValueError("Train 1–4 local CPU motion epochs")
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("Motion seed must be a nonnegative 31-bit integer")
    base=v2.read_model(base_path)
    tags=tagged.verify_model(tag_path)
    if sha256(base_path)!=tags["base_model_sha256"]:
        raise ValueError("Frozen neural base SHA-256 is not the original tag training base")
    groups=verified_tag_sources(base,tags,root)
    trained={}
    metrics={}
    start=perf_counter()
    for label,items in sorted(groups.items()):
        train_data=[];heldout=[]
        for _,frames,cutoff in items:
            fit,hold=samples_for_frames(frames,cutoff)
            train_data.extend(fit);heldout.extend(hold)
        counts=[0]*CLASSES
        for _,cls in train_data:counts[cls]+=1
        majority=max(range(CLASSES),key=lambda k:(counts[k],-abs(k-4),-k))
        weights=new_weights(seed+sum((i+1)*ord(c) for i,c in enumerate(label)))
        before=accuracy_metrics(weights,train_data,majority)
        rng=random.Random(seed+len(label)*1031)
        for _ in range(epochs):
            rng.shuffle(train_data)
            for feat,cls in train_data:update(weights,feat,cls)
        after=accuracy_metrics(weights,train_data,majority)
        evalr=accuracy_metrics(weights,heldout,majority)
        trained[label]={
            "weights":weights,"training_shift_counts":counts,
            "majority_motion_class":majority,
            "source_sha256":[s["sha256"] for s,_,_ in items],
        }
        metrics[label]={
            "train_cross_entropy_before":before["cross_entropy"],
            "train_cross_entropy_after":after["cross_entropy"],
            "training_tiles":len(train_data),
            "heldout":evalr,
            "source_count":len(items),
        }
    data={
        "version":1,"kind":"cpu_neural_tag_spatial_motion",
        "neural_network":True,"text_to_video":False,"model_generation":True,
        "base_model_sha256":sha256(base_path),
        "tag_model_sha256":sha256(tag_path),
        "architecture":"per_tag_softmax_9x8_tile_features",
        "tiles_x":TILES_X,"tiles_y":TILES_Y,
        "trained_width":v2.W,"trained_height":v2.H,"fps":FPS,
        "epochs":epochs,"seed":seed,"tags":trained,"metrics":metrics,
        "training_seconds":round(perf_counter()-start,6),
    }
    raw=json.dumps(data,separators=(",",":"),allow_nan=False).encode()
    if len(raw)>MAX_MODEL_BYTES:
        raise ValueError("Motion model exceeds 128 KiB")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-local-motion-train-",dir=output.parent))
    try:
        model_path=stage/"motion-model.json"
        model_path.write_bytes(raw+b"\n")
        read_motion_model(model_path)
        report={
            "version":1,"kind":"cpu_neural_tag_motion_training",
            "neural_network":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(model_path),
            "labels":sorted(trained),"metrics":metrics,
            "epochs":epochs,"seed":seed,"training_seconds":data["training_seconds"],
            "source_sha256_by_tag":{
                tag:trained[tag]["source_sha256"] for tag in sorted(trained)
            },
            "interpretation":"Learned coarse tile displacements; heldout accuracy need not beat static/global priors.",
        }
        (stage/"training-report.json").write_text(json.dumps(report,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def read_motion_model(path):
    if path.is_symlink() or not path.is_file() or not 0<path.stat().st_size<=MAX_MODEL_BYTES:
        raise ValueError("Motion checkpoint must be a bounded actual local file")
    try:
        obj=json.loads(path.read_bytes())
    except (UnicodeError,json.JSONDecodeError) as error:
        raise ValueError("Malformed motion checkpoint JSON") from error
    if (not isinstance(obj,dict) or obj.get("version")!=1 or
            obj.get("kind")!="cpu_neural_tag_spatial_motion" or
            obj.get("neural_network") is not True or
            obj.get("text_to_video") is not False or
            obj.get("model_generation") is not True or
            obj.get("architecture")!="per_tag_softmax_9x8_tile_features" or
            obj.get("tiles_x")!=TILES_X or obj.get("tiles_y")!=TILES_Y or
            obj.get("trained_width")!=v2.W or obj.get("trained_height")!=v2.H or
            obj.get("fps")!=FPS):
        raise ValueError("Unsupported trained local spatial motion format")
    for key in ("base_model_sha256","tag_model_sha256"):
        sha=obj.get(key)
        if not isinstance(sha,str) or len(sha)!=64 or any(c not in "0123456789abcdef" for c in sha):
            raise ValueError("Invalid original neural checkpoint identity")
    tags=obj.get("tags")
    if not isinstance(tags,dict) or not 2<=len(tags)<=3:
        raise ValueError("Missing trained local motion tags")
    for tag,row in tags.items():
        tagged.check_tag(tag)
        if not isinstance(row,dict):raise ValueError("Missing trained motion data")
        weights=row.get("weights")
        if (not isinstance(weights,list) or len(weights)!=CLASSES or
                any(not isinstance(vals,list) or len(vals)!=FEATURES+1 or
                    any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>30
                        for v in vals) for vals in weights)):
            raise ValueError("Invalid trained motion softmax weights")
        counts=row.get("training_shift_counts")
        if (not isinstance(counts,list) or len(counts)!=CLASSES or
                any(type(v) is not int or not 0<=v<=MAX_SOURCES*v2.MAX_SOURCE_FRAMES*TILES
                    for v in counts) or sum(counts)<1):
            raise ValueError("Invalid observed local shift histogram")
        majority=row.get("majority_motion_class")
        if type(majority) is not int or not 0<=majority<CLASSES:
            raise ValueError("Missing learned motion majority baseline")
        hashes=row.get("source_sha256")
        if not isinstance(hashes,list) or not 1<=len(hashes)<=MAX_SOURCES or any(
            not isinstance(h,str) or len(h)!=64 or any(c not in "0123456789abcdef" for c in h)
            for h in hashes):
            raise ValueError("Invalid per-tag source identity")
    if set(tags)!=set(obj.get("metrics",{})):
        raise ValueError("Missing tag-specific motion measurement metadata")
    return obj


def regional_motion(frame,weights,rng):
    """Choose one trained shift per 4x3 tile, not a global clip-wide shift."""
    shifts=[]
    for tile in range(TILES):
        distribution=probabilities(weights,tile_features(frame,tile))
        # Smaller 0.5 sampling temperature favors supported learned shifts.
        logits=[math.sqrt(max(0.,prob)) for prob in distribution]
        cls=rng.choices(range(CLASSES),weights=logits,k=1)[0]
        shifts.append((cls%3-1,cls//3-1))
    return shifts


def warp(frame,shifts,strength):
    """Bilinear interpolation of neighboring tile flow avoids hard tile seams."""
    if len(frame)!=v2.N or len(shifts)!=TILES:
        raise ValueError("Invalid spatial learned flow input")
    if type(strength) is not int or not 0<=strength<=100:
        raise ValueError("Spatial motion strength must be an integer 0–100")
    out=bytearray(v2.N)
    for y in range(v2.H):
        fy=max(0.,min(TILES_Y-1.,(y+.5)*TILES_Y/v2.H-.5))
        y0=int(fy);y1=min(TILES_Y-1,y0+1);wy=fy-y0
        for x in range(v2.W):
            fx=max(0.,min(TILES_X-1.,(x+.5)*TILES_X/v2.W-.5))
            x0=int(fx);x1=min(TILES_X-1,x0+1);wx=fx-x0
            vectors=[
                (shifts[y0*TILES_X+x0],(1-wx)*(1-wy)),
                (shifts[y0*TILES_X+x1],wx*(1-wy)),
                (shifts[y1*TILES_X+x0],(1-wx)*wy),
                (shifts[y1*TILES_X+x1],wx*wy),
            ]
            dx=sum(vector[0][0]*w for vector,w in vectors)*strength/100
            dy=sum(vector[0][1]*w for vector,w in vectors)*strength/100
            xx=max(0,min(v2.W-1,round(x-dx)))
            yy=max(0,min(v2.H-1,round(y-dy)))
            out[y*v2.W+x]=frame[yy*v2.W+xx]
    return bytes(out)


def sample_frames(base,tag_adapter,motion,tag,seconds,seed,
                  strength=85,stability=45,variation=6):
    if tag not in tag_adapter["tags"] or tag not in motion["tags"]:
        raise ValueError("Sampling requires an actually trained motion and color tag")
    if type(seconds) is not int or not 1<=seconds<=MAX_SECONDS:
        raise ValueError("Motion video duration must be 1–2 seconds")
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("Sampling seed must be nonnegative 31-bit integer")
    if type(strength) is not int or not 0<=strength<=100:
        raise ValueError("Learned motion strength must be integer 0–100")
    if type(stability) is not int or not 0<=stability<=85:
        raise ValueError("Stability must be 0–85")
    if type(variation) is not int or not 0<=variation<=20:
        raise ValueError("Variation must be 0–20")
    rng=random.Random(seed)
    trained=tag_adapter["tags"][tag]
    initial=bytearray(v2.N)
    for pos in range(v2.N):
        x,y=pos%v2.W,pos//v2.W
        tile=(y*v2.GRID_H//v2.H)*v2.GRID_W+x*v2.GRID_W//v2.W
        color=[max(0,min(.999,value+rng.uniform(-.08,.08)))
               for value in trained["start_grid"][tile]]
        initial[pos]=v2.quantized(*color)
    older=recent=bytes(initial)
    frames=[v2.sample_rgb(initial)]
    innovations=[0.0]*(v2.N*3)
    for frame_no in range(1,seconds*FPS):
        flows=regional_motion(recent,motion["tags"][tag]["weights"],rng)
        current=warp(recent,flows,strength)
        preceding=warp(older,flows,strength)
        updated=bytearray(v2.N)
        rgb=bytearray(v2.N*3)
        phase=frame_no/max(1,seconds*FPS-1)
        for pos in range(v2.N):
            _,predicted=tagged.styled_output(
                base["weights"],trained["adapter_weights"],
                preceding,current,pos,phase)
            prior=v2.colors(current[pos])
            values=[]
            for k in range(3):
                noise=innovations[3*pos+k]*.85+rng.gauss(0,1)*.53
                innovations[3*pos+k]=noise
                color=max(0.,min(.999,predicted[k]*(1-stability/100)+
                                  prior[k]*(stability/100)+noise*variation/100))
                values.append(color)
                rgb[3*pos+k]=int(color*255)
            updated[pos]=v2.quantized(*values)
        older,recent=recent,bytes(updated)
        frames.append(bytes(rgb))
    return frames


def generate(base_path,tag_path,motion_path,tag,output,seconds=1,seed=42,
             strength=85,stability=45,variation=6):
    validate_output_dir(output)
    base=v2.read_model(base_path)
    style=tagged.verify_model(tag_path)
    motion=read_motion_model(motion_path)
    if (sha256(base_path)!=style["base_model_sha256"] or
            sha256(base_path)!=motion["base_model_sha256"] or
            sha256(tag_path)!=motion["tag_model_sha256"] or
            set(style["tags"])!=set(motion["tags"])):
        raise ValueError("Frozen base/tag adapter SHA-256 or tag labels do not match trained motion")
    frames=sample_frames(base,style,motion,tag,seconds,seed,strength,stability,variation)
    raw=b"".join(frames)
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-spatial-motion-sample-",dir=output.parent))
    try:
        clip=stage/"clip-01.mp4"
        cmd=["ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
             "-f","rawvideo","-pixel_format","rgb24",
             "-video_size",f"{v2.W}x{v2.H}","-framerate",str(FPS),"-i","pipe:0",
             "-map","0:v:0","-an","-sn","-dn","-map_metadata","-1",
             "-frames:v",str(len(frames)),"-c:v","libx264","-preset","ultrafast",
             "-crf","23","-pix_fmt","yuv420p","-movflags","+faststart",str(clip)]
        try:
            proc=subprocess.run(cmd,input=raw,capture_output=True,check=False,timeout=90)
        except (OSError,subprocess.TimeoutExpired) as error:
            raise ValueError("Local CPU motion clip encoder unavailable or timed out") from error
        if proc.returncode or not clip.is_file() or not 0<clip.stat().st_size<=MAX_VIDEO_BYTES:
            raise ValueError("CPU spatial neural clip encoding failed")
        if video_info(probe(clip,count_frames=True))!=(v2.W,v2.H,len(frames)):
            raise ValueError("Actual decoded neural frames mismatch")
        board={"version":2,"shots":[{
            "file":"clip-01.mp4","source_sha256":sha256(clip),"start_frame":0,
            "frames":len(frames),
            "caption":f"Learned local neural motion, label {tag} (not text-to-video)",
            "rights_ref":"derived-from-verified-owned-training-clips",
            "fade_in_frames":0,"fade_out_frames":0,
        }]}
        board_path=stage/"eternyx-video-v2.json"
        board_path.write_text(json.dumps(board,indent=2)+"\n")
        rendered=render(board_path,stage,stage/"render",
                        profile="landscape",quality="standard")
        video=stage/"render"/"video.mp4"
        receipt={
            "version":1,"kind":"cpu_neural_tag_spatial_motion_sample",
            "neural_network":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),"tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(motion_path),
            "tag":tag,"seconds":seconds,"seed":seed,"fps":FPS,
            "spatial_motion_strength":strength,
            "stability_percent":stability,"variation_percent":variation,
            "raw_rgb_sha256":hashlib.sha256(raw).hexdigest(),
            "source_clip_sha256":sha256(clip),
            "video_sha256":sha256(video),"video_bytes":video.stat().st_size,
            "frame_count":len(frames),"width":256,"height":144,
            "raw_temporal_metrics":v2.raw_diagnostics(frames),
            "interpretation":"Learned coarse 4x3 local displacement, not full optical flow or cinematic quality.",
        }
        if receipt["video_sha256"]!=rendered["video"]["sha256"]:
            raise ValueError("Local H264 renderer manifest hash mismatch")
        (stage/"generation-report.json").write_text(json.dumps(receipt,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return receipt
    finally:
        if stage.exists():shutil.rmtree(stage)


def compare(base_path,tag_path,motion_path,tag,output,seconds=1,seed=42,strength=85):
    validate_output_dir(output)
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-spatial-motion-compare-",dir=output.parent))
    try:
        before=tagged.generate(base_path,tag_path,tag,stage/"global-motion",
                               seconds=seconds,seed=seed)
        after=generate(base_path,tag_path,motion_path,tag,stage/"spatial-motion",
                       seconds=seconds,seed=seed,strength=strength)
        left=stage/"global-motion"/"render"/"video.mp4"
        right=stage/"spatial-motion"/"render"/"video.mp4"
        result=adaptation.side_by_side(left,right,stage/"comparison.mp4",seconds*FPS)
        receipt={
            "version":1,"kind":"cpu_neural_spatial_motion_comparison",
            "neural_network":True,"text_to_video":False,
            "tag":tag,"base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(tag_path),
            "motion_model_sha256":sha256(motion_path),
            "seconds":seconds,"seed":seed,"strength":strength,
            "artifacts":{
                "global":{
                    "file":"global-motion/render/video.mp4",
                    "sha256":before["video_sha256"],
                    "video_bytes":before["video_bytes"],
                    "frame_count":seconds*FPS,
                },
                "spatial":{
                    "file":"spatial-motion/render/video.mp4",
                    "sha256":after["video_sha256"],
                    "video_bytes":after["video_bytes"],
                    "frame_count":seconds*FPS,
                },
                "comparison":result,
            },
            "interpretation":"Same tag/seed, old global shift vs trained regional motion; not evidence of superior perceptual quality.",
        }
        (stage/"comparison-report.json").write_text(json.dumps(receipt,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return receipt
    finally:
        if stage.exists():shutil.rmtree(stage)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    commands=p.add_subparsers(dest="action",required=True)
    t=commands.add_parser("train")
    t.add_argument("--base",type=Path,required=True)
    t.add_argument("--tags",type=Path,required=True)
    t.add_argument("--input",type=Path,required=True)
    t.add_argument("--output",type=Path,required=True)
    t.add_argument("--epochs",type=int,default=2)
    t.add_argument("--seed",type=int,default=42)
    g=commands.add_parser("generate")
    g.add_argument("--base",type=Path,required=True)
    g.add_argument("--tags",type=Path,required=True)
    g.add_argument("--motion",type=Path,required=True)
    g.add_argument("--tag",required=True)
    g.add_argument("--output",type=Path,required=True)
    g.add_argument("--seconds",type=int,default=1)
    g.add_argument("--seed",type=int,default=42)
    g.add_argument("--strength",type=int,default=85)
    g.add_argument("--stability",type=int,default=45)
    g.add_argument("--variation",type=int,default=6)
    c=commands.add_parser("compare")
    c.add_argument("--base",type=Path,required=True)
    c.add_argument("--tags",type=Path,required=True)
    c.add_argument("--motion",type=Path,required=True)
    c.add_argument("--tag",required=True)
    c.add_argument("--output",type=Path,required=True)
    c.add_argument("--seconds",type=int,default=1)
    c.add_argument("--seed",type=int,default=42)
    c.add_argument("--strength",type=int,default=85)
    args=p.parse_args()
    try:
        if args.action=="train":
            result=train(args.base,args.tags,args.input,args.output,args.epochs,args.seed)
        elif args.action=="generate":
            result=generate(args.base,args.tags,args.motion,args.tag,args.output,
                            args.seconds,args.seed,args.strength,args.stability,args.variation)
        else:
            result=compare(args.base,args.tags,args.motion,args.tag,args.output,
                           args.seconds,args.seed,args.strength)
        print(json.dumps(result,allow_nan=False))
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError) as error:
        p.error(str(error))


if __name__=="__main__":
    main()
