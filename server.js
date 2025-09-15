const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

let { FormData } = require("formdata-node");
if (!FormData) {
  console.warn("formdata-node not found, falling back to form-data (deprecated).");
  ({ FormData } = require("form-data"));
}

const app = express();

// ====== Config ======
const AUTH_API = "https://authentication-8e1c.onrender.com/auth";
const MONGO_URI = "mongodb+srv://sasinew49_db_user:TcFkmDIaiccTDO3W@cluster-resumeproject.6dhm1e9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster-ResumeProject";
const PORT = process.env.PORT || 4000;

// ====== MongoDB Setup ======
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ====== Schema & Model ======
const ResumeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  file: { data: Buffer, contentType: String },
  originalFileName: String,
  uploadedAt: { type: Date, default: Date.now },
});
const Resume = mongoose.model("Resume", ResumeSchema, "resumes");

// ====== Middlewares ======
app.use(cors({
  origin: [
    "http://127.0.0.1:5500",
    "https://your-frontend-domain.com"  // 🔁 replace this with actual frontend domain
  ],
  credentials: true
}));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ====== Auth Proxy ======
app.post("/auth", async (req, res) => {
  try {
    const formData = new FormData();
    formData.append("email", req.body.email);
    formData.append("password", req.body.password);
    formData.append("action", req.body.action);

    const response = await fetch(AUTH_API, { method: "POST", body: formData });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("❌ Auth error:", err);
    res.status(500).json({ message: "Auth service unavailable", error: err.message });
  }
});

// ====== Resume Upload ======
app.post("/resume/upload", upload.single("resume"), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !req.file) return res.status(400).json({ error: "Email and resume required" });

    const resume = await Resume.findOneAndUpdate(
      { email },
      {
        file: { data: req.file.buffer, contentType: req.file.mimetype },
        originalFileName: req.file.originalname,
        uploadedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ message: "✅ Resume uploaded successfully", resume });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: "Failed to upload resume", details: err.message });
  }
});

// ====== Fetch Jobs ======
app.post("/fetchJobs", upload.single("resume"), async (req, res) => {
  try {
    let resumeBuffer;

    if (req.file) {
      resumeBuffer = req.file.buffer;
    } else if (req.body.email) {
      const resume = await Resume.findOne({ email: req.body.email });
      if (!resume) return res.status(404).json({ error: "Resume not found" });
      resumeBuffer = resume.file.data;
    } else {
      return res.status(400).json({ error: "Resume or email required" });
    }

    if (!resumeBuffer || resumeBuffer.length === 0)
      return res.status(400).json({ error: "Resume file is empty or invalid" });

    const formData = new FormData();
    const blob = new Blob([resumeBuffer], { type: 'application/pdf' });
    formData.append("file", blob, { filename: "resume.pdf", contentType: "application/pdf" });

    const response = await fetch(
      "https://eday-project.onrender.com/api/v1/alerts/upload?top_k=3",
      { method: "POST", body: formData, headers: { "Accept": "application/json" } }
    );

    const responseBody = await response.text();
    if (!response.ok) throw new Error(`API request failed with status ${response.status}: ${responseBody}`);

    const data = JSON.parse(responseBody);
    res.json(data);
  } catch (err) {
    console.error("❌ FetchJobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs", details: err.message });
  }
});

// ====== Start Server ======
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
