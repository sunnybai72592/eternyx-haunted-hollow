"""Select a CPU neural v2 causal training schedule without looking at final holdout.

Scientific boundaries:
* SOURCE CLIPS: rights-reviewed local, SHA-matched to existing 48x28 v2 model.
* INNER TRAIN: first part of each ORIGINAL training-prefix only.
* INNER VALIDATION: next 4 frames, still within the ORIGINAL training-prefix.
* SCHEDULE SELECTION: among up to 3 teacher-mix settings and the unchanged
  base checkpoint, measured four-step self-fed prediction MSE on INNER validation.
* REFIT: only selected mix, from unchanged original weights, on the COMPLETE
  original training-prefix. Outer heldout frames never train or select.
* FINAL AUDIT: untouched original last-quarter outer heldout, once after selection.
* NO GUARANTEE: even an inner-validated improvement may regress on outer holdout.

Actual CPU SGD, FFmpeg MP4, SHA256, atomic create-only. No AI API or GPU.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from time import perf_counter

import adapt_neural_rollout as adaptation
import train_spatiotemporal_neural_video as v2
from learn_cpu_video_texture import validate_output_dir
from render_video_timeline import FPS, sha256, probe, video_info

MIX_OPTIONS = (0,25,50,75,100)
MAX_CANDIDATES = 3
MAX_EPOCHS = 2
VALIDATION_STEPS = 4


def validate_mixes(mixes):
    if (not isinstance(mixes,list) or not 1<=len(mixes)<=MAX_CANDIDATES or
            any(type(value) is not int or value not in MIX_OPTIONS for value in mixes) or
            len(set(mixes))!=len(mixes)):
        raise ValueError("Choose 1–3 unique teacher-replay percentages from 0,25,50,75,100")
    return sorted(mixes)


def partition_prefix(datasets):
    """Keep inner train/validation strictly inside the original training prefix."""
    inner=[]
    receipt=[]
    for source,frames,outer in datasets:
        if outer<18 or len(frames)-outer<8:
            raise ValueError("Need >=18 original training-prefix frames and >=8 untouched heldout")
        inner_end=outer-6
        if inner_end<12 or inner_end+VALIDATION_STEPS>outer:
            raise ValueError("Inner validation must fit wholly within the old training prefix")
        inner.append((source,frames,inner_end))
        receipt.append({
            "source_sha256":source["sha256"],
            "original_training_prefix_end":outer,
            "inner_training_end":inner_end,
            "inner_validation_start":inner_end,
            "inner_validation_end_exclusive":inner_end+VALIDATION_STEPS,
            "outer_holdout_start":outer,
        })
    return inner,receipt


def weighted_four_step(weights,datasets):
    loss_sum=baseline_sum=0.
    pixels=0
    for _,frames,cutoff in datasets:
        loss,baseline,count=v2.holdout_rollout(
            weights,frames,cutoff,steps=VALIDATION_STEPS)
        if count!=VALIDATION_STEPS*v2.N:
            raise ValueError("Inner validation must contain exactly four real unseen steps")
        loss_sum+=loss*count
        baseline_sum+=baseline*count
        pixels+=count
    if pixels!=len(datasets)*VALIDATION_STEPS*v2.N:
        raise ValueError("Incomplete matched inner validation coverage")
    return {
        "mse":round(loss_sum/pixels,8),
        "static_mse":round(baseline_sum/pixels,8),
        "evaluated_pixels":pixels,
    }


def fit_mixes(weights,datasets,mix,seed,epochs):
    """Actual SGD, with only the supplied training prefix as optimizer labels."""
    trained=copy.deepcopy(weights)
    examples=0
    teacher=0
    anchors=[]
    for epoch in range(epochs):
        entries,positions,used=adaptation.build_training_replay(
            trained,datasets,seed,epoch,mix)
        if not entries:
            raise ValueError("No valid causal-prefix self-fed training examples")
        examples+=len(entries)
        teacher+=used
        anchors.extend(positions)
        for entry in entries:
            v2.sgd(trained,entry,lr=adaptation.LEARNING_RATE)
    return trained,{
        "examples":examples,"teacher_examples":teacher,
        "anchor_count":len(anchors),
        "learning_rate":adaptation.LEARNING_RATE,
    }


def select_schedule(original_weights,datasets,mixes,epochs,seed):
    """Only reads original training prefix, not outer-holdout pixels.

    Tie-break: unchanged base first; then lower replay percent when candidate
    loss ties. A candidate must strictly exceed baseline improvement by 1e-8.
    """
    mixes=validate_mixes(mixes)
    inner,splits=partition_prefix(datasets)
    baseline=weighted_four_step(original_weights,inner)
    entries=[{
        "name":"unchanged_base","mix_percent":None,
        "inner_four_step_mse":baseline["mse"],
        "inner_static_mse":baseline["static_mse"],
        "evaluated_pixels":baseline["evaluated_pixels"],
        "trained_on_inner_prefix":False,
        "optimizer_examples":0,
    }]
    best_mse=baseline["mse"]
    chosen=None
    for mix in mixes:
        trained,receipt=fit_mixes(original_weights,inner,mix,seed,epochs)
        error=weighted_four_step(trained,inner)
        if error["evaluated_pixels"]!=baseline["evaluated_pixels"] or \
                error["static_mse"]!=baseline["static_mse"]:
            raise ValueError("Schedule evaluation does not share the same inner targets")
        entries.append({
            "name":f"replay_{mix}","mix_percent":mix,
            "inner_four_step_mse":error["mse"],
            "inner_static_mse":error["static_mse"],
            "evaluated_pixels":error["evaluated_pixels"],
            "trained_on_inner_prefix":True,
            "optimizer_examples":receipt["examples"],
        })
        if error["mse"]<best_mse-1e-8:
            best_mse=error["mse"]
            chosen=mix
    return chosen,entries,splits


def select_and_refit(weights,datasets,mixes,epochs,seed):
    selected,candidates,splits=select_schedule(weights,datasets,mixes,epochs,seed)
    if selected is None:
        refitted=copy.deepcopy(weights)
        refit_info={
            "examples":0,"teacher_examples":0,"anchor_count":0,
            "learning_rate":adaptation.LEARNING_RATE,
        }
    else:
        # Crucial: start from ORIGINAL checkpoint, not the inner candidate.
        refitted,refit_info=fit_mixes(weights,datasets,selected,seed,epochs)
    return refitted,selected,candidates,splits,refit_info


def audit_model(before_weights,after_weights,datasets):
    before=adaptation.causal_metrics(before_weights,datasets)
    after=adaptation.causal_metrics(after_weights,datasets)
    for step in ("1","4","8"):
        if before[step]["static_baseline_mse"]!=after[step]["static_baseline_mse"]:
            raise ValueError("Outer evaluation baseline changed on identical heldout targets")
    return before,after


def run(model_path,input_dir,output,mixes=None,seed=42,epochs=1,
        seconds=1,stability=45,variation=6):
    validate_output_dir(output)
    if type(seed) is not int or not 0<=seed<=v2.MAX_SEED:
        raise ValueError("Model selection seed must be a valid 31-bit nonnegative integer")
    if type(epochs) is not int or not 1<=epochs<=MAX_EPOCHS:
        raise ValueError("Selection/refit epochs must be an integer from 1 to 2")
    if type(seconds) is not int or not 1<=seconds<=2:
        raise ValueError("Preview duration must be 1–2 seconds")
    if type(stability) is not int or not 0<=stability<=85:
        raise ValueError("Temporal stability must be 0–85")
    if type(variation) is not int or not 0<=variation<=20:
        raise ValueError("Seeded variation must be 0–20")
    choices=validate_mixes(mixes if mixes is not None else [0,50,100])
    base=v2.read_model(model_path)
    datasets=adaptation.training_sources(base,input_dir)
    weights=copy.deepcopy(base["weights"])
    started=perf_counter()
    fitted,selected,entries,splits,refit=select_and_refit(
        weights,datasets,choices,epochs,seed)
    cpu_train_seconds=round(perf_counter()-started,6)
    # Outer holdout is first accessed only AFTER inner schedule selection.
    before,after=audit_model(weights,fitted,datasets)
    result_model=copy.deepcopy(base)
    result_model["weights"]=fitted
    result_model["metrics"]["one_step_holdout_mse"]=after["1"]["model_mse"]
    result_model["metrics"]["one_step_persistence_mse"]=after["1"]["static_baseline_mse"]
    result_model["metrics"]["four_step_rollout_mse"]=after["4"]["model_mse"]
    result_model["metrics"]["four_step_static_baseline_mse"]=after["4"]["static_baseline_mse"]
    result_model["metrics"]["interpretation"]=(
        "Original training report with current outer holdout after prefix-only "
        "schedule selection. See schedule-report.json; do not assume improvement.")
    base_sha=sha256(model_path)
    weights_before_hash=hashlib.sha256(
        json.dumps(weights,sort_keys=True,allow_nan=False).encode()).hexdigest()
    weights_after_hash=hashlib.sha256(
        json.dumps(fitted,sort_keys=True,allow_nan=False).encode()).hexdigest()
    result_model["selection"]={
        "kind":"inner_training_prefix_only","base_model_sha256":base_sha,
        "replay_percent":selected,"epochs":epochs,"seed":seed,
        "outer_holdout_in_selection":False,
        "weights_changed":weights_before_hash!=weights_after_hash,
    }
    payload=json.dumps(result_model,separators=(",",":"),allow_nan=False).encode()
    if len(payload)>v2.MAX_MODEL_BYTES:
        raise ValueError("Selected two-frame CPU checkpoint exceeds 128 KiB")
    stage=Path(tempfile.mkdtemp(prefix=".eternyx-neural-schedule-",dir=output.parent))
    try:
        checkpoint=stage/"selected-model"
        checkpoint.mkdir()
        selected_path=checkpoint/"model.json"
        selected_path.write_bytes(payload+b"\n")
        v2.read_model(selected_path)
        before_mp4=v2.generate(model_path,stage/"base-sample",
            seconds=seconds,seed=seed,stability=stability,variation=variation)
        after_mp4=v2.generate(selected_path,stage/"selected-sample",
            seconds=seconds,seed=seed,stability=stability,variation=variation)
        base_video=stage/"base-sample"/"render"/"video.mp4"
        selected_video=stage/"selected-sample"/"render"/"video.mp4"
        if (sha256(base_video)!=before_mp4["final_mp4_sha256"] or
                sha256(selected_video)!=after_mp4["final_mp4_sha256"]):
            raise ValueError("Generated samples disagree with actual renderer receipts")
        joined=adaptation.side_by_side(
            base_video,selected_video,stage/"comparison.mp4",seconds*FPS)
        report={
            "version":1,"kind":"cpu_neural_inner_prefix_schedule_selection",
            "neural_network":True,"text_to_video":False,
            "model_generation":True,
            "base_model_sha256":base_sha,"selected_model_sha256":sha256(selected_path),
            "base_weights_sha256":weights_before_hash,
            "selected_weights_sha256":weights_after_hash,
            "weights_changed":weights_before_hash!=weights_after_hash,
            "selected_model_file":"selected-model/model.json",
            "sources":[{
                "file":source["file"],"sha256":source["sha256"],
                "used_frames":source["used_frames"],"train_frames":cutoff,
                "holdout_frames":len(frames)-cutoff,
            } for source,frames,cutoff in datasets],
            "outer_holdout_used_for_selection":False,
            "strategy":{
                "seed":seed,"epochs":epochs,"candidate_mixes":choices,
                "selected_mix_percent":selected,
                "unchanged_base_allowed":True,
                "inner_validation_steps":VALIDATION_STEPS,
                "inner_splits":splits,
                "candidates":entries,
                "refit_on_full_original_training_prefix":selected is not None,
                "refit_examples":refit["examples"],
                "refit_teacher_examples":refit["teacher_examples"],
                "cpu_training_and_selection_seconds":cpu_train_seconds,
                "interpretation":"Select by INNER prefix validation only; baseline retained when no improvement.",
            },
            "final_outer_audit":{
                "steps":[1,4,8],"before":before,"after":after,
                "interpretation":"Post-selection outer heldout evaluation; may regress and did not select schedule.",
            },
            "sampling":{
                "seconds":seconds,"seed":seed,
                "stability_percent":stability,"variation_percent":variation,
            },
            "artifacts":{
                "base":{
                    "file":"base-sample/render/video.mp4",
                    "sha256":sha256(base_video),
                    "video_bytes":base_video.stat().st_size,
                    "frame_count":seconds*FPS,
                },
                "selected":{
                    "file":"selected-sample/render/video.mp4",
                    "sha256":sha256(selected_video),
                    "video_bytes":selected_video.stat().st_size,
                    "frame_count":seconds*FPS,
                },
                "comparison":joined,
            },
            "note":(
                "Tiny 48x28 two-frame neural CPU schedule-selection research. "
                "No text-to-video, photorealistic video, paid GPU or external AI API. "
                "Inner-error improvement never guarantees outer/visual improvement."
            ),
        }
        (stage/"schedule-report.json").write_text(
            json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf-8")
        validate_output_dir(output)
        stage.rename(output)
        return report
    finally:
        if stage.exists():shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model",type=Path,required=True)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--mix",type=int,action="append")
    parser.add_argument("--seed",type=int,default=42)
    parser.add_argument("--epochs",type=int,default=1)
    parser.add_argument("--seconds",type=int,default=1)
    parser.add_argument("--stability",type=int,default=45)
    parser.add_argument("--variation",type=int,default=6)
    args=parser.parse_args()
    try:
        receipt=run(args.model,args.input,args.output,args.mix,args.seed,
                    args.epochs,args.seconds,args.stability,args.variation)
        print(json.dumps({
            "selected_mix_percent":receipt["strategy"]["selected_mix_percent"],
            "outer_holdout_used_for_selection":receipt["outer_holdout_used_for_selection"],
            "comparison_video":str(args.output/"comparison.mp4"),
            "sha256":receipt["artifacts"]["comparison"]["sha256"],
            "outer_8_step_before":receipt["final_outer_audit"]["before"]["8"]["model_mse"],
            "outer_8_step_after":receipt["final_outer_audit"]["after"]["8"]["model_mse"],
        }))
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__=="__main__":
    main()
