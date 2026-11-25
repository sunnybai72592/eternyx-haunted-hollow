import hashlib
import importlib.util
import json
import pathlib
import socket
import tempfile
import time
import unittest

spec=importlib.util.spec_from_file_location("live",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-runner-fixed-vsock.py")
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)

class LiveContractTest(unittest.TestCase):
    def test_fixed_readonly_disk_and_no_nics(self):
        for modular in (False,True):
            config=v.config(modular)
            self.assertEqual(config["network-interfaces"],[])
            self.assertEqual(config["vsock"],{"guest_cid":3,"uds_path":"/v.sock"})
            self.assertEqual(config["drives"],[{"drive_id":"rootfs","path_on_host":"/rootfs.ext4",
                            "is_root_device":True,"is_read_only":True}])
            self.assertEqual("initrd_path" in config["boot-source"],modular)
            self.assertEqual("nomodules" in config["boot-source"]["boot_args"],not modular)

    def test_exact_fresh_challenge(self):
        session="123e4567-e89b-42d3-a456-426614174001"
        nonce="ab"*32
        proof={"protocol":v.PROTOCOL,"sessionId":session,"nonce":nonce,
               "digest":hashlib.sha256((v.PROTOCOL+"\n"+session+"\n"+nonce).encode()).hexdigest(),
               "guestHealthy":True}
        self.assertEqual(v.verify_response(json.dumps(proof).encode(),session,nonce),proof["digest"])
        for patch in ({"nonce":"cd"*32},{"guestHealthy":1},{"digest":"0"*64},{"extra":True}):
            with self.assertRaises(RuntimeError):
                v.verify_response(json.dumps({**proof,**patch}).encode(),session,nonce)

    def test_duplicate_json_refused(self):
        with self.assertRaisesRegex(RuntimeError,"duplicate"):
            v.exact_json(b'{"nonce":"a","nonce":"b"}')

    def test_socket_line_bounds_and_deadline(self):
        a,b=socket.socketpair()
        with a,b:
            b.sendall(b"OK 3\n")
            self.assertEqual(v.read_line(a,time.monotonic()+1,64),b"OK 3")
            b.sendall(b"x"*8)
            with self.assertRaisesRegex(RuntimeError,"too long"):
                v.read_line(a,time.monotonic()+1,8)

    def test_copy_rejects_symlink_and_oversize(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory)
            source=work/"source"
            source.write_bytes(b"fixture")
            v.copy_bounded(source,work/"target",7)
            self.assertEqual((work/"target").read_bytes(),b"fixture")
            with self.assertRaises(RuntimeError):
                v.copy_bounded(source,work/"large",6)
            alias=work/"alias"
            alias.symlink_to(source)
            with self.assertRaises(OSError):
                v.copy_bounded(alias,work/"other",7)

    def test_wrong_kernel_refused_before_boot(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory)
            (work/"bundle.json").write_text(json.dumps({"schema":"eternyx-fixed-guest-boot-bundle-v1",
                "bootBundlePrepared":True,"kernelSha256":v.j.OBSERVED_KERNEL}))
            (work/"kernel").write_bytes(b"wrong")
            with self.assertRaisesRegex(RuntimeError,"kernel mismatch"):
                v.verify_bundle(work)

if __name__=="__main__":
    unittest.main()
