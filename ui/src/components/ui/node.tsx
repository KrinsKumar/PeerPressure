import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface NodeSelectorProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  selected: string;
  onSelect: ({ address }: { address: string }) => void;
}

export const NodeSelector = ({ isOpen, setIsOpen, selected, onSelect }: NodeSelectorProps) => {
  const onSubmit = (formData: FormData) => {
    const address = formData.get("address")
    if (typeof address != "string") {
      return
    }
    setIsOpen(false)
    onSelect({ address })
  }
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" >
          {selected || "Select a Node"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select a Node</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col" name="node-selector" >
          <Input name="address" placeholder="localhost:3000" />
        </form>
        <div className="flex flex-row justify-end gap-1 mt-2">
          <Button onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button type="submit" form="node-selector" >Add Node</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
