#!/usr/bin/env python3
"""Prepare fixed authenticated guest boot inputs; never start KVM or load host modules."""
import hashlib
import importlib.util
import json
import os
import pathlib
import resource
import stat
import subprocess
import sys
import tempfile

HERE=pathlib.Path(__file__).resolve().parent
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

m=load("module_plan","labs-authenticated-module-plan.py")
p=m.p
b=load("rootfs_builder","labs-build-fixed-guest.py")
c=load("newc","labs-runner-firecracker-boot.py")
SOURCE=HERE.parent/"infrastructure/cyber-range/guest/eternyx_module_bootstrap.c"
MAX_MODULE=16*1024*1024
MAX_INITRD=96*1024*1024
ENV={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LC_ALL":"C"}

def choose_profile(drivers,plan):
    mode=plan["mode"]
    p.require(plan["kernelSha256"]==p.PIN and
              plan["configurationSha256"]==drivers["configurationSha256"],
              "module plan not bound to authenticated configuration")
    p.require(mode in ("built-in-only","authenticated-module-plan") and
              plan["hardDependencyPlanAvailable"] is True,
              "required guest drivers unavailable")
    p.require(plan["additionalFirmwareOrSoftDependencyReviewRequired"] is False,
              "additional firmware or soft dependencies require review")
    p.require(drivers["optionalFeatures"]["CONFIG_VIRTIO_MMIO_CMDLINE_DEVICES"]=="y",
              "fixed MMIO command-line transport not established")
    modules=plan["dependencyFirstModules"]
    if mode=="built-in-only":
        p.require(not modules and drivers["requiredBuiltInDriversPresent"] is True,
                  "built-in profile inconsistent")
    else:
        p.require(0<len(modules)<=m.MAX_COUNT and
                  drivers["optionalFeatures"]["CONFIG_DEVTMPFS"]=="y",
                  "modular profile requires selected modules and devtmpfs")
    return mode,modules

def limit_output(size):
    resource.setrlimit(resource.RLIMIT_FSIZE,(size,size))

def unpack_module(source,destination):
    # Keep Ubuntu module signatures intact by decompressing the exact bytes,
    # not stripping or relinking the ELF. Never invoke a host module loader.
    commands={".zst":"/usr/bin/zstd",".xz":"/usr/bin/xz",".gz":"/usr/bin/gzip"}
    with destination.open("xb") as output:
        if source.suffix==".ko":
            data=source.read_bytes()
            p.require(len(data)<=MAX_MODULE,"module too large")
            output.write(data)
        else:
            p.require(source.suffix in commands,"unsupported module compression")
            subprocess.run([commands[source.suffix],"-d","-c","--",str(source)],
                check=True,timeout=15,env=ENV,stdin=subprocess.DEVNULL,
                stdout=output,stderr=subprocess.PIPE,
                preexec_fn=lambda:limit_output(MAX_MODULE))
    p.require(0<destination.stat().st_size<=MAX_MODULE,"unpacked module size invalid")
    data=destination.read_bytes()
    p.require(data[:4]==b"\x7fELF","expected unpacked module ELF")
    return data

def make_initramfs(init,modules):
    p.require(init[:4]==b"\x7fELF" and 0<len(init)<=2*1024*1024,"invalid bootstrap init")
    p.require(0<len(modules)<=m.MAX_COUNT,"invalid module count")
    p.require(all(0<len(data)<=MAX_MODULE and data[:4]==b"\x7fELF" for data in modules),
              "invalid module payload")
    p.require(sum(map(len,modules))+len(init)+16384<=MAX_INITRD,"initramfs exceeds budget")
    entries=[]
    def entry(name,mode,data=b"",**kw):
        entries.append(c.newc_entry(name,mode,data,inode=len(entries)+1,**kw))
    for name in ("dev","modules","newroot"):
        entry(name,stat.S_IFDIR|0o755)
    entry("dev/console",stat.S_IFCHR|0o600,rmajor=5,rminor=1)
    entry("init",stat.S_IFREG|0o555,init)
    for i,data in enumerate(modules):
        entry(f"modules/{i:03d}.ko",stat.S_IFREG|0o400,data)
    entry("TRAILER!!!",0)
    return b"".join(entries)

def prepare_module_initrd(work,output,modules):
    with tempfile.TemporaryDirectory(prefix="bootstrap-",dir=work) as directory:
        stage=pathlib.Path(directory)
        init=stage/"init"
        b.command("/usr/bin/cc","-static","-Os","-Wall","-Wextra","-Werror",
                  f"-DMODULE_COUNT={len(modules)}",str(SOURCE),"-o",str(init))
        p.require(b"INTERP" not in b.command("/usr/bin/readelf","-l",str(init)),
                  "bootstrap not static")
        payloads=[]
        evidence=[]
        for i,item in enumerate(modules):
            basename=item["member"].rsplit("/",1)[-1]
            p.require(m.module_name(basename)==item["name"],"selected module name mismatch")
            source=work/"selected-modules"/basename
            p.require(source.is_file() and not source.is_symlink() and
                source.stat().st_size==item["bytes"] and p.digest(source)==item["sha256"],
                "selected module bytes changed")
            data=unpack_module(source,stage/f"{i:03d}.ko")
            p.require(sum(map(len,payloads))+len(data)<=64*1024*1024,
                      "uncompressed modules exceed total budget")
            payloads.append(data)
            evidence.append({"name":item["name"],"archiveSha256":item["sha256"],
                             "uncompressedSha256":hashlib.sha256(data).hexdigest()})
        image=make_initramfs(init.read_bytes(),payloads)
        with output.open("xb") as stream:
            stream.write(image)
        output.chmod(0o400)
        return {"initramfsSha256":p.digest(output),"initramfsBytes":len(image),
                "bootstrapSha256":p.digest(init),"modules":evidence}

def prepare(output):
    info=output.lstat()
    p.require(stat.S_ISDIR(info.st_mode) and info.st_uid==os.getuid()
              and stat.S_IMODE(info.st_mode)==0o700 and not list(output.iterdir()),
              "expected empty private output directory")
    def audit(tar,release,version,env,work):
        drivers,plan=m.audit(tar,release,version,env,work)
        mode,modules=choose_profile(drivers,plan)
        image=b.build(output/"rootfs.ext4")
        initrd=None
        if modules:
            initrd=prepare_module_initrd(work,output/"initramfs.cpio",modules)
        p.require(p.digest(output/"kernel")==p.PIN,"published kernel mismatch")
        result={"schema":"eternyx-fixed-guest-boot-bundle-v1",
                "mode":mode,"kernelSha256":p.PIN,
                "configurationSha256":drivers["configurationSha256"],
                "modulePackageSha256":plan["modulePackageSha256"],
                "rootfsSha256":image["rootfsSha256"],"rootfsBytes":image["rootfsBytes"],
                "guestInitSha256":image["initSha256"],"initrd":initrd,
                "bootBundlePrepared":True,"guestModuleLoadingVerified":False,
                "guestBootVerified":False,"guestVsockVerified":False,
                "hardwareAcceptanceVerified":False,"providerActivationAllowed":False,
                "productionReleaseReady":False}
        with (output/"bundle.json").open("x") as stream:
            json.dump(result,stream,sort_keys=True)
        (output/"bundle.json").chmod(0o400)
        print(json.dumps(result,sort_keys=True),flush=True)
    p.main(None,export=output/"kernel",audit=audit)

if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("expected empty private boot bundle directory")
    prepare(pathlib.Path(sys.argv[1]).absolute())
