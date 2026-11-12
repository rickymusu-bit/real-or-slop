"""v2.0.0, 2026-11-12T08:00:00Z: stand-in for the browser encoder of the 4:5 game copies (src/game-copy.v2.0.0.ts,
shared/game-copy.v2.0.0.ts) for the integration tests: orientation applied, frame cut (centred by default), scaled to at most
2048 px high, WebP quality 0.85. Rounding as JavaScript's Math.round (half up)."""
import io
from PIL import Image, ImageOps

def js_round(value): return int(value + 0.5)
def crop_width(height): return js_round(height * 4 / 5)
def centred_crop(width, height):
    frame = min(height, int(width / 0.8))
    while frame > 1 and crop_width(frame) > width: frame -= 1
    return {'x': (width - crop_width(frame)) // 2, 'y': (height - frame) // 2, 'height': frame}
def copy_dimensions(crop):
    height = min(crop['height'], 2048)
    return crop_width(height), height
def game_copy(source, crop=None, fmt='WEBP', size=None):
    """The 4:5 copy of `source` (bytes) along `crop`; `size` forces wrong dimensions, `fmt` a wrong format, for the refusals."""
    picture = ImageOps.exif_transpose(Image.open(io.BytesIO(source))).convert('RGB')
    frame = crop or centred_crop(*picture.size)
    picture = picture.crop((frame['x'], frame['y'], frame['x'] + crop_width(frame['height']), frame['y'] + frame['height']))
    picture = picture.resize(size or copy_dimensions(frame))
    out = io.BytesIO(); picture.save(out, fmt, quality=85); return out.getvalue()
def crop_query(crop): return f"?crop={crop['x']},{crop['y']},{crop['height']}"
