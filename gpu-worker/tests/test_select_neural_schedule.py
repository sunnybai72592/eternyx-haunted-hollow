"""Real FFmpeg CPU neural schedule selection tests with explicit leakage invariance."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import select_neural_schedule as selection
import train_spatiotemporal_neural_video as v2
import adapt_neural_rollout as adaptation
from render_video_timeline import probe,sha256,video_info


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Real local FFmpeg and FFprobe required")
class RealNeuralScheduleSelectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ctx=tempfile.TemporaryDirectory()
        cls.addClassCleanup(ctx.cleanup)
        cls.root=Path(ctx.name)
        cls.source=cls.root/"owned-footage"
        cls.source.mkdir()
        cls.video=cls.source/"approved.mp4"
        subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                        "-f","lavfi","-i","testsrc=size=96x56:rate=16:duration=2",
                        "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",
                        str(cls.video)],check=True,capture_output=True,timeout=30)
        cls.modeldir=cls.root/"base-v2"
        v2.train(cls.source,cls.modeldir,"owner-reviewed",["approved.mp4"],seed=19,epochs=1)
        cls.base=cls.modeldir/"model.json"
        cls.model=v2.read_model(cls.base)
        cls.datasets=adaptation.training_sources(cls.model,cls.source)
        cls.output=cls.root/"selection-export"
        cls.receipt=selection.run(cls.base,cls.source,cls.output,[0,50,100],seed=11,
                                  epochs=1,seconds=1,stability=45,variation=6)

    def test_inner_training_and_validation_windows_are_both_inside_original_training(self):
        inner,splits=selection.partition_prefix(self.datasets)
        self.assertEqual(len(inner),1)
        source,frames,inner_end=inner[0]
        self.assertEqual(len(frames),32)
        self.assertEqual(self.datasets[0][2],24)
        self.assertEqual(inner_end,18)
        self.assertEqual(splits[0]["inner_validation_start"],18)
        self.assertEqual(splits[0]["inner_validation_end_exclusive"],22)
        self.assertEqual(splits[0]["outer_holdout_start"],24)
        self.assertLess(splits[0]["inner_validation_end_exclusive"],
                        splits[0]["outer_holdout_start"])
        self.assertEqual(source["sha256"],sha256(self.video))

    def test_changing_only_outer_heldout_frames_cannot_change_candidate_selection_or_weights(self):
        old_weights=copy.deepcopy(self.model["weights"])
        selected,entries,splits=selection.select_schedule(
            old_weights,self.datasets,[0,50,100],epochs=1,seed=11)
        source,frames,cutoff=self.datasets[0]
        changed=frames[:cutoff]+[bytes([63]*v2.N) for _ in frames[cutoff:]]
        changed_data=[(source,changed,cutoff)]
        selected_again,entries_again,splits_again=selection.select_schedule(
            old_weights,changed_data,[0,50,100],epochs=1,seed=11)
        self.assertEqual(selected,selected_again)
        self.assertEqual(entries,entries_again)
        self.assertEqual(splits,splits_again)
        fitted,*_=selection.select_and_refit(old_weights,self.datasets,[0,50,100],1,11)
        fitted_again,*_=selection.select_and_refit(old_weights,changed_data,[0,50,100],1,11)
        self.assertEqual(fitted,fitted_again)
        before,after=selection.audit_model(old_weights,fitted,self.datasets)
        before_changed,after_changed=selection.audit_model(old_weights,fitted_again,changed_data)
        self.assertNotEqual(before,before_changed)
        self.assertNotEqual(after,after_changed)

    def test_choose_baseline_if_every_candidate_fails_inner_validation(self):
        weights=copy.deepcopy(self.model["weights"])
        baseline=selection.weighted_four_step(weights,selection.partition_prefix(self.datasets)[0])
        with patch("select_neural_schedule.weighted_four_step",
                   side_effect=[baseline]+[
                       {**baseline,"mse":round(baseline["mse"]+0.1,8)}
                       for _ in range(3)]):
            chosen,entries,splits=selection.select_schedule(
                weights,self.datasets,[0,50,100],epochs=1,seed=21)
        self.assertIsNone(chosen)
        self.assertEqual(entries[0]["name"],"unchanged_base")
        self.assertEqual(len(entries),4)
        self.assertIsNone(entries[0]["mix_percent"])
        self.assertFalse(entries[0]["trained_on_inner_prefix"])
        self.assertTrue(all(entry["trained_on_inner_prefix"] for entry in entries[1:]))
        # Original model remains a valid fallback; changed candidate weights
        # are NOT automatically published as an "improvement".
        self.assertEqual(weights,self.model["weights"])

    def test_actual_inner_causal_candidates_and_refit_are_deterministic(self):
        original=copy.deepcopy(self.model["weights"])
        chosen,entries,splits=selection.select_schedule(
            original,self.datasets,[50,0],epochs=1,seed=11)
        chosen2,entries2,splits2=selection.select_schedule(
            original,self.datasets,[0,50],epochs=1,seed=11)
        self.assertEqual((chosen,entries,splits),(chosen2,entries2,splits2))
        self.assertEqual([item["mix_percent"] for item in entries],
                         [None,0,50])
        expected=4*v2.N*len(self.datasets)
        for entry in entries:
            self.assertEqual(entry["evaluated_pixels"],expected)
            self.assertGreaterEqual(entry["inner_four_step_mse"],0)
        fit,selected,records,_,info=selection.select_and_refit(
            original,self.datasets,[0,50,100],epochs=1,seed=11)
        self.assertEqual(selected,self.receipt["strategy"]["selected_mix_percent"])
        self.assertEqual(records,self.receipt["strategy"]["candidates"])
        if selected is None:
            self.assertEqual(fit,original)
            self.assertEqual(info["examples"],0)
        else:
            self.assertNotEqual(fit,original)
            self.assertGreater(info["examples"],0)

    def test_report_retains_same_outer_holdout_metrics_and_distinct_stage_receipts(self):
        r=self.receipt
        self.assertEqual(r["kind"],"cpu_neural_inner_prefix_schedule_selection")
        self.assertTrue(r["neural_network"])
        self.assertFalse(r["text_to_video"])
        self.assertFalse(r["outer_holdout_used_for_selection"])
        self.assertEqual(r["sources"][0]["sha256"],sha256(self.video))
        self.assertEqual(len(r["strategy"]["candidates"]),4)
        self.assertEqual(r["strategy"]["candidate_mixes"],[0,50,100])
        self.assertEqual(r["strategy"]["inner_validation_steps"],4)
        self.assertTrue(r["strategy"]["unchanged_base_allowed"])
        self.assertEqual(r["strategy"]["refit_on_full_original_training_prefix"],
                         r["strategy"]["selected_mix_percent"] is not None)
        self.assertGreater(r["strategy"]["cpu_training_and_selection_seconds"],0)
        self.assertEqual(set(r["final_outer_audit"]["before"]),{"1","4","8"})
        self.assertEqual(set(r["final_outer_audit"]["after"]),{"1","4","8"})
        for horizon in (1,4,8):
            key=str(horizon)
            self.assertEqual(r["final_outer_audit"]["before"][key]["static_baseline_mse"],
                             r["final_outer_audit"]["after"][key]["static_baseline_mse"])
            self.assertEqual(r["final_outer_audit"]["before"][key]["evaluated_pixels"],
                             v2.N*horizon)
        self.assertEqual(r,json.loads((self.output/"schedule-report.json").read_text()))

    def test_selected_model_has_correct_integrity_and_unmodified_original_weights(self):
        r=self.receipt
        saved=self.output/"selected-model"/"model.json"
        selected=v2.read_model(saved)
        self.assertEqual(r["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["selected_model_sha256"],sha256(saved))
        self.assertEqual(selected["selection"]["base_model_sha256"],sha256(self.base))
        self.assertFalse(selected["selection"]["outer_holdout_in_selection"])
        self.assertEqual(selected["selection"]["replay_percent"],
                         r["strategy"]["selected_mix_percent"])
        self.assertEqual(selected["selection"]["weights_changed"],r["weights_changed"])
        self.assertEqual(v2.read_model(self.base)["weights"],self.model["weights"])
        if r["strategy"]["selected_mix_percent"] is None:
            self.assertFalse(r["weights_changed"])
            self.assertEqual(selected["weights"],self.model["weights"])
        else:
            self.assertTrue(r["weights_changed"])
            self.assertNotEqual(selected["weights"],self.model["weights"])

    def test_actual_baseline_selected_and_joined_h264_mp4s_have_correct_frames_and_sha(self):
        r=self.receipt
        for name in ("base","selected"):
            row=r["artifacts"][name]
            clip=self.output/row["file"]
            self.assertEqual(sha256(clip),row["sha256"])
            self.assertEqual(clip.stat().st_size,row["video_bytes"])
            self.assertEqual(video_info(probe(clip,count_frames=True)),(256,144,16))
        pair=r["artifacts"]["comparison"]
        self.assertEqual(sha256(self.output/pair["file"]),pair["sha256"])
        self.assertEqual((pair["width"],pair["height"],pair["frame_count"]),(512,144,16))
        self.assertEqual(video_info(probe(self.output/pair["file"],count_frames=True)),
                         (512,144,16))
        self.assertFalse(list(self.root.glob(".eternyx-neural-schedule-*")))
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            selection.run(self.base,self.source,self.output,[0,50,100],seed=11)

    def test_reject_invalid_unique_schedule_seed_epoch_and_media_budget(self):
        invalid=[[],[0,0],[0,50,100,25],[1],[None],["50"],[50,50],None]
        for i,mixes in enumerate(invalid):
            if mixes is None:
                with self.assertRaises(ValueError):selection.validate_mixes(mixes)
                continue
            with self.subTest(mixes=mixes),self.assertRaises(ValueError):
                selection.validate_mixes(mixes)
        for name,value in (
            ("seed",-1),("seed",True),("seed",2**31),
            ("epochs",0),("epochs",3),("epochs",True),
            ("seconds",0),("seconds",3),("seconds",True),
            ("stability",-1),("stability",86),
            ("variation",-1),("variation",21),
        ):
            with self.subTest(param=name,value=value),self.assertRaises(ValueError):
                selection.run(self.base,self.source,self.root/"invalid-batch",
                              [0,50],**{name:value})
        self.assertFalse((self.root/"invalid-batch").exists())

    def test_tampered_source_sha_and_changed_split_fail_before_any_training(self):
        model=copy.deepcopy(self.model)
        model["sources"][0]["sha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"SHA-256"):
            adaptation.training_sources(model,self.source)
        model=copy.deepcopy(self.model)
        model["sources"][0]["train_frames"]=12
        with self.assertRaisesRegex(ValueError,"split"):
            adaptation.training_sources(model,self.source)
        link=self.root/"source-symlink"
        link.symlink_to(self.source,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,"real local training folder"):
            adaptation.training_sources(self.model,link)

    def test_failure_during_second_video_rolls_back_entire_batch(self):
        original=v2.generate
        call_count=[]
        def broken(*args,**kwargs):
            call_count.append(1)
            if len(call_count)==2:
                raise ValueError("Simulated second H264 renderer failure")
            return original(*args,**kwargs)
        with patch("select_neural_schedule.v2.generate",side_effect=broken):
            with self.assertRaisesRegex(ValueError,"Simulated second"):
                selection.run(self.base,self.source,self.root/"failed-batch",
                              [0,50],seed=12,epochs=1,seconds=1)
        self.assertEqual(len(call_count),2)
        self.assertFalse((self.root/"failed-batch").exists())
        self.assertFalse(list(self.root.glob(".eternyx-neural-schedule-*")))

    def test_real_cli_trains_selects_and_checks_actual_cpu_video_receipts(self):
        tool=Path(__file__).resolve().parents[1]/"select_neural_schedule.py"
        out=self.root/"cli"
        proc=subprocess.run([
            sys.executable,str(tool),"--model",str(self.base),
            "--input",str(self.source),"--output",str(out),
            "--mix","0","--mix","50","--seed","27","--epochs","1",
            "--seconds","1","--stability","70","--variation","2",
        ],capture_output=True,text=True,timeout=180)
        self.assertEqual(proc.returncode,0,proc.stderr)
        stdout=json.loads(proc.stdout)
        self.assertFalse(stdout["outer_holdout_used_for_selection"])
        self.assertEqual(stdout["sha256"],sha256(out/"comparison.mp4"))
        self.assertEqual(stdout["outer_8_step_after"],
            json.loads((out/"schedule-report.json").read_text())[
                "final_outer_audit"]["after"]["8"]["model_mse"])


if __name__=="__main__":
    unittest.main()
