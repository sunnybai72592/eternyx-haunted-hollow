"""Actual FFmpeg CPU tests for leak-free neural tile-motion temporal coherence."""
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
import learn_tagged_spatial_motion as motion
import select_temporal_coherence as coherence
import train_tagged_neural_video as tag
import train_spatiotemporal_neural_video as v2
from render_video_timeline import probe,sha256,video_info


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Real offline FFmpeg/FFprobe required")
class RealCausalCoherenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        work=tempfile.TemporaryDirectory()
        cls.addClassCleanup(work.cleanup)
        cls.root=Path(work.name)
        cls.sources=cls.root/"owned-clips"
        cls.sources.mkdir()
        for name,pattern in (
            ("a.mp4","testsrc=size=96x56:rate=16:duration=2"),
            ("b.mp4","testsrc2=size=96x56:rate=16:duration=2"),
        ):
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                "-f","lavfi","-i",pattern,"-threads","1","-c:v","libx264",
                "-pix_fmt","yuv420p",str(cls.sources/name)],
                capture_output=True,check=True,timeout=30)
        cls.base_dir=cls.root/"base"
        v2.train(cls.sources,cls.base_dir,"owner-reviewed",
                 ["a.mp4","b.mp4"],epochs=1,seed=13)
        cls.base=cls.base_dir/"model.json"
        cls.tag_dir=cls.root/"style"
        tag.train(cls.base,cls.sources,cls.tag_dir,
                  {"a.mp4":"warm","b.mp4":"cool"},epochs=1,seed=22)
        cls.tag_model=cls.tag_dir/"tag-model.json"
        cls.motion_dir=cls.root/"spatial"
        motion.train(cls.base,cls.tag_model,cls.sources,cls.motion_dir,epochs=1,seed=23)
        cls.motion_model=cls.motion_dir/"motion-model.json"
        cls.model=motion.verify_model(cls.motion_model)
        cls.datasets=motion.reviewed_sources(v2.read_model(cls.base),
                                              tag.verify_model(cls.tag_model),
                                              cls.sources)
        cls.warm=[row for row in cls.datasets if row["tag"]=="warm"]
        cls.out=cls.root/"temporal-coherence"
        cls.report=coherence.run(cls.base,cls.tag_model,cls.motion_model,
                                 cls.sources,cls.out,"warm",
                                 seconds=1,seed=31,strength=60,
                                 stability=45,variation=6)

    def test_truly_causal_neighbor_and_temporal_decision_math(self):
        model=copy.deepcopy(self.model)
        # Real previous per-tile memory is one class, while base learned
        # probability can favor a different class. Strong temporal blending
        # must use previous synthetic motion, not the unseen true future.
        for tile in model["tags"]["warm"]["weights"]:
            for k,row in enumerate(tile):
                row[3]=8 if k==5 else -8
        previous=[4]*motion.TILES
        ordinary=coherence.decision(model,"warm",previous,2,16,0,0)
        stable=coherence.decision(model,"warm",previous,2,16,75,0)
        adjacent=coherence.decision(model,"warm",previous,2,16,0,75)
        self.assertEqual(ordinary,[5]*motion.TILES)
        self.assertEqual(stable,[4]*motion.TILES)
        self.assertEqual(adjacent,[4]*motion.TILES)
        self.assertEqual(ordinary,coherence.decision(model,"warm",previous,2,16,0,0))
        self.assertEqual(len(coherence.neighbors(0)),2)
        self.assertEqual(len(coherence.neighbors(5)),4)
        with self.assertRaises(ValueError):
            coherence.decision(model,"warm",previous,2,16,80,30)

    def test_original_prefix_inner_validation_never_overlaps_outer_heldout(self):
        splits=coherence.split_prefix(self.warm)
        self.assertEqual(len(splits),1)
        self.assertEqual((splits[0]["inner_training_end"],
                          splits[0]["inner_validation_start"],
                          splits[0]["inner_validation_end_exclusive"],
                          splits[0]["outer_holdout_start"]),(18,18,22,24))
        self.assertEqual(splits[0]["source_sha256"],sha256(self.sources/"a.mp4"))
        selected=coherence.select(self.model,"warm",self.warm)
        self.assertTrue(selected["training_only_selection"])
        self.assertEqual(selected["inner_steps"],4)
        self.assertEqual(len(selected["candidates"]),4)
        self.assertEqual(selected["candidates"][0]["temporal_percent"],0)
        self.assertEqual(selected["candidates"][0]["neighbor_percent"],0)
        self.assertTrue(selected["baseline_allowed"])
        self.assertIn((selected["selected_temporal_percent"],
                       selected["selected_neighbor_percent"]),coherence.OPTIONS)

    def test_mutating_only_outer_heldout_frames_and_motion_labels_does_not_change_selection(self):
        first=coherence.select(self.model,"warm",self.warm)
        changed=copy.deepcopy(self.warm)
        for row in changed:
            cutoff=row["cutoff"]
            row["frames"]=row["frames"][:cutoff]+[
                bytes([63]*v2.N) for _ in row["frames"][cutoff:]]
            # Preserve training-prefix transitions, corrupt only transitions
            # whose target is in final heldout.
            row["observed"]=row["observed"][:cutoff-1]+[
                [0]*motion.TILES for _ in row["observed"][cutoff-1:]]
        second=coherence.select(self.model,"warm",changed)
        self.assertEqual(first,second)
        before=coherence.final_audit(self.model,"warm",self.warm,first)
        after=coherence.final_audit(self.model,"warm",changed,second)
        self.assertNotEqual(before,after)
        self.assertTrue(before["no_outer_selection"])

    def test_four_candidate_data_driven_rule_retains_original_if_smoothing_hurts(self):
        real=coherence.evaluate(self.model,"warm",self.warm,
                lambda row:row["cutoff"]-6,4,0,0)
        penalized=[
            {**real,
             "predicted_warp_mae":round(real["predicted_warp_mae"]+.2,8),
             "selection_objective":round(real["selection_objective"]+.2,8)}
            for _ in range(3)]
        with patch("select_temporal_coherence.evaluate",
                   side_effect=[real]+penalized):
            selected=coherence.select(self.model,"warm",self.warm)
        self.assertEqual(selected["selected_temporal_percent"],0)
        self.assertEqual(selected["selected_neighbor_percent"],0)
        self.assertEqual(len(selected["candidates"]),4)
        self.assertEqual(selected["objective"]["warp_mae_coefficient"],1.)
        self.assertEqual(selected["objective"]["temporal_jitter_coefficient"],.02)
        self.assertEqual(selected["objective"]["spatial_disagreement_coefficient"],.01)

    def test_real_outer_horizon_motion_metrics_are_measured_without_auto_quality_claims(self):
        receipt=self.report
        self.assertTrue(receipt["neural_motion_classifier"])
        self.assertFalse(receipt["text_to_video"])
        self.assertEqual(receipt["kind"],"cpu_neural_tagged_temporal_coherence_audit")
        audit=receipt["final_outer_audit"]
        self.assertTrue(audit["no_outer_selection"])
        self.assertEqual(set(audit["baseline"]),{"1","4","8"})
        self.assertEqual(set(audit["selected"]),{"1","4","8"})
        for horizon in (1,4,8):
            first=audit["baseline"][str(horizon)]
            second=audit["selected"][str(horizon)]
            self.assertEqual(first["observations"],horizon*motion.TILES)
            self.assertEqual(second["observations"],horizon*motion.TILES)
            self.assertEqual(first["zero_shift_mae"],second["zero_shift_mae"])
            for item in (first,second):
                for key in ("predicted_warp_mae","zero_shift_mae",
                            "shift_accuracy","temporal_jitter",
                            "spatial_disagreement","selection_objective"):
                    self.assertGreaterEqual(item[key],0.)
        self.assertEqual(receipt["source_sha256"],[sha256(self.sources/"a.mp4")])
        self.assertGreaterEqual(receipt["cpu_selection_seconds"],0)
        self.assertGreaterEqual(receipt["cpu_render_seconds"],0)
        self.assertEqual(receipt,json.loads((self.out/"selection-report.json").read_text()))

    def test_real_h264_before_after_and_512x144_join_have_correct_origin_sha_and_frames(self):
        r=self.report
        selection=self.out/"selection-profile.json"
        self.assertEqual(sha256(selection),r["selection_profile_sha256"])
        self.assertEqual(json.loads(selection.read_text())["kind"],
                         "cpu_tagged_motion_coherence_profile")
        self.assertFalse(json.loads(selection.read_text())[
            "outer_holdout_used_for_selection"])
        self.assertEqual(r["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["tag_model_sha256"],sha256(self.tag_model))
        self.assertEqual(r["motion_model_sha256"],sha256(self.motion_model))
        for name in ("baseline","coherent"):
            item=r["artifacts"][name]
            path=self.out/item["file"]
            self.assertEqual(sha256(path),item["sha256"])
            self.assertEqual(path.stat().st_size,item["video_bytes"])
            self.assertEqual(video_info(probe(path,count_frames=True)),(256,144,16))
            self.assertEqual(item["frame_count"],16)
        pair=r["artifacts"]["comparison"]
        self.assertEqual(sha256(self.out/"comparison.mp4"),pair["sha256"])
        self.assertEqual(video_info(probe(self.out/"comparison.mp4",count_frames=True)),
                         (512,144,16))
        self.assertFalse(list(self.root.glob(".eternyx-temporal-coherence-*")))
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            coherence.run(self.base,self.tag_model,self.motion_model,self.sources,
                          self.out,"warm")

    def test_unsafe_inputs_wrong_owners_and_untrained_tags_are_rejected_before_outputs(self):
        for param,bad_values in (
            ("seconds",[0,4,True]),("seed",[-1,2**31,True]),
            ("strength",[-1,101,True]),("stability",[-1,86,True]),
            ("variation",[-1,21,True]),
        ):
            for value in bad_values:
                with self.subTest(param=param,value=value),self.assertRaises(ValueError):
                    coherence.run(self.base,self.tag_model,self.motion_model,
                                  self.sources,self.root/"invalid","warm",
                                  **{param:value})
        with self.assertRaisesRegex(ValueError,"trained tag"):
            coherence.run(self.base,self.tag_model,self.motion_model,self.sources,
                          self.root/"untrained","unknown")
        with self.assertRaises(ValueError):
            coherence.run(self.base,self.tag_model,self.motion_model,
                          self.sources,self.root/"invalid","warm",seconds=10)
        self.assertFalse((self.root/"invalid").exists())
        self.assertFalse((self.root/"untrained").exists())

    def test_renderer_rollback_then_real_cli_on_second_tag_and_sha_receipts(self):
        with patch("select_temporal_coherence.motion.generate",
                   side_effect=ValueError("Simulated offline H264 failure")):
            with self.assertRaisesRegex(ValueError,"Simulated"):
                coherence.run(self.base,self.tag_model,self.motion_model,
                              self.sources,self.root/"failed","warm")
        self.assertFalse((self.root/"failed").exists())
        self.assertFalse(list(self.root.glob(".eternyx-temporal-coherence-*")))
        program=Path(__file__).resolve().parents[1]/"select_temporal_coherence.py"
        target=self.root/"cli-output"
        result=subprocess.run([
            sys.executable,str(program),"--base",str(self.base),
            "--tag-model",str(self.tag_model),
            "--motion-model",str(self.motion_model),
            "--input",str(self.sources),"--output",str(target),
            "--tag","cool","--seconds","1","--seed","17",
            "--strength","80","--stability","55","--variation","4",
        ],capture_output=True,text=True,timeout=180)
        self.assertEqual(result.returncode,0,result.stderr)
        info=json.loads(result.stdout)
        self.assertFalse(info["outer_holdout_used_for_selection"])
        self.assertEqual(info["paired_mp4_sha256"],sha256(target/"comparison.mp4"))
        report=json.loads((target/"selection-report.json").read_text())
        self.assertEqual(report["tag"],"cool")
        self.assertEqual(info["eight_step_after"],
                         report["final_outer_audit"]["selected"]["8"]["predicted_warp_mae"])


if __name__=="__main__":
    unittest.main()
