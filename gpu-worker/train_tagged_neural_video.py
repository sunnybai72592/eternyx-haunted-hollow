"""Train real local label-conditioned neural video styles on frozen ETERNYX v2 weights.

A **tiny learned 3x17 conditional output adapter**, not natural-language
text-to-video. Human-approved short tag names are learned from local MP4s:
their actual 48x28 RGB frames update tag-specific output weights using SGD.
Frozen two-frame base neural weights remain unchanged. Tags encode small
abstract color/texture differences, not semantic scenes or a diffusion model.

Only Python stdlib + offline FFmpeg/FFprobe/libx264. No GPU, paid API,
model download, network transfer, or pretrained large language model.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import random
import re
import shutil
import subprocess
import tempfile
from time import perf_counter

import adapt_neural_rollout as adaptation
import train_spatiotemporal_neural_video as v2
from learn_cpu_video_texture import checked_input, validate_output_dir
from render_video_timeline import FPS, render, sha256, probe, video_info

TAG_RE=re.compile(r"^[a-z][a-z0-9_-]{1,23}$")
MAX_TAGS=3
MAX_EPOCHS=4
MAX_SECONDS=3
MAX_MODEL_BYTES=131072
MAX_VIDEO_BYTES=64*1024*1024
SAMPLES_PER_PAIR=40
ADAPTER_LR=0.085


def check_tag(value):
    if not isinstance(value,str) or not TAG_RE.fullmatch(value):
        raise ValueError("Tag must be 2–24 lowercase letters, digits, hyphens or underscores, starting with a letter")
    return value


def check_mapping(mapping,sources):
    if not isinstance(mapping,dict) or len(mapping)!=len(sources) or not 2<=len(mapping)<=3:
        raise ValueError("Tag training requires exactly one declared tag per each of 2–3 approved model sources")
    valid={s["file"] for s,_,_ in sources}
    if set(mapping)!=valid:
        raise ValueError("Every tag-file must match the verified original source filename")
    for label in mapping.values():check_tag(label)
    tags=sorted(set(mapping.values()))
    if not 2<=len(tags)<=MAX_TAGS:
        raise ValueError("Provide two or three distinct trained tags on separate local footage")
    return tags


def zero_weights():
    return [[0.0]*17 for _ in range(3)]


def styled_output(base_weights,adapter,older,recent,pos,phase):
    hidden,base=v2.forward(base_weights,v2.feature(older,recent,pos,phase))
    # A small, trainable per-tag affine transform of base neural output logits.
    inputs=hidden+[1.0]
    output=[]
    for k in range(3):
        base_logit=math.log(max(1e-6,min(1-1e-6,base[k]))/
                            (1-max(1e-6,min(1-1e-6,base[k]))))
        diff=sum(w*x for w,x in zip(adapter[k],inputs))
        logit=max(-30.0,min(30.0,base_logit+diff))
        output.append(1/(1+math.exp(-logit)))
    return inputs,output


def train_example(base_weights,adapter,example):
    older,recent,target,pos,phase=example
    features,predicted=styled_output(base_weights,adapter,older,recent,pos,phase)
    truth=v2.colors(target[pos])
    for k in range(3):
        delta=(2/3)*(predicted[k]-truth[k])*predicted[k]*(1-predicted[k])
        for j in range(17):
            adapter[k][j]-=ADAPTER_LR*delta*features[j]


def mse(base_weights,adapter,examples):
    if not examples:raise ValueError("No train/holdout next-frame examples")
    result=baseline=0.0
    for older,recent,target,pos,phase in examples:
        _,predicted=styled_output(base_weights,adapter,older,recent,pos,phase)
        _,plain=v2.forward(base_weights,v2.feature(older,recent,pos,phase))
        target_color=v2.colors(target[pos])
        result+=sum((p-y)**2 for p,y in zip(predicted,target_color))
        baseline+=sum((p-y)**2 for p,y in zip(plain,target_color))
    return result/(len(examples)*3),baseline/(len(examples)*3)


def training_examples(frames,cutoff):
    train=[]
    heldout=[]
    for t in range(2,len(frames)):
        positions=random.Random(17011*t+len(frames)).sample(range(v2.N),SAMPLES_PER_PAIR)
        examples=[(frames[t-2],frames[t-1],frames[t],pos,t/(len(frames)-1))
                  for pos in positions]
        (train if t<cutoff else heldout).extend(examples)
    return train,heldout


def tag_grid_and_motion(items):
    grid=[[0.0,0.0,0.0] for _ in range(v2.GRID_W*v2.GRID_H)]
    counts=[0]*len(grid)
    shifts=[0]*9
    for _,frames,cutoff in items:
        for frame in frames[:cutoff]:
            for pos,color_id in enumerate(frame):
                x,y=pos%v2.W,pos//v2.W
                cell=(y*v2.GRID_H//v2.H)*v2.GRID_W+x*v2.GRID_W//v2.W
                for k,color in enumerate(v2.colors(color_id)):
                    grid[cell][k]+=color
                counts[cell]+=1
        for t in range(1,cutoff):
            shifts[v2.observed_shift(frames[t-1],frames[t])]+=1
    if min(counts)<=0 or sum(shifts)<=0:
        raise ValueError("Insufficient local training-prefix style information")
    return [[round(value/counts[i],8) for value in row]
            for i,row in enumerate(grid)],shifts


def train(base_path,folder,output,file_tags,epochs=2,seed=42):
    validate_output_dir(output)
    if type(epochs) is not int or not 1<=epochs<=MAX_EPOCHS:
        raise ValueError("Style training epochs must be integers 1–4")
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("Training seed must be a nonnegative 31-bit integer")
    original=v2.read_model(base_path)
    datasets=adaptation.training_sources(original,folder)
    tags=check_mapping(file_tags,datasets)
    by_tag={tag:[] for tag in tags}
    for item in datasets:by_tag[file_tags[item[0]["file"]]].append(item)
    if any(not group for group in by_tag.values()):
        raise ValueError("Each requested trained tag needs verified local training footage")
    trained={}
    evaluations={}
    start=perf_counter()
    for tag,items in sorted(by_tag.items()):
        train_pairs=[]
        heldout_pairs=[]
        for _,frames,cutoff in items:
            training,heldout=training_examples(frames,cutoff)
            train_pairs+=training
            heldout_pairs+=heldout
        weights=zero_weights()
        before,_=mse(original["weights"],weights,train_pairs)
        rng=random.Random(seed+sum((i+1)*ord(c) for i,c in enumerate(tag)))
        for _ in range(epochs):
            rng.shuffle(train_pairs)
            for example in train_pairs:
                train_example(original["weights"],weights,example)
        after,_=mse(original["weights"],weights,train_pairs)
        holdout_neural,holdout_base=mse(original["weights"],weights,heldout_pairs)
        grid,motion=tag_grid_and_motion(items)
        trained[tag]={
            "adapter_weights":weights,
            "start_grid":grid,"motion_histogram":motion,
            "source_sha256":[item[0]["sha256"] for item in items],
        }
        evaluations[tag]={
            "train_examples":len(train_pairs),"holdout_examples":len(heldout_pairs),
            "train_mse_before":round(before,8),"train_mse_after":round(after,8),
            "holdout_style_mse":round(holdout_neural,8),
            "holdout_frozen_base_mse":round(holdout_base,8),
            "source_count":len(items),
        }
    elapsed=round(perf_counter()-start,6)
    result={
        "version":1,"kind":"cpu_neural_locally_tag_conditioned",
        "neural_network":True,"text_to_video":False,
        "model_generation":True,"base_model_sha256":sha256(base_path),
        "base_architecture":"48x28_two_frame_neural_mlp_frozen",
        "adapter_architecture":"per_tag_rgb_logit_residual_3x17",
        "fps":FPS,"width":v2.W,"height":v2.H,
        "seed":seed,"epochs":epochs,
        "file_tags":[{"file":source["file"],"tag":file_tags[source["file"]],
                      "sha256":source["sha256"],"rights_ref":source["rights_ref"],
                      "used_frames":source["used_frames"],
                      "train_frames":source["train_frames"],
                      "holdout_frames":source["holdout_frames"]}
                     for source,_,_ in datasets],
        "tags":trained,"metrics":evaluations,
        "training_seconds":elapsed,
    }
    raw=json.dumps(result,separators=(",",":"),allow_nan=False).encode()
    if len(raw)>MAX_MODEL_BYTES:
        raise ValueError("Learned tag adapter exceeds 128 KiB")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-tag-training-",dir=output.parent))
    try:
        path=stage/"tag-model.json"
        path.write_bytes(raw+b"\n")
        verify_model(path)
        report={
            "version":1,"kind":"cpu_neural_tag_training",
            "neural_network":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(path),
            "tags":tags,"file_tags":result["file_tags"],
            "metrics":evaluations,"training_seconds":elapsed,
            "frozen_base_weights":True,
            "description":"Tags are only learned small color/texture controls, not language semantics.",
        }
        (stage/"training-report.json").write_text(json.dumps(report,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def verify_model(path):
    if path.is_symlink() or not path.is_file() or not 0<path.stat().st_size<=MAX_MODEL_BYTES:
        raise ValueError("Tag adapter must be a bounded local model file")
    try:
        raw=json.loads(path.read_bytes())
    except (UnicodeError,json.JSONDecodeError) as error:
        raise ValueError("Malformed local tag adapter JSON") from error
    if (not isinstance(raw,dict) or raw.get("version")!=1 or
            raw.get("kind")!="cpu_neural_locally_tag_conditioned" or
            raw.get("neural_network") is not True or
            raw.get("text_to_video") is not False or
            raw.get("model_generation") is not True or
            raw.get("base_architecture")!="48x28_two_frame_neural_mlp_frozen" or
            raw.get("adapter_architecture")!="per_tag_rgb_logit_residual_3x17" or
            raw.get("width")!=v2.W or raw.get("height")!=v2.H or raw.get("fps")!=FPS):
        raise ValueError("Unsupported neural label-conditioned checkpoint")
    sha=raw.get("base_model_sha256")
    if not isinstance(sha,str) or len(sha)!=64 or any(c not in "0123456789abcdef" for c in sha):
        raise ValueError("Missing frozen base model SHA-256")
    tags=raw.get("tags")
    if not isinstance(tags,dict) or not 2<=len(tags)<=MAX_TAGS:
        raise ValueError("Tag model must contain 2–3 distinct trained labels")
    for name,tag in tags.items():
        check_tag(name)
        if not isinstance(tag,dict):raise ValueError("Invalid trained tag payload")
        weights=tag.get("adapter_weights")
        if (not isinstance(weights,list) or len(weights)!=3 or
                any(not isinstance(row,list) or len(row)!=17 or
                    any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>20
                        for v in row) for row in weights)):
            raise ValueError("Invalid or nonfinite trained conditioning weights")
        grid=tag.get("start_grid")
        if (not isinstance(grid,list) or len(grid)!=v2.GRID_W*v2.GRID_H or
                any(not isinstance(row,list) or len(row)!=3 or
                    any(type(value) not in (int,float) or not math.isfinite(value) or
                        not 0<=value<=1 for value in row) for row in grid)):
            raise ValueError("Invalid tag-specific spatial color statistics")
        shifts=tag.get("motion_histogram")
        if (not isinstance(shifts,list) or len(shifts)!=9 or
                any(type(value) is not int or value<0 or value>MAX_TAGS*v2.MAX_SOURCE_FRAMES
                    for value in shifts) or sum(shifts)<1):
            raise ValueError("Invalid tag-specific observed motion")
        sources=tag.get("source_sha256")
        if (not isinstance(sources,list) or not 1<=len(sources)<=MAX_TAGS or
                any(not isinstance(x,str) or len(x)!=64 or
                    any(c not in "0123456789abcdef" for c in x) for x in sources)):
            raise ValueError("Invalid trained style source evidence")
    return raw


def sample_frames(base,adapter,tag,seconds,seed,stability=45,variation=6):
    if tag not in adapter["tags"]:raise ValueError("Tag must be one of the actually trained local labels")
    if type(seconds) is not int or not 1<=seconds<=MAX_SECONDS:
        raise ValueError("Tag sample duration must be 1–3 seconds")
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("Tag sampling seed must be a nonnegative 31-bit integer")
    if type(stability) is not int or not 0<=stability<=85:
        raise ValueError("Temporal stability must be 0–85")
    if type(variation) is not int or not 0<=variation<=20:
        raise ValueError("Seeded variation must be 0–20")
    trained=adapter["tags"][tag]
    rng=random.Random(seed)
    initial=bytearray(v2.N)
    for pos in range(v2.N):
        x,y=pos%v2.W,pos//v2.W
        cell=(y*v2.GRID_H//v2.H)*v2.GRID_W+x*v2.GRID_W//v2.W
        color=[max(0,min(.999,v+rng.uniform(-.08,.08)))
               for v in trained["start_grid"][cell]]
        initial[pos]=v2.quantized(*color)
    frames=[v2.sample_rgb(initial)]
    older=recent=bytes(initial)
    innovations=[0.0]*(v2.N*3)
    for frame_no in range(1,seconds*FPS):
        movement=rng.choices(range(9),weights=trained["motion_histogram"])[0]
        dx,dy=movement%3-1,movement//3-1
        def shift(states):
            return bytes(states[((y-dy)%v2.H)*v2.W+((x-dx)%v2.W)]
                         for y in range(v2.H) for x in range(v2.W))
        preceding,current=shift(older),shift(recent)
        updated=bytearray(v2.N)
        rgb=bytearray(v2.N*3)
        for pos in range(v2.N):
            _,predicted=styled_output(
                base["weights"],trained["adapter_weights"],preceding,current,
                pos,frame_no/max(1,seconds*FPS-1))
            previous=v2.colors(current[pos])
            output=[]
            for k in range(3):
                noise=innovations[pos*3+k]*.85+rng.gauss(0,1)*.53
                innovations[pos*3+k]=noise
                value=max(0.0,min(.999,
                    predicted[k]*(1-stability/100)+
                    previous[k]*(stability/100)+noise*(variation/100)))
                output.append(value)
                rgb[pos*3+k]=int(value*255)
            updated[pos]=v2.quantized(*output)
        older,recent=recent,bytes(updated)
        frames.append(bytes(rgb))
    return frames


def generate(base_path,adapter_path,tag,output,seconds=2,seed=42,
             profile="landscape",quality="standard",stability=45,variation=6):
    validate_output_dir(output)
    if profile not in ("landscape","portrait","square") or quality not in ("standard","high"):
        raise ValueError("Unsupported tag sample output preset")
    base=v2.read_model(base_path)
    adapter=verify_model(adapter_path)
    if sha256(base_path)!=adapter["base_model_sha256"]:
        raise ValueError("Neural frozen base model SHA-256 does not match trained tag adapter")
    frames=sample_frames(base,adapter,tag,seconds,seed,stability,variation)
    raw=b"".join(frames)
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-tag-sample-",dir=output.parent))
    try:
        clip=stage/"clip-01.mp4"
        cmd=[
            "ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
            "-f","rawvideo","-pixel_format","rgb24",
            "-video_size",f"{v2.W}x{v2.H}","-framerate",str(FPS),
            "-i","pipe:0","-map","0:v:0","-an","-sn","-dn",
            "-map_metadata","-1","-frames:v",str(len(frames)),
            "-c:v","libx264","-preset","ultrafast","-crf","23",
            "-pix_fmt","yuv420p","-movflags","+faststart",str(clip),
        ]
        try:
            proc=subprocess.run(cmd,input=raw,capture_output=True,check=False,timeout=90)
        except (OSError,subprocess.TimeoutExpired) as error:
            raise ValueError("Offline CPU tag sample encoder timed out/unavailable") from error
        if proc.returncode or not clip.is_file() or not 0<clip.stat().st_size<=MAX_VIDEO_BYTES:
            raise ValueError("CPU tag-conditioned H264 sample encoding failed")
        if video_info(probe(clip,count_frames=True))!=(v2.W,v2.H,len(frames)):
            raise ValueError("Tag sample actual decoded video shape does not match request")
        board={"version":2,"shots":[{
            "file":"clip-01.mp4","source_sha256":sha256(clip),
            "start_frame":0,"frames":len(frames),
            "caption":f"Locally trained neural style tag {tag} (not text-to-video)",
            "rights_ref":"derived-from-verified-owned-training-clips",
            "fade_in_frames":0,"fade_out_frames":0,
        }]}
        board_path=stage/"eternyx-video-v2.json"
        board_path.write_text(json.dumps(board,indent=2)+"\n")
        rendered=render(board_path,stage,stage/"render",profile=profile,quality=quality)
        report={
            "version":1,"kind":"cpu_neural_tagged_sample",
            "neural_network":True,"text_to_video":False,
            "model_generation":True,"tag":tag,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(adapter_path),
            "fps":FPS,"width":v2.W,"height":v2.H,
            "seconds":seconds,"seed":seed,"profile":profile,"quality":quality,
            "stability_percent":stability,"variation_percent":variation,
            "raw_rgb_sha256":hashlib.sha256(raw).hexdigest(),
            "actual_clip_sha256":sha256(clip),
            "video_sha256":rendered["video"]["sha256"],
            "video_bytes":(stage/"render"/"video.mp4").stat().st_size,
            "frame_count":len(frames),
            "raw_temporal_diagnostics":v2.raw_diagnostics(frames),
            "note":"Human-named local training labels steer tiny learned texture; no natural-language prompt understanding.",
        }
        (stage/"generation-report.json").write_text(json.dumps(report,indent=2)+"\n")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def compare(base_path,adapter_path,first_tag,second_tag,output,seconds=1,seed=42):
    if first_tag==second_tag:
        raise ValueError("Compare two distinct actually trained tag labels")
    validate_output_dir(output)
    adapter=verify_model(adapter_path)
    for tag in (first_tag,second_tag):
        if tag not in adapter["tags"]:raise ValueError("Only trained tags may be compared")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-tag-compare-",dir=output.parent))
    try:
        results=[]
        for index,tag in enumerate((first_tag,second_tag),1):
            receipt=generate(base_path,adapter_path,tag,stage/f"candidate-{index:02d}",
                             seconds=seconds,seed=seed)
            results.append(receipt)
        left=stage/"candidate-01"/"render"/"video.mp4"
        right=stage/"candidate-02"/"render"/"video.mp4"
        cmd=["ffmpeg","-nostdin","-hide_banner","-v","error","-threads","1",
             "-protocol_whitelist","file,pipe","-i",str(left),
             "-protocol_whitelist","file,pipe","-i",str(right),
             "-filter_complex_threads","1","-filter_complex",
             "[0:v]setpts=PTS-STARTPTS[l];[1:v]setpts=PTS-STARTPTS[r];"
             "[l][r]hstack=inputs=2[vid]",
             "-map","[vid]","-an","-sn","-dn","-frames:v",str(seconds*FPS),
             "-c:v","libx264","-preset","ultrafast","-crf","23",
             "-pix_fmt","yuv420p","-movflags","+faststart",str(stage/"comparison.mp4")]
        try:
            proc=subprocess.run(cmd,capture_output=True,timeout=120,check=False)
        except (OSError,subprocess.TimeoutExpired) as error:
            raise ValueError("CPU labeled comparison renderer unavailable") from error
        video=stage/"comparison.mp4"
        if proc.returncode or not video.is_file() or not 0<video.stat().st_size<=MAX_VIDEO_BYTES:
            raise ValueError("No actual H264 style comparison produced")
        if video_info(probe(video,count_frames=True))!=(512,144,seconds*FPS):
            raise ValueError("Comparison video has wrong decoded shape")
        report={
            "version":1,"kind":"cpu_neural_tag_comparison",
            "neural_network":True,"text_to_video":False,
            "base_model_sha256":sha256(base_path),
            "tag_model_sha256":sha256(adapter_path),
            "tags":[first_tag,second_tag],
            "seed":seed,"seconds":seconds,
            "candidates":[{
                "tag":tag,"file":f"candidate-{i:02d}/render/video.mp4",
                "sha256":r["video_sha256"],"video_bytes":r["video_bytes"],
                "frame_count":r["frame_count"],"raw_rgb_sha256":r["raw_rgb_sha256"],
            } for i,(tag,r) in enumerate(zip((first_tag,second_tag),results),1)],
            "comparison":{
                "file":"comparison.mp4","sha256":sha256(video),
                "video_bytes":video.stat().st_size,
                "width":512,"height":144,"frame_count":seconds*FPS,
            },
            "interpretation":"Comparing two actually learned human-defined tags, not text prompts or realistic video.",
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
    training.add_argument("--base",type=Path,required=True)
    training.add_argument("--input",type=Path,required=True)
    training.add_argument("--output",type=Path,required=True)
    training.add_argument("--file-tag",action="append",required=True)
    training.add_argument("--epochs",type=int,default=2)
    training.add_argument("--seed",type=int,default=42)
    sampling=sub.add_parser("generate")
    sampling.add_argument("--base",type=Path,required=True)
    sampling.add_argument("--adapter",type=Path,required=True)
    sampling.add_argument("--output",type=Path,required=True)
    sampling.add_argument("--tag",required=True)
    sampling.add_argument("--seconds",type=int,default=2)
    sampling.add_argument("--seed",type=int,default=42)
    sampling.add_argument("--profile",choices=("landscape","portrait","square"),default="landscape")
    sampling.add_argument("--quality",choices=("standard","high"),default="standard")
    sampling.add_argument("--stability",type=int,default=45)
    sampling.add_argument("--variation",type=int,default=6)
    comparison=sub.add_parser("compare")
    comparison.add_argument("--base",type=Path,required=True)
    comparison.add_argument("--adapter",type=Path,required=True)
    comparison.add_argument("--output",type=Path,required=True)
    comparison.add_argument("--first-tag",required=True)
    comparison.add_argument("--second-tag",required=True)
    comparison.add_argument("--seconds",type=int,default=1)
    comparison.add_argument("--seed",type=int,default=42)
    args=parser.parse_args()
    try:
        if args.action=="train":
            mapping={}
            for pair in args.file_tag:
                if ":" not in pair:raise ValueError("Use --file-tag clip.mp4:label")
                name,label=pair.split(":",1)
                if name in mapping:raise ValueError("Duplicate training video tag mapping")
                mapping[name]=label
            report=train(args.base,args.input,args.output,mapping,args.epochs,args.seed)
        elif args.action=="generate":
            report=generate(args.base,args.adapter,args.tag,args.output,
                            args.seconds,args.seed,args.profile,args.quality,
                            args.stability,args.variation)
        else:
            report=compare(args.base,args.adapter,args.first_tag,args.second_tag,
                           args.output,args.seconds,args.seed)
        print(json.dumps(report,allow_nan=False))
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__=="__main__":
    main()
