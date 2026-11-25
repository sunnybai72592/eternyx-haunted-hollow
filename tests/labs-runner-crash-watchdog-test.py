import importlib.util
import pathlib
import stat
import unittest
from types import SimpleNamespace

spec=importlib.util.spec_from_file_location("watchdog",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-runner-crash-watchdog.py")
w=importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

NAME="ef-"+"a"*20
IDENTITY=(12,34)

class WatchdogTest(unittest.TestCase):
    def test_fixed_scope_only(self):
        self.assertEqual(w.unit_name(NAME),"eternyx-watchdog-"+NAME)
        for value in ("../system.slice","ef-short","/sys/fs/cgroup","ef-"+"z"*20):
            with self.assertRaises(RuntimeError):
                w.unit_name(value)

    def test_timer_owns_fixed_deadline_and_exact_scope(self):
        args=w.arm_command(NAME,*IDENTITY,pathlib.Path("/var/lib/ef-abcdefgh"))
        self.assertIn("--on-active=75s",args)
        self.assertIn("--property=Type=oneshot",args)
        self.assertIn("--property=RemainAfterExit=yes",args)
        self.assertEqual(args[-4:],[NAME,"12","34","/var/lib/ef-abcdefgh"])

    def test_cgroup_identity_binding(self):
        info=SimpleNamespace(st_mode=stat.S_IFDIR,st_uid=0,st_dev=12,st_ino=34)
        w.e.validate_identity(info,*IDENTITY)
        with self.assertRaises(RuntimeError):
            w.e.validate_identity(info,12,35)

    def evidence(self):
        return ({"seconds":75,"armedMonotonicNs":10**9,"confirmedMonotonicNs":2*10**9},
            {"crashMonotonicNs":5*10**9,"twoFreshChallenges":True},
            {"scope":NAME,"device":12,"inode":34,"killMonotonicNs":76*10**9,
             "populatedBeforeKill":True,"emptyAfterKill":True})

    def test_actual_elapsed_and_post_crash_observation(self):
        self.assertEqual(w.verify_receipt(*self.evidence(),NAME,IDENTITY,6*10**9),75)

    def test_false_early_late_or_foreign_watchdog_rejected(self):
        for change in ({"killMonotonicNs":75*10**9},{"killMonotonicNs":97*10**9},
                       {"inode":35},{"scope":"other"},{"populatedBeforeKill":False},
                       {"emptyAfterKill":False}):
            armed,proof,receipt=self.evidence()
            with self.assertRaises(RuntimeError):
                w.verify_receipt(armed,proof,{**receipt,**change},NAME,IDENTITY,6*10**9)

    def test_no_observation_after_kill_or_missing_challenge(self):
        with self.assertRaises(RuntimeError):
            w.verify_receipt(*self.evidence(),NAME,IDENTITY,77*10**9)
        armed,proof,receipt=self.evidence()
        with self.assertRaises(RuntimeError):
            w.verify_receipt(armed,{**proof,"twoFreshChallenges":False},receipt,NAME,IDENTITY,6*10**9)

if __name__=="__main__":
    unittest.main()
