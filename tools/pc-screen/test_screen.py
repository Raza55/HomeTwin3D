import io
import unittest
from unittest.mock import Mock
from PIL import Image
import screen


class ScreenTests(unittest.TestCase):
    def test_noisy_4k_frame_is_small_jpeg(self):
        source = Image.effect_noise((3840, 2160), 100).convert('RGB')
        data = screen.encode_image(source)
        self.assertLessEqual(len(data), 200_000)
        image = Image.open(io.BytesIO(data))
        self.assertEqual(image.format, 'JPEG')
        self.assertEqual(image.size, (1920, 1080))

    def test_portrait_and_no_upscale(self):
        data = screen.encode_image(Image.new('RGB', (1080, 1920)))
        width, height = Image.open(io.BytesIO(data)).size
        self.assertEqual(height, 1080)
        self.assertLessEqual(abs(width - height * 1080 / 1920), 1)
        data = screen.encode_image(Image.new('RGB', (320, 180)))
        self.assertEqual(Image.open(io.BytesIO(data)).size, (320, 180))

    def test_payload_has_no_base64_and_is_not_retained(self):
        client = Mock()
        client.publish.return_value.rc = 0
        client.publish.return_value.is_published.return_value = True
        self.assertTrue(screen.send_frame(client, Image.new('RGB', (640, 360))))
        args, kwargs = client.publish.call_args_list[0]
        self.assertTrue(args[1].startswith(b'\xff\xd8'))
        self.assertEqual(kwargs, {'qos': 0, 'retain': False})
        self.assertNotIn('image_encoding', screen.discovery())
        self.assertNotIn('encoding', screen.discovery())

    def test_failed_send_does_not_announce_online(self):
        client = Mock()
        client.publish.return_value.rc = 4
        self.assertFalse(screen.send_frame(client, Image.new('RGB', (20, 20))))
        self.assertEqual(client.publish.call_count, 1)

    def test_oversized_image_never_published(self):
        from unittest.mock import patch
        client = Mock()
        with patch.object(screen, 'MAX_BYTES', 1):
            with self.assertRaises(ValueError):
                screen.send_frame(client, Image.new('RGB', (20, 20)))
        client.publish.assert_not_called()


if __name__ == '__main__':
    unittest.main()
