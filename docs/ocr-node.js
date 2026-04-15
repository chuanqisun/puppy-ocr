import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { fileURLToPath } from "url";

const API_URL = "https://89f849v6s7oe6fea.aistudio-app.com/layout-parsing";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = path.resolve(SCRIPT_DIR, "input");
const OUTPUT_DIR = path.resolve(SCRIPT_DIR, "output");

async function promptForToken() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const token = (await rl.question("Enter API token: ")).trim();

    if (!token) {
      throw new Error("API token is required.");
    }

    return token;
  } finally {
    rl.close();
  }
}

async function processFiles(token) {
  // Ensure directories exist
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`Input directory ${INPUT_DIR} not found.`);
    return;
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Get all PDF files from input directory
  const files = fs.readdirSync(INPUT_DIR).filter((file) => file.toLowerCase().endsWith(".pdf"));

  if (files.length === 0) {
    console.log("No PDF files found in input directory.");
    return;
  }

  for (const fileName of files) {
    const filePath = path.join(INPUT_DIR, fileName);
    const baseName = path.parse(fileName).name;

    console.log(`Processing: ${fileName}...`);

    try {
      // 1. Read file and convert to Base64
      const fileBuffer = fs.readFileSync(filePath);
      const fileData = fileBuffer.toString("base64");

      const payload = {
        file: fileData,
        fileType: 0, // 0 for PDF
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useChartRecognition: false,
      };

      // 2. Call API
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`Failed to process ${fileName}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      // 3. Save Full JSON Result
      const jsonPath = path.join(OUTPUT_DIR, `${baseName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
      console.log(`  - Saved JSON: ${jsonPath}`);

      // 4. Extract and Save Markdown
      if (data.result && data.result.layoutParsingResults) {
        let combinedMarkdown = "";

        data.result.layoutParsingResults.forEach((res, index) => {
          combinedMarkdown += `<!-- Page ${index + 1} -->\n${res.markdown.text}\n\n`;

          // Optional: Save individual images if they exist in the markdown
          // (This part follows the logic of your original python script)
          for (const [imgRelPath, imgUrl] of Object.entries(res.markdown.images || {})) {
            downloadImage(imgUrl, path.join(OUTPUT_DIR, imgRelPath));
          }
        });

        const mdPath = path.join(OUTPUT_DIR, `${baseName}.md`);
        fs.writeFileSync(mdPath, combinedMarkdown);
        console.log(`  - Saved Markdown: ${mdPath}`);
      }
    } catch (error) {
      console.error(`Error processing ${fileName}:`, error.message);
    }
  }
}

/**
 * Helper to download images referenced in the API response
 */
async function downloadImage(url, destPath) {
  try {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const res = await fetch(url);
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
    }
  } catch (e) {
    console.error(`    Failed to download image: ${url}`);
  }
}

promptForToken()
  .then((token) => processFiles(token))
  .then(() => console.log("Batch processing complete."))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
