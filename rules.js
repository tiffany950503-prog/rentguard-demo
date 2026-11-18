// 租屋守門人 Demo — 法規知識庫與契約檢查規則
// 注意：這是以規則比對模擬 AI 判斷的 Demo，僅供參考，非法律意見。

const LAW = {
  deposit: {
    title: "押金上限",
    text: "押金最高不得超過二個月租金總額。",
    src: "住宅租賃契約範本（押金約定及返還）",
    url: "https://osa.nycu.edu.tw/menuDoc/20293"
  },
  raise: {
    title: "租期內不得漲租",
    text: "出租人於租賃期間不得藉任何理由要求調漲租金。",
    src: "住宅租賃契約範本（租金約定及支付）",
    url: "https://osa.nycu.edu.tw/menuDoc/20293"
  },
  subsidy: {
    title: "不得限制申請租金補貼",
    text: "出租人不得於契約中明文禁止或以不當約款限制承租人申請租金補貼（2023 年增訂之不得記載事項）。",
    src: "內政部「住宅租賃定型化契約應記載及不得記載事項」修正說明",
    url: "https://www.ssivs.chc.edu.tw/resource/openfid.php?id=10514"
  },
  terminate: {
    title: "提前終止與違約金",
    text: "約定得提前終止者，應至少於終止前一個月通知；未先期通知而逕行終止者，違約金最高不得超過一個月租金。",
    src: "住宅租賃契約範本（任意終止租約之約定）",
    url: "https://lawinsider.com/zh/contracts/hKgvnRdYnUf"
  },
  power: {
    title: "電費計收",
    text: "2024/7/15 起新簽約者，若按用電度數計費，每度不得超過電費單「當期每度平均電價」，房東應提供電價與度數資訊。",
    src: "內政部電費新制（新聞整理）",
    url: "https://newtalk.tw/news/view/2024-07-15/928046"
  },
  taxRent: {
    title: "房屋租金支出特別扣除額",
    text: "自 113 年度起，租屋自住之租金（減除政府補貼）每一申報戶每年最高可扣除 18 萬元；國內有房屋者原則不適用，另有 5 種例外與排富條款。",
    src: "財政部說明（新聞整理）",
    url: "https://udn.com/news/story/7243/9471349"
  }
};

const CN_NUM = { "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "半": 0.5 };

function toNum(s) {
  if (s == null) return null;
  s = String(s).replace(/,/g, "").trim();
  if (/^[\d.]+$/.test(s)) return parseFloat(s);
  if (CN_NUM[s] != null) return CN_NUM[s];
  return null;
}

function findMonthlyRent(text) {
  const m = text.match(/月租(?:金)?[^\d]{0,12}([\d,]{3,})\s*元/);
  return m ? toNum(m[1]) : null;
}

function splitClauses(text) {
  return text
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// 每條規則回傳 null（不適用）或 {level: 'red'|'yellow'|'green', law, reason, say}
const RULES = [
  function deposit(clause, ctx) {
    if (!/押金|保證金/.test(clause)) return null;
    let months = null;
    const m = clause.match(/([\d.]+|[一二兩三四五六七八九十半])\s*個月/);
    if (m) months = toNum(m[1]);
    if (months == null && ctx.rent) {
      const a = clause.match(/([\d,]{3,})\s*元/);
      if (a) months = Math.round((toNum(a[1]) / ctx.rent) * 10) / 10;
    }
    if (months == null) return null;
    if (months > 2) {
      return {
        level: "red", law: LAW.deposit,
        reason: `押金約定為 ${months} 個月租金，超過二個月上限。`,
        say: `依住宅租賃契約規定，押金最高為二個月租金，想請問押金能否調整為二個月以內？`
      };
    }
    return { level: "green", law: LAW.deposit, reason: `押金 ${months} 個月，在二個月上限內。` };
  },

  function raise(clause) {
    if (!/(調漲|漲價|調高|增加租金|調整租金)/.test(clause)) return null;
    if (/(不得|不可|不會).{0,6}(調漲|漲價|調高|調整)/.test(clause)) {
      return { level: "green", law: LAW.raise, reason: "條款載明租期內不調漲租金。" };
    }
    return {
      level: "red", law: LAW.raise,
      reason: "條款允許房東在租期內調漲租金。",
      say: "依規定租賃期間不得調漲租金，這一條可以改成「租期內租金不調整」嗎？"
    };
  },

  function subsidy(clause) {
    const out = [];
    if (/(不得|不可|不能|禁止|不准).{0,10}(租金補貼|租補|補貼)/.test(clause)) {
      out.push({
        level: "red", law: LAW.subsidy,
        reason: "條款禁止房客申請租金補貼，屬不得記載事項。",
        say: "依內政部規定，契約不能限制房客申請租金補貼，這一條可以刪除嗎？"
      });
    }
    if (/(不得|不可|不能|禁止|不准).{0,12}(報稅|申報|所得稅)/.test(clause)) {
      out.push({
        level: "yellow", law: LAW.taxRent,
        reason: "限制以租約報稅，可能讓你難以申報房屋租金特別扣除額（每戶最高 18 萬元），建議與房東溝通。"
      });
    }
    return out.length ? out : null;
  },

  function terminate(clause, ctx) {
    if (!/(提前|中途|提早|未滿).{0,10}(退租|解約|終止|搬離)/.test(clause)) return null;
    if (/(沒收|不退|不予退還).{0,6}(押金|保證金)|(押金|保證金).{0,6}(沒收|不退|不予退還)/.test(clause)) {
      const extra = ctx.depositMonths && ctx.depositMonths > 1 ? `（等於 ${ctx.depositMonths} 個月租金）` : "";
      return {
        level: "red", law: LAW.terminate,
        reason: `提前退租即沒收全部押金${extra}，可能超過「最高一個月租金」的違約金上限。`,
        say: "依規定提前一個月通知可以終止租約，未通知的違約金最高一個月租金，想請問這一條能否依規定調整？"
      };
    }
    const m = clause.match(/違約金.{0,8}?([\d.]+|[一二兩三四五六])\s*個月/);
    if (m) {
      const n = toNum(m[1]);
      if (n > 1) {
        return {
          level: "red", law: LAW.terminate,
          reason: `違約金 ${n} 個月租金，超過最高一個月的上限。`,
          say: "依規定違約金最高為一個月租金，這一條可以調整嗎？"
        };
      }
      return { level: "green", law: LAW.terminate, reason: `違約金 ${n} 個月租金，在上限內。` };
    }
    return { level: "yellow", law: LAW.terminate, reason: "有提前終止條款，請確認通知期間與違約金是否符合規定。" };
  },

  function power(clause) {
    if (!/電費/.test(clause)) return null;
    const m = clause.match(/每度\D{0,4}([\d.]+)\s*元/);
    if (m) {
      return {
        level: "yellow", law: LAW.power,
        reason: `約定每度 ${m[1]} 元。新約按度數計費時不得超過電費單「當期每度平均電價」，請向房東要電費單核對。`
      };
    }
    return { level: "green", law: LAW.power, reason: "未約定固定單價，請確認是否依電費單計收。" };
  },

  function repair(clause) {
    if (!/(修繕|維修|損壞|修理)/.test(clause)) return null;
    if (/(概由|一律|全部|皆由|均由).{0,6}(承租人|房客|乙方)/.test(clause) || /(承租人|房客|乙方).{0,6}(自行|全額)負擔/.test(clause)) {
      return {
        level: "yellow", law: null,
        reason: "把所有修繕都推給房客，對你不利。契約範本要求房東說明房客負責修繕的項目與範圍，建議請房東列清楚哪些由誰修。（細節待查證）"
      };
    }
    return null;
  }
];

function analyzeContract(text) {
  const clauses = splitClauses(text);
  const rent = findMonthlyRent(text);
  let depositMonths = null;
  const dep = text.match(/押金[^\n]{0,20}?([\d.]+|[一二兩三四五六])\s*個月/);
  if (dep) depositMonths = toNum(dep[1]);
  const ctx = { rent, depositMonths };

  return clauses.map(clause => {
    let findings = [];
    for (const rule of RULES) {
      const r = rule(clause, ctx);
      if (!r) continue;
      findings = findings.concat(Array.isArray(r) ? r : [r]);
    }
    const order = { red: 0, yellow: 1, green: 2 };
    findings.sort((a, b) => order[a.level] - order[b.level]);
    const level = findings.length ? findings[0].level : "none";
    return { clause, level, findings };
  });
}

// 財稅試算（113 年度起）
function calcRentDeduction({ annualRent, subsidy, ownsHome, exception, highIncome, rate }) {
  const net = Math.max(0, (annualRent || 0) - (subsidy || 0));
  if (highIncome) {
    return { eligible: false, reason: "適用稅率 20% 以上（或股利分開計稅、基本所得額超過門檻）者，依排富條款不適用。", deduction: 0, saving: 0, net };
  }
  if (ownsHome && !exception) {
    return { eligible: false, reason: "本人、配偶或受扶養直系親屬在國內有房屋者，原則不適用；若符合 5 種例外（如因就學、就業、就醫異地租屋）可勾選例外。", deduction: 0, saving: 0, net };
  }
  const deduction = Math.min(net, 180000);
  return { eligible: true, reason: "", deduction, saving: Math.round(deduction * (rate || 0)), net };
}

if (typeof module !== "undefined") module.exports = { LAW, analyzeContract, calcRentDeduction, toNum };
