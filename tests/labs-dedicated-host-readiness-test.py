import importlib.util
import pathlib
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import stat

spec=importlib.util.spec_from_file_location("host",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-dedicated-host-readiness.py")
h=importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)

class DedicatedHostReadinessTest(unittest.TestCase):
    def test_explicit_local_approval_only(self):
        args=["--inspect",h.APPROVAL]
        h.authorize(args,{},"Linux",0)
        for a,e,s,u in (([],{},"Linux",0),(args,{},"Linux",1000),
                        (args,{},"Windows",0),(args,{"CI":"true"},"Linux",0),
                        (args,{"GITHUB_ACTIONS":"true"},"Linux",0),
                        (args,{"RUNNER_ENVIRONMENT":"github-hosted"},"Linux",0),
                        (args,{"ETERNYX_REMOTE_LAB_ENABLED":"true"},"Linux",0),
                        (args,{"ETERNYX_FIRECRACKER_HOST_EXECUTION":"operator_approved"},"Linux",0)):
            with self.assertRaises(RuntimeError):
                h.authorize(a,e,s,u)

    def test_virtualization_class_no_false_physical_claim(self):
        self.assertEqual(h.virtualization_class(1,"none"),"none-detected")
        self.assertEqual(h.virtualization_class(0,"kvm"),"virtualized")
        for code,output in ((0,"none"),(1,"kvm"),(2,"none"),(0,"bad string")):
            with self.assertRaises(RuntimeError):
                h.virtualization_class(code,output)

    def test_cgroup_checks_both_available_and_enabled(self):
        self.assertTrue(h.controllers_available("cpu memory pids io","cpu memory pids"))
        self.assertFalse(h.controllers_available("cpu memory pids","cpu pids"))
        self.assertFalse(h.controllers_available("cpu pids","cpu memory pids"))

    def test_kvm_only_api_version_and_descriptor_closed(self):
        with patch.object(h.os,"open",return_value=123), \
             patch.object(h.os,"fstat",return_value=SimpleNamespace(st_mode=stat.S_IFCHR)), \
             patch.object(h.fcntl,"ioctl",return_value=12) as ioctl, \
             patch.object(h.os,"close") as close:
            self.assertEqual(h.inspect_kvm(),12)
            ioctl.assert_called_once_with(123,h.KVM_GET_API_VERSION,0)
            close.assert_called_once_with(123)

    def test_kvm_noncharacter_and_wrong_version_fail_closed(self):
        for mode,version in ((stat.S_IFREG,12),(stat.S_IFCHR,11)):
            with patch.object(h.os,"open",return_value=123), \
                 patch.object(h.os,"fstat",return_value=SimpleNamespace(st_mode=mode)), \
                 patch.object(h.fcntl,"ioctl",return_value=version) as ioctl, \
                 patch.object(h.os,"close") as close:
                with self.assertRaises(RuntimeError):
                    h.inspect_kvm()
                if mode==stat.S_IFREG:
                    ioctl.assert_not_called()
                close.assert_called_once_with(123)

    def test_all_capabilities_never_authorize_hardware_or_release(self):
        good=h.review_result("none-detected",12,True,True,True,True)
        self.assertTrue(good["readOnlyCapabilityChecksPassed"])
        for key in ("dedicatedHostOwnershipIndependentlyVerified",
                    "guestArtifactsVerifiedOnDedicatedHost","guestBooted",
                    "fullWatchdogExpiryVerified","hardwareAcceptanceVerified",
                    "providerActivationAllowed","productionReleaseReady"):
            self.assertFalse(good[key],key)
        for args in ((11,True,True,True,True),(12,False,True,True,True),
                     (12,True,False,True,True),(12,True,True,False,True),
                     (12,True,True,True,False)):
            self.assertFalse(h.review_result("none-detected",*args)["readOnlyCapabilityChecksPassed"])

if __name__=="__main__":
    unittest.main()
