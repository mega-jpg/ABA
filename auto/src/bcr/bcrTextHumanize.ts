/** Xác suất tin có lỗi chính tả kiểu gõ tay trên điện thoại */
const TYPO_CHANCE = 0.16;

const ACCENT_MAP: Record<string, string> = {
  à: "a", á: "a", ạ: "a", ả: "a", ã: "a",
  â: "a", ầ: "a", ấ: "a", ậ: "a", ẩ: "a", ẫ: "a",
  ă: "a", ằ: "a", ắ: "a", ặ: "a", ẳ: "a", ẵ: "a",
  è: "e", é: "e", ẹ: "e", ẻ: "e", ẽ: "e",
  ê: "e", ề: "e", ế: "e", ệ: "e", ể: "e", ễ: "e",
  ì: "i", í: "i", ị: "i", ỉ: "i", ĩ: "i",
  ò: "o", ó: "o", ọ: "o", ỏ: "o", õ: "o",
  ô: "o", ồ: "o", ố: "o", ộ: "o", ổ: "o", ỗ: "o",
  ơ: "o", ờ: "o", ớ: "o", ợ: "o", ở: "o", ỡ: "o",
  ù: "u", ú: "u", ụ: "u", ủ: "u", ũ: "u",
  ư: "u", ừ: "u", ứ: "u", ự: "u", ử: "u", ữ: "u",
  ỳ: "y", ý: "y", ỵ: "y", ỷ: "y", ỹ: "y",
  đ: "d",
};

function isLetter(ch: string): boolean {
  return /[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(ch);
}

function letterIndices(chars: string[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (isLetter(chars[i])) idx.push(i);
  }
  return idx;
}

function dropAccent(chars: string[]): void {
  const idx = letterIndices(chars).filter((i) => ACCENT_MAP[chars[i].toLowerCase()]);
  if (idx.length === 0) return;
  const i = idx[Math.floor(Math.random() * idx.length)];
  const lower = chars[i].toLowerCase();
  const plain = ACCENT_MAP[lower];
  chars[i] = chars[i] === lower ? plain : plain;
}

function swapAdjacent(chars: string[]): void {
  const idx = letterIndices(chars);
  if (idx.length < 2) return;
  const i = idx[Math.floor(Math.random() * (idx.length - 1))];
  const j = idx[idx.indexOf(i) + 1] ?? i + 1;
  if (j < chars.length && isLetter(chars[j])) {
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
}

function duplicateChar(chars: string[]): void {
  const idx = letterIndices(chars);
  if (idx.length === 0) return;
  const i = idx[Math.floor(Math.random() * idx.length)];
  chars.splice(i, 0, chars[i]);
}

function skipChar(chars: string[]): void {
  const idx = letterIndices(chars);
  if (idx.length < 4) return;
  const i = idx[Math.floor(Math.random() * idx.length)];
  chars.splice(i, 1);
}

function replaceCommon(chars: string[]): void {
  const text = chars.join("");
  const pairs: [RegExp, string][] = [
    [/kh/gi, "k"],
    [/ng(?=[aeiou])/gi, "n"],
    [/ch/gi, "c"],
    [/tr/gi, "t"],
    [/ph/gi, "f"],
  ];
  for (const [re, rep] of pairs) {
    if (re.test(text) && Math.random() < 0.5) {
      const m = text.match(re);
      if (m?.index != null) {
        const start = m.index;
        const len = m[0].length;
        const replacement = rep.length === 1 ? rep : rep;
        chars.splice(start, len, ...replacement.split(""));
        return;
      }
    }
  }
}

function applyOneTypo(chars: string[]): void {
  const fns = [dropAccent, swapAdjacent, duplicateChar, skipChar, replaceCommon];
  const fn = fns[Math.floor(Math.random() * fns.length)];
  fn(chars);
}

/** Thỉnh thoảng thêm 1–2 lỗi chính tả tự nhiên */
export function maybeApplyTypos(text: string): string {
  if (!text || Math.random() > TYPO_CHANCE) return text;
  const chars = [...text];
  const count = Math.random() < 0.38 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    applyOneTypo(chars);
  }
  return chars.join("");
}

export function humanizeMessages(messages: string[]): string[] {
  return messages.map((m) => maybeApplyTypos(m));
}
