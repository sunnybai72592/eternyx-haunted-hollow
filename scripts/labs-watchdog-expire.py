#!/usr/bin/env python3
"""Fixed root-only transient timer payload. Never targets arbitrary cgroups."""
import json
import os
import pathlib
import re
import stat
import sys
import time

def require(ok,msg):
    if not ok:
        raise RuntimeError(msg)

def validate_name(name):
    require(re.fullmatch(r"ef-[a-f0-9]{20}",name),"invalid diagnostic scope")

def validate_identity(info,dev,ino):
    require(stat.S_ISDIR(info.st_mode) and info.st_uid==0 and
            (info.st_dev,info.st_ino)==(dev,ino),"cgroup identity changed")

def populated(fd):
    with os.fdopen(os.open("cgroup.events",os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)) as stream:
        lines=stream.read(4096).splitlines()
    values=[x for x in lines if x.startswith("populated ")]
    require(values in (["populated 0"],["populated 1"]),"unknown cgroup state")
    return values==["populated 1"]

def expire(name,dev,ino,work):
    require(os.geteuid()==0,"root timer required")
    validate_name(name)
    require(work.parent==pathlib.Path("/var/lib") and re.fullmatch(r"ef-[A-Za-z0-9_]{8}",work.name),
            "unexpected private diagnostic workspace")
    info=work.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid==0 and
            stat.S_IMODE(info.st_mode)==0o700,"untrusted workspace")
    fd=os.open("/sys/fs/cgroup/"+name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        validate_identity(os.fstat(fd),dev,ino)
        require(populated(fd),"guest already absent at independent deadline")
        killed_at=time.monotonic_ns()
        killfd=os.open("cgroup.kill",os.O_WRONLY|os.O_NOFOLLOW,dir_fd=fd)
        try:
            require(os.write(killfd,b"1")==1,"cgroup kill incomplete")
        finally:
            os.close(killfd)
        end=time.monotonic()+5
        while populated(fd) and time.monotonic()<end:
            time.sleep(.05)
        require(not populated(fd),"watchdog did not empty cgroup")
        receipt={"scope":name,"device":dev,"inode":ino,"killMonotonicNs":killed_at,
                 "populatedBeforeKill":True,"emptyAfterKill":True}
        target=work/"watchdog-receipt.json"
        with target.open("x") as stream:
            json.dump(receipt,stream,sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        target.chmod(0o400)
    finally:
        os.close(fd)

if __name__=="__main__":
    if len(sys.argv)!=5:
        raise SystemExit("expected fixed timer scope and inode")
    expire(sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),pathlib.Path(sys.argv[4]))
