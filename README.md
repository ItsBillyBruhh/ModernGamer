<p align="center"><img src="Icon.png" width="160" alt="Modern Gamer"></p>

# Modern Gamer

Dark gray, panel-free Spicetify theme with animated RGB accents, a docked player, synced lyrics and a neon visualizer.

![Preview](https://i.ibb.co/KcP8397G/Screenshot-2026-10-09-150300.png)

## Features
- **Player** docked at the top of the right sidebar: large round cover with a spinning RGB ring, title, artist, progress, controls and volume. The cover is blurred only as a **background layer** behind the player; the cover itself is never filtered.
- Full-resolution artwork: Spotify's 64 px / 300 px thumbnails are swapped for the 640 px version of the same image wherever they are shown large.
- The player updates by itself when the song changes (soft fade, cross-fading background, new cover).
- **Lyrics page** with timed lyrics that follow playback, from [LRCLIB](https://lrclib.net).
- **Visualizer page** with cover, song info and a radial neon visualizer.
- **Colors page**: swap the rainbow for any gradient or solid color.
- Flat, panel-free layout on a dark gray canvas; flowing RGB progress/volume bars, dividers and top-bar line.

## Install
**Marketplace:** open Spicetify Marketplace → Themes → search "Modern Gamer" → Install.

**Manual:**
1. Put `user.css`, `color.ini` and `theme.js` in the Spicetify `Themes/ModernGamer/` folder (Windows: `%appdata%\spicetify\Themes\ModernGamer\`, macOS/Linux: `~/.config/spicetify/Themes/ModernGamer/`).
2. Run:
   ```
   spicetify config current_theme ModernGamer color_scheme ModernGamer inject_css 1 replace_colors 1
   spicetify apply
   ```

## Pages and shortcuts
| Page | Top-bar button | Shortcut | Close |
|---|---|---|---|
| Visualizer | bars icon | **Ctrl + Alt + V** | **Esc** or ✕ |
| Lyrics | lines icon | **Ctrl + Alt + L** | **Esc** or ✕ |
| Colors | palette icon | **Ctrl + Alt + C** | **Esc** or ✕ |

Only one page is open at a time, and opening any Spotify page closes it. Each page covers the main view only, so the sidebars and navigation keep working.

### Lyrics
- Looks the song up on LRCLIB by title, artist, album and length. If the exact match fails, it searches and **only accepts a version whose length matches the song** (so timestamps line up).
- Timed lyrics: the current line is highlighted in the active palette, earlier lines fade, and the page scrolls to the current line. Click any line to jump there. Scrolling by hand pauses auto-scroll for a few seconds.
- Lyrics without timestamps are shown as plain text with a note that they don't follow the song. Instrumentals, podcasts, missing lyrics and network errors each get a clear message. Nothing is ever made up.
- Turn it off with `MG_LYRICS_ENABLED` at the top of `theme.js`.

### Visualizer
- Follows Spotify's analysis of the playing track (beats, loudness, pitch). It does not listen to your speakers, so volume and EQ don't change it.
- Tracks without analysis (some podcasts / local files, or if Spotify stops providing it) get a generated beat animation.
- Turn it off with `MG_VIZ_ENABLED`.

### Colors
- Pick any gradient or solid color. It replaces the rainbow everywhere, including the lyric highlight and visualizer. The choice is saved; "Reset to rainbow" restores the default.
- Turn it off with `MG_COLORS_ENABLED`.

## Notes
- Keep the Now Playing panel open on the right; the player sits above it.
- `theme.js` must load (the layout depends on it). Marketplace loads it automatically from the GitHub Pages URL in `manifest.json`, so **GitHub Pages must be enabled for this repo** (Settings → Pages → deploy from the main branch).
- Colors live in `color.ini`; animation speeds are in the last sections of `user.css`.
- Spacing: pages sit 4 px below the top navigation. `theme.js` measures the gap above the content on every page and removes only empty spacers and oversized top padding it finds. If a page still has a gap, open the developer console and run `ModernGamer.debugGap()`; it prints what sits above the content.

## Compatibility
Written for Spotify 1.3.8.620 with the `now-playing-widget-v2` player, with fallbacks for the older player selectors. Spotify's class names change often, so the script finds panels by layout and `data-testid` rather than by class name. The behavior was tested in Chromium against a mock of Spotify's layout, not inside Spotify itself.
