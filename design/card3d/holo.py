# The holographic face: a soft, flowing pearl gradient (pink, lilac, sky, butter, mint) like foil
# under studio light. Smooth value noise, domain-warped twice, mapped through a pastel palette.
import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(7)
W, H = 1024, 1506

def noise(w, h, cells, seed):
    r = np.random.default_rng(seed)
    g = r.random((cells[1] + 3, cells[0] + 3))
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
wx = noise(W, H, (3, 4), 1) - 0.5
wy = noise(W, H, (3, 4), 2) - 0.5
x2 = np.clip(xx + wx * 260, 0, W - 1).astype(int)
y2 = np.clip(yy + wy * 340, 0, H - 1).astype(int)
base = noise(W, H, (1, 1), 3)[y2, x2]
base2 = noise(W, H, (4, 5), 4)[y2, x2]
t = base * 0.5 + base2 * 0.05 + (xx / W) * 0.25 + (1 - yy / H) * 0.5
lo, hi = np.percentile(t, [2, 98]); t = np.clip((t - lo) / (hi - lo), 0, 1)

# colours of the product on the card. Claude: its warm clay, coral, peach, sand gold and cream.
# (Another product gets its own list here.)
PALETTES = {
    'claude': [
        [232, 200, 140],  # sand gold
        [246, 236, 220],  # cream
        [243, 176, 150],  # peach
        [226, 128, 96],   # clay
        [240, 196, 178],  # blush
        [248, 240, 230],  # ivory
    ],
    # ChatGPT: OpenAI's own green (#10A37F) with its deeper and softer tints, on white
    'chatgpt': [
        [214, 243, 232],  # soft green #D6F3E8
        [250, 250, 250],  # off white #FAFAFA
        [116, 170, 156],  # sage #74AA9C
        [16, 163, 127],   # ChatGPT green #10A37F
        [26, 127, 100],   # deep green #1A7F64
        [255, 255, 255],  # white
    ],
    # Grok: no colour, by design: black, greys and white, like polished chrome
    'grok': [
        [229, 231, 235],  # light grey #E5E7EB
        [255, 255, 255],  # white
        [156, 163, 175],  # grey #9CA3AF
        [26, 26, 26],     # near black #1A1A1A
        [213, 217, 226],  # border grey #D5D9E2
        [249, 248, 246],  # warm white #F9F8F6
    ],
}
import sys
PRODUCT = sys.argv[1] if len(sys.argv) > 1 else 'claude'
pal = np.array(PALETTES[PRODUCT], dtype=np.float32)
pos = t * (len(pal) - 1)
i = np.floor(pos).astype(int); f = (pos - i)[..., None]
f = f * f * (3 - 2 * f)
col = pal[i] * (1 - f) + pal[np.minimum(i + 1, len(pal) - 1)] * f
# a few brighter folds, like light caught in the foil
fold = np.clip(1 - np.abs(noise(W, H, (2, 2), 5)[y2, x2] - 0.5) * 5, 0, 1) ** 3
col = col + fold[..., None] * 28
m = col.mean(-1, keepdims=True); col = m + (col - m) * 1.35
col = np.clip(col, 0, 255).astype(np.uint8)
im = Image.fromarray(col).filter(ImageFilter.GaussianBlur(50))
im.save(f'holo-{PRODUCT}.png')
print(im.size)
