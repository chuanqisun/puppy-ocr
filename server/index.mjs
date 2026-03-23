import cors from "cors";
import express from "express";
import Replicate from "replicate";

const app = express();
const port = Number.parseInt(process.env.PORT || "3001", 10);
const replicateToken = process.env.REPLICATE_API_TOKEN;

if (!replicateToken) {
  throw new Error("Missing REPLICATE_API_TOKEN in the environment.");
}

const replicate = new Replicate({ auth: replicateToken });

app.use(cors());

app.get("/", (_req, res) => {
  res.type("text/plain").send("life-config image API is running.");
});

app.get("/api/generate", async (req, res) => {
  const prompt = typeof req.query.prompt === "string" ? req.query.prompt.trim() : "";

  if (!prompt) {
    res.status(400).json({ error: "Missing required query parameter: prompt" });
    return;
  }

  try {
    const output = await replicate.run("black-forest-labs/flux-schnell", {
      input: {
        prompt,
        image_format: "webp",
        aspect_ratio: "1:1",
      },
    });

    const fileOutput = Array.isArray(output) ? output[0] : output;

    if (!fileOutput || typeof fileOutput !== "object" || !("url" in fileOutput) || typeof fileOutput.url !== "function") {
      throw new Error("Replicate did not return an image URL.");
    }

    const imageResponse = await fetch(fileOutput.url());

    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    res.setHeader("Content-Type", imageResponse.headers.get("content-type") || "image/webp");
    res.setHeader("Cache-Control", "no-store");
    res.send(imageBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Image generation failed." });
  }
});

app.listen(port, () => {
  console.log(`life-config image API listening on http://localhost:${port}`);
});
