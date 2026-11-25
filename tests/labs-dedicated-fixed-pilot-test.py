import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("pilot",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-dedicated-fixed-pilot.py")
p=importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

class PilotTest(unittest.TestCase):
    def args(self,mode="--session"):
        return [mode,p.APPROVALS[mode],"/tmp/bundle","a"*64]
    def test_separate_explicit_approvals(self):
        for mode in p.APPROVALS:
            self.assertEqual(p.authorize(self.args(mode),{},"Linux",0)[0],mode)
        args=self.args("--expiry")
        args[1]=p.APPROVALS["--session"]
        with self.assertRaises(RuntimeError):
            p.authorize(args,{},"Linux",0)
    def test_ci_and_unprivileged_rejected(self):
        for env,uid in (({"CI":"true"},0),({"GITHUB_ACTIONS":"true"},0),({},1000)):
            with self.assertRaises(RuntimeError):
                p.authorize(self.args(),env,"Linux",uid)
    def test_external_pin_required(self):
        args=self.args()
        args[3]="self supplied label"
        with self.assertRaises(RuntimeError):
            p.authorize(args,{},"Linux",0)
    def test_manifest_pin_verified_on_private_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory)
            (work/"bundle.json").write_bytes(b"fixture")
            report={"kernelSha256":p.h.KERNEL_PIN,"rootfsSha256":"a"*64,"mode":"built-in-only"}
            pin=p.v.j.boot.digest(work/"bundle.json")
            p.validate_reviewed_bundle(work,report,pin)
            (work/"bundle.json").write_bytes(b"changed")
            with self.assertRaises(RuntimeError):
                p.validate_reviewed_bundle(work,report,pin)
    def test_full_duration_and_short_duration_remain_distinct(self):
        name="ef-"+"a"*20
        work=pathlib.Path("/var/lib/ef-abcdefgh")
        for seconds in (75,900):
            self.assertIn(f"--on-active={seconds}s",p.w.arm_command(name,1,2,work,seconds))
        with self.assertRaises(RuntimeError):
            p.w.arm_command(name,1,2,work,60)
    def test_full_expiry_cannot_be_proven_by_short_drill(self):
        name="ef-"+"a"*20
        armed={"seconds":900,"armedMonotonicNs":10**9,"confirmedMonotonicNs":2*10**9}
        proof={"crashMonotonicNs":5*10**9,"twoFreshChallenges":True}
        receipt={"scope":name,"device":1,"inode":2,"killMonotonicNs":901*10**9,
                 "populatedBeforeKill":True,"emptyAfterKill":True}
        self.assertEqual(p.w.verify_receipt(armed,proof,receipt,name,(1,2),6*10**9,900),900)
        receipt["killMonotonicNs"]=76*10**9
        with self.assertRaises(RuntimeError):
            p.w.verify_receipt(armed,proof,receipt,name,(1,2),6*10**9,900)
    def test_no_mutation_before_host_readiness(self):
        with patch.object(p,"authorize",return_value=("--session",pathlib.Path("/tmp/bundle"),"a"*64)), \
             patch.object(p.h,"inspect",return_value={"readOnlyCapabilityChecksPassed":False}), \
             patch.object(p,"acquire_lock") as lock:
            with self.assertRaises(RuntimeError):
                p.run([])
            lock.assert_not_called()

if __name__=="__main__":
    unittest.main()
