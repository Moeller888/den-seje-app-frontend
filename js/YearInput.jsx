import React, { useEffect, useRef } from "react";

export default function YearInput({
  value,
  onChange,
  autoFocus = true,
  disabled = false,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const sanitize = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    return digits;
  };

  const handleChange = (e) => {
    const cleaned = sanitize(e.target.value);
    onChange(cleaned);
  };

  const handleKeyDown = (e) => {
    const allowedKeys = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
    ];

    if (allowedKeys.includes(e.key)) return;

    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const cleaned = sanitize(pasted);
    onChange(cleaned);
  };

  const boxes = [0, 1, 2, 3];

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative" }}>
        {/* Hidden real input */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
          }}
        />

        {/* Visual boxes */}
        <div
          onClick={() => inputRef.current && inputRef.current.focus()}
          style={{
            display: "flex",
            gap: "8px",
            cursor: disabled ? "default" : "text",
          }}
        >
          {boxes.map((i) => (
            <div
              key={i}
              style={{
                width: "50px",
                height: "60px",
                border: "2px solid #ccc",
                borderRadius: "8px",
                fontSize: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: disabled ? "#f5f5f5" : "#fff",
                fontWeight: "bold",
              }}
            >
              {value[i] || ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}