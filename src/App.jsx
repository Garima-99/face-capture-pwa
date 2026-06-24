import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera, User, ChevronRight, ChevronLeft, Download, RotateCcw,
  Check, X, ArrowLeft, FlipHorizontal, AlertCircle, Loader2,
  Trash2, Eye, Upload, Settings, Shield, CircleDot
} from "lucide-react";

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn("Storage:", e); } },
};

const ANGLES = [
  { id: "neck_under", label: "Neck + Under-chin", instruction: "Hold camera below chin, tilt up. Center the neck in the frame.", detectFace: true, guideMode: "neck_primary" },
  { id: "front", label: "Front Face", instruction: "Look straight at camera. Center face in the frame.", detectFace: true, guideMode: "front" },
  { id: "right", label: "Right Profile", instruction: "Turn head fully right. Center jawline and neck in frame.", detectFace: true, guideMode: "side" },
  { id: "left", label: "Left Profile", instruction: "Turn head fully left. Center jawline and neck in frame.", detectFace: true, guideMode: "side" },
];

function generatePatientId(serial) {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `P_${String(serial).padStart(3, "0")}_${dd}-${mm}-${yy}`;
}

/* ─── LANDMARK CONTOUR INDICES (MediaPipe 468) ─── */
const JAWLINE = [234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454];
const LIPS_OUTER = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
const NOSE = [168,6,197,195,5,4,1,2,164,0];

/* ─── FIXED CENTERED GUIDE RECT (always symmetric) ─── */
function getFixedGuide(guideMode, canvasW, canvasH) {
  let wRatio, hRatio, yOffset;
  if (guideMode === "neck_primary") {
    wRatio = 0.82; hRatio = 0.58; yOffset = 0.32;
  } else if (guideMode === "front") {
    wRatio = 0.72; hRatio = 0.82; yOffset = 0.05;
  } else {
    wRatio = 0.75; hRatio = 0.78; yOffset = 0.08;
  }
  const rw = canvasW * wRatio;
  const rh = canvasH * hRatio;
  const rx = (canvasW - rw) / 2; // always centered horizontally
  const ry = canvasH * yOffset;
  return { rx, ry, rw, rh };
}

/* ─── CHECK IF FACE IS INSIDE GUIDE ─── */
function isFaceInGuide(faceData, guideMode, canvasW, canvasH, mirrored) {
  if (!faceData?.detected || !faceData.bbox) return false;
  const b = faceData.bbox;
  const sx = canvasW / faceData.videoW;
  const sy = canvasH / faceData.videoH;
  let faceCX = (b.x + b.width / 2) * sx;
  const faceCY = (b.y + b.height / 2) * sy;
  if (mirrored) faceCX = canvasW - faceCX;

  const g = getFixedGuide(guideMode, canvasW, canvasH);
  const guideCX = g.rx + g.rw / 2;
  const guideCY = g.ry + g.rh / 2;

  // Check if face center is reasonably close to guide center
  const dx = Math.abs(faceCX - guideCX) / g.rw;
  const dy = Math.abs(faceCY - guideCY) / g.rh;
  return dx < 0.35 && dy < 0.4;
}

/* ─── GUIDE OVERLAY ─── */
function GuideOverlay({ faceData, guideMode, canvasW, canvasH, detectFace, mirrored }) {
  const inPosition = detectFace ? isFaceInGuide(faceData, guideMode, canvasW, canvasH, mirrored) : false;
  const stroke = inPosition ? "#16a34a" : "#d97706";
  const fill = inPosition ? "rgba(22,163,106,0.04)" : "rgba(217,119,6,0.02)";
  const { rx, ry, rw, rh } = getFixedGuide(guideMode, canvasW, canvasH);

  // Fiducial contours
  const landmarks = faceData?.allLandmarks;
  const sx = faceData?.videoW ? canvasW / faceData.videoW : 1;
  const sy = faceData?.videoH ? canvasH / faceData.videoH : 1;
  let jawPath = "", lipsPath = "", nosePath = "";

  if (landmarks?.length > 0) {
    const px = (idx) => {
      if (!landmarks[idx]) return 0;
      const x = landmarks[idx].x * sx;
      return mirrored ? canvasW - x : x;
    };
    const py = (idx) => landmarks[idx] ? landmarks[idx].y * sy : 0;
    const path = (ids) => ids.filter(i => landmarks[i]).map((i, j) => `${j === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(i).toFixed(1)}`).join(" ");
    jawPath = path(JAWLINE);
    lipsPath = path(LIPS_OUTER);
    nosePath = path(NOSE);
  }

  const label = guideMode === "neck_primary" ? "Neck + chin zone"
    : guideMode === "front" ? "Face + neck" : "Profile + neck";

  return (
    <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox={`0 0 ${canvasW} ${canvasH}`}>
      <defs>
        <mask id="gm">
          <rect width={canvasW} height={canvasH} fill="white" />
          <rect x={rx} y={ry} width={rw} height={rh} rx="10" fill="black" />
        </mask>
      </defs>
      <rect width={canvasW} height={canvasH} fill="rgba(0,0,0,0.5)" mask="url(#gm)" />
      <rect x={rx} y={ry} width={rw} height={rh} rx="10" fill={fill}
        stroke={stroke} strokeWidth="2.5" strokeDasharray={inPosition ? "none" : "8 5"} />

      {/* Center crosshair for alignment */}
      <line x1={rx + rw/2 - 12} y1={ry + rh/2} x2={rx + rw/2 + 12} y2={ry + rh/2} stroke={stroke} strokeWidth="1" opacity="0.3" />
      <line x1={rx + rw/2} y1={ry + rh/2 - 12} x2={rx + rw/2} y2={ry + rh/2 + 12} stroke={stroke} strokeWidth="1" opacity="0.3" />

      {/* Fiducial contours */}
      {jawPath && <path d={jawPath} fill="none" stroke={inPosition ? "#22c55e" : "#eab308"} strokeWidth="2" opacity="0.75" strokeLinejoin="round" />}
      {lipsPath && <path d={lipsPath} fill="none" stroke={inPosition ? "#22c55e" : "#eab308"} strokeWidth="1.5" opacity="0.55" strokeLinejoin="round" />}
      {nosePath && <path d={nosePath} fill="none" stroke={inPosition ? "#22c55e" : "#eab308"} strokeWidth="1.5" opacity="0.45" strokeLinejoin="round" />}

      {landmarks?.[1] && (() => {
        const nx = mirrored ? canvasW - landmarks[1].x * sx : landmarks[1].x * sx;
        return <circle cx={nx} cy={landmarks[1].y * sy} r="3" fill={inPosition ? "#22c55e" : "#eab308"} opacity="0.7" />;
      })()}

      <text x={rx + rw / 2} y={ry - 8} textAnchor="middle" fontSize="11"
        fill={stroke} fontFamily="system-ui" fontWeight="600" opacity="0.85">{label}</text>

      {/* Position hint */}
      {detectFace && !inPosition && faceData?.detected && (
        <text x={rx + rw / 2} y={ry + rh + 20} textAnchor="middle" fontSize="12"
          fill="#d97706" fontFamily="system-ui" fontWeight="600">
          Move face to center of frame
        </text>
      )}
    </svg>
  );
}

/* ─── CAMERA VIEW ─── */
function CameraView({ onCapture, angle, onBack, angleIndex, totalAngles }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [faceData, setFaceData] = useState(null);
  const [facingMode, setFacingMode] = useState("user");
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);
  const [dims, setDims] = useState({ w: 360, h: 480 });
  const [detectorType, setDetectorType] = useState("loading");
  const mediapipeRef = useRef(null);
  const detectingRef = useRef(false);

  const startCamera = useCallback(async (facing) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      setCameraReady(false); setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1600 } }, audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          const vw = videoRef.current.videoWidth, vh = videoRef.current.videoHeight;
          const dispW = Math.min(420, window.innerWidth - 24);
          setDims({ w: dispW, h: Math.round(dispW * (vh / vw)) });
          setCameraReady(true);
        };
      }
    } catch { setError("Camera access denied. Allow camera permissions and reload."); }
  }, []);

  useEffect(() => { startCamera(facingMode); return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); }; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
        if (cancelled) return;
        const resolver = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
        if (cancelled) return;
        const landmarker = await vision.FaceLandmarker.createFromOptions(resolver, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
          runningMode: "VIDEO", numFaces: 1,
        });
        if (cancelled) return;
        mediapipeRef.current = { type: "mediapipe", detector: landmarker };
        setDetectorType("mediapipe"); return;
      } catch (e) { console.log("MediaPipe unavailable:", e.message); }
      if ("FaceDetector" in window) {
        try { mediapipeRef.current = { type: "native", detector: new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) }; if (!cancelled) setDetectorType("native"); return; } catch {}
      }
      if (!cancelled) setDetectorType("none");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cameraReady || !angle.detectFace || detectorType === "loading" || detectorType === "none") return;
    let running = true, lastTime = -1;
    const detect = async () => {
      if (!running || !videoRef.current || detectingRef.current) { if (running) requestAnimationFrame(detect); return; }
      detectingRef.current = true;
      const video = videoRef.current;
      try {
        if (mediapipeRef.current?.type === "mediapipe") {
          const now = performance.now();
          if (now - lastTime < 100) { detectingRef.current = false; if (running) requestAnimationFrame(detect); return; }
          lastTime = now;
          const result = mediapipeRef.current.detector.detectForVideo(video, now);
          if (result.faceLandmarks?.length > 0) {
            const lm = result.faceLandmarks[0];
            const vw = video.videoWidth, vh = video.videoHeight;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allPts = lm.map(p => { const px = p.x * vw, py = p.y * vh; if (px < minX) minX = px; if (py < minY) minY = py; if (px > maxX) maxX = px; if (py > maxY) maxY = py; return { x: px, y: py }; });
            setFaceData({ detected: true, bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, allLandmarks: allPts, videoW: vw, videoH: vh });
          } else { setFaceData(prev => prev ? { ...prev, detected: false, allLandmarks: null } : null); }
        } else if (mediapipeRef.current?.type === "native") {
          const faces = await mediapipeRef.current.detector.detect(video);
          if (faces.length > 0) {
            const bb = faces[0].boundingBox;
            setFaceData({ detected: true, bbox: { x: bb.x, y: bb.y, width: bb.width, height: bb.height }, allLandmarks: null, videoW: video.videoWidth, videoH: video.videoHeight });
          } else { setFaceData(prev => prev ? { ...prev, detected: false, allLandmarks: null } : null); }
        }
      } catch {}
      detectingRef.current = false;
      if (running) requestAnimationFrame(detect);
    };
    detect();
    return () => { running = false; };
  }, [cameraReady, detectorType, angle.detectFace]);

  useEffect(() => { if (!angle.detectFace) setFaceData(null); }, [angle.detectFace]);

  // CAPTURE: crop to the FIXED CENTERED guide rect
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    // Get the fixed guide rect in video-pixel space
    const g = getFixedGuide(angle.guideMode, vw, vh);
    let gx = Math.max(0, Math.round(g.rx));
    let gy = Math.max(0, Math.round(g.ry));
    let gw = Math.min(Math.round(g.rw), vw - gx);
    let gh = Math.min(Math.round(g.rh), vh - gy);

    const c = canvasRef.current;
    c.width = gw; c.height = gh;
    const ctx = c.getContext("2d");
    if (facingMode === "user") {
      const mx = vw - gx - gw;
      ctx.drawImage(video, mx, gy, gw, gh, 0, 0, gw, gh);
    } else {
      ctx.drawImage(video, gx, gy, gw, gh, 0, 0, gw, gh);
    }

    // Eye privacy bar for front face photos
    if (angle.guideMode === "front" && faceData?.allLandmarks?.length > 0) {
      const lm = faceData.allLandmarks;
      // Eye landmark indices: top/bottom of both eyes
      const eyeIndices = [33, 133, 159, 145, 160, 144, 153, 158, 263, 362, 386, 374, 385, 373, 380, 387];
      let eyeMinY = Infinity, eyeMaxY = -Infinity;
      eyeIndices.forEach(i => {
        if (lm[i]) {
          const ly = lm[i].y - gy; // translate to cropped coords
          if (ly < eyeMinY) eyeMinY = ly;
          if (ly > eyeMaxY) eyeMaxY = ly;
        }
      });
      if (eyeMinY < eyeMaxY) {
        const pad = (eyeMaxY - eyeMinY) * 0.6;
        const barY = Math.max(0, eyeMinY - pad);
        const barH = Math.min(gh - barY, (eyeMaxY - eyeMinY) + pad * 2);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, barY, gw, barH);
      }
    }

    onCapture(c.toDataURL("image/jpeg", 0.92));
  }, [facingMode, onCapture, angle, faceData]);

  const flipCamera = () => { const next = facingMode === "environment" ? "user" : "environment"; setFacingMode(next); startCamera(next); };
  const isMirrored = facingMode === "user";
  const inPosition = isFaceInGuide(faceData, angle.guideMode, dims.w, dims.h, isMirrored);
  const isReady = !angle.detectFace || inPosition;

  if (error) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", gap: 16, minHeight: 300 }}>
      <AlertCircle size={40} style={{ color: "#dc2626" }} /><p style={{ color: "#64748b", fontSize: 14, maxWidth: 280 }}>{error}</p>
      <button onClick={() => startCamera(facingMode)} style={btnPrimary}>Retry</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "10px 16px", width: "100%", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={iconBtn}><ArrowLeft size={20} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{angle.label}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{angle.instruction}</div>
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{angleIndex + 1}/{totalAngles}</span>
      </div>
      <div style={{ display: "flex", gap: 3, padding: "8px 16px", width: "100%", background: "#fff" }}>
        {Array.from({ length: totalAngles }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < angleIndex ? "#16a34a" : i === angleIndex ? "#2563eb" : "#e2e8f0" }} />
        ))}
      </div>
      <div style={{ position: "relative", width: dims.w, height: dims.h, background: "#000", borderRadius: 12, overflow: "hidden", margin: "0 12px" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: isMirrored ? "scaleX(-1)" : "none" }} />
        {cameraReady && <GuideOverlay faceData={faceData} guideMode={angle.guideMode} canvasW={dims.w} canvasH={dims.h} detectFace={angle.detectFace} mirrored={isMirrored} />}
        {!cameraReady && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={28} style={{ color: "#60a5fa", animation: "spin 1s linear infinite" }} /></div>}
        {cameraReady && angle.detectFace && (
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 5, background: inPosition ? "rgba(22,163,106,0.9)" : faceData?.detected ? "rgba(234,179,8,0.9)" : "rgba(100,116,139,0.8)", borderRadius: 20, padding: "4px 10px" }}>
            <CircleDot size={12} color="#fff" />
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 600 }}>{inPosition ? "Ready" : faceData?.detected ? "Center face" : "No face"}</span>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
      <div style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 20, width: "100%" }}>
        <button onClick={flipCamera} style={{ ...iconBtn, background: "#f1f5f9", width: 44, height: 44, borderRadius: 22, justifyContent: "center" }}><FlipHorizontal size={20} /></button>
        <button onClick={capturePhoto} disabled={!cameraReady} style={{ width: 68, height: 68, borderRadius: "50%", background: isReady ? "#16a34a" : "#e2e8f0", border: `4px solid ${isReady ? "#15803d" : "#cbd5e1"}`, cursor: cameraReady ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", boxShadow: isReady ? "0 0 24px rgba(22,163,106,0.3)" : "none" }}>
          <Camera size={26} style={{ color: isReady ? "#fff" : "#94a3b8" }} />
        </button>
        <div style={{ width: 44 }} />
      </div>
      {detectorType === "loading" && angle.detectFace && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px 8px" }}><Loader2 size={12} style={{ color: "#2563eb", animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 11, color: "#64748b" }}>Loading face model (cached after first use)...</span></div>}
      {detectorType === "none" && angle.detectFace && <p style={{ fontSize: 11, color: "#d97706", padding: "0 16px 8px", textAlign: "center" }}>Face detection unavailable. Position manually.</p>}
    </div>
  );
}

function PhotoReview({ photo, angle, onRetake, onAccept }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "24px 16px" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{angle.label}</div>
      <div style={{ fontSize: 12, color: "#16a34a", marginTop: -8 }}>Cropped and centered</div>
      <img src={photo} alt={angle.label} style={{ maxWidth: Math.min(380, window.innerWidth - 48), maxHeight: 500, borderRadius: 12, border: "2px solid #e2e8f0", objectFit: "contain" }} />
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={onRetake} style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6 }}><RotateCcw size={15} /> Retake</button>
        <button onClick={onAccept} style={{ ...btnPrimary, background: "#16a34a", display: "flex", alignItems: "center", gap: 6 }}><Check size={15} /> Use this</button>
      </div>
    </div>
  );
}

async function uploadToDrive(scriptUrl, patientId, angle, imageDataUrl) {
  const base64 = imageDataUrl.split(",")[1];
  return (await fetch(scriptUrl, { method: "POST", body: JSON.stringify({ patientId, angle, image: base64 }) })).json();
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [patientId, setPatientId] = useState("");
  const [patients, setPatients] = useState({});
  const [nextSerial, setNextSerial] = useState(1);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [viewingPatient, setViewingPatient] = useState(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { const s = storage.get("facecapture-state"); if (s) { setPatients(s.patients || {}); setNextSerial(s.nextSerial || 1); setDriveUrl(s.driveUrl || ""); } }, []);
  const persist = (p, ns, du) => { storage.set("facecapture-state", { patients: p ?? patients, nextSerial: ns ?? nextSerial, driveUrl: du ?? driveUrl }); };

  const startNewSession = () => { const id = generatePatientId(nextSerial); const ns = nextSerial + 1; setNextSerial(ns); setPatientId(id); const u = { ...patients, [id]: { photos: {}, createdAt: new Date().toISOString() } }; setPatients(u); persist(u, ns); setCurrentAngle(0); setCapturedPhoto(null); setScreen("capture"); };
  const resumeSession = (pid) => { setPatientId(pid); const n = ANGLES.findIndex(a => !patients[pid]?.photos[a.id]); setCurrentAngle(n >= 0 ? n : 0); setCapturedPhoto(null); setScreen("capture"); };
  const handleCapture = (d) => { setCapturedPhoto(d); setScreen("review"); };
  const handleAccept = () => { const p = { ...patients }; if (!p[patientId]) p[patientId] = { photos: {}, createdAt: new Date().toISOString() }; p[patientId].photos[ANGLES[currentAngle].id] = capturedPhoto; setPatients(p); persist(p); setCapturedPhoto(null); if (currentAngle < ANGLES.length - 1) { setCurrentAngle(currentAngle + 1); setScreen("capture"); } else { setViewingPatient(patientId); setScreen("gallery"); } };
  const downloadAll = async (pid) => { for (const [a, d] of Object.entries(patients[pid]?.photos || {})) { const l = document.createElement("a"); l.href = d; l.download = `${pid}_${a}.jpg`; document.body.appendChild(l); l.click(); document.body.removeChild(l); await new Promise(r => setTimeout(r, 350)); } };
  const uploadAllToDrive = async (pid) => { if (!driveUrl) { setUploadMsg("Set Apps Script URL in Settings."); return; } setUploading(true); setUploadMsg(""); try { for (const [a, d] of Object.entries(patients[pid]?.photos || {})) { await uploadToDrive(driveUrl, pid, a, d); } setUploadMsg(`Uploaded ${Object.keys(patients[pid]?.photos || {}).length} photos`); } catch { setUploadMsg("Upload failed."); } setUploading(false); };
  const deletePatient = (pid) => { const u = { ...patients }; delete u[pid]; setPatients(u); persist(u); if (viewingPatient === pid) { setScreen("home"); setViewingPatient(null); } };
  const completedCount = (pid) => Object.keys(patients[pid]?.photos || {}).length;
  const patientList = Object.entries(patients).sort((a, b) => (b[1].createdAt || "").localeCompare(a[1].createdAt || ""));

  const settingsModal = showSettings && (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowSettings(false)}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}><h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Google Drive Upload</h3><button onClick={() => setShowSettings(false)} style={iconBtn}><X size={18} /></button></div>
        <label style={labelStyle}>Apps Script URL</label>
        <input value={driveUrl} onChange={e => setDriveUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" style={inputStyle} />
        <button onClick={() => { persist(patients, nextSerial, driveUrl); setShowSettings(false); }} style={{ ...btnPrimary, width: "100%", marginTop: 16 }}>Save</button>
      </div>
    </div>
  );

  if (screen === "home") return (
    <div style={container}>{settingsModal}
      <div style={{ padding: "32px 20px 16px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 14, background: "#f0fdf4", marginBottom: 10 }}><Camera size={26} color="#16a34a" /></div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 2px" }}>FaceCapture</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Metabolic syndrome data collection</p>
      </div>
      <div style={card}><button onClick={startNewSession} style={{ ...btnPrimary, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 15 }}><Camera size={18} /> New Patient Session</button><p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, textAlign: "center", fontFamily: "monospace" }}>Next: {generatePatientId(nextSerial)}</p></div>
      <div style={{ padding: "0 20px 12px" }}><button onClick={() => setShowSettings(true)} style={{ ...btnSecondary, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13 }}><Settings size={14} /> Drive Settings</button></div>
      {patientList.length > 0 && <div style={card}><div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Patients ({patientList.length})</div>
        {patientList.map(([pid]) => { const c = completedCount(pid); const done = c === ANGLES.length; return (<div key={pid} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, border: done ? "1px solid #bbf7d0" : "1px solid #f1f5f9", marginBottom: 6 }}><div style={{ width: 36, height: 36, borderRadius: 10, background: done ? "#dcfce7" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? <Check size={16} color="#16a34a" /> : <User size={16} color="#94a3b8" />}</div><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{pid}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{c}/{ANGLES.length}</div></div><div style={{ display: "flex", gap: 2 }}><button onClick={() => { setViewingPatient(pid); setScreen("gallery"); }} style={iconBtn}><Eye size={15} /></button><button onClick={() => resumeSession(pid)} style={iconBtn}><Camera size={15} /></button><button onClick={() => downloadAll(pid)} style={iconBtn}><Download size={15} /></button>{driveUrl && <button onClick={() => uploadAllToDrive(pid)} style={iconBtn}><Upload size={15} /></button>}<button onClick={() => deletePatient(pid)} style={{ ...iconBtn, color: "#ef4444" }}><Trash2 size={15} /></button></div></div>); })}
        {uploadMsg && <p style={{ fontSize: 12, color: uploadMsg.includes("fail") ? "#dc2626" : "#16a34a", marginTop: 8 }}>{uploadMsg}</p>}
      </div>}
      <div style={{ padding: "12px 20px 24px" }}><div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12, display: "flex", gap: 8 }}><Shield size={16} style={{ color: "#16a34a", flexShrink: 0, marginTop: 1 }} /><p style={{ fontSize: 11, color: "#15803d", lineHeight: 1.6, margin: 0 }}>Photos cropped symmetrically and stored locally. MediaPipe model cached after first load.</p></div></div>
    </div>
  );

  if (screen === "capture") return (<div style={container}><CameraView onCapture={handleCapture} angle={ANGLES[currentAngle]} angleIndex={currentAngle} totalAngles={ANGLES.length} onBack={() => setScreen("home")} /><div style={{ display: "flex", justifyContent: "space-between", padding: "4px 16px 16px", width: "100%" }}><button disabled={currentAngle === 0} onClick={() => { setCurrentAngle(currentAngle - 1); setCapturedPhoto(null); }} style={{ ...btnSecondary, opacity: currentAngle === 0 ? 0.35 : 1, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><ChevronLeft size={14} /> Prev</button><button onClick={() => { if (currentAngle < ANGLES.length - 1) { setCurrentAngle(currentAngle + 1); setCapturedPhoto(null); } else { setViewingPatient(patientId); setScreen("gallery"); } }} style={{ ...btnSecondary, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>Skip <ChevronRight size={14} /></button></div></div>);

  if (screen === "review") return (<div style={container}><PhotoReview photo={capturedPhoto} angle={ANGLES[currentAngle]} onRetake={() => { setCapturedPhoto(null); setScreen("capture"); }} onAccept={handleAccept} /></div>);

  if (screen === "gallery") { const pid = viewingPatient; const photos = patients[pid]?.photos || {}; return (<div style={container}><div style={{ padding: 16, width: "100%" }}><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}><button onClick={() => setScreen("home")} style={iconBtn}><ArrowLeft size={20} /></button><div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 800 }}>{pid}</div><div style={{ fontSize: 12, color: "#64748b" }}>{Object.keys(photos).length}/{ANGLES.length}</div></div><button onClick={() => downloadAll(pid)} style={{ ...btnPrimary, fontSize: 12, padding: "8px 14px", display: "flex", alignItems: "center", gap: 5 }}><Download size={14} /> Export</button>{driveUrl && <button onClick={() => uploadAllToDrive(pid)} disabled={uploading} style={{ ...btnSecondary, fontSize: 12, padding: "8px 14px", display: "flex", alignItems: "center", gap: 5 }}>{uploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />} Drive</button>}</div>{uploadMsg && <p style={{ fontSize: 12, color: uploadMsg.includes("fail") ? "#dc2626" : "#16a34a", marginBottom: 10 }}>{uploadMsg}</p>}<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>{ANGLES.map(a => (<div key={a.id} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: photos[a.id] ? "2px solid #bbf7d0" : "2px dashed #e2e8f0" }}>{photos[a.id] ? <img src={photos[a.id]} alt={a.label} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} /> : <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}><Camera size={28} style={{ color: "#e2e8f0" }} /></div>}<div style={{ padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>{a.label}</span>{photos[a.id] ? <Check size={14} style={{ color: "#16a34a" }} /> : <button onClick={() => resumeSession(pid)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Capture</button>}</div></div>))}</div>{Object.keys(photos).length < ANGLES.length && <button onClick={() => resumeSession(pid)} style={{ ...btnPrimary, background: "#16a34a", width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Camera size={16} /> Continue</button>}</div></div>); }
  return null;
}

const container = { minHeight: "100vh", background: "#ffffff", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 480, margin: "0 auto" };
const card = { background: "#fff", borderRadius: 14, padding: 16, margin: "0 16px 12px", width: "calc(100% - 32px)", border: "1px solid #e2e8f0" };
const btnPrimary = { background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const btnSecondary = { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const iconBtn = { background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 };
const inputStyle = { width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#0f172a", boxSizing: "border-box" };
