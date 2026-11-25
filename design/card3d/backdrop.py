# The studio backdrop: near-black with soft diagonal light beams from the top left and a faint grid.
import numpy as np
from PIL import Image, ImageFilter
W, H = 1600, 2000
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
img = np.zeros((H, W), np.float32) + 0.028
# beams: bands along a diagonal, fading down the frame
d = (xx * 0.62 + yy * 0.78)
for c, w, a in ((520, 70, 0.10), (760, 40, 0.07), (980, 110, 0.06), (1300, 50, 0.05)):
    img += a * np.exp(-((d - c) / w) ** 2) * np.clip(1 - yy / (H * 0.75), 0, 1)
# vignette
r = np.hypot((xx - W * 0.5) / W, (yy - H * 0.45) / H)
img *= np.clip(1.15 - r * 1.1, 0.35, 1)
# faint grid, right half only
grid = ((xx % 90 < 2) | (yy % 90 < 2)).astype(np.float32) * 0.012 * np.clip((xx / W - 0.55) * 3, 0, 1)
img += grid
rgb = np.stack([img * 0.95, img * 0.95, img * 1.08], -1)
Image.fromarray((np.clip(rgb, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)).save('backdrop.png')
