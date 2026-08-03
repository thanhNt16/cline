import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  AlignmentType,
  BorderStyle,
  PageBreak,
  TabStopPosition,
  TabStopType,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  LevelFormat,
  convertInchesToTwip,
  ExternalHyperlink,
  Bookmark,
  InternalHyperlink,
  LeaderType,
} from "docx";
import fs from "fs";

// ── Brand colours (modern dark blue / teal palette) ──
const BRAND = {
  primary: "1A3A5C",     // deep navy
  accent:  "0EA5E9",     // sky blue
  teal:    "14B8A6",     // teal
  dark:    "0F172A",     // near-black
  mid:     "334155",     // slate-700
  light:   "F1F5F9",     // slate-100
  white:   "FFFFFF",
  muted:   "94A3B8",     // slate-400
  green:   "22C55E",     // green-500
  red:     "EF4444",
  yellow:  "FACC15",
};

// ── Helper: a styled heading paragraph ──
// `bookmarkId` (optional) wraps the heading text in a bookmark so the
// hand-built Table of Contents can link straight to it.
function heading(text, level, bookmarkId) {
  const run = new TextRun({
    text,
    font: "Segoe UI",
    size: level === HeadingLevel.HEADING_1 ? 48 : level === HeadingLevel.HEADING_2 ? 36 : 28,
    bold: true,
    color: level === HeadingLevel.HEADING_1 ? BRAND.primary : BRAND.mid,
  });
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 280, after: 160 },
    children: [
      bookmarkId ? new Bookmark({ id: bookmarkId, children: [run] }) : run,
    ],
  });
}

// ── Helper: body paragraph ──
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160, line: 300 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    indent: opts.indent ? { left: convertInchesToTwip(0.25) } : undefined,
    children: [
      new TextRun({
        text,
        font: "Segoe UI",
        size: 22,
        color: opts.color || BRAND.dark,
        bold: !!opts.bold,
        italics: !!opts.italics,
      }),
    ],
  });
}

// ── Helper: bold label + normal value on one line ──
function labeled(label, value) {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    children: [
      new TextRun({ text: label, font: "Segoe UI", size: 22, bold: true, color: BRAND.primary }),
      new TextRun({ text: value, font: "Segoe UI", size: 22, color: BRAND.dark }),
    ],
  });
}

// ── Helper: code block (monospace, light grey bg via shading) ──
function codeBlock(lines) {
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 0, line: 260 },
        shading: { type: ShadingType.CLEAR, fill: BRAND.light, color: "auto" },
        indent: { left: convertInchesToTwip(0.3), right: convertInchesToTwip(0.3) },
        children: [
          new TextRun({
            text: line || " ",
            font: "Cascadia Code",
            size: 18,
            color: BRAND.mid,
          }),
        ],
      })
  );
}

// ── Helper: a styled table ──
function styledTable(headerRow, dataRows, colWidths) {
  const makeCell = (text, isHeader, width) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: {
        type: ShadingType.CLEAR,
        fill: isHeader ? BRAND.primary : BRAND.white,
        color: "auto",
      },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [
        new Paragraph({
          spacing: { after: 0 },
          children: [
            new TextRun({
              text,
              font: "Segoe UI",
              size: isHeader ? 20 : 20,
              bold: !!isHeader,
              color: isHeader ? BRAND.white : BRAND.dark,
            }),
          ],
        }),
      ],
    });

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headerRow.map((h, i) => makeCell(h, true, colWidths[i])),
  });

  const rows = dataRows.map(
    (row) =>
      new TableRow({
        cantSplit: true,
        children: row.map((cell, i) => makeCell(cell, false, colWidths[i])),
      })
  );

  return new Table({
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: [header, ...rows],
  });
}

// ── Helper: thin accent divider line ──
function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND.accent, space: 1 },
    },
    children: [],
  });
}

// ── Table of Contents data ──
// Hand-built TOC: (level, text, bookmark id, page number). Page numbers are
// filled in from the actual rendered layout (see regen step) so the entries
// are correct without requiring a manual "update fields" pass in Word.
const TOC_ENTRIES = [
  [1, "Prerequisites", "prerequisites", 3],
  [1, "1. Install the Extension", "sec1", 3],
  [2, "Option A: Install from VSIX (Recommended)", "sec1-a", 3],
  [2, "Option B: Install from VS Code Marketplace", "sec1-b", 3],
  [2, "Verify Installation", "sec1-verify", 3],
  [1, "2. Configure Model Profiles", "sec2", 3],
  [2, "Switching Profiles", "sec2-switch", 4],
  [1, "3. Codebase Memory & Graph", "sec3", 4],
  [2, "Step 1: Configure MCP Server", "sec3-step1", 4],
  [2, "Step 2: Open Settings → Codebase Index", "sec3-step2", 5],
  [2, "Step 3: Install Binary", "sec3-step3", 5],
  [2, "Step 4: Index Current Project", "sec3-step4", 5],
  [2, "Step 5: Browse the Graph", "sec3-step5", 6],
  [2, "Step 6: Query via Agent", "sec3-step6", 6],
  [1, "4. Document Indexing & Search", "sec4", 6],
  [2, "Step 1: Start the Indexer Server", "sec4-step1", 6],
  [2, "Step 2: Configure MCP Server", "sec4-step2", 7],
  [2, "Step 3: Connect", "sec4-step3", 7],
  [2, "Step 4: Index Documents", "sec4-step4", 7],
  [2, "Step 5: Search", "sec4-step5", 7],
  [2, "Step 6: Available Agent Tools", "sec4-step6", 7],
  [1, "5. Real-World Scenarios", "sec5", 8],
  [1, "6. File Reference", "sec6", 11],
  [1, "7. Troubleshooting", "sec7", 12],
];

// ── Helper: one TOC line (dot leader + page number, hyperlinked to the heading) ──
function tocEntry(level, text, bookmarkId, pageNum) {
  const size = level === 1 ? 24 : 22;
  const bold = level === 1;
  const color = level === 1 ? BRAND.primary : BRAND.dark;
  return new Paragraph({
    spacing: { after: level === 1 ? 140 : 90 },
    indent: { left: convertInchesToTwip(level === 1 ? 0 : 0.3) },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
    children: [
      new InternalHyperlink({
        anchor: bookmarkId,
        children: [
          new TextRun({ text, font: "Segoe UI", size, bold, color }),
          new TextRun({ text: "\t" + String(pageNum), font: "Segoe UI", size, bold, color }),
        ],
      }),
    ],
  });
}

// ── Helper: scenario card with title + description ──
function scenarioCard(title, problem, setupSteps, workflowItems, value) {
  const elems = [];
  elems.push(
    new Paragraph({
      spacing: { before: 280, after: 100 },
      shading: { type: ShadingType.CLEAR, fill: "EFF6FF", color: "auto" },
      indent: { left: convertInchesToTwip(0.1), right: convertInchesToTwip(0.1) },
      children: [
        new TextRun({
          text: "  " + title,
          font: "Segoe UI",
          size: 26,
          bold: true,
          color: BRAND.primary,
        }),
      ],
    })
  );
  elems.push(labeled("Problem: ", problem));
  elems.push(body(""));
  elems.push(body("Setup:", { bold: true }));
  setupSteps.forEach((s, i) => elems.push(body(`${i + 1}. ${s}`, { indent: true })));
  elems.push(body(""));
  elems.push(body("Daily workflow:", { bold: true }));
  workflowItems.forEach((w) =>
    elems.push(body("• " + w, { indent: true, color: BRAND.mid }))
  );
  elems.push(body(""));
  elems.push(
    new Paragraph({
      spacing: { after: 200, line: 300 },
      shading: { type: ShadingType.CLEAR, fill: "F0FDF4", color: "auto" },
      indent: { left: convertInchesToTwip(0.1), right: convertInchesToTwip(0.1) },
      children: [
        new TextRun({ text: "  Value: ", font: "Segoe UI", size: 22, bold: true, color: "15803D" }),
        new TextRun({ text: value, font: "Segoe UI", size: 22, bold: true, color: "15803D" }),
      ],
    })
  );
  return elems;
}

// ── Build document ──
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Segoe UI", size: 22, color: BRAND.dark },
        paragraph: { spacing: { line: 300 } },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "bullet",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.muted, space: 4 } },
              children: [
                new TextRun({ text: "CellockAI — Installation Guide", font: "Segoe UI", size: 16, color: BRAND.muted, italics: true }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", font: "Segoe UI", size: 16, color: BRAND.muted }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Segoe UI", size: 16, color: BRAND.muted }),
              ],
            }),
          ],
        }),
      },
      children: [
        // ── TITLE PAGE ──
        new Paragraph({ spacing: { before: 2400 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "CellockAI", font: "Segoe UI", size: 72, bold: true, color: BRAND.primary }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: "Installation & Setup Guide", font: "Segoe UI", size: 40, color: BRAND.accent }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 100 },
          border: { top: { style: BorderStyle.SINGLE, size: 8, color: BRAND.accent, space: 8 } },
          children: [
            new TextRun({ text: "Your AI-powered coding companion for VS Code", font: "Segoe UI", size: 24, color: BRAND.muted, italics: true }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 800 },
          children: [
            new TextRun({ text: "Version 0.17.1  •  July 2026", font: "Segoe UI", size: 22, color: BRAND.mid }),
          ],
        }),

        // page break
        new Paragraph({ children: [new PageBreak()] }),

        // ── TABLE OF CONTENTS ──
        heading("Table of Contents", HeadingLevel.HEADING_1),
        ...TOC_ENTRIES.map(([level, text, id, page]) => tocEntry(level, text, id, page)),

        new Paragraph({ children: [new PageBreak()] }),

        // ── PREREQUISITES ──
        heading("Prerequisites", HeadingLevel.HEADING_1, "prerequisites"),
        body("Before installing CellockAI, ensure you have the following:"),
        body(""),
        labeled("VS Code 1.85+", " or a compatible editor (Cursor, Windsurf, etc.)"),
        labeled("Node.js 18+", " required for MCP servers and the extension runtime"),

        divider(),

        // ── SECTION 1: Install the Extension ──
        heading("1. Install the Extension", HeadingLevel.HEADING_1, "sec1"),
        heading("Option A: Install from VSIX (Recommended)", HeadingLevel.HEADING_2, "sec1-a"),
        body("Run the following command in your terminal:"),
        ...codeBlock(["code --install-extension apps/vscode/cellock-ai-0.17.1.vsix"]),
        body(""),
        body("Alternatively, use the VS Code UI: Extensions → … (ellipsis) → Install from VSIX… → select the .vsix file.", { italics: true }),

        heading("Option B: Install from VS Code Marketplace", HeadingLevel.HEADING_2, "sec1-b"),
        body("Search for CellockAI in the Extensions pane and click Install."),

        heading("Verify Installation", HeadingLevel.HEADING_2, "sec1-verify"),
        body("Open VS Code, press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux), type CellockAI: Open. The CellockAI chat panel should appear in the sidebar."),

        divider(),

        // ── SECTION 2: Configure Model Profiles ──
        heading("2. Configure Model Profiles", HeadingLevel.HEADING_1, "sec2"),
        body("CellockAI uses model profiles stored in <workspace>/.cellockai/profiles.json to switch between different LLM backends. Create this file in your workspace root:"),
        body(""),
        ...codeBlock([
          "{",
          '  "activeProfileId": "180ddee5-9778-4b0f-afd5-3c2f38fe412d",',
          '  "profiles": [',
          "    {",
          '      "id": "f3205c96-f7f5-4d44-9a4b-be7bb9467cd9",',
          '      "name": "haiku",',
          '      "baseUrl": "http://10.60.70.4:20128/v1",',
          '      "modelId": "haiku",',
          '      "apiKey": "sk-6db89dd1d6ea53a4-3jz4jf-801430d0"',
          "    },",
          "    {",
          '      "id": "180ddee5-9778-4b0f-afd5-3c2f38fe412d",',
          '      "name": "opus",',
          '      "baseUrl": "http://10.60.70.4:20128/v1",',
          '      "modelId": "opus",',
          '      "apiKey": "sk-6db89dd1d6ea53a4-3jz4jf-801430d0"',
          "    }",
          "  ]",
          "}",
        ]),
        body(""),

        styledTable(
          ["Field", "Description"],
          [
            ["activeProfileId", "The profile used by default when the workspace opens"],
            ["profiles[].id", "Unique UUID for each profile"],
            ["profiles[].name", "Display name shown in the profile selector"],
            ["profiles[].baseUrl", "OpenAI-compatible API endpoint"],
            ["profiles[].modelId", "Model identifier passed to the API"],
            ["profiles[].apiKey", "API key for authentication"],
          ],
          [3000, 6240]
        ),
        body(""),

        heading("Switching Profiles", HeadingLevel.HEADING_2, "sec2-switch"),
        body("Open Settings → API Configuration and select your active profile from the dropdown, or edit activeProfileId directly in the JSON file."),

        divider(),

        // ── SECTION 3: Codebase Memory & Graph ──
        heading("3. Codebase Memory & Graph", HeadingLevel.HEADING_1, "sec3"),
        body("The Codebase Memory & Graph tab indexes your codebase into a knowledge graph so the AI agent can search functions, trace call paths, and understand architecture."),

        heading("Step 1: Configure MCP Server", HeadingLevel.HEADING_2, "sec3-step1"),
        body("Ensure .cellockai/mcp_settings.json contains the codebase-memory-mcp entry:"),
        body(""),
        ...codeBlock([
          "{",
          '  "mcpServers": {',
          '    "codebase-memory-mcp": {',
          '      "command": "<path-to-codebase-memory-mcp-binary>",',
          '      "args": [],',
          '      "disabled": false',
          "    }",
          "  }",
          "}",
        ]),
        body(""),

        heading("Step 2: Open Settings → Codebase Index", HeadingLevel.HEADING_2, "sec3-step2"),
        body("Navigate to Settings → Codebase Index (gear icon → \"Codebase Index\" tab)."),

        heading("Step 3: Install Binary", HeadingLevel.HEADING_2, "sec3-step3"),
        body("If the binary is not installed, click Install in the Status card. The extension downloads the codebase-memory-mcp binary to <extension-globalStorage>/cellockai.cellock-ai/codebase-memory-mcp/."),
        body(""),
        body("After installation, the status shows:"),
        styledTable(
          ["Check", "Status"],
          [
            ["Binary", "installed (v0.x.y)"],
            ["Project", "not indexed"],
            ["MCP tools", "registered for agent"],
            ["Graph UI", "not running"],
          ],
          [3000, 6240]
        ),
        body(""),

        heading("Step 4: Index Current Project", HeadingLevel.HEADING_2, "sec3-step4"),
        body("Click Index Current Project in the Indexing card. A log panel shows progress. Indexing extracts:"),
        body("Functions and classes — signatures, parameters, and docstrings", { indent: true }),
        body("Call graphs — who calls whom, data flow between functions", { indent: true }),
        body("Routes and APIs — HTTP endpoints, async channel subscriptions", { indent: true }),
        body("Imports and dependencies — cross-file relationships", { indent: true }),

        heading("Step 5: Browse the Graph", HeadingLevel.HEADING_2, "sec3-step5"),
        body("Click View Graph in Browser to open the 3D knowledge graph at localhost:9749."),

        heading("Step 6: Query via Agent", HeadingLevel.HEADING_2, "sec3-step6"),
        body("After indexing, your agent has these MCP tools available:"),
        body(""),
        styledTable(
          ["Tool", "Description"],
          [
            ["search_graph", "Find functions, classes, routes by name or natural-language query"],
            ["trace_path", "Follow call chains (callers/callees) up/downstream"],
            ["get_code_snippet", "Read source code for any indexed function or class"],
            ["query_graph", "Run Cypher queries for complex structural patterns"],
            ["get_architecture", "Get high-level architecture overview with package clusters"],
          ],
          [3000, 6240]
        ),
        body(""),
        body("Example agent prompt:", { bold: true }),
        body("\"Find all functions that call sendMessage and trace the data flow into it.\"", { italics: true, color: BRAND.mid }),

        divider(),

        // ── SECTION 4: Document Indexing & Search ──
        heading("4. Document Indexing & Search", HeadingLevel.HEADING_1, "sec4"),
        body("The Document Indexing & Search tab connects to a Vessel Indexer server for full-text and semantic search across documents, specs, and notes."),

        heading("Step 1: Start the Indexer Server", HeadingLevel.HEADING_2, "sec4-step1"),
        body("Start the Vessel Indexer server (requires Vessel CLI or a running instance):"),
        body(""),
        ...codeBlock(["npx vessel-indexer@latest --port 8080"]),
        body(""),

        heading("Step 2: Configure MCP Server", HeadingLevel.HEADING_2, "sec4-step2"),
        body(".cellockai/mcp_settings.json should contain the docindex and vessel-indexer entries:"),
        body(""),
        ...codeBlock([
          "{",
          '  "mcpServers": {',
          '    "docindex": {',
          '      "type": "streamableHttp",',
          '      "url": "http://localhost:8080/mcp",',
          '      "disabled": false',
          "    },",
          '    "vessel-indexer": {',
          '      "type": "streamableHttp",',
          '      "url": "http://localhost:8080/mcp",',
          '      "disabled": false',
          "    }",
          "  }",
          "}",
        ]),
        body(""),

        heading("Step 3: Connect", HeadingLevel.HEADING_2, "sec4-step3"),
        body("Navigate to Settings → Document Index. Enter the server URL (default http://localhost:8080) and click Connect. The green indicator confirms connection."),

        heading("Step 4: Index Documents", HeadingLevel.HEADING_2, "sec4-step4"),
        body("The tab provides several indexing options:"),
        body("Upload — Upload files (PDF, markdown, text) directly", { indent: true }),
        body("Index Batch — Batch-index a directory of documents", { indent: true }),
        body("Index — Index from a URL or by crawling a documentation site", { indent: true }),

        heading("Step 5: Search", HeadingLevel.HEADING_2, "sec4-step5"),
        body("Use the Search card to query indexed documents. Results return relevant chunks with source context."),

        heading("Step 6: Available Agent Tools", HeadingLevel.HEADING_2, "sec4-step6"),
        body(""),
        styledTable(
          ["Tool", "Description"],
          [
            ["search_text", "Full-text search across all indexed documents"],
            ["get_snippet", "Retrieve the full text of a specific chunk"],
            ["search_graph", "Entity search over extracted knowledge graph"],
            ["trace_path", "Follow entity relationships through document corpus"],
          ],
          [3000, 6240]
        ),

        divider(),

        // ── SECTION 5: Real-World Scenarios ──
        heading("5. Real-World Scenarios", HeadingLevel.HEADING_1, "sec5"),

        ...scenarioCard(
          "Scenario A: Onboard onto a Large Codebase",
          "New developer joins a team with a 500K+ line monorepo.",
          [
            "Install CellockAI from VSIX",
            "Index the monorepo via Codebase Index → Index Current Project (~5 min)",
            "Open the graph to visualize module boundaries",
          ],
          [
            "\"Show me the architecture of the payments module\" — agent calls get_architecture and returns a package-level summary with interdependencies",
            "\"Who calls chargeCreditCard?\" — agent traces 3 levels deep showing every caller, their modules, and argument shapes",
            "\"What edge cases does the checkout handler handle?\" — agent queries the graph for functions called by the checkout handler, returning docstrings and error paths",
            "\"Where is the SQL query for user orders built?\" — agent search_graph finds the exact function + file + line",
          ],
          "Days of code spelunking compressed into seconds of chat."
        ),

        ...scenarioCard(
          "Scenario B: Multi-Model Workflow (Cost Optimization)",
          "Use a cheap/fast model for simple tasks and a powerful model for complex reasoning.",
          [
            "Create two profiles (haiku and opus) in .cellockai/profiles.json",
            "Set haiku as default for quick queries",
          ],
          [
            "\"Refactor this variable name\" → haiku handles it in <1s",
            "\"Design the architecture for a new billing system\" → switch to opus for deep reasoning",
            "\"Explain this error message\" → haiku is sufficient",
            "\"Review this security-critical diff\" → switch to opus for thorough analysis",
          ],
          "Cut API costs ~80% while keeping peak capability on tap."
        ),

        ...scenarioCard(
          "Scenario C: Documentation-Driven Development",
          "Internal documentation is spread across markdown files, Notion exports, and API specs.",
          [
            "Start the Vessel Indexer server",
            "Connect via Document Index → Connection card",
            "Upload/batch-index all documentation directories",
            "Index the codebase via Codebase Index",
          ],
          [
            "\"What's the API contract for the user service?\" → agent queries docs-index and codebase graph in parallel, cross-references implementation against docs",
            "\"Does the code match the spec for authentication?\" → agent reads indexed spec + indexed code, compares, reports discrepancies",
            "\"Find all places where we deviate from the coding standards doc\" → agent searches the doc for rules and the code graph for violations",
          ],
          "One chat interface to ask \"what does the spec say?\" and \"what does the code do?\" — no more context-switching between docs and IDE."
        ),

        ...scenarioCard(
          "Scenario D: Automated Code Review with Agent Tools",
          "Catching subtle bugs needs deep understanding of downstream effects.",
          [
            "Codebase indexed",
            "Agent configured to use trace_path and search_graph autonomously",
          ],
          [
            "Paste a diff into chat: \"Review this change\"",
            "Agent automatically calls trace_path on modified functions to find all callers",
            "Agent calls get_code_snippet on affected callers to understand impact",
            "Agent queries for test coverage of affected paths via search_graph",
            "Returns a review with downstream impact assessment, untested paths, and potential regressions",
          ],
          "Code review becomes impact-aware, catching regressions before they ship."
        ),

        ...scenarioCard(
          "Scenario E: Cross-Project Architecture Discovery",
          "Your codebase has multiple services (frontend, API, worker, shared libraries) in separate repos.",
          [
            "Index each repo (open each in VS Code, run Index Current Project)",
            "Use cross-repo intelligence: each index captures internal routes and channels",
          ],
          [
            "Ask \"What happens when the frontend calls /api/orders/create?\"",
            "Agent traces: frontend route → API HTTP endpoint → worker async channel → email service",
            "Each hop is a different repo, but the graph connects them through route/channel matching",
            "Result: an end-to-end flow diagram across all services",
          ],
          "Service boundaries disappear — agents reason across your entire system."
        ),

        divider(),

        // ── FILE REFERENCE ──
        heading("6. File Reference", HeadingLevel.HEADING_1, "sec6"),
        styledTable(
          ["File", "Purpose"],
          [
            [".cellockai/profiles.json", "Model profile definitions"],
            [".cellockai/mcp_settings.json", "MCP server configurations"],
            [".cellockai/mcp.json", "Project-level MCP merge source (optional)"],
            [".cellockai/skills/", "Local skills directory"],
            [".cellockai/rules/", "Project rules and instructions"],
            [".cellockai/rules/workflows/", "Workflow definitions"],
            [".cellockai/rules/hooks/", "Hook scripts"],
            [".cellockai/sessions/history.json", "Session history"],
          ],
          [4000, 5240]
        ),

        divider(),

        // ── TROUBLESHOOTING ──
        heading("7. Troubleshooting", HeadingLevel.HEADING_1, "sec7"),
        styledTable(
          ["Symptom", "Likely Fix"],
          [
            ["\"Profile not found\"", "Verify activeProfileId matches a profile id in .cellockai/profiles.json"],
            ["MCP server disconnected", "Check .cellockai/mcp_settings.json syntax; re-open settings to trigger reload"],
            ["Binary not installing", "Check network access to the download URL; manual install via Settings UI"],
            ["Document Index not connecting", "Ensure Vessel Indexer server is running on the configured port"],
            ["Indexing very slow", "Use \"fast\" index mode for initial pass; full mode for targeted analysis"],
            ["Agent not using MCP tools", "Ensure mcpServerRegistered shows as registered in Codebase Index status card"],
          ],
          [3200, 6040]
        ),
      ],
    },
  ],
});

// ── Write file ──
const buffer = await Packer.toBuffer(doc);
const outPath = "/sessions/peaceful-happy-meitner/mnt/cline/docs/CellockAI-Installation-Guide.docx";
fs.writeFileSync(outPath, buffer);
console.log("✅ Written:", outPath);
