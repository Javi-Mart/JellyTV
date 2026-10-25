"""Create original deterministic validation media; never reads production libraries."""
from pathlib import Path
import math
import random
import shutil
import subprocess
import sys
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2] / '.lab'
MEDIA = ROOT / 'media'
FFMPEG = ROOT / 'server' / 'jellyfin' / 'ffmpeg.exe'
SAMPLE = MEDIA / 'sample.mp4'
FONT = Path('C:/Windows/Fonts/seguisb.ttf')

def art(directory, title, palette, seed, logo=True):
    directory.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    width, height = 1600, 900
    image = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / height
        color = tuple(int(palette[0][i] * (1-t) + palette[1][i] * t) for i in range(3))
        draw.line((0, y, width, y), fill=color)
    draw.ellipse((1000, 120, 1270, 390), fill=palette[2])
    for index in range(4):
        baseline = 470 + index * 110
        points = [(0, height)] + [(x, baseline + rng.randint(-100, 40)) for x in range(0, width + 100, 100)] + [(width, height)]
        color = tuple(max(3, int(c * (0.65 - index * .13))) for c in palette[1])
        draw.polygon(points, fill=color)
    for _ in range(60):
        x, y = rng.randrange(width), rng.randrange(350)
        draw.ellipse((x, y, x+2, y+2), fill=(150, 170, 180))
    image.save(directory / 'backdrop.jpg', quality=88)
    poster = image.resize((1067, 600)).crop((333, 0, 733, 600))
    pd = ImageDraw.Draw(poster)
    title_font = ImageFont.truetype(str(FONT), 34)
    words = title.upper().split()
    lines, line = [], ''
    for word in words:
        candidate = (line + ' ' + word).strip()
        if pd.textlength(candidate, font=title_font) > 350 and line:
            lines.append(line); line = word
        else:
            line = candidate
    lines.append(line)
    for i, line in enumerate(lines):
        pd.text((24, 420 + 39*i), line, fill='white', font=title_font)
    pd.text((24, 570), 'JELLYTV LAB • ORIGINAL TEST MEDIA', fill=(180,190,190), font=ImageFont.truetype(str(FONT), 12))
    poster.save(directory / 'poster.jpg', quality=90)
    if logo:
        logo_image = Image.new('RGBA', (1200, 200), (0, 0, 0, 0))
        ld = ImageDraw.Draw(logo_image)
        font = ImageFont.truetype(str(FONT), min(100, int(1800 / max(12, len(title)))))
        ld.text((4, 18), title.upper(), font=font, fill='white')
        logo_image.crop(logo_image.getbbox()).save(directory / 'logo.png')

def metadata(path, kind, title, year=2026, genre='Adventure', extra=''):
    path.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<{kind}><title>{escape(title)}</title><year>{year}</year><plot>Original JellyTV laboratory media. A quiet journey through imagined landscapes, created to validate real playback, navigation, artwork and accessibility without using a private library.</plot><genre>{genre}</genre><genre>Science Fiction</genre><mpaa>TV-PG</mpaa><rating>8.4</rating><runtime>12</runtime><studio>JellyTV Local Lab</studio><lockdata>true</lockdata>{extra}</{kind}>''', encoding='utf-8')

def dual_audio_fixture():
    """A separate short item preserves the playback state of shared movie fixtures."""
    target = MEDIA / 'Movies' / 'Two Frequencies (2020)'
    target.mkdir(parents=True, exist_ok=True)
    video = target / 'Two Frequencies.mp4'
    if not video.exists():
        subprocess.run([
            str(FFMPEG), '-hide_banner', '-loglevel', 'error',
            '-f', 'lavfi', '-i', 'color=c=0x183541:s=640x360:r=24',
            '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000',
            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
            '-t', '90', '-map', '0:v', '-map', '1:a', '-map', '2:a',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30',
            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k',
            '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=Low tone',
            '-metadata:s:a:1', 'language=spa', '-metadata:s:a:1', 'title=High tone',
            '-movflags', '+faststart', str(video)
        ], check=True)
    metadata(target / 'movie.nfo', 'movie', 'Two Frequencies', year=2020,
             extra='<dateadded>2020-01-01 00:00:00</dateadded>')
    # File timestamps also keep this technical fixture out of newest-title queries.
    import os
    for path in target.iterdir():
        os.utime(path, (1577836800, 1577836800))

def main():
    if not SAMPLE.exists():
        subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x183541:s=1280x720:r=24', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '720', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-y', str(SAMPLE)], check=True)
    palettes = [((16,45,56),(150,105,52),(240,205,137)), ((18,15,51),(89,57,112),(203,174,236)), ((6,35,37),(37,116,104),(187,221,186)), ((12,25,57),(59,94,141),(188,205,227)), ((51,18,25),(154,68,54),(248,178,113))]
    titles = ['The Quiet Horizon', 'Aster Vale', 'Tides of Tomorrow', 'North of the Stars', 'The Last Signal', 'A Very Long Journey Beyond Every Known Horizon and Into the Unknown']
    for i, title in enumerate(titles):
        target = MEDIA / 'Movies' / f'{title} (2026)'
        art(target, title, palettes[i % 5], i, logo=(i % 2 == 0))
        shutil.copyfile(SAMPLE, target / f'{title}.mp4')
        metadata(target / 'movie.nfo', 'movie', title, year=2026-i)
        (target / f'{title}.en.srt').write_text('1\n00:00:01,000 --> 00:00:08,000\nOriginal JellyTV validation subtitle.\n\n2\n00:00:08,001 --> 00:00:16,000\nReadable captions over a real H.264 video.\n', encoding='utf-8')
    # This item deliberately has no poster, backdrop or logo to exercise fallback.
    empty = MEDIA / 'Movies' / 'Without Artwork (2026)'
    empty.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SAMPLE, empty / 'Without Artwork.mp4')
    metadata(empty / 'movie.nfo', 'movie', 'Without Artwork')
    show = MEDIA / 'Shows' / 'The Meridian Archive'
    art(show, 'The Meridian Archive', palettes[3], 20)
    metadata(show / 'tvshow.nfo', 'tvshow', 'The Meridian Archive', genre='Drama')
    for season in (1, 2):
        season_dir = show / f'Season {season:02}'
        season_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(show / 'poster.jpg', season_dir / 'poster.jpg')
        for episode, title in enumerate(['A New Coordinate', 'The Long Passage', 'A Light Returns'], 1):
            stem = f'The Meridian Archive S{season:02}E{episode:02}'
            shutil.copyfile(SAMPLE, season_dir / f'{stem}.mp4')
            metadata(season_dir / f'{stem}.nfo', 'episodedetails', title, extra=f'<season>{season}</season><episode>{episode}</episode><aired>2026-01-0{episode}</aired>')
            shutil.copyfile(show / 'backdrop.jpg', season_dir / f'{stem}-thumb.jpg')
    music = MEDIA / 'Music' / 'JellyTV Lab' / 'Ambient Coordinates'
    music.mkdir(parents=True, exist_ok=True)
    art(music, 'Ambient Coordinates', palettes[1], 40, logo=False)
    shutil.copyfile(music / 'poster.jpg', music / 'folder.jpg')
    for track in (1, 2):
        subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', f'sine=frequency={110*track}:sample_rate=44100', '-t', '60', '-af', 'volume=0.06,afade=t=in:d=3,afade=t=out:st=57:d=3', '-c:a', 'libmp3lame', '-b:a', '128k', '-metadata', f'title=Coordinate {track}', '-metadata', 'artist=JellyTV Lab', '-metadata', 'album=Ambient Coordinates', '-metadata', f'track={track}', '-y', str(music / f'{track:02} Coordinate {track}.mp3')], check=True)
    dual_audio_fixture()
    print('Original fixtures ready: 8 movies (one dual-audio), 1 series, 2 seasons, 6 episodes, 2 music tracks.')

if __name__ == '__main__':
    dual_audio_fixture() if '--extended-only' in sys.argv else main()
