# FaceCapture PWA

Data collection app for metabolic syndrome facial feature research. Captures standardized multi-angle facial photos with face mesh detection, organizes by patient ID, and uploads to Google Drive.

## Features

- Auto-generated patient IDs (P001YYYYMMDD format)
- 4 capture angles: Front, Right, Left, Back
- MediaPipe Face Mesh (468 landmarks) with fallback to Chrome FaceDetector API
- Rectangle guide overlay (below-eye zone for front view)
- Green indicator when face is properly positioned
- Photo review with retake option
- Google Drive upload via Apps Script
- Works offline (PWA with service worker)
- Installs on phone home screen like a native app

## Quick Start (5 minutes)

### Step 1: Create a GitHub repo

```bash
# Clone or download this folder, then:
cd face-capture-pwa
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/face-capture-pwa.git
git push -u origin main
```

### Step 2: Enable GitHub Pages

1. Go to your repo on GitHub
2. Settings > Pages
3. Source: **GitHub Actions**
4. The workflow will auto-run on push

Your app will be live at: `https://YOUR_USERNAME.github.io/face-capture-pwa/`

### Step 3: Set up Google Drive upload

1. Create a folder in Google Drive for the photos
2. Copy the folder ID from the URL (the long string after `/folders/`)
3. Go to [script.google.com](https://script.google.com) > New project
4. Paste the contents of `google-apps-script.js`
5. Replace `YOUR_FOLDER_ID` with your folder ID
6. Deploy > New deployment > Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the deployment URL
8. Open your FaceCapture app > Settings > paste the URL

### Step 4: Install on phones

Open the app URL on any phone's browser and tap "Add to Home Screen". It works like a native app.

## Important: Repo name

If your GitHub repo is named something other than `face-capture-pwa`, update the base path in `vite.config.js`:

```js
base: '/your-repo-name/',
```

## Local development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Use a phone on the same Wi-Fi or ngrok for camera testing.

## Drive folder structure

After uploading, your Drive folder will look like:

```
YourFolder/
  P00120260622/
    P00120260622_front.jpg
    P00120260622_right.jpg
    P00120260622_left.jpg
    P00120260622_back.jpg
  P00220260622/
    ...
```

## Privacy

- Photos stay on the device until you explicitly download or upload
- Google Drive uploads go to YOUR account only
- GitHub Pages hosts the app code, never your data
- No analytics, no tracking, no third-party calls (except MediaPipe model CDN)
- 
