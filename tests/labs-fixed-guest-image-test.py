import hashlib
import json
import pathlib
import subprocess
import tempfile
import unittest
import importlib.util

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("build",ROOT/"scripts/labs-build-fixed-guest.py")
b=importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

class FixedGuestImageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix="eternyx-guest-test-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.work=pathlib.Path(cls.temp.name)
        cls.image=cls.work/"rootfs.ext4"
        cls.evidence=b.build(cls.image)
        cls.binary=cls.work/"init"
        b.command("/usr/sbin/debugfs","-R",f"dump /sbin/init {cls.binary}",str(cls.image))
        cls.binary.chmod(0o700)

    def run_probe(self,payload):
        return subprocess.run([str(self.binary),"--self-test"],input=payload,
                              stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)

    def request(self):
        return {"protocol":"eternyx-guest-smoke-v1",
                "sessionId":"123e4567-e89b-42d3-a456-426614174001","nonce":"ab"*32}

    def encode(self,value):
        return (json.dumps(value,separators=(",",":"))+"\n").encode()

    def test_real_ext4_image_and_static_init(self):
        self.assertEqual(self.image.stat().st_size,b.SIZE)
        self.assertEqual(b.digest(self.image),self.evidence["rootfsSha256"])
        self.assertEqual(b.digest(self.binary),self.evidence["initSha256"])
        self.assertNotIn(b"INTERP",b.command("/usr/bin/readelf","-l",str(self.binary)))

    def test_compiled_service_matches_existing_digest_contract(self):
        req=self.request()
        run=self.run_probe(self.encode(req))
        self.assertEqual(run.returncode,0,run.stderr)
        expected=hashlib.sha256(("\n".join(req.values())).encode()).hexdigest()
        self.assertEqual(json.loads(run.stdout),{**req,"digest":expected,"guestHealthy":True})

    def test_invalid_requests_fail_without_output(self):
        req=self.request()
        for data in (b"",b"x"*513,self.encode({**req,"nonce":"AB"*32}),
                     self.encode({**req,"sessionId":"bad"}),
                     self.encode({**req,"extra":1}),self.encode(req)+b"extra",
                     self.encode(req)[:-1],self.encode({**req,"protocol":"wrong"})):
            run=self.run_probe(data)
            self.assertNotEqual(run.returncode,0)
            self.assertEqual(run.stdout,b"")

    def test_new_nonce_changes_response(self):
        a=self.request()
        c={**a,"nonce":"cd"*32}
        self.assertNotEqual(json.loads(self.run_probe(self.encode(a)).stdout)["digest"],
                            json.loads(self.run_probe(self.encode(c)).stdout)["digest"])

    def test_existing_output_and_nonprivate_parent_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"already exists"):
            b.build(self.image)
        other=self.work/"other"
        other.mkdir(mode=0o755)
        with self.assertRaisesRegex(RuntimeError,"private"):
            b.build(other/"rootfs.ext4")

    def test_build_evidence_never_claims_live_acceptance(self):
        for name in ("guestBootVerified","guestVsockVerified","independentImageApprovalVerified",
                     "hardwareAcceptanceVerified","providerActivationAllowed","productionReleaseReady"):
            self.assertFalse(self.evidence[name],name)

if __name__=="__main__":
    unittest.main()
