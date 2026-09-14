#!/usr/bin/env python3
"""
Gera os assets PWA do ImobSync a partir da identidade visual existente:
  - public/icons/pwa-icon-{192,512}.png          (purpose: any)
  - public/icons/pwa-maskable-{192,512}.png      (purpose: maskable)
  - public/splash/apple-splash-{w}x{h}-{light|dark}.png  (iOS apple-touch-startup-image)

Fontes:
  - public/imobsync-simbolo-claro.png  (1024x1024 RGBA — uso em fundo claro)
  - public/imobsync-simbolo-escuro.png (1024x1024 RGBA — uso em fundo escuro)

Cores do tema (globals.css, oklch) convertidas para sRGB hex:
  - light background: oklch(0.982 0.003 240.0)
  - dark  background: oklch(0.178 0.022 250.8)
  - accent          : oklch(0.775 0.155 200.0)  (informativo)

O estilo (cor de fundo) dos icones 'any' replica o apple-touch-icon.png
existente (amostra do pixel do canto). Maskable usa fundo full-bleed e o
simbolo dentro da zona segura (~52% do canvas, circulo de 80%).
"""
from PIL import Image
import math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")

# ---------------------------------------------------------------- oklch -> hex
def oklch_to_hex(L: float, C: float, H_deg: float) -> str:
    h = math.radians(H_deg)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
    g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
    bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
    def gam(c: float) -> int:
        c = 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
        return max(0, min(255, round(c * 255)))
    return "#{:02x}{:02x}{:02x}".format(gam(r), gam(g), gam(bl))

LIGHT_BG = oklch_to_hex(0.982, 0.003, 240.0)
DARK_BG = oklch_to_hex(0.178, 0.022, 250.8)
ACCENT = oklch_to_hex(0.775, 0.155, 200.0)

def hex_to_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))

# ------------------------------------------------------- estilo do apple icon
apple = Image.open(os.path.join(PUB, "apple-touch-icon.png")).convert("RGBA")
corner = apple.getpixel((2, 2))
apple_bg_is_opaque = corner[3] > 250
ANY_BG = "%02x%02x%02x" % corner[:3] if apple_bg_is_opaque else LIGHT_BG
print(f"apple-touch-icon corner: {corner} -> any-icon bg: #{ANY_BG}")

# ------------------------------------------------------------------ icones
simbolo_claro = Image.open(os.path.join(PUB, "imobsync-simbolo-claro.png")).convert("RGBA")
simbolo_escuro = Image.open(os.path.join(PUB, "imobsync-simbolo-escuro.png")).convert("RGBA")

def compose_icon(size: int, source: Image.Image, scale: float, bg_hex: str) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), hex_to_rgb(bg_hex) + (255,))
    inner = round(size * scale)
    sym = source.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.alpha_composite(sym, (off, off))
    return canvas

os.makedirs(os.path.join(PUB, "icons"), exist_ok=True)
outputs = []
for size in (192, 512):
    # any: simbolo maior (launchers mascaram pouco); fundo do apple-touch-icon
    p = os.path.join(PUB, "icons", f"pwa-icon-{size}.png")
    compose_icon(size, simbolo_claro, 0.72, ANY_BG).convert("RGB").save(p, optimize=True)
    outputs.append(p)
    # maskable: full-bleed + simbolo na zona segura do circulo de 80%
    p = os.path.join(PUB, "icons", f"pwa-maskable-{size}.png")
    compose_icon(size, simbolo_claro, 0.52, ANY_BG).convert("RGB").save(p, optimize=True)
    outputs.append(p)

# ----------------------------------------------------------------- splashes
# (w, h, dpr, device-width px, device-height px) — iPhones mais comuns, portrait.
# A media query completa é montada no layout.tsx (appleWebApp.startupImage).
SPLASH_SIZES = [
    (1320, 2868),  # 16 Pro Max (440x956pt @3x)
    (1290, 2796),  # 14/15/16 Plus, 15 Pro Max (430x932pt @3x)
    (1206, 2622),  # 16 Pro (402x874pt @3x)
    (1179, 2556),  # 14/15/16 Pro (393x852pt @3x)
    (1284, 2778),  # 12/13 Pro Max, 14 Plus (428x926pt @3x)
    (1170, 2532),  # 12/13/14 (390x844pt @3x)
    (828, 1792),   # XR/11 (414x896pt @2x)
    (750, 1334),   # SE 2/3, 8 (375x667pt @2x)
]

def compose_splash(w: int, h: int, source: Image.Image, bg_hex: str) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), hex_to_rgb(bg_hex) + (255,))
    sym_w = round(w * 0.28)  # simbolo com ~28% da largura
    sym = source.resize((sym_w, sym_w), Image.LANCZOS)
    off = ((w - sym_w) // 2, (h - sym_w) // 2)
    canvas.alpha_composite(sym, off)
    return canvas

os.makedirs(os.path.join(PUB, "splash"), exist_ok=True)
for w, h in SPLASH_SIZES:
    p = os.path.join(PUB, "splash", f"apple-splash-{w}x{h}-light.png")
    compose_splash(w, h, simbolo_claro, LIGHT_BG).convert("RGB").save(p, optimize=True)
    outputs.append(p)
    p = os.path.join(PUB, "splash", f"apple-splash-{w}x{h}-dark.png")
    compose_splash(w, h, simbolo_escuro, DARK_BG).convert("RGB").save(p, optimize=True)
    outputs.append(p)

print("oklch -> hex:")
print(f"  light background : {LIGHT_BG}")
print(f"  dark background  : {DARK_BG}")
print(f"  accent           : {ACCENT}")
print(f"arquivos gerados: {len(outputs)}")
for p in outputs:
    print(f"  {os.path.relpath(p, ROOT)} ({os.path.getsize(p)//1024} KB)")
