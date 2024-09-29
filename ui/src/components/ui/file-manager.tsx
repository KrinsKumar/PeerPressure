"use client"

import React, { Component } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Ruler } from "lucide-react"

const NEXT_PUBLIC_TRACKER_ADDRESS = process.env.NEXT_PUBLIC_TRACKER_ADDRESS

const reorder = (list, startIndex, endIndex) => {
  const result = Array.from(list)
  const [removed] = result.splice(startIndex, 1)
  result.splice(endIndex, 0, removed)
  return result
}

const move = (source, destination, droppableSource, droppableDestination) => {
  const sourceClone = Array.from(source)
  const destClone = Array.from(destination)
  const [removed] = sourceClone.splice(droppableSource.index, 1)
  destClone.splice(droppableDestination.index, 0, removed)
  return {
    [droppableSource.droppableId]: sourceClone,
    [droppableDestination.droppableId]: destClone
  }
}

const getItemStyle = (isDragging, draggableStyle) => ({
  userSelect: 'none',
  padding: '16px',
  margin: '0 0 8px 0',
  background: isDragging ? 'lightblue' : 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '5px',
  ...draggableStyle
})

const getListStyle = isDraggingOver => ({
  background: isDraggingOver ? '#f7fafc' : 'white',
  padding: '8px',
  width: '100%'
})

const getAllFilesInSystem = () => {
  return fetch(`${NEXT_PUBLIC_TRACKER_ADDRESS}/files`)
    .then((response) => response.json())
    .then((files) => {
      return Object.entries(files).map(([fileId, fileInfo]) => ({
        id: fileId,
        content: fileInfo?.fileName,
        size: fileInfo?.size
      }))
    })
    .catch((error) => console.error(error))
}

export class FileManager extends Component {
  state = {
    items: [],
    selected: [],
    expanded: null,
  }

  componentDidMount() {
    getAllFilesInSystem().then((items) => {
      this.setState({...this.state, items: items || []})
    })
  }

  id2List = {
    droppable: 'items',
    droppable2: 'selected'
  }

  getList = id => this.state[this.id2List[id]]

  onDragEnd = result => {
    const { source, destination } = result

    if (!destination) {
      return
    }

    if (source.droppableId === destination.droppableId) {
      const items = reorder(
        this.getList(source.droppableId),
        source.index,
        destination.index
      )

      let state = { items }

      if (source.droppableId === 'droppable2') {
        state = { selected: items }
      }

      this.setState(state)
    } else {
      const result = move(
        this.getList(source.droppableId),
        this.getList(destination.droppableId),
        source,
        destination
      )

      this.setState({
        items: result.droppable,
        selected: result.droppable2
      })
    }
  }

  onSelect = (selected) => {
    this.setState({...this.state, expanded: selected})
  }

  render() {
    return (
      <DragDropContext onDragEnd={this.onDragEnd}>
        <div className="flex flex-row gap-4 h-fit">
          <Card className="h-full w-full">
            <CardHeader>
              <CardTitle>Available Files</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Droppable droppableId="droppable">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      style={getListStyle(snapshot.isDraggingOver)}
                    >
                      {this.state.items.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => this.onSelect(item)}
                              style={getItemStyle(
                                snapshot.isDragging,
                                provided.draggableProps.style
                              )}
                              className="truncate cursor-pointer hover:bg-gray-100"
                            >
                              {item.content.length > 40 ? `${item.content.slice(0, 37)}...` : item.content}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className="h-full w-full">
            <CardHeader>
              <CardTitle>Downloaded Files</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Droppable droppableId="droppable2">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      style={getListStyle(snapshot.isDraggingOver)}
                    >
                      {this.state.selected.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => this.onSelect(item)}
                              style={getItemStyle(
                                snapshot.isDragging,
                                provided.draggableProps.style
                              )}
                              className="truncate cursor-pointer hover:bg-gray-100"
                            >
                              {item.content}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className="w-[700px]">
            <CardHeader>
              <CardTitle>File Information</CardTitle>
            </CardHeader>
            <CardContent>
              {this.state.expanded ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <span className="font-medium text-lg">{this.state.expanded.content.length > 20 ? `${this.state.expanded.content.slice(0, 17)}...` : this.state.expanded.content}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Ruler className="h-5 w-5 text-green-500" />
                    <span>{this.state.expanded.size} bytes</span>
                  </div>
                  {this.state.expanded.downloadedAt && (
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">Downloaded at:</span>
                      <span>{new Date(this.state.expanded.downloadedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500">
                  Select a file for more information
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DragDropContext>
    )
  }
}
