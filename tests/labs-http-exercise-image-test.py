import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/"scripts"/file)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj
b=load("builder","labs-build-fixed-guest.py")
e=load("exercise","labs-http-exercise-check.py")

class ExerciseImageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        temp=tempfile.TemporaryDirectory()
        cls.addClassCleanup(temp.cleanup)
        work=pathlib.Path(temp.name)
        cls.image=work/"rootfs.ext4"
        cls.report=b.build(cls.image,profile="http-security-exercise-v1")
        cls.binary=work/"init"
        b.command("/usr/sbin/debugfs","-R",f"dump /sbin/init {cls.binary}",str(cls.image))
        cls.binary.chmod(0o700)
    def invoke(self,data):
        return subprocess.run([str(self.binary),"--self-test"],input=data,
                              stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
    def transcript(self):
        result=[]
        for method,path,_ in e.ROUTES:
            run=self.invoke(e.request(method,path))
            self.assertEqual(run.returncode,0,run.stderr)
            result.append(run.stdout)
        return result
    def test_actual_image_hash_and_distinct_profile(self):
        self.assertEqual(b.digest(self.image),self.report["rootfsSha256"])
        self.assertEqual(b.digest(self.binary),self.report["initSha256"])
        self.assertTrue(self.report["exerciseImageBuilt"])
        self.assertFalse(self.report["diagnosticImageBuilt"])
        self.assertFalse(self.report["guestBootVerified"])
        self.assertFalse(self.report["providerActivationAllowed"])
    def test_five_actual_http_responses(self):
        for response,(_,_,status) in zip(self.transcript(),e.ROUTES):
            self.assertEqual(e.parse(response)["status"],status)
    def test_synthetic_profile_and_no_admin_data(self):
        rows=[e.parse(x) for x in self.transcript()]
        self.assertEqual(rows[1]["body"],{"role":"learner","data":"synthetic"})
        self.assertEqual(rows[2]["body"],{"error":"forbidden"})
        self.assertEqual(rows[4]["allow"],"GET")
    def test_local_six_question_feedback(self):
        answers={q[0]:q[3] for q in e.QUESTIONS}
        report=e.evaluate(self.transcript(),answers)
        self.assertEqual(report["correct"],6)
        self.assertFalse(report["serverGradeVerified"])
        self.assertFalse(report["accountProgressSaved"])
        answers["authorization-denial"]="403"
        self.assertEqual(e.evaluate(self.transcript(),answers)["correct"],5)
    def test_reject_trailing_injected_or_out_of_scope_requests(self):
        good=e.request("GET","/api/profile")
        for data in (good+b"extra",good.replace(b"Host: lab",b"Host: other"),
                     good.replace(b"/api/profile",b"/etc/passwd"),
                     good.replace(b"Connection: close",b"Connection: close\r\nX-Role: admin"),
                     good[:-2],b"x"*513):
            result=self.invoke(data)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(result.stdout,b"")
    def test_transcript_reordering_and_header_confusion_rejected(self):
        rows=self.transcript()
        answers={q[0]:q[3] for q in e.QUESTIONS}
        with self.assertRaises(ValueError):
            e.evaluate(list(reversed(rows)),answers)
        with self.assertRaises(ValueError):
            e.parse(rows[0].replace(b"Cache-Control: no-store",b"Cache-Control: no-store\r\ncache-control: public"))
        with self.assertRaises(ValueError):
            e.parse(rows[0]+b"extra")
    def test_existing_liveness_protocol_preserved(self):
        request={"protocol":"eternyx-guest-smoke-v1",
            "sessionId":"123e4567-e89b-42d3-a456-426614174001","nonce":"ab"*32}
        result=self.invoke((json.dumps(request,separators=(",",":"))+"\n").encode())
        self.assertEqual(result.returncode,0)
        self.assertTrue(json.loads(result.stdout)["guestHealthy"])
    def test_unknown_profile_rejected_before_build(self):
        with self.assertRaises(RuntimeError):
            b.build(pathlib.Path("/tmp/rootfs.ext4"),profile="arbitrary")

if __name__=="__main__":
    unittest.main()
