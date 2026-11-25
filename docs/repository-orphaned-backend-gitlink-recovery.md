# Repository checkout recovery: orphaned backend gitlink

The failing main revision 6d7fb7687512fadc599e93263553ec926fd6b4a3 contains a mode-160000 Git index entry at `eternyx-backend` pointing to `e2132ef848ca232d9b3dea28189883590dc97883`. It was introduced by 704412d96ae1fa981ce2ac521a96fed25f0b3128. No .gitmodules file is present, and no authorized remote URL has been established. The entry is not a tracked source directory. The original pointer remains available in repository history.

actions/checkout@v4 with persist-credentials: false runs git submodule foreach --recursive during credential cleanup; Git returns fatal: No url found for submodule path 'eternyx-backend' in .gitmodules (exit 128). Changing token persistence or ignoring the failure would mask repository corruption. Remove the unmapped gitlink only; do not invent a remote, fetch unknown code, alter credentials, or delete tracked backend files, migrations, functions or deployment configuration.

A disposable local Git repository reproduced exit 128 with the exact mode-160000 pointer and missing mapping. After removing the index entry, the same recursive submodule command returned 0. The actual repository tree and full CI must be checked after the corrective PR. If the separate backend repository is recovered, reintroduce it only through a separately reviewed, verified URL and commit with a complete submodule configuration.

To verify from a fresh checkout:
```sh
git ls-files --stage -- eternyx-backend
git submodule foreach --recursive 'git config --local --name-only --get-regexp core\.sshCommand || :'
```
The first command must return no entries, and the second must exit 0. Re-run the workflow on the repaired main revision, not the original failed SHA. Hosted staging approval and pinned HTTPS variables remain mandatory.
