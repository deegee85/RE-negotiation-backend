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

// Add this near your other endpoints
app.get("/results", async (req, res) => {
  try {
    const data = await readData();

    let html = `
      <html>
        <head>
          <title>Negotiation Results</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:hover { background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <h2>Negotiation Results</h2>
          <table>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>First Offer By</th>
              <th>First Offer</th>
              <th>Counteroffer</th>
              <th>Counter Delay (s)</th>
              <th>Agreement</th>
              <th>Agreement Terms</th>
              <th>Time to Agreement (s)</th>
            </tr>
    `;

    for (const row of data) {
      html += `
        <tr>
          <td>${row.name || ""}</td>
          <td>${row.email || ""}</td>
          <td>${row.firstOfferBy || ""}</td>
          <td>${row.firstOffer || ""}</td>
          <td>${row.counterOffer || ""}</td>
          <td>${row.counterDelay ?? ""}</td>
          <td>${row.agreementReached ? "Yes" : "No"}</td>
          <td>${row.agreementTerms || ""}</td>
          <td>${row.timeToAgreement ?? ""}</td>
        </tr>
      `;
    }

    html += `
          </table>
        </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error("Error generating results page:", err);
    res.status(500).send("Error generating results page.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
