import express from "express";
import OpenAI from "openai";
import cors from "cors";
import dotenv from "dotenv";

const app = express();
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

const sessions = new Map();

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // Validate inputs
    if (!message || typeof message !== "string" || !sessionId) {
      return res.status(400).json({ error: "Invalid message or sessionId." });
    }

    // Create session if it doesn't exist
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        messages: [],
        timestamps: {
          sessionStart: new Date(),
        },
        negotiationData: {
          agreementReached: false,
          agreementTerms: null,
          firstOffer: null,
          counterOffer: null,
          timeToCounter: null,
          timeToAgreement: null,
        },
      });
    }

    const session = sessions.get(sessionId);
    const now = new Date();
    const elapsedMin = Math.floor((now - session.timestamps.sessionStart) / 60000);

    const systemPrompt = `The Real Estate Transaction
Confidential Role for the Buyer

You are Martin Noble, the CEO of Star Real Estate. Yours is a medium-sized real estate development company investing mainly in residential projects... [FULL SCENARIO TEXT FROM USER INPUT GOES HERE] ...but do not reveal information that was confidential for you in the scenario.

The current session has been running for ${elapsedMin} minute${elapsedMin !== 1 ? "s" : ""}.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...session.messages,
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
    });

    const aiMessage = completion.choices[0]?.message;

    // Validate AI message
    if (!aiMessage || typeof aiMessage.content !== "string") {
      console.error("Invalid AI message:", aiMessage);
      return res.status(500).json({ error: "AI returned an invalid response." });
    }

    // Store conversation
    session.messages.push({ role: "user", content: message });
    session.messages.push({ role: "assistant", content: aiMessage.content });

    res.json({ response: aiMessage.content });
  } catch (error) {
    console.error("Error in /chat:", error);
    res.status(500).json({ error: "An error occurred" });
  }
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
