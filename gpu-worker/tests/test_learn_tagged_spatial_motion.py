"""Actual CPU training and real FFmpeg verification of per-tag tile-motion learning."""
import copy
import json
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import train_spatiotemporal_neural_video as v2
import train_tagged_neural_video as tags
import learn_tagged_spatial_motion as motion
from render_video_timeline import probe,video_info,sha256


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Actual offline FFmpeg/FFprobe required")
class RealSpatialMotionVideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        working=tempfile.TemporaryDirectory()
        cls.addClassCleanup(working.cleanup)
        cls.root=Path(working.name)
        cls.sources=cls.root/"locally-approved"
        cls.sources.mkdir()
        for name,pattern in [
            ("demo-a.mp4","testsrc=size=96x56:rate=16:duration=2"),
            ("demo-b.mp4","testsrc2=size=96x56:rate=16:duration=2"),
        ]:
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                "-f","lavfi","-i",pattern,"-threads","1","-c:v","libx264",
                "-pix_fmt","yuv420p",str(cls.sources/name),
            ],check=True,capture_output=True,timeout=30)
        cls.baseline=cls.root/"base"
        v2.train(cls.sources,cls.baseline,"licensed-originals",
                 ["demo-a.mp4","demo-b.mp4"],epochs=1,seed=11)
        cls.base=cls.baseline/"model.json"
        cls.styles=cls.root/"styles"
        tags.train(cls.base,cls.sources,cls.styles,
                   {"demo-a.mp4":"spark","demo-b.mp4":"flow"},epochs=1,seed=17)
        cls.tagmodel=cls.styles/"tag-model.json"
        cls.motiondir=cls.root/"learned-motion"
        cls.training=motion.train(cls.base,cls.tagmodel,cls.sources,cls.motiondir,
                                  epochs=2,seed=21)
        cls.motionpath=cls.motiondir/"motion-model.json"
        cls.model=motion.verify_model(cls.motionpath)

    def test_learns_genuine_tag_specific_spatial_softmax_weights_not_fixed_presets(self):
        receipt=self.training
        model=self.model
        self.assertTrue(receipt["neural_motion_classifier"])
        self.assertFalse(receipt["text_to_video"])
        self.assertEqual(model["architecture"],
                         "4x3_tiles_9_motion_classes_4_features_softmax")
        self.assertEqual(model["base_model_sha256"],sha256(self.base))
        self.assertEqual(model["tag_model_sha256"],sha256(self.tagmodel))
        self.assertEqual(receipt["motion_model_sha256"],sha256(self.motionpath))
        self.assertEqual(set(model["tags"]),{"spark","flow"})
        self.assertEqual((motion.TILES,motion.CLASSES,motion.FEATURES),(12,9,4))
        self.assertEqual(len(model["tags"]["flow"]["weights"]),12)
        self.assertEqual(len(model["tags"]["flow"]["weights"][0]),9)
        self.assertNotEqual(model["tags"]["flow"]["weights"],motion.zero_motion())
        self.assertNotEqual(model["tags"]["spark"]["weights"],motion.zero_motion())
        self.assertNotEqual(model["tags"]["flow"]["weights"],
                            model["tags"]["spark"]["weights"])
        for label in ("spark","flow"):
            scores=receipt["metrics"][label]
            self.assertGreater(scores["training_observations"],0)
            self.assertLess(scores["training_ce_after"],scores["training_ce_before"])
            self.assertGreater(scores["heldout"]["observations"],0)
            self.assertGreaterEqual(scores["heldout"]["free_running_motion_cross_entropy"],0)
            self.assertGreaterEqual(scores["heldout"]["predicted_warp_frame_mae"],0)
            self.assertGreaterEqual(scores["heldout"]["zero_shift_frame_mae"],0)
        self.assertEqual(json.loads((self.motiondir/"training-report.json").read_text()),
                         receipt)
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            motion.train(self.base,self.tagmodel,self.sources,self.motiondir)

    def test_actual_detected_local_shift_and_bilinear_warp_spatial_coverage(self):
        rng=random.Random(11)
        old=bytes(rng.randrange(64) for _ in range(v2.N))
        changed=bytes(old[y*v2.W+(x-1)%v2.W]
                      for y in range(v2.H) for x in range(v2.W))
        for tile in range(motion.TILES):
            self.assertEqual(motion.observed_tile_shift(old,changed,tile),5)
        self.assertEqual(motion.warped(old,[5]*motion.TILES,0),old)
        self.assertEqual(motion.warped(old,[5]*motion.TILES,100),changed)
        with self.assertRaisesRegex(ValueError,"strength"):
            motion.warped(old,[5]*motion.TILES,101)
        tile=0
        one=motion.patch_error(old,changed,tile,1,0)
        still=motion.patch_error(old,changed,tile,0,0)
        self.assertAlmostEqual(one,0.0)
        self.assertGreater(still,0)

    def test_outer_heldout_pixels_never_enter_training_motion_examples(self):
        base=v2.read_model(self.base)
        tagdata=tags.verify_model(self.tagmodel)
        datasets=motion.reviewed_sources(base,tagdata,self.sources)
        before=[]
        after=[]
        for source in datasets:
            frames=source["frames"]
            cutoff=source["cutoff"]
            labels=source["observed"]
            altered=frames[:cutoff]+[bytes([0]*v2.N) for _ in frames[cutoff:]]
            changed=motion.motion_series(altered)
            self.assertEqual(labels[:cutoff-1],changed[:cutoff-1])
            for t in range(2,cutoff):
                for tile in range(motion.TILES):
                    before.append((tile,labels[t-2][tile],labels[t-1][tile],
                                   t/(len(frames)-1)))
                    after.append((tile,changed[t-2][tile],changed[t-1][tile],
                                  t/(len(frames)-1)))
        self.assertEqual(before,after)
        one,two=motion.zero_motion(),motion.zero_motion()
        motion.train_local(one,before,2,31)
        motion.train_local(two,after,2,31)
        self.assertEqual(one,two)
        self.assertNotEqual(one,motion.zero_motion())

    def test_trained_motion_changes_generation_with_strength_and_remains_seeded(self):
        base=v2.read_model(self.base)
        adapter=tags.verify_model(self.tagmodel)
        model=copy.deepcopy(self.model)
        # Force different learned tile decisions for a deterministic motion
        # strength experiment; do not assume the 2-second source contains motion.
        for tile in model["tags"]["spark"]["weights"]:
            for cls,row in enumerate(tile):
                row[3]=10.0 if cls==5 else -10.0
        stationary=motion.sample_frames(base,adapter,model,"spark",1,45,
                                        strength=0,stability=55,variation=3)
        moving=motion.sample_frames(base,adapter,model,"spark",1,45,
                                    strength=100,stability=55,variation=3)
        repeated=motion.sample_frames(base,adapter,model,"spark",1,45,
                                      strength=100,stability=55,variation=3)
        seeded=motion.sample_frames(base,adapter,model,"spark",1,45,
                                    strength=100,stability=55,variation=3,
                                    seeded_motion=True)
        self.assertEqual(moving,repeated)
        self.assertNotEqual(stationary,moving)
        self.assertNotEqual(seeded,moving)
        self.assertEqual(len(moving),16)
        self.assertTrue(all(len(f)==48*28*3 for f in moving))
        self.assertGreater(len(set(moving)),3)

    def test_real_h264_neural_motion_and_same_seed_two_tag_comparison(self):
        dest=self.root/"tagged-motion-clip"
        receipt=motion.generate(self.base,self.tagmodel,self.motionpath,"spark",dest,
                                seconds=1,seed=33,strength=80,stability=60,variation=4)
        self.assertEqual(receipt["motion_strength_percent"],80)
        self.assertEqual(receipt["tag"],"spark")
        self.assertEqual(receipt["motion_model_sha256"],sha256(self.motionpath))
        self.assertEqual(receipt["source_clip_sha256"],sha256(dest/"clip-01.mp4"))
        self.assertEqual(receipt["video_sha256"],sha256(dest/"render"/"video.mp4"))
        self.assertEqual(video_info(probe(dest/"clip-01.mp4",count_frames=True)),
                         (48,28,16))
        self.assertEqual(video_info(probe(dest/"render"/"video.mp4",count_frames=True)),
                         (256,144,16))
        self.assertEqual(json.loads((dest/"generation-report.json").read_text()),receipt)
        self.assertFalse(list(self.root.glob(".eternyx-spatial-sample-*")))
        pair=self.root/"two-motions"
        compared=motion.compare(self.base,self.tagmodel,self.motionpath,
                                "spark","flow",pair,seconds=1,seed=33,strength=80)
        self.assertEqual(compared["tags"],["spark","flow"])
        self.assertEqual(compared["candidates"][0]["frame_count"],16)
        self.assertEqual(compared["candidates"][1]["frame_count"],16)
        for row in compared["candidates"]:
            self.assertEqual(sha256(pair/row["file"]),row["sha256"])
            self.assertEqual(video_info(probe(pair/row["file"],count_frames=True)),
                             (256,144,16))
        self.assertEqual(video_info(probe(pair/"comparison.mp4",count_frames=True)),
                         (512,144,16))
        self.assertEqual(compared["comparison"]["sha256"],sha256(pair/"comparison.mp4"))
        self.assertEqual(compared,json.loads((pair/"comparison-report.json").read_text()))

    def test_reject_tampered_model_wrong_source_untrained_tags_and_invalid_arguments(self):
        base=v2.read_model(self.base)
        adapter=tags.verify_model(self.tagmodel)
        wrong=copy.deepcopy(base)
        wrong["sources"][0]["sha256"]="0"*64
        with self.assertRaises(ValueError):
            motion.reviewed_sources(wrong,adapter,self.sources)
        changed=copy.deepcopy(adapter)
        changed["file_tags"][0]["tag"]="unknown"
        with self.assertRaisesRegex(ValueError,"untrained"):
            motion.reviewed_sources(base,changed,self.sources)
        for invalid in (
            {"epochs":0},{"epochs":5},{"epochs":True},
            {"seed":-1},{"seed":True},{"seed":2**31},
        ):
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):
                motion.train(self.base,self.tagmodel,self.sources,
                             self.root/"bad-train",**invalid)
        model=copy.deepcopy(self.model)
        for invalid in (
            {"label":"unknown"},{"seconds":0},{"seconds":4},{"seconds":True},
            {"seed":-1},{"strength":-1},{"strength":101},
            {"stability":86},{"variation":21},{"seeded_motion":"true"},
        ):
            args={"label":"spark","seconds":1,"seed":45}
            args.update(invalid)
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):
                motion.sample_frames(base,adapter,model,**args)
        self.assertFalse((self.root/"bad-train").exists())

    def test_corrupted_nonfinite_motion_weights_and_mismatched_checkpoint_fail_closed(self):
        good=json.loads(self.motionpath.read_text())
        mutations=[
            lambda d:d.update(text_to_video=True),
            lambda d:d.update(neural_motion_classifier=False),
            lambda d:d.update(kind="not-trained"),
            lambda d:d["tags"]["spark"]["weights"].pop(),
            lambda d:d["tags"]["spark"]["weights"][0].pop(),
            lambda d:d["tags"]["spark"]["weights"][0][0].pop(),
            lambda d:d["tags"]["spark"]["weights"][0][0].__setitem__(0,float("nan")),
            lambda d:d["tags"]["flow"]["weights"][0][1].__setitem__(1,100),
            lambda d:d.update(base_model_sha256="WRONG"),
            lambda d:d["tags"]["spark"].update(source_sha256=[]),
        ]
        for idx,mutate in enumerate(mutations):
            item=copy.deepcopy(good)
            mutate(item)
            path=self.root/f"corrupt-{idx}.json"
            path.write_text(json.dumps(item))
            with self.subTest(index=idx),self.assertRaises(ValueError):
                motion.verify_model(path)
        wrong=self.root/"changed-tag.json"
        tagged_data=json.loads(self.tagmodel.read_text())
        tagged_data["seed"]+=1
        wrong.write_text(json.dumps(tagged_data))
        with self.assertRaisesRegex(ValueError,"SHA-256"):
            motion.generate(self.base,wrong,self.motionpath,"spark",
                            self.root/"mismatch",seconds=1)
        self.assertFalse((self.root/"mismatch").exists())

    def test_atomic_rollback_and_python_cli_real_train_generate_compare(self):
        with patch("learn_tagged_spatial_motion.render",
                   side_effect=ValueError("Simulated local H264 renderer failure")):
            with self.assertRaisesRegex(ValueError,"Simulated"):
                motion.generate(self.base,self.tagmodel,self.motionpath,
                                "spark",self.root/"no-output",seconds=1)
        self.assertFalse((self.root/"no-output").exists())
        self.assertFalse(list(self.root.glob(".eternyx-spatial-sample-*")))
        tool=Path(__file__).resolve().parents[1]/"learn_tagged_spatial_motion.py"
        destination=self.root/"cli-motion"
        trained=subprocess.run([sys.executable,str(tool),"train",
                "--base",str(self.base),"--tag-model",str(self.tagmodel),
                "--input",str(self.sources),"--output",str(destination),
                "--epochs","1","--seed","18"],
                capture_output=True,text=True,timeout=120)
        self.assertEqual(trained.returncode,0,trained.stderr)
        self.assertEqual(json.loads(trained.stdout)["motion_model_sha256"],
                         sha256(destination/"motion-model.json"))
        output=self.root/"cli-video"
        rendered=subprocess.run([sys.executable,str(tool),"generate",
                "--base",str(self.base),"--tag-model",str(self.tagmodel),
                "--motion-model",str(destination/"motion-model.json"),
                "--tag","flow","--output",str(output),
                "--seconds","1","--seed","11","--strength","60"],
                capture_output=True,text=True,timeout=120)
        self.assertEqual(rendered.returncode,0,rendered.stderr)
        self.assertEqual(json.loads(rendered.stdout)["video_sha256"],
                         sha256(output/"render"/"video.mp4"))
        paired=self.root/"cli-pair"
        comparison=subprocess.run([sys.executable,str(tool),"compare",
                "--base",str(self.base),"--tag-model",str(self.tagmodel),
                "--motion-model",str(destination/"motion-model.json"),
                "--output",str(paired),"--first","flow","--second","spark",
                "--seconds","1","--strength","60"],
                capture_output=True,text=True,timeout=120)
        self.assertEqual(comparison.returncode,0,comparison.stderr)
        self.assertEqual(json.loads(comparison.stdout)["comparison"]["sha256"],
                         sha256(paired/"comparison.mp4"))


if __name__=="__main__":
    unittest.main()
