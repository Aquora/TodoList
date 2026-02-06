"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileUp, Copy, Plus, X, MessageCircle, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"

type TodoStatus = "planned" | "started" | "finished"

type TodoItem = {
  id: string
  assignment_name: string
  course_title: string
  type: string
  due_date: string
  points: string
  status: TodoStatus
}

function generateId() {
  return Math.random().toString(36).slice(2)
}

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const textParts: string[] = []

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
    textParts.push(pageText)
  }

  return textParts.join("\n\n")
}

export default function TodoPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showFileInput, setShowFileInput] = useState(false)
  const [listTitle, setListTitle] = useState("Todo list")
  const [todoItems, setTodoItems] = useState<TodoItem[]>([])
  const [newAssignmentName, setNewAssignmentName] = useState("")
  const [newCourseTitle, setNewCourseTitle] = useState("")
  const [newType, setNewType] = useState("")
  const [newDueDate, setNewDueDate] = useState("")
  const [newPoints, setNewPoints] = useState("")
  const [copySuccess, setCopySuccess] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [currentGachaImage, setCurrentGachaImage] = useState<string>("default.webp")
  const [spentPoints, setSpentPoints] = useState(0)
  const [rollCost] = useState(25) // Cost in points to roll once
  const [pointsPerTask] = useState(5) // Points earned per completed task

  // Available gacha images
  const gachaImages = ["default.webp", "outfit_4.webp", "outfit1.webp"]

  // Load data from Data.json on mount
  useEffect(() => {
    fetch("/api/assignments")
      .then((res) => res.json())
      .then((data) => {
        const assignments = data.Assignment || []
        const items: TodoItem[] = assignments.map((a: { id?: string; assignment_name?: string; course_title?: string; type?: string; due_date?: string; points?: string | null; status?: string }) => ({
          id: a.id || generateId(),
          assignment_name: a.assignment_name || "",
          course_title: a.course_title || "",
          type: a.type || "",
          due_date: a.due_date || "",
          points: a.points != null ? String(a.points) : "",
          status: (a.status as TodoStatus) || "planned",
        }))
        setTodoItems(items)
      })
      .catch(() => {})
  }, [])

  // Load current gacha image and spent points from localStorage
  useEffect(() => {
    const savedImage = localStorage.getItem("currentGachaImage")
    if (savedImage) {
      try {
        setCurrentGachaImage(savedImage)
      } catch {
        setCurrentGachaImage("default.webp")
      }
    } else {
      // First launch - show default image
      setCurrentGachaImage("default.webp")
    }
    const savedSpent = localStorage.getItem("spentPoints")
    if (savedSpent) {
      try {
        setSpentPoints(parseFloat(savedSpent) || 0)
      } catch {
        setSpentPoints(0)
      }
    }
  }, [])

  // Save current gacha image and spent points to localStorage
  useEffect(() => {
    localStorage.setItem("currentGachaImage", currentGachaImage)
  }, [currentGachaImage])

  useEffect(() => {
    localStorage.setItem("spentPoints", String(spentPoints))
  }, [spentPoints])

  // Calculate total points from finished assignments (each task is worth 5 points)
  const totalEarnedPoints = todoItems
    .filter((item) => item.status === "finished")
    .length * pointsPerTask

  // Calculate available points (earned - spent)
  const availablePoints = totalEarnedPoints - spentPoints

  // Handle gacha roll
  const handleGachaRoll = useCallback(() => {
    if (availablePoints < rollCost) return

    // Filter out default outfit and current outfit from possible results
    const availableImages = gachaImages.filter(
      (img) => img !== "default.webp" && img !== currentGachaImage
    )
    
    // If no available images (shouldn't happen with 3 images), fallback to all non-default
    const imagesToChooseFrom = availableImages.length > 0 
      ? availableImages 
      : gachaImages.filter((img) => img !== "default.webp")
    
    // Randomly select an image from available options
    const randomImage = imagesToChooseFrom[Math.floor(Math.random() * imagesToChooseFrom.length)]
    
    // Set as current image (replaces previous)
    setCurrentGachaImage(randomImage)
    
    // Deduct points
    setSpentPoints((prev) => prev + rollCost)
  }, [availablePoints, rollCost, gachaImages, currentGachaImage])

  const syncToFile = useCallback(async (items: TodoItem[]) => {
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace",
          items: items.map((i) => ({
            id: i.id,
            assignment_name: i.assignment_name,
            course_title: i.course_title,
            type: i.type,
            due_date: i.due_date,
            points: i.points || null,
            status: i.status,
          })),
        }),
      })
      if (!res.ok) throw new Error("Sync failed")
    } catch {
      console.warn("Failed to sync to Data.json")
    }
  }, [])

  const handleImportClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    } else {
      setShowFileInput(true)
    }
  }, [])

  useEffect(() => {
    if (showFileInput && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [showFileInput])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.type !== "application/pdf") return

      setImporting(true)
      // Yield to let React paint the loading overlay before heavy work
      await new Promise((r) => setTimeout(r, 0))

      let text = ""
      try {
        text = await extractTextFromPDF(file)
      } catch {
        setImporting(false)
        e.target.value = ""
        return
      }

      try {
        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
        const data = await res.json()
        const assignments = data.Assignment || []

        const items: TodoItem[] = assignments.map(
          (a: { id?: string; assignment_name?: string; course_title?: string; type?: string; due_date?: string; points?: string | null; status?: string }) => ({
            id: a.id || generateId(),
            assignment_name: a.assignment_name || "",
            course_title: a.course_title || "",
            type: a.type || "",
            due_date: a.due_date || "",
            points: a.points != null ? String(a.points) : "",
            status: (a.status as TodoStatus) || "planned",
          })
        )

        setTodoItems(items)
      } catch {
        // Fallback: use raw line splitting if AI parse fails
        const lines = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
        const items: TodoItem[] = lines.map((line) => ({
          id: generateId(),
          assignment_name: line,
          course_title: "",
          type: "",
          due_date: "",
          points: "",
          status: "planned" as TodoStatus,
        }))
        setTodoItems((prev) => {
          const next = [...prev, ...items]
          syncToFile(next)
          return next
        })
      } finally {
        setImporting(false)
      }
      e.target.value = ""
    },
    [syncToFile]
  )

  const handleAddItem = useCallback(() => {
    const assignmentName = newAssignmentName.trim()
    if (!assignmentName) return
    const newItem: TodoItem = {
      id: generateId(),
      assignment_name: assignmentName,
      course_title: newCourseTitle.trim(),
      type: newType.trim(),
      due_date: newDueDate,
      points: newPoints.trim(),
      status: "planned",
    }
    setTodoItems((prev) => {
      const next = [...prev, newItem]
      syncToFile(next)
      return next
    })
    setNewAssignmentName("")
    setNewCourseTitle("")
    setNewType("")
    setNewDueDate("")
    setNewPoints("")
  }, [newAssignmentName, newCourseTitle, newType, newDueDate, newPoints, syncToFile])

  const updateItem = useCallback((id: string, updates: Partial<TodoItem>) => {
    setTodoItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
      syncToFile(next)
      return next
    })
  }, [syncToFile])

  const deleteItem = useCallback((id: string) => {
    setTodoItems((prev) => {
      const next = prev.filter((item) => item.id !== id)
      syncToFile(next)
      return next
    })
  }, [syncToFile])

  const handleCopy = useCallback(async () => {
    const text = todoItems
      .map(
        (item) =>
          `${item.assignment_name || "Untitled"} for ${item.course_title || "N/A"}, which is a ${item.type || "N/A"} assignment that is due on ${item.due_date || "N/A"}, worth ${item.points || "N/A"} points. ${item.status}`
      )
      .join("\n\n")
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
    }
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }, [todoItems])

  return (
    <div className="w-full min-h-screen relative bg-[#F7F5F3] overflow-x-hidden flex">
      {/* Todo section - left 3/4 */}
      <div className="w-3/4 flex flex-col min-h-screen relative">
        {/* Import loading overlay - fixed to cover full viewport */}
        {importing && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F7F5F3]/95 backdrop-blur-sm">
            <Loader2 className="size-12 text-[#37322F] animate-spin mb-4" />
            <p className="text-lg font-medium text-[#37322F] mb-1">
              Importing from PDF…
            </p>
            <p className="text-sm text-[#605A57]">
              AI is parsing your Canvas assignments and saving to your list
            </p>
          </div>
        )}
        <div className="flex flex-col flex-1 px-4 sm:px-6 md:px-8 lg:px-12 py-8">
          {/* Navigation */}
          <div className="flex justify-between items-center mb-8">
            <Link
              href="/"
              className="text-[#2F3037] text-sm sm:text-base md:text-lg font-medium leading-5 font-sans"
            >
              Anchor
            </Link>
          </div>

          {/* Buttons row */}
          <div className="flex gap-3 mb-6">
            {showFileInput && (
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            )}
            <Button
              onClick={handleImportClick}
              disabled={importing}
              className="h-10 px-6 rounded-full bg-[#37322F] text-white hover:bg-[#37322F]/90 gap-2"
            >
              <FileUp className="size-4" />
              {importing ? "Importing…" : "Import"}
            </Button>
            <Button
              onClick={handleCopy}
              variant="outline"
              className="h-10 px-6 rounded-full bg-white border-[rgba(55,50,47,0.12)] text-[#37322F] hover:bg-[#F7F5F3] gap-2"
            >
              <Copy className="size-4" />
              {copySuccess ? "Copied!" : "Copy"}
            </Button>
          </div>

          {/* Todo list card */}
          <div className="flex-1 min-h-[300px] bg-white rounded-lg border border-[rgba(55,50,47,0.08)] shadow-[0px_2px_4px_rgba(50,45,43,0.06)] p-6 flex flex-col">
            {/* Editable title */}
            <Input
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
              className="text-lg font-semibold text-[#37322F] border-0 border-b border-transparent hover:border-[rgba(55,50,47,0.2)] focus-visible:border-[#37322F] focus-visible:ring-0 px-0 mb-4"
              placeholder="List title"
            />

            {/* Add item form */}
            <div className="flex flex-wrap gap-2 mb-6">
              <Input
                value={newAssignmentName}
                onChange={(e) => setNewAssignmentName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                placeholder="Assignment name"
                className="flex-1 min-w-[120px] bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
              />
              <Input
                value={newCourseTitle}
                onChange={(e) => setNewCourseTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                placeholder="Course title"
                className="w-[120px] bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
              />
              <Input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                placeholder="Type"
                className="w-[100px] bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
              />
              <Input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                placeholder="Due date"
                className="w-[140px] bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
              />
              <Input
                value={newPoints}
                onChange={(e) => setNewPoints(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                placeholder="Points"
                className="w-[80px] bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
              />
              <Button
                onClick={handleAddItem}
                size="sm"
                className="h-9 px-4 rounded-md bg-[#37322F] text-white hover:bg-[#37322F]/90 gap-2"
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>

            {/* Todo items */}
            {todoItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 min-h-[150px] text-[#605A57] text-sm">
                
              </div>
            ) : (
              <ul className="space-y-2">
                {todoItems.map((item) => (
                  <TodoRow
                    key={item.id}
                    item={item}
                    onUpdate={(updates) => updateItem(item.id, updates)}
                    onDelete={() => deleteItem(item.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Right 1/4 - Gacha System */}
      <div className="w-1/4 min-h-screen border-l border-[rgba(55,50,47,0.12)] bg-white flex flex-col">
        <div className="flex flex-col h-full p-6">
          {/* Gacha Header */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#37322F] mb-2 flex items-center gap-2">
              <Sparkles className="size-5" />
              Gacha System
            </h2>
            <p className="text-sm text-[#605A57] mb-4">
              Spend points to collect outfits!
            </p>
            
            {/* Points Display */}
            <div className="bg-[#F7F5F3] rounded-lg p-4 mb-4 border border-[rgba(55,50,47,0.08)]">
              <div className="text-xs text-[#605A57] mb-1">Available Points</div>
              <div className="text-2xl font-bold text-[#37322F]">{Math.floor(availablePoints)}</div>
              <div className="text-xs text-[#605A57] mt-1">
                Earned: {Math.floor(totalEarnedPoints)} | Spent: {Math.floor(spentPoints)}
              </div>
            </div>

            {/* Roll Button */}
            <Button
              onClick={handleGachaRoll}
              disabled={availablePoints < rollCost}
              className="w-full h-12 rounded-lg bg-[#37322F] text-white hover:bg-[#37322F]/90 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
            >
              <Sparkles className="size-4 mr-2" />
              Roll ({rollCost} points)
            </Button>
            {availablePoints < rollCost && (
              <p className="text-xs text-[#605A57] text-center">
                Need {rollCost - Math.floor(availablePoints)} more points
              </p>
            )}
          </div>

          {/* Current Image Display */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <h3 className="text-sm font-medium text-[#37322F] mb-4">Current Outfit</h3>
            <div className="relative w-full max-w-[200px] aspect-square rounded-lg overflow-hidden border border-[rgba(55,50,47,0.12)] bg-[#F7F5F3] shadow-sm">
              <Image
                src={`/images/${currentGachaImage}`}
                alt="Current gacha outfit"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 200px, 200px"
              />
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat button - fixed at bottom */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setChatOpen((prev) => !prev)}
          className="h-14 w-14 rounded-full bg-[#37322F] text-white hover:bg-[#37322F]/90 shadow-lg"
          size="icon"
          aria-label={chatOpen ? "Close AI Chat" : "Open AI Chat"}
        >
          <MessageCircle className="size-6" />
        </Button>
      </div>

      {/* AI Chat window - slides up from bottom */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] h-[500px] bg-white rounded-lg border border-[rgba(55,50,47,0.12)] shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(55,50,47,0.08)] bg-[#F7F5F3]">
            <span className="text-sm font-medium text-[#37322F]">AI Assistant</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setChatOpen(false)}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
          <iframe
            src="https://www.playlab.ai/embedded/cmlb64ig60bq0ra0uhywa2xsu"
            title="AI Chatbot"
            className="flex-1 w-full min-h-0 border-0"
            allow="clipboard-write"
          />
        </div>
      )}
    </div>
  )
}

function TodoRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: TodoItem
  onUpdate: (updates: Partial<TodoItem>) => void
  onDelete: () => void
}) {
  const statusColors: Record<TodoStatus, string> = {
    planned: "bg-[#E0DEDB]",
    started: "bg-amber-200",
    finished: "bg-emerald-200",
  }

  return (
    <li className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-[#F7F5F3]/50 group">
      {/* Status select - left */}
      <Select
        value={item.status}
        onValueChange={(v: TodoStatus) => onUpdate({ status: v })}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            "w-[100px] shrink-0 h-8 text-xs border-0 bg-transparent",
            statusColors[item.status]
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="planned">Planned</SelectItem>
          <SelectItem value="started">Started</SelectItem>
          <SelectItem value="finished">Finished</SelectItem>
        </SelectContent>
      </Select>

      {/* Assignment name */}
      <Input
        value={item.assignment_name}
        onChange={(e) => onUpdate({ assignment_name: e.target.value })}
        placeholder="Assignment name"
        className="flex-1 min-w-0 border-0 border-b border-transparent hover:border-[rgba(55,50,47,0.2)] focus-visible:border-[#37322F] focus-visible:ring-0 px-0 h-8 py-1 text-sm text-[#37322F] bg-transparent"
      />

      {/* Course title */}
      <Input
        value={item.course_title}
        onChange={(e) => onUpdate({ course_title: e.target.value })}
        placeholder="Course title"
        className="w-[120px] shrink-0 h-8 text-xs bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
      />

      {/* Type */}
      <Input
        value={item.type}
        onChange={(e) => onUpdate({ type: e.target.value })}
        placeholder="Type"
        className="w-[100px] shrink-0 h-8 text-xs bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
      />

      {/* Due date */}
      <Input
        type="date"
        value={item.due_date}
        onChange={(e) => onUpdate({ due_date: e.target.value })}
        className="w-[130px] shrink-0 h-8 text-xs bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
      />

      {/* Points */}
      <Input
        value={item.points}
        onChange={(e) => onUpdate({ points: e.target.value })}
        placeholder="Points"
        className="w-[80px] shrink-0 h-8 text-xs bg-[#F7F5F3] border-[rgba(55,50,47,0.12)]"
      />

      {/* Delete button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="size-8 shrink-0 text-[#605A57] hover:text-[#37322F] hover:bg-[#E0DEDB]/50"
        aria-label="Delete item"
      >
        <X className="size-4" />
      </Button>
    </li>
  )
}
