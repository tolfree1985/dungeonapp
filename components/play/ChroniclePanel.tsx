"use client";

import type { CSSProperties, ReactNode } from "react";
import styles from "./ChroniclePanel.module.css";
import { chronicleTheme, type ChroniclePanelTone } from "./chronicleTheme";

type ChroniclePanelProps = {
  title?: string;
  children: ReactNode;
  tone?: ChroniclePanelTone;
  eyebrow?: string;
  footer?: ReactNode;
  className?: string;
};

const toneClassMap: Record<ChroniclePanelTone, string> = {
  default: styles.toneDefault,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  debug: styles.toneDebug,
};

export default function ChroniclePanel({
  title,
  children,
  tone = "default",
  eyebrow,
  footer,
  className,
}: ChroniclePanelProps) {
  return (
    <section
      className={`${styles.panel} ${toneClassMap[tone]} ${className ?? ""}`.trim()}
      style={
        {
          "--chronicle-panel": chronicleTheme.panel,
          "--chronicle-panel-deep": chronicleTheme.panelDeep,
          "--chronicle-border": chronicleTheme.border,
          "--chronicle-border-soft": chronicleTheme.borderSoft,
          "--chronicle-text": chronicleTheme.text,
          "--chronicle-text-muted": chronicleTheme.textMuted,
          "--chronicle-accent": chronicleTheme.accent,
          "--chronicle-warning": chronicleTheme.warning,
          "--chronicle-danger": chronicleTheme.danger,
          "--chronicle-debug": chronicleTheme.debug,
        } as CSSProperties
      }
    >
      {title ? (
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
            <h2 className={styles.title}>{title}</h2>
          </div>
          <div className={styles.toneLabel}>{tone}</div>
        </header>
      ) : null}
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}
