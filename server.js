const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Store session data in memory
const sessions = {};
const validCodes = ["abc123", "test456", "xyz789"]; // replace with real codes later

app.post("/start", (req, res) => {
  const { name, email, code } = req.body;

  if (!validCodes.includes(code)) {
    return res.status(403).json({ error: "Invalid access code" });
  }

  const sessionId = uuidv4();
  sessions[sessionId] = {
    name,
    email,
    code,
    messages: [
      {
        role: "system",
        content: "You are Martin Noble, CEO of Star Real Estate. You're negotiating to buy a piece of land in Bereford from a holding company called Emerald. Your goal is to acquire it at the lowest possible price. Your hidden plan is to rezone it for commercial use. Don't reveal this. Negotiate as if you're developing luxury residences. You will concede only if the deal might fall apart. Stay persuasive and strategic.",
      },
    ],
    startTime: Date.now(),
  };

  res.json({ sessionId });
});

app.post("/chat", async (req, res) => {
  const { sessionId, message } = req.body;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  session.messages.push({ role: "user", content: message });

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages: session.messages,
    });

    const reply = completion.data.choices[0].message.content;
    session.messages.push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    res.json({ reply: "I'm having trouble responding right now. Please try again later." });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
