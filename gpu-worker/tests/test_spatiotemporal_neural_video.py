"""Actual FFmpeg integration tests for two-frame 48x28 neural video v2."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from train_spatiotemporal_neural_video import (
    W,H,N,INPUTS,HIDDEN,OUTPUTS,feature,create_weights,forward,
    holdout_rollout,raw_diagnostics,read_frames,read_model,
    train,sample_frames,generate,
)
from render_video_timeline import probe,video_info,sha256


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Requires installed CPU FFmpeg/FFprobe")
class RealSpatiotemporalV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ctx=tempfile.TemporaryDirectory()
        cls.addClassCleanup(ctx.cleanup)
        cls.root=Path(ctx.name)
        cls.inputs=cls.root/"local-video-media"
        cls.inputs.mkdir()
        for name,filtergraph in [
            ("owner-a.mp4","testsrc=size=96x56:rate=16:duration=1.25"),
            ("owner-b.mp4","testsrc2=size=96x56:rate=16:duration=1.25")]:
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                "-f","lavfi","-i",filtergraph,"-threads","1",
                "-c:v","libx264","-pix_fmt","yuv420p",
                str(cls.inputs/name)],check=True,capture_output=True,timeout=30)
        cls.training=cls.root/"model"
        cls.receipt=train(cls.inputs,cls.training,"owner-reviewed-v2",
                          ["owner-a.mp4","owner-b.mp4"],seed=31,epochs=2)
        cls.checkpoint=cls.training/"model.json"
        cls.model=read_model(cls.checkpoint)

    def test_genuine_expanded_two_frame_neural_training_and_provenance(self):
        model=self.model
        receipt=self.receipt
        self.assertEqual((W,H,N),(48,28,1344))
        self.assertEqual(model["architecture"]["type"],"two_frame_neighborhood_mlp")
        self.assertEqual((INPUTS,HIDDEN,OUTPUTS),(24,16,3))
        self.assertTrue(model["neural_network"])
        self.assertFalse(model["text_to_video"])
        self.assertEqual(model["version"],2)
        self.assertEqual(model["sources"][0]["sha256"],sha256(self.inputs/"owner-a.mp4"))
        self.assertEqual(receipt["model_sha256"],sha256(self.checkpoint))
        self.assertEqual(receipt,json.loads((self.training/"training-report.json").read_text()))
        self.assertNotEqual(model["weights"],create_weights(31))
        self.assertLess(receipt["metrics"]["training_mse_after"],
                        receipt["metrics"]["training_mse_before"])
        self.assertGreater(receipt["metrics"]["training_examples"],0)
        self.assertGreater(receipt["metrics"]["holdout_examples"],0)
        self.assertGreater(receipt["metrics"]["rollout_evaluated_pixels"],0)
        self.assertGreaterEqual(receipt["metrics"]["four_step_rollout_mse"],0)
        self.assertGreaterEqual(receipt["metrics"]["four_step_static_baseline_mse"],0)
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            train(self.inputs,self.training,"owner-reviewed-v2",["owner-a.mp4"])

    def test_two_previous_frames_and_neighboring_pixels_affect_neural_inputs(self):
        original=bytes([16]*(W*H))
        changed=bytearray(original)
        pos=10*W+10
        other=bytearray(original)
        changed[pos]=63
        other[pos]=5
        before=feature(original,original,pos,0.5)
        older_change=feature(bytes(changed),original,pos,0.5)
        newer_change=feature(original,bytes(changed),pos,0.5)
        left=bytearray(original);left[pos-1]=63
        neighbor=feature(original,bytes(left),pos,0.5)
        self.assertEqual(len(before),INPUTS)
        self.assertNotEqual(before,older_change)
        self.assertNotEqual(before,newer_change)
        self.assertNotEqual(before,neighbor)
        self.assertNotEqual(before,feature(original,bytes(other),pos,0.5))
        self.assertEqual(len(forward(self.model["weights"],before)[1]),3)

    def test_heldout_rollout_uses_actual_causal_prefix_and_has_independent_baseline(self):
        frames,actual=read_frames(self.inputs/"owner-a.mp4")
        self.assertEqual(actual,20)
        cutoff=max(7,len(frames)*3//4)
        self.assertEqual(cutoff,15)
        loss,baseline,pixels=holdout_rollout(self.model["weights"],frames,cutoff,steps=4)
        self.assertEqual(pixels,4*N)
        self.assertGreaterEqual(loss,0)
        self.assertGreaterEqual(baseline,0)
        self.assertNotEqual(loss,baseline)
        self.assertLess(abs(loss-self.model["metrics"]["four_step_rollout_mse"]),1.0)

    def test_actual_sampled_neural_frames_are_seeded_and_temporally_distinct(self):
        a=sample_frames(self.model,2,13,stability=65,variation=4)
        b=sample_frames(self.model,2,13,stability=65,variation=4)
        c=sample_frames(self.model,2,14,stability=65,variation=4)
        self.assertEqual(len(a),32)
        self.assertTrue(all(len(frame)==W*H*3 for frame in a))
        self.assertEqual(a,b)
        self.assertNotEqual(a,c)
        self.assertGreater(len(set(a)),3)
        self.assertEqual(raw_diagnostics(a)["frame_count"],32)
        self.assertGreater(raw_diagnostics(a)["mean_adjacent_rgb_delta"],0)
        stable=sample_frames(self.model,1,13,stability=85,variation=0)
        free=sample_frames(self.model,1,13,stability=0,variation=0)
        self.assertNotEqual(stable,free)

    def test_real_two_frame_h264_and_renderer_receipt_integrity(self):
        output=self.root/"sample"
        receipt=generate(self.checkpoint,output,seconds=2,seed=18,
                         stability=70,variation=3)
        self.assertEqual(receipt["version"],2)
        self.assertTrue(receipt["neural_network"])
        self.assertFalse(receipt["text_to_video"])
        self.assertEqual((receipt["width"],receipt["height"]),(48,28))
        self.assertEqual(receipt["model_sha256"],sha256(self.checkpoint))
        self.assertEqual(receipt["sample_clip_sha256"],sha256(output/"clip-01.mp4"))
        self.assertEqual(receipt["final_mp4_sha256"],sha256(output/"render"/"video.mp4"))
        self.assertEqual(video_info(probe(output/"clip-01.mp4",count_frames=True)),
                         (48,28,32))
        self.assertEqual(video_info(probe(output/"render"/"video.mp4",count_frames=True)),
                         (256,144,32))
        renderer=json.loads((output/"render"/"manifest.json").read_text())
        self.assertEqual(renderer["video"]["sha256"],receipt["final_mp4_sha256"])
        self.assertFalse(renderer["model_generation"],
                         "Editor receipt describes only conventional H264 assembly")
        self.assertIn("Two-frame", (output/"render"/"captions.srt").read_text())
        self.assertEqual(json.loads((output/"generation-report.json").read_text()),receipt)
        self.assertFalse(list(self.root.glob(".eternyx-neural-v2-sample-*")))
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            generate(self.checkpoint,output)

    def test_high_portrait_and_standard_square_are_real_mp4_outputs(self):
        a=self.root/"portrait";b=self.root/"square"
        generate(self.checkpoint,a,seconds=1,seed=42,profile="portrait",quality="high")
        generate(self.checkpoint,b,seconds=1,seed=43,profile="square",quality="standard")
        self.assertEqual(video_info(probe(a/"render"/"video.mp4",count_frames=True)),
                         (288,512,16))
        self.assertEqual(video_info(probe(b/"render"/"video.mp4",count_frames=True)),
                         (256,256,16))

    def test_fail_closed_on_corrupt_weights_metrics_and_invalid_sampling(self):
        obj=json.loads(self.checkpoint.read_text())
        edits=[
            lambda m:m.update(kind="fake"),
            lambda m:m.update(neural_network=False),
            lambda m:m.update(text_to_video=True),
            lambda m:m["architecture"].update(inputs=12),
            lambda m:m["weights"]["w1"][0].pop(),
            lambda m:m["weights"]["b2"].append(1),
            lambda m:m["weights"]["w2"][0].__setitem__(0,float("nan")),
            lambda m:m["start_grid"][0].__setitem__(0,-1),
            lambda m:m["motion_histogram"].__setitem__(0,-1),
            lambda m:m["sources"][0].update(rights_ref=""),
            lambda m:m["metrics"].update(four_step_rollout_mse=-1),
        ]
        for i,change in enumerate(edits):
            value=json.loads(json.dumps(obj))
            change(value)
            path=self.root/f"invalid-model-{i}.json"
            path.write_text(json.dumps(value))
            with self.subTest(i=i),self.assertRaises(ValueError):
                read_model(path)
        for seconds,seed,stability,variation in [
            (0,42,45,6),(9,42,45,6),(True,42,45,6),
            (1,-1,45,6),(1,True,45,6),(1,42,86,6),
            (1,42,45,21),(1,42,45,True)]:
            with self.subTest(seconds=seconds,seed=seed),self.assertRaises(ValueError):
                sample_frames(self.model,seconds,seed,stability,variation)

    def test_reject_traversal_symlink_non16fps_or_missing_footage_rights(self):
        bad=self.inputs/"bad.mp4"
        subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                        "-f","lavfi","-i","testsrc=size=96x56:rate=30:duration=1",
                        "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",
                        str(bad)],check=True,capture_output=True,timeout=20)
        for label in ("","unsafe\nreference","x"*181):
            with self.assertRaises(ValueError):
                train(self.inputs,self.root/"refuse",label,["owner-a.mp4"])
        for name in ("../owner-a.mp4","/tmp/a.mp4","https://foo.mp4",
                     ".private.mp4","name\\video.mp4","badname.mov"):
            with self.subTest(name=name),self.assertRaises(ValueError):
                train(self.inputs,self.root/"refuse","owned",[name])
        linked=self.inputs/"symlink.mp4"
        linked.symlink_to(self.inputs/"owner-a.mp4")
        with self.assertRaisesRegex(ValueError,"symlink"):
            train(self.inputs,self.root/"refuse","owned",["symlink.mp4"])
        with self.assertRaisesRegex(ValueError,"16 FPS"):
            train(self.inputs,self.root/"refuse","owned",["bad.mp4"])
        self.assertFalse((self.root/"refuse").exists())

    def test_create_only_atomic_rollback_on_renderer_failure(self):
        with patch("train_spatiotemporal_neural_video.render",
                   side_effect=ValueError("Simulated offline CPU renderer failure")):
            with self.assertRaisesRegex(ValueError,"Simulated"):
                generate(self.checkpoint,self.root/"no-partial",seconds=1)
        self.assertFalse((self.root/"no-partial").exists())
        self.assertFalse(list(self.root.glob(".eternyx-neural-v2-sample-*")))

    def test_complete_local_python_cli_train_and_generate(self):
        tool=Path(__file__).resolve().parents[1]/"train_spatiotemporal_neural_video.py"
        modeldir=self.root/"cli-model"
        outputdir=self.root/"cli-output"
        fit=subprocess.run([
            sys.executable,str(tool),"train","--input",str(self.inputs),
            "--output",str(modeldir),"--rights-ref","owner-reviewed",
            "--clip","owner-a.mp4","--epochs","1","--seed","11",
        ],capture_output=True,text=True,timeout=90)
        self.assertEqual(fit.returncode,0,fit.stderr)
        training=json.loads(fit.stdout)
        self.assertEqual(training["model_sha256"],sha256(modeldir/"model.json"))
        gen=subprocess.run([
            sys.executable,str(tool),"generate","--model",str(modeldir/"model.json"),
            "--output",str(outputdir),"--seconds","1","--seed","21",
            "--stability","60","--variation","2",
        ],capture_output=True,text=True,timeout=90)
        self.assertEqual(gen.returncode,0,gen.stderr)
        self.assertEqual(json.loads(gen.stdout)["video_sha256"],
                         sha256(outputdir/"render"/"video.mp4"))


if __name__=="__main__":
    unittest.main()
