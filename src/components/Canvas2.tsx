import { useEffect, useRef } from "react";
import { SVG, Svg } from "@svgdotjs/svg.js";
import "@svgdotjs/svg.draggable.js";
import "@svgdotjs/svg.resize.js";
import "@svgdotjs/svg.select.js";


export default function Canvas2() {
    const svgRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<Svg | null>(null);

    useEffect(() => {
        if (!svgRef.current || drawRef.current) return; // Only one canvas.

        const draw = SVG().addTo(svgRef.current).size(600, 400).attr({
            style: "background:white; border:1px solid #ccc",
        });

        drawRef.current = draw;

        return () => {
            draw.clear();
        };
    }, []);

    const addShape = () => {
        if (!drawRef.current) return;
        const rect = drawRef.current.rect(100, 100).move(50, 50).fill("#aaf");

        rect.select();
        rect.resize();
        rect.draggable();
    };

    return ( // move style somewhere else
    <div className="flex flex-col items-center">
        <style>{` 
                .svg_select_shape {
                    fill: transparent !important;
                    stroke: #000 !important;
                    stroke-width: 1px !important;
                    stroke-dasharray: 5,5 !important;
                    pointer-events: none !important; /* This allows clicks to pass through */
                }
                .svg_select_handle {
                    fill: #fff !important;
                    stroke: #000 !important;
                    stroke-width: 1px !important;
                }
            `}</style>
        <div className="mb-2 space-x-2">
            <button onClick={addShape}>
                Add Shape
            </button>
        </div>
        <div ref={svgRef}></div>
    </div>
    );
}