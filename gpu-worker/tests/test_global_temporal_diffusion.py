"""Real CPU spatial-temporal learning with a shared V1 comparison dataset."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import train_global_temporal_diffusion as v3
import train_spatiotemporal_diffusion as v2
from render_video_timeline import sha256,probe,video_info


@unittest.skipUnless(importlib.util.find_spec("numpy") and shutil.which("ffmpeg") and shutil.which("ffprobe"),"Requires NumPy and FFmpeg")
class GlobalTemporalDiffusionTests(unittest.TestCase):
    def test_global_context_sees_beyond_local_neighborhood(self):
        import numpy as np
        zero=np.zeros((1,v3.F,v3.H,v3.W,3),np.float32)
        orig=v3.features(zero,np.array([6]),np.array([0]))
        changed=zero.copy()
        changed[0,-1,-1,-1,0]=1
        other=v3.features(changed,np.array([6]),np.array([0]))
        self.assertEqual(orig.shape,(1,v3.N,v3.FEATURES))
        self.assertTrue(np.array_equal(orig[0,0,:v2.FEATURES],other[0,0,:v2.FEATURES]))
        self.assertFalse(np.array_equal(orig[0,0,v2.FEATURES:],other[0,0,v2.FEATURES:]))
        self.assertTrue(np.array_equal(other[0,0,v2.FEATURES:],other[0,-1,v2.FEATURES:]))

    def test_learn_compare_and_generate_after_removing_training_sources(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);media=root/"media";media.mkdir();rows=[]
            for tag,channel in (("red",0),("blue",2)):
                for split,offset in (("train",0),("holdout",12)):
                    path=media/f"{tag}-{split}.mp4"
                    raw=np.zeros((16,48,64,3),dtype=np.uint8)
                    for i in range(16):raw[i,12:36,offset+i:offset+i+20,channel]=255
                    subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-f","rawvideo",
                        "-pixel_format","rgb24","-video_size","64x48","-framerate","16","-i","pipe:0",
                        "-threads","1","-c:v","libx264","-pix_fmt","yuv420p",str(path)],input=raw.tobytes(),capture_output=True,check=True,timeout=30)
                    rows.append({"file":path.name,"sha256":sha256(path),"tag":tag,"split":split,"rights_ref":"original synthetic fixture"})
            manifest=root/"dataset.json";manifest.write_text(json.dumps(rows))
            report=v3.train(media,manifest,root/"trained",seed=31,updates=160,compare_v2=True)
            model_path=root/"trained/model.json"
            self.assertEqual(report["model_sha256"],sha256(model_path))
            self.assertEqual(report["parameters"],sum(np.prod(s) for s in v3.SHAPES.values()))
            self.assertLess(report["metrics"]["train_after"]["denoising_mse"],report["metrics"]["train_before"]["denoising_mse"])
            comparison=report["comparison"]
            self.assertEqual(comparison["v2_holdout"]["windows"],2)
            self.assertEqual(comparison["v2_holdout"]["noisy_input_mse"],comparison["v3_holdout"]["noisy_input_mse"])
            self.assertFalse(comparison["equal_compute_budget"])
            self.assertEqual(report["temporal_loss_weight"],0.5)
            self.assertEqual(report["global_context_cells"],[4,3,4])
            self.assertEqual(report["paired_positions_per_clip"],512)
            for key in ("v2_holdout","v3_holdout"):
                self.assertEqual([x["noise_step"] for x in comparison[key]["by_noise"]],[3,6,9,12])
                self.assertGreaterEqual(comparison[key]["temporal_delta_mse"],0)
            tags,model=v3.load(model_path)
            self.assertFalse(np.array_equal(model["kernel"],v3.weights(31)["kernel"]))
            self.assertFalse(np.array_equal(model["kernel"][v2.FEATURES:],v3.weights(31)["kernel"][v2.FEATURES:]))
            self.assertFalse(np.array_equal(model["tag_bias"][0],model["tag_bias"][1]))
            a=v3.sample(model,tags,"red",5);b=v3.sample(model,tags,"blue",5)
            self.assertEqual(a.shape,(16,12,16,3))
            self.assertTrue(np.array_equal(a,v3.sample(model,tags,"red",5)))
            self.assertFalse(np.array_equal(a,v3.sample(v3.weights(31),tags,"red",5)))
            def balance(frames):
                f=frames.astype(np.float32);return float(np.mean(f[...,0]-f[...,2]))
            self.assertGreater(balance(a)-balance(b),1.0)
            with self.assertRaisesRegex(ValueError,"Unknown trained tag"):v3.sample(model,tags,"unknown",5)
            damaged=json.loads(model_path.read_text());damaged["weights"]["kernel"]=[[0]]
            broken=root/"bad.json";broken.write_text(json.dumps(damaged))
            with self.assertRaisesRegex(ValueError,"tensor"):v3.load(broken)
            shutil.rmtree(media)
            result=v3.generate(model_path,root/"generated","red",5)
            self.assertFalse(result["source_media_used_at_inference"])
            self.assertGreater(result["distinct_raw_frames"],1)
            self.assertEqual(result["video_sha256"],sha256(root/"generated/generated.mp4"))
            self.assertEqual(video_info(probe(root/"generated/generated.mp4",count_frames=True)),(256,192,16))
            with self.assertRaisesRegex(ValueError,"no overwriting"):v3.generate(model_path,root/"generated","red",5)
            print(json.dumps({"comparison":comparison,"generation":result},allow_nan=False))
