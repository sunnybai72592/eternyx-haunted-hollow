#!/usr/bin/env python3
"""Read-only dependency closure for fixed guest modules. Never loads modules."""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import tarfile

spec=importlib.util.spec_from_file_location("drivers",pathlib.Path(__file__).with_name("labs-authenticated-kernel-drivers.py"))
d=importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
p=d.p
MAX_MEMBER=16*1024*1024
MAX_TOTAL=64*1024*1024
MAX_COUNT=64
MAX_INDEX=100000
MODULE_FOR={
    "CONFIG_VIRTIO":"virtio",
    "CONFIG_VIRTIO_MMIO":"virtio_mmio",
    "CONFIG_VIRTIO_BLK":"virtio_blk",
    "CONFIG_EXT4_FS":"ext4",
    "CONFIG_VSOCKETS":"vsock",
    "CONFIG_VIRTIO_VSOCKETS":"vmw_vsock_virtio_transport",
    "CONFIG_VIRTIO_VSOCKETS_COMMON":"vmw_vsock_virtio_transport_common",
}
def normalize(name):
    p.require(re.fullmatch(r"[A-Za-z0-9_-]{1,128}",name),"invalid module name")
    return name.replace("-","_")

def module_name(path):
    name=path.rsplit("/",1)[-1]
    match=re.fullmatch(r"([A-Za-z0-9_-]+)\.ko(?:\.(?:zst|xz|gz))?",name)
    return normalize(match[1]) if match else None

def module_targets(report):
    required=report["requiredDrivers"]
    p.require(set(required)==set(d.REQUIRED),"incomplete authenticated driver report")
    p.require(all(x in ("y","m","n","unknown") for x in required.values()),"invalid driver state")
    if any(x not in ("y","m") for x in required.values()):
        return "blocked-unavailable-driver",[]
    targets=[]
    for key,value in required.items():
        if value=="m":
            p.require(key in MODULE_FOR,"unsupported modular core kernel feature")
            targets.append(MODULE_FOR[key])
    if not targets:
        return "built-in-only",[]
    if report["optionalFeatures"]["CONFIG_MODULES"]!="y" or report["optionalFeatures"]["CONFIG_BLK_DEV_INITRD"]!="y":
        return "blocked-module-initrd-support",[]
    return "authenticated-module-plan",sorted(set(targets))

def index_archive(archive,release):
    roots=("lib/modules/"+release+"/","usr/lib/modules/"+release+"/")
    index={}
    builtins=set()
    builtin_seen=False
    for count,member in enumerate(archive,1):
        p.require(count<=MAX_INDEX,"module archive index exceeds budget")
        path=member.name.removeprefix("./")
        prefix=next((x for x in roots if path.startswith(x)),None)
        if prefix is None:
            continue
        relative=path[len(prefix):]
        if relative=="modules.builtin":
            p.require(not builtin_seen and member.isreg() and 0<=member.size<=d.MAX_CONFIG,
                      "invalid builtin module index")
            builtin_seen=True
            with archive.extractfile(member) as stream:
                raw=stream.read(d.MAX_CONFIG+1)
            p.require(len(raw)==member.size,"truncated builtin index")
            for line in raw.decode("ascii",errors="strict").splitlines():
                name=module_name(line)
                p.require(name is not None,"invalid builtin module entry")
                builtins.add(name)
        elif relative.startswith("kernel/") and module_name(relative):
            name=module_name(relative)
            p.require(member.isreg() and 0<member.size<=MAX_MEMBER
                and all(x not in ("",".","..") for x in relative.split("/"))
                and re.fullmatch(r"[A-Za-z0-9_./+-]+",relative),
                "unsafe module member")
            p.require(name not in index,"ambiguous module name: "+name)
            index[name]=member
    p.require(not set(index)&builtins,"module is both built-in and loadable")
    return index,builtins

def resolve(targets,load,builtins):
    ordered=[]
    active=set()
    done=set()
    def visit(raw):
        name=normalize(raw)
        if name in done or name in builtins:
            return
        p.require(name not in active,"module dependency cycle")
        p.require(len(active)+len(done)<MAX_COUNT,"module dependency count exceeded")
        active.add(name)
        item=load(name)
        for dep in item["depends"]:
            visit(dep)
        active.remove(name)
        done.add(name)
        ordered.append(item)
    for name in targets:
        visit(name)
    return ordered

def modinfo(path,field):
    return subprocess.run(["/usr/sbin/modinfo","-F",field,str(path)],
        check=True,timeout=5,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,env=p.BASE_ENV,text=True).stdout.strip()

def inspect_closure(tar,release,targets,work):
    stage=work/"selected-modules"
    stage.mkdir(mode=0o700)
    total=0
    with tarfile.open(tar,"r:") as archive:
        index,builtins=index_archive(archive,release)
        def load(name):
            nonlocal total
            p.require(name in index,"required module absent from authenticated archive: "+name)
            member=index[name]
            total+=member.size
            p.require(total<=MAX_TOTAL,"module closure byte budget exceeded")
            basename=member.name.rsplit("/",1)[-1]
            path=stage/basename
            with archive.extractfile(member) as stream, path.open("xb") as output:
                data=stream.read(MAX_MEMBER+1)
                p.require(len(data)==member.size,"module member size mismatch")
                output.write(data)
            path.chmod(0o400)
            actual=normalize(modinfo(path,"name"))
            vermagic=modinfo(path,"vermagic")
            p.require(actual==name and vermagic.split() and vermagic.split()[0]==release,
                      "module identity or kernel ABI mismatch")
            deps=modinfo(path,"depends")
            dependencies=sorted(set(normalize(x) for x in deps.split(",") if x))
            p.require(len(dependencies)<=MAX_COUNT,"module dependency count exceeded")
            # Record firmware/soft dependency metadata, but do not silently
            # treat it as satisfied by this hard-dependency-only plan.
            firmware=modinfo(path,"firmware")
            softdep=modinfo(path,"softdep")
            return {"name":name,"member":member.name.removeprefix("./"),
                    "sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data),
                    "depends":dependencies,"firmwareRequired":bool(firmware),
                    "softDependenciesPresent":bool(softdep)}
        ordered=resolve(targets,load,builtins)
        p.require(all(x not in builtins for x in targets),
                  "config modular target conflicts with built-in index")
        return ordered

def audit(tar,release,version,env,work):
    report=d.audit(tar,release,version,env,work)
    mode,targets=module_targets(report)
    ordered=[]
    package_pin=None
    if mode=="authenticated-module-plan":
        # The preceding driver audit may already have authenticated this
        # exact package in the same private workspace. Reuse its tar only
        # when the configuration report identifies that precise source.
        if report["configurationSource"]=="authenticated-exact-version-modules-package-config":
            modules_tar=work/"modules.tar"
            package_pin=report["configurationPackageSha256"]
        else:
            modules_tar,package_pin=d.authenticated_modules_archive(release,version,env,work)
        ordered=inspect_closure(modules_tar,release,targets,work)
    blocked=mode.startswith("blocked")
    extra=any(x["firmwareRequired"] or x["softDependenciesPresent"] for x in ordered)
    result={"schema":"eternyx-authenticated-module-plan-v1",
        "kernelSha256":p.PIN,"kernelRelease":release,"configurationSha256":report["configurationSha256"],
        "mode":mode,"modulePackageSha256":package_pin,"targets":targets,
        "dependencyFirstModules":ordered,"moduleBytes":sum(x["bytes"] for x in ordered),
        "additionalFirmwareOrSoftDependencyReviewRequired":extra,
        "hardDependencyPlanAvailable":not blocked,
        "guestModuleLoadingVerified":False,"guestBootVerified":False,"guestVsockVerified":False,
        "hardwareAcceptanceVerified":False,"providerActivationAllowed":False,
        "productionReleaseReady":False}
    print(json.dumps(result,sort_keys=True),flush=True)
    return report,result

if __name__=="__main__":
    p.main(None,audit=audit)
