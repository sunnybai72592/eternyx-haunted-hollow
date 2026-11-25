import importlib.util
import json
import pathlib
import socket
import tempfile
import time
import unittest

spec=importlib.util.spec_from_file_location("live",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-runner-http-exercise.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def response(i):
    _,_,code=m.e.ROUTES[i]
    phrase={200:"OK",403:"Forbidden",404:"Not Found",405:"Method Not Allowed"}[code]
    body=json.dumps(m.BODIES[i],separators=(",",":")).encode()
    allow="Allow: GET\r\n" if code==405 else ""
    return (f"HTTP/1.1 {code} {phrase}\r\nContent-Type: application/json\r\n"
            f"Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n"
            f"Connection: close\r\n{allow}Content-Length: {len(body)}\r\n\r\n").encode()+body

class LiveExerciseTest(unittest.TestCase):
    def test_transcript_assertions_not_grades(self):
        report=m.verify_transcript([response(i) for i in range(5)])
        self.assertEqual(report["fixedAssertionsPassed"],6)
        self.assertEqual(report["routeStatusCodes"],[200,200,403,404,405])
        self.assertNotIn("serverGradeVerified",report)

    def test_wrong_body_or_header_refused(self):
        for bad in (response(1).replace(b"learner",b"manager"),
                    response(1).replace(b"no-store",b"public")):
            rows=[response(i) for i in range(5)]
            rows[1]=bad
            with self.assertRaises((ValueError,RuntimeError)):
                m.verify_transcript(rows)

    def test_bounded_real_socket_read(self):
        a,b=socket.socketpair()
        with a,b:
            b.sendall(b"abc")
            b.shutdown(socket.SHUT_WR)
            self.assertEqual(m.receive_closed(a,time.monotonic()+1,3),b"abc")
        a,b=socket.socketpair()
        with a,b:
            b.sendall(b"abcd")
            with self.assertRaisesRegex(RuntimeError,"exceeds"):
                m.receive_closed(a,time.monotonic()+1,3)

    def test_missing_response_terminator_cannot_succeed(self):
        a,b=socket.socketpair()
        with a,b:
            b.sendall(b"abc")
            with self.assertRaises(TimeoutError):
                m.receive_closed(a,time.monotonic()+.03)

    def test_mission_exact_requests_and_recovery(self):
        calls=[]
        checks=[]
        def exchange(path,payload,deadline):
            calls.append(payload)
            i=len(calls)-1
            return response(i) if i<5 else b"" if i==5 else response(0)
        result=m.mission("fixture",lambda:checks.append(True),exchange)
        self.assertEqual(calls[:5],[m.e.request(method,path) for method,path,_ in m.e.ROUTES])
        self.assertEqual(len(calls),7)
        self.assertEqual(len(checks),13)
        self.assertTrue(result["postRejectionHealthVerified"])

    def test_negative_request_response_fails_before_recovery(self):
        calls=[]
        def exchange(path,payload,deadline):
            calls.append(payload)
            return response(min(len(calls)-1,4))
        with self.assertRaisesRegex(RuntimeError,"invalid host"):
            m.mission("fixture",lambda:None,exchange)
        self.assertEqual(len(calls),6)

    def test_diagnostic_bundle_cannot_be_used_as_exercise(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory)
            report={"schema":"eternyx-fixed-guest-boot-bundle-v1",
                    "bootBundlePrepared":True,"kernelSha256":m.v.j.OBSERVED_KERNEL}
            (work/"bundle.json").write_text(json.dumps(report))
            with self.assertRaisesRegex(RuntimeError,"invalid fixed bundle"):
                m.v.verify_bundle(work,profile=m.PROFILE)
            report["schema"]="eternyx-http-exercise-boot-bundle-v1"
            (work/"bundle.json").write_text(json.dumps(report))
            with self.assertRaisesRegex(RuntimeError,"profile evidence"):
                m.v.verify_bundle(work,profile=m.PROFILE)
            with self.assertRaisesRegex(RuntimeError,"invalid fixed bundle"):
                m.v.verify_bundle(work)

if __name__=="__main__":
    unittest.main()
