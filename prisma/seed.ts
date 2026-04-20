import { deflateSync } from "node:zlib";
import { put } from "@vercel/blob";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SampleBook = {
  slug: string;
  title: string;
  description: string;
  author: string;
  format: "PDF" | "EPUB";
  category:
    | "SELF_IMPROVEMENT"
    | "PHILOSOPHY"
    | "PHILOSOPHICAL_FICTION"
    | "PSYCHOLOGY_BEHAVIOR"
    | "FINANCE_BUSINESS"
    | "STRATEGY_POWER"
    | "ADDICTION_RECOVERY";
  pageCount: number;
  publicationDate: string;
  coverPalette: [number, number, number][];
  pages: string[][];
};

const samples: SampleBook[] = [
  {
    slug: "small-systems-for-focus",
    title: "Small Systems for Focus",
    description:
      "A concise field guide about shaping daily attention with small repeatable systems, reflection notes, and quiet review loops.",
    author: "Mara Vale",
    format: "PDF",
    category: "SELF_IMPROVEMENT",
    pageCount: 6,
    publicationDate: "2024-02-12T00:00:00.000Z",
    coverPalette: [
      [36, 73, 65],
      [198, 214, 204],
      [244, 245, 242],
    ],
    pages: [
      ["Small Systems for Focus", "A practice notebook for attention.", "Start with one repeatable action. Keep it small enough to finish even on a difficult day."],
      ["Choose the next clear step.", "A focused session begins before the timer starts. Write the next visible action in plain language."],
      ["Reduce open loops.", "Capture stray tasks in one place. Return to the page without negotiating with every thought."],
      ["Review lightly.", "At the end of a session, record what helped and what blocked the work. Keep the review brief."],
      ["Protect the first minutes.", "Do not spend the beginning of a session arranging tools. The first minutes belong to reading, writing, or thinking."],
      ["Continue tomorrow.", "Progress is easier to resume when the stopping point is marked. Leave a sentence for your next self."],
    ],
  },
  {
    slug: "quiet-morning-practice",
    title: "A Quiet Morning Practice",
    description:
      "A short reflowable reader on morning structure, notebooks, low-friction routines, and protecting the first hour from noise.",
    author: "Jon Bell",
    format: "EPUB",
    category: "SELF_IMPROVEMENT",
    pageCount: 94,
    publicationDate: "2023-09-18T00:00:00.000Z",
    coverPalette: [
      [68, 92, 78],
      [231, 236, 231],
      [35, 37, 34],
    ],
    pages: [
      ["The First Hour", "A quiet morning does not need to be elaborate. It needs a beginning that can survive ordinary life."],
      ["Notebook Before Noise", "Write the date, one line about your state, and one thing worth doing before opening any feed."],
      ["A Soft Boundary", "A good routine has edges without becoming brittle. When the morning changes, keep the smallest useful part."],
      ["Reading Slowly", "A page read with attention changes the room. Let the first text of the day be chosen rather than accidental."],
    ],
  },
  {
    slug: "discipline-without-noise",
    title: "Discipline Without Noise",
    description:
      "Notes on practical discipline without harsh self-talk, built around environment design, clear limits, and weekly adjustment.",
    author: "Elena Hart",
    format: "PDF",
    category: "SELF_IMPROVEMENT",
    pageCount: 5,
    publicationDate: "2022-06-03T00:00:00.000Z",
    coverPalette: [
      [31, 33, 31],
      [160, 188, 178],
      [239, 239, 237],
    ],
    pages: [
      ["Discipline Without Noise", "Discipline is easier to keep when it is less theatrical."],
      ["Make the desired action visible.", "Place the book, page, or tool where the next action can begin without search."],
      ["Use fewer rules.", "A small number of honest rules beats a complex system abandoned by Wednesday."],
      ["Adjust weekly.", "The point of review is not blame. It is calibration."],
      ["Stay ordinary.", "The strongest systems disappear into the day. They do their work quietly."],
    ],
  },
  {
    slug: "reset-journal",
    title: "Reset Journal",
    description:
      "A calm journal-style EPUB for tracking triggers, urges, sleep, movement, and replacement habits during a reset period.",
    author: "Nolan Reed",
    format: "EPUB",
    category: "ADDICTION_RECOVERY",
    pageCount: 126,
    publicationDate: "2024-05-22T00:00:00.000Z",
    coverPalette: [
      [43, 86, 94],
      [218, 229, 226],
      [247, 247, 247],
    ],
    pages: [
      ["Reset Journal", "This journal is a place to notice patterns without turning every day into a trial."],
      ["Trigger Log", "Record the time, setting, feeling, and need underneath the urge. Use plain words."],
      ["Replacement Habits", "Choose actions that change state quickly: water, a walk, a call, a page, a shower, sleep."],
      ["Weekly Notes", "Look for repeating conditions. Adjust the environment before relying on willpower."],
    ],
  },
  {
    slug: "urge-surfing-workbook",
    title: "Urge Surfing Workbook",
    description:
      "A simple PDF workbook about noticing urges as temporary body states, with short timed exercises and reflection prompts.",
    author: "Nolan Reed",
    format: "PDF",
    category: "ADDICTION_RECOVERY",
    pageCount: 7,
    publicationDate: "2023-11-09T00:00:00.000Z",
    coverPalette: [
      [45, 63, 57],
      [202, 218, 211],
      [86, 121, 108],
    ],
    pages: [
      ["Urge Surfing Workbook", "An urge rises, changes, and falls. The practice is to stay present while it moves."],
      ["Name the wave.", "Write the body sensations without interpretation: heat, pressure, restlessness, tightness."],
      ["Set a timer.", "Use ten minutes. During the timer, do not solve your whole life. Just observe."],
      ["Change posture.", "Stand, breathe, or walk. A small physical change can interrupt automatic behavior."],
      ["Record the after-state.", "What changed after ten minutes? What helped? What made it harder?"],
      ["Plan a barrier.", "Add one obstacle between the urge and the habit. Make the obstacle concrete."],
      ["Return to the day.", "The goal is not drama. The goal is returning."],
    ],
  },
  {
    slug: "clear-weeks",
    title: "Clear Weeks",
    description:
      "A compact EPUB about planning a clean week: sleep anchors, screen boundaries, accountability, and reading as a replacement rhythm.",
    author: "Isa Chen",
    format: "EPUB",
    category: "ADDICTION_RECOVERY",
    pageCount: 88,
    publicationDate: "2022-01-14T00:00:00.000Z",
    coverPalette: [
      [65, 83, 74],
      [237, 240, 236],
      [116, 148, 133],
    ],
    pages: [
      ["Clear Weeks", "A clear week is designed before the hard moment arrives."],
      ["Sleep Anchor", "Pick a sleep boundary first. Late fatigue makes every other promise heavier."],
      ["Screen Boundary", "Move the most risky screen use out of private, tired hours."],
      ["Replacement Rhythm", "Keep a book, walk, or simple task ready. Replacement works best when it is close."],
    ],
  },
];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createCoverPng(palette: [number, number, number][], seed: number) {
  const width = 640;
  const height = 960;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;

  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;

    for (let x = 0; x < width; x += 1) {
      const band = Math.floor((x / width) * 5 + (y / height) * 3 + seed) % palette.length;
      const [r, g, b] = palette[band];
      const spine = x < 54;
      const rule = y > 120 + seed * 18 && y < 136 + seed * 18;
      const lowerBlock = x > 110 && x < 560 && y > 650 - seed * 14 && y < 710 - seed * 14;

      raw[offset] = spine ? Math.max(0, r - 32) : rule || lowerBlock ? Math.min(255, r + 24) : r;
      raw[offset + 1] = spine ? Math.max(0, g - 32) : rule || lowerBlock ? Math.min(255, g + 24) : g;
      raw[offset + 2] = spine ? Math.max(0, b - 32) : rule || lowerBlock ? Math.min(255, b + 24) : b;
      raw[offset + 3] = 255;
      offset += 4;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(value: string, length = 72) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (`${current} ${word}`.trim().length > length) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }

  if (current) lines.push(current);
  return lines;
}

function createPdf(book: SampleBook) {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  book.pages.forEach((pageLines, index) => {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);

    const lines = pageLines.flatMap((line) => wrapLine(line));
    const textCommands = lines
      .map((line, lineIndex) => {
        if (lineIndex === 0) {
          return `/F1 22 Tf 72 730 Td (${pdfEscape(line)}) Tj`;
        }
        if (lineIndex === 1) {
          return `/F1 13 Tf 0 -34 Td (${pdfEscape(line)}) Tj`;
        }
        return `0 -22 Td (${pdfEscape(line)}) Tj`;
      })
      .join("\n");

    const content = `BT\n${textCommands}\nET`;
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
  });

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "binary");
}

function xhtml(title: string, paragraphs: string[]) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n")}
</body>
</html>`;
}

async function createEpub(book: SampleBook) {
  const zip = new JSZip();
  const chapterFiles = book.pages.map((_, index) => `chapter-${index + 1}.xhtml`);

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  chapterFiles.forEach((file, index) => {
    const [title, ...paragraphs] = book.pages[index];
    zip.file(`OEBPS/${file}`, xhtml(title, paragraphs));
  });

  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
${chapterFiles
  .map((file, index) => {
    const [title] = book.pages[index];
    return `<li><a href="${file}">${title}</a></li>`;
  })
  .join("\n")}
</ol>
</nav>
</body>
</html>`,
  );

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="book-id">urn:uuid:${book.slug}</dc:identifier>
  <dc:title>${book.title}</dc:title>
  <dc:creator>${book.author}</dc:creator>
  <dc:language>en</dc:language>
  <dc:date>${book.publicationDate.slice(0, 10)}</dc:date>
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${chapterFiles.map((file, index) => `  <item id="chapter-${index + 1}" href="${file}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine>
${chapterFiles.map((_, index) => `  <itemref idref="chapter-${index + 1}"/>`).join("\n")}
</spine>
</package>`,
  );

  return zip.generateAsync({
    type: "nodebuffer",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
}

async function uploadSeedBlob(pathname: string, body: Buffer, contentType: string) {
  return put(pathname, body, {
    access: "public",
    allowOverwrite: true,
    contentType,
  });
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to seed sample books into Vercel Blob.");
  }

  for (const [index, book] of samples.entries()) {
    const bookExtension = book.format === "PDF" ? ".pdf" : ".epub";
    const bookBlobPath = `books/${book.slug}${bookExtension}`;
    const coverBlobPath = `covers/${book.slug}.png`;
    const fileBuffer = book.format === "PDF" ? createPdf(book) : await createEpub(book);
    const coverBuffer = createCoverPng(book.coverPalette, index + 1);
    const fileContentType = book.format === "PDF" ? "application/pdf" : "application/epub+zip";
    const coverContentType = "image/png";
    const [bookBlob, coverBlob] = await Promise.all([
      uploadSeedBlob(bookBlobPath, fileBuffer, fileContentType),
      uploadSeedBlob(coverBlobPath, coverBuffer, coverContentType),
    ]);

    await prisma.book.upsert({
      where: { slug: book.slug },
      update: {
        title: book.title,
        description: book.description,
        author: book.author,
        format: book.format,
        category: book.category,
        pageCount: book.pageCount,
        publicationDate: new Date(book.publicationDate),
        bookBlobUrl: bookBlob.url,
        bookBlobPath: bookBlob.pathname,
        coverBlobUrl: coverBlob.url,
        coverBlobPath: coverBlob.pathname,
        fileSize: fileBuffer.byteLength,
        fileContentType,
        coverContentType,
        searchText: `${book.title} ${book.author} ${book.description}`.toLowerCase(),
      },
      create: {
        slug: book.slug,
        title: book.title,
        description: book.description,
        author: book.author,
        format: book.format,
        category: book.category,
        pageCount: book.pageCount,
        publicationDate: new Date(book.publicationDate),
        uploadDate: new Date(),
        bookBlobUrl: bookBlob.url,
        bookBlobPath: bookBlob.pathname,
        coverBlobUrl: coverBlob.url,
        coverBlobPath: coverBlob.pathname,
        fileSize: fileBuffer.byteLength,
        fileContentType,
        coverContentType,
        searchText: `${book.title} ${book.author} ${book.description}`.toLowerCase(),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
