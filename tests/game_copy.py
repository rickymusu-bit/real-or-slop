"""Stand-in for the browser encoder of the game copies (src/game-copy.ts, shared/game-copy.ts): orientation applied, crop
to the nearest common format (centred by default), long side at most 1536 px, WebP quality 0.85, rounding as Math.round."""
import io
import math
from PIL import Image, ImageOps

FORMATS = ['3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '1:1']
def js_round(value): return math.floor(value + 0.5)
def ratio(fmt):
    w, h = fmt.split(':'); return int(w) / int(h)
def nearest_format(width, height):
    target = math.log(width / height); best = FORMATS[0]
    for f in FORMATS:
        if abs(math.log(ratio(f)) - target) < abs(math.log(ratio(best)) - target): best = f
    return best
def format_width(fmt, height): return js_round(height * ratio(fmt))
def centred_crop(width, height, fmt=None):
    fmt = fmt or nearest_format(width, height)
    h = min(height, math.floor(width / ratio(fmt)))
    while h > 1 and format_width(fmt, h) > width: h -= 1
    h = max(h, 1); w = format_width(fmt, h)
    return {'x': (width - w) // 2, 'y': (height - h) // 2, 'width': w, 'height': h, 'format': fmt}
def copy_dimensions(crop):
    r = ratio(crop['format'])
    if r >= 1:
        w = min(crop['width'], 1536); return w, max(1, js_round(w / r))
    h = min(crop['height'], 1536); return max(1, js_round(h * r)), h
def view_width(height): return js_round(height * 4 / 5)
def centred_view(width, height):
    h = min(height, math.floor(width / 0.8))
    while h > 1 and view_width(h) > width: h -= 1
    h = max(h, 1)
    return {'x': (width - view_width(h)) // 2, 'y': (height - h) // 2, 'height': h}
def game_copy(source, crop=None, fmt='WEBP', size=None):
    """The copy of `source` (bytes) along `crop`; `size` forces wrong dimensions, `fmt` a wrong format, for the refusals."""
    picture = ImageOps.exif_transpose(Image.open(io.BytesIO(source))).convert('RGB')
    frame = crop or centred_crop(*picture.size)
    picture = picture.crop((frame['x'], frame['y'], frame['x'] + frame['width'], frame['y'] + frame['height']))
    picture = picture.resize(size or copy_dimensions(frame))
    out = io.BytesIO(); picture.save(out, fmt, quality=85); return out.getvalue()
def crop_query(crop, view=None):
    query = f"?crop={crop['x']},{crop['y']},{crop['width']},{crop['height']},{crop['format']}"
    return query + (f"&view={view['x']},{view['y']},{view['height']}" if view else '')
