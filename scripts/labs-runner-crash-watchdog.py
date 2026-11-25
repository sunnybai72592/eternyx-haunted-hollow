#!/usr/bin/env python3
"""Disposable fixed guest crash drill; systemd timer owns independent kill."""
import importlib.util
import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time
import traceback
import uuid

HERE=pathlib.Path(__file__).resolve().parent
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

v=load("live","labs-runner-fixed-vsock.py")
e=load("expire","labs-watchdog-expire.py")
j=v.j
require=j.require
SECONDS=75
ENV={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LC_ALL":"C"}

def command(*args,check=True):
    return subprocess.run(args,check=check,timeout=10,env=ENV,
        stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)

def unit_name(name):
    e.validate_name(name)
    return "eternyx-watchdog-"+name

def show(unit,prop):
    return command("/usr/bin/systemctl","show",unit,"-p",prop,"--value").stdout.strip()

def arm_command(name,dev,ino,work,seconds=SECONDS):
    require(type(seconds) is int and seconds in (75,900),"unsupported diagnostic deadline")
    unit=unit_name(name)
    return ["/usr/bin/systemd-run","--quiet","--unit="+unit,
            "--on-active="+str(seconds)+"s","--timer-property=AccuracySec=1s",
            "--property=Type=oneshot","--property=RemainAfterExit=yes",
            "--property=TimeoutStartSec=15s","/usr/bin/python3","-I","-B",
            str(work/"expire.py"),name,str(dev),str(ino),str(work)]

def write_record(path,record):
    with path.open("x") as stream:
        json.dump(record,stream,sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    path.chmod(0o400)

class CrashHook:
    def __init__(self,name,work,identity,seconds=SECONDS):
        self.seconds=seconds
        self.name,self.work,self.identity=name,work,identity
        self.unit=unit_name(name)
    def arm(self,cg):
        require(cg==j.CGROOT/self.name,"wrong watchdog scope")
        e.validate_identity(cg.stat(),*self.identity)
        require(show(self.unit+".timer","LoadState")=="not-found" and
                show(self.unit+".service","LoadState")=="not-found","foreign timer/service exists")
        started=time.monotonic_ns()
        command(*arm_command(self.name,*self.identity,self.work,self.seconds))
        require(show(self.unit+".timer","ActiveState")=="active" and
                show(self.unit+".timer","Unit")==self.unit+".service" and
                show(self.unit+".service","Type")=="oneshot",
                "independent timer not armed")
        write_record(self.work/"armed.json",{"armedMonotonicNs":started,
            "confirmedMonotonicNs":time.monotonic_ns(),"seconds":self.seconds})
        print(json.dumps({"independentTimerArmed":True,"deadlineSeconds":self.seconds}),flush=True)
    def crash(self,cg,child):
        e.validate_identity(cg.stat(),*self.identity)
        require(child in j.members(cg),"guest absent before controller crash")
        write_record(self.work/"controller-proof.json",
            {"guestPid":child,"controllerPid":os.getpid(),"crashMonotonicNs":time.monotonic_ns(),
             "twoFreshChallenges":True})
        print(json.dumps({"controllerCrashRequested":True,"guestAliveBeforeCrash":True}),flush=True)
        os.kill(os.getpid(),signal.SIGKILL)

def verify_receipt(armed,proof,receipt,name,identity,observed,seconds=SECONDS):
    require(type(seconds) is int and seconds in (75,900),"unsupported diagnostic deadline")
    require(armed["seconds"]==seconds and
            armed["armedMonotonicNs"]<=armed["confirmedMonotonicNs"]<=proof["crashMonotonicNs"]<=observed,
            "invalid controller chronology")
    require(proof["twoFreshChallenges"] is True,"guest proof missing")
    require(receipt["scope"]==name and (receipt["device"],receipt["inode"])==identity and
            receipt["populatedBeforeKill"] is True and receipt["emptyAfterKill"] is True,
            "watchdog receipt identity or cleanup missing")
    elapsed=receipt["killMonotonicNs"]-armed["armedMonotonicNs"]
    require(observed<receipt["killMonotonicNs"] and
            seconds*10**9<=elapsed<=(seconds+20)*10**9,
            "independent watchdog timing not established")
    return elapsed/10**9

def wait_controller(pid,timeout=55):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        got,status=os.waitpid(pid,os.WNOHANG)
        if got==pid:
            return os.waitstatus_to_exitcode(status)
        time.sleep(.05)
    raise RuntimeError("controller crash deadline exceeded")

def stop_units(unit):
    for suffix in (".timer",".service"):
        name=unit+suffix
        if show(name,"LoadState")!="not-found":
            command("/usr/bin/systemctl","stop",name)
        require(show(name,"ActiveState")=="inactive","watchdog unit still active")

def exercise(work,report,seconds=SECONDS):
    require(type(seconds) is int and seconds in (75,900),"unsupported diagnostic deadline")
    name="ef-"+uuid.uuid4().hex[:20]
    cg=j.CGROOT/name
    net=pathlib.Path("/run/netns")/name
    root=work/"jails"/"firecracker"/name/"root"
    unit=unit_name(name)
    require(not net.exists() and not root.parent.exists(),"diagnostic resource collision")
    require(show(unit+".timer","LoadState")=="not-found" and
            show(unit+".service","LoadState")=="not-found","watchdog resource collision")
    cg.mkdir()
    info=cg.stat()
    identity=(info.st_dev,info.st_ino)
    controller=None
    controller_reaped=False
    success=None
    try:
        shutil.copyfile(HERE/"labs-watchdog-expire.py",work/"expire.py")
        (work/"expire.py").chmod(0o400)
        hook=CrashHook(name,work,identity,seconds)
        controller=os.fork()
        if controller==0:
            try:
                v.exercise(work,report,name=name,watchdog=hook)
            except BaseException:
                traceback.print_exc()
            os._exit(1)
        code=wait_controller(controller)
        controller_reaped=True
        require(code==-signal.SIGKILL,"controller did not crash as intended")
        proof=v.exact_json((work/"controller-proof.json").read_bytes())
        armed=v.exact_json((work/"armed.json").read_bytes())
        require(proof["controllerPid"]==controller,"wrong crashed controller")
        e.validate_identity(cg.stat(),*identity)
        require(proof["guestPid"] in j.members(cg),"guest not alive after controller crash")
        observed=time.monotonic_ns()
        print(json.dumps({"controllerKilled":True,"guestSurvivedControllerCrash":True}),flush=True)
        deadline=time.monotonic()+seconds+20
        receipt_path=work/"watchdog-receipt.json"
        while time.monotonic()<deadline:
            if receipt_path.exists() and show(unit+".service","ActiveState")=="active":
                break
            time.sleep(.25)
        else:
            raise RuntimeError("independent watchdog receipt missing")
        require(show(unit+".service","Result")=="success" and
                show(unit+".service","SubState")=="exited","watchdog service did not succeed")
        receipt=v.exact_json(receipt_path.read_bytes())
        elapsed=verify_receipt(armed,proof,receipt,name,identity,observed,seconds)
        j.empty_cgroup(cg)
        require(j.reap(proof["guestPid"],5)==-signal.SIGKILL,"unexpected guest termination")
        require(j.boot.digest(root/"rootfs.ext4")==report["rootfsSha256"],"rootfs bytes changed")
        success={"controllerCrashSurvivalVerified":True,"independentSystemdWatchdogVerified":True,
            "actualWatchdogElapsedSeconds":round(elapsed,3),"configuredWatchdogSeconds":seconds,
            "full900SecondExpiryVerified":seconds==900,"guestCgroupEmptyVerified":True}
    finally:
        # Emergency fallback is cleanup only, never proof of watchdog success.
        if controller is not None and not controller_reaped:
            try:
                os.kill(controller,signal.SIGKILL)
                os.waitpid(controller,0)
            except ProcessLookupError:
                pass
        try:
            stop_units(unit)
        finally:
            if cg.exists():
                e.validate_identity(cg.stat(),*identity)
                if (cg/"cgroup.kill").is_file():
                    (cg/"cgroup.kill").write_text("1")
                j.empty_cgroup(cg)
                cg.rmdir()
            while True:
                try:
                    pid,_=os.waitpid(-1,os.WNOHANG)
                    if not pid:
                        break
                except ChildProcessError:
                    break
            if net.exists():
                j.run("/usr/sbin/ip","netns","delete",name)
            if root.parent.exists():
                shutil.rmtree(root.parent)
            require(not cg.exists() and not net.exists() and not root.parent.exists(),
                    "owned diagnostic resources remain")
    require(success is not None,"watchdog acceptance incomplete")
    print(json.dumps({**success,"ownedResourcesCleaned":True,
        "hardwareAcceptanceVerified":False,"providerActivationAllowed":False,
        "productionReleaseReady":False}),flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("expected same-run fixed preparation directory")
    v.main(pathlib.Path(sys.argv[1]).resolve(strict=True),exercise_runner=exercise)
