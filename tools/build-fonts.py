#!/usr/bin/env python3
"""게임이 실제로 쓰는 글자만 남긴 폰트를 만듭니다.

외부 CDN 에 의존하면 네트워크가 막힌 환경에서 타이포가 통째로 무너지고,
단일 파일 빌드도 자기완결적이지 않게 됩니다. 한글 전체를 넣으면 너무 무거우므로
소스에 실제로 등장하는 음절만 골라 서브셋합니다.

    python3 tools/build-fonts.py

소스의 한글 문구를 바꾼 뒤에는 다시 돌려야 합니다.
"""
import re, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/fonts"
CACHE = ROOT / ".fontcache"

FONTS = [
    ("GowunBatang-Bold",   "ofl/gowunbatang/GowunBatang-Bold.ttf"),
    ("GothicA1-Regular",   "ofl/gothica1/GothicA1-Regular.ttf"),
    ("GothicA1-SemiBold",  "ofl/gothica1/GothicA1-SemiBold.ttf"),
    ("GothicA1-ExtraBold", "ofl/gothica1/GothicA1-ExtraBold.ttf"),
    ("BebasNeue-Regular",  "ofl/bebasneue/BebasNeue-Regular.ttf"),
]
BASE = "https://raw.githubusercontent.com/google/fonts/main/"

SCAN = ["src", "index.html", "styles.css", "README.md"]
# 런타임에 조합되거나 앞으로 쓸 만한 글자는 미리 넣어 둡니다.
EXTRA = (
    "0123456789"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    " .,:;!?/·×÷−+-–—()[]%＋－…'\"₩#@&*<>=~|"
    "초명개번회판단계칸승패무"
)


def collect_chars() -> set:
    chars = set(EXTRA)
    files = []
    for target in SCAN:
        p = ROOT / target
        if p.is_dir():
            files += [f for f in p.rglob("*") if f.suffix in {".js", ".html", ".css", ".md"}]
        elif p.exists():
            files.append(p)
    hangul = re.compile(r"[가-힣ㄱ-ㆎ]")
    for f in files:
        text = f.read_text(encoding="utf-8", errors="ignore")
        chars.update(hangul.findall(text))
    return chars


def fetch(rel: str, dest: Path):
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(BASE + rel, headers={"User-Agent": "path-of-dungeon-build"})
    with urllib.request.urlopen(req, timeout=90) as r:
        dest.write_bytes(r.read())


def main():
    chars = collect_chars()
    unicodes = ",".join(f"U+{ord(c):04X}" for c in sorted(chars))
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"글자 {len(chars)}자")

    total = 0
    for name, rel in FONTS:
        src = CACHE / f"{name}.ttf"
        fetch(rel, src)
        dst = OUT / f"{name}.woff2"
        subprocess.run(
            [sys.executable, "-m", "fontTools.subset", str(src),
             f"--unicodes={unicodes}", "--flavor=woff2", "--layout-features=*",
             f"--output-file={dst}"],
            check=True, capture_output=True,
        )
        kb = dst.stat().st_size / 1024
        total += kb
        print(f"  {dst.name:26} {kb:6.1f} KB")
    print(f"합계 {total:.0f} KB")


if __name__ == "__main__":
    main()
