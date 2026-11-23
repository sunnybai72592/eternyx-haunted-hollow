"""Real FFmpeg integration: local learned 4x3 per-tag motion and H264 verification."""
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
import adapt_neural_rollout as adap
import train_spatiotemporal_neural_video as v2
import train_tagged_neural_video as tags
import train_spatial_motion_video as motion
from render_video_timeline import probe,video_info,sha256


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Actual offline FFmpeg/FFprobe CPU codecs required")
class ActualSpatialMotionVideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        context=tempfile.TemporaryDirectory()
        cls.addClassCleanup(context.cleanup)
        cls.root=Path(context.name)
        cls.sources=cls.root/"owned-footage"
        cls.sources.mkdir()
        for name,pattern in (
            ("river.mp4","testsrc=size=96x56:rate=16:duration=2"),
            ("embers.mp4","testsrc2=size=96x56:rate=16:duration=2"),
        ):
            subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
                "-f","lavfi","-i",pattern,"-threads","1","-c:v","libx264",
                "-pix_fmt","yuv420p",str(cls.sources/name)],
                capture_output=True,check=True,timeout=30)
        cls.base_dir=cls.root/"base-model"
        v2.train(cls.sources,cls.base_dir,"approved-owner",
                 ["river.mp4","embers.mp4"],epochs=1,seed=13)
        cls.base=cls.base_dir/"model.json"
        cls.tag_dir=cls.root/"tag-model"
        tags.train(cls.base,cls.sources,cls.tag_dir,
                   {"river.mp4":"river","embers.mp4":"fire"},epochs=1,seed=14)
        cls.tags=cls.tag_dir/"tag-model.json"
        cls.motion_dir=cls.root/"spatial-motion"
        cls.training=motion.train(cls.base,cls.tags,cls.sources,cls.motion_dir,
                                  epochs=2,seed=25)
        cls.checkpoint=cls.motion_dir/"motion-model.json"
        cls.learned=motion.read_motion_model(cls.checkpoint)

    def test_train_actual_softmax_motion_weights_with_tag_specific_source_sha(self):
        r=self.training
        self.assertTrue(r["neural_network"])
        self.assertFalse(r["text_to_video"])
        self.assertEqual(r["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["tag_model_sha256"],sha256(self.tags))
        self.assertEqual(r["motion_model_sha256"],sha256(self.checkpoint))
        self.assertEqual(set(r["labels"]),{"fire","river"})
        self.assertEqual(self.learned["architecture"],"per_tag_softmax_9x8_tile_features")
        self.assertEqual((self.learned["tiles_x"],self.learned["tiles_y"]),(4,3))
        self.assertEqual((self.learned["trained_width"],self.learned["trained_height"]),(48,28))
        self.assertEqual(len(self.learned["tags"]["fire"]["weights"]),9)
        self.assertEqual(len(self.learned["tags"]["fire"]["weights"][0]),8)
        self.assertNotEqual(self.learned["tags"]["fire"]["weights"],
                            motion.new_weights(25+sum((i+1)*ord(c)
                                        for i,c in enumerate("fire"))))
        self.assertNotEqual(self.learned["tags"]["river"]["weights"],
                            self.learned["tags"]["fire"]["weights"])
        self.assertEqual(self.learned["tags"]["river"]["source_sha256"],
                         [sha256(self.sources/"river.mp4")])
        self.assertEqual(json.loads((self.motion_dir/"training-report.json").read_text()),r)
        self.assertEqual(tags.verify_model(self.tags)["kind"],
                         "cpu_neural_locally_tag_conditioned")
        self.assertEqual(v2.read_model(self.base)["kind"],"cpu_neural_spatiotemporal_video")
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            motion.train(self.base,self.tags,self.sources,self.motion_dir)

    def test_train_and_heldout_metrics_are_actual_local_motion_labels_and_baselines(self):
        for label in ("river","fire"):
            m=self.training["metrics"][label]
            self.assertGreater(m["training_tiles"],0)
            self.assertGreater(m["heldout"]["evaluated_tiles"],0)
            for key in ("classifier_accuracy","stationary_baseline_accuracy",
                        "training_majority_baseline_accuracy"):
                self.assertGreaterEqual(m["heldout"][key],0)
                self.assertLessEqual(m["heldout"][key],1)
            self.assertGreaterEqual(m["heldout"]["cross_entropy"],0)
            self.assertGreaterEqual(m["train_cross_entropy_before"],0)
            self.assertGreaterEqual(m["train_cross_entropy_after"],0)
            self.assertEqual(len(self.learned["tags"][label]["training_shift_counts"]),9)
            self.assertGreater(sum(self.learned["tags"][label]["training_shift_counts"]),0)

    def test_no_holdout_frames_enter_motion_training_pairs_or_empirical_priors(self):
        base=v2.read_model(self.base)
        tagger=tags.verify_model(self.tags)
        originals=motion.verified_tag_sources(base,tagger,self.sources)
        for label,group in originals.items():
            for source,frames,cutoff in group:
                fit,heldout=motion.samples_for_frames(frames,cutoff)
                mutated=frames[:cutoff]+[bytes([63]*v2.N) for _ in frames[cutoff:]]
                fit_again,heldout_changed=motion.samples_for_frames(mutated,cutoff)
                self.assertEqual(fit,fit_again)
                self.assertNotEqual(heldout,heldout_changed)
                self.assertEqual(source["sha256"],
                                 sha256(self.sources/source["file"]))
                self.assertEqual(len(fit),(cutoff-1)*12)
                self.assertEqual(len(heldout),(len(frames)-cutoff)*12)

    def test_spatial_tile_motion_is_not_one_global_translation_and_is_seeded(self):
        frame=bytes((i*13)%64 for i in range(v2.N))
        shifted=[(1,0)]*3+[(-1,0)]*3+[(0,1)]*3+[(0,-1)]*3
        result=motion.warp(frame,shifted,100)
        stationary=motion.warp(frame,shifted,0)
        self.assertEqual(stationary,frame)
        self.assertEqual(len(result),v2.N)
        self.assertNotEqual(result,frame)
        self.assertNotEqual(result,motion.warp(frame,[(1,0)]*12,100))
        center=motion.tile_features(frame,4)
        self.assertEqual(len(center),7)
        self.assertEqual(motion.probabilities(self.learned["tags"]["fire"]["weights"],center).__len__(),9)
        self.assertAlmostEqual(sum(motion.probabilities(
            self.learned["tags"]["fire"]["weights"],center)),1,places=8)
        base=v2.read_model(self.base)
        color=tags.verify_model(self.tags)
        first=motion.sample_frames(base,color,self.learned,"river",1,18,strength=100)
        same=motion.sample_frames(base,color,self.learned,"river",1,18,strength=100)
        other=motion.sample_frames(base,color,self.learned,"fire",1,18,strength=100)
        self.assertEqual(first,same)
        self.assertNotEqual(first,other)
        self.assertEqual(len(first),16)
        self.assertEqual(len(first[0]),48*28*3)
        self.assertGreater(len(set(first)),2)

    def test_create_real_neural_spatial_motion_clip_and_independent_h264_output(self):
        out=self.root/"single-motion-video"
        r=motion.generate(self.base,self.tags,self.checkpoint,
                          "fire",out,seconds=1,seed=19,strength=75,
                          stability=60,variation=4)
        self.assertEqual(r["tag"],"fire")
        self.assertFalse(r["text_to_video"])
        self.assertEqual(r["base_model_sha256"],sha256(self.base))
        self.assertEqual(r["tag_model_sha256"],sha256(self.tags))
        self.assertEqual(r["motion_model_sha256"],sha256(self.checkpoint))
        self.assertEqual(r["spatial_motion_strength"],75)
        self.assertEqual(r["source_clip_sha256"],sha256(out/"clip-01.mp4"))
        self.assertEqual(r["video_sha256"],sha256(out/"render"/"video.mp4"))
        self.assertEqual(video_info(probe(out/"clip-01.mp4",count_frames=True)),(48,28,16))
        self.assertEqual(video_info(probe(out/"render"/"video.mp4",count_frames=True)),(256,144,16))
        self.assertEqual(r["raw_temporal_metrics"]["frame_count"],16)
        self.assertEqual(json.loads((out/"generation-report.json").read_text()),r)
        self.assertFalse(list(self.root.glob(".eternyx-spatial-motion-sample-*")))

    def test_real_same_tag_same_seed_before_after_side_by_side_is_decode_verified(self):
        out=self.root/"motion-comparison"
        r=motion.compare(self.base,self.tags,self.checkpoint,
                         "river",out,seconds=1,seed=23,strength=100)
        self.assertEqual(r["kind"],"cpu_neural_spatial_motion_comparison")
        self.assertEqual(r["tag"],"river")
        self.assertEqual((r["seed"],r["seconds"],r["strength"]),(23,1,100))
        for key in ("global","spatial"):
            item=r["artifacts"][key]
            self.assertEqual(sha256(out/item["file"]),item["sha256"])
            self.assertEqual((out/item["file"]).stat().st_size,item["video_bytes"])
            self.assertEqual(video_info(probe(out/item["file"],count_frames=True)),
                             (256,144,16))
        pair=r["artifacts"]["comparison"]
        self.assertEqual(sha256(out/pair["file"]),pair["sha256"])
        self.assertEqual(video_info(probe(out/pair["file"],count_frames=True)),
                         (512,144,16))
        self.assertEqual(json.loads((out/"comparison-report.json").read_text()),r)
        with self.assertRaisesRegex(ValueError,"no overwriting"):
            motion.compare(self.base,self.tags,self.checkpoint,"river",out)

    def test_refuse_incorrect_source_tag_adapters_and_nonfinite_trained_weights(self):
        base=v2.read_model(self.base)
        t=tags.verify_model(self.tags)
        bad=copy.deepcopy(t)
        bad["file_tags"][0]["sha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"SHA"):
            motion.verified_tag_sources(base,bad,self.sources)
        bad=copy.deepcopy(t)
        bad["file_tags"][0]["tag"]="invented"
        with self.assertRaisesRegex(ValueError,"Tag mapping"):
            motion.verified_tag_sources(base,bad,self.sources)
        good=json.loads(self.checkpoint.read_text())
        cases=[
            lambda x:x.update(text_to_video=True),
            lambda x:x.update(neural_network=False),
            lambda x:x.update(kind="fake"),
            lambda x:x["tags"]["river"]["weights"][0].pop(),
            lambda x:x["tags"]["river"]["weights"][0].__setitem__(0,float("nan")),
            lambda x:x["tags"]["fire"]["training_shift_counts"].__setitem__(0,-1),
            lambda x:x["tags"]["fire"].update(source_sha256=[]),
            lambda x:x.update(base_model_sha256="BAD"),
            lambda x:x["tags"].update({"Unsafe Tag":x["tags"]["river"]}),
        ]
        for i,edit in enumerate(cases):
            changed=copy.deepcopy(good);edit(changed)
            path=self.root/f"invalid-motion-{i}.json"
            path.write_text(json.dumps(changed))
            with self.subTest(i=i),self.assertRaises(ValueError):
                motion.read_motion_model(path)
        wrong=self.root/"wrong-base.json"
        data=json.loads(self.base.read_text());data["seed"]+=1
        wrong.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,"SHA-256"):
            motion.generate(wrong,self.tags,self.checkpoint,
                            "fire",self.root/"refuse-wrong-base",seconds=1)

    def test_strict_sampling_controls_and_atomic_rollback_on_encoding_failure(self):
        base=v2.read_model(self.base);style=tags.verify_model(self.tags)
        for kw in (
            {"seconds":0},{"seconds":3},{"seed":-1},{"seed":True},
            {"strength":-1},{"strength":101},{"strength":"85"},
            {"stability":86},{"variation":21},
        ):
            with self.subTest(kw=kw),self.assertRaises(ValueError):
                motion.sample_frames(base,style,self.learned,"river",**kw)
        with self.assertRaisesRegex(ValueError,"actually trained"):
            motion.sample_frames(base,style,self.learned,"invented",1,31)
        with patch("train_spatial_motion_video.render",
                   side_effect=ValueError("Simulated renderer failure")):
            with self.assertRaisesRegex(ValueError,"Simulated"):
                motion.generate(self.base,self.tags,self.checkpoint,"river",
                                self.root/"partial",seconds=1)
        self.assertFalse((self.root/"partial").exists())
        self.assertFalse(list(self.root.glob(".eternyx-spatial-motion-sample-*")))

    def test_actual_offline_cli_train_generate_and_compare(self):
        tool=Path(__file__).resolve().parents[1]/"train_spatial_motion_video.py"
        out=self.root/"cli-model"
        result=subprocess.run([sys.executable,str(tool),"train",
            "--base",str(self.base),"--tags",str(self.tags),
            "--input",str(self.sources),"--output",str(out),
            "--epochs","1","--seed","57"],
            capture_output=True,text=True,timeout=120)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout)["motion_model_sha256"],
                         sha256(out/"motion-model.json"))
        sample=self.root/"cli-single"
        generated=subprocess.run([sys.executable,str(tool),"generate",
            "--base",str(self.base),"--tags",str(self.tags),
            "--motion",str(out/"motion-model.json"),
            "--output",str(sample),"--tag","fire","--seconds","1",
            "--seed","60","--strength","60"],
            capture_output=True,text=True,timeout=120)
        self.assertEqual(generated.returncode,0,generated.stderr)
        self.assertEqual(json.loads(generated.stdout)["video_sha256"],
                         sha256(sample/"render"/"video.mp4"))
        comparison=self.root/"cli-pair"
        paired=subprocess.run([sys.executable,str(tool),"compare",
            "--base",str(self.base),"--tags",str(self.tags),
            "--motion",str(out/"motion-model.json"),
            "--output",str(comparison),"--tag","river",
            "--seconds","1","--seed","71"],
            capture_output=True,text=True,timeout=120)
        self.assertEqual(paired.returncode,0,paired.stderr)
        self.assertEqual(json.loads(paired.stdout)["artifacts"]["comparison"]["sha256"],
                         sha256(comparison/"comparison.mp4"))


if __name__=="__main__":
    unittest.main()
