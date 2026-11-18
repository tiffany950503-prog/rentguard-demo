// 租屋守門人 Demo — 介面邏輯
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => Math.round(n).toLocaleString("zh-TW");
  const fmtTime = t => new Date(t).toLocaleString("zh-TW", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無法儲存時仍可使用 */ } }
  };
  const FILE_KEY = "rentguard-file";

  /* ---------- 分頁 ---------- */
  const TABS = ["contract", "movein", "deposit", "tax"];
  function showTab(id) {
    if (!TABS.includes(id)) id = "contract";
    $$(".tabrow button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    TABS.forEach(t => { $("#tab-" + t).hidden = t !== id; });
    if (id === "deposit") renderFileStatus();
  }
  $$(".tabrow button").forEach(b => b.addEventListener("click", () => {
    history.replaceState(null, "", "#" + b.dataset.tab);
    showTab(b.dataset.tab);
  }));
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

  /* ---------- 複製 ---------- */
  document.addEventListener("click", async e => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const text = $("#" + btn.dataset.copy).textContent;
    const old = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = "已複製"; }
    catch (err) {
      const r = document.createRange(); r.selectNodeContents($("#" + btn.dataset.copy));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      btn.textContent = "已選取，請按複製";
    }
    setTimeout(() => { btn.textContent = old; }, 1600);
  });

  /* ---------- 1 契約紅綠燈 ---------- */
  const SAMPLE_CONTRACT = [
    "第一條 租賃標的：新北市三峽區○○路○號 3 樓套房。",
    "第二條 租期自 2026 年 2 月 1 日起至 2027 年 1 月 31 日止，月租金新臺幣 8,000 元。",
    "第三條 承租人應於簽約時給付押金三個月租金，計新臺幣 24,000 元。",
    "第四條 出租人得視物價情形於租賃期間調漲租金。",
    "第五條 承租人不得申請租金補貼，亦不得以本租約申報所得稅。",
    "第六條 電費按每度 6 元計收。",
    "第七條 承租人如提前退租，押金全數沒收。",
    "第八條 屋內設備損壞，概由承租人自行負擔修繕費用。",
    "第九條 本契約一式二份，雙方各執一份。"
  ].join("\n");

  $("#loadSample").addEventListener("click", () => { $("#contractText").value = SAMPLE_CONTRACT; $("#contractErr").textContent = ""; });
  $("#clearContract").addEventListener("click", () => {
    $("#contractText").value = ""; $("#results").innerHTML = ""; $("#summary").hidden = true; $("#sayBox").hidden = true;
  });
  $("#contractText").addEventListener("input", () => { $("#contractErr").textContent = ""; });

  const LEVEL_NAME = { red: "違反規定", yellow: "要注意", green: "OK", none: "未偵測到問題" };

  $("#scan").addEventListener("click", () => {
    const text = $("#contractText").value.trim();
    if (!text) { $("#contractErr").textContent = "請先貼上契約內容，或按「載入示範契約」。"; return; }
    const res = analyzeContract(text);
    const count = { red: 0, yellow: 0, green: 0 };
    res.forEach(r => r.findings.forEach(f => { count[f.level]++; }));

    $("#summary").hidden = false;
    $("#summary").innerHTML =
      `<span class="pill red">紅燈 ${count.red}：違反規定</span>` +
      `<span class="pill yellow">黃燈 ${count.yellow}：要注意</span>` +
      `<span class="pill green">綠燈 ${count.green}：OK</span>`;

    $("#results").innerHTML = res.map((r, i) => {
      const fs = r.findings.map(f => `
        <div class="finding"><span class="tag ${f.level}">${LEVEL_NAME[f.level]}</span>${esc(f.reason)}
        ${f.law ? `<div class="src">依據：${esc(f.law.title)}｜${esc(f.law.text)}（<a href="${f.law.url}" target="_blank" rel="noopener">${esc(f.law.src)}</a>）</div>` : ""}</div>`).join("");
      return `<div class="clause ${r.level}"><div class="text">${esc(r.clause)}</div>${fs || `<div class="finding src">未偵測到常見問題條款。</div>`}</div>`;
    }).join("");

    const asks = [];
    res.forEach(r => r.findings.forEach(f => { if (f.say) asks.push(f.say); }));
    if (asks.length) {
      $("#sayBox").hidden = false;
      $("#sayText").textContent = "房東您好，簽約前想跟您確認幾個條款：\n" +
        asks.map((a, i) => `${i + 1}. ${a}`).join("\n") +
        "\n謝謝您，如果可以調整，我很樂意盡快完成簽約！";
    } else { $("#sayBox").hidden = true; }
  });

  /* ---------- 2 點交存證 ---------- */
  const AREAS = {
    suite: ["大門與門鎖", "牆面與天花板", "地板", "冷氣", "熱水器", "浴室與馬桶", "床與家具", "窗戶與紗窗"],
    room: ["房門與門鎖", "牆面與天花板", "地板", "冷氣", "床與家具", "窗戶與紗窗", "公共浴室"],
    flat: ["大門與門鎖", "客廳牆面", "地板", "冷氣", "熱水器", "廚房與瓦斯爐", "浴室與馬桶", "各房間家具", "窗戶與紗窗"]
  };
  const ROOM_NAME = { suite: "套房", room: "雅房", flat: "整層" };
  let movein = null;
  const previews = {};

  function newMovein(type) {
    const areas = {};
    AREAS[type].forEach(a => { areas[a] = { status: null, note: "", photos: [] }; });
    return { roomType: type, areas, savedAt: null };
  }
  function loadMovein() {
    const f = store.get(FILE_KEY, null);
    movein = f && f.roomType && f.areas ? f : newMovein("suite");
    $("#roomType").value = movein.roomType;
  }
  function renderAreas() {
    $("#areas").innerHTML = Object.entries(movein.areas).map(([name, a], i) => `
      <div class="area" data-area="${esc(name)}">
        <div class="area-head">
          <span class="area-name">${i + 1}. ${esc(name)}</span>
          <span class="seg" role="group" aria-label="${esc(name)} 狀態">
            <button type="button" data-s="good" class="${a.status === "good" ? "on" : ""}">良好</button>
            <button type="button" data-s="bad" class="${a.status === "bad" ? "on bad" : ""}">有瑕疵</button>
          </span>
        </div>
        <input type="text" placeholder="瑕疵說明，例如：牆角有約 5 公分污漬" value="${esc(a.note)}" ${a.status === "bad" ? "" : "hidden"}>
        <div class="file"><label style="flex-direction:row;align-items:center;gap:8px">拍照或選照片
          <input type="file" accept="image/*" capture="environment" multiple></label></div>
        <div class="thumbs">${a.photos.map((p, j) => {
          const url = previews[name + "|" + j];
          return `<figure>${url ? `<img src="${url}" alt="${esc(name)} 照片">` : ""}<figcaption>${esc(fmtTime(p.time))}</figcaption></figure>`;
        }).join("")}</div>
      </div>`).join("");
  }
  $("#areas").addEventListener("click", e => {
    const b = e.target.closest("[data-s]"); if (!b) return;
    const name = b.closest("[data-area]").dataset.area;
    movein.areas[name].status = b.dataset.s;
    if (b.dataset.s === "good") movein.areas[name].note = "";
    $("#saveMsg").textContent = "";
    renderAreas();
  });
  $("#areas").addEventListener("input", e => {
    if (e.target.type !== "text") return;
    movein.areas[e.target.closest("[data-area]").dataset.area].note = e.target.value;
  });
  $("#areas").addEventListener("change", e => {
    if (e.target.type !== "file") return;
    const name = e.target.closest("[data-area]").dataset.area;
    const a = movein.areas[name];
    Array.from(e.target.files).forEach(f => {
      const idx = a.photos.length;
      a.photos.push({ name: f.name, time: f.lastModified || Date.now(), addedAt: Date.now() });
      previews[name + "|" + idx] = URL.createObjectURL(f);
    });
    renderAreas();
  });
  $("#roomType").addEventListener("change", e => {
    movein = newMovein(e.target.value); $("#reportBox").hidden = true; $("#saveMsg").textContent = ""; renderAreas();
  });
  $("#resetMovein").addEventListener("click", () => {
    movein = newMovein($("#roomType").value); store.set(FILE_KEY, null);
    $("#reportBox").hidden = true; $("#saveMsg").textContent = ""; renderAreas();
  });

  function reportText(m) {
    const lines = Object.entries(m.areas).map(([name, a], i) => {
      const st = a.status === "bad" ? `有瑕疵：${a.note || "（未填說明）"}` : "良好";
      const ph = a.photos.length ? `｜照片 ${a.photos.length} 張（拍攝 ${a.photos.map(p => fmtTime(p.time)).join("、")}）` : "｜無照片";
      return `${i + 1}. ${name}｜${st}${ph}`;
    });
    return `【租屋守門人 點交清單】\n建立時間：${fmtTime(m.savedAt)}\n房型：${ROOM_NAME[m.roomType]}\n\n${lines.join("\n")}\n\n請房東確認以上內容無誤，回覆「確認」即可，謝謝！`;
  }
  $("#makeReport").addEventListener("click", () => {
    const missing = Object.entries(movein.areas).filter(([, a]) => !a.status).map(([n]) => n);
    if (missing.length) { $("#saveMsg").className = "err"; $("#saveMsg").textContent = `還有 ${missing.length} 個區域沒選狀態：${missing.join("、")}`; return; }
    movein.savedAt = Date.now();
    store.set(FILE_KEY, movein);
    $("#saveMsg").className = "ok"; $("#saveMsg").textContent = "已存進租屋檔案，退租時可以直接比對。";
    $("#reportBox").hidden = false;
    $("#reportText").textContent = reportText(movein);
  });

  /* ---------- 3 押金追回 ---------- */
  function savedFile() { const f = store.get(FILE_KEY, null); return f && f.savedAt ? f : null; }
  function renderFileStatus() {
    const f = savedFile();
    $("#fileStatus").innerHTML = f
      ? `已讀取租屋檔案：${ROOM_NAME[f.roomType]}，點交於 ${esc(fmtTime(f.savedAt))}，共 ${Object.keys(f.areas).length} 個區域。`
      : `還沒有點交紀錄。可以先到「② 點交存證」完成，或按「載入示範扣款」使用示範資料。`;
    refreshAreaSelects();
  }
  function areaOptions() {
    const f = savedFile();
    const names = f ? Object.keys(f.areas) : AREAS.suite;
    return names.concat(["其他"]);
  }
  function dedRow(d = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="d-item" placeholder="例如：牆面油漆" value="${esc(d.item || "")}"></td>
      <td><input type="number" class="d-amt" min="0" step="1" placeholder="0" value="${d.amt ?? ""}"></td>
      <td><select class="d-area"></select></td>
      <td><select class="d-type">
        <option value="wear">正常使用耗損</option>
        <option value="mine">我造成的損壞</option>
        <option value="unsure">不確定</option>
      </select></td>
      <td><button class="del" aria-label="刪除這筆">×</button></td>`;
    $("#dedTable tbody").appendChild(tr);
    fillAreaSelect($(".d-area", tr), d.area);
    $(".d-type", tr).value = d.type || "unsure";
  }
  function fillAreaSelect(sel, value) {
    const cur = value || sel.value;
    sel.innerHTML = areaOptions().map(o => `<option>${esc(o)}</option>`).join("");
    if (cur && areaOptions().includes(cur)) sel.value = cur;
  }
  function refreshAreaSelects() { $$(".d-area").forEach(s => fillAreaSelect(s)); }

  $("#dedTable").addEventListener("click", e => { if (e.target.classList.contains("del")) e.target.closest("tr").remove(); });
  $("#addDed").addEventListener("click", () => dedRow());
  $("#sampleDed").addEventListener("click", () => {
    if (!savedFile()) {
      const demo = newMovein("suite");
      Object.values(demo.areas).forEach(a => { a.status = "good"; });
      demo.areas["冷氣"] = { status: "bad", note: "遙控器失靈、出風口有霉斑", photos: [{ name: "demo.jpg", time: Date.now() - 300 * 864e5 }] };
      demo.savedAt = Date.now() - 300 * 864e5;
      store.set(FILE_KEY, demo);
    }
    $("#depTotal").value = 16000;
    $("#dedTable tbody").innerHTML = "";
    [
      { item: "冷氣維修", amt: 2500, area: "冷氣", type: "unsure" },
      { item: "牆面重新油漆", amt: 3000, area: "牆面與天花板", type: "wear" },
      { item: "清潔費", amt: 1500, area: "其他", type: "unsure" },
      { item: "地板刮傷修補", amt: 2000, area: "地板", type: "mine" }
    ].forEach(dedRow);
    renderFileStatus();
    $("#dedErr").textContent = "";
  });

  function judge(d, f) {
    const rec = f && f.areas[d.area];
    if (rec && rec.status === "bad") {
      return { cls: "strong", label: "可主張不扣", win: true,
        why: `入住點交已記錄「${rec.note || "有瑕疵"}」，這不是你造成的。`,
        msg: `入住時點交已記錄「${rec.note || "有瑕疵"}」，並非我造成，想請您不要扣除。` };
    }
    if (d.type === "wear") {
      return { cls: "mid", label: "可協商", win: true,
        why: "屬一般使用造成的耗損，可以和房東協商不扣或減扣。（合理耗損的認定方式待查證）",
        msg: "屬一般使用的自然耗損，想跟您討論是否可以不扣或減扣。" };
    }
    if (d.type === "mine") {
      return { cls: "fair", label: "扣款可能合理", win: false, own: true,
        why: "若確實是你造成的，扣款可能合理；請房東提供單據，確認金額合理。",
        msg: "我願意負擔，想麻煩您提供修繕單據。" };
    }
    if (rec && rec.status === "good") {
      return { cls: "weak", label: "需要更多證據", win: false,
        why: "入住時記錄為良好，責任歸屬要看退租時的狀況；請房東提供照片與單據。",
        msg: "想請您提供照片與單據，方便我確認。" };
    }
    return { cls: "weak", label: "證據不足", win: false,
      why: "沒有入住時的紀錄可比對；請房東提供照片與單據。",
      msg: "想請您提供照片與單據，方便我確認。" };
  }

  $("#evalDed").addEventListener("click", () => {
    const rows = $$("#dedTable tbody tr").map(tr => ({
      item: $(".d-item", tr).value.trim(), amt: parseFloat($(".d-amt", tr).value),
      area: $(".d-area", tr).value, type: $(".d-type", tr).value
    }));
    const bad = rows.find(r => !r.item || !(r.amt >= 0));
    if (!rows.length) { $("#dedErr").textContent = "請先新增至少一筆扣款，或按「載入示範扣款」。"; return; }
    if (bad) { $("#dedErr").textContent = "每一筆扣款都要填項目和金額。"; return; }
    $("#dedErr").textContent = "";
    const f = savedFile();
    let winAmt = 0, ownAmt = 0, sumAmt = 0;
    const out = rows.map(r => {
      const j = judge(r, f);
      sumAmt += r.amt; if (j.win) winAmt += r.amt; if (j.own) ownAmt += r.amt;
      return { r, j };
    });
    const total = parseFloat($("#depTotal").value);
    $("#dedResult").innerHTML =
      `<p>扣款合計 ${money(sumAmt)} 元，其中 <span class="big">${money(winAmt)}</span> 元可以爭取。</p>` +
      out.map(({ r, j }) => `<div class="verdict ${j.cls}"><b>${esc(r.item)}　${money(r.amt)} 元｜${j.label}</b><br>${esc(j.why)}</div>`).join("");

    const lines = out.map(({ r, j }) => `- ${r.item} ${money(r.amt)} 元：${j.msg}`);
    let tail = "";
    if (total > 0) tail = `\n依此計算，押金 ${money(total)} 元扣除 ${money(ownAmt)} 元後，請您返還 ${money(Math.max(0, total - ownAmt))} 元（其餘待您提供單據後再確認）。`;
    $("#dedMsgBox").hidden = false;
    $("#dedMsg").textContent = `房東您好，關於押金扣款，我整理如下：\n${lines.join("\n")}${tail}\n麻煩您於＿月＿日前回覆或匯款，謝謝！`;
  });

  /* ---------- 4 財稅試算 ---------- */
  $("#calcTax").addEventListener("click", () => {
    const annualRent = parseFloat($("#annualRent").value);
    if (!(annualRent > 0)) { $("#taxErr").textContent = "請輸入全年租金。"; return; }
    $("#taxErr").textContent = "";
    const rate = parseFloat($("#rate").value);
    const r = calcRentDeduction({
      annualRent, subsidy: parseFloat($("#subsidyAmt").value) || 0,
      ownsHome: $("#ownsHome").checked, exception: $("#exception").checked,
      highIncome: $("#highIncome").checked || rate >= 0.2, rate
    });
    $("#taxResult").innerHTML = r.eligible
      ? `<div class="verdict strong">全年租金扣除補貼後 ${money(r.net)} 元，可列報 <span class="big">${money(r.deduction)}</span> 元特別扣除額${r.net > 180000 ? "（已達每戶 18 萬上限）" : ""}。<br>以 ${Math.round(rate * 100)}% 稅率估算，約可少繳 <b>${money(r.saving)}</b> 元。</div>`
      : `<div class="verdict fair">可能不適用。${esc(r.reason)}</div>`;
  });

  /* ---------- 法規來源 ---------- */
  $("#lawList").innerHTML = Object.values(LAW).map(l =>
    `<li><b>${esc(l.title)}</b>：${esc(l.text)}（<a href="${l.url}" target="_blank" rel="noopener">${esc(l.src)}</a>）</li>`).join("");

  /* ---------- 啟動 ---------- */
  loadMovein();
  renderAreas();
  showTab(location.hash.slice(1));
})();
