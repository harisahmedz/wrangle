import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: true });

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "del", "code", "pre",
    "blockquote", "ul", "ol", "li", "a", "h3", "h4",
    "hr", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
};

export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return "";
  return sanitizeHtml(marked.parse(source, { async: false }), OPTIONS);
}
