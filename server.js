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

app.post("/chat", async (req, res) => {
  try {
    const userInput = req.body.message;
    if (!userInput) {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

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
          content: userInput,
        },
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;

    res.json({ reply });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
