import cors from "cors";
import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Replicate from "replicate";

const app = express();
const port = Number.parseInt(process.env.PORT || "3001", 10);
const replicateToken = process.env.REPLICATE_API_TOKEN;

if (!replicateToken) {
  throw new Error("Missing REPLICATE_API_TOKEN in the environment.");
}

const replicate = new Replicate({ auth: replicateToken });
const dataDir = path.resolve(process.cwd(), "data");

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/", (_req, res) => {
  res.type("text/plain").send("life-config image API is running.");
});

function createDebugFileBase() {
  return `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseDataUri(dataUri) {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUri);

  if (!match) {
    throw new Error("Reference image must be a base64 data URI.");
  }

  const [, mimeType, base64Data] = match;
  const extension = mimeType.split("/")[1] || "bin";

  return {
    mimeType,
    extension,
    buffer: Buffer.from(base64Data, "base64"),
  };
}

async function saveDebugImages(referenceImage, imageBuffer, outputContentType) {
  await mkdir(dataDir, { recursive: true });

  const fileBase = createDebugFileBase();
  const parsedReference = parseDataUri(referenceImage);
  const outputExtension = (outputContentType || "image/webp").split("/")[1] || "bin";

  await Promise.all([
    writeFile(path.join(dataDir, `${fileBase}-input.${parsedReference.extension}`), parsedReference.buffer),
    writeFile(path.join(dataDir, `${fileBase}-output.${outputExtension}`), imageBuffer),
  ]);
}

async function handleGenerate(prompt, referenceImage, res) {
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  const normalizedReferenceImage = typeof referenceImage === "string" ? referenceImage.trim() : "";

  if (!normalizedPrompt) {
    res.status(400).json({ error: "Missing required query parameter: prompt" });
    return;
  }

  try {
    const output = await replicate.run("black-forest-labs/flux-2-klein-4b", {
      input: {
        images: normalizedReferenceImage ? [normalizedReferenceImage] : [],
        prompt: normalizedPrompt,
        image_format: "webp",
        aspect_ratio: "1:1",
        output_quality: 95,
        output_megapixels: "1",
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
    const outputContentType = imageResponse.headers.get("content-type") || "image/webp";

    if (normalizedReferenceImage) {
      await saveDebugImages(normalizedReferenceImage, imageBuffer, outputContentType);
    }

    res.setHeader("Content-Type", outputContentType);
    res.setHeader("Cache-Control", "no-store");
    res.send(imageBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Image generation failed." });
  }
}

app.get("/api/generate", async (req, res) => {
  await handleGenerate(req.query.prompt, req.query.referenceImage, res);
});

app.post("/api/generate", async (req, res) => {
  await handleGenerate(req.body?.prompt, req.body?.referenceImage, res);
});

app.listen(port, () => {
  console.log(`life-config image API listening on http://localhost:${port}`);
});
