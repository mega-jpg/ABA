import { maybeApplyTypos } from "./bcrTextHumanize";

/** Cặp hỏi–đáp về nhóm & sảnh chơi — clone hỏi, clone/member trả lời */
export interface BcrQaPair {
  question: string;
  answer: string;
  topic: "group" | "hall";
}

export const QA_PAIRS: BcrQaPair[] = [
  // --- Nhóm ---
  { topic: "group", question: "nhóm này uy tín không ae?", answer: "mình chơi lâu rồi, ok lắm nha" },
  { topic: "group", question: "vào nhóm có mất phí gì không?", answer: "free thôi ae, join là xem kèo" },
  { topic: "group", question: "admin rep inbox nhanh không?", answer: "nhanh lắm, nhắn là có người trả lời" },
  { topic: "group", question: "nhóm kéo mấy giờ vậy ae?", answer: "sáng tới khuya luôn, lúc nào cũng có kèo" },
  { topic: "group", question: "nhóm này bao nhiêu người vậy?", answer: "đông lắm ae, sôi động ghê" },
  { topic: "group", question: "mới vào nhóm chơi sao ae?", answer: "theo anh kéo nhóm là được, đừng tự bắt" },
  { topic: "group", question: "nhóm có scam không mọi người?", answer: "mình chơi hoài chưa thấy gì, yên tâm" },
  { topic: "group", question: "kéo nhóm ở đây ai phụ trách?", answer: "admin kéo á, theo kèo share là ok" },
  { topic: "group", question: "nhóm này lâu chưa ae?", answer: "lâu rồi, đông thành viên lắm" },
  { topic: "group", question: "có ai mới vào giới thiệu nhóm giúp không?", answer: "join là xem kèo, theo anh kéo nhóm nha" },
  { topic: "group", question: "nhóm có quy định gì không?", answer: "spam ít thôi, còn lại thoải mái" },
  { topic: "group", question: "mời bạn vào nhóm được không?", answer: "được ae, kéo bạn vào chơi chung" },
  { topic: "group", question: "nhóm share kèo có chính xác không?", answer: "theo lâu thấy ổn, tỷ lệ khá cao" },
  { topic: "group", question: "ai biết nhóm này từ đâu vậy?", answer: "bạn giới thiệu, chơi thấy ok" },
  { topic: "group", question: "nhóm có hỗ trợ tân thủ không?", answer: "có ae, hỏi trong group là được chỉ" },
  { topic: "group", question: "admin online lúc nào?", answer: "gần như cả ngày, nhắn là rep" },
  { topic: "group", question: "nhóm này khác gì nhóm kia?", answer: "kéo nhóm sát, share kèo nhanh hơn" },
  { topic: "group", question: "có link nhóm chính không ae?", answer: "link admin share á, đừng vào link lạ" },
  { topic: "group", question: "nhóm có bị khóa không?", answer: "chưa thấy, chơi bình thường" },
  { topic: "group", question: "mới join có cần xác minh gì không?", answer: "không cần gì đâu, vào xem thôi" },
  { topic: "group", question: "nhóm có chơi cuối tuần không?", answer: "có ae, 24/7 luôn" },
  { topic: "group", question: "ai hay kéo nhóm ở đây vậy?", answer: "admin kéo chính, theo là được" },
  { topic: "group", question: "nhóm này đông vui không?", answer: "vui lắm, chat suốt" },
  { topic: "group", question: "có ai bị lừa ở nhóm này chưa?", answer: "mình chưa nghe ai bị, chơi ok" },
  { topic: "group", question: "nhóm có group phụ không?", answer: "có nhóm chính thôi, đừng vào nhóm lạ" },
  { topic: "group", question: "kéo nhóm có lịch cố định không?", answer: "có kèo là kéo, theo thông báo nhóm" },
  { topic: "group", question: "mới vào nên hỏi ai?", answer: "hỏi admin hoặc hỏi trong group nha" },
  { topic: "group", question: "nhóm có tuyển thành viên không?", answer: "ai cũng vào được, mời bạn luôn" },
  { topic: "group", question: "share kèo trong nhóm tin được không?", answer: "mình theo lâu thấy ổn á" },
  { topic: "group", question: "nhóm có bị report không ae?", answer: "chưa thấy, chơi bình thường thôi" },

  // --- Sảnh chơi ---
  { topic: "hall", question: "sảnh này có bao nhiêu bàn vậy?", answer: "nhiều bàn lắm, vào là có chỗ chơi" },
  { topic: "hall", question: "nạp rút nhanh không ae?", answer: "nhanh, mình rút có 5 phút" },
  { topic: "hall", question: "sảnh chơi có live không?", answer: "có live đàng hoàng, xem rõ lắm" },
  { topic: "hall", question: "mức cược tối thiểu bao nhiêu?", answer: "tùy bàn, có bàn thấp có bàn cao" },
  { topic: "hall", question: "sảnh này uy tín không?", answer: "chơi lâu rồi, nạp rút ok" },
  { topic: "hall", question: "có bàn BCR không ae?", answer: "có nhiều bàn BCR lắm" },
  { topic: "hall", question: "sảnh mở cửa mấy giờ?", answer: "24/7 ae, lúc nào cũng vào được" },
  { topic: "hall", question: "nạp tiền qua kênh nào?", answer: "admin chỉ kênh nạp, đừng nạp linh tinh" },
  { topic: "hall", question: "rút tiền lâu không?", answer: "nhanh lắm, vài phút là về" },
  { topic: "hall", question: "sảnh này lag không?", answer: "mình chơi mượt, ít lag" },
  { topic: "hall", question: "có app hay chơi web?", answer: "cả hai đều được, tùy ae thích" },
  { topic: "hall", question: "bàn nào dễ ăn ae?", answer: "theo anh kéo nhóm chỉ bàn, đừng tự chọn" },
  { topic: "hall", question: "sảnh có khuyến mãi gì không?", answer: "có đợt km, hỏi admin nha" },
  { topic: "hall", question: "chơi sảnh này an toàn không?", answer: "mình chơi hoài ok, yên tâm" },
  { topic: "hall", question: "link sảnh chính ở đâu?", answer: "admin share link chính, đừng vào link lạ" },
  { topic: "hall", question: "sảnh có dealer thật không?", answer: "có live dealer, xem thấy rõ" },
  { topic: "hall", question: "mức cược max bao nhiêu?", answer: "tùy bàn, bàn vip cao hơn" },
  { topic: "hall", question: "nạp tối thiểu bao nhiêu?", answer: "mức thấp thôi, hỏi admin chính xác" },
  { topic: "hall", question: "sảnh này có hỗ trợ tiếng Việt không?", answer: "có ae, giao diện tiếng Việt" },
  { topic: "hall", question: "rút về bank nào cũng được hả?", answer: "đúng rồi, bank nào cũng được" },
  { topic: "hall", question: "sảnh có bị bảo trì không?", answer: "thỉnh thoảng, thường nhanh thôi" },
  { topic: "hall", question: "chơi trên điện thoại được không?", answer: "được ae, mình chơi dt suốt" },
  { topic: "hall", question: "sảnh này so với sảnh kia sao?", answer: "mình thấy ổn hơn, nạp rút nhanh" },
  { topic: "hall", question: "có bàn speed BCR không?", answer: "có bàn nhanh lắm, thích hợp kéo nhóm" },
  { topic: "hall", question: "sảnh có giới hạn rút không?", answer: "có hạn mức, hỏi admin cho chắc" },
  { topic: "hall", question: "tài khoản mới chơi được luôn không?", answer: "đăng ký xong nạp là chơi được" },
  { topic: "hall", question: "sảnh có hỗ trợ khuya không?", answer: "có ae, 24/7 có người hỗ trợ" },
  { topic: "hall", question: "live sảnh này nét không?", answer: "nét lắm, xem bài rõ" },
  { topic: "hall", question: "nạp lần đầu có km không?", answer: "có đợt km tân thủ, hỏi admin" },
  { topic: "hall", question: "sảnh này ai hay chơi vậy?", answer: "đông ae, bàn nào cũng đông" },

  // --- Hỏi thêm nhóm ---
  { topic: "group", question: "nhóm có kèo free không?", answer: "có share kèo free trong group nha" },
  { topic: "group", question: "làm sao biết kèo chuẩn?", answer: "theo anh kéo nhóm, đừng tự đoán" },
  { topic: "group", question: "nhóm có họp offline không?", answer: "online thôi ae, chat group là chính" },
  { topic: "group", question: "ai mới vào chỉ giúp cách chơi với?", answer: "xem kèo admin share, hỏi trong group" },
  { topic: "group", question: "nhóm có cấm chat không?", answer: "chat bình thường, đừng spam thôi" },
  { topic: "group", question: "kéo nhóm hôm nay có không?", answer: "có kèo là có, theo thông báo nhóm" },
  { topic: "group", question: "nhóm này ai tạo vậy?", answer: "admin tạo, chơi lâu rồi" },
  { topic: "group", question: "có ai chơi nhóm này lâu chưa?", answer: "nhiều người chơi mấy tháng rồi" },
  { topic: "group", question: "nhóm có pin kèo không?", answer: "admin hay pin kèo quan trọng á" },
  { topic: "group", question: "vào nhóm có cần giới thiệu không?", answer: "không cần, click link là vào" },

  // --- Hỏi thêm sảnh ---
  { topic: "hall", question: "sảnh có bàn private không?", answer: "có bàn riêng, hỏi admin" },
  { topic: "hall", question: "chuyển khoản nạp mất bao lâu?", answer: "vài phút là lên, nhanh lắm" },
  { topic: "hall", question: "sảnh có lịch sử ván không?", answer: "có ae, xem lại được" },
  { topic: "hall", question: "chơi nhiều có bị giới hạn không?", answer: "không sao, chơi thoải mái" },
  { topic: "hall", question: "sảnh có road map không?", answer: "có bảng cầu đầy đủ nha" },
  { topic: "hall", question: "đổi bàn giữa chừng được không?", answer: "được ae, thoải mái đổi" },
  { topic: "hall", question: "sảnh hỗ trợ ví điện tử không?", answer: "có nhiều kênh, hỏi admin" },
  { topic: "hall", question: "rút lần đầu có lâu không?", answer: "lần đầu verify nhanh thôi" },
  { topic: "hall", question: "sảnh có chơi thử không?", answer: "phải nạp mới chơi thật ae" },
  { topic: "hall", question: "bàn nào đang hot vậy?", answer: "admin hay chỉ bàn hot trong group" },

  // --- Hỏi chung nhóm + sảnh ---
  { topic: "group", question: "nhóm gắn sảnh nào vậy ae?", answer: "admin share link sảnh chính trong group" },
  { topic: "hall", question: "sảnh này có liên kết nhóm không?", answer: "có nhóm hỗ trợ, join group nha" },
  { topic: "group", question: "nạp rút hỏi admin hay sảnh?", answer: "hỏi admin trong group, rep nhanh lắm" },
  { topic: "hall", question: "sảnh lỗi thì báo ai?", answer: "báo admin group, có người xử lý" },
  { topic: "group", question: "nhóm có hướng dẫn nạp không?", answer: "admin có hướng dẫn, hỏi là được" },
  { topic: "hall", question: "tài khoản sảnh quên pass làm sao?", answer: "nhắn admin hỗ trợ reset nha" },
  { topic: "group", question: "kèo nhóm chơi sảnh nào?", answer: "sảnh admin chỉ trong group á" },
  { topic: "hall", question: "sảnh có cần VPN không?", answer: "mình chơi không cần vpn" },
  { topic: "group", question: "nhóm có ai hỗ trợ nạp không?", answer: "admin hỗ trợ, đừng nhờ người lạ" },
  { topic: "hall", question: "sảnh mới update gì không ae?", answer: "thỉnh thoảng update, chơi bình thường" },
];

/** Câu hỏi đơn (không kèm đáp) — dùng cho tab Thắc mắc */
export const GROUP_HALL_QUESTIONS: string[] = QA_PAIRS.map((p) => p.question).concat([
  "nhóm này có đáng tin không ae?",
  "sảnh chơi ổn định không?",
  "ai chơi sảnh này rồi review giúp",
  "nhóm có ai bị lừa chưa?",
  "sảnh nạp có bị trừ phí không?",
  "kéo nhóm link sảnh ở đâu?",
  "nhóm có chơi tối không?",
  "sảnh có bàn mới không ae?",
  "mới vào nhóm cần biết gì?",
  "sảnh này rút có bị hold không?",
  "ai biết admin nhóm là ai?",
  "sảnh có giới hạn nạp không?",
  "nhóm share kèo có phí không?",
  "sảnh chơi trên ios được không?",
  "nhóm có group zalo không?",
  "sảnh có dealer xinh không :v",
  "nhóm kéo có chính xác không ae?",
  "sảnh này so sảnh kia thế nào?",
  "vào nhóm lâu mới ăn được không?",
  "sảnh có bị chặn bank không?",
]);

export function getBcrQaPairs(count = 60): BcrQaPair[] {
  const unique = QA_PAIRS.slice(0, Math.min(count, QA_PAIRS.length));
  const result = shufflePairs([...unique]);
  return result.map((p) => ({
    ...p,
    question: maybeApplyTypos(p.question),
    answer: maybeApplyTypos(p.answer),
  }));
}

function shufflePairs<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const BCR_QA_LABEL = "Hỏi đáp";
