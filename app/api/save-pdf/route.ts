import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "Missing or invalid PDF file" }, { status: 400 })
    }

    await fs.mkdir(DATA_DIR, { recursive: true })
    const filename = "fild.pdf"
    const filePath = path.join(DATA_DIR, filename)

    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    return NextResponse.json({ success: true, filename })
  } catch (err) {
    console.error("Save PDF error:", err)
    return NextResponse.json({ error: "Failed to save PDF" }, { status: 500 })
  }
}
