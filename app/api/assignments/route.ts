import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

const DATA_PATH = path.join(process.cwd(), "data", "Data.json")

type AssignmentRecord = {
  id?: string
  assignment_name: string
  course_title: string
  type: string
  due_date: string
  points: string | null
  status?: string
}

type DataFile = {
  Assignment: AssignmentRecord[]
}

async function readData(): Promise<DataFile> {
  try {
    const content = await fs.readFile(DATA_PATH, "utf-8")
    const data = JSON.parse(content) as DataFile
    return data.Assignment ? data : { Assignment: [] }
  } catch {
    return { Assignment: [] }
  }
}

async function writeData(data: DataFile): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true })
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8")
}

export async function GET() {
  try {
    const data = await readData()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: "Failed to read data" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = await readData()

    if (body.action === "append" && Array.isArray(body.items)) {
      const newItems: AssignmentRecord[] = body.items.map((item: AssignmentRecord) => ({
        id: item.id,
        assignment_name: item.assignment_name || "",
        course_title: item.course_title || "",
        type: item.type || "",
        due_date: item.due_date || "",
        points: item.points || null,
        status: item.status || "planned",
      }))
      data.Assignment.push(...newItems)
      await writeData(data)
      return NextResponse.json({ success: true })
    }

    if (body.action === "delete" && body.id) {
      data.Assignment = data.Assignment.filter((a) => a.id !== body.id)
      await writeData(data)
      return NextResponse.json({ success: true })
    }

    if (body.action === "replace" && Array.isArray(body.items)) {
      data.Assignment = body.items.map((item: AssignmentRecord) => ({
        id: item.id,
        assignment_name: item.assignment_name || "",
        course_title: item.course_title || "",
        type: item.type || "",
        due_date: item.due_date || "",
        points: item.points || null,
        status: item.status || "planned",
      }))
      await writeData(data)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: "Failed to update data" }, { status: 500 })
  }
}
