import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";  // You must import pdfkit for PDF generation

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Allow only your frontend domain
app.use(
  cors({
    origin: "https://re-negotiation-frontend.onrender.com",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

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

// Helper functions for offer parsing and acceptance logic
function extractOfferFromText(text) {
  // Extract first number that looks like a monetary offer, e.g. "$900,000" or "900000"
  const match = text.match(/\$?([\d,]+(\.\d{1,2})?)/);
  if (match) {
    return Number(match[1].replace(/,/g, ""));
  }
  return null;
}

function isAcceptableOffer(offer) {
  // Example acceptable offer threshold - change as needed
  return offer >= 850000;
}

function evaluateNegotiationStyle(history) {
  // Placeholder: a simple stub, you can improve this with NLP analysis
  return "reasonable and following a clear logic.";
}

function evaluateAgreement(agreement) {
  // Placeholder: determine if agreement is good/fair
  return "fair and equitable";
}

function answerUserQuestion(message) {
  // Placeholder response for questions after negotiation ends
  return "Thank you for your question. I cannot reveal confidential information.";
}

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
      firstOfferBy: null,
      counterOffer: null,
      agreement: null,
      history: [], // initialize chat history
      timestamps: {
        firstOffer: null,
        counterOffer: null,
        agreement: null,
        sessionStart: new Date(),
      },
      isFeedbackPhase: false, // NEW flag to track if feedback phase started
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

  const now = new Date();

  // Calculate elapsed time in minutes
  const elapsedMinutes = (now - session.timestamps.sessionStart) / 60000;

  // If in feedback phase, treat user messages as questions
  if (session.isFeedbackPhase) {
    session.history.push({ role: "user", message, timestamp: now.toISOString() });

    const answer = answerUserQuestion(message);
    session.history.push({ role: "ai", message: answer, timestamp: new Date().toISOString() });

    return res.json({ reply: answer });
  }

  // If time limit reached and no agreement yet
  if (elapsedMinutes >= 18 && !session.isFeedbackPhase) {
    if (!session.agreement) {
      const noDealMsg =
        "I feel there is no chance of a mutually beneficial agreement within the time limit of 18 minutes. Continuing negotiations might damage my reputation as a fair negotiator.";
      session.history.push({ role: "ai", message: noDealMsg, timestamp: now.toISOString() });
      session.isFeedbackPhase = true;

      // Send this message and return early
      return res.json({ reply: noDealMsg });
    }
  }

  try {
    // Call OpenAI API for AI response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Martin Noble, the CEO of Star Real Estate. Your goal is to negotiate the purchase of land in Bereford. Do not reveal any confidential information. You will only negotiate for a maximum of 18 minutes or until an agreement is reached, whichever comes first. Should 18 minutes elapse without an agreement, you will declare the negotiation ended and provide feedback.",
        },
        ...session.history.map((entry) => ({
          role: entry.role,
          content: entry.message,
        })),
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;

    // Track chat history
    session.history.push({ role: "user", message, timestamp: now.toISOString() });
    session.history.push({ role: "ai", message: reply, timestamp: now.toISOString() });

    // --- Offer tracking ---
    // Detect offers in user and AI messages
    const userOffer = extractOfferFromText(message);
    const aiOffer = extractOfferFromText(reply);

    // First offer assignment
    if (!session.firstOffer) {
      if (userOffer !== null) {
        session.firstOffer = userOffer;
        session.firstOfferBy = "user";
        session.timestamps.firstOffer = now;
      } else if (aiOffer !== null) {
        session.firstOffer = aiOffer;
        session.firstOfferBy = "ai";
        session.timestamps.firstOffer = now;
      }
    } else if (!session.counterOffer) {
      // Counteroffer: the offer after first offer by the opposite party
      if (session.firstOfferBy === "user" && aiOffer !== null) {
        session.counterOffer = aiOffer;
        session.timestamps.counterOffer = now;
      } else if (session.firstOfferBy === "ai" && userOffer !== null) {
        session.counterOffer = userOffer;
        session.timestamps.counterOffer = now;
      }
    }

    // Check if user makes last-minute acceptable offer after 18 mins, accept it
    if (elapsedMinutes >= 18 && !session.agreement && userOffer !== null && isAcceptableOffer(userOffer)) {
      session.agreement = userOffer;
      session.timestamps.agreement = now;

      const acceptMsg =
        "Thank you for your last-minute concession. I accept this offer and congratulate you on reaching an agreement.";
      session.history.push({ role: "ai", message: acceptMsg, timestamp: now.toISOString() });
      session.isFeedbackPhase = true;

      return res.json({ reply: acceptMsg });
    }

    // Agreement detection (in either user or AI messages)
    if (/(we have a deal|i accept|let's proceed|agreed|we can agree)/i.test(message + reply)) {
      session.agreement = reply;
      session.timestamps.agreement = now;
      session.isFeedbackPhase = true; // Start feedback phase
    }

    // If feedback phase started now, send feedback message next time user sends message
    if (session.isFeedbackPhase) {
      // Compose feedback message
      const feedback =
        `Martin felt that your negotiation style was ${evaluateNegotiationStyle(session.history)}.\n\n` +
        (session.agreement
          ? `The agreement reached is ${evaluateAgreement(session.agreement)} for Martin.\n\n`
          : "No agreement was reached in this negotiation.\n\n") +
        "Do you have any questions about how Martin approached the negotiation? I will answer without revealing confidential information.";

      session.history.push({ role: "ai", message: feedback, timestamp: now.toISOString() });

      return res.json({ reply: feedback });
    }

    // Otherwise, return AI reply as normal
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
    const prefix = entry.role === "user" ? `${session.name}:` : "Martin: ";
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
          ? `${Math.round((timestamps.counterOffer - timestamps.firstOffer) / 1000)} sec`
          : null,
      timeToAgreement:
        timestamps.firstOffer && timestamps.agreement
          ? `${Math.round((timestamps.agreement - timestamps.firstOffer) / 1000)} sec`
          : null,
    };
  });

  res.json({ summaries });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
