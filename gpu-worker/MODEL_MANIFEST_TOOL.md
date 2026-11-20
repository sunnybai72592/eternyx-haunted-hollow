# ETERNYX AI Video — reviewed Wan model inventory creation

This is an **offline** operator tool to build the SHA-256 file inventory
required by our existing staging preflight and GPU canary. It does not rent
a GPU, download model weights, install libraries, run inference or bill anyone.

## Why it exists
The staging canary deliberately refuses to load model weights unless every
local model file matches an operator-reviewed SHA-256 manifest. Previously,
generating that complete manifest for a large Diffusers snapshot required
manual work. This tool produces the inventory deterministically and checks
its output using the same verification code as the canary.

## Operator procedure (future approved staging)
1. Independently review the selected Wan model repo, license, exact immutable
   upstream revision and any security/supply-chain restrictions.
2. Obtain the model snapshot through a separately controlled provisioning
   process. Do not let a web user choose or upload a model.
3. Inspect the local snapshot for unexpected files; this tool blocks all
   symbolic links, missing model_index.json and more than 2000 files.
4. Run the manifest creator with a **real reviewed 40-character lowercase
   upstream commit SHA** (not a placeholder):

```sh
python3 gpu-worker/create_model_manifest.py \
  --snapshot /absolute/trusted/wan21-diffusers-snapshot \
  --revision YOUR_REVIEWED_40_CHAR_LOWERCASE_COMMIT_SHA \
  --output /absolute/trusted/wan21-model-manifest.json \
  --acknowledgement I_REVIEWED_THE_LOCAL_MODEL_SNAPSHOT
```

The output JSON is create-only (never overwrites an existing manifest),
permission 0600, and must live **outside** the model snapshot. The tool
rehashes and verifies the new output before printing a success receipt.
Because model weights may be many gigabytes, hashing may take time and use
local disk throughput, but needs no GPU.

5. Run the existing zero-spend staging readiness check using the new
   `--manifest` path. Separately verify hardware, dependency compatibility,
   and provider-enforced billing caps before a real GPU test.

## Trust limitations
- SHA-256 provides an integrity baseline for the **bytes already on disk**.
  It does **not** prove the source is authentic, safe or licensed.
- The revision string is an **operator declaration**. This tool cannot prove
  the model directory came from that upstream commit. Compare immutable
  repository revision, published hashes and model contents independently.
- A model can remain unsafe even when all hashes match. Review model
  loading risks, dependency supply chain, and GPU worker sandboxing.
- No customer generation, credits or subscriptions are enabled.
- Synthetic unit tests are included; CI is not proof of real GPU output.

## Zero-cost tests
```sh
python3 -m unittest discover -s gpu-worker/tests -p 'test_*.py' -v
```
