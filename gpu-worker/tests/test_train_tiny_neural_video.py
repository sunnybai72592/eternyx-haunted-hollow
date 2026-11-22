"""Real FFmpeg integration regressions for an actual trainable CPU neural MLP video."""
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from train_tiny_neural_video import (train, generate, read_model, sample_frames,
                                    init_weights, features, predict, train_example,
                                    WIDTH, HEIGHT, HIDDEN, INPUTS, OUTPUTS)
from render_video_timeline import sha256, probe, video_info


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "Actual FFmpeg/FFprobe required")
class RealTinyNeuralVideoTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / "local-video-media"
        self.source.mkdir()
        self.clip = self.make("original.mp4", "testsrc=size=64x36:rate=16:duration=2")
        self.model = self.root / "cpu-neural-model"

    def make(self, filename, pattern):
        output = self.source / filename
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
                        "-f", "lavfi", "-i", pattern, "-threads", "1", "-c:v",
                        "libx264", "-pix_fmt", "yuv420p", str(output)],
                       capture_output=True, check=True, timeout=30)
        return output

    def fit(self, **kwargs):
        return train(self.source, self.model, "rights-reviewed-original",
                     selected=["original.mp4"], **kwargs)

    def test_weights_update_from_actual_backpropagation_and_train_mse_improves(self):
        receipt = self.fit()
        self.assertTrue(receipt["neural_network"])
        self.assertFalse(receipt["text_to_video"])
        self.assertEqual(receipt["kind"], "cpu_tiny_neural_video_training")
        self.assertEqual(receipt["model_sha256"], sha256(self.model / "model.json"))
        self.assertGreater(receipt["metrics"]["training_mse_before"], 0)
        self.assertLess(receipt["metrics"]["training_mse_after"],
                        receipt["metrics"]["training_mse_before"])
        self.assertGreater(receipt["metrics"]["holdout_examples"], 0)
        self.assertGreater(receipt["metrics"]["holdout_neural_mse"], 0)
        self.assertGreaterEqual(receipt["metrics"]["holdout_persistence_baseline_mse"], 0)
        checkpoint = read_model(self.model / "model.json")
        self.assertEqual(checkpoint["architecture"]["hidden"], HIDDEN)
        self.assertEqual(checkpoint["architecture"]["inputs"], INPUTS)
        self.assertEqual(checkpoint["architecture"]["outputs"], OUTPUTS)
        self.assertNotEqual(checkpoint["weights"], init_weights(42))
        self.assertEqual(checkpoint["sources"][0]["sha256"], sha256(self.clip))
        self.assertEqual(checkpoint["sources"][0]["rights_ref"], "rights-reviewed-original")
        self.assertEqual(json.loads((self.model / "training-report.json").read_text()), receipt)
        self.assertFalse(list(self.root.glob(".eternyx-neural-train-*")))
        with self.assertRaisesRegex(ValueError, "no overwriting"):
            self.fit()

    def test_neural_samples_are_new_seeded_frames_with_temporal_changes(self):
        self.fit()
        model = read_model(self.model / "model.json")
        first = sample_frames(model, 2, 42)
        repeat = sample_frames(model, 2, 42)
        different = sample_frames(model, 2, 43)
        self.assertEqual(first, repeat)
        self.assertNotEqual(first, different)
        self.assertEqual(len(first), 32)
        self.assertTrue(all(len(frame) == WIDTH * HEIGHT * 3 for frame in first))
        self.assertGreater(len(set(first)), 3)
        self.assertNotEqual(first[0], first[1])
        self.assertNotIn(self.clip.read_bytes()[:64], first)

    def test_final_real_mp4_receipts_and_codec_counts(self):
        receipt = self.fit()
        output = self.root / "tiny-neural-video"
        generated = generate(self.model / "model.json", output, seconds=2, seed=101)
        self.assertTrue(generated["neural_network"])
        self.assertFalse(generated["text_to_video"])
        self.assertTrue(generated["model_generation"])
        self.assertEqual(generated["model_sha256"], receipt["model_sha256"])
        self.assertEqual(generated["source_clip_sha256"], sha256(output / "clip-01.mp4"))
        self.assertEqual(generated["video_sha256"], sha256(output / "render" / "video.mp4"))
        self.assertEqual(video_info(probe(output / "clip-01.mp4", count_frames=True)),
                         (WIDTH, HEIGHT, 32))
        self.assertEqual(video_info(probe(output / "render" / "video.mp4", count_frames=True)),
                         (256, 144, 32))
        self.assertEqual(json.loads((output / "generation-report.json").read_text()), generated)
        self.assertIn("tiny neural", (output / "render" / "captions.srt").read_text())
        renderer = json.loads((output / "render" / "manifest.json").read_text())
        self.assertFalse(renderer["model_generation"],
                         "v2 renderer only edits video; the underlying source is generated")
        self.assertEqual(renderer["video"]["sha256"], generated["video_sha256"])
        self.assertFalse(list(self.root.glob(".eternyx-neural-sample-*")))
        with self.assertRaisesRegex(ValueError, "no overwriting"):
            generate(self.model / "model.json", output)

    def test_high_portrait_and_standard_square_outputs(self):
        self.fit()
        portrait = self.root / "portrait"
        square = self.root / "square"
        generate(self.model / "model.json", portrait, 1, 11, "portrait", "high")
        generate(self.model / "model.json", square, 1, 11, "square", "standard")
        self.assertEqual(video_info(probe(portrait / "render" / "video.mp4",
                                          count_frames=True)), (288, 512, 16))
        self.assertEqual(video_info(probe(square / "render" / "video.mp4",
                                          count_frames=True)), (256, 256, 16))

    def test_reject_wrong_training_fps_missing_rights_traversal_and_symlinks(self):
        for label in ("", "rights\nbad", "x"*181):
            with self.assertRaises(ValueError):
                train(self.source, self.root / "invalid", label,
                      selected=["original.mp4"])
        for name in ("../original.mp4", "/tmp/fake.mp4", "https://x.mp4",
                     "back\\file.mp4", ".hidden.mp4", "movie.mov", "x.mp4\n"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                train(self.source, self.root / "invalid", "owned",
                      selected=[name])
        linked = self.source / "link.mp4"
        linked.symlink_to(self.clip)
        with self.assertRaisesRegex(ValueError, "symlink"):
            train(self.source, self.root / "invalid", "owned", selected=["link.mp4"])
        self.make("badfps.mp4", "testsrc=size=64x36:rate=30:duration=2")
        with self.assertRaisesRegex(ValueError, "16 FPS"):
            train(self.source, self.root / "invalid", "owned", selected=["badfps.mp4"])
        self.assertFalse((self.root / "invalid").exists())

    def test_refuse_invalid_training_steps_seeds_and_sample_budget(self):
        for value in (0, 5, True, 1.5, -1):
            with self.subTest(epochs=value), self.assertRaises(ValueError):
                self.fit(epochs=value)
        for value in (-1, 2147483648, True):
            with self.subTest(seed=value), self.assertRaises(ValueError):
                self.fit(seed=value)
        self.fit()
        for seconds, seed in ((0, 2), (9, 2), (True, 1),
                              (1, -1), (1, 2147483648), (1, True)):
            with self.subTest(seconds=seconds,seed=seed), self.assertRaises(ValueError):
                generate(self.model / "model.json", self.root / "invalid",
                         seconds=seconds, seed=seed)
        self.assertFalse((self.root / "invalid").exists())

    def test_tampered_neural_architecture_weight_shape_and_nonfinite_metrics_fail(self):
        self.fit()
        data = json.loads((self.model / "model.json").read_text())
        edits = [
            lambda x: x.update(neural_network=False),
            lambda x: x.update(text_to_video=True),
            lambda x: x.update(kind="fake"),
            lambda x: x["architecture"].update(hidden=10000),
            lambda x: x["weights"]["w1"][0].append(1),
            lambda x: x["weights"]["b2"].pop(),
            lambda x: x["weights"]["w2"][0].__setitem__(0, float("nan")),
            lambda x: x["start_grid"][0].__setitem__(0, -1),
            lambda x: x["motion_histogram"].__setitem__(0, -1),
            lambda x: x["sources"][0].update(rights_ref=""),
            lambda x: x["metrics"].update(holdout_neural_mse=-1),
            lambda x: x.update(epochs=1000),
        ]
        for i, edit in enumerate(edits):
            candidate = self.root / f"bad-{i}.json"
            value = json.loads(json.dumps(data))
            edit(value)
            candidate.write_text(json.dumps(value), encoding="utf-8")
            with self.subTest(i=i), self.assertRaises(ValueError):
                read_model(candidate)
        oversized = self.root / "oversized.json"
        oversized.write_bytes(b" "*(128*1024+1))
        with self.assertRaises(ValueError):
            read_model(oversized)

    def test_cli_actual_training_and_sampling_cpu_without_network(self):
        tool = Path(__file__).resolve().parents[1] / "train_tiny_neural_video.py"
        training = subprocess.run(
            [sys.executable, str(tool), "train", "--input", str(self.source),
             "--output", str(self.model), "--rights-ref", "owner-approved",
             "--clip", "original.mp4", "--seed", "31", "--epochs", "2"],
            text=True, capture_output=True, timeout=90)
        self.assertEqual(training.returncode, 0, training.stderr)
        self.assertEqual(json.loads(training.stdout)["training_sources"], 1)
        generated = subprocess.run(
            [sys.executable, str(tool), "generate",
             "--model", str(self.model / "model.json"),
             "--output", str(self.root / "cli-output"),
             "--seconds", "1", "--seed", "53"],
            text=True, capture_output=True, timeout=90)
        self.assertEqual(generated.returncode, 0, generated.stderr)
        self.assertEqual(json.loads(generated.stdout)["video_sha256"],
                         sha256(self.root / "cli-output" / "render" / "video.mp4"))


if __name__ == "__main__":
    unittest.main()
