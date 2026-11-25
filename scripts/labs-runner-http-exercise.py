#!/usr/bin/env python3
"""Fixed offline exercise acceptance over the existing isolated vsock transport."""
import importlib.util
import json
import pathlib
import sys
import time

HERE=pathlib.Path(__file__).resolve().parent
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

v=load("live","labs-runner-fixed-vsock.py")
e=load("exercise","labs-http-exercise-check.py")
PROFILE="http-security-exercise-v1"
BODIES=({"status":"ready"},{"role":"learner","data":"synthetic"},
        {"error":"forbidden"},{"error":"not_found"},{"error":"method_not_allowed"})

def receive_closed(sock,deadline,limit=1024):
    data=bytearray()
    while True:
        remaining=deadline-time.monotonic()
        v.require(remaining>0,"HTTP exercise response deadline")
        sock.settimeout(remaining)
        chunk=sock.recv(min(512,limit+1-len(data)))
        if not chunk:
            return bytes(data)
        data.extend(chunk)
        v.require(len(data)<=limit,"HTTP exercise response exceeds bound")

def transact(path,payload,deadline):
    with v.connect_probe(path,min(deadline,time.monotonic()+3)) as sock:
        end=min(deadline,time.monotonic()+5)
        v.require(end>time.monotonic(),"HTTP exercise deadline exhausted")
        sock.settimeout(end-time.monotonic())
        sock.sendall(payload)
        return receive_closed(sock,end)

def verify_transcript(responses):
    v.require(len(responses)==len(e.ROUTES),"incomplete live exercise transcript")
    for i,raw in enumerate(responses):
        row=e.parse(raw)
        v.require(row["status"]==e.ROUTES[i][2] and row["body"]==BODIES[i],
                  "unexpected synthetic response")
        v.require(row["cache-control"]=="no-store" and
                  row["x-content-type-options"]=="nosniff","security header mismatch")
        if row["status"]==405:
            v.require(row["allow"]=="GET","incorrect method restriction")
    # These are fixed acceptance assertions, not learner answers or grades.
    result=e.evaluate(responses,{q[0]:q[3] for q in e.QUESTIONS})
    v.require(result["correct"]==len(e.QUESTIONS),"exercise assertion mismatch")
    return {"fixedAssertionsPassed":result["correct"],
            "fixedAssertionsTotal":result["total"],
            "routeStatusCodes":[r[2] for r in e.ROUTES],
            "responseSha256":result["transcriptSha256"]}

def mission(path,attest,exchange=transact):
    deadline=time.monotonic()+45
    responses=[]
    for method,route,_ in e.ROUTES:
        attest()
        responses.append(exchange(path,e.request(method,route),deadline))
        attest()
    result=verify_transcript(responses)
    # Exact synthetic invalid request; no scanning or arbitrary target.
    invalid=e.request("GET","/api/profile").replace(b"Host: lab",b"Host: other")
    attest()
    v.require(exchange(path,invalid,deadline)==b"","invalid host unexpectedly received a response")
    attest()
    # Verify the refusal did not terminate or corrupt the guest service.
    recovery=exchange(path,e.request("GET","/health"),deadline)
    v.require(e.parse(recovery)["body"]==BODIES[0] and e.parse(recovery)["status"]==200,
              "guest failed post-rejection health check")
    attest()
    return {**result,"invalidSyntheticHostRejected":True,"postRejectionHealthVerified":True,
            "liveHttpExchangesVerified":6}

def main(source):
    def run(work,report):
        return v.exercise(work,report,mission=mission)
    result=v.main(source,exercise_runner=run,profile=PROFILE)
    v.require(isinstance(result,dict) and result.get("fixedAssertionsPassed")==6,
              "exercise results missing")
    print(json.dumps({"schema":"eternyx-live-http-exercise-acceptance-v1",**result,
        "authenticatedGuestExerciseVerified":True,"ownedResourcesCleaned":True,
        "serverGradeVerified":False,"accountProgressSaved":False,
        "dedicatedHardwareAcceptanceVerified":False,"providerActivationAllowed":False,
        "productionReleaseReady":False},sort_keys=True),flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("expected same-run fixed exercise bundle")
    main(pathlib.Path(sys.argv[1]).resolve(strict=True))
