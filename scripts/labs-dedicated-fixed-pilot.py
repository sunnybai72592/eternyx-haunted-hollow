#!/usr/bin/env python3
"""Operator-only single fixed diagnostic on an already approved physical host."""
import fcntl
import importlib.util
import json
import os
import pathlib
import platform
import re
import stat
import sys

HERE=pathlib.Path(__file__).resolve().parent
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

h=load("host","labs-dedicated-host-readiness.py")
w=load("watchdog","labs-runner-crash-watchdog.py")
v=w.v
require=h.require
APPROVALS={"--session":"I_APPROVE_DEDICATED_FIXED_LAB_SESSION",
           "--expiry":"I_APPROVE_DEDICATED_FIXED_900_SECOND_CRASH_DRILL"}
LOCK=pathlib.Path("/var/lib/eternyx-fixed-pilot.lock")
HEX=re.compile(r"[a-f0-9]{64}")

def authorize(args,env,system,uid):
    require(len(args)==4 and args[0] in APPROVALS and args[1]==APPROVALS[args[0]],
            "explicit mode-specific dedicated pilot approval required")
    h.authorize(["--inspect",h.APPROVAL],env,system,uid)
    require(HEX.fullmatch(args[3]),"externally reviewed bundle SHA256 required")
    source=pathlib.Path(args[2])
    require(source.is_absolute(),"absolute bundle path required")
    return args[0],source,args[3]

def validate_reviewed_bundle(work,report,pin):
    require(HEX.fullmatch(pin) and v.j.boot.digest(work/"bundle.json")==pin,
            "bundle manifest differs from externally reviewed digest")
    require(report["kernelSha256"]==h.KERNEL_PIN,
            "immutable historical kernel mismatch")
    print(json.dumps({"reviewedBundleSha256Matched":True,"bundleSha256":pin,
        "rootfsSha256":report["rootfsSha256"],"guestBootMode":report["mode"],
        "independentReviewerIdentityVerified":False}),flush=True)

def acquire_lock():
    h.root_directory(LOCK.parent)
    fd=os.open(LOCK,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC|os.O_NONBLOCK,0o600)
    try:
        info=os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid==0 and
                stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1,
                "untrusted dedicated pilot lock")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        return fd
    except BaseException:
        os.close(fd)
        raise

def verify_no_previous_diagnostic():
    # Do not automatically delete or reuse unknown resources after a crash.
    require(not any(re.fullmatch(r"ef-[a-f0-9]{20}",p.name)
                    for p in v.j.CGROOT.iterdir()),
            "prior diagnostic cgroup needs operator review")
    net=pathlib.Path("/run/netns")
    require(not net.exists() or not any(re.fullmatch(r"ef-[a-f0-9]{20}",p.name)
                    for p in net.iterdir()),"prior diagnostic namespace needs operator review")
    require(not any(re.fullmatch(r"ef-[A-Za-z0-9_]{8}",p.name)
                    for p in h.pathlib.Path("/var/lib").iterdir()),
            "prior diagnostic workspace needs operator review")

def run(args):
    mode,source,pin=authorize(args,os.environ,platform.system(),os.geteuid())
    # Existing root-only physical readiness checks; no runner or container.
    readiness=h.inspect()
    require(readiness["readOnlyCapabilityChecksPassed"] is True,
            "dedicated host readiness incomplete")
    print(json.dumps(readiness,sort_keys=True),flush=True)
    fd=acquire_lock()
    try:
        verify_no_previous_diagnostic()
        def validate(work,report):
            validate_reviewed_bundle(work,report,pin)
        def exercise(work,report):
            if mode=="--expiry":
                w.exercise(work,report,seconds=900)
            else:
                v.exercise(work,report)
        v.main(source.resolve(strict=True),exercise_runner=exercise,bundle_validator=validate)
        print(json.dumps({"schema":"eternyx-dedicated-fixed-pilot-v1",
            "mode":mode,"localDedicatedDiagnosticCompleted":True,
            "reviewedBundleSha256":pin,"fixedGuestServiceVerified":True,
            "full900SecondDiagnosticExpiryVerified":mode=="--expiry",
            "singlePilotLockHeld":True,"ownedResourcesCleaned":True,
            "independentPhysicalHostIdentityVerified":False,
            "independentImageProvenanceVerified":False,
            "providerRuntimeAcceptanceVerified":False,
            "learnerSessionAcceptanceVerified":False,
            "productionReleaseReady":False,"providerActivationAllowed":False}),flush=True)
    finally:
        os.close(fd)

if __name__=="__main__":
    try:
        run(sys.argv[1:])
    except (RuntimeError,OSError,ValueError) as error:
        print("Dedicated pilot refused or failed: "+str(error),file=sys.stderr)
        sys.exit(1)
