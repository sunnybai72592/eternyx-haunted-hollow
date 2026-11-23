"""Real FFmpeg integration for CPU two-frame neural causal-prefix adaptation."""
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
import adapt_neural_rollout as adaptation
import train_spatiotemporal_neural_video as v2
from render_video_timeline import probe,sha256,video_info


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Actual local CPU FFmpeg required")
class CausalRolloutAdaptationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder=tempfile.TemporaryDirectory()
        cls.addClassCleanup(folder.cleanup)
        cls.root=Path(folder.name)
        cls.input=cls.root/"owned-footage"
        cls.input.mkdir()
        cls.clip=cls.input/"owner.mp4"
        subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                        "-f","lavfi","-i","testsrc=size=96x56:rate=16:duration=2",
                        "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",
                        str(cls.clip)],check=True,capture_output=True,timeout=30)
        cls.base_folder=cls.root/"original-v2"
        v2.train(cls.input,cls.base_folder,"owner-reviewed",
                 ["owner.mp4"],seed=12,epochs=1)
        cls.base=cls.base_folder/"model.json"
        cls.output=cls.root/"adapted-batch"
        cls.receipt=adaptation.adapt(cls.base,cls.input,cls.output,
                                     epochs=1,mix_percent=50,seed=29,seconds=1,
                                     stability=60,variation=4)

    def test_actual_v2_weights_change_without_overwriting_existing_checkpoint(self):
        r=self.receipt
        prior=v2.read_model(self.base)
        adapted=v2.read_model(self.output/"adapted-model"/"model.json")
        self.assertNotEqual(prior["weights"],adapted["weights"])
        self.assertEqual(r["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["adapted_model_sha256"],
                         sha256(self.output/"adapted-model"/"model.json"))
        self.assertNotEqual(r["base_model_sha256"],r["adapted_model_sha256"])
        self.assertEqual(prior["kind"],adapted["kind"])
        self.assertEqual(adapted["version"],2)
        self.assertFalse(adapted["text_to_video"])
        self.assertEqual(adapted["adaptation"]["base_model_sha256"],
                         r["base_model_sha256"])
        self.assertTrue(adapted["adaptation"]["no_holdout_training"])
        self.assertEqual(adapted["adaptation"]["teacher_replay_percent"],50)
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            adaptation.adapt(self.base,self.input,self.output)
        self.assertFalse(list(self.root.glob(".eternyx-causal-adapt-*")))

    def test_training_uses_only_original_prefix_and_never_unseen_holdout_labels(self):
        original=v2.read_model(self.base)
        datasets=adaptation.training_sources(original,self.input)
        source,frames,cutoff=datasets[0]
        self.assertEqual((len(frames),cutoff),(32,24))
        self.assertEqual(self.receipt["sources"][0]["holdout_frames"],8)
        examples,anchors,teacher=adaptation.build_training_replay(
            copy.deepcopy(original["weights"]),datasets,seed=29,epoch=0,mix_percent=50)
        self.assertTrue(examples)
        self.assertTrue(anchors)
        self.assertGreater(teacher,0)
        prefix=frames[:cutoff]
        modified=prefix+[bytes([63]*v2.N) for _ in frames[cutoff:]]
        altered=[(source,modified,cutoff)]
        new_examples,new_anchors,new_teacher=adaptation.build_training_replay(
            copy.deepcopy(original["weights"]),altered,seed=29,epoch=0,mix_percent=50)
        self.assertEqual(examples,new_examples,
                         "Changing heldout target pixels must not change any optimizer example")
        self.assertEqual(anchors,new_anchors)
        self.assertEqual(teacher,new_teacher)
        self.assertNotEqual(adaptation.causal_metrics(original["weights"],datasets),
                            adaptation.causal_metrics(original["weights"],altered))

    def test_real_1_4_8_step_causal_holdout_metrics_include_adverse_regressions(self):
        r=self.receipt
        metrics=r["evaluation"]
        self.assertEqual(metrics["resolution"],"48x28")
        self.assertEqual(set(metrics["baseline"]),{"1","4","8"})
        self.assertEqual(set(metrics["adapted"]),{"1","4","8"})
        for name in ("baseline","adapted"):
            for horizon in (1,4,8):
                row=metrics[name][str(horizon)]
                self.assertEqual(row["steps"],horizon)
                self.assertEqual(row["evaluated_pixels"],v2.N*horizon)
                self.assertGreaterEqual(row["model_mse"],0)
                self.assertGreaterEqual(row["static_baseline_mse"],0)
        for n in (1,4,8):
            self.assertEqual(metrics["baseline"][str(n)]["static_baseline_mse"],
                             metrics["adapted"][str(n)]["static_baseline_mse"])
        self.assertGreaterEqual(metrics["one_step_teacher_forced_baseline_mse"],0)
        self.assertGreaterEqual(metrics["one_step_teacher_forced_adapted_mse"],0)
        self.assertIn("Error may worsen",metrics["interpretation"])
        self.assertFalse("winner" in metrics)

    def test_renders_two_independent_verified_mp4s_and_real_joined_h264(self):
        r=self.receipt
        self.assertTrue(r["neural_network"])
        self.assertFalse(r["text_to_video"])
        self.assertEqual(r["training_source_count"],1)
        self.assertEqual(r["training"]["epochs"],1)
        self.assertEqual(r["training"]["teacher_replay_percent"],50)
        self.assertGreater(r["training"]["total_examples"],0)
        self.assertEqual(r["training"]["no_holdout_training"],True)
        self.assertGreater(r["training"]["training_seconds"],0)
        for label in ("baseline","adapted"):
            a=r["artifacts"][label]
            path=self.output/a["file"]
            self.assertEqual(a["sha256"],sha256(path))
            self.assertEqual(a["video_bytes"],path.stat().st_size)
            self.assertEqual(a["frame_count"],16)
            self.assertEqual(video_info(probe(path,count_frames=True)),(256,144,16))
        a=r["artifacts"]["comparison"]
        self.assertEqual(a["sha256"],sha256(self.output/a["file"]))
        self.assertEqual(a["video_bytes"],(self.output/a["file"]).stat().st_size)
        self.assertEqual(video_info(probe(self.output/a["file"],count_frames=True)),
                         (512,144,16))
        self.assertEqual(r,json.loads((self.output/"adaptation-report.json").read_text()))

    def test_teacher_mix_bounded_and_repeatable_on_training_prefix(self):
        model=v2.read_model(self.base)
        datasets=adaptation.training_sources(model,self.input)
        base,_,n=adaptation.build_training_replay(
            model["weights"],datasets,21,0,0)
        with_mix,_,m=adaptation.build_training_replay(
            model["weights"],datasets,21,0,100)
        self.assertEqual(n,0)
        self.assertEqual(m,len(base))
        self.assertEqual(len(with_mix),2*len(base))
        again,_,_=adaptation.build_training_replay(
            model["weights"],datasets,21,0,0)
        self.assertEqual(base,again)
        self.assertTrue(all(example[0] and example[1] and example[2] for example in base))

    def test_reject_tampered_local_source_and_changed_original_model(self):
        model=v2.read_model(self.base)
        altered=copy.deepcopy(model)
        altered["sources"][0]["sha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"SHA-256"):
            adaptation.training_sources(altered,self.input)
        altered=model.copy()
        altered["sources"]=copy.deepcopy(model["sources"])
        altered["sources"][0]["train_frames"]=12
        with self.assertRaisesRegex(ValueError,"split"):
            adaptation.training_sources(altered,self.input)
        link=self.root/"input-link"
        link.symlink_to(self.input,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,"real local training folder"):
            adaptation.training_sources(model,link)

    def test_reject_unsafe_controls_before_training_or_artifacts(self):
        for overrides in (
            {"epochs":0},{"epochs":4},{"epochs":True},
            {"mix_percent":-1},{"mix_percent":101},{"mix_percent":"50"},
            {"seed":-1},{"seed":True},{"seed":2**31},
            {"seconds":0},{"seconds":3},{"seconds":True},
            {"stability":-1},{"stability":86},
            {"variation":-1},{"variation":21},
        ):
            with self.subTest(override=overrides),self.assertRaises(ValueError):
                adaptation.adapt(self.base,self.input,self.root/"invalid",**overrides)
        self.assertFalse((self.root/"invalid").exists())

    def test_second_render_failure_rolls_back_entire_atomic_adaptation(self):
        original=v2.generate
        calls=[]
        def reject_second(*args,**kwargs):
            calls.append(kwargs.get("seconds"))
            if len(calls)>1:
                raise ValueError("Simulated second offline render failure")
            return original(*args,**kwargs)
        with patch("adapt_neural_rollout.model_v2.generate",side_effect=reject_second):
            with self.assertRaisesRegex(ValueError,"Simulated second"):
                adaptation.adapt(self.base,self.input,self.root/"failed",
                                 epochs=1,mix_percent=0,seed=27)
        self.assertFalse((self.root/"failed").exists())
        self.assertFalse(list(self.root.glob(".eternyx-causal-adapt-*")))

    def test_cli_runs_actual_cpu_neural_v2_adaptation_and_verifiable_video(self):
        tool=Path(__file__).resolve().parents[1]/"adapt_neural_rollout.py"
        out=self.root/"cli-out"
        process=subprocess.run([
            sys.executable,str(tool),
            "--model",str(self.base),"--input",str(self.input),
            "--output",str(out),"--epochs","1","--mix-percent","25",
            "--seed","31","--seconds","1","--stability","60","--variation","2",
        ],capture_output=True,text=True,timeout=180)
        self.assertEqual(process.returncode,0,process.stderr)
        stdout=json.loads(process.stdout)
        self.assertEqual(stdout["adapted_model_sha256"],
                         sha256(out/"adapted-model"/"model.json"))
        self.assertEqual(stdout["comparison_sha256"],sha256(out/"comparison.mp4"))
        saved=json.loads((out/"adaptation-report.json").read_text())
        self.assertEqual(stdout["holdout_8_step_after"],
                         saved["evaluation"]["adapted"]["8"]["model_mse"])


if __name__=="__main__":
    unittest.main()
