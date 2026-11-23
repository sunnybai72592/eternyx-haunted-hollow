"""Actual CPU FFmpeg tests proving learned label conditioning, not fake text-to-video."""
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
import train_tagged_neural_video as tag
from render_video_timeline import sha256, probe, video_info


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Actual locally installed FFmpeg/FFprobe required")
class LearnedTagVideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        work=tempfile.TemporaryDirectory()
        cls.addClassCleanup(work.cleanup)
        cls.root=Path(work.name)
        cls.sources=cls.root/"rights-reviewed"
        cls.sources.mkdir()
        for filename,pattern in [
            ("sunrise.mp4","testsrc=size=96x56:rate=16:duration=2"),
            ("ocean.mp4","testsrc2=size=96x56:rate=16:duration=2"),
        ]:
            subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                            "-f","lavfi","-i",pattern,"-threads","1",
                            "-c:v","libx264","-pix_fmt","yuv420p",
                            str(cls.sources/filename)],capture_output=True,check=True,timeout=30)
        cls.base_dir=cls.root/"base"
        v2.train(cls.sources,cls.base_dir,"owned-footage",
                 selected=["sunrise.mp4","ocean.mp4"],epochs=1,seed=11)
        cls.base=cls.base_dir/"model.json"
        cls.tags=cls.root/"tag-training"
        cls.report=tag.train(cls.base,cls.sources,cls.tags,
                             {"sunrise.mp4":"warm","ocean.mp4":"cool"},
                             epochs=2,seed=13)
        cls.adapter=cls.tags/"tag-model.json"

    def test_true_tag_specific_neural_weights_and_per_tag_holdout_metrics(self):
        r=self.report
        model=tag.verify_model(self.adapter)
        self.assertTrue(model["neural_network"])
        self.assertFalse(model["text_to_video"])
        self.assertEqual(model["adapter_architecture"],"per_tag_rgb_logit_residual_3x17")
        self.assertEqual(set(model["tags"]),{"warm","cool"})
        self.assertEqual(model["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["tag_model_sha256"],sha256(self.adapter))
        self.assertEqual(r["file_tags"][0]["sha256"],sha256(self.sources/"sunrise.mp4"))
        self.assertEqual(r["file_tags"][1]["sha256"],sha256(self.sources/"ocean.mp4"))
        self.assertNotEqual(model["tags"]["warm"]["adapter_weights"],tag.zero_weights())
        self.assertNotEqual(model["tags"]["cool"]["adapter_weights"],tag.zero_weights())
        self.assertNotEqual(model["tags"]["warm"]["adapter_weights"],
                            model["tags"]["cool"]["adapter_weights"])
        for label in ("warm","cool"):
            scores=r["metrics"][label]
            self.assertLess(scores["train_mse_after"],scores["train_mse_before"])
            self.assertGreater(scores["holdout_examples"],0)
            self.assertGreaterEqual(scores["holdout_style_mse"],0)
            self.assertGreaterEqual(scores["holdout_frozen_base_mse"],0)
        self.assertEqual(json.loads((self.tags/"training-report.json").read_text()),r)
        self.assertEqual(v2.read_model(self.base)["kind"],"cpu_neural_spatiotemporal_video")
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            tag.train(self.base,self.sources,self.tags,
                      {"sunrise.mp4":"warm","ocean.mp4":"cool"})

    def test_same_seed_two_trained_labels_generate_different_real_neural_rgb(self):
        base=v2.read_model(self.base)
        adapter=tag.verify_model(self.adapter)
        first=tag.sample_frames(base,adapter,"warm",seconds=1,seed=99,
                                stability=50,variation=3)
        repeated=tag.sample_frames(base,adapter,"warm",seconds=1,seed=99,
                                   stability=50,variation=3)
        other=tag.sample_frames(base,adapter,"cool",seconds=1,seed=99,
                                stability=50,variation=3)
        self.assertEqual(first,repeated)
        self.assertNotEqual(first,other)
        self.assertEqual(len(first),16)
        self.assertEqual(len(first[0]),48*28*3)
        self.assertGreater(len(set(first)),3)
        self.assertNotEqual(first[0],first[1])
        self.assertEqual(len(adapter["tags"]["warm"]["start_grid"]),12*7)
        self.assertEqual(len(adapter["tags"]["cool"]["motion_histogram"]),9)

    def test_actual_tagged_48x28_h264_clip_finished_mp4_and_hashes(self):
        output=self.root/"tag-video"
        r=tag.generate(self.base,self.adapter,"warm",output,seconds=1,
                       seed=17,stability=70,variation=2)
        self.assertTrue(r["neural_network"])
        self.assertFalse(r["text_to_video"])
        self.assertEqual(r["tag"],"warm")
        self.assertEqual(r["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["tag_model_sha256"],sha256(self.adapter))
        self.assertEqual(r["actual_clip_sha256"],sha256(output/"clip-01.mp4"))
        self.assertEqual(r["video_sha256"],sha256(output/"render"/"video.mp4"))
        self.assertEqual(r["video_bytes"],(output/"render"/"video.mp4").stat().st_size)
        self.assertEqual(video_info(probe(output/"clip-01.mp4",count_frames=True)),
                         (48,28,16))
        self.assertEqual(video_info(probe(output/"render"/"video.mp4",count_frames=True)),
                         (256,144,16))
        self.assertEqual(r["raw_temporal_diagnostics"]["frame_count"],16)
        self.assertEqual(json.loads((output/"generation-report.json").read_text()),r)
        self.assertFalse(list(self.root.glob(".eternyx-tag-sample-*")))

    def test_actual_two_tag_comparison_renders_three_distinct_playable_mp4s(self):
        out=self.root/"tag-comparison"
        r=tag.compare(self.base,self.adapter,"warm","cool",out,seconds=1,seed=19)
        self.assertEqual(r["tags"],["warm","cool"])
        self.assertEqual(r["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["tag_model_sha256"],sha256(self.adapter))
        self.assertEqual(len(r["candidates"]),2)
        self.assertNotEqual(r["candidates"][0]["sha256"],r["candidates"][1]["sha256"])
        for candidate in r["candidates"]:
            mp4=out/candidate["file"]
            self.assertEqual(candidate["sha256"],sha256(mp4))
            self.assertEqual(candidate["video_bytes"],mp4.stat().st_size)
            self.assertEqual(video_info(probe(mp4,count_frames=True)),(256,144,16))
        comparison=out/"comparison.mp4"
        self.assertEqual(r["comparison"]["sha256"],sha256(comparison))
        self.assertEqual(video_info(probe(comparison,count_frames=True)),
                         (512,144,16))
        self.assertEqual(json.loads((out/"comparison-report.json").read_text()),r)
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            tag.compare(self.base,self.adapter,"warm","cool",out)

    def test_refuse_untrained_tag_unsafe_name_and_source_rights_mismatch(self):
        base=v2.read_model(self.base)
        adapter=tag.verify_model(self.adapter)
        with self.assertRaisesRegex(ValueError,"actually trained"):
            tag.sample_frames(base,adapter,"invented",1,31)
        for value in ("", "Red", "label;cmd", "../path", "bad tag", "x"*25,
                      "🔴", 23):
            with self.subTest(value=value),self.assertRaises(ValueError):
                tag.check_tag(value)
        for mapping in (
            {},{"sunrise.mp4":"warm"},
            {"sunrise.mp4":"warm","ocean.mp4":"warm"},
            {"sunrise.mp4":"warm","ocean.mp4":"other","secret.mp4":"cold"},
            {"sunrise.mp4":"unsafe;","ocean.mp4":"cool"},
        ):
            with self.subTest(mapping=mapping),self.assertRaises(ValueError):
                tag.train(self.base,self.sources,self.root/"refused",
                          mapping,epochs=1)
        self.assertFalse((self.root/"refused").exists())

    def test_malformed_adapter_fail_closed_and_base_checkpoint_identity_enforced(self):
        good=json.loads(self.adapter.read_text())
        cases=[
            lambda m:m.update(text_to_video=True),
            lambda m:m.update(neural_network=False),
            lambda m:m.update(kind="fake"),
            lambda m:m["tags"]["warm"]["adapter_weights"][0].pop(),
            lambda m:m["tags"]["warm"]["adapter_weights"][0].__setitem__(0,float("nan")),
            lambda m:m["tags"]["warm"]["start_grid"][0].__setitem__(0,-1),
            lambda m:m["tags"]["warm"]["motion_histogram"].__setitem__(0,-1),
            lambda m:m["tags"]["cool"].update(source_sha256=[]),
            lambda m:m.update(base_model_sha256="BAD"),
            lambda m:m["tags"].update({"Bad Tag":m["tags"]["warm"]}),
        ]
        for i,modify in enumerate(cases):
            data=copy.deepcopy(good)
            modify(data)
            path=self.root/f"bad-adapter-{i}.json"
            path.write_text(json.dumps(data))
            with self.subTest(i=i),self.assertRaises(ValueError):
                tag.verify_model(path)
        copied=self.root/"altered-v2.json"
        altered=json.loads(self.base.read_text())
        altered["seed"]=int(altered["seed"])+1
        copied.write_text(json.dumps(altered))
        self.assertEqual(v2.read_model(copied)["kind"],"cpu_neural_spatiotemporal_video")
        with self.assertRaisesRegex(ValueError,"SHA-256"):
            tag.generate(copied,self.adapter,"warm",self.root/"wrong-base",seconds=1)
        self.assertFalse((self.root/"wrong-base").exists())

    def test_no_holdout_labels_used_for_gradient_updates(self):
        original=v2.read_model(self.base)
        datasets=adaptation.training_sources(original,self.sources)
        for source,frames,cutoff in datasets:
            training,heldout=tag.training_examples(frames,cutoff)
            corrupted=frames[:cutoff]+[bytes([63]*v2.N) for _ in frames[cutoff:]]
            unchanged,altered_heldout=tag.training_examples(corrupted,cutoff)
            self.assertEqual(training,unchanged)
            self.assertNotEqual(heldout,altered_heldout)
            self.assertGreater(len(heldout),0)
            self.assertEqual(source["sha256"],sha256(self.sources/source["file"]))

    def test_cli_local_tag_training_sampling_and_pair_comparison(self):
        tool=Path(__file__).resolve().parents[1]/"train_tagged_neural_video.py"
        dirname=self.root/"cli-adapter"
        trained=subprocess.run([sys.executable,str(tool),"train",
            "--base",str(self.base),"--input",str(self.sources),
            "--output",str(dirname),
            "--file-tag","sunrise.mp4:amber","--file-tag","ocean.mp4:marine",
            "--epochs","1","--seed","44"],
            text=True,capture_output=True,timeout=120)
        self.assertEqual(trained.returncode,0,trained.stderr)
        receipt=json.loads(trained.stdout)
        self.assertEqual(receipt["tag_model_sha256"],sha256(dirname/"tag-model.json"))
        single=self.root/"cli-single"
        generated=subprocess.run([sys.executable,str(tool),"generate",
            "--base",str(self.base),"--adapter",str(dirname/"tag-model.json"),
            "--output",str(single),"--tag","marine","--seconds","1","--seed","41"],
            text=True,capture_output=True,timeout=120)
        self.assertEqual(generated.returncode,0,generated.stderr)
        self.assertEqual(json.loads(generated.stdout)["video_sha256"],
                         sha256(single/"render"/"video.mp4"))
        pair=self.root/"cli-compare"
        compared=subprocess.run([sys.executable,str(tool),"compare",
            "--base",str(self.base),"--adapter",str(dirname/"tag-model.json"),
            "--output",str(pair),"--first-tag","amber","--second-tag","marine",
            "--seconds","1","--seed","51"],
            text=True,capture_output=True,timeout=120)
        self.assertEqual(compared.returncode,0,compared.stderr)
        self.assertEqual(json.loads(compared.stdout)["comparison"]["sha256"],
                         sha256(pair/"comparison.mp4"))


if __name__=="__main__":
    unittest.main()
