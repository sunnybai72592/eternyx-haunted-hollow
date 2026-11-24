import importlib.util
import io
import os
from unittest.mock import patch
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("proof", pathlib.Path(__file__).resolve().parents[1] / "scripts/labs-runner-kernel-provenance.py")
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

PKG = "linux-image-6.17.0-1001-azure"
VER = "6.17.0-1001.1"
def record(sha="a"*64, size="100", name="pool/main/l/linux/test.deb"):
    return f"Package: {PKG}\nVersion: {VER}\nArchitecture: amd64\nFilename: {name}\nSHA256: {sha}\nSize: {size}\n"

class ProvenanceTest(unittest.TestCase):
    def test_exact_metadata_and_duplicate_identical_pockets(self):
        self.assertEqual(p.metadata_pin(record()+"\n"+record(), PKG, VER), ("a"*64,100))

    def test_missing_or_conflicting_metadata_refused(self):
        for value in ("", f"Package: {PKG}\nVersion: {VER}\nArchitecture: amd64\n",
                      record()+"\n"+record("b"*64), record(size="0"),
                      record(name="pool/../test.deb"), record(sha="bad")):
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                p.metadata_pin(value, PKG, VER)

    def test_exact_version_and_package_owner(self):
        p.validate_identity("6.17.0-1001-azure",PKG,VER,"amd64")
        for args in (("6.17.0-1001-azure","other",VER,"amd64"),
                     ("../bad",PKG,VER,"amd64"),
                     ("6.17.0-1001-azure",PKG,"--bad","amd64")):
            with self.assertRaises(RuntimeError):
                p.validate_identity(*args)

    def test_deb_digest_and_size_required(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/"test.deb"
            path.write_bytes(b"test")
            p.verify_deb(path,(p.digest(path),4))
            with self.assertRaises(RuntimeError):
                p.verify_deb(path,("a"*64,4))
            with self.assertRaises(RuntimeError):
                p.verify_deb(path,(p.digest(path),5))

    def test_tar_member_regular_unique_exact(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/"data.tar"
            for count,link in ((1,False),(0,False),(2,False),(1,True)):
                with tarfile.open(path,"w") as tar:
                    for _ in range(count):
                        entry=tarfile.TarInfo("./boot/vmlinuz-6.17")
                        if link:
                            entry.type=tarfile.SYMTYPE
                            entry.linkname="/etc/shadow"
                            tar.addfile(entry)
                        else:
                            entry.size=4
                            tar.addfile(entry,io.BytesIO(b"test"))
                if count==1 and not link:
                    self.assertEqual(p.kernel_digest_from_tar(path,"6.17"),
                        p.hashlib.sha256(b"test").hexdigest())
                else:
                    with self.assertRaises(RuntimeError):
                        p.kernel_digest_from_tar(path,"6.17")

    def test_no_silent_repin_even_if_both_match(self):
        p.verify_kernel_hashes(p.PIN,p.PIN)
        for pair in (("a"*64,"a"*64),(p.PIN,"a"*64),("a"*64,p.PIN)):
            with self.assertRaises(RuntimeError):
                p.verify_kernel_hashes(*pair)

    def test_primary_fingerprint_not_subkey_or_uid(self):
        def row(kind,value):
            return ":".join([kind]+[""]*8+[value])
        pin=p.ARCHIVE_FINGERPRINT
        other="A"*40
        listing="\n".join(["pub:",row("fpr",other),"sub:",row("fpr",pin)])
        self.assertEqual(p.primary_fingerprints(listing),{other})
        self.assertEqual(p.primary_fingerprints("pub:\n"+row("fpr",pin)),{pin})

    def test_public_keyring_snapshot_accepts_bounded_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            work=pathlib.Path(d)
            source=work/"source.gpg"
            source.write_bytes(b"public key fixture")
            source.chmod(0o666)
            alias=work/"alias.gpg"
            alias.symlink_to(source)
            self.assertEqual(p.read_public_keyring(alias),b"public key fixture")
            with self.assertRaises(RuntimeError):
                p.read_public_keyring(work)
            source.write_bytes(b"x"*(p.MAX_KEYRING+1))
            with self.assertRaises(RuntimeError):
                p.read_public_keyring(alias)

    def test_nonregular_keyring_rejected_before_stream_and_fd_closed(self):
        with tempfile.TemporaryDirectory() as d:
            work=pathlib.Path(d)
            fifo=work/"keyring.fifo"
            os.mkfifo(fifo)
            for source in (work,fifo):
                with self.subTest(source=source):
                    fd=os.open(source,os.O_RDONLY|os.O_NONBLOCK|os.O_CLOEXEC)
                    with patch.object(p.os,"open",return_value=fd), \
                         patch.object(p.os,"fdopen",side_effect=AssertionError("nonregular stream opened")):
                        with self.assertRaisesRegex(RuntimeError,"bounded regular file"):
                            p.read_public_keyring(source)
                    with self.assertRaises(OSError):
                        os.fstat(fd)

    def test_regular_keyring_descriptor_closed_on_success(self):
        with tempfile.TemporaryDirectory() as d:
            source=pathlib.Path(d)/"key.gpg"
            source.write_bytes(b"fixture")
            fd=os.open(source,os.O_RDONLY|os.O_CLOEXEC)
            with patch.object(p.os,"open",return_value=fd):
                self.assertEqual(p.read_public_keyring(source),b"fixture")
            with self.assertRaises(OSError):
                os.fstat(fd)

    def test_archive_keyring_requires_published_fingerprint(self):
        with tempfile.TemporaryDirectory() as d:
            work=pathlib.Path(d)
            source=work/"source.gpg"
            source.write_bytes(b"public key fixture")
            for i,fpr in enumerate(("A"*40,p.ARCHIVE_FINGERPRINT)):
                stage=work/str(i)
                stage.mkdir()
                listing="pub:\n"+":".join(["fpr"]+[""]*8+[fpr])
                with patch.object(p,"command",return_value=listing):
                    if i==0:
                        with self.assertRaisesRegex(RuntimeError,"primary fingerprint missing"):
                            p.prepare_archive_keyring(stage,source)
                    else:
                        key=p.prepare_archive_keyring(stage,source)
                        self.assertEqual(key.read_bytes(),source.read_bytes())
                        self.assertEqual(key.stat().st_mode&0o777,0o600)

    def test_apt_has_only_fixed_authenticated_sources(self):
        with tempfile.TemporaryDirectory() as d:
            work=pathlib.Path(d)
            keyring=work/"archive.gpg"
            env=p.apt_environment(work,keyring)
            conf=pathlib.Path(env["APT_CONFIG"]).read_text()
            self.assertIn('APT::Get::AllowUnauthenticated "false";',conf)
            self.assertIn('Acquire::Check-Valid-Until "true";',conf)
            self.assertIn('Dir::State::status "/dev/null";',conf)
            self.assertIn('Dir::Etc::SourceParts "-";',conf)
            sources=(work/"sources.list").read_text().splitlines()
            self.assertEqual(len(sources),3)
            self.assertTrue(all(f"signed-by={keyring},{p.ARCHIVE_FINGERPRINT}!" in x and
                                "https://archive.ubuntu.com/ubuntu" in x for x in sources))

if __name__ == "__main__":
    unittest.main()
