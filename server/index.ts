import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { aiMoveHandler } from "./routes/aiMove";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set — copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/ai-move", (req, res, next) => {
  aiMoveHandler(req, res).catch(next);
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`AI backend listening on http://localhost:${PORT}`);
});
