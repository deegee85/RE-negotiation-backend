const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const sessions = {};
const summaryData = [];

app.post("/start", (req, res) => {
  const { name, email, code } = req.body;
  if (!name || !email || !code) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const sessionId = uuidv4();
  const startTime = Date.now();
  const endTime = startTime + 18 * 60 * 1000;

  sessions[sessionId] = {
    name,
    email,
    code,
    startTime,
    endTime,
    transcript: [],
    firstOffer: null,
    counterOffer: null,
    agreementReached: false,
    agreementTime: null,
    firstOfferTime: null,
    counterOfferTime: null,
    ended: false,
  };

  res.json({ sessionId });
});

app.post("/chat", (req, res) => {
  const { sessionId, message } = req.body;
  const session = sessions[sessionId];
  if (!session) return res.status(400).json({ error: "Invalid session." });

  const now = Date.now();
  if (now >= session.endTime) {
    if (!session.ended) {
      session.ended = true;
      recordSummary(sessionId);
    }
    return res.json({ reply: "⏰ Time is up. The negotiation has ended." });
  }

  session.transcript.push({ sender: "user", message, timestamp: now });

  let reply = generateAIReply(message);

  session.transcript.push({ sender: "ai", message: reply, timestamp: now });

  // Detect first offer
  if (!session.firstOffer && isOffer(message)) {
    session.firstOffer = message;
    session.firstOfferTime = now;
    session.firstOfferSender = "user";
  }

  // Detect counteroffer
  if (session.firstOffer && !session.counterOffer && isOffer(reply)) {
    session.counterOffer = reply;
    session.counterOfferTime = now;
  }

  // Detect agreement
  if (session.firstOffer && /agree|deal|accept/i.test(message)) {
    session.agreementReached = true;
    session.agreementTime = now;
    if (!session.ended) {
      session.ended = true;
      recordSummary(sessionId);
    }
  }

  res.json({ reply });
});

app.get("/summary", (req, res) => {
  res.json(summaryData);
});

function generateAIReply(userMessage) {
  if (/price|offer|million/i.test(userMessage)) {
    return "That’s an interesting proposal. What’s your number?";
  } else if (/agree|deal|accept/i.test(userMessage)) {
    return "I believe we have a deal.";
  }
  return "Can you clarify your position a bit more?";
}

function isOffer(message) {
  return /\$\d+|\d+ million/i.test(message);
}

function recordSummary(sessionId) {
  const s = sessions[sessionId];
  summaryData.push({
    name: s.name,
    email: s.email,
    firstOffer: s.firstOffer || "—",
    counterOffer: s.counterOffer || "—",
    timeToCounteroffer: s.firstOfferTime && s.counterOfferTime
      ? ((s.counterOfferTime - s.firstOfferTime) / 1000).toFixed(1) + "s"
      : "—",
    timeToAgreement: s.firstOfferTime && s.agreementTime
      ? ((s.agreementTime - s.firstOfferTime) / 1000).toFixed(1) + "s"
      : "—",
    agreement: s.agreementReached ? "✅" : "❌",
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
