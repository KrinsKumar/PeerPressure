import React, { Component } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText } from "lucide-react"

// a little function to help us with reordering the result
const reorder = (list, startIndex, endIndex) => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    return result;
};

/**
 * Moves an item from one list to another list.
 */
const move = (source, destination, droppableSource, droppableDestination) => {
    const sourceClone = Array.from(source);
    const destClone = Array.from(destination);
    const [removed] = sourceClone.splice(droppableSource.index, 1);

    destClone.splice(droppableDestination.index, 0, removed);

    const result = {};
    result[droppableSource.droppableId] = sourceClone;
    result[droppableDestination.droppableId] = destClone;

    console.log(`moved: ${removed}`)
    return result;
};

const grid = 8;

const getItemStyle = (isDragging, draggableStyle) => ({
    // some basic styles to make the items look a bit nicer
    userSelect: 'none',
    padding: grid * 2,
    margin: `0 0 ${grid}px 0`,

    // change background colour if dragging
    background: 'white',
    borderWidth: 1,
    borderRadius: '5px',

    // styles we need to apply on draggables
    ...draggableStyle
});

const getListStyle = isDraggingOver => ({
    padding: grid,
});

export class FileManager extends Component {
    state = {
        items: [
          {
            id: "1",
            content: "finding nemo",
          },
          {
            id: "2",
            content: "dora",
          },
          {
            id: "4",
            content: "a",
          },
          {
            id: "5",
            content: "b",
          },
          {
            id: "6",
            content: "c",
          },
          {
            id: "7",
            content: "d",
          },
          {
            id: "8",
            content: "e",
          },
          {
            id: "9",
            content: "f"
          },
          {
            id: "10",
            content: "g",
          },
          {
            id: "11",
            content: "j",
          }
        ],
        selected: [
          {
            id: "3",
            content: "lion king",
          }
        ],
        expanded: null,
    };

    /**
     * A semi-generic way to handle multiple lists. Matches
     * the IDs of the droppable container to the names of the
     * source arrays stored in the state.
     */
    id2List = {
        droppable: 'items',
        droppable2: 'selected'
    };

    getList = id => this.state[this.id2List[id]];

    onDragEnd = result => {
        const { source, destination } = result;

        // dropped outside the list
        if (!destination) {
            return;
        }

        if (source.droppableId === destination.droppableId) {
            const items = reorder(
                this.getList(source.droppableId),
                source.index,
                destination.index
            );

            let state = { items };

            if (source.droppableId === 'droppable2') {
                state = { selected: items };
            }

            this.setState(state);
        } else {
            const result = move(
                this.getList(source.droppableId),
                this.getList(destination.droppableId),
                source,
                destination
            );

            this.setState({
                items: result.droppable,
                selected: result.droppable2
            });
        }
    };

    onSelect = (selected) => {
      this.setState({...this.state, expanded: selected})
    }

    // Normally you would want to split things out into separate components.
    // But in this example everything is just done in one place for simplicity
    render() {
        return (
            <DragDropContext onDragEnd={this.onDragEnd}>
              <div className="flex flex-row gap-4 h-fit">
                <Card className="h-full w-full">
                  <CardHeader>
                    <CardTitle>Available Files</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[600px] p-4">
                      <Droppable
                        droppableId="droppable"
                        renderClone={(provided, snapshot, rubric) => (
                          <div
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            ref={provided.innerRef}
                            style={
                              getItemStyle(
                                snapshot.isDragging,
                                provided.draggableProps.style,
                              )
                            }
                          >
                            {this.state.items[rubric.source.index].content}
                          </div>
                        )}
                      >
                          {(provided, snapshot) => (
                              <div
                                  ref={provided.innerRef}
                                  className="flex flex-col w-full"
                                  style={getListStyle(snapshot.isDraggingOver)}>
                                  {this.state.items.map((item, index) => (
                                      <Draggable
                                          key={item.id}
                                          draggableId={item.id}
                                          index={index}>
                                          {(provided, snapshot) => (
                                              <div
                                                  ref={provided.innerRef}
                                                  {...provided.draggableProps}
                                                  {...provided.dragHandleProps}
                                                  onClick={() => this.onSelect(item)}
                                                  style={getItemStyle(
                                                      snapshot.isDragging,
                                                      provided.draggableProps.style
                                                  )}>
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
                <Card className="w-full h-full">
                  <CardHeader>
                    <CardTitle>Downloaded Files</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[600px] p-4">
                      <Droppable droppableId="droppable2">
                          {(provided, snapshot) => (
                              <div
                                  ref={provided.innerRef}
                                  className="flex flex-col"
                                  style={getListStyle(snapshot.isDraggingOver)}>
                                  {this.state.selected.map((item, index) => (
                                      <Draggable
                                          key={item.id}
                                          draggableId={item.id}
                                          index={index}>
                                          {(provided, snapshot) => (
                                              <div
                                                  ref={provided.innerRef}
                                                  {...provided.draggableProps}
                                                  {...provided.dragHandleProps}
                                                  onClick={() => this.onSelect(item)}
                                                  style={getItemStyle(
                                                      snapshot.isDragging,
                                                      provided.draggableProps.style
                                                  )}>
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
                {this.state.expanded ? (
                  <Card className="w-[700px]">
                    <CardHeader>
                      <CardTitle className="flex justify-between items-center">
                        File Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4" />
                          <span>{this.state.expanded.content}</span>
                        </div>
                        {this.state.expanded.downloadedAt && (
                          <div>
                            <span>Downloaded at:</span> {new Date(this.state.expanded.downloadedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="w-[700px]">
                    <CardHeader>
                      <CardTitle className="flex justify-between items-center">
                        File Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-muted">Select a file to get started.</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </DragDropContext>
        );
    }
}
