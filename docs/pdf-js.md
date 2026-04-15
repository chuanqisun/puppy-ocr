### pdf-lib (Recommended)

**pdf-lib** is the industry standard for browser-based PDF manipulation. It allows you to load an existing PDF, extract specific pages, and save them as a new document.

- **Pros:** Pure JavaScript, works in all modern browsers, supports merging, splitting, and form filling.
- **How to split:** You load the source document, create a new document, and use `copyPages` to transfer specific page indices from the source to the new document.
- **Example Code Snippet:**

  ```javascript
  import { PDFDocument } from "pdf-lib";

  async function splitPdf(existingPdfBytes, startPage, endPage) {
    const srcDoc = await PDFDocument.load(existingPdfBytes);
    const newDoc = await PDFDocument.create();

    // Indices are 0-based
    const pageIndices = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);

    copiedPages.forEach((page) => newDoc.addPage(page));

    const pdfBytes = await newDoc.save();
    return pdfBytes; // This can be downloaded as a Blob
  }
  ```
