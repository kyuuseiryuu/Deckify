import { useState } from "react";

interface PairingPageProps {
  authError: string | null;
  verifying: boolean;
  onSubmit: (code: string) => void;
}

export function PairingPage({
  authError,
  verifying,
  onSubmit,
}: PairingPageProps) {
  const [codeInput, setCodeInput] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "");
    setCodeInput(digitsOnly);
  };

  const handleSubmit = () => {
    const trimmed = codeInput.trim();
    if (!trimmed || verifying) return;
    onSubmit(trimmed);
  };

  return (
    <div className="deck-page">
      <div className="deck-token-prompt">
        <h2>输入配对码连接 LanDeck</h2>
        <p>初次连接请输入桌面端主页显示的数字配对码：</p>
        {authError && <p className="pairing-error-text">{authError}</p>}
        <div className="deck-token-row">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={16}
            value={codeInput}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="输入数字配对码"
            autoFocus
          />
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={verifying || !codeInput.trim()}
          >
            {verifying ? "验证中..." : "连接"}
          </button>
        </div>
      </div>
    </div>
  );
}
