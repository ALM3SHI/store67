import { Fragment } from "react";

/**
 * Minimal, safe formatter for admin-written text (no HTML is ever injected):
 *   ## Heading   ### Subheading   - bullet   blank line = new paragraph
 *   [label](https://link) for links.
 */
function inline(text: string) {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const external = m[2]!.startsWith("http");
    parts.push(
      <a key={m.index} href={m[2]} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={className ?? "prose-store"}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length === 0) return null;
        return (
          <Fragment key={i}>
            {(() => {
              const out: React.ReactNode[] = [];
              let list: string[] = [];
              const flush = () => {
                if (list.length) {
                  out.push(
                    <ul key={`u${out.length}`}>
                      {list.map((l, j) => (
                        <li key={j}>{inline(l)}</li>
                      ))}
                    </ul>,
                  );
                  list = [];
                }
              };
              let para: string[] = [];
              const flushPara = () => {
                if (para.length) {
                  out.push(<p key={`p${out.length}`}>{inline(para.join(" "))}</p>);
                  para = [];
                }
              };
              for (const l of lines) {
                const tline = l.trim();
                if (tline.startsWith("### ")) {
                  flush();
                  flushPara();
                  out.push(<h3 key={`h${out.length}`}>{tline.slice(4)}</h3>);
                } else if (tline.startsWith("## ")) {
                  flush();
                  flushPara();
                  out.push(<h2 key={`h${out.length}`}>{tline.slice(3)}</h2>);
                } else if (/^[-•*]\s+/.test(tline)) {
                  flushPara();
                  list.push(tline.replace(/^[-•*]\s+/, ""));
                } else {
                  flush();
                  para.push(tline);
                }
              }
              flush();
              flushPara();
              return out;
            })()}
          </Fragment>
        );
      })}
    </div>
  );
}
