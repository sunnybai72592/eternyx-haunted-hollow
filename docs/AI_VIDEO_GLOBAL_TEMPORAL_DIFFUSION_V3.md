# CPU diffusion V3
Verified V2 holdout MSE 0.076464 versus V1 0.257296, but temporal-delta MSE increased from 0.006750 to 0.015774. V3 learns from shared local 3D neighborhoods and 4x3x4 pooled cells of the entire noisy clip. Its loss combines RGB MSE with 0.5 times MSE of actual versus predicted adjacent-frame differences. This targets motion errors, not static smoothing. The benchmark retrains V2 on identical approved source splits, seed, updates and noise draws (not equal compute). CI tests global context, actual learned weights, tag influence, source-free inference and decoded frame counts.

Train: python gpu-worker/train_global_temporal_diffusion.py train --input ./approved-media --manifest ./dataset.json --output ./model-v3 --updates 160 --compare-v2
Generate: python gpu-worker/train_global_temporal_diffusion.py generate --model ./model-v3/model.json --tag red --seed 5 --output ./generated-v3

Native 16x12, 16 FPS, one second, two closed tags; 256x192 playback upscale. NumPy CPU only. No text-to-video, production deployment or proven quality gain. V2 unchanged. Next: compositional conditioning and diverse independent evaluation.
