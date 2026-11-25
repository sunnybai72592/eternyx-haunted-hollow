#!/usr/bin/env python3
"""Local fixed exercise transcript checks; no account grade or runtime claims."""
import hashlib
import json

ROUTES=(("GET","/health",200),("GET","/api/profile",200),
        ("GET","/api/admin",403),("GET","/api/missing",404),
        ("POST","/api/profile",405))
QUESTIONS=(
    ("authorization-denial",2,"status",403),
    ("unknown-resource",3,"status",404),
    ("method-restriction",4,"status",405),
    ("allowed-method",4,"allow","GET"),
    ("cache-policy",1,"cache-control","no-store"),
    ("content-sniffing",1,"x-content-type-options","nosniff"),
)
def require(ok,message):
    if not ok:
        raise ValueError(message)

def request(method,path):
    require(any((method,path)==(m,p) for m,p,_ in ROUTES),"outside fixed exercise routes")
    return (f"{method} {path} HTTP/1.1\r\nHost: lab\r\nConnection: close\r\n\r\n").encode("ascii")

def parse(response):
    require(isinstance(response,bytes) and 0<len(response)<=1024,"bounded HTTP response required")
    head,sep,body=response.partition(b"\r\n\r\n")
    require(bool(sep),"missing HTTP header boundary")
    lines=head.decode("ascii",errors="strict").split("\r\n")
    allowed={f"HTTP/1.1 {code} {phrase}":code for code,phrase in
        ((200,"OK"),(403,"Forbidden"),(404,"Not Found"),(405,"Method Not Allowed"))}
    require(lines[0] in allowed,"unexpected HTTP status")
    headers={}
    for line in lines[1:]:
        name,separator,value=line.partition(": ")
        key=name.lower()
        require(bool(separator) and key not in headers,"invalid or duplicate header")
        headers[key]=value
    expected={"content-type","cache-control","x-content-type-options","connection","content-length"}
    if allowed[lines[0]]==405:
        expected.add("allow")
    require(set(headers)==expected,"unexpected response headers")
    require(headers["content-length"].isascii() and headers["content-length"].isdigit()
        and int(headers["content-length"])==len(body),"incorrect response length")
    require(headers["content-type"]=="application/json" and headers["connection"]=="close",
            "unexpected fixed transport")
    payload=json.loads(body)
    require(isinstance(payload,dict),"invalid response body")
    return {"status":allowed[lines[0]],**headers,"body":payload}

def evaluate(responses,answers):
    require(len(responses)==len(ROUTES),"complete ordered transcript required")
    observations=[parse(raw) for raw in responses]
    for observed,(_,_,expected) in zip(observations,ROUTES):
        require(observed["status"]==expected,"wrong route/status evidence")
    require(isinstance(answers,dict) and set(answers)=={q[0] for q in QUESTIONS},
            "complete exact answer keys required")
    outcomes={}
    for question,route,field,expected in QUESTIONS:
        observed=observations[route][field]
        require(observed==expected,"fixed exercise response changed")
        value=answers[question]
        outcomes[question]=type(value) is type(expected) and value==observed
    return {"schema":"eternyx-local-http-exercise-result-v1",
            "correct":sum(outcomes.values()),"total":len(QUESTIONS),"outcomes":outcomes,
            "transcriptSha256":[hashlib.sha256(raw).hexdigest() for raw in responses],
            "serverGradeVerified":False,"accountProgressSaved":False,
            "hostedGuestExecutionVerified":False,"providerActivationAllowed":False}
