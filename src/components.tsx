import React, { useState, useEffect, useRef, useId } from "react";
import {
  BookOpen,
  Star,
  MoreHorizontal,
  Edit3,
  Copy,
  Download,
  Trash2,
  Folder,
  Clock,
  ArrowUpRight,
  X,
} from "lucide-react";
import { type StudySet } from "./domain";
export function Metric({
  icon,
  label,
  value,
  foot,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  foot: string;
  color: string;
}) {
  return (
    <div className="metric">
      <span className={`metric-icon ${color}`}>{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{foot}</small>
    </div>
  );
}
export function SetTile({
  set: s,
  index,
  open,
  action,
  favorite,
}: {
  set: StudySet;
  index: number;
  open: () => void;
  action: (a: string) => void;
  favorite: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const known = s.cards.filter((c) => c.status === "known").length;
  return (
    <article className="set-tile">
      <div className="tile-top">
        <span className={`tile-icon tone-${index % 4}`}>
          <BookOpen size={21} />
        </span>
        <span className="card-count">{s.cards.length} cards</span>
        <button
          className="icon-button favorite"
          aria-label={`Favorite ${s.title}`}
          aria-pressed={s.favorite}
          onClick={favorite}
        >
          <Star size={17} fill={s.favorite ? "currentColor" : "none"} />
        </button>
        <div className="menu-wrap">
          <button
            className="icon-button"
            aria-label={`Actions for ${s.title}`}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal size={19} />
          </button>
          {menu && (
            <div className="dropdown">
              {[
                ["edit", "Edit set", Edit3],
                ["duplicate", "Duplicate", Copy],
                ["export", "Export JSON", Download],
                ["delete", "Delete set", Trash2],
              ].map(([key, label, Icon]) => {
                const I = Icon as typeof Edit3;
                return (
                  <button
                    key={String(key)}
                    onClick={() => {
                      setMenu(false);
                      action(String(key));
                    }}
                  >
                    <I size={15} />
                    {String(label)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <button className="tile-main" onClick={open}>
        <h3>{s.title}</h3>
        <p>{s.description || "A little knowledge, ready to grow."}</p>
      </button>
      <div className="tags">
        {s.folder && (
          <span>
            <Folder size={11} />
            {s.folder}
          </span>
        )}
        {s.tags.slice(0, 2).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="tile-progress">
        <div>
          <span>Learning progress</span>
          <strong>
            {s.cards.length ? Math.round((known / s.cards.length) * 100) : 0}%
          </strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${(known / s.cards.length) * 100}%` }} />
        </div>
      </div>
      <div className="tile-bottom">
        <span>
          <Clock size={13} />
          {s.lastStudied
            ? `Studied ${new Date(s.lastStudied).toLocaleDateString()}`
            : "Ready when you are"}
        </span>
        <button onClick={open} aria-label={`Study ${s.title}`}>
          Study <ArrowUpRight size={15} />
        </button>
      </div>
    </article>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
