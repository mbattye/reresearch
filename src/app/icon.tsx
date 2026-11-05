import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export function renderMark(px: number) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #5b5bd6, #2a2a7a)",
        color: "white",
        fontSize: px * 0.5,
        fontWeight: 700,
        letterSpacing: -px * 0.02,
      }}
    >
      re
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(renderMark(size.width), size);
}
