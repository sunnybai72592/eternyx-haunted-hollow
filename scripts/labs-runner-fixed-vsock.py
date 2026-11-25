#!/usr/bin/env python3
"""Approved ephemeral diagnostic only; no provider or arbitrary guest inputs."""
import ctypes
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import secrets
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
import uuid

spec=importlib.util.spec_from_file_location("jailed",pathlib.Path(__file__).with_name("labs-runner-firecracker-jailed.py"))
j=importlib.util.module_from_spec(spec)
spec.loader.exec_module(j)
require=j.require
PROTOCOL="eternyx-guest-smoke-v1"
SHA=re.compile(r"[a-f0-9]{64}")
ROOT_BYTES=32*1024*1024
MAX_INITRD=96*1024*1024

def exact_json(data):
    def pairs(items):
        result={}
        for key,value in items:
            require(key not in result,"duplicate JSON field")
            result[key]=value
        return result
    return json.loads(data,object_pairs_hook=pairs)

def config(modular):
    result={"boot-source":{"kernel_image_path":"/kernel",
                "boot_args":"console=ttyS0 reboot=k panic=1 pci=off 8250.nr_uarts=1 "
                    +("rdinit=/init" if modular else "root=/dev/vda ro rootwait init=/sbin/init nomodules")},
            "machine-config":{"vcpu_count":1,"mem_size_mib":256,"smt":False},
            "drives":[{"drive_id":"rootfs","path_on_host":"/rootfs.ext4",
                       "is_root_device":True,"is_read_only":True}],
            "network-interfaces":[],"vsock":{"guest_cid":3,"uds_path":"/v.sock"}}
    if modular:
        result["boot-source"]["initrd_path"]="/initramfs.cpio"
    return result

def copy_bounded(source,target,max_bytes):
    fd=os.open(source,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
    try:
        info=os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and 0<info.st_size<=max_bytes,
                "unexpected input type or size")
        with os.fdopen(fd,"rb",closefd=False) as stream,target.open("xb") as output:
            remaining=info.st_size
            while remaining:
                data=stream.read(min(1024*1024,remaining))
                require(bool(data),"input truncated")
                output.write(data)
                remaining-=len(data)
            require(not stream.read(1),"input grew")
        target.chmod(0o444)
    finally:
        os.close(fd)

def verify_bundle(work):
    report=exact_json((work/"bundle.json").read_bytes())
    require(report["schema"]=="eternyx-fixed-guest-boot-bundle-v1" and
        report["bootBundlePrepared"] is True and report["kernelSha256"]==j.OBSERVED_KERNEL,
        "invalid fixed bundle")
    require(j.boot.digest(work/"kernel")==j.OBSERVED_KERNEL,"immutable kernel mismatch")
    require(report["rootfsBytes"]==ROOT_BYTES and
        (work/"rootfs.ext4").stat().st_size==ROOT_BYTES and
        SHA.fullmatch(report["rootfsSha256"]) and
        j.boot.digest(work/"rootfs.ext4")==report["rootfsSha256"],"rootfs mismatch")
    mode=report["mode"]
    require(mode in ("built-in-only","authenticated-module-plan"),"unsupported bundle mode")
    initrd=report["initrd"]
    if mode=="authenticated-module-plan":
        require(isinstance(initrd,dict) and 0<initrd["initramfsBytes"]<=MAX_INITRD and
            (work/"initramfs.cpio").stat().st_size==initrd["initramfsBytes"] and
            SHA.fullmatch(initrd["initramfsSha256"]) and
            j.boot.digest(work/"initramfs.cpio")==initrd["initramfsSha256"],"initrd mismatch")
    else:
        require(initrd is None and not (work/"initramfs.cpio").exists(),"unexpected initrd")
    return report

def read_line(sock,deadline,limit=1024):
    data=bytearray()
    while len(data)<limit:
        remaining=deadline-time.monotonic()
        require(remaining>0,"vsock response deadline")
        sock.settimeout(remaining)
        chunk=sock.recv(1)
        require(bool(chunk),"vsock closed before response")
        if chunk==b"\n":
            return bytes(data)
        data.extend(chunk)
    raise RuntimeError("vsock line too long")

def verify_response(line,session,nonce):
    expected=hashlib.sha256((PROTOCOL+"\n"+session+"\n"+nonce).encode()).hexdigest()
    response=exact_json(line)
    require(isinstance(response,dict) and set(response)==
        {"protocol","sessionId","nonce","digest","guestHealthy"} and
        response["protocol"]==PROTOCOL and response["sessionId"]==session and
        response["nonce"]==nonce and response["digest"]==expected and
        response["guestHealthy"] is True,"invalid guest proof")
    return expected

def connect_probe(path,deadline):
    # Firecracker's local UDS may appear before the guest binds port 5501.
    # Retry only connection/handshake failures, never a malformed guest proof.
    while time.monotonic()<deadline:
        sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        try:
            sock.settimeout(min(1,max(.01,deadline-time.monotonic())))
            sock.connect(str(path))
            sock.sendall(b"CONNECT 5501\n")
            line=read_line(sock,min(deadline,time.monotonic()+1),64)
            if re.fullmatch(rb"OK [1-9][0-9]{0,9}",line) and int(line[3:])<=4294967295:
                return sock
        except (OSError,RuntimeError):
            pass
        sock.close()
        time.sleep(.1)
    raise RuntimeError("guest vsock handshake not available")

def exchange(path,session,nonce,deadline):
    with connect_probe(path,deadline) as sock:
        end=min(deadline,time.monotonic()+5)
        require(end>time.monotonic(),"guest deadline exceeded")
        sock.settimeout(end-time.monotonic())
        request=json.dumps({"protocol":PROTOCOL,"sessionId":session,"nonce":nonce},
                            separators=(",",":")).encode()+b"\n"
        sock.sendall(request)
        return verify_response(read_line(sock,end),session,nonce)

def exercise(work,report,*,name=None,watchdog=None):
    name=name or "ef-"+uuid.uuid4().hex[:20]
    cg=j.CGROOT/name
    net=pathlib.Path("/run/netns")/name
    root=work/"jails"/"firecracker"/name/"root"
    vsock=root/"v.sock"
    require(len(os.fsencode(vsock))<108,"Unix socket pathname too long")
    log=work/"boot.log"
    launcher=None
    child=None
    reaped=False
    net_created=False
    if watchdog is None:
        cg.mkdir()
    else:
        require(cg.is_dir() and not j.members(cg),"expected empty observer-owned cgroup")
    try:
        for key,value in j.LIMITS.items():
            (cg/key).write_text(value)
        require((cg/"cgroup.kill").is_file(),"cgroup kill unavailable")
        j.run("/usr/sbin/ip","netns","add",name)
        net_created=True
        root.mkdir(parents=True,mode=0o755)
        modular=report["mode"]=="authenticated-module-plan"
        for item in ("kernel","rootfs.ext4")+(("initramfs.cpio",) if modular else ()):
            shutil.copyfile(work/item,root/item)
            (root/item).chmod(0o444)
            require(j.boot.digest(root/item)==j.boot.digest(work/item),"jailed artifact mismatch")
        (root/"config.json").write_text(json.dumps(config(modular)))
        (root/"config.json").chmod(0o444)
        if watchdog is not None:
            watchdog.arm(cg)
        with log.open("xb") as output:
            launcher=subprocess.Popen(j.invocation(work,cg,name,net),stdin=subprocess.DEVNULL,
                                     stdout=output,stderr=subprocess.STDOUT,env={})
            require(launcher.wait(timeout=10)==0,"Jailer launcher failed")
            deadline=time.monotonic()+40
            while time.monotonic()<deadline:
                pidfile=root/"firecracker.pid"
                if pidfile.is_file() and vsock.exists():
                    candidate=int(j.read(pidfile))
                    require(candidate in j.members(cg),"unbound Jailer pid")
                    child=candidate
                    require(stat.S_ISSOCK(vsock.lstat().st_mode),"unexpected vsock path")
                    # Seccomp may be installed just after socket creation.
                    fields=j.status_fields((pathlib.Path("/proc")/str(child)/"status").read_text())
                    if fields.get("Seccomp","").strip()=="2" and fields.get("NoNewPrivs","").strip()=="1":
                        break
                time.sleep(.05)
            else:
                raise RuntimeError("Jailer guest listener not ready")
            evidence=j.verify_live(child,cg,root,net,allowed_socket=vsock)
            session=str(uuid.uuid4())
            first=secrets.token_hex(32)
            second=secrets.token_hex(32)
            require(first!=second,"repeated challenge")
            one=exchange(vsock,session,first,deadline)
            j.verify_live(child,cg,root,net,allowed_socket=vsock)
            two=exchange(vsock,session,second,deadline)
            require(one!=two,"repeated response")
            j.verify_live(child,cg,root,net,allowed_socket=vsock)
            if watchdog is not None:
                watchdog.crash(cg,child)
                raise RuntimeError("controller crash did not occur")
            (cg/"cgroup.kill").write_text("1")
            require(j.reap(child,5)==-signal.SIGKILL,"unexpected guest exit")
            reaped=True
            j.empty_cgroup(cg)
            require(j.boot.digest(root/"rootfs.ext4")==report["rootfsSha256"],
                    "read-only rootfs bytes changed")
        print(json.dumps({"liveIsolation":evidence,"distinctGuestChallengesVerified":2,
                          "guestRootfsBytesUnchanged":True}),flush=True)
    finally:
        if launcher is not None and launcher.poll() is None:
            launcher.kill()
            launcher.wait(timeout=5)
        if (cg/"cgroup.kill").is_file():
            (cg/"cgroup.kill").write_text("1")
        j.empty_cgroup(cg)
        if child is not None and not reaped:
            try:
                j.reap(child,5)
            except ChildProcessError:
                pass
        while True:
            try:
                pid,_=os.waitpid(-1,os.WNOHANG)
                if not pid:
                    break
            except ChildProcessError:
                break
        cg.rmdir()
        if net_created:
            j.run("/usr/sbin/ip","netns","delete",name)
        if root.parent.exists():
            shutil.rmtree(root.parent)
        require(not cg.exists() and not net.exists() and not root.parent.exists(),
                "owned diagnostic resources remain")
        if log.exists():
            with log.open("rb") as stream:
                stream.seek(max(0,log.stat().st_size-4096))
                print(stream.read().decode("utf-8",errors="replace"),flush=True)

def main(source,exercise_runner=exercise):
    require(os.geteuid()==0,"approved ephemeral root setup required")
    require((j.CGROOT/"cgroup.controllers").is_file() and
            stat.S_ISCHR(pathlib.Path("/dev/kvm").stat().st_mode),"KVM/cgroup v2 absent")
    require(ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)==0,"cannot become subreaper")
    j.verify_exec_directory(j.EXEC_BASE)
    with tempfile.TemporaryDirectory(prefix="ef-",dir=j.EXEC_BASE) as directory:
        work=pathlib.Path(directory)
        j.verify_exec_directory(work)
        (work/"jails").mkdir(mode=0o700)
        for name,limit in (("bundle.json",65536),("kernel",128*1024*1024),
                           ("rootfs.ext4",ROOT_BYTES),("release.tgz",j.boot.ARCHIVE_BYTES)):
            copy_bounded(source/name,work/name,limit)
        if (source/"initramfs.cpio").exists():
            copy_bounded(source/"initramfs.cpio",work/"initramfs.cpio",MAX_INITRD)
        report=verify_bundle(work)
        j.boot.extract_pinned(work/"release.tgz",work)
        for name in ("firecracker","jailer"):
            j.verify_release_executable(work/name)
        exercise_runner(work,report)
    print(json.dumps({"immutableKernelRootfsBootVerified":True,
        "guestReadOnlyExt4ServiceVerified":True,"guestVsockVerified":True,
        "guestModuleLoadingVerified":report["mode"]=="authenticated-module-plan",
        "guestBootMode":report["mode"],"guestNetworkDevices":0,"apiDisabled":True,
        "ownedResourcesCleaned":True,"dedicatedHardwareAcceptanceVerified":False,
        "providerActivationAllowed":False,"productionReleaseReady":False}),flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("expected same-run fixed preparation directory")
    main(pathlib.Path(sys.argv[1]).resolve(strict=True))
