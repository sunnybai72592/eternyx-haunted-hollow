#!/usr/bin/env python3
"""Inspect configuration from authenticated exact-version Ubuntu packages."""
import gzip
import hashlib
import importlib.util
import io
import json
import pathlib
import re
import resource
import shutil
import subprocess
import tarfile

spec=importlib.util.spec_from_file_location("provenance",pathlib.Path(__file__).with_name("labs-runner-kernel-provenance.py"))
p=importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

MAX_CONFIG=2*1024*1024
MAX_MODULES_PACKAGE=512*1024*1024
MAX_MODULES_TAR=2*1024*1024*1024
REQUIRED=("CONFIG_BLOCK","CONFIG_VIRTIO","CONFIG_VIRTIO_MMIO","CONFIG_VIRTIO_BLK",
          "CONFIG_EXT4_FS","CONFIG_VSOCKETS","CONFIG_VIRTIO_VSOCKETS",
          "CONFIG_VIRTIO_VSOCKETS_COMMON")
OPTIONAL=("CONFIG_VIRTIO_MMIO_CMDLINE_DEVICES","CONFIG_MODULES","CONFIG_BLK_DEV_INITRD",
          "CONFIG_DEVTMPFS","CONFIG_DEVTMPFS_MOUNT")

def read_member(tar,name,limit):
    found=[]
    with tarfile.open(tar,"r:") as archive:
        for member in archive:
            if member.name.removeprefix("./")!=name:
                continue
            p.require(member.isreg() and 0<member.size<=limit,"invalid archive configuration member")
            with archive.extractfile(member) as stream:
                found.append(stream.read(limit+1))
            p.require(len(found)==1 and len(found[0])==member.size,"duplicate or truncated member")
    return found[0] if found else None

def embedded_config(kernel):
    marker=b"IKCFG_ST"
    start=kernel.find(marker+b"\x1f\x8b\x08")
    if start<0:
        return None
    end=kernel.find(b"IKCFG_ED",start+len(marker))
    p.require(end>start and end-start<=MAX_CONFIG,"invalid embedded config bounds")
    with gzip.GzipFile(fileobj=io.BytesIO(kernel[start+len(marker):end])) as stream:
        config=stream.read(MAX_CONFIG+1)
    p.require(0<len(config)<=MAX_CONFIG,"embedded config too large")
    return config

def parse_config(data):
    p.require(0<len(data)<=MAX_CONFIG,"invalid kernel config size")
    wanted=set(REQUIRED+OPTIONAL)
    found={}
    for line in data.decode("utf-8",errors="strict").splitlines():
        m=re.fullmatch(r"(CONFIG_[A-Z0-9_]+)=(.*)",line)
        n=re.fullmatch(r"# (CONFIG_[A-Z0-9_]+) is not set",line)
        if m and m[1] in wanted:
            key,value=m[1],m[2]
        elif n and n[1] in wanted:
            key,value=n[1],"n"
        else:
            continue
        p.require(key not in found and value in ("y","m","n"),"ambiguous driver configuration: "+key)
        found[key]=value
    p.require(len(found)>=3,"missing expected Linux configuration")
    return {key:found.get(key,"unknown") for key in REQUIRED+OPTIONAL}

def classify(config,source,package_sha):
    drivers={key:config[key] for key in REQUIRED}
    built_in=all(v=="y" for v in drivers.values())
    return {"schema":"eternyx-authenticated-kernel-driver-audit-v1",
            "kernelSha256":p.PIN,"configurationSource":source,
            "configurationPackageSha256":package_sha,
            "requiredDrivers":drivers,
            "optionalFeatures":{key:config[key] for key in OPTIONAL},
            "requiredBuiltInDriversPresent":built_in,
            "moduleSupportRequired":any(v=="m" for v in drivers.values()),
            "unavailableOrUnknownDrivers":[k for k,v in drivers.items() if v not in ("y","m")],
            "guestBootVerified":False,"guestVsockVerified":False,
            "hardwareAcceptanceVerified":False,"providerActivationAllowed":False,
            "productionReleaseReady":False}

def limit_file(size):
    resource.setrlimit(resource.RLIMIT_FSIZE,(size,size))

def module_package_config(release,version,env,work):
    p.require((release,version)==(p.GUEST_RELEASE,p.GUEST_VERSION),
              "modules audit requires exact immutable guest identity")
    package="linux-modules-"+release
    pin=p.metadata_pin(p.command(["/usr/bin/apt-cache","show",package],env,work),
                       package,version,max_bytes=MAX_MODULES_PACKAGE)
    print(json.dumps({"authenticatedModulesPackage":package,
                      "modulesPackageBytes":pin[1],"modulesPackageSha256":pin[0],
                      "modulesPackageLimitBytes":MAX_MODULES_PACKAGE,
                      "modulesTarLimitBytes":MAX_MODULES_TAR}),flush=True)
    p.require(shutil.disk_usage(work).free >= pin[1]+MAX_MODULES_TAR+64*1024*1024,
              "insufficient private workspace capacity for bounded modules archive")
    downloads=work/"config-download"
    downloads.mkdir(mode=0o700)
    subprocess.run(["/usr/bin/apt-get","download",package+"="+version],
        check=True,timeout=180,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL,env=env,cwd=downloads,
        preexec_fn=lambda: limit_file(pin[1]))
    files=list(downloads.iterdir())
    p.require(len(files)==1 and files[0].suffix==".deb","unexpected modules download")
    p.verify_deb(files[0],pin)
    print(json.dumps({"downloadedModulesPackageDigestAndSizeVerified":True}),flush=True)
    tar=work/"modules.tar"
    with tar.open("xb") as output:
        subprocess.run(["/usr/bin/dpkg-deb","--fsys-tarfile",str(files[0])],
            check=True,timeout=180,stdout=output,stderr=subprocess.PIPE,
            env=p.BASE_ENV,preexec_fn=lambda: limit_file(MAX_MODULES_TAR))
    p.require(0<tar.stat().st_size<=MAX_MODULES_TAR,"modules tar exceeds bounded size")
    data=read_member(tar,"boot/config-"+release,MAX_CONFIG)
    p.require(data is not None,"exact authenticated modules package contains no boot config")
    return data,pin[0]

def audit(tar,release,version,env,work):
    # Called only after signed image package and immutable kernel hash checks.
    kernel=read_member(tar,"boot/vmlinuz-"+release,p.MAX_PACKAGE)
    p.require(kernel is not None and hashlib.sha256(kernel).hexdigest()==p.PIN,
              "driver audit kernel pin mismatch")
    data=read_member(tar,"boot/config-"+release,MAX_CONFIG)
    embedded=embedded_config(kernel)
    if data is not None and embedded is not None:
        p.require(parse_config(data)==parse_config(embedded),"embedded and package driver config conflict")
    if data is not None:
        source="authenticated-image-package-config"
        pin=p.metadata_pin(p.command(["/usr/bin/apt-cache","show",p.GUEST_PACKAGE],env,work),p.GUEST_PACKAGE,version)[0]
    elif embedded is not None:
        data=embedded
        source="immutable-kernel-embedded-config"
        pin=p.metadata_pin(p.command(["/usr/bin/apt-cache","show",p.GUEST_PACKAGE],env,work),p.GUEST_PACKAGE,version)[0]
    else:
        data,pin=module_package_config(release,version,env,work)
        source="authenticated-exact-version-modules-package-config"
    report=classify(parse_config(data),source,pin)
    report["configurationSha256"]=hashlib.sha256(data).hexdigest()
    print(json.dumps(report,sort_keys=True),flush=True)

if __name__=="__main__":
    p.main(None,audit=audit)
