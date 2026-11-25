#!/usr/bin/env python3
"""Build a bounded read-only diagnostic ext4 image, no root, mount or VM."""
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile

SOURCE=pathlib.Path(__file__).resolve().parents[1]/"infrastructure/cyber-range/guest/eternyx_fixed_probe_init.c"
SIZE=32*1024*1024
ENV={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LC_ALL":"C"}

def require(ok,message):
    if not ok:
        raise RuntimeError(message)

def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream,"sha256").hexdigest()

def command(*args,timeout=60):
    return subprocess.run(args,check=True,timeout=timeout,env=ENV,
                          stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE).stdout

def build(destination, *, profile="diagnostic"):
    require(profile in ("diagnostic","http-security-exercise-v1"),"unknown fixed guest profile")
    require(destination.is_absolute() and destination.name=="rootfs.ext4",
            "expected fixed image filename")
    parent=destination.parent.lstat()
    require(stat.S_ISDIR(parent.st_mode) and parent.st_uid==os.getuid()
            and stat.S_IMODE(parent.st_mode)==0o700,"private owned output directory required")
    require(not destination.exists() and not destination.is_symlink(),"image already exists")
    with tempfile.TemporaryDirectory(prefix="fixed-guest-",dir=destination.parent) as d:
        work=pathlib.Path(d)
        root=work/"tree"
        (root/"sbin").mkdir(parents=True)
        binary=root/"sbin/init"
        flags=("-DETERNYX_HTTP_EXERCISE=1",) if profile=="http-security-exercise-v1" else ()
        try:
            command("/usr/bin/cc","-static","-Os","-Wall","-Wextra","-Werror",
                    "-fstack-protector-strong","-Wl,-z,noexecstack",*flags,str(SOURCE),"-o",str(binary),
                    "-lcrypto","-ldl","-pthread")
        except subprocess.CalledProcessError as exc:
            raise RuntimeError("fixed guest compilation failed:\n"+
                (exc.stderr or b"")[-4000:].decode("utf-8",errors="replace")) from exc
        binary.chmod(0o555)
        elf=command("/usr/bin/readelf","-l",str(binary))
        require(b"INTERP" not in elf and binary.stat().st_size<=8*1024*1024,
                "expected bounded static guest init")
        image=work/"rootfs.ext4"
        with image.open("xb") as stream:
            stream.truncate(SIZE)
        command("/usr/sbin/mke2fs","-q","-t","ext4","-F","-m","0",
                "-E","root_owner=0:0","-d",str(root),str(image))
        command("/usr/sbin/e2fsck","-fn",str(image))
        exported=work/"init-extracted"
        command("/usr/sbin/debugfs","-R",f"dump /sbin/init {exported}",str(image))
        require(exported.is_file() and digest(exported)==digest(binary),
                "rootfs init bytes do not match compiled binary")
        require(image.stat().st_size==SIZE,"unexpected rootfs size")
        image.chmod(0o444)
        image_hash=digest(image)
        os.link(image,destination)
        require(digest(destination)==image_hash,"published rootfs integrity mismatch")
        result={"schema":"eternyx-fixed-diagnostic-rootfs-v1",
                "rootfsSha256":image_hash,"rootfsBytes":SIZE,
                "initSha256":digest(binary),"sourceSha256":digest(SOURCE),
                "staticInitVerified":True,"filesystemConsistencyVerified":True,
                "diagnosticImageBuilt":True,"guestBootVerified":False,
                "guestVsockVerified":False,"independentImageApprovalVerified":False,
                "hardwareAcceptanceVerified":False,"providerActivationAllowed":False,
                "productionReleaseReady":False}
        if profile=="http-security-exercise-v1":
            result.update(schema="eternyx-http-security-exercise-rootfs-v1",
                          diagnosticImageBuilt=False,exerciseImageBuilt=True,
                          exerciseSourceSha256=digest(SOURCE.with_name("eternyx_http_exercise.h")),
                          learnerSessionAcceptanceVerified=False)
        return result

if __name__=="__main__":
    if len(sys.argv)==3 and sys.argv[1]=="--http-exercise":
        result=build(pathlib.Path(sys.argv[2]).absolute(),profile="http-security-exercise-v1")
    elif len(sys.argv)==2:
        result=build(pathlib.Path(sys.argv[1]).absolute())
    else:
        raise SystemExit("expected optional --http-exercise and private output directory/rootfs.ext4")
    print(json.dumps(result,sort_keys=True))
