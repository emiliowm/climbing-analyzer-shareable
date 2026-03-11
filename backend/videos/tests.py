from django.test import SimpleTestCase
import numpy as np

from videos.models import Video
from videos.tasks import LOCK_EXPIRE, get_local_storage_path, to_json_compatible


class VideoContractTests(SimpleTestCase):
    def test_status_choices_match_processing_state_machine(self):
        statuses = [status for status, _ in Video.STATUS_CHOICES]
        self.assertEqual(statuses, ["uploading", "processing", "complete", "error"])

    def test_lock_expire_has_safety_buffer(self):
        self.assertGreaterEqual(LOCK_EXPIRE, 30 * 60)

    def test_ninja_openapi_route_is_exposed(self):
        response = self.client.get("/api/openapi.json")
        self.assertEqual(response.status_code, 200)

    def test_video_stream_route_is_exposed_in_openapi(self):
        response = self.client.get("/api/openapi.json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("/api/videos/{video_id}/stream", response.json()["paths"])

    def test_get_local_storage_path_handles_backends_without_absolute_path(self):
        class FileWithoutPathSupport:
            @property
            def path(self):
                raise NotImplementedError("no absolute path")

        self.assertIsNone(get_local_storage_path(FileWithoutPathSupport()))

    def test_to_json_compatible_converts_numpy_scalars_and_arrays(self):
        payload = {
            "flag": np.bool_(True),
            "score": np.float32(12.5),
            "count": np.int64(7),
            "coords": np.array([np.float32(1.2), np.float32(3.4)]),
        }

        normalized = to_json_compatible(payload)
        self.assertEqual(normalized["flag"], True)
        self.assertEqual(normalized["score"], 12.5)
        self.assertEqual(normalized["count"], 7)
        self.assertEqual(normalized["coords"], [1.2000000476837158, 3.4000000953674316])
