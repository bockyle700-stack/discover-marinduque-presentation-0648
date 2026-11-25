# Discover Marinduque: Presentation Website

A full-screen, presentation-style website covering the beaches, islands, caves, waterfalls,
churches, festivals and heritage sites of Marinduque across all six municipalities
(59 slides, 44 destinations).

## Run it

```
npm start
```

Then open http://localhost:3000. No npm dependencies are needed (pure Node.js, version 18 or newer).

## Admin mode (edit text and upload photos)

1. Click **Menu** (top right) and choose **Admin Login**.
2. Enter the admin password (default: `students@@`).
3. You can now:
   - **Click any text** to edit it (titles, descriptions, location, how to get there, etc.).
   - **Upload photos** into the "Photo coming soon" placeholders (or use *Replace* / *Remove*).
     Hero and card slides have an *Add background photo* button at the bottom left.
   - **Add slide** (a new destination slide after the current one) or **Delete slide**.
4. Changes save automatically. Click **Done** (or Menu > Exit Admin Mode) when finished.

Visitors only see the finished presentation. The edit controls appear only after login.

### Changing the password

The default is set in `server.js`. On any real website, set it with an environment variable instead:

```
ADMIN_PASSWORD="your-new-password" npm start
```

### Where edits and photos are stored

Edited text is saved to `data/content.json` and uploaded photos to `data/uploads/`
(set `DATA_DIR` to change the folder). If you deploy to a host with a temporary disk
(for example the free tier of Render), these files are erased on every redeploy. Attach a
persistent disk and point `DATA_DIR` at it to keep your edits and photos.

## Project structure

```
server.js                      Node server: static files + login, save and upload API
public/index.html              Page shell (menu, login, admin bar)
public/style.css               Design system and layouts
public/script.js               Slide rendering, navigation, admin editing
public/content.default.json    All slide content (the starting text)
data/                          Created automatically (saved edits + uploaded photos)
```

## Photos and videos

Use **Add photo or video** on any slide. Media fills the whole screen automatically.

- **Photos** are resized to 2560 px on the long side and saved at high JPEG quality.
- **Videos** (MP4, MOV, WebM, up to 500 MB) are re-encoded on the server with ffmpeg to 1080p H.264 at 60 fps
  with fast start, plus a poster frame. Only the visible slide plays, muted and looping.
- Without ffmpeg on the host, videos are stored as uploaded. Install ffmpeg to enable optimization.
- Clips shot at 30 fps are converted to a 60 fps timeline by repeating frames. For true 60 fps motion, film or export at 60 fps.
  Set `INTERPOLATE=1` to synthesize in-between frames instead (much slower).

## Keyboard shortcuts

Arrow keys / Page Up / Page Down move between slides; Home and End jump to the first and last slide.
