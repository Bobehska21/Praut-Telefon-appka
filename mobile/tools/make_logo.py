"""
Logo variants built from the letters P E L Y O S used as shapes (overlapped, rotated, merged), so the
word itself is not readable. Needs Pillow:
  python3 -m venv .venv && .venv/bin/pip install pillow
  .venv/bin/python tools/make_logo.py assets/branding            # draws the three variants + a contact sheet
  .venv/bin/python tools/make_logo.py assets/branding use a assets/images   # writes the app icons from variant "a"
"""
import math
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

WORD = "PELYOS"
IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
BLACK = (11, 8, 9, 255)
RED_TOP = (255, 77, 84)
RED_BOT = (200, 20, 30)
DEEP = (120, 8, 16)
W = 2048          # working size; every output is downscaled from it for clean edges


def letter(ch, px, font=IMPACT):
    """White letter `ch` centred on a transparent-black square tile."""
    tile = Image.new("L", (px * 2, px * 2), 0)
    d = ImageDraw.Draw(tile)
    d.text((px, px), ch, font=ImageFont.truetype(font, px), fill=255, anchor="mm")
    return tile


def place(canvas, tile, centre, angle, mode="union"):
    """Rotate `tile` by `angle` degrees (counter-clockwise) and merge it into `canvas` around `centre`."""
    t = tile.rotate(angle, resample=Image.BICUBIC, expand=True)
    layer = Image.new("L", canvas.size, 0)
    layer.paste(t, (int(centre[0] - t.width / 2), int(centre[1] - t.height / 2)))
    if mode == "xor":
        return ImageChops.difference(canvas, layer.point(lambda v: 255 if v > 127 else 0))
    return ImageChops.lighter(canvas, layer)


def polar(r, deg, c=W / 2):
    a = math.radians(deg)
    return (c + r * math.cos(a), c + r * math.sin(a))


def variant_a():
    """Rosette: six letters spun around a centre like petals; the overlaps fuse them into one bloom."""
    m = Image.new("L", (W, W), 0)
    for k, ch in enumerate(WORD):
        # big letters spun around one point: they overlap so much that only the fused outline remains
        m = place(m, letter(ch, 860), polar(215, k * 60 - 90), -k * 60 + 24)
    return m


def variant_b():
    """Crest: letters piled up on one side, then mirrored, giving a symmetrical mask / wing emblem."""
    half = Image.new("L", (W, W), 0)
    spec = [  # letter, centre (x, y), rotation
        ("P", (W * 0.34, W * 0.30), -28),
        ("E", (W * 0.30, W * 0.55), 64),
        ("L", (W * 0.40, W * 0.74), 12),
        ("Y", (W * 0.44, W * 0.46), 150),
        ("O", (W * 0.40, W * 0.33), 0),
        ("S", (W * 0.43, W * 0.62), -70),
    ]
    for ch, c, a in spec:
        half = place(half, letter(ch, 700), c, a)
    return ImageChops.lighter(half, half.transpose(Image.FLIP_LEFT_RIGHT))


def variant_c():
    """Badge: a ring around six letters stacked on one centre; where they overlap an even number of
    times the shape is cut out, which turns the pile into an intricate monogram."""
    m = Image.new("L", (W, W), 0)
    for k, ch in enumerate(WORD):
        m = place(m, letter(ch, 1450), (W / 2, W / 2), k * 30, mode="xor")
    clip = Image.new("L", (W, W), 0)
    ImageDraw.Draw(clip).ellipse([W * 0.17, W * 0.17, W * 0.83, W * 0.83], fill=255)
    m = ImageChops.multiply(m, clip)
    ring = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(ring)
    d.ellipse([W * 0.12, W * 0.12, W * 0.88, W * 0.88], fill=255)
    d.ellipse([W * 0.155, W * 0.155, W * 0.845, W * 0.845], fill=0)
    return ImageChops.lighter(m, ring)


VARIANTS = {"a": variant_a, "b": variant_b, "c": variant_c}


def fit(mask, share):
    """Crop to the shape and scale it to fill `share` of the canvas, centred."""
    box = mask.getbbox()
    cropped = mask.crop(box)
    s = share * W / max(cropped.size)
    cropped = cropped.resize((int(cropped.width * s), int(cropped.height * s)), Image.LANCZOS)
    out = Image.new("L", (W, W), 0)
    out.paste(cropped, ((W - cropped.width) // 2, (W - cropped.height) // 2))
    return out


def gradient(size):
    g = Image.new("RGBA", (size, size))
    px = g.load()
    for y in range(size):
        t = y / (size - 1)
        row = tuple(int(RED_TOP[i] + (RED_BOT[i] - RED_TOP[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            px[x, y] = row
    return g


def render(mask, size, share=0.78, glow=True, background=True):
    """Red symbol on black (or transparent), with a soft glow."""
    m = fit(mask, share).resize((size, size), Image.LANCZOS)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer.paste(gradient(size), (0, 0), m)
    base = Image.new("RGBA", (size, size), BLACK if background else (0, 0, 0, 0))
    out = Image.alpha_composite(base, layer)
    if glow:
        halo = Image.new("RGBA", (size, size), (229, 32, 42, 0))
        halo.putalpha(m.filter(ImageFilter.GaussianBlur(size * 0.025)).point(lambda v: int(v * 0.5)))
        out = Image.alpha_composite(base, Image.alpha_composite(halo, layer))
    return out, m


def contact_sheet(out_dir):
    """Each variant at icon size 1024 plus the sizes a launcher actually shows (192 and 96)."""
    sheet = Image.new("RGBA", (3 * 540, 540 + 220), (24, 20, 22, 255))
    for i, key in enumerate("abc"):
        mask = VARIANTS[key]()
        big, _ = render(mask, 512)
        sheet.paste(big, (i * 540 + 14, 14))
        for j, s in enumerate((192, 96, 48)):
            small, _ = render(mask, s)
            sheet.paste(small, (i * 540 + 14 + [0, 210, 316][j], 540 + 14))
    sheet.save(f"{out_dir}/logo-variants.png")


def write_app_icons(mask, out):
    # Store icon: opaque, glow
    render(mask, 1024)[0].save(f"{out}/icon.png")
    # Adaptive icon: the symbol sits inside the central 66% so no launcher mask crops it
    fg, _ = render(mask, 512, share=0.52, glow=False, background=False)
    fg.save(f"{out}/android-icon-foreground.png")
    Image.new("RGBA", (512, 512), BLACK).save(f"{out}/android-icon-background.png")
    _, m = render(mask, 512, share=0.52, glow=False, background=False)
    mono = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    mono.paste(Image.new("RGBA", (512, 512), (255, 255, 255, 255)), (0, 0), m)
    mono.save(f"{out}/android-icon-monochrome.png")
    render(mask, 512, share=0.8, glow=False, background=False)[0].save(f"{out}/splash-icon.png")
    render(mask, 48, share=0.9, glow=False)[0].save(f"{out}/favicon.png")


if __name__ == "__main__":
    out_dir = sys.argv[1]
    if len(sys.argv) >= 5 and sys.argv[2] == "use":
        write_app_icons(VARIANTS[sys.argv[3]](), sys.argv[4])
        print("app icons written from variant", sys.argv[3])
    else:
        for key, fn in VARIANTS.items():
            render(fn(), 1024)[0].save(f"{out_dir}/logo-{key}.png")
            print("wrote logo-%s.png" % key)
        contact_sheet(out_dir)
        print("wrote logo-variants.png")
