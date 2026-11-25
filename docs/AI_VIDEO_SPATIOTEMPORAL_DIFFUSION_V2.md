# ETERNYX CPU spatial-temporal diffusion V2

V2 is a separate experimental model, retaining V1 as a reproducible baseline. A shared 3x3x3 RGB neighborhood kernel learns 32 hidden channels and a pointwise RGB projection. Explicit diffusion step, closed tags, normalized position and squared coordinates condition the denoiser. Replicated edges do not wrap the video sequence. Training uses balanced tag batches and 512 randomly sampled output positions per clip. The reverse DDIM sampler denoises the entire noisy clip jointly. It needs no source media at inference.

Train with the same approved V1 dataset manifest, 4–12 sources, distinct train and holdout files for both tags. Install local NumPy 2.2.6 and FFmpeg. Use:

    python gpu-worker/train_spatiotemporal_diffusion.py train --input ./approved-media --manifest ./dataset.json --output ./model-v2 --updates 160 --compare-v1
    python gpu-worker/train_spatiotemporal_diffusion.py generate --model ./model-v2/model.json --tag red --seed 5 --output ./generated-v2

Comparison retrains V1 with identical sources, seed, number of updates, fixed noise draws and evaluation windows. It reports parameters, CPU wall time, correct/swapped-tag denoising MSE, noisy-input baseline and temporal-difference MSE at noise steps 3/6/9/12. Equal updates are not equal compute, and results are not claims of perceptual superiority. The fixture test evaluates synthetic moving shapes only; holdout files can still be visually related. The evaluation set is not an independent final test set.

Native output remains 16x12, 16 FPS, one second. Encoded MP4 is 256x192 nearest-neighbor enlargement. No text-to-video, 720p native generation, general semantic understanding, or production deployment is claimed. V2 checkpoint is a small bounded numeric JSON, incompatible with V1. No paid API, GPU, source upload or pickle. V1 remains unchanged. The next research gate is held-out generation quality on diverse approved footage, better global structure, and increased native dimensions only with measured evidence.
