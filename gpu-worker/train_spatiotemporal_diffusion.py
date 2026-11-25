"""Independent CPU 3D-neighborhood diffusion research baseline.

A shared learned 3x3x3 spatiotemporal kernel, nonlinear hidden channels,
and learned RGB output head process all noisy frames jointly. Same data,
native resolution, noise schedule and DDIM sampler as V1 for comparison.
Closed tag conditioning only; not natural-language or realistic video.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from time import perf_counter

import train_joint_video_diffusion as v1
from learn_cpu_video_texture import validate_output_dir, run_ffmpeg
from render_video_timeline import probe, video_info, sha256

W,H,F,FPS,D,STEPS,TAGS = v1.W,v1.H,v1.F,v1.FPS,v1.D,v1.STEPS,v1.TAGS
N=F*H*W
FEATURES=81+1+TAGS+6
HIDDEN=32
MAX_BYTES=512*1024
KIND="cpu_spatiotemporal_diffusion_v2"
POSITIONS=512
SHAPES={"kernel":(FEATURES,HIDDEN),"bias":(HIDDEN,),
        "head":(HIDDEN,3),"rgb_bias":(3,),"tag_bias":(TAGS,3)}


def weights(seed):
    np=v1.numpy()
    rng=np.random.default_rng(seed)
    return {"kernel":rng.normal(0,1/FEATURES**.5,SHAPES["kernel"]).astype(np.float32),
            "bias":np.zeros(HIDDEN,np.float32),
            "head":rng.normal(0,.05,SHAPES["head"]).astype(np.float32),
            "rgb_bias":np.zeros(3,np.float32),"tag_bias":np.zeros((TAGS,3),np.float32)}


def features(noisy,times,labels):
    np=v1.numpy()
    video=noisy.reshape(-1,F,H,W,3)
    count=len(video)
    # Replicated edge padding (no wrap-around from the last video frame).
    padded=np.pad(video,((0,0),(1,1),(1,1),(1,1),(0,0)),mode="edge")
    local=np.lib.stride_tricks.sliding_window_view(padded,(3,3,3),axis=(1,2,3))
    local=local.reshape(count,N,81)
    t,y,x=np.meshgrid(np.linspace(-1,1,F,dtype=np.float32),
                      np.linspace(-1,1,H,dtype=np.float32),
                      np.linspace(-1,1,W,dtype=np.float32),indexing="ij")
    coords=np.stack((t,y,x,t*t,y*y,x*x),axis=-1).reshape(1,N,6)
    condition=np.concatenate((np.asarray(times,np.float32).reshape(-1,1)/STEPS,
                              np.eye(TAGS,dtype=np.float32)[labels]),axis=1)
    return np.concatenate((local,np.broadcast_to(condition[:,None,:],(count,N,1+TAGS)),
                           np.broadcast_to(coords,(count,N,6))),axis=-1)


def forward(model,inp,labels):
    np=v1.numpy()
    hidden=np.tanh(inp @ model["kernel"]+model["bias"])
    pred=hidden @ model["head"]+model["rgb_bias"]+model["tag_bias"][labels,None,:]
    return hidden,pred


def predict(model,noisy,times,labels):
    return forward(model,features(noisy,times,labels),labels)[1].reshape(-1,D)


def evaluate(predictor,items,tags):
    """Common noise draws, target tensors and metrics for either architecture."""
    np=v1.numpy()
    rng=np.random.default_rng(601)
    result=[]
    for step in (3,6,9,12):
        losses=[];baseline=[];swapped=[];motion=[]
        for i in range(len(items)):
            clean,noisy,t,y=v1.batch(items,tags,rng,[i],np.array([step]))
            guess=np.clip(predictor(noisy,t,y),-1,1)
            wrong=np.clip(predictor(noisy,t,1-y),-1,1)
            losses.append(float(np.mean((guess-clean)**2)))
            baseline.append(float(np.mean((np.clip(noisy,-1,1)-clean)**2)))
            swapped.append(float(np.mean((wrong-clean)**2)))
            delta=np.diff(guess.reshape(F,H,W,3),axis=0)-np.diff(clean.reshape(F,H,W,3),axis=0)
            motion.append(float(np.mean(delta**2)))
        result.append({"noise_step":step,"denoising_mse":float(np.mean(losses)),
                       "noisy_input_mse":float(np.mean(baseline)),
                       "swapped_tag_mse":float(np.mean(swapped)),
                       "temporal_delta_mse":float(np.mean(motion))})
    return {"windows":len(items),"by_noise":result,
            **{key:float(np.mean([row[key] for row in result])) for key in
               ("denoising_mse","noisy_input_mse","swapped_tag_mse","temporal_delta_mse")}}


def fit(training,heldout,tags,seed,updates):
    np=v1.numpy()
    rng=np.random.default_rng(seed)
    model=weights(seed)
    pred=lambda x,t,y:predict(model,x,t,y)
    before=evaluate(pred,training,tags)
    holdout_before=evaluate(pred,heldout,tags)
    m={k:np.zeros_like(v) for k,v in model.items()}
    v={k:np.zeros_like(a) for k,a in model.items()}
    pools=[[i for i,(label,_) in enumerate(training) if label==tag] for tag in tags]
    for step in range(1,updates+1):
        indices=np.concatenate([rng.choice(pool,size=2,replace=True) for pool in pools])
        rng.shuffle(indices)
        clean,noisy,times,labels=v1.batch(training,tags,rng,indices)
        positions=rng.integers(0,N,size=(4,POSITIONS))
        rows=np.arange(4)[:,None]
        inp=features(noisy,times,labels)[rows,positions]
        expected=clean.reshape(4,N,3)[rows,positions]
        h,guess=forward(model,inp,labels)
        delta=2*(guess-expected)/guess.size
        hidden_grad=(delta @ model["head"].T)*(1-h*h)
        tag_grad=np.zeros_like(model["tag_bias"])
        np.add.at(tag_grad,labels,delta.sum(axis=1))
        grad={"kernel":inp.reshape(-1,FEATURES).T @ hidden_grad.reshape(-1,HIDDEN),
              "bias":hidden_grad.sum(axis=(0,1)),
              "head":h.reshape(-1,HIDDEN).T @ delta.reshape(-1,3),
              "rgb_bias":delta.sum(axis=(0,1)),"tag_bias":tag_grad}
        for k in model:
            m[k]=.9*m[k]+.1*grad[k]
            v[k]=.999*v[k]+.001*grad[k]**2
            model[k]-=.003*(m[k]/(1-.9**step))/(np.sqrt(v[k]/(1-.999**step))+1e-8)
    return model,{"train_before":before,"train_after":evaluate(pred,training,tags),
                  "holdout_before":holdout_before,"holdout_after":evaluate(pred,heldout,tags)}


def train(root,manifest,output,seed=42,updates=160,compare_v1=False):
    validate_output_dir(output)
    v1.check_seed(seed)
    if type(updates) is not int or not 1<=updates<=v1.MAX_UPDATES:
        raise ValueError("Training updates must be 1-600")
    tags,training,heldout,provenance=v1.dataset(root,manifest)
    started=perf_counter()
    model,metrics=fit(training,heldout,tags,seed,updates)
    elapsed=perf_counter()-started
    checkpoint={"kind":KIND,"version":2,"shape":[F,H,W,3],"fps":FPS,"diffusion_steps":STEPS,
                "tags":tags,"sources":provenance,"training_seed":seed,"updates":updates,
                "weights":{k:v.tolist() for k,v in model.items()}}
    encoded=json.dumps(checkpoint,separators=(",",":"),allow_nan=False).encode()
    if len(encoded)>MAX_BYTES:
        raise ValueError("Checkpoint exceeds safe size")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-spatiotemporal-",dir=output.parent))
    try:
        (stage/"model.json").write_bytes(encoded)
        report={"kind":KIND,"model_sha256":sha256(stage/"model.json"),
                "parameters":sum(v.size for v in model.values()),"training_updates":updates,
                "training_evaluation_seconds":elapsed,"sources":provenance,"metrics":metrics,
                "whole_file_holdout":True,"text_to_video":False,
                "interpretation":"Fixed-noise denoising and temporal delta MSE are not perceptual quality or prompt fidelity."}
        if compare_v1:
            started=perf_counter()
            original,_=v1.fit(training,heldout,tags,seed,updates)
            original_time=perf_counter()-started
            baseline=evaluate(lambda x,t,y:v1.forward(original,x,t,y)[2],heldout,tags)
            report["comparison"]={"v1_parameters":sum(v.size for v in original.values()),
                                  "v1_training_evaluation_seconds":original_time,
                                  "v1_holdout":baseline,"v2_holdout":metrics["holdout_after"],
                                  "same_data_noise_seed_and_update_count":True,
                                  "equal_compute_budget":False,
                                  "note":"Different gradient sample counts/architectures; no assertion that V2 wins."}
        (stage/"training-report.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def load(path):
    np=v1.numpy()
    data=v1.bounded_json(path,MAX_BYTES)
    if not isinstance(data,dict) or data.get("kind")!=KIND or data.get("version")!=2 or data.get("shape")!=[F,H,W,3] or data.get("fps")!=FPS or data.get("diffusion_steps")!=STEPS:
        raise ValueError("Incompatible spatial-temporal checkpoint")
    tags=data.get("tags")
    if not isinstance(tags,list) or len(tags)!=TAGS or len(set(v1.check_tag(t) for t in tags))!=TAGS:
        raise ValueError("Invalid checkpoint tags")
    raw=data.get("weights")
    if not isinstance(raw,dict) or set(raw)!=set(SHAPES):
        raise ValueError("Invalid checkpoint weights")
    model={}
    for k,shape in SHAPES.items():
        try:a=np.asarray(raw[k],dtype=np.float32)
        except (ValueError,TypeError,OverflowError) as error:raise ValueError("Invalid checkpoint tensor") from error
        if a.shape!=shape or not np.isfinite(a).all() or np.max(np.abs(a))>100:
            raise ValueError("Invalid checkpoint tensor shape or values")
        model[k]=a
    return tags,model


def sample(model,tags,tag,seed):
    np=v1.numpy()
    v1.check_seed(seed)
    if tag not in tags:raise ValueError("Unknown trained tag")
    rng=np.random.default_rng(seed)
    x=rng.standard_normal((1,D),dtype=np.float32)
    y=np.array([tags.index(tag)])
    alpha=v1.schedule()
    for t in range(STEPS,0,-1):
        clean=np.clip(predict(model,x,np.array([t]),y),-1,1)
        eps=(x-np.sqrt(alpha[t])*clean)/np.sqrt(1-alpha[t])
        x=(np.sqrt(alpha[t-1])*clean+np.sqrt(1-alpha[t-1])*eps).astype(np.float32)
    return np.rint((np.clip(x,-1,1)+1)*127.5).astype(np.uint8).reshape(F,H,W,3)


def generate(checkpoint,output,tag,seed=42):
    np=v1.numpy()
    validate_output_dir(output)
    # Bound the initial hash read as well as checkpoint deserialization.
    if checkpoint.is_symlink() or not checkpoint.is_file() or not 0<checkpoint.stat().st_size<=MAX_BYTES:
        raise ValueError("Expected a bounded regular checkpoint")
    digest=sha256(checkpoint)
    tags,model=load(checkpoint)
    if digest!=sha256(checkpoint):raise ValueError("Checkpoint changed during load")
    frames=sample(model,tags,tag,seed)
    raw=frames.tobytes()
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-spatial-sample-",dir=output.parent))
    try:
        clip=stage/"generated.mp4"
        run_ffmpeg(["ffmpeg","-nostdin","-v","error","-threads","1","-f","rawvideo",
            "-pixel_format","rgb24","-video_size",f"{W}x{H}","-framerate",str(FPS),
            "-i","pipe:0","-vf","scale=256:192:flags=neighbor","-an","-sn","-dn",
            "-frames:v",str(F),"-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(clip)],stdin=raw)
        if video_info(probe(clip,count_frames=True),expected_fps=FPS)!=(256,192,F):
            raise ValueError("Generated MP4 failed native frame-count verification")
        report={"kind":KIND,"model_sha256":digest,"video_sha256":sha256(clip),
                "raw_sample_sha256":hashlib.sha256(raw).hexdigest(),"tag":tag,"seed":seed,
                "native_shape":[F,H,W,3],"encoded_size":[256,192],"fps":FPS,"seconds":F/FPS,
                "distinct_raw_frames":len({frame.tobytes() for frame in frames}),
                "mean_adjacent_rgb_delta":float(np.mean(np.abs(np.diff(frames.astype(np.float32),axis=0)))/255),
                "source_media_used_at_inference":False,"model_generation":True,"text_to_video":False}
        (stage/"generation-report.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="command",required=True)
    fit_parser=sub.add_parser("train")
    for name in ("input","manifest","output"):
        fit_parser.add_argument("--"+name,type=Path,required=True)
    fit_parser.add_argument("--seed",type=int,default=42)
    fit_parser.add_argument("--updates",type=int,default=160)
    fit_parser.add_argument("--compare-v1",action="store_true")
    gen=sub.add_parser("generate")
    gen.add_argument("--model",type=Path,required=True)
    gen.add_argument("--output",type=Path,required=True)
    gen.add_argument("--tag",required=True)
    gen.add_argument("--seed",type=int,default=42)
    args=parser.parse_args()
    try:
        result=train(args.input,args.manifest,args.output,args.seed,args.updates,args.compare_v1) if args.command=="train" else generate(args.model,args.output,args.tag,args.seed)
        print(json.dumps(result,allow_nan=False))
    except (ValueError,OSError,KeyError,TypeError) as error:parser.error(str(error))


if __name__=="__main__":
    main()
