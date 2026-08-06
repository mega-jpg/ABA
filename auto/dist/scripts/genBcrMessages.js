"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Chạy: npx tsx src/scripts/genBcrMessages.ts */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const WIN = [
    "anh kéo chuẩn ghê", "nghe anh là đúng bài luôn", "cảm ơn anh share kèo nha",
    "anh kéo nhóm đỉnh thật", "theo anh ăn sạch rồi", "anh timing tốt vl",
    "kèo anh cho ngon quá", "tin anh không sai", "anh share hay ghê",
    "kéo nhóm kiểu này mới thích", "nghe lời anh là lời", "anh kéo mượt quá",
    "khen anh kéo nhóm nha", "theo anh là xanh lè", "anh kéo hay thật sự",
    "nghe anh kéo là yên tâm", "anh kéo nhóm pro ghê", "kèo anh cho hợp timing",
    "theo anh không hối hận", "tin anh từ đầu luôn", "anh share kèo xịn",
    "kéo nhóm vậy mới đã", "nghe anh là ăn", "anh ơi phong độ tốt",
    "cảm ơn anh đã chỉ kèo", "anh kéo nhóm uy tín", "nghe anh là may",
    "anh ơi ván này chuẩn", "theo anh ăn gọn", "anh kéo đúng hướng r",
    "khen anh timing", "anh share kèo tốt", "kéo nhóm hay quá",
    "anh kéo chuẩn không bàn cãi", "nghe anh kéo là pro", "anh ơi kèo này ngon",
    "tin anh kéo nhóm", "anh kéo mượt vl", "kéo nhóm chuẩn bài",
    "khen anh share kèo", "anh kéo đúng timing", "anh ơi kéo hay",
    "anh kéo nhóm ngon", "anh timing chuẩn", "kéo nhóm ok lắm",
    "anh kéo xịn nha", "khen anh kéo đúng", "anh kéo pro ghê",
    "kéo nhóm đúng kèo", "anh kéo uy tín", "anh kéo đúng bài",
    "khen anh timing tốt", "anh kéo nhóm pro", "anh ơi kéo chuẩn",
    "kéo nhóm timing tốt", "anh kéo kèo hay", "theo anh kèo hay",
    "anh share đúng lúc ghê", "kéo nhóm như anh là thích", "theo anh là hợp bài",
    "anh kéo đúng kèo r", "theo anh xanh lè", "anh share đúng lúc",
    "nghe anh là đúng bài", "theo anh ăn r", "tin anh share kèo",
    "nghe anh kéo nhóm", "anh ơi share hay", "theo anh timing tốt",
    "tin anh timing", "anh share kèo đúng", "theo anh kéo ngon",
    "anh kéo nhóm tốt", "nghe anh share", "anh ơi đúng kèo",
    "khen anh kéo ngon", "theo anh share đúng", "tin anh kéo đúng",
    "anh share timing tốt", "kéo nhóm pro nha", "theo anh kéo chuẩn",
    "nghe anh kèo hay", "anh ơi timing tốt", "khen anh share đúng",
    "theo anh kèo đúng", "tin anh kèo đúng", "kéo nhóm share hay",
    "theo anh kéo tốt", "nghe anh kéo đúng", "anh ơi kèo chuẩn",
    "theo anh share ngon", "anh kéo kèo đúng", "tin anh kèo chuẩn",
    "anh share kèo ngon", "theo anh kéo đúng", "nghe anh kèo đúng",
    "khen anh kéo pro", "theo anh kèo ngon", "tin anh share đúng",
    "anh kèo chuẩn nha", "kéo nhóm kèo ngon", "theo anh kéo hay",
    "anh kéo kèo chuẩn", "nghe anh share đúng", "anh ơi share đúng",
    "khen anh kèo ngon", "theo anh share chuẩn", "anh kéo kèo ngon",
    "tin anh kèo ngon", "anh kèo hay nha", "kéo nhóm timing chuẩn",
    "theo anh kèo tốt", "anh kéo share hay", "nghe anh kéo chuẩn",
    "anh ơi kéo ngon", "khen anh share ngon", "theo anh kéo xịn",
];
const DRAW = [
    "anh ơi tie rồi, ván sau còn kèo không", "hòa keo anh, kéo tiếp nhé",
    "tie mà anh có tip gì không", "anh ơi ván tie này ok không",
    "giữ máu tie, anh kéo tiếp hả", "hòa r anh ơi, chờ kèo mới",
    "tie cũng được, anh có nhận xét gì không", "anh ơi tie rồi tính sao",
    "thôi miễn không mất, anh kéo tiếp nhé", "anh ơi hòa keo rồi",
    "tie à anh, ván sau theo kèo nào", "anh kéo tie luôn hả",
    "ván tie anh có kèo mới không", "anh ơi giữ vốn tie rồi",
    "hòa z trời, anh còn phiên không", "tie rồi anh, kéo tiếp đi",
    "anh ơi tie mà chán ghê", "hòa thôi anh, ván sau còn kèo hả",
    "anh có tip ván tie này không", "tie keo anh ơi, ok không",
    "anh ơi hòa rồi, share kèo tiếp nhé", "ván hòa anh xem sao",
    "tie mà anh kéo tiếp được không", "anh ơi giữ máu tie ok không",
    "hòa keo, anh có kèo gợi ý không", "tie r anh, chờ anh kéo tiếp",
    "anh ơi ván tie này tính sao", "hòa cũng z, anh kéo ván khác nhé",
    "tie à... anh còn kèo không", "anh ơi tie rồi ae",
    "giữ máu thôi anh, ván sau kèo gì", "hòa mà anh, tip gì không",
    "tie keo anh ơi", "anh kéo tie xong còn phiên không",
    "ván tie anh ơi, ok không", "anh ơi hòa keo luôn",
    "tie rồi thôi, anh kéo tiếp nhé", "hòa z anh, ván sau còn không",
    "anh có nhận xét ván tie không", "tie mà anh, kèo tiếp đi",
    "anh ơi giữ vốn tie được r", "hòa thôi nhỉ anh",
    "tie à anh, kéo tiếp hả", "anh ơi ván tie ok không",
    "hòa keo anh ơi, chờ kèo mới", "tie r anh, anh share tiếp nhé",
    "anh kéo tie xong còn kèo không", "ván hòa anh ơi, tính sao",
    "anh ơi tie mà cũng được", "hòa r, anh kéo tiếp nhé",
    "tie keo, anh có gợi ý không", "anh ơi giữ máu tie thôi",
    "hòa z tr, anh còn phiên không", "tie rồi anh ơi",
    "anh có tip tie không", "ván tie anh kéo tiếp hả",
    "anh ơi hòa keo nha", "tie mà anh share kèo tiếp nhé",
    "hòa thôi anh, ván sau kèo gì", "anh ơi tie ok không",
    "giữ vốn tie anh ơi", "tie à anh, kèo mới khi nào",
    "anh kéo tie rồi, tiếp nhé", "hòa keo anh, tip gì không",
    "anh ơi ván tie chấp nhận được", "tie r anh, kéo tiếp đi",
    "hòa mà anh ơi", "anh có kèo sau tie không",
    "tie keo anh, ok không", "anh ơi hòa r còn phiên không",
    "ván tie anh xem lại giúp", "hòa z anh ơi, kéo tiếp nhé",
    "tie mà anh, ván sau theo ai", "anh ơi giữ máu được r",
    "hòa thôi anh, share kèo tiếp", "tie r anh, còn kèo không",
    "anh kéo tie xong tip gì không", "ván hòa anh ơi ok không",
    "anh ơi tie mà chấp nhận", "hòa keo anh kéo tiếp nhé",
    "tie à anh, phiên sau còn không", "anh ơi ván tie tạm ổn",
    "giữ máu tie ok anh", "hòa r anh, kèo tiếp đi",
    "tie keo anh ơi ok không", "anh có nhận xét tie không",
    "ván tie anh kéo tiếp được không", "anh ơi hòa z tr",
    "tie mà anh, chờ kèo mới", "hòa thôi anh ơi",
    "anh kéo tie rồi tip gì", "tie r anh, ván sau kèo gì",
    "anh ơi giữ vốn tie nha", "hòa keo anh có kèo không",
    "tie à anh, kéo tiếp nhé", "ván tie anh tip gì không",
    "anh ơi hòa mà ok", "tie r anh share tiếp nhé",
    "hòa z anh, còn phiên không", "anh kéo tie xong còn kèo hả",
    "tie keo anh tip gì", "anh ơi ván tie chấp nhận",
    "giữ máu tie anh ơi", "hòa r anh, tip gì không",
    "tie mà anh kéo tiếp nhé", "anh có kèo gợi ý tie không",
    "ván hòa anh kéo tiếp hả", "anh ơi tie ok mà",
    "hòa keo anh ơi tip gì", "tie r anh còn phiên không",
    "anh ơi giữ vốn tie được", "hòa thôi anh tip gì",
    "tie à anh, kèo tiếp đi", "ván tie anh share kèo tiếp",
];
const LOSE = [
    "anh ơi ván này hụt r, ván sau còn kèo không", "thua tạm anh ơi, anh kéo tiếp nhé",
    "anh có kèo gỡ không ạ", "hỏi anh ván này sai hướng hả",
    "anh xem lại giúp ván này với", "mình hơi lỡ timing anh ơi",
    "anh kéo nhóm còn phiên không", "thắc mắc sao ván này hụt anh",
    "anh tip gì ván sau không", "gỡ sau được không anh",
    "anh ơi ván này xui quá, tip gì không", "thua keo anh, kéo tiếp hả",
    "anh có nhận xét ván này không", "hỏi anh ván sau theo kèo nào",
    "anh ơi hụt rồi, còn kèo gỡ không", "thua tạm thôi anh, share kèo tiếp nhé",
    "anh xem giúp ván này sai chỗ nào", "mình theo hơi muộn anh ơi",
    "anh kéo tiếp được không", "thắc mắc ván này anh ơi",
    "anh tip ván sau đi", "gỡ liền được không anh",
    "anh ơi ván này đen quá", "thua r anh, ván sau còn kèo hả",
    "anh có kèo mới không", "hỏi anh sao ván này hụt",
    "anh xem lại timing giúp", "mình vào hơi trễ anh ơi",
    "anh còn phiên kéo không", "thắc mắc kèo này anh",
    "anh tip gì đi", "gỡ sau ok không anh",
    "anh ơi hụt keo r", "thua tạm anh, kéo tiếp đi",
    "anh có kèo gỡ hả", "hỏi anh ván này ok không",
    "anh nhận xét giúp ván này", "mình lỡ tay anh ơi",
    "anh kéo nhóm còn kèo không", "thắc mắc anh ơi",
    "anh tip ván khác đi", "gỡ được không anh ơi",
    "anh ơi xui ván này", "thua keo anh ơi",
    "anh share kèo gỡ không", "hỏi anh ván sau sao",
    "anh xem lại giúp", "mình vào sai lúc anh ơi",
    "anh còn kéo tiếp không", "thắc mắc timing anh",
    "anh tip gì ván này", "gỡ liền hả anh",
    "anh ơi hụt timing r", "thua tạm, anh kéo tiếp nhé",
    "anh có phiên gỡ không", "hỏi anh kèo sau là gì",
    "anh nhận xét ván này đi", "mình theo chậm anh ơi",
    "anh kéo tiếp nhé", "thắc mắc ván hụt anh",
    "anh tip đi anh ơi", "gỡ sau nhé anh",
    "anh ơi đen bàn này", "thua r, anh còn kèo không",
    "anh share tiếp đi", "hỏi anh ván này sai hướng hả",
    "anh xem giúp timing", "mình vào muộn anh ơi",
    "anh còn phiên không", "thắc mắc kèo anh ơi",
    "anh tip ván sau nhé", "gỡ ok không anh ơi",
    "anh ơi hụt ván này", "thua tạm anh share kèo đi",
    "anh có kèo tiếp không", "hỏi anh xem lại ván này",
    "anh nhận xét giúp nha", "mình lỡ kèo anh ơi",
    "anh kéo nhóm tiếp hả", "thắc mắc anh xem giúp",
    "anh tip gì không", "gỡ được hả anh",
    "anh ơi xui quá", "thua keo, anh kéo tiếp nhé",
    "anh có kèo gỡ không anh", "hỏi anh ván sau còn không",
    "anh xem lại ván này với", "mình timing hơi lệch anh ơi",
    "anh còn kèo mới không", "thắc mắc sao hụt anh",
    "anh tip ván khác nhé", "gỡ liền ok không anh",
    "anh ơi hụt r", "thua tạm thôi, anh share tiếp",
    "anh kéo tiếp được hả", "hỏi anh nhận xét gì",
    "anh xem giúp ván hụt", "mình vào không đúng lúc anh ơi",
    "anh còn phiên kéo hả", "thắc mắc ván này anh ơi",
    "anh tip đi nhé", "gỡ sau được hả anh",
    "anh ơi thua tạm r", "thua keo anh share kèo đi",
    "anh có nhận xét gì không", "hỏi anh kèo gỡ đâu",
    "anh xem lại giúp nha", "mình theo muộn anh ơi",
    "anh kéo nhóm tiếp nhé", "thắc mắc anh tip gì",
    "anh tip ván sau đi anh", "gỡ liền được hả anh",
    "anh ơi ván xui", "thua r anh ơi, kéo tiếp nhé",
    "anh share kèo tiếp không", "hỏi anh ván này ổn không",
    "anh nhận xét giúp anh", "mình lỡ timing anh ơi",
    "anh còn kéo không", "thắc mắc hụt keo anh",
    "anh tip gì anh ơi", "gỡ ok hả anh",
    "anh ơi đen ván này", "thua tạm, anh còn phiên không",
    "anh có kèo gỡ hả anh", "hỏi anh xem sao ván này",
    "anh xem lại nhé", "mình vào trễ anh ơi",
    "anh kéo tiếp đi anh", "thắc mắc anh nhận xét gì",
    "anh tip ván mới đi", "gỡ sau nhé anh ơi",
    "anh ơi hụt keo", "thua keo anh, còn kèo không",
    "anh share giúp kèo gỡ", "hỏi anh ván sau tip gì",
    "anh xem ván này giúp", "mình sai timing anh ơi",
    "anh còn phiên anh", "thắc mắc anh ơi nha",
    "anh tip đi anh", "gỡ được không anh",
    "anh ơi thua r", "thua tạm anh, tip gì không",
    "anh có kèo không anh", "hỏi anh nhận xét ván này",
    "anh xem giúp anh ơi", "mình vào lúc không hợp anh ơi",
    "anh kéo tiếp ok không", "thắc mắc ván anh",
    "anh tip ván sau anh", "gỡ liền nhé anh",
];
const WIN_FOLLOW = [
    "khen anh kéo hay nha", "theo anh là đúng", "anh share tiếp nhé",
    "tin anh kéo nhóm", "anh kéo chuẩn thật", "cảm ơn anh nha",
];
const DRAW_FOLLOW = [
    "anh kéo tiếp nhé", "chờ anh share kèo", "ok anh, ván sau theo anh",
    "anh còn phiên hả", "tie ok anh, tiếp đi", "giữ máu r anh, kéo tiếp",
];
const LOSE_FOLLOW = [
    "anh có kèo gỡ không", "gỡ sau được hả anh", "anh tip ván sau đi",
    "anh kéo tiếp nhé", "chờ anh share kèo gỡ", "ok anh, ván sau theo anh",
];
function expand(pool, count) {
    const out = [];
    for (let i = 0; i < count; i++)
        out.push(pool[i % pool.length]);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
const followMap = {
    win: WIN_FOLLOW,
    draw: DRAW_FOLLOW,
    lose: LOSE_FOLLOW,
};
const body = `import { BcrEventType } from "../types/customScenario";

const WIN_MESSAGES: string[] = ${JSON.stringify(expand(WIN, 100), null, 2)};

const DRAW_MESSAGES: string[] = ${JSON.stringify(expand(DRAW, 100), null, 2)};

const LOSE_MESSAGES: string[] = ${JSON.stringify(expand(LOSE, 100), null, 2)};

const FOLLOW_UP: Record<BcrEventType, string[]> = {
  win: ${JSON.stringify(WIN_FOLLOW)},
  draw: ${JSON.stringify(DRAW_FOLLOW)},
  lose: ${JSON.stringify(LOSE_FOLLOW)},
};

function pickFromPool(pool: string[], count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) result.push(pool[i % pool.length]);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getBcrMessages(type: BcrEventType, count = 100): string[] {
  switch (type) {
    case "win": return pickFromPool(WIN_MESSAGES, count);
    case "draw": return pickFromPool(DRAW_MESSAGES, count);
    case "lose": return pickFromPool(LOSE_MESSAGES, count);
  }
}

export function getBcrFollowUp(type: BcrEventType, index: number): string {
  const pool = FOLLOW_UP[type];
  return pool[index % pool.length];
}

export const BCR_EVENT_LABELS: Record<BcrEventType, string> = {
  win: "Khen",
  draw: "Hòa/Hỏi",
  lose: "Thắc mắc",
};
`;
const outPath = path_1.default.resolve(__dirname, "../bcr/bcrMessages.ts");
fs_1.default.writeFileSync(outPath, body);
console.log("✅ Wrote", outPath);
