import type { ReactNode } from "react";

/** A piece of an answer: a paragraph, or a list whose items are each kept as the model typed them. */
type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbers"; items: string[]; start: number };

type List = Extract<Block, { items: string[] }>;

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBER = /^\s*(\d{1,9})[.)]\s+(.*)$/;
// Two asterisks hugging the text, as in **Harbor & Pine**. A capture group, so split keeps the bold text.
const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/;

function begun<B extends Block>(blocks: Block[], block: B) {
  blocks.push(block);
  return block;
}

function withItem(list: List, item: string) {
  list.items.push(item);
  return list;
}

/** Puts a line in the open block, or begins a block with it, and gives the block it went into. */
function placed(line: string, open: Block | undefined, blocks: Block[]): Block {
  const bullet = BULLET.exec(line);
  if (bullet) {
    const list = open?.kind === "bullets" ? open : begun(blocks, { kind: "bullets", items: [] });
    return withItem(list, bullet[1]);
  }
  const number = NUMBER.exec(line);
  if (number) {
    const list = open?.kind === "numbers" ? open : begun(blocks, { kind: "numbers", items: [], start: +number[1] });
    return withItem(list, number[2]);
  }
  // An indented line carries on the list's last item.
  if (open && open.kind !== "paragraph" && /^\s/.test(line)) {
    open.items[open.items.length - 1] += `\n${line.trim()}`;
    return open;
  }
  if (open?.kind === "paragraph") {
    open.lines.push(line);
    return open;
  }
  return begun(blocks, { kind: "paragraph", lines: [line] });
}

/** Paragraphs part at a blank line, and a list begins at its first bullet or number. */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | undefined;
  for (const line of text.split(/\r\n|\r|\n/)) {
    open = line.trim() === "" ? undefined : placed(line, open, blocks);
  }
  return blocks;
}

/** The text with its bold picked out. Everything else, a link or a tag included, stays the characters typed. */
function withBold(text: string): ReactNode[] {
  return text.split(BOLD).map((piece, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold">
        {piece}
      </strong>
    ) : (
      piece
    ),
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === "paragraph") return <p className="whitespace-pre-wrap">{withBold(block.lines.join("\n"))}</p>;
  const items = block.items.map((item, index) => (
    <li key={index} className="whitespace-pre-wrap">
      {withBold(item)}
    </li>
  ));
  if (block.kind === "bullets") return <ul className="list-disc space-y-1 pl-5">{items}</ul>;
  return (
    <ol className="list-decimal space-y-1 pl-5" start={block.start === 1 ? undefined : block.start}>
      {items}
    </ol>
  );
}

/**
 * The Copilot's answer, as React text with paragraphs, lists and bold (Z6). It's the model's own text,
 * which records it read could have steered, so nothing in it becomes HTML, a link or an image.
 */
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 break-words">
      {blocksOf(text).map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
