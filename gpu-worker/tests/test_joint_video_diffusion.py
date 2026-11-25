"""Actual CPU training and generation from noise with disjoint local files."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import train_joint_video_diffusion as diffusion
from render_video_timeline import sha256,probe,video_info


@unittest.skipUnless(importlib.util.find_spec("numpy") and shutil.which("ffmpeg") and shutil.which("ffprobe"),"Requires CPU NumPy and FFmpeg")
class JointDiffusionTests(unittest.TestCase):
    def test_train_on_local_movies_and_sample_without_sources(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            media=root/"media";media.mkdir()
            rows=[]
            # Four distinct moving, original synthetic fixtures. Whole source
            # clips are held out, not selected frames from a training file.
            for tag,color in (("red","red"),("blue","blue")):
                for split,offset in (("train",0),("holdout",12)):
                    name=f"{tag}-{split}.mp4"
                    path=media/name
                    # Moving source generated as raw frames, not copied samples.
                    raw=np.zeros((16,48,64,3),dtype=np.uint8)
                    channel=0 if color=="red" else 2
                    for i in range(16):
                        raw[i,12:36,offset+i:offset+i+20,channel]=255
                    subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-f","rawvideo",
                        "-pixel_format","rgb24","-video_size","64x48","-framerate","16","-i","pipe:0",
                        "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",str(path)],
                        input=raw.tobytes(),capture_output=True,check=True,timeout=30)
                    rows.append({"file":name,"sha256":sha256(path),"tag":tag,"split":split,"rights_ref":"original synthetic test fixture"})
            manifest=root/"dataset.json";manifest.write_text(json.dumps(rows))
            report=diffusion.train(media,manifest,root/"trained",seed=31,updates=80)
            model_path=root/"trained/model.json"
            self.assertEqual(report["model_sha256"],sha256(model_path))
            self.assertEqual(report["metrics"]["holdout_after"]["windows"],2)
            self.assertLess(report["metrics"]["train_after"]["denoising_mse"],report["metrics"]["train_before"]["denoising_mse"])
            tags,model=diffusion.load(model_path)
            self.assertFalse(np.array_equal(model["w1"],diffusion.weights(31)["w1"]))
            sample=diffusion.sample(model,tags,"red",5)
            self.assertEqual(sample.shape,(16,12,16,3))
            self.assertTrue(np.array_equal(sample,diffusion.sample(model,tags,"red",5)))
            blue_sample=diffusion.sample(model,tags,"blue",5)
            self.assertFalse(np.array_equal(sample,blue_sample))
            # Require learned label influence in the intended color direction,
            # not merely a one-pixel difference or a seed change.
            def color_balance(frames):
                values=frames.astype(np.float32)
                return float(np.mean(values[...,0]-values[...,2]))
            self.assertGreater(color_balance(sample)-color_balance(blue_sample), 1.0)
            self.assertFalse(np.array_equal(model["tag_bias"][0],model["tag_bias"][1]))
            self.assertGreater(np.linalg.norm(model["tag_bias"]),0)
            self.assertIn("swapped_tag_mse",report["metrics"]["holdout_after"])
            self.assertFalse(np.array_equal(sample,diffusion.sample(diffusion.weights(31),tags,"red",5)))
            with self.assertRaisesRegex(ValueError,"Unknown trained tag"):
                diffusion.sample(model,tags,"unknown",5)
            # Verify duplicate file rejection before destroying original inputs.
            bad=[dict(row) for row in rows];bad[1]["sha256"]=bad[0]["sha256"]
            manifest.write_text(json.dumps(bad))
            with self.assertRaisesRegex(ValueError,"hash mismatch|duplicate"):
                diffusion.dataset(media,manifest)
            shutil.rmtree(media)
            result=diffusion.generate(model_path,root/"sample","red",5)
            self.assertFalse(result["source_media_used_at_inference"])
            self.assertTrue(result["model_generation"])
            self.assertFalse(result["text_to_video"])
            self.assertGreater(result["distinct_raw_frames"],1)
            self.assertEqual(result["video_sha256"],sha256(root/"sample/generated.mp4"))
            self.assertEqual(video_info(probe(root/"sample/generated.mp4",count_frames=True)),(256,192,16))
            with self.assertRaisesRegex(ValueError,"no overwriting"):
                diffusion.generate(model_path,root/"sample","red",5)
