import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Allow only your frontend domain
app.use(cors({
  origin: 'https://re-negotiation-frontend.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Load access codes from JSON file
function loadAccessCodes() {
  const filePath = path.resolve("accessCodes.json");
  const raw = fs.readFileSync(filePath);
  return JSON.parse(raw);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory session data (keyed by email)
const sessions = new Map();

// Route to start a new session (validates access code + sets up session)
app.post("/start", (req, res) => {
  const { name, email, code } = req.body;

  if (!name || !email || !code) {
    return res.status(400).json({ error: "Missing name, email, or code" });
  }

  const codes = loadAccessCodes();
  if (!codes.includes(code)) {
    return res.status(403).json({ error: "Invalid access code" });
  }

  if (!sessions.has(email)) {
    sessions.set(email, {
      name,
      email,
      firstOffer: null,
      counterOffer: null,
      agreement: null,
      timestamps: {
        firstOffer: null,
        counterOffer: null,
        agreement: null,
        sessionStart: new Date(),
      },
    });
  }

  console.log(`✅ Access granted for ${name} (${email}) with code ${code}`);
  res.json({ message: "Session started" });
});

app.post("/chat", async (req, res) => {
  const { message, email } = req.body;

  if (!message || !email) {
    return res.status(400).json({ error: "Missing message or email" });
  }

  const session = sessions.get(email);
  if (!session) {
    return res.status(400).json({ error: "Session not found for this email" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Martin Noble, the CEO of Star Real Estate. Your goal is to negotiate the purchase of land in Bereford. Do not reveal any confidential information.",
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;

    // --- Tracking logic ---
    const lowerMsg = message.toLowerCase();
    const lowerReply = reply.toLowerCase();
    const now = new Date();
    const offerRegex = /\$\s?\d/;


    // Track chat history --- NEW ---
    session.history.push({
      role: "user",
      message,
      timestamp: now.toISOString(),
    });
    session.history.push({
      role: "ai",
      message: reply,
      timestamp: now.toISOString(),
    });


    // First offer from user
    if (!session.firstOffer && offerRegex.test(message)) {
      session.firstOffer = message;
      session.firstOfferBy = "user";
      session.timestamps.firstOffer = now;
    }

    // First offer from AI
    if (!session.firstOffer && offerRegex.test(reply)) {
      session.firstOffer = reply;
      session.firstOfferBy = "ai";
      session.timestamps.firstOffer = now;
    }

    // Counteroffer logic
    if (
      session.firstOffer &&
      !session.counterOffer &&
      session.firstOfferBy === "user" &&
      offerRegex.test(reply)
    ) {
      session.counterOffer = reply;
      session.timestamps.counterOffer = now;
    }

    if (
      session.firstOffer &&
      !session.counterOffer &&
      session.firstOfferBy === "ai" &&
      offerRegex.test(message)
    ) {
      session.counterOffer = message;
      session.timestamps.counterOffer = now;
    }

    // Agreement detection
    if (
      /(we have a deal|i accept|let's proceed|agreed|we can agree)/i.test(
        message + reply
      )
    ) {
      session.agreement = reply;
      session.timestamps.agreement = now;
    }

    res.json({ reply });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- NEW --- Route to download transcript as PDF
app.get("/transcript/:email", (req, res) => {
  const { email } = req.params;
  const session = sessions.get(email);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${session.name.replace(/ /g, "_")}_transcript.pdf"`
  );

  doc.pipe(res);

  doc.fontSize(16).text(`Negotiation Transcript for ${session.name}`, {
    align: "center",
  });
  doc.moveDown();

  session.history.forEach((entry) => {
    const prefix = entry.role === "user" ? `${session.name}:` : "Martin:";
    doc.fontSize(12).text(`[${entry.timestamp}] ${prefix} ${entry.message}`);
    doc.moveDown(0.5);
  });

  doc.end();
});


// Route to retrieve summary of all negotiations
app.get("/summary", (req, res) => {
  const summaries = Array.from(sessions.values()).map((session) => {
    const {
      name,
      email,
      firstOffer,
      counterOffer,
      agreement,
      timestamps,
      firstOfferBy,
    } = session;

    return {
      name,
      email,
      firstOffer,
      firstOfferBy: firstOfferBy || "unknown",
      counterOffer,
      agreement,
      timeToCounter:
        timestamps.firstOffer && timestamps.counterOffer
          ? `${Math.round(
              (timestamps.counterOffer - timestamps.firstOffer) / 1000
            )} sec`
          : null,
      timeToAgreement:
        timestamps.firstOffer && timestamps.agreement
          ? `${Math.round(
              (timestamps.agreement - timestamps.firstOffer) / 1000
            )} sec`
          : null,
    };
  });

  res.json({ summaries });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
