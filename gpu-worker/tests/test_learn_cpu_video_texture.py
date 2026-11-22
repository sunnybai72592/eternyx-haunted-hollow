"""Test a real locally trained non-neural CPU video generator and its MP4s."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from learn_cpu_video_texture import (
    COLORS, HEIGHT, WIDTH, decode, generate, learn, read_model,
    synthesize_frames, validate_label,
)
from render_video_timeline import video_info, probe, sha256


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/FFprobe required")
class LearnedCPUVideoTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.media = self.root / "local-video-media"
        self.media.mkdir()
        self.a = self.make("motion.mp4", "testsrc=size=64x36:rate=16:duration=2")
        self.b = self.make("color.mp4", "testsrc2=size=64x36:rate=16:duration=2")
        self.model = self.root / "trained-cpu-model"

    def make(self, name, pattern):
        output = self.media / name
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
             "-f", "lavfi", "-i", pattern, "-threads", "1",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", str(output)],
            capture_output=True, check=True, timeout=20)
        return output

    def fit(self, clips=None):
        return learn(self.media, self.model, "owner-original-video-license-001",
                     clips or ["motion.mp4", "color.mp4"])

    def test_train_actual_decoded_video_and_holdout_not_in_sample(self):
        report = self.fit()
        self.assertEqual(report["kind"], "cpu_learned_motion_training")
        self.assertEqual(report["training_source_count"], 2)
        self.assertEqual(report["model_sha256"], sha256(self.model / "model.json"))
        self.assertEqual(report["training_sources"][0]["sha256"], sha256(self.a))
        self.assertEqual(report["training_sources"][1]["sha256"], sha256(self.b))
        self.assertTrue(report["metrics"]["holdout_pairs"] > 0)
        self.assertTrue(report["metrics"]["training_pairs"] > 0)
        self.assertTrue(report["metrics"]["holdout_transition_nll"] >= 0)
        self.assertTrue(report["metrics"]["holdout_color_baseline_nll"] >= 0)
        model = read_model(self.model / "model.json")
        self.assertTrue(model["model_generation"])
        self.assertFalse(model["neural_network"])
        self.assertFalse(model["text_to_video"])
        self.assertEqual(model["colors"], 64)
        self.assertEqual(len(model["position_colors"]), WIDTH * HEIGHT)
        self.assertEqual(len(model["color_transitions"]), COLORS)
        self.assertEqual(sum(model["motion_shifts"]),
                         sum(row["train_frames"] - 1 for row in report["training_sources"]))
        self.assertFalse(list(self.root.glob(".eternyx-learn-*")))
        with self.assertRaisesRegex(ValueError, "no overwriting"):
            self.fit()

    def test_learned_sampling_differs_by_seed_and_shows_real_motion(self):
        self.fit(["motion.mp4"])
        model = read_model(self.model / "model.json")
        a = synthesize_frames(model, 2, 42)
        b = synthesize_frames(model, 2, 42)
        c = synthesize_frames(model, 2, 43)
        self.assertEqual(len(a), 32)
        self.assertEqual(a, b, "identical trained weights and seed must sample the same frames")
        self.assertNotEqual(a, c, "different inference seeds must yield different textures")
        self.assertGreater(len(set(a)), 1, "generation must change over time")
        self.assertTrue(all(len(frame) == WIDTH * HEIGHT * 3 for frame in a))

    def test_a_real_sampled_mp4_and_verified_final_editor_render(self):
        self.fit()
        output = self.root / "sample-one"
        result = generate(self.model / "model.json", output, seconds=2, seed=23)
        self.assertEqual(result["kind"], "cpu_learned_video_sample")
        self.assertTrue(result["model_generation"])
        self.assertFalse(result["neural_network"])
        self.assertFalse(result["text_to_video"])
        self.assertEqual(result["model_sha256"], sha256(self.model / "model.json"))
        self.assertEqual(result["sampled_clip_sha256"], sha256(output / "clip-01.mp4"))
        self.assertEqual(result["finished_video_sha256"], sha256(output / "render" / "video.mp4"))
        self.assertEqual(video_info(probe(output / "clip-01.mp4", count_frames=True)),
                         (WIDTH, HEIGHT, 32))
        self.assertEqual(video_info(probe(output / "render" / "video.mp4", count_frames=True)),
                         (256, 144, 32))
        self.assertEqual(json.loads((output / "generation-report.json").read_text()), result)
        receipt = json.loads((output / "render" / "manifest.json").read_text())
        self.assertFalse(receipt["model_generation"],
                         "v2 editor receipt labels editing, distinct from learned source")
        self.assertEqual(receipt["video"]["sha256"], result["finished_video_sha256"])
        self.assertIn("non-neural", (output / "render" / "captions.srt").read_text())
        self.assertEqual(len(json.loads((output / "eternyx-video-v2.json").read_text())["shots"]),1)
        self.assertFalse(list(self.root.glob(".eternyx-sampled-*")))
        with self.assertRaisesRegex(ValueError, "no overwriting"):
            generate(self.model / "model.json", output)

    def test_generate_portrait_and_square_without_external_models(self):
        self.fit(["motion.mp4"])
        p = generate(self.model / "model.json", self.root / "portrait",
                     seconds=1, seed=42, profile="portrait", quality="high")
        self.assertEqual(video_info(probe(self.root / "portrait" / "render" / "video.mp4",
                                         count_frames=True)), (288, 512, 16))
        q = generate(self.model / "model.json", self.root / "square",
                     seconds=1, seed=42, profile="square", quality="standard")
        self.assertEqual(video_info(probe(self.root / "square" / "render" / "video.mp4",
                                         count_frames=True)), (256, 256, 16))
        self.assertNotEqual(p["finished_video_sha256"], q["finished_video_sha256"])

    def test_reject_unsafe_sources_and_unapproved_rights(self):
        for rights in ("", "x\nunsafe", "x" * 181):
            with self.subTest(rights=rights), self.assertRaises(ValueError):
                learn(self.media, self.root / "invalid", rights, ["motion.mp4"])
        for name in ("../motion.mp4", "/tmp/a.mp4", "https://a.mp4",
                     "path\\a.mp4", ".hidden.mp4", "other.mov", "x.mp4\n"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                learn(self.media, self.root / "invalid", "owned", [name])
        target = self.media / "link.mp4"
        target.symlink_to(self.a)
        with self.assertRaisesRegex(ValueError, "symlink"):
            learn(self.media, self.root / "invalid", "owned", ["link.mp4"])
        self.assertFalse((self.root / "invalid").exists())

    def test_reject_bad_sample_limits_and_changed_model_schema(self):
        self.fit(["motion.mp4"])
        modelpath = self.model / "model.json"
        model = json.loads(modelpath.read_text())
        for seconds, seed in ((0, 42), (9, 42), (True,42), (1,-1), (1,True), (1,2147483648)):
            with self.subTest(seconds=seconds,seed=seed), self.assertRaises(ValueError):
                generate(modelpath, self.root / "invalid", seconds=seconds, seed=seed)
        edits = [
            lambda d: d.update(kind="fake-neural-video-generator"),
            lambda d: d.update(neural_network=True),
            lambda d: d.update(text_to_video=True),
            lambda d: d["position_colors"].pop(),
            lambda d: d["color_transitions"][0].append(1),
            lambda d: d["motion_shifts"].__setitem__(0, -1),
            lambda d: d["position_colors"][0].__setitem__(0, True),
            lambda d: d["sources"][0].update(rights_ref=""),
        ]
        for ix, mutate in enumerate(edits):
            candidate = self.root / f"tampered-{ix}.json"
            payload = json.loads(modelpath.read_text())
            mutate(payload)
            candidate.write_text(json.dumps(payload))
            with self.subTest(ix=ix), self.assertRaises(ValueError):
                read_model(candidate)

    def test_fewer_than_eight_frames_and_bad_fps_refused(self):
        short = self.make("short.mp4", "testsrc=size=64x36:rate=16:duration=0.25")
        with self.assertRaisesRegex(ValueError, "eight"):
            learn(self.media, self.root / "short-model", "owned", ["short.mp4"])
        bad = self.make("bad.mp4", "testsrc=size=64x36:rate=30:duration=2")
        with self.assertRaisesRegex(ValueError, "16 FPS"):
            learn(self.media, self.root / "bad-model", "owned", ["bad.mp4"])
        self.assertFalse((self.root / "short-model").exists())
        self.assertFalse((self.root / "bad-model").exists())

    def test_cli_train_and_generate_is_completely_offline(self):
        tool = str(Path(__file__).resolve().parents[1] / "learn_cpu_video_texture.py")
        train_cmd = [sys.executable, tool, "train",
                     "--input", str(self.media), "--output", str(self.model),
                     "--rights-ref", "operator-reviewed", "--clip", "motion.mp4"]
        trained = subprocess.run(train_cmd, capture_output=True, text=True, timeout=90)
        self.assertEqual(trained.returncode, 0, trained.stderr)
        self.assertEqual(json.loads(trained.stdout)["training_sources"], 1)
        out = self.root / "command-output"
        generate_cmd = [sys.executable, tool, "generate", "--model", str(self.model / "model.json"),
                        "--output", str(out), "--seconds", "1", "--seed", "21"]
        gen = subprocess.run(generate_cmd, capture_output=True, text=True, timeout=90)
        self.assertEqual(gen.returncode, 0, gen.stderr)
        self.assertEqual(json.loads(gen.stdout)["video_sha256"],
                         sha256(out / "render" / "video.mp4"))


if __name__ == "__main__":
    unittest.main()
