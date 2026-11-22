"""Local inference metadata shared by Wan training and rendering."""
import hashlib
import json
from pathlib import Path


def fingerprint(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def transformer_identity(root):
    return {path.name: fingerprint(path) for path in sorted(root.iterdir())
            if path.is_file() and path.suffix in (".json", ".safetensors")}


def write_metadata(directory, base, rank, *, dataset=None, step=None):
    metadata = {"version": 1, "base": base, "rank": rank,
                "sha256": fingerprint(directory / "adapter.safetensors")}
    if dataset is not None:
        metadata["training_dataset"] = dataset
    if step is not None:
        metadata["training_step"] = step
    (directory / "adapter.json").write_text(json.dumps(metadata, sort_keys=True), encoding="utf-8")


def load_for_inference(model, snapshot, directory):
    from peft import get_peft_model_state_dict, set_peft_model_state_dict
    from safetensors.torch import load_file
    from wan_adapter_step import attach_adapter

    directory = Path(directory)
    if not directory.is_absolute():
        raise ValueError("Adapter directory must be absolute")
    metadata = json.loads((directory / "adapter.json").read_text(encoding="utf-8"))
    rank = metadata["rank"]
    if type(metadata["version"]) is not int or metadata["version"] != 1 or type(rank) is not int or rank < 1:
        raise ValueError("Unsupported adapter format or rank")
    if not metadata["base"] or metadata["base"] != transformer_identity(snapshot / "transformer"):
        raise ValueError("Adapter base transformer mismatch")
    weights = directory / "adapter.safetensors"
    if fingerprint(weights) != metadata["sha256"]:
        raise ValueError("Adapter checksum mismatch")
    state = load_file(str(weights))
    attach_adapter(model, rank)
    expected = get_peft_model_state_dict(model)
    if state.keys() != expected.keys():
        raise ValueError("Adapter tensor names mismatch")
    for key, tensor in state.items():
        if tensor.shape != expected[key].shape or not tensor.is_floating_point() or not tensor.isfinite().all():
            raise ValueError("Invalid adapter tensor")
    set_peft_model_state_dict(model, state)
    model.requires_grad_(False)
    model.eval()
    return metadata
