import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai"
import { promises as fs } from "fs"
import path from "path"

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ""
)

const DATA_PATH = path.join(process.cwd(), "data", "Data.json")

// Schema matches Data.json format: { Assignment: [ { id, assignment_name, course_title, type, due_date, points, status } ] }
const assignmentSchema = {
  type: SchemaType.OBJECT,
  properties: {
    Assignment: {
      type: SchemaType.ARRAY,
      description: "List of assignments in Data.json format",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          assignment_name: {
            type: SchemaType.STRING,
            description: "Name or title of the assignment",
          },
          course_title: {
            type: SchemaType.STRING,
            description: "Course name or title",
          },
          type: {
            type: SchemaType.STRING,
            description: "Assignment type (e.g. Essay, Quiz, Discussion, Assignment)",
          },
          due_date: {
            type: SchemaType.STRING,
            description: "Due date in YYYY-MM-DD format if available",
          },
          points: {
            type: SchemaType.STRING,
            description: "Point value (e.g. 100, 10, or empty if not specified)",
          },
          status: {
            type: SchemaType.STRING,
            description: "Status: planned, started, or finished",
          },
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
      { error: "Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY in environment" },
      { status: 500 }
    )
  }

  try {
    const { text } = await request.json()
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing or invalid text" }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: assignmentSchema as Schema,
        temperature: 0.2,
      },
    })

    const prompt = `You are parsing a PDF export of a Canvas LMS (Learning Management System) todo list or assignments page.
Output must match this exact JSON format: { "Assignment": [ {...}, {...} ] }

For each assignment, extract:
- assignment_name: The assignment or task name (required)
- course_title: The course name (e.g. "English 101", "Math 205") - empty string if unknown
- type: The assignment type (Essay, Quiz, Discussion, Assignment, Exam, etc.) - empty string if unknown
- due_date: Due date in YYYY-MM-DD format - convert "Mar 15, 2025" or "3/15/2025" to YYYY-MM-DD. Empty string if not found.
- points: The point value as a string (e.g. "100", "10") - empty string if not specified
- status: Always use "planned" for imported items

Extract ALL assignments from the text. Return a JSON object with an "Assignment" array (capital A). Include every assignment you can find.

Text to parse:
---
${text}
---`

    const result = await model.generateContent(prompt)
    const response = result.response
    const responseText = response.text()

    if (!responseText) {
      return NextResponse.json(
        { error: "No response from AI", Assignment: [] },
        { status: 200 }
      )
    }

    const parsed = JSON.parse(responseText) as { Assignment?: Array<{
      assignment_name?: string
      course_title?: string
      type?: string
      due_date?: string
      points?: string
      status?: string
    }> }

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

    // Read current Data.json and append
    let data: { Assignment: Array<{ id?: string; assignment_name: string; course_title: string; type: string; due_date: string; points: string | null; status?: string }> }
    try {
      const content = await fs.readFile(DATA_PATH, "utf-8")
      const parsedData = JSON.parse(content)
      data = parsedData.Assignment ? parsedData : { Assignment: [] }
    } catch {
      data = { Assignment: [] }
    }

    data.Assignment.push(...newAssignments)
    await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8")

    return NextResponse.json({ Assignment: data.Assignment })
  } catch (err) {
    console.error("Parse PDF error:", err)
    return NextResponse.json(
      { error: "Failed to parse PDF", Assignment: [] },
      { status: 500 }
    )
  }
}
