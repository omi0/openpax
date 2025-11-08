import { useState } from "react";
import "./Canvas.css";

type Shape = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

export function Canvas() {
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null); // ID of the shape being modified.
    const [mode, setMode] = useState<"move" | "resize" | null>(null);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    const addTable = () => {
        const newShape = {
            id: crypto.randomUUID(),
            x: 50,
            y: 50,
            w: 100,
            h: 100,
        };
        setShapes([...shapes, newShape]);
    };

    // Records the clicked shape and offset when user starts dragging a shape.
    const handleMouseDown = ( e: React.MouseEvent<SVGElement, MouseEvent>, id: string, modeType: "move" | "resize" ) => {

        e.stopPropagation();
        const shape = shapes.find((s) => s.id === id);
        if (!shape) return;

        const mouseX = e.nativeEvent.offsetX;
        const mouseY = e.nativeEvent.offsetY;

        setActiveId(id);
        setMode(modeType);

        if (modeType === "move") {
            setOffset({ x: mouseX - shape.x, y: mouseY - shape.y });
        } else {
            setOffset({ x: shape.w - (mouseX - shape.x), y: shape.h - (mouseY - shape.y) });
        }
    };

    // Updates shape position while dragging.
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {

        if (!activeId) return;
        const mouseX = e.nativeEvent.offsetX;
        const mouseY = e.nativeEvent.offsetY;

        setShapes((prev) =>
            prev.map((s) => {

                if (s.id !== activeId) return s;

                if (mode === "move") {
                    return { ...s, x: mouseX - offset.x, y: mouseY - offset.y };
                }

                if (mode === "resize") {
                    const minSize = 50;
                    const maxSize = 300;

                    const newW = Math.min(maxSize, Math.max(minSize, mouseX - s.x + offset.x));
                    const newH = Math.min(maxSize,Math.max(minSize, mouseY - s.y + offset.y));
                    return { ...s, w: newW, h: newH };
                }

                return s;
            })
        );
    };

    // User stops dragging
    const handleMouseUp = () => {
        setActiveId(null);
        setMode(null);
        console.log(shapes);
    };

  return (
    
    <div className="flex flex-col items-center">
        <div className="mb-2 space-x-2">
            <button onClick={() => addTable()}>Add Table</button>
        </div>

        <div className="canvas-container">
            <svg
                width={600}
                height={400}
                className="border border-white-400 bg-white"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
            {shapes.map((s) => {
                return (
                    <g key={s.id}>
                        <rect
                            key={s.id}
                            x={s.x}
                            y={s.y}
                            width={s.w}
                            height={s.h}
                            fill="lightblue"
                            stroke="black"
                            onMouseDown={(e) => handleMouseDown(e, s.id, "move")}
                            style={{ cursor: "move" }}
                        />
                        <rect
                            x={s.x + s.w - 8}
                            y={s.y + s.h - 8}
                            width={8}
                            height={8}
                            fill="black"
                            onMouseDown={(e) => handleMouseDown(e, s.id, "resize")}
                            style={{ cursor: "nwse-resize" }}
                        />
                    </g>
                );
            })}
            </svg>
        </div>
    </div>
  );
}

export default Canvas;