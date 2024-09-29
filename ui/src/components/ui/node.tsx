'use client'

import { useEffect, useState } from "react"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, X } from "lucide-react"

interface Worker {
  id: number
  route: string
  status: "active" | "inactive"
  lastSeen: string
}

interface NodeSelectorProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  selected: string
  onSelect: (address: string) => void
}

export default function NodeSelector({ isOpen, setIsOpen, selected, onSelect }: NodeSelectorProps) {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<string>(selected)

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const response = await fetch('http://localhost:3000/workers')
        if (!response.ok) {
          throw new Error('Failed to fetch workers')
        }
        const data = await response.json()
        setWorkers(Object.values(data))
      } catch (err) {
        setError('Failed to load workers. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchWorkers()
  }, [])

  const handleSelect = (value: string) => {
    setSelectedRoute(value)
  }

  const handleConfirm = () => {
    if (selectedRoute) {
      onSelect(selectedRoute)
      setIsOpen(false)
    }
  }

  const handleReset = () => {
    setSelectedRoute('')
    onSelect('')
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="grow basis-0 flex justify-end">
          <Button variant="secondary" className="relative">
            {selected || "Select a Node"}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select a Node</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center items-center h-24">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center text-red-500">{error}</div>
        ) : (
          <Select onValueChange={handleSelect} value={selectedRoute}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a node" />
            </SelectTrigger>
            <SelectContent>
              {workers.map((worker) => (
                <SelectItem
                  key={worker.id}
                  value={worker.route}
                  disabled={worker.status !== 'active'}
                  className="flex items-center"
                >
                  <span className="mr-2" aria-hidden="true">
                    {worker.status === 'active' ? '🟢' : '🔴'}
                  </span>
                  {worker.route}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
         
          <Button variant="outline" onClick={handleReset}>Reset</Button>
          <Button onClick={handleConfirm} disabled={!selectedRoute}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}