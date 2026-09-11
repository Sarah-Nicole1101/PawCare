import React, { useEffect, useId, useRef } from "react";
import { X, PawPrint, Plus } from "lucide-react";
export function Button({ children, variant = "", ...props }) {
  return (
    <button className={`btn ${variant}`} {...props}>
      {children}
    </button>
  );
}
export function Field({ label, type = "text", options, children, ...props }) {
  const key = useId();
  return (
    <label className="field" htmlFor={key}>
      <span>{label}</span>
      {options ? (
        <select id={key} {...props}>
          {options.map((o) => (
            <option
              key={typeof o === "string" ? o : o.value}
              value={typeof o === "string" ? o : o.value}
            >
              {typeof o === "string" ? o : o.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea id={key} rows={3} {...props} />
      ) : (
        <input id={key} type={type} {...props} />
      )}
      {children}
    </label>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const node = ref.current;
    node.showModal();
    const cancel = (e) => {
      e.preventDefault();
      onClose();
    };
    node.addEventListener("cancel", cancel);
    return () => node.removeEventListener("cancel", cancel);
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({ title = "Nothing here yet", text, action, onAction }) {
  return (
    <div className="empty">
      <PawPrint size={32} strokeWidth={1.3} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && (
        <Button onClick={onAction}>
          <Plus size={17} />
          {action}
        </Button>
      )}
    </div>
  );
}
export function ErrorMessage({ message }) {
  return message ? (
    <div role="alert" className="error">
      {message}
    </div>
  ) : null;
}
export function PetPhoto({ pet, large = false }) {
  return pet.photo_id ? (
    <img
      className={`pet-photo ${large ? "large" : ""}`}
      src={`/api/files/${pet.photo_id}/content`}
      alt={pet.name}
    />
  ) : (
    <div className={`pet-photo placeholder ${large ? "large" : ""}`}>
      <PawPrint size={large ? 48 : 24} strokeWidth={1.3} />
    </div>
  );
}
