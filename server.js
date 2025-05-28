const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const validCodes = new Set(["ABC123", "DEF456", "GHI789"]); // Add your own codes
const sessions = {}; // Stores session data

// --- Handle login and return sessionId ---
app.post("/start", (req, res) => {
  const { name, email, code } = req.body;

  if (!name || !email || !code) {
    return res.status(400).json({ error: "Missing name, email, or code" });
  }

  if (!validCodes.has(code)) {
    return res.status(403).json({ error: "Invalid access code" });
  }

  const sessionId = uuidv4();
  sessions[sessionId] = {
    name,
    email,
    code,
    history: [],
    startTime: new Date(),
    agreementReached: false,
    agreementTerms: null,
    firstOffer: null,
    firstOfferTime: null,
    counterOffer: null,
    counterOfferTime: null,
  };

  res.json({ sessionId });
});

// --- Handle chat messages ---
app.post("/chat", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: "Invalid message or sessionId" });
  }

  const session = sessions[sessionId];
  session.history.push({ from: "user", message, timestamp: new Date() });

  // Placeholder: Replace this with your AI logic
  const aiReply = `Echo: ${message}`;
  session.history.push({ from: "ai", message: aiReply, timestamp: new Date() });

  res.json({ reply: aiReply });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
