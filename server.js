import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory session data (keyed by email)
const sessions = new Map();

// Route to start a new session
app.post("/start", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Missing name or email" });
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

  res.json({ message: "Session started" });
});

// Route for sending/receiving chat messages
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

    // Tracking logic
    const lowerMsg = message.toLowerCase();
    const lowerReply = reply.toLowerCase();
    const now = new Date();

    // Detect offer from user
    if (!session.firstOffer && /\$\d/.test(message)) {
      session.firstOffer = message;
      session.timestamps.firstOffer = now;
    }

    // Detect counteroffer from AI
    if (
      session.firstOffer &&
      !session.counterOffer &&
      /\$\d/.test(reply)
    ) {
      session.counterOffer = reply;
      session.timestamps.counterOffer = now;
    }

    // Detect agreement
    if (
      /(we have a deal|i accept|let's proceed|agreed|we can agree)/i.test(message + reply)
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

// Route to retrieve summary of all negotiations (for admin use)
app.get("/summary", (req, res) => {
  const summaries = Array.from(sessions.values()).map((session) => {
    const {
      name,
      email,
      firstOffer,
      counterOffer,
      agreement,
      timestamps,
    } = session;

    const summary = {
      name,
      email,
      firstOffer,
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

    return summary;
  });

  res.json({ summaries });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
