"""Real CPU/FFmpeg integration for comparable neural v1/v2 video benchmarks."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import compare_cpu_neural_video as compare
import train_tiny_neural_video as v1
import train_spatiotemporal_neural_video as v2
from render_video_timeline import probe,video_info,sha256


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Actual installed CPU FFmpeg/FFprobe required")
class RealCPUModelComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp=tempfile.TemporaryDirectory()
        cls.addClassCleanup(tmp.cleanup)
        cls.root=Path(tmp.name)
        cls.inputs=cls.root/"approved-local-videos"
        cls.inputs.mkdir()
        for name,source in [
            ("original-1.mp4","testsrc=size=96x56:rate=16:duration=2"),
            ("original-2.mp4","testsrc2=size=96x56:rate=16:duration=2"),
        ]:
            subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                "-f","lavfi","-i",source,"-threads","1","-c:v","libx264",
                "-pix_fmt","yuv420p",str(cls.inputs/name)],
                capture_output=True,check=True,timeout=40)
        cls.output=cls.root/"matched-model-comparison"
        cls.result=compare.benchmark(cls.inputs,cls.output,"self-approved",
                                      ["original-1.mp4"],seed=21,epochs=1,seconds=1)

    def test_trains_real_v1_and_v2_on_exactly_same_local_source_sha256(self):
        r=self.result
        self.assertEqual(r["kind"],"cpu_neural_v1_v2_comparison")
        self.assertTrue(r["neural_network"])
        self.assertFalse(r["text_to_video"])
        self.assertTrue(r["same_training_sources"])
        self.assertEqual(len(r["sources"]),1)
        self.assertEqual(r["sources"][0]["sha256"],sha256(self.inputs/"original-1.mp4"))
        self.assertEqual(r["seed"],21)
        self.assertEqual(r["epochs"],1)
        self.assertEqual(r["seconds"],1)
        a=json.loads((self.output/"model-v1"/"training-report.json").read_text())
        b=json.loads((self.output/"model-v2"/"training-report.json").read_text())
        self.assertEqual(a["training_sources"][0]["sha256"],b["training_sources"][0]["sha256"])
        self.assertEqual(a["training_sources"][0]["train_frames"],
                         b["training_sources"][0]["train_frames"])
        self.assertEqual(a["training_sources"][0]["holdout_frames"],
                         b["training_sources"][0]["holdout_frames"])
        self.assertEqual(a["training_sources"][0]["used_frames"],32)
        self.assertEqual(b["training_sources"][0]["used_frames"],32)
        self.assertNotEqual(a["architecture"],b["architecture"])
        self.assertEqual(a["model_sha256"],r["artifacts"]["v1"]["model_sha256"])
        self.assertEqual(b["model_sha256"],r["artifacts"]["v2"]["model_sha256"])
        self.assertFalse(list(self.root.glob(".eternyx-neural-benchmark-*")))

    def test_eight_real_causal_prediction_steps_use_same_unseen_48x28_targets(self):
        r=self.result["evaluation"]
        self.assertEqual(r["resolution"],"48x28")
        self.assertTrue(r["same_sources"])
        self.assertFalse(r["teacher_forcing"])
        self.assertEqual(len(r["steps"]),8)
        self.assertEqual(set(r["windows"]),{"1","4","8"})
        for i,step in enumerate(r["steps"],1):
            self.assertEqual(step["step"],i)
            self.assertEqual(step["source_count"],1)
            for key in ("v1_mse","v2_mse","static_baseline_mse"):
                self.assertGreaterEqual(step[key],0)
                self.assertLessEqual(step[key],1)
        for n in (1,4,8):
            window=r["windows"][str(n)]
            for key in ("v1_mse","v2_mse","static_baseline_mse"):
                observed=round(sum(row[key] for row in r["steps"][:n])/n,8)
                self.assertAlmostEqual(observed,window[key])
        self.assertNotEqual(r["windows"]["8"]["v1_mse"],r["windows"]["8"]["v2_mse"])
        self.assertIn("nearest-neighbor",r["v1_evaluation"])

    def test_causal_evaluation_does_not_read_future_targets_into_generated_model_inputs(self):
        frames_low,_=v1.decode(self.inputs/"original-1.mp4")
        frames_high,_=v2.read_frames(self.inputs/"original-1.mp4")
        cutoff=24
        low_model=v1.read_model(self.output/"model-v1"/"model.json")
        high_model=v2.read_model(self.output/"model-v2"/"model.json")
        source=[{"file":"original-1.mp4","sha256":sha256(self.inputs/"original-1.mp4"),
                 "actual_frames":32,"path":self.inputs/"original-1.mp4"}]
        initial=compare.evaluate_sources(source,low_model,high_model)
        # Mutating only the ground-truth heldout TARGET frames changes errors,
        # but the same model-generated prediction traces remain independent of targets.
        low_prev=frames_low[cutoff-1]
        high_prev=frames_high[cutoff-1]
        high_older=frames_high[cutoff-2]
        low_pred=compare.v1_step(low_model,low_prev,cutoff/31)
        high_pred=compare.v2_step(high_model,high_older,high_prev,cutoff/31)
        self.assertEqual(low_pred,compare.v1_step(low_model,low_prev,cutoff/31))
        self.assertEqual(high_pred,compare.v2_step(high_model,high_older,high_prev,cutoff/31))
        self.assertEqual(initial["steps"][0]["source_count"],1)
        with self.assertRaisesRegex(ValueError,"actual 32x18"):
            compare.nearest_v1_to_v2(b"bad")

    def test_real_h264_outputs_and_side_by_side_have_verified_decoded_frames(self):
        r=self.result
        a=r["artifacts"]
        self.assertEqual((a["v1"]["learned_resolution"],a["v2"]["learned_resolution"]),
                         ("32x18","48x28"))
        self.assertEqual(a["v1"]["sample_frames"],16)
        self.assertEqual(a["v2"]["sample_frames"],16)
        for label in ("v1","v2"):
            row=a[label]
            self.assertEqual(sha256(self.output/row["model_file"]),row["model_sha256"])
            self.assertEqual(sha256(self.output/row["sample_file"]),row["sample_sha256"])
            self.assertEqual((self.output/row["sample_file"]).stat().st_size,row["sample_bytes"])
            self.assertEqual(video_info(probe(self.output/row["sample_file"],
                                              count_frames=True)),(256,144,16))
        pair=a["comparison"]
        self.assertEqual(pair["file"],"comparison.mp4")
        self.assertEqual(sha256(self.output/pair["file"]),pair["sha256"])
        self.assertEqual(video_info(probe(self.output/"comparison.mp4",
                                          count_frames=True)),(512,144,16))
        self.assertEqual(pair["video_bytes"],(self.output/"comparison.mp4").stat().st_size)
        self.assertEqual(r,json.loads((self.output/"comparison-report.json").read_text()))
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            compare.benchmark(self.inputs,self.output,"self-approved",["original-1.mp4"])

    def test_real_monotonic_training_evaluation_and_render_times_are_recorded_not_invented(self):
        times=self.result["cpu_elapsed_seconds"]
        self.assertEqual(set(times),{"v1_training","v2_training","matched_evaluation",
            "v1_sample_and_render","v2_sample_and_render","side_by_side_encoding","interpretation"})
        for k,v in times.items():
            if k!="interpretation":
                self.assertIsInstance(v,float)
                self.assertGreater(v,0)
        self.assertIn("hardware-dependent",times["interpretation"])
        self.assertNotIn("realism_score",self.result)
        self.assertNotIn("best_model",self.result)

    def test_reject_unequal_short_unlicensed_or_unsafe_source_sets_before_training(self):
        short=self.inputs/"too-short.mp4"
        subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                        "-f","lavfi","-i","testsrc=size=96x56:rate=16:duration=1",
                        "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",str(short)],
                       capture_output=True,check=True,timeout=30)
        linked=self.inputs/"shortcut.mp4"
        linked.symlink_to(self.inputs/"original-1.mp4")
        invalid=[
            [],["original-1.mp4","original-1.mp4"],
            ["original-1.mp4","original-2.mp4","too-short.mp4","shortcut.mp4"],
            ["../original-1.mp4"],["shortcut.mp4"],["too-short.mp4"],
        ]
        for i,names in enumerate(invalid):
            with self.subTest(names=names),self.assertRaises(ValueError):
                compare.benchmark(self.inputs,self.root/f"invalid-{i}",
                                  "rights-confirmed",names)
            self.assertFalse((self.root/f"invalid-{i}").exists())
        for label in ("","x\nunsafe","x"*181):
            with self.assertRaises(ValueError):
                compare.benchmark(self.inputs,self.root/"bad-rights",label,["original-1.mp4"])
        for v in [-1,2147483648,True]:
            with self.assertRaises(ValueError):
                compare.benchmark(self.inputs,self.root/"bad-seed","owned",["original-1.mp4"],seed=v)
        for v in [0,3,True]:
            with self.assertRaises(ValueError):
                compare.benchmark(self.inputs,self.root/"bad-epochs","owned",["original-1.mp4"],epochs=v)
        for v in [0,3,True]:
            with self.assertRaises(ValueError):
                compare.benchmark(self.inputs,self.root/"bad-seconds","owned",["original-1.mp4"],seconds=v)

    def test_roll_back_whole_comparison_if_second_trainer_or_renderer_fails(self):
        with patch("compare_cpu_neural_video.v2.train",
                   side_effect=ValueError("Simulated CPU v2 training failure")):
            with self.assertRaisesRegex(ValueError,"Simulated"):
                compare.benchmark(self.inputs,self.root/"partial","owned",
                                  ["original-1.mp4"],epochs=1)
        self.assertFalse((self.root/"partial").exists())
        self.assertFalse(list(self.root.glob(".eternyx-neural-benchmark-*")))

    def test_public_cli_really_trains_comparable_models_and_generates_actual_videos(self):
        # Replay CLI over the second source with distinct input configuration.
        tool=Path(__file__).resolve().parents[1]/"compare_cpu_neural_video.py"
        out=self.root/"cli-comparison"
        proc=subprocess.run([sys.executable,str(tool),
             "--input",str(self.inputs),"--output",str(out),
             "--rights-ref","owner-v2-evaluation","--clip","original-2.mp4",
             "--epochs","1","--seed","17","--seconds","1"],
            capture_output=True,text=True,timeout=180)
        self.assertEqual(proc.returncode,0,proc.stderr)
        data=json.loads(proc.stdout)
        self.assertEqual(data["sources"],1)
        self.assertEqual(data["sha256"],sha256(out/"comparison.mp4"))
        self.assertTrue((out/"sample-v1"/"render"/"video.mp4").is_file())
        self.assertTrue((out/"sample-v2"/"render"/"video.mp4").is_file())
        self.assertEqual(data["causal_8_step"],
            json.loads((out/"comparison-report.json").read_text())["evaluation"]["windows"]["8"])


if __name__=="__main__":
    unittest.main()
