import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai"
import { promises as fs } from "fs"
import path from "path"

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ""
)

const DATA_DIR = path.join(process.cwd(), "data")
const DATA_PATH = path.join(DATA_DIR, "Data.json")
const FILD_PDF_PATH = path.join(DATA_DIR, "fild.pdf")

const assignmentSchema = {
  type: SchemaType.OBJECT,
  properties: {
    Assignment: {
      type: SchemaType.ARRAY,
      description: "List of assignments in Data.json format",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          assignment_name: { type: SchemaType.STRING, description: "Assignment name" },
          course_title: { type: SchemaType.STRING, description: "Course name" },
          type: { type: SchemaType.STRING, description: "Assignment type" },
          due_date: { type: SchemaType.STRING, description: "Due date YYYY-MM-DD" },
          points: { type: SchemaType.STRING, description: "Point value" },
          status: { type: SchemaType.STRING, description: "planned, started, or finished" },
        },
        required: ["assignment_name"],
      },
    },
  },
  required: ["Assignment"],
}

function generateId() {
  return Math.random().toString(36).slice(2)
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY" },
      { status: 500 }
    )
  }

  try {
    // Read PDF from data/fild.pdf (saved by save-pdf)
    let pdfBuffer: Buffer
    try {
      pdfBuffer = await fs.readFile(FILD_PDF_PATH)
    } catch {
      return NextResponse.json({ error: "PDF file fild.pdf not found. Import a PDF first." }, { status: 400 })
    }

    const pdfBase64 = pdfBuffer.toString("base64")

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: assignmentSchema as Schema,
        temperature: 0.2,
      },
    })

    const prompt = `Parse this Canvas LMS todo list / assignments PDF. Output JSON: { "Assignment": [ {...}, {...} ] }

For each assignment extract:
- assignment_name (required)
- course_title
- type (Essay, Quiz, Discussion, etc.)
- due_date in YYYY-MM-DD format
- points
- status: "planned"

Extract ALL assignments from the PDF. Return { "Assignment": [ ... ] } with capital A.`

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: "application/pdf",
          data: pdfBase64,
        },
      },
    ])
    const response = result.response
    if (!response || !response.candidates?.length) {
      const errMsg = (response as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason || "No AI response"
      return NextResponse.json({ error: errMsg, Assignment: [] }, { status: 500 })
    }
    const responseText = response.text()
    if (!responseText?.trim()) {
      return NextResponse.json({ error: "Empty AI response", Assignment: [] }, { status: 500 })
    }

    let parsed: { Assignment?: Array<{
      assignment_name?: string
      course_title?: string
      type?: string
      due_date?: string
      points?: string
      status?: string
    }> }
    try {
      parsed = JSON.parse(responseText) as typeof parsed
    } catch {
      return NextResponse.json({ error: "Invalid JSON from AI", Assignment: [] }, { status: 500 })
    }

    const newAssignments = Array.isArray(parsed.Assignment)
      ? parsed.Assignment.map((a) => ({
          id: generateId(),
          assignment_name: a.assignment_name || "",
          course_title: a.course_title || "",
          type: a.type || "",
          due_date: a.due_date || "",
          points: a.points != null && a.points !== "" ? String(a.points) : null,
          status: (a.status as "planned" | "started" | "finished") || "planned",
        }))
      : []

    let data: { Assignment: Array<{ id?: string; assignment_name: string; course_title: string; type: string; due_date: string; points: string | null; status?: string }> }
    try {
      const content = await fs.readFile(DATA_PATH, "utf-8")
      const parsedData = JSON.parse(content)
      data = parsedData.Assignment ? parsedData : { Assignment: [] }
    } catch {
      data = { Assignment: [] }
    }

    data.Assignment.push(...newAssignments)
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true })
    await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8")

    return NextResponse.json({ Assignment: data.Assignment })
  } catch (err) {
    console.error("Parse PDF error:", err)
    return NextResponse.json({ error: "Failed to parse PDF", Assignment: [] }, { status: 500 })
  }
}
