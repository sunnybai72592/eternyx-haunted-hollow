"""Focused cancel/abort and fail-closed tests of standalone portable CPU launcher."""
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock,patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import launch_portable_video as app


class OfflinePortableRunnerTests(unittest.TestCase):
    def setUp(self):
        self.work=tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        self.root=Path(self.work.name)
        self.good={
            "result":"ready","board_sha256":"a"*64,
            "frames":16,"seconds":1,"shots":1,"source_count":1,
            "profile":"landscape","quality":"standard","local_only":True,
        }

    def test_preflight_never_overwrites_existing_finished_output(self):
        (self.root/app.OUTPUT).mkdir()
        with self.assertRaisesRegex(ValueError,"already exists"):
            app.preflight(self.root)
        self.assertTrue((self.root/app.OUTPUT).is_dir())

    def test_reject_symlinked_root_and_renderer(self):
        alias=self.root.parent/(self.root.name+"-alias")
        try:
            alias.symlink_to(self.root,target_is_directory=True)
        except (OSError,NotImplementedError):
            self.skipTest("Creating symlinks not supported")
        self.addCleanup(lambda:alias.unlink(missing_ok=True))
        with self.assertRaisesRegex(ValueError,"real extracted"):
            app.preflight(alias)
        (self.root/"render_video_timeline.py").symlink_to(self.root/"not-a-file")
        with self.assertRaisesRegex(ValueError,"symlinked"):
            app.preflight(self.root)

    def test_missing_or_nonfinite_project_metadata_denied(self):
        with self.assertRaises(ValueError):
            app.safe_json(self.root/"absent.json")
        bad=self.root/"damaged.json"
        bad.write_text("not json")
        with self.assertRaisesRegex(ValueError,"Invalid"):
            app.safe_json(bad)
        bad.write_bytes(b"x"*(app.MAX_BUNDLE_BYTES+1))
        with self.assertRaisesRegex(ValueError,"too large"):
            app.safe_json(bad)

    def test_no_implicit_paid_provider_or_remote_program_execution(self):
        for script in ("launch_portable_video.py","render_video_timeline.py"):
            code=(Path(__file__).resolve().parents[1]/script).read_text()
            self.assertNotIn("supabase.functions.invoke",code)
            self.assertNotIn("api.groq.com",code)
        with patch("launch_portable_video.shutil.which",return_value=None):
            with self.assertRaisesRegex(ValueError,"is missing"):
                app.check_program("ffmpeg",["-encoders"],b"libx264")

    def test_user_cancel_stops_child_and_cleans_temporary_directory(self):
        cancelled=threading.Event()
        def callback(stage):
            if stage.startswith("Rendering"):
                cancelled.set()
        proc=Mock()
        proc.poll.return_value=None
        with patch("launch_portable_video.preflight",return_value=self.good),\
             patch("launch_portable_video.subprocess.Popen",return_value=proc) as launch,\
             patch("launch_portable_video.stop_group") as stop:
            with self.assertRaisesRegex(ValueError,"cancelled"):
                app.run(self.root,on_stage=callback,cancel=cancelled)
        self.assertTrue(launch.called)
        self.assertGreaterEqual(stop.call_count,1)
        self.assertFalse(list(self.root.glob(".eternyx-local-video-*")))
        self.assertFalse((self.root/app.OUTPUT).exists())

    def test_renderer_error_cannot_publish_partial_output(self):
        process=Mock()
        process.poll.return_value=1
        process.returncode=1
        process.communicate.return_value=(b"",b"offline ffmpeg failed")
        with patch("launch_portable_video.preflight",return_value=self.good),\
             patch("launch_portable_video.subprocess.Popen",return_value=process):
            with self.assertRaisesRegex(ValueError,"offline ffmpeg failed"):
                app.run(self.root)
        self.assertFalse(list(self.root.glob(".eternyx-local-video-*")))
        self.assertFalse((self.root/app.OUTPUT).exists())

    def test_failed_receipt_never_promotes_fake_video(self):
        proc=Mock()
        proc.poll.return_value=0
        proc.returncode=0
        proc.communicate.return_value=(b"{}",b"")
        def fake_spawn(command,**_):
            folder=Path(command[command.index("--output")+1])
            folder.mkdir()
            (folder/"manifest.json").write_text(json.dumps({
                "version":2,"type":"local CPU video editing",
                "model_generation":False,"storyboard_sha256":"b"*64,
                "total_frames":16,"profile":"landscape","quality":"standard",
            }))
            return proc
        with patch("launch_portable_video.preflight",return_value=self.good),\
             patch("launch_portable_video.subprocess.Popen",side_effect=fake_spawn):
            with self.assertRaisesRegex(ValueError,"receipt conflicts"):
                app.run(self.root)
        self.assertFalse((self.root/app.OUTPUT).exists())
        self.assertFalse(list(self.root.glob(".eternyx-local-video-*")))


if __name__=="__main__":
    unittest.main()
