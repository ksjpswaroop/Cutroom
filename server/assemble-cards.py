#!/usr/bin/env python3
"""Render solid title / chapter / caption cards for Cutroom assemble preview (L-614)."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines[:4]


def render(mode: str, text: str, width: int, height: int, out: Path) -> None:
    if mode == "title":
        bg = (10, 102, 194)
        font = load_font(52)
        fill = (255, 255, 255)
    elif mode == "chapter":
        bg = (17, 24, 39)
        font = load_font(44)
        fill = (255, 255, 255)
    else:
        # Transparent caption strip
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        font = load_font(30)
        lines = wrap_text(draw, text[:120], font, width - 120)
        block_h = len(lines) * 40 + 28
        top = height - block_h - 36
        draw.rounded_rectangle((48, top, width - 48, height - 36), radius=16, fill=(0, 0, 0, 160))
        y = top + 16
        for line in lines:
            tw = draw.textlength(line, font=font)
            draw.text(((width - tw) / 2, y), line, font=font, fill=(255, 255, 255, 255))
            y += 40
        image.save(out)
        return

    image = Image.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(image)
    lines = wrap_text(draw, text[:140], font, width - 160)
    total_h = len(lines) * 64
    y = (height - total_h) / 2
    for line in lines:
        tw = draw.textlength(line, font=font)
        draw.text(((width - tw) / 2, y), line, font=font, fill=fill)
        y += 64
    if mode == "chapter":
        badge = "CHAPTER"
        badge_font = load_font(22)
        bw = draw.textlength(badge, font=badge_font)
        draw.rounded_rectangle(
            ((width - bw) / 2 - 16, y + 12, (width + bw) / 2 + 16, y + 52),
            radius=10,
            fill=(10, 102, 194),
        )
        draw.text(((width - bw) / 2, y + 20), badge, font=badge_font, fill=(255, 255, 255))
    image.save(out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("title", "chapter", "caption"), required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    args = parser.parse_args()
    # Avoid shell-escaping issues: unescape common placeholders
    text = args.text.replace("\\n", "\n").strip() or "Cutroom"
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    render(args.mode, text, args.width, args.height, out)


if __name__ == "__main__":
    main()
