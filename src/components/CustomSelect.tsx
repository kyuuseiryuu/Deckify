import { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  badge?: string;
  hint?: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = "请选择...",
  className = "",
  disabled = false,
  searchable,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [coords, setCoords] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearchEnabled =
    searchable !== undefined ? searchable : options.length > 8;

  const selectedOption = options.find((o) => o.value === value);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // If the trigger is scrolled completely out of view, close the dropdown
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = 240;
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const availableSpace = openUp ? spaceAbove - 12 : spaceBelow - 12;
    const maxHeight = Math.max(Math.min(availableSpace, 300), 120);

    setCoords({
      left: rect.left,
      width: rect.width,
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      return;
    }

    updateCoords();

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleScroll(e: Event) {
      // Ignore scroll events originating from inside the dropdown list
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        return;
      }
      updateCoords();
    }

    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("mousedown", handleClickOutside);

    if (isSearchEnabled) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }

    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isSearchEnabled, updateCoords]);

  const filteredOptions = isSearchEnabled && searchTerm.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (o.hint && o.hint.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : options;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      if (!isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const curIdx = filteredOptions.findIndex((o) => o.value === value);
        if (curIdx < filteredOptions.length - 1) {
          onChange(filteredOptions[curIdx + 1].value);
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const curIdx = filteredOptions.findIndex((o) => o.value === value);
        if (curIdx > 0) {
          onChange(filteredOptions[curIdx - 1].value);
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${isOpen ? "open" : ""} ${disabled ? "disabled" : ""} ${className}`}
    >
      <div
        ref={triggerRef}
        className="custom-select-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="custom-select-trigger-content">
          {selectedOption ? (
            <>
              {selectedOption.icon && (
                <span className="custom-select-icon">{selectedOption.icon}</span>
              )}
              <span className="custom-select-label">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span className="custom-select-badge">{selectedOption.badge}</span>
              )}
            </>
          ) : (
            <span className="custom-select-placeholder">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`custom-select-arrow ${isOpen ? "rotate" : ""}`}
        />
      </div>

      {isOpen &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            className="custom-select-dropdown portal"
            style={{
              position: "fixed",
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              top: coords.top !== undefined ? `${coords.top}px` : "auto",
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : "auto",
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999,
            }}
            role="listbox"
          >
            {isSearchEnabled && (
              <div
                className="custom-select-search-wrap"
                onClick={(e) => e.stopPropagation()}
              >
                <Search size={13} className="custom-select-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="custom-select-search-input"
                  placeholder="快速筛选..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsOpen(false);
                    } else if (e.key === "Enter" && filteredOptions.length > 0) {
                      onChange(filteredOptions[0].value);
                      setIsOpen(false);
                    }
                  }}
                />
              </div>
            )}

            <div className="custom-select-options-list">
              {filteredOptions.length === 0 ? (
                <div className="custom-select-empty">未匹配到选项</div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <div
                      key={opt.value}
                      className={`custom-select-option ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="custom-select-option-content">
                        <div className="custom-select-option-main">
                          {opt.icon && (
                            <span className="custom-select-icon">{opt.icon}</span>
                          )}
                          <span className="custom-select-label">{opt.label}</span>
                          {opt.badge && (
                            <span className="custom-select-badge">{opt.badge}</span>
                          )}
                        </div>
                        {opt.hint && (
                          <span className="custom-select-hint">{opt.hint}</span>
                        )}
                      </div>
                      {isSelected && <Check size={14} className="custom-select-check" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
