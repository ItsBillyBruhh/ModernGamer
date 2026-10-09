# Modern Gamer

Dark gray, panel-free Spicetify theme with animated RGB accents.

![Preview](https://i.ibb.co/KcP8397G/Screenshot-2026-10-09-150300.png)

## Features
- Player docked at the top of the right sidebar: cover → title → artist → progress → controls → volume
- Spinning RGB ring around the cover, flowing RGB progress/volume bars, RGB dividers and top-bar strip
- Violet → cyan play buttons with a spinning RGB ring
- Flat, panel-free layout on a dark gray canvas

## Install
**Marketplace:** open Spicetify Marketplace → Themes → search "Modern Gamer" → Install.

**Manual (Windows):**
1. Put `user.css`, `color.ini` and `theme.js` in `%appdata%\spicetify\Themes\ModernGamer\`
2. Run:
   ```
   spicetify config current_theme ModernGamer color_scheme ModernGamer inject_css 1 replace_colors 1
   spicetify apply
   ```

## Notes
- Keep the Now Playing panel open on the right — the player sits above it.
- Needs `theme.js` to be loaded (the layout depends on it). Marketplace loads it automatically.
- Colors live in `color.ini`; animation speeds are in the last section of `user.css`.
