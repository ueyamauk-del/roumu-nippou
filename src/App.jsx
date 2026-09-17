import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
window.XLSX = XLSX;
import { supabase } from "./supabaseClient";

// ── 定数 ────────────────────────────────────────────────
const ATTENDANCE_OPTIONS = ["出勤", "休み", "忌引", "有休", "欠勤"];

// 出勤状況の記号変換
const ATTENDANCE_SYMBOL = {
  "出勤": "○",
  "休み": "休",
  "忌引": "忌",
  "有休": "有",
  "欠勤": "欠",
};
// 出勤扱いかどうか
const isWorked = a => a === "出勤";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const jpDate = s => new Date(s).toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"});

// ── カラー ───────────────────────────────────────────────
const C={
  bg:"#1A1F2E",surface:"#232A3B",card:"#2B3347",border:"#3A4460",
  accent:"#E8A838",accentLight:"#F5C96A",green:"#3DD68C",red:"#F26464",
  blue:"#5B9CF6",purple:"#A78BFA",text:"#E8ECF4",muted:"#8A94AE",inputBg:"#1A1F2E",
};
const bInp={background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"7px 10px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

// 月次出勤簿PDF
const printAttendancePDF = (entries, dateFrom, dateTo, setPdfPreview) => {
  const range = entries.filter(e => e.entry_date >= dateFrom && e.entry_date <= dateTo);
  const dates = [];
  const cur = new Date(dateFrom);
  const end = new Date(dateTo);
  while(cur <= end){ dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  const workers = [...new Set(range.map(e => e.worker_name))];
  const siteCounts = {};
  range.forEach(e => { if(e.site) siteCounts[e.site] = (siteCounts[e.site]||0)+1; });
  const topSite = Object.entries(siteCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
  const fromD = new Date(dateFrom);
  const toD = new Date(dateTo);
  const nengo = fromD.getFullYear() - 2018;
  const yearMonth = (fromD.getFullYear()===toD.getFullYear() && fromD.getMonth()===toD.getMonth())
    ? ("令和" + nengo + "年 " + (fromD.getMonth()+1) + "月分")
    : (fromD.getFullYear() + "." + (fromD.getMonth()+1) + " 〜 " + toD.getFullYear() + "." + (toD.getMonth()+1));
  const entryMap = {};
  range.forEach(e => { entryMap[e.entry_date + "_" + e.worker_name] = e; });
  const DOW = ["日","月","火","水","木","金","土"];

  const lines = [];
  lines.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>出勤簿</title>');
  lines.push('<style>');
  lines.push('*{margin:0;padding:0;box-sizing:border-box;}');
  lines.push("body{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:10px;color:#111;}");
  lines.push('h1{font-size:14px;text-align:center;margin-bottom:3px;font-weight:700;}');
  lines.push('.header{display:flex;justify-content:space-between;font-size:10px;margin-bottom:6px;}');
  lines.push('table{width:100%;border-collapse:collapse;table-layout:fixed;}');
  lines.push('th,td{border:1px solid #666;text-align:center;vertical-align:middle;overflow:hidden;}');
  lines.push('.name-col{width:76px;text-align:left;padding:2px 4px;font-weight:700;font-size:10px;}');
  lines.push('.day-col{width:26px;padding:2px 1px;font-weight:700;font-size:11px;}');
  lines.push('.sum-col{width:36px;font-weight:700;font-size:10px;padding:2px;}');
  lines.push('thead th{background:#1A1F2E;color:#fff;font-weight:700;font-size:9px;padding:3px 1px;}');
  lines.push('.sym-row td{height:22px;font-size:14px;font-weight:700;padding:1px;}');
  lines.push('.worked{color:#111;}.off-sym{color:#555;font-size:12px;}.special{color:#c00;}');
  lines.push('.empty{color:#ccc;font-size:9px;}');
  lines.push('.ot-row td{height:14px;font-size:9px;color:#c60;padding:1px;border-top:none;}');
  lines.push('.ot-row .name-col{font-size:8px;color:#888;font-weight:400;border-top:none;}');
  lines.push('tfoot td{background:#f0f0f0;font-weight:700;font-size:10px;padding:3px 1px;}');
  lines.push('.sun{background:#ffcccc;}.sat{background:#cce0ff;}');
  lines.push('thead th.sun{background:#e74c3c;color:#fff;font-weight:800;}thead th.sat{background:#2980b9;color:#fff;font-weight:800;}');
  lines.push('@media print{@page{size:A3 landscape;margin:8mm 6mm;}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}}');
  lines.push('</style></head><body>');
  lines.push('<h1>' + yearMonth + '　出　勤　簿　表</h1>');
  lines.push('<div class="header">');
  lines.push('<span>現場名：' + (topSite||"　　　　　　") + '&emsp;期間：' + dateFrom + ' 〜 ' + dateTo + '</span>');
  lines.push('<span>有限会社カネヤマ上山建設&emsp;代表取締役　上山　繁</span>');
  lines.push('</div>');
  lines.push('<table><thead><tr><th class="name-col">氏　名</th>');
  dates.forEach(d => {
    const dd = new Date(d);
    const dow = dd.getDay();
    const cls = dow===0?"sun":dow===6?"sat":"";
    lines.push('<th class="day-col ' + cls + '">' + dd.getDate() + '<br><span style="font-size:7px">' + DOW[dow] + '</span></th>');
  });
  lines.push('<th class="sum-col">合計<br>(日)</th><th class="sum-col">残業<br>合計</th></tr></thead><tbody>');

  workers.forEach(name => {
    const workedDays = dates.filter(d => { const e=entryMap[d+"_"+name]; return e&&isWorked(e.attendance); }).length;
    const totalOT = dates.reduce((s,d) => { const e=entryMap[d+"_"+name]; return s+(e?parseFloat(e.overtime_hours)||0:0); }, 0);
    // 出勤記号行
    lines.push('<tr class="sym-row">');
    lines.push('<td class="name-col">' + name + '</td>');
    dates.forEach(d => {
      const dd = new Date(d);
      const dow = dd.getDay();
      const cls = dow===0?"sun":dow===6?"sat":"";
      const e = entryMap[d+"_"+name];
      if(!e){ lines.push('<td class="day-col ' + cls + ' empty">－</td>'); return; }
      const sym = ATTENDANCE_SYMBOL[e.attendance] || "○";
      const symCls = e.attendance==="出勤"?"worked":e.attendance==="休み"?"off-sym":"special";
      lines.push('<td class="day-col ' + cls + '"><span class="' + symCls + '">' + sym + '</span></td>');
    });
    lines.push('<td class="sum-col">' + workedDays + '</td>');
    lines.push('<td class="sum-col">' + totalOT.toFixed(2) + '</td></tr>');
    // 残業時間行（別行）
    lines.push('<tr class="ot-row">');
    lines.push('<td class="name-col">△残業時間</td>');
    dates.forEach(d => {
      const dd = new Date(d);
      const dow = dd.getDay();
      const cls = dow===0?"sun":dow===6?"sat":"";
      const e = entryMap[d+"_"+name];
      const ot = e ? parseFloat(e.overtime_hours)||0 : 0;
      lines.push('<td class="day-col ' + cls + '">' + (ot>0?ot:"") + '</td>');
    });
    lines.push('<td class="sum-col"></td><td class="sum-col"></td></tr>');
  });

  lines.push('</tbody><tfoot><tr><td class="name-col">出勤人数</td>');
  dates.forEach(d => {
    const cnt = workers.filter(n => { const e=entryMap[d+"_"+n]; return e&&isWorked(e.attendance); }).length;
    const dd = new Date(d);
    const dow = dd.getDay();
    const cls = dow===0?"sun":dow===6?"sat":"";
    lines.push('<td class="day-col ' + cls + '">' + (cnt>0?cnt:"") + '</td>');
  });
  lines.push('<td class="sum-col" colspan="2"></td></tr></tfoot></table>');
  lines.push('<div style="margin-top:6px;font-size:8px;color:#666;">記号：○出勤　休=休み　忌=忌引　有=有給休暇　欠=欠勤</div>');
  lines.push('</body></html>');

  setPdfPreview(lines.join(""));
};


// ── 作業員別出勤簿 Excel出力 ──────────────────────────────
const exportWorkerExcel = (entries, dateFrom, dateTo) => {
  const XLSX = window.XLSX;
  if(!XLSX){ alert("Excelライブラリが読み込まれていません"); return; }
  const range = entries.filter(e => e.entry_date >= dateFrom && e.entry_date <= dateTo);
  const dates = [];
  const cur = new Date(dateFrom); const end = new Date(dateTo);
  while(cur<=end){ dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  const workers = [...new Set(range.map(e => e.worker_name))];
  const DOW = ["日","月","火","水","木","金","土"];
  const fromD = new Date(dateFrom);
  const nengo = fromD.getFullYear() - 2018;
  const yearMonth = "令和" + nengo + "年 " + (fromD.getMonth()+1) + "月分";

  const wb = XLSX.utils.book_new();
  const wsData = [];

  // タイトル行
  wsData.push(["", yearMonth + "　出勤簿", "", ...dates.map(()=>""), "合計(日)", "残業合計"]);
  wsData.push(["", "有限会社カネヤマ上山建設", "", ...dates.map(()=>""), "", ""]);

  // ヘッダー行（日付）
  const headerRow = ["氏　名", ""];
  dates.forEach(d => {
    const dd = new Date(d);
    headerRow.push(dd.getDate() + "(" + DOW[dd.getDay()] + ")");
  });
  headerRow.push("出勤日数", "残業合計");
  wsData.push(headerRow);

  // 作業員ごとのデータ
  workers.forEach(name => {
    const symRow = [name, "出勤状況"];
    const otRow = ["", "残業時間"];
    let workedDays = 0;
    let totalOT = 0;
    dates.forEach(d => {
      const e = range.find(en => en.entry_date===d && en.worker_name===name);
      if(!e){ symRow.push("－"); otRow.push(""); return; }
      symRow.push(ATTENDANCE_SYMBOL[e.attendance]||"○");
      const ot = parseFloat(e.overtime_hours)||0;
      otRow.push(ot > 0 ? ot : "");
      if(isWorked(e.attendance)) workedDays++;
      totalOT += ot;
    });
    symRow.push(workedDays, totalOT > 0 ? totalOT : "");
    otRow.push("", "");
    wsData.push(symRow);
    wsData.push(otRow);
  });

  // 出勤人数行
  const cntRow = ["出勤人数", ""];
  dates.forEach(d => {
    const cnt = range.filter(e => e.entry_date===d && isWorked(e.attendance)).length;
    cntRow.push(cnt > 0 ? cnt : "");
  });
  cntRow.push("", "");
  wsData.push(cntRow);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:14},{wch:10},...dates.map(()=>({wch:6})),{wch:8},{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws, "作業員別出勤簿");
  XLSX.writeFile(wb, "作業員別出勤簿_" + dateFrom + "_" + dateTo + ".xlsx");
};

// ── 現場別出勤簿 Excel出力 ────────────────────────────────
const exportSiteExcel = (entries, machines, dateFrom, dateTo) => {
  const XLSX = window.XLSX;
  if(!XLSX){ alert("Excelライブラリが読み込まれていません"); return; }
  const range = entries.filter(e => e.entry_date >= dateFrom && e.entry_date <= dateTo);
  const dates = [];
  const cur = new Date(dateFrom); const end = new Date(dateTo);
  while(cur<=end){ dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  const sites = [...new Set(
    range.filter(e => e.attendance==="出勤" && e.site && e.site.trim()).map(e => e.site.trim())
  )].sort();
  const DOW = ["日","月","火","水","木","金","土"];
  const fromD = new Date(dateFrom);
  const nengo = fromD.getFullYear() - 2018;
  const yearMonth = "令和" + nengo + "年 " + (fromD.getMonth()+1) + "月分";

  // 機械使用日マップ
  const machineUseDates = {};
  range.forEach(e => {
    (e.machine_ids||[]).forEach(mid => {
      if(!machineUseDates[mid]) machineUseDates[mid] = new Set();
      machineUseDates[mid].add(e.entry_date);
    });
  });

  const wb = XLSX.utils.book_new();
  const wsData = [];

  wsData.push(["", yearMonth + "　現場別出勤簿", ...dates.map(()=>""), "人日合計"]);
  wsData.push(["", "有限会社カネヤマ上山建設", ...dates.map(()=>""), ""]);

  const headerRow = ["現　場", ""];
  dates.forEach(d => {
    const dd = new Date(d);
    headerRow.push(dd.getDate() + "(" + DOW[dd.getDay()] + ")");
  });
  headerRow.push("人日合計");
  wsData.push(headerRow);

  sites.forEach(site => {
    const siteEntries = range.filter(e => (e.site||"").trim()===site && e.attendance==="出勤");
    const cntRow = [site, "出勤人数"];
    const nameRow = ["", "作業員"];
    const otRow = ["", "残業時間"];
    let total = 0;
    let totalOT = 0;
    dates.forEach(d => {
      const dayEntries = siteEntries.filter(e => e.entry_date===d);
      cntRow.push(dayEntries.length > 0 ? dayEntries.length : "");
      nameRow.push(dayEntries.map(e => e.worker_name.split(" ")[0]).join("・") || "");
      const otLines = dayEntries
        .filter(e => parseFloat(e.overtime_hours) > 0)
        .map(e => e.worker_name.split(" ")[0] + ":" + parseFloat(e.overtime_hours).toFixed(1) + "h");
      otRow.push(otLines.join(" ") || "");
      total += dayEntries.length;
      totalOT += dayEntries.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
    });
    cntRow.push(total);
    nameRow.push("");
    otRow.push(totalOT > 0 ? totalOT.toFixed(1) + "h" : "");
    wsData.push(cntRow);
    wsData.push(nameRow);
    wsData.push(otRow);
  });

  // 合計行
  const totalRow = ["合　計", ""];
  dates.forEach(d => {
    const cnt = range.filter(e => e.entry_date===d && e.attendance==="出勤" && (e.site||"").trim()).length;
    totalRow.push(cnt > 0 ? cnt : "");
  });
  const grandTotal = range.filter(e => e.attendance==="出勤" && (e.site||"").trim()).length;
  const grandOT = range.filter(e => e.attendance==="出勤").reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
  totalRow.push(grandTotal + "人日" + (grandOT > 0 ? " / 残業" + grandOT.toFixed(1) + "h" : ""));
  wsData.push(totalRow);

  // 稼働機械シート
  const machineData = [["機械名", "稼働日一覧", "稼働日数"]];
  Object.keys(machineUseDates).forEach(mid => {
    const machine = machines.find(m => m.id===mid);
    if(!machine) return;
    const usedDates = [...machineUseDates[mid]].sort();
    const dateLabels = usedDates.map(d => {
      const dd = new Date(d);
      return (dd.getMonth()+1) + "/" + dd.getDate() + "(" + DOW[dd.getDay()] + ")";
    }).join("  ");
    machineData.push([machine.name, dateLabels, usedDates.length]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(wsData);
  ws1['!cols'] = [{wch:16},{wch:10},...dates.map(()=>({wch:6})),{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws1, "現場別出勤簿");

  const ws2 = XLSX.utils.aoa_to_sheet(machineData);
  ws2['!cols'] = [{wch:20},{wch:60},{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws2, "稼働機械");

  XLSX.writeFile(wb, "現場別出勤簿_" + dateFrom + "_" + dateTo + ".xlsx");
};

// ── 現場別出勤簿PDF ──────────────────────────────────────
const printSitePDF = (entries, machines, dateFrom, dateTo, setPdfPreview) => {
  const range = entries.filter(e => e.entry_date >= dateFrom && e.entry_date <= dateTo);

  // 日付一覧
  const dates = [];
  const cur = new Date(dateFrom);
  const end = new Date(dateTo);
  while(cur <= end){ dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }

  // 現場一覧（登場順・未記入除く）
  const sites = [...new Set(
    range.filter(e => e.attendance === "出勤" && e.site && e.site.trim())
         .map(e => e.site.trim())
  )].sort();

  // 年月
  const fromD = new Date(dateFrom);
  const toD = new Date(dateTo);
  const nengo = fromD.getFullYear() - 2018;
  const yearMonth = (fromD.getFullYear()===toD.getFullYear() && fromD.getMonth()===toD.getMonth())
    ? ("令和" + nengo + "年 " + (fromD.getMonth()+1) + "月分")
    : (fromD.getFullYear() + "." + (fromD.getMonth()+1) + " 〜 " + toD.getFullYear() + "." + (toD.getMonth()+1));
  const DOW = ["日","月","火","水","木","金","土"];

  // 機械ごとの使用日マップ
  const machineUseDates = {};
  range.forEach(e => {
    (e.machine_ids||[]).forEach(mid => {
      if(!machineUseDates[mid]) machineUseDates[mid] = new Set();
      machineUseDates[mid].add(e.entry_date);
    });
  });

  const L = [];
  L.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>現場別出勤簿</title>');
  L.push('<style>');
  L.push('*{margin:0;padding:0;box-sizing:border-box;}');
  L.push("body{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:10px;color:#111;}");
  L.push('h1{font-size:14px;text-align:center;margin-bottom:3px;font-weight:700;}');
  L.push('.header{display:flex;justify-content:space-between;font-size:10px;margin-bottom:6px;}');
  L.push('table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;}');
  L.push('th,td{border:1px solid #666;text-align:center;vertical-align:middle;overflow:hidden;}');
  L.push('.site-col{width:80px;text-align:left;padding:2px 4px;font-weight:700;font-size:10px;}');
  L.push('.day-col{width:24px;padding:1px;font-size:9px;}');
  L.push('.sum-col{width:36px;font-weight:700;font-size:10px;padding:2px;}');
  L.push('thead th{background:#1A1F2E;color:#fff;font-weight:700;font-size:9px;padding:3px 1px;}');
  L.push('.cnt-row td{height:22px;font-size:12px;font-weight:700;padding:1px;}');
  L.push('.names-row td{height:14px;font-size:8px;color:#555;padding:1px;border-top:none;}');
  L.push('.names-row .site-col{border-top:none;color:#888;font-weight:400;font-size:8px;}');
  L.push('tfoot td{background:#f0f0f0;font-weight:700;font-size:10px;padding:3px 1px;}');
  L.push('.sun{background:#ffcccc;}.sat{background:#cce0ff;}');
  L.push('thead th.sun{background:#e74c3c;color:#fff;}thead th.sat{background:#2980b9;color:#fff;}');
  L.push('.section{font-size:12px;font-weight:700;margin:8px 0 4px;border-left:3px solid #E8A838;padding-left:6px;}');
  L.push('.machine-table{width:100%;border-collapse:collapse;font-size:9px;}');
  L.push('.machine-table th{background:#333;color:#fff;padding:3px 6px;text-align:left;}');
  L.push('.machine-table td{padding:3px 6px;border-bottom:1px solid #ddd;}');
  L.push('@media print{@page{size:A3 landscape;margin:8mm 6mm;}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}');
  L.push('</style></head><body>');
  L.push('<h1>' + yearMonth + '　現場別出勤簿</h1>');
  L.push('<div class="header">');
  L.push('<span>期間：' + dateFrom + ' 〜 ' + dateTo + '</span>');
  L.push('<span>有限会社カネヤマ上山建設&emsp;代表取締役　上山　繁</span>');
  L.push('</div>');

  // 現場×日付テーブル
  L.push('<table><thead><tr><th class="site-col">現　場</th>');
  dates.forEach(d => {
    const dd = new Date(d);
    const dow = dd.getDay();
    const cls = dow===0?"sun":dow===6?"sat":"";
    L.push('<th class="day-col ' + cls + '">' + dd.getDate() + '<br><span style="font-size:7px">' + DOW[dow] + '</span></th>');
  });
  L.push('<th class="sum-col">出勤<br>人日</th></tr></thead><tbody>');

  // CSSに残業時間行を追加
  L.push('.ot-site-row td{height:13px;font-size:8px;color:#c60;padding:1px;border-top:none;}');
  L.push('.ot-site-row .site-col{font-size:8px;color:#888;font-weight:400;border-top:none;}');

  sites.forEach(site => {
    const siteEntries = range.filter(e => (e.site||"").trim() === site && e.attendance === "出勤");
    const totalPersonDays = siteEntries.length;
    const totalSiteOT = siteEntries.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);

    // 出勤人数行
    L.push('<tr class="cnt-row"><td class="site-col">' + site + '</td>');
    dates.forEach(d => {
      const dd = new Date(d);
      const dow = dd.getDay();
      const cls = dow===0?"sun":dow===6?"sat":"";
      const dayEntries = siteEntries.filter(e => e.entry_date === d);
      const cnt = dayEntries.length;
      L.push('<td class="day-col ' + cls + '">' + (cnt > 0 ? cnt : "") + '</td>');
    });
    L.push('<td class="sum-col">' + totalPersonDays + '</td></tr>');

    // 作業員名行
    L.push('<tr class="names-row"><td class="site-col">↳作業員</td>');
    dates.forEach(d => {
      const dd = new Date(d);
      const dow = dd.getDay();
      const cls = dow===0?"sun":dow===6?"sat":"";
      const dayEntries = siteEntries.filter(e => e.entry_date === d);
      const names = dayEntries.map(e => e.worker_name.split(" ")[0]);
      L.push('<td class="day-col ' + cls + '" style="font-size:7px;line-height:1.2;">' + names.join("<br>") + '</td>');
    });
    L.push('<td class="sum-col"></td></tr>');

    // 残業時間行（作業員ごと）
    L.push('<tr class="ot-site-row"><td class="site-col">↳残業時間</td>');
    dates.forEach(d => {
      const dd = new Date(d);
      const dow = dd.getDay();
      const cls = dow===0?"sun":dow===6?"sat":"";
      const dayEntries = siteEntries.filter(e => e.entry_date === d);
      const otLines = dayEntries
        .filter(e => parseFloat(e.overtime_hours) > 0)
        .map(e => e.worker_name.split(" ")[0] + ":" + parseFloat(e.overtime_hours).toFixed(1));
      L.push('<td class="day-col ' + cls + '" style="font-size:7px;line-height:1.2;">' + otLines.join("<br>") + '</td>');
    });
    L.push('<td class="sum-col" style="color:#c60;font-size:9px;">' + (totalSiteOT>0?totalSiteOT.toFixed(1)+"h":"") + '</td></tr>');
  });

  // 合計行
  L.push('</tbody><tfoot><tr><td class="site-col">合計（人数）</td>');
  dates.forEach(d => {
    const dd = new Date(d);
    const dow = dd.getDay();
    const cls = dow===0?"sun":dow===6?"sat":"";
    const cnt = range.filter(e => e.entry_date===d && e.attendance==="出勤" && (e.site||"").trim()).length;
    L.push('<td class="day-col ' + cls + '">' + (cnt>0?cnt:"") + '</td>');
  });
  const total = range.filter(e => e.attendance==="出勤" && (e.site||"").trim()).length;
  const totalOT = range.filter(e => e.attendance==="出勤").reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
  L.push('<td class="sum-col">' + total + '人日<br><span style="color:#c60;font-size:8px;">' + (totalOT>0?totalOT.toFixed(1)+'h残業':"") + '</span></td></tr></tfoot></table>');

  // 稼働機械一覧
  L.push('<div class="section">稼働機械一覧</div>');
  const usedMachineIds = Object.keys(machineUseDates);
  if(usedMachineIds.length === 0) {
    L.push('<div style="color:#888;font-size:10px;">この期間の稼働機械記録なし</div>');
  } else {
    L.push('<table class="machine-table"><thead><tr><th style="width:160px;">機械名</th><th>稼働日</th></tr></thead><tbody>');
    usedMachineIds.forEach(mid => {
      const machine = machines.find(m => m.id === mid);
      if(!machine) return;
      const usedDates = [...machineUseDates[mid]].sort();
      const dateLabels = usedDates.map(d => {
        const dd = new Date(d);
        return (dd.getMonth()+1) + "/" + dd.getDate() + "(" + DOW[dd.getDay()] + ")";
      }).join("　");
      L.push('<tr><td>' + machine.name + '</td><td>' + dateLabels + '</td></tr>');
    });
    L.push('</tbody></table>');
  }

  L.push('</body></html>');
  setPdfPreview(L.join(""));
};


// ── PDF生成（ブラウザ印刷） ───────────────────────────────
const printPDF = (entries, machines, dateFrom, dateTo, mode, setPdfPreview) => {
  const range = entries.filter(e => e.entry_date >= dateFrom && e.entry_date <= dateTo);
  const byDate = {};
  range.forEach(e => { if(!byDate[e.entry_date]) byDate[e.entry_date]=[]; byDate[e.entry_date].push(e); });
  const dates = Object.keys(byDate).sort();

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>労務日報</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;font-size:11px;color:#111;background:#fff;}
    h1{font-size:16px;text-align:center;margin-bottom:4px;}
    .sub{text-align:center;color:#555;font-size:11px;margin-bottom:12px;}
    .page-break{page-break-after:always;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}
    th{background:#1A1F2E;color:#fff;padding:5px 7px;font-size:10px;text-align:left;}
    td{padding:5px 7px;border-bottom:1px solid #ddd;vertical-align:top;}
    tr:nth-child(even){background:#f9f9f9;}
    .badge{display:inline-block;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:700;}
    .done{background:#d1fae5;color:#065f46;}
    .not{background:#f3f4f6;color:#6b7280;}
    .section{font-size:13px;font-weight:700;margin:12px 0 4px;border-left:3px solid #E8A838;padding-left:8px;}
    .summary{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
    .scard{border:1px solid #ddd;border-radius:6px;padding:8px 12px;flex:1;min-width:100px;}
    .snum{font-size:20px;font-weight:800;line-height:1;}
    .slabel{font-size:9px;color:#666;margin-top:2px;}
    .machines{font-size:9px;color:#3b5bdb;}
    @media print{@page{size:A4;margin:15mm 12mm;}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}}
  </style></head><body>`;

  if(mode==="summary") {
    const allDone = range.filter(e=>e.status==="記入済").length;
    const totalOT = range.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
    const workedCount = range.filter(e=>e.attendance==="出勤").length;
    const usedMids=[...new Set(range.flatMap(e=>e.machine_ids||[]))];
    html+=`<h1>労務日報　複数日集計</h1>
    <div class="sub">${jpDate(dateFrom)} 〜 ${jpDate(dateTo)}　（${dates.length}日間）</div>
    <div class="summary">
      <div class="scard"><div class="snum">${dates.length}</div><div class="slabel">集計日数</div></div>
      <div class="scard"><div class="snum">${range.length}</div><div class="slabel">延べ作業員数</div></div>
      <div class="scard"><div class="snum">${workedCount}</div><div class="slabel">出勤（延べ）</div></div>
      <div class="scard"><div class="snum">${totalOT.toFixed(1)}h</div><div class="slabel">合計残業時間</div></div>
      <div class="scard"><div class="snum">${usedMids.length}</div><div class="slabel">使用機械種別</div></div>
    </div>
    <div class="section">日別サマリー</div>
    <table><thead><tr><th>日付</th><th>出勤</th><th>休み</th><th>残業合計</th><th>稼働機械</th></tr></thead><tbody>`;
    dates.forEach(d=>{
      const es=byDate[d];
      const dOT=es.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
      const worked=es.filter(e=>e.attendance==="出勤").length;
      const off=es.filter(e=>e.attendance==="休み").length;
      const mids=[...new Set(es.flatMap(e=>e.machine_ids||[]))];
      const mnames=mids.map(id=>machines.find(m=>m.id===id)?.name||"").filter(Boolean);
      html+=`<tr><td>${jpDate(d)}</td><td>${worked}名</td><td>${off}名</td><td>${dOT.toFixed(1)}h</td><td class="machines">${mnames.join("、")||"—"}</td></tr>`;
    });
    html+=`</tbody></table>
    <div class="section">作業員別集計</div>
    <table><thead><tr><th>氏名</th><th>出勤日数</th><th>休み日数</th><th>残業合計</th><th>主な作業</th></tr></thead><tbody>`;
    const byName={};
    range.forEach(e=>{if(!byName[e.worker_name])byName[e.worker_name]=[];byName[e.worker_name].push(e);});
    Object.entries(byName).sort((a,b)=>a[0].localeCompare(b[0],'ja')).forEach(([name,es])=>{
      const ot=es.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
      const worked=es.filter(e=>e.attendance==="出勤").length;
      const off=es.filter(e=>e.attendance==="休み").length;
      const wts=[...new Set(es.map(e=>e.work_type).filter(Boolean))];
      html+=`<tr><td>${name}</td><td>${worked}日</td><td>${off}日</td><td>${ot.toFixed(1)}h</td><td>${wts.join("、")||"—"}</td></tr>`;
    });
    html+=`</tbody></table>
    <div class="section">現場別集計</div>
    <table><thead><tr><th>現場名</th><th>出勤延べ人数</th><th>残業合計</th><th>関わった作業員</th></tr></thead><tbody>`;
    const bySite={};
    range.filter(e=>e.attendance==="出勤").forEach(e=>{
      const key=(e.site||"").trim()||"（現場未記入）";
      if(!bySite[key])bySite[key]=[];
      bySite[key].push(e);
    });
    Object.entries(bySite).sort((a,b)=>b[1].length-a[1].length).forEach(([site,es])=>{
      const ot=es.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
      const names=[...new Set(es.map(e=>e.worker_name))];
      html+=`<tr><td>${site}</td><td>${es.length}人日</td><td>${ot.toFixed(1)}h</td><td>${names.join("、")}</td></tr>`;
    });
    html+=`</tbody></table>`;
  } else {
    dates.forEach((d, di) => {
      const es=byDate[d];
      const dOT=es.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
      const worked=es.filter(e=>e.attendance==="出勤").length;
      const off=es.filter(e=>e.attendance==="休み").length;
      const done=es.filter(e=>e.status==="記入済").length;
      html+=`<h1>労務日報</h1><div class="sub">${jpDate(d)}</div>
      <div class="summary">
        <div class="scard"><div class="snum">${es.length}</div><div class="slabel">作業員数</div></div>
        <div class="scard"><div class="snum">${worked}</div><div class="slabel">出勤</div></div>
        <div class="scard"><div class="snum">${off}</div><div class="slabel">休み</div></div>
        <div class="scard"><div class="snum">${dOT.toFixed(1)}h</div><div class="slabel">合計残業時間</div></div>
      </div>
      <table><thead><tr><th>氏名</th><th>現場</th><th>出勤状況</th><th>残業時間</th><th>作業内容</th><th>使用材料</th><th>使用機械</th><th>特記事項</th><th>状態</th></tr></thead><tbody>`;
      es.forEach(e=>{
        const mnames=(e.machine_ids||[]).map(id=>machines.find(m=>m.id===id)?.name||"").filter(Boolean);
        html+=`<tr>
          <td><b>${e.worker_name}</b></td><td>${e.site||"—"}</td>
          <td>${e.attendance==="休み" ? '<span class="badge not">休み</span>' : '<span class="badge done">出勤</span>'}</td>
          <td><b>${e.attendance==="出勤" ? (parseFloat(e.overtime_hours)||0).toFixed(1)+"h" : "—"}</b></td>
          <td>${e.work_type||"—"}</td>
          <td>${e.materials||"—"}</td>
          <td class="machines">${mnames.join("、")||"—"}</td>
          <td>${e.note||"—"}</td>
          <td><span class="badge ${e.status==="記入済"?"done":"not"}">${e.status}</span></td>
        </tr>`;
      });
      html+=`</tbody></table>`;
      if(di<dates.length-1) html+=`<div class="page-break"></div>`;
    });
  }

  html+=`</body></html>`;
  setPdfPreview(html);
};

// ── メインアプリ ──────────────────────────────────────────
export default function App() {
  const PASSWORD = "uk4545";
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem("roumu_auth") === "ok");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [view, setView] = useState("attendance");
  const [entries, setEntries] = useState([]);
  const [machines, setMachines] = useState([]);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [rangeFrom, setRangeFrom] = useState(todayStr());
  const [rangeTo, setRangeTo] = useState(todayStr());

  const [workerModal, setWorkerModal] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [selectedWorkers, setSelectedWorkers] = useState([]); // チェックした作業員
  const [workerNameErr, setWorkerNameErr] = useState("");
  const [machineModal, setMachineModal] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineNote, setNewMachineNote] = useState("");
  const [machineNameErr, setMachineNameErr] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMTarget, setDeleteMTarget] = useState(null);
  const [machinePickerFor, setMachinePickerFor] = useState(null);
  const [inheritConfirm, setInheritConfirm] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);

  // 前日の日付
  const prevDate = (dateStr) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };

  // 引き継ぎ実行（Supabase版）
  const doInherit = async () => {
    const prev = prevDate(filterDate);
    const prevEntries = entries.filter(e => e.entry_date === prev);
    // 当日の既存レコードを削除
    const currentIds = entries.filter(e => e.entry_date === filterDate).map(e => e.id);
    for (const id of currentIds) {
      await supabase.from("entries").delete().eq("id", id);
    }
    // 前日データをコピーして当日分として挿入
    const newEntries = prevEntries.map(e => ({
      worker_name: e.worker_name,
      entry_date: filterDate,
      site: e.site || "",
      work_type: e.work_type || "",
      materials: e.materials || "",
      machine_ids: e.machine_ids || [],
      attendance: "出勤",
      overtime_hours: 0,
      note: "",
      status: "未記入",
    }));
    if (newEntries.length > 0) {
      const { error } = await supabase.from("entries").insert(newEntries);
      if (error) setErrorMsg("引き継ぎエラー: " + error.message);
    }
    setInheritConfirm(false);
    fetchAll();
  };

  const hasPrevEntries = entries.some(e => e.entry_date === prevDate(filterDate));

  // ── データ取得 ──────────────────────────────────────────
  const fetchAllRef = useRef(null);
  fetchAllRef.current = async () => {
    setLoading(true);
    setErrorMsg("");
    const [{ data: entryData, error: entryErr }, { data: machineData, error: machineErr }] = await Promise.all([
      supabase.from("entries").select("*").order("entry_date", { ascending: false }),
      supabase.from("machines").select("*").order("created_at", { ascending: true }),
    ]);
    if (entryErr) setErrorMsg("データ取得エラー: " + entryErr.message);
    if (machineErr) setErrorMsg(prev => prev + " / 機械取得エラー: " + machineErr.message);
    setEntries(entryData || []);
    setMachines(machineData || []);
    setLoading(false);
  };
  const fetchAll = () => fetchAllRef.current();

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  // ── リアルタイム同期（他の人の更新も自動反映） ─────────────
  useEffect(() => {
    const channel = supabase
      .channel("realtime-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => fetchAllRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "machines" }, () => fetchAllRef.current())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  // ── entries 操作 ────────────────────────────────────────
  const update = async (id, field, val) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e)); // 楽観的更新
    const { error } = await supabase.from("entries").update({ [field]: val, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  const save = async (id) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: "記入済" } : e));
    const { error } = await supabase.from("entries").update({ status: "記入済", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  const toggleMachine = async (eid, mid) => {
    const entry = entries.find(e => e.id === eid);
    if (!entry) return;
    const has = (entry.machine_ids || []).includes(mid);
    const newIds = has ? entry.machine_ids.filter(m => m !== mid) : [...(entry.machine_ids||[]), mid];
    setEntries(prev => prev.map(e => e.id === eid ? { ...e, machine_ids: newIds } : e));
    const { error } = await supabase.from("entries").update({ machine_ids: newIds }).eq("id", eid);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  // 過去に登場した作業員の全リスト
  const allWorkers = [...new Set(entries.map(e => e.worker_name))].sort();

  const addWorker = async () => {
    // 選択済み + 新規入力をまとめる
    const names = [...selectedWorkers];
    const newName = newWorkerName.trim();
    if (newName && !names.includes(newName)) names.push(newName);
    if (names.length === 0) { setWorkerNameErr("作業員を選択または入力してください"); return; }

    const toAdd = names.filter(name =>
      !entries.some(e => e.worker_name === name && e.entry_date === filterDate)
    );
    if (toAdd.length === 0) { setWorkerNameErr("選択した作業員はすでに追加されています"); return; }

    const newEntries = toAdd.map(name => ({
      worker_name: name, entry_date: filterDate, site: "",
      attendance: "出勤", overtime_hours: 0,
      work_type: "", materials: "", note: "", machine_ids: [], status: "未記入",
    }));
    const { data, error } = await supabase.from("entries").insert(newEntries).select();
    if (error) { setErrorMsg("追加エラー: " + error.message); return; }
    setEntries(prev => [...data, ...prev]);
    setNewWorkerName(""); setWorkerNameErr(""); setSelectedWorkers([]); setWorkerModal(false);
  };

  const addMachine = async () => {
    const name = newMachineName.trim();
    if (!name) { setMachineNameErr("機械名を入力してください"); return; }
    if (machines.some(m => m.name === name)) { setMachineNameErr("同じ名前が既にあります"); return; }
    const { data, error } = await supabase.from("machines").insert({ name, note: newMachineNote.trim() }).select().single();
    if (error) { setMachineNameErr("追加エラー: " + error.message); return; }
    setMachines(prev => [...prev, data]);
    setNewMachineName(""); setNewMachineNote(""); setMachineNameErr(""); setMachineModal(false);
  };

  const updateMachine = async (id, field, val) => {
    setMachines(prev => prev.map(m => m.id === id ? { ...m, [field]: val } : m));
    const { error } = await supabase.from("machines").update({ [field]: val }).eq("id", id);
    if (error) setErrorMsg("保存エラー: " + error.message);
  };

  const deleteMachine = async (id) => {
    const { error } = await supabase.from("machines").delete().eq("id", id);
    if (error) { setErrorMsg("削除エラー: " + error.message); return; }
    setMachines(prev => prev.filter(m => m.id !== id));
    // 各エントリの machine_ids からも除去
    const affected = entries.filter(e => (e.machine_ids||[]).includes(id));
    for (const e of affected) {
      const newIds = e.machine_ids.filter(mid => mid !== id);
      await supabase.from("entries").update({ machine_ids: newIds }).eq("id", e.id);
    }
    setEntries(prev => prev.map(e => ({ ...e, machine_ids: (e.machine_ids||[]).filter(mid => mid !== id) })));
    setDeleteMTarget(null);
  };

  const deleteEntry = async (id) => {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) { setErrorMsg("削除エラー: " + error.message); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeleteTarget(null);
  };

  // ── 集計 ────────────────────────────────────────────────
  const filtered = entries.filter(e => e.entry_date === filterDate);
  const hasCurrentEntries = filtered.length > 0;
  const done = filtered.filter(e => e.status === "記入済").length;
  const workedCount = filtered.filter(e => e.attendance === "出勤").length;
  const offCount = filtered.filter(e => e.attendance === "休み").length;
  const totalOT = filtered.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
  const usedMids = [...new Set(filtered.flatMap(e => e.machine_ids||[]))];

  // 過去に入力された現場名の候補リスト
  const siteSuggestions = [...new Set(
    entries.map(e => (e.site||"").trim()).filter(Boolean)
  )].sort();

  const summaryData = useMemo(()=>{
    const range = entries.filter(e => e.entry_date >= rangeFrom && e.entry_date <= rangeTo);
    const dates = [...new Set(range.map(e => e.entry_date))].sort();
    const byDate = {};
    range.forEach(e => { if(!byDate[e.entry_date]) byDate[e.entry_date]=[]; byDate[e.entry_date].push(e); });
    const byName = {};
    range.forEach(e => { if(!byName[e.worker_name]) byName[e.worker_name]=[]; byName[e.worker_name].push(e); });
    const bySite = {};
    range.filter(e => e.attendance === "出勤").forEach(e => {
      const key = (e.site||"").trim() || "（現場未記入）";
      if(!bySite[key]) bySite[key]=[];
      bySite[key].push(e);
    });
    const totalOT = range.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
    const workedCount = range.filter(e => e.attendance === "出勤").length;
    const allMids = [...new Set(range.flatMap(e => e.machine_ids||[]))];
    return { range, dates, byDate, byName, bySite, totalOT, workedCount, allMids };
  }, [entries, rangeFrom, rangeTo]);

  // ログイン画面
  if (!isAuthed) {
    return (
      <div style={{minHeight:"100vh",background:"#1A1F2E",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif"}}>
        <div style={{background:"#232A3B",border:"1px solid #3A4460",borderRadius:16,padding:36,width:"90%",maxWidth:360,boxShadow:"0 20px 60px #0008"}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:36,marginBottom:8}}>🏗</div>
            <div style={{fontSize:20,fontWeight:700,color:"#E8A838"}}>労務日報</div>
            <div style={{fontSize:12,color:"#8A94AE",marginTop:4}}>有限会社カネヤマ上山建設</div>
          </div>
          <div style={{fontSize:13,color:"#8A94AE",marginBottom:6}}>パスワード</div>
          <input
            type="password"
            placeholder="パスワードを入力"
            value={pwInput}
            onChange={e=>{setPwInput(e.target.value);setPwError("");}}
            onKeyDown={e=>{
              if(e.key==="Enter"){
                if(pwInput===PASSWORD){
                  sessionStorage.setItem("roumu_auth","ok");
                  setIsAuthed(true);
                } else {
                  setPwError("パスワードが違います");
                  setPwInput("");
                }
              }
            }}
            style={{width:"100%",boxSizing:"border-box",background:"#1A1F2E",border:"1px solid #3A4460",borderRadius:8,color:"#E8ECF4",padding:"10px 14px",fontSize:16,outline:"none",marginBottom:pwError?6:16}}
            autoFocus
          />
          {pwError && <div style={{color:"#F26464",fontSize:12,marginBottom:12}}>{pwError}</div>}
          <button
            onClick={()=>{
              if(pwInput===PASSWORD){
                sessionStorage.setItem("roumu_auth","ok");
                setIsAuthed(true);
              } else {
                setPwError("パスワードが違います");
                setPwInput("");
              }
            }}
            style={{width:"100%",padding:"12px 0",borderRadius:8,border:"none",background:"#E8A838",color:"#1A1F2E",fontWeight:700,fontSize:16,cursor:"pointer"}}>
            ログイン
          </button>
        </div>
      </div>
    );
  }

  const navBtn=(active)=>({
    flex:1,
    padding:"10px 4px",
    borderRadius:0,
    border:"none",
    cursor:"pointer",
    fontWeight:active?700:400,
    fontSize:12,
    background:"transparent",
    color:active?C.accent:C.muted,
    borderBottom:active?`2px solid ${C.accent}`:"2px solid transparent",
    transition:"all 0.15s",
    whiteSpace:"nowrap",
    minWidth:0,
  });

  if (loading) {
    return (
      <div style={{minHeight:"100vh",background:C.bg,color:C.muted,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP',sans-serif"}}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif",fontSize:14}}
      onClick={()=>setMachinePickerFor(null)}>

      {/* ヘッダー */}
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:100}}>
        {/* ロゴ行 */}
        <div style={{padding:"10px 16px",borderBottom:`3px solid ${C.accent}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:18}}>🏗</span>
          <span style={{fontSize:16,fontWeight:700,color:C.accent}}>労務日報</span>
        </div>
        {/* タブ行：画面幅いっぱいに均等配置 */}
        <nav style={{display:"flex",width:"100%",borderBottom:`1px solid ${C.border}`}}>
          {[["attendance","出退勤"],["machines","機械管理"],["summary","集計"],["report","日報一覧"]].map(([v,label])=>(
            <button key={v} style={navBtn(view===v)} onClick={()=>setView(v)}>{label}</button>
          ))}
        </nav>
      </header>

      {errorMsg && (
        <div style={{background:C.red+"22",color:C.red,padding:"8px 16px",fontSize:12,textAlign:"center"}}>
          ⚠ {errorMsg}
        </div>
      )}

      <main style={{maxWidth:980,margin:"0 auto",padding:"18px 14px"}}>

        {view!=="summary" && (
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            <span style={{color:C.muted,fontSize:13}}>対象日</span>
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}
              style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"6px 10px",fontSize:13,outline:"none"}}/>
            <span style={{color:C.muted,fontSize:12}}>{jpDate(filterDate)}</span>
            <div style={{marginLeft:"auto",display:"flex",gap:8}}>
              {view==="attendance"&&<>
                {hasPrevEntries && (
                  <button onClick={()=>hasCurrentEntries?setInheritConfirm(true):doInherit()}
                    style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${C.green}`,cursor:"pointer",fontWeight:700,fontSize:12,background:C.green+"22",color:C.green,display:"flex",alignItems:"center",gap:4}}>
                    ⬆ 前日から引き継ぎ
                  </button>
                )}
                <button onClick={()=>setMachineModal(true)}
                  style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${C.border}`,cursor:"pointer",fontWeight:600,fontSize:12,background:"transparent",color:C.blue}}>⚙ 機械追加</button>
                <button onClick={()=>setWorkerModal(true)}
                  style={{padding:"6px 12px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.accent,color:"#1A1F2E"}}>＋ 作業員追加</button>
              </>}
              {(view==="report") && (
                <button onClick={()=>printPDF(entries,machines,filterDate,filterDate,"daily",setPdfPreview)}
                  style={{padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.purple,color:"#fff",display:"flex",alignItems:"center",gap:4}}>
                  🖨 PDF出力
                </button>
              )}
            </div>
          </div>
        )}

        {(view==="attendance"||view==="report"||view==="machines") && (
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {[
              {label:"出勤",val:workedCount,color:C.green},
              {label:"休み",val:offCount,color:C.muted},
              {label:"記入済",val:done,color:C.accent},
              {label:"合計残業時間",val:`${totalOT.toFixed(1)}h`,color:C.accentLight},
              {label:"本日稼働機械",val:usedMids.length,color:C.blue},
            ].map(s=>(
              <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${s.color}`,borderRadius:8,padding:"9px 14px",flex:"1 1 100px"}}>
                <div style={{fontSize:24,fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── 出退勤入力 ── */}
        {view==="attendance" && (
          <>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,fontWeight:600}}>作業員別 出勤状況・作業記録</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12,marginBottom:20}}>
              {filtered.map(e=>{
                const usedMs=machines.filter(m=>(e.machine_ids||[]).includes(m.id));
                const pickerOpen=machinePickerFor===e.id;
                const isOff = e.attendance !== "出勤";
                return (
                  <div key={e.id} style={{background:C.card,border:`1px solid ${e.status==="記入済"?C.green+"66":C.border}`,borderRadius:10,padding:14,position:"relative",opacity:isOff?0.75:1}}>
                    <button onClick={()=>setDeleteTarget(e.id)} style={{position:"absolute",top:9,right:9,background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:2}}>✕</button>
                    <div style={{display:"inline-block",padding:"2px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:e.status==="記入済"?C.green+"22":"#3A4460",color:e.status==="記入済"?C.green:C.muted,marginBottom:7}}>{e.status}</div>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:9,paddingRight:22}}>{e.worker_name}</div>

                    {/* 出勤状況 選択 */}
                    <div style={{display:"flex",gap:4,marginBottom:9,flexWrap:"wrap"}}>
                      {ATTENDANCE_OPTIONS.map(opt=>{
                        const isSelected = e.attendance===opt;
                        const color = opt==="出勤"?C.green:opt==="休み"?C.muted:C.red;
                        return (
                          <button key={opt} onClick={()=>update(e.id,"attendance",opt)}
                            style={{flex:"1 1 auto",padding:"6px 4px",borderRadius:6,border:`1px solid ${isSelected?color:C.border}`,cursor:"pointer",fontWeight:isSelected?700:400,fontSize:11,background:isSelected?color+"22":"transparent",color:isSelected?color:C.muted,minWidth:40}}>
                            {opt==="出勤"?"✓ 出勤":opt}
                          </button>
                        );
                      })}
                    </div>

                    {!isOff && <>
                    {/* 現場名：履歴選択 or 新規入力 */}
                    {siteSuggestions.length > 0 && (e.site||"") === "" ? (
                      <div style={{marginBottom:7}}>
                        <select
                          onChange={ev=>{
                            if(ev.target.value==="__new__") update(e.id,"site","__typing__");
                            else update(e.id,"site",ev.target.value);
                          }}
                          style={{...bInp}}>
                          <option value="">現場名を選択...</option>
                          {siteSuggestions.map(s=><option key={s} value={s}>{s}</option>)}
                          <option value="__new__">＋ 新規入力</option>
                        </select>
                      </div>
                    ) : (
                      <div style={{marginBottom:7,display:"flex",gap:6,alignItems:"center"}}>
                        <input type="text" placeholder="現場名を入力"
                          value={e.site==="__typing__"?"":e.site||""}
                          onChange={ev=>update(e.id,"site",ev.target.value)}
                          autoFocus={e.site==="__typing__"}
                          style={{...bInp,flex:1,marginBottom:0}}/>
                        {siteSuggestions.length > 0 && (
                          <button onClick={()=>update(e.id,"site","")}
                            style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontSize:11,whiteSpace:"nowrap"}}>
                            履歴
                          </button>
                        )}
                      </div>
                    )}

                    {/* 残業時間 */}
                    <div style={{display:"flex",gap:8,marginBottom:7,alignItems:"center"}}>
                      <span style={{color:C.muted,fontSize:11,width:56}}>残業時間</span>
                      <input type="number" step="0.5" min="0" value={e.overtime_hours ?? 0}
                        onChange={ev=>update(e.id,"overtime_hours",parseFloat(ev.target.value)||0)}
                        style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"5px 8px",fontSize:14,width:70,outline:"none"}}/>
                      <span style={{color:C.muted,fontSize:12}}>時間</span>
                      {parseFloat(e.overtime_hours)>0 && <div style={{marginLeft:"auto",background:C.accent+"22",color:C.accent,fontWeight:700,fontSize:12,padding:"3px 8px",borderRadius:6}}>{parseFloat(e.overtime_hours).toFixed(1)}h</div>}
                    </div>

                    <textarea placeholder="作業内容を入力（例：型枠組立、配筋検査立会い）" value={e.work_type||""} onChange={ev=>update(e.id,"work_type",ev.target.value)}
                      style={{...bInp,marginBottom:7,resize:"vertical",minHeight:40,fontFamily:"inherit"}}/>
                    <textarea placeholder="使用材料（例：生コンクリート 5㎥、鉄筋 D13×50本）" value={e.materials||""} onChange={ev=>update(e.id,"materials",ev.target.value)}
                      style={{...bInp,marginBottom:7,resize:"vertical",minHeight:40,fontFamily:"inherit"}}/>
                    <div style={{position:"relative"}}>
                      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>使用機械</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:5,minHeight:22}}>
                        {usedMs.length===0?<span style={{fontSize:11,color:C.muted}}>なし</span>
                          :usedMs.map(m=>(
                            <span key={m.id} style={{background:C.blue+"22",color:C.blue,fontSize:11,padding:"2px 8px",borderRadius:99,display:"flex",alignItems:"center",gap:3}}>
                              {m.name}<span style={{cursor:"pointer",opacity:.7}} onClick={()=>toggleMachine(e.id,m.id)}>✕</span>
                            </span>
                          ))}
                      </div>
                      <button onClick={ev=>{ev.stopPropagation();setMachinePickerFor(pickerOpen?null:e.id);}}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`1px dashed ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>
                        ⚙ 機械を選択
                      </button>
                      {pickerOpen&&(
                        <div onClick={ev=>ev.stopPropagation()}
                          style={{position:"absolute",top:"100%",left:0,zIndex:50,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:8,marginTop:4,width:"100%",boxShadow:"0 8px 24px #0006",maxHeight:170,overflowY:"auto"}}>
                          {machines.length===0?<div style={{color:C.muted,fontSize:12,padding:8}}>機械が登録されていません</div>
                            :machines.map(m=>{
                              const chk=(e.machine_ids||[]).includes(m.id);
                              return(
                                <div key={m.id} onClick={()=>toggleMachine(e.id,m.id)}
                                  style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:6,cursor:"pointer",background:chk?C.blue+"18":"transparent"}}>
                                  <div style={{width:15,height:15,borderRadius:4,border:`2px solid ${chk?C.blue:C.border}`,background:chk?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",flexShrink:0}}>{chk&&"✓"}</div>
                                  <span style={{fontSize:12,color:chk?C.blue:C.text}}>{m.name}</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                    <textarea style={{...bInp,resize:"vertical",minHeight:46,fontFamily:"inherit",marginTop:7,marginBottom:0}}
                      placeholder="特記事項・作業内容メモ" value={e.note||""} onChange={ev=>update(e.id,"note",ev.target.value)}/>
                    </>}
                    {isOff && (
                      <textarea style={{...bInp,resize:"vertical",minHeight:46,fontFamily:"inherit",marginTop:7,marginBottom:0}}
                        placeholder="休みの理由など（任意）" value={e.note||""} onChange={ev=>update(e.id,"note",ev.target.value)}/>
                    )}
                    <button style={{marginTop:9,width:"100%",padding:"8px 0",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:e.status==="記入済"?C.green:C.accent,color:e.status==="記入済"?"#fff":"#1A1F2E"}}
                      onClick={()=>save(e.id)}>
                      {e.status==="記入済"?"✓ 記入済":"保存する"}
                    </button>
                  </div>
                );
              })}
              <div onClick={()=>setWorkerModal(true)}
                style={{background:"transparent",border:`2px dashed ${C.border}`,borderRadius:10,padding:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",minHeight:170,color:C.muted}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <span style={{fontSize:26}}>＋</span><span style={{fontSize:13}}>作業員を追加</span>
              </div>
            </div>
          </>
        )}

        {/* ── 機械管理 ── */}
        {view==="machines" && (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>機械一覧</div>
              <button onClick={()=>setMachineModal(true)}
                style={{padding:"6px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:C.blue,color:"#fff"}}>⚙ 機械を追加</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
              {machines.map(m=>{
                const users=filtered.filter(e=>(e.machine_ids||[]).includes(m.id)).map(e=>e.worker_name);
                return(
                  <div key={m.id} style={{background:C.card,border:`1px solid ${users.length>0?C.blue+"66":C.border}`,borderRadius:10,padding:14,position:"relative"}}>
                    <button onClick={()=>setDeleteMTarget(m.id)} style={{position:"absolute",top:9,right:9,background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:2}}>✕</button>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                      <span style={{fontSize:20}}>⚙️</span>
                      <input value={m.name} onChange={ev=>updateMachine(m.id,"name",ev.target.value)}
                        style={{fontWeight:700,fontSize:14,background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,borderRadius:0,color:C.text,padding:"2px 0",outline:"none",width:"calc(100% - 50px)"}}/>
                    </div>
                    {users.length>0?(
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:11,color:C.muted,marginBottom:4}}>本日の使用者</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                          {users.map(u=><span key={u} style={{background:C.blue+"22",color:C.blue,fontSize:11,padding:"2px 8px",borderRadius:99}}>{u}</span>)}
                        </div>
                      </div>
                    ):<div style={{fontSize:11,color:C.muted,marginBottom:8}}>本日 未使用</div>}
                    <textarea value={m.note||""} onChange={ev=>updateMachine(m.id,"note",ev.target.value)}
                      placeholder="備考メモ（点検状況・注意事項など）"
                      style={{...bInp,resize:"vertical",minHeight:56,fontFamily:"inherit"}}/>
                  </div>
                );
              })}
              <div onClick={()=>setMachineModal(true)}
                style={{background:"transparent",border:`2px dashed ${C.border}`,borderRadius:10,padding:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",minHeight:150,color:C.muted}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <span style={{fontSize:26}}>⚙</span><span style={{fontSize:13}}>機械を追加</span>
              </div>
            </div>
          </>
        )}

        {/* ── 複数日集計 ── */}
        {view==="summary" && (
          <>
            {/* 期間 + ボタン群 */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:18}}>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
                <span style={{color:C.muted,fontSize:13}}>集計期間</span>
                <input type="date" value={rangeFrom} onChange={e=>setRangeFrom(e.target.value)}
                  style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"6px 10px",fontSize:13,outline:"none"}}/>
                <span style={{color:C.muted}}>〜</span>
                <input type="date" value={rangeTo} onChange={e=>setRangeTo(e.target.value)}
                  style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"6px 10px",fontSize:13,outline:"none"}}/>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                <span style={{color:C.muted,fontSize:11,alignSelf:"center",width:40}}>PDF</span>
                <button onClick={()=>printPDF(entries,machines,rangeFrom,rangeTo,"daily",setPdfPreview)}
                  style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${C.purple}`,cursor:"pointer",fontWeight:600,fontSize:12,background:"transparent",color:C.purple}}>
                  🖨 日別
                </button>
                <button onClick={()=>printPDF(entries,machines,rangeFrom,rangeTo,"summary",setPdfPreview)}
                  style={{padding:"7px 12px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.purple,color:"#fff"}}>
                  🖨 集計
                </button>
                <button onClick={()=>printAttendancePDF(entries,rangeFrom,rangeTo,setPdfPreview)}
                  style={{padding:"7px 12px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.accent,color:"#1A1F2E"}}>
                  📋 作業員別出勤簿
                </button>
                <button onClick={()=>printSitePDF(entries,machines,rangeFrom,rangeTo,setPdfPreview)}
                  style={{padding:"7px 12px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:C.blue,color:"#fff"}}>
                  🏗 現場別出勤簿
                </button>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{color:C.muted,fontSize:11,alignSelf:"center",width:40}}>Excel</span>
                <button onClick={()=>exportWorkerExcel(entries,rangeFrom,rangeTo)}
                  style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${C.accent}`,cursor:"pointer",fontWeight:600,fontSize:12,background:"transparent",color:C.accent}}>
                  📊 作業員別
                </button>
                <button onClick={()=>exportSiteExcel(entries,machines,rangeFrom,rangeTo)}
                  style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${C.blue}`,cursor:"pointer",fontWeight:600,fontSize:12,background:"transparent",color:C.blue}}>
                  📊 現場別
                </button>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
              {[
                {label:"集計日数",val:`${summaryData.dates.length}日`,color:C.accent},
                {label:"延べ出勤数",val:`${summaryData.workedCount}名`,color:C.green},
                {label:"合計残業時間",val:`${summaryData.totalOT.toFixed(1)}h`,color:C.accentLight},
                {label:"使用機械種別",val:`${summaryData.allMids.length}台`,color:C.blue},
              ].map(s=>(
                <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${s.color}`,borderRadius:8,padding:"10px 14px",flex:"1 1 120px"}}>
                  <div style={{fontSize:26,fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,color:C.accent}}>📅 日別サマリー</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>
                    {["日付","出勤","休み","残業合計","稼働機械"].map(h=><th key={h} style={{background:C.surface,color:C.muted,padding:"7px 10px",textAlign:"left",fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {summaryData.dates.length===0
                      ?<tr><td colSpan={5} style={{padding:20,color:C.muted,textAlign:"center"}}>この期間の記録なし</td></tr>
                      :summaryData.dates.map(d=>{
                        const es=summaryData.byDate[d];
                        const dOT=es.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
                        const worked=es.filter(e=>e.attendance==="出勤").length;
                        const off=es.filter(e=>e.attendance==="休み").length;
                        const mids=[...new Set(es.flatMap(e=>e.machine_ids||[]))];
                        return(
                          <tr key={d} style={{cursor:"pointer"}} onClick={()=>{setFilterDate(d);setView("report");}}>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.accentLight,fontWeight:600,whiteSpace:"nowrap"}}>{new Date(d).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",weekday:"short"})}</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.green}}>{worked}名</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.muted}}>{off}名</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:700,color:C.accentLight}}>{dOT.toFixed(1)}h</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.blue,fontSize:11}}>{mids.length}台</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,color:C.green}}>👷 作業員別集計</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>
                    {["氏名","出勤日数","休み日数","残業合計"].map(h=><th key={h} style={{background:C.surface,color:C.muted,padding:"7px 10px",textAlign:"left",fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {Object.keys(summaryData.byName).length===0
                      ?<tr><td colSpan={4} style={{padding:20,color:C.muted,textAlign:"center"}}>この期間の記録なし</td></tr>
                      :Object.entries(summaryData.byName).map(([name,es])=>{
                        const ot=es.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
                        const worked=es.filter(e=>e.attendance==="出勤").length;
                        const off=es.filter(e=>e.attendance==="休み").length;
                        return(
                          <tr key={name}>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:600,whiteSpace:"nowrap"}}>{name}</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.green}}>{worked}日</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.muted}}>{off}日</td>
                            <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:700,color:C.accentLight}}>{ot.toFixed(1)}h</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginTop:14}}>
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:13,color:C.purple}}>🏗 現場別集計</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>
                  {["現場名","出勤延べ人数","残業合計","主な作業内容","関わった作業員"].map(h=><th key={h} style={{background:C.surface,color:C.muted,padding:"7px 10px",textAlign:"left",fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {Object.keys(summaryData.bySite).length===0
                    ?<tr><td colSpan={5} style={{padding:20,color:C.muted,textAlign:"center"}}>この期間の出勤記録なし</td></tr>
                    :Object.entries(summaryData.bySite).sort((a,b)=>b[1].length-a[1].length).map(([site,es])=>{
                      const ot=es.reduce((s,e)=>s+(parseFloat(e.overtime_hours)||0),0);
                      const names=[...new Set(es.map(e=>e.worker_name))];
                      const works=[...new Set(es.map(e=>e.work_type).filter(Boolean))];
                      return(
                        <tr key={site}>
                          <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:600,whiteSpace:"nowrap",color:site==="（現場未記入）"?C.muted:C.text}}>{site}</td>
                          <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.green}}>{es.length}人日</td>
                          <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:700,color:C.accentLight}}>{ot.toFixed(1)}h</td>
                          <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.muted,fontSize:11,maxWidth:220}}>
                            <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{works[0]||"—"}{works.length>1&&` 他${works.length-1}件`}</div>
                          </td>
                          <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}44`,color:C.muted,fontSize:11}}>{names.join("、")}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── 日報一覧 ── */}
        {view==="report" && (
          <>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,fontWeight:600}}>日報一覧</div>
            <div style={{background:C.card,borderRadius:10,overflow:"auto",border:`1px solid ${C.border}`}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>
                  {["氏名","現場","出勤状況","残業時間","作業内容","使用材料","使用機械","特記事項","状態"].map(h=>(
                    <th key={h} style={{background:C.surface,color:C.muted,fontWeight:600,padding:"8px 10px",textAlign:"left",fontSize:11,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.length===0
                    ?<tr><td colSpan={8} style={{padding:32,color:C.muted,textAlign:"center"}}>この日の記録はありません</td></tr>
                    :filtered.map(e=>{
                      const ms=machines.filter(m=>(e.machine_ids||[]).includes(m.id));
                      const isOff = e.attendance !== "出勤";
                      return(
                        <tr key={e.id} style={{background:e.status==="記入済"?C.green+"08":"transparent"}}>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,fontWeight:600,whiteSpace:"nowrap"}}>{e.worker_name}</td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:e.site?C.text:C.muted,maxWidth:120}}>
                            <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.site||"—"}</div>
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,whiteSpace:"nowrap"}}>
                            <span style={{padding:"2px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:isOff?C.border:C.green+"22",color:isOff?C.muted:C.green}}>{e.attendance||"出勤"}</span>
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:parseFloat(e.overtime_hours)>0?C.accentLight:C.muted,fontWeight:700,whiteSpace:"nowrap"}}>{isOff?"—":`${(parseFloat(e.overtime_hours)||0).toFixed(1)}h`}</td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:e.work_type?C.text:C.muted,maxWidth:160}}>
                            <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.work_type||"—"}</div>
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:e.materials?C.text:C.muted,maxWidth:160}}>
                            <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.materials||"—"}</div>
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,maxWidth:150}}>
                            {ms.length===0?<span style={{color:C.muted}}>—</span>
                              :<div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                                {ms.map(m=><span key={m.id} style={{background:C.blue+"22",color:C.blue,fontSize:10,padding:"1px 6px",borderRadius:99,whiteSpace:"nowrap"}}>{m.name}</span>)}
                              </div>}
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`,color:C.muted,maxWidth:150}}>
                            <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.note||"—"}</div>
                          </td>
                          <td style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}44`}}>
                            <span style={{padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700,background:e.status==="記入済"?C.green+"22":"#3A4460",color:e.status==="記入済"?C.green:C.muted,whiteSpace:"nowrap"}}>{e.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {filtered.length>0&&(
              <div style={{marginTop:10,textAlign:"right",color:C.muted,fontSize:11}}>
                出勤{workedCount}名｜休み{offCount}名｜記入済{done}名｜残業合計{totalOT.toFixed(1)}h｜稼働機械{usedMids.length}台
              </div>
            )}
          </>
        )}
      </main>

      {/* ── 作業員追加モーダル ── */}
      {workerModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget){setWorkerModal(false);setNewWorkerName("");setWorkerNameErr("");setSelectedWorkers([]);}}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:22,width:"100%",maxWidth:380,boxShadow:"0 20px 60px #0008",maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>作業員を追加</div>
            <div style={{color:C.muted,fontSize:12,marginBottom:12}}>複数選択できます</div>

            {/* 過去の作業員リスト */}
            {allWorkers.length > 0 && <>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>過去の作業員から選択</div>
              <div style={{overflowY:"auto",maxHeight:200,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:12,background:C.inputBg}}>
                {allWorkers
                  .filter(name => !entries.some(e => e.worker_name===name && e.entry_date===filterDate))
                  .map(name => {
                    const checked = selectedWorkers.includes(name);
                    return (
                      <div key={name} onClick={()=>setSelectedWorkers(prev=>checked?prev.filter(n=>n!==name):[...prev,name])}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",cursor:"pointer",borderBottom:`1px solid ${C.border}44`,background:checked?C.accent+"18":"transparent"}}>
                        <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${checked?C.accent:C.border}`,background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#1A1F2E",flexShrink:0,fontWeight:700}}>
                          {checked&&"✓"}
                        </div>
                        <span style={{fontSize:14,color:checked?C.accent:C.text}}>{name}</span>
                      </div>
                    );
                  })}
                {allWorkers.filter(name => !entries.some(e => e.worker_name===name && e.entry_date===filterDate)).length === 0 && (
                  <div style={{padding:12,color:C.muted,fontSize:12,textAlign:"center"}}>全員すでに追加済みです</div>
                )}
              </div>
            </>}

            {/* 新規入力 */}
            <div style={{fontSize:12,color:C.muted,marginBottom:6}}>新規入力（リストにない場合）</div>
            <input type="text" placeholder="例：山田 太郎" value={newWorkerName}
              onChange={e=>{setNewWorkerName(e.target.value);setWorkerNameErr("");}}
              onKeyDown={e=>e.key==="Enter"&&addWorker()}
              style={{...bInp,marginBottom:workerNameErr?4:12}}/>
            {workerNameErr&&<div style={{color:C.red,fontSize:12,marginBottom:8}}>{workerNameErr}</div>}

            {/* 選択中の表示 */}
            {(selectedWorkers.length > 0 || newWorkerName.trim()) && (
              <div style={{fontSize:11,color:C.accent,marginBottom:10}}>
                追加予定：{[...selectedWorkers, newWorkerName.trim()].filter(Boolean).join("、")}
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:"auto"}}>
              <button onClick={()=>{setWorkerModal(false);setNewWorkerName("");setWorkerNameErr("");setSelectedWorkers([]);}}
                style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={addWorker}
                style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.accent,color:"#1A1F2E",cursor:"pointer",fontWeight:700,fontSize:13}}>
                追加する{(selectedWorkers.length+(newWorkerName.trim()?1:0))>0?`（${selectedWorkers.length+(newWorkerName.trim()?1:0)}名）`:""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 機械追加モーダル ── */}
      {machineModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}
          onClick={e=>{if(e.target===e.currentTarget){setMachineModal(false);setNewMachineName("");setNewMachineNote("");setMachineNameErr("");}}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:350,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>機械を追加</div>
            <div style={{color:C.muted,fontSize:12,marginBottom:18}}>作業員カードから紐づけできるようになります</div>
            <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>機械名</label>
            <input autoFocus type="text" placeholder="例：バックホウ 0.45㎥" value={newMachineName}
              onChange={e=>{setNewMachineName(e.target.value);setMachineNameErr("");}}
              onKeyDown={e=>e.key==="Enter"&&addMachine()}
              style={{...bInp,marginBottom:machineNameErr?4:10}}/>
            {machineNameErr&&<div style={{color:C.red,fontSize:12,marginBottom:8}}>{machineNameErr}</div>}
            <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>備考メモ（任意）</label>
            <textarea value={newMachineNote} onChange={e=>setNewMachineNote(e.target.value)}
              placeholder="点検状況・注意事項など"
              style={{...bInp,resize:"vertical",minHeight:56,fontFamily:"inherit",marginBottom:18}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setMachineModal(false);setNewMachineName("");setNewMachineNote("");setMachineNameErr("");}}
                style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={addMachine}
                style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.blue,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>追加する</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 削除確認（作業員） ── */}
      {deleteTarget!==null&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:310,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>記録を削除しますか？</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:22}}>「{entries.find(e=>e.id===deleteTarget)?.worker_name}」のこの日の記録が削除されます。</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDeleteTarget(null)} style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={()=>deleteEntry(deleteTarget)} style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 削除確認（機械） ── */}
      {deleteMTarget!==null&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:310,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>機械を削除しますか？</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:22}}>「{machines.find(m=>m.id===deleteMTarget)?.name}」を削除します。紐づけも解除されます。</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDeleteMTarget(null)} style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={()=>deleteMachine(deleteMTarget)} style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 前日引き継ぎ確認モーダル ── */}
      {inheritConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:26,width:360,boxShadow:"0 20px 60px #0008"}}>
            <div style={{fontSize:22,marginBottom:8}}>⬆</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>前日から引き継ぎますか？</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:8}}>
              {jpDate(prevDate(filterDate))} の記録を {jpDate(filterDate)} にコピーします。
            </div>
            <div style={{background:C.green+"11",border:`1px solid ${C.green}44`,borderRadius:8,padding:"10px 12px",marginBottom:8,fontSize:12,color:C.text}}>
              <div style={{marginBottom:4,fontWeight:600,color:C.green}}>引き継がれる項目</div>
              作業員・現場名・作業内容・使用材料・使用機械
            </div>
            <div style={{background:C.muted+"11",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:20,fontSize:12,color:C.muted}}>
              <div style={{marginBottom:4,fontWeight:600}}>リセットされる項目</div>
              出勤状況・残業時間・特記事項・記入状態
            </div>
            <div style={{color:C.red,fontSize:12,marginBottom:16}}>
              ⚠ この日の既存の記録はすべて上書きされます
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setInheritConfirm(false)}
                style={{flex:1,padding:"8px 0",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>キャンセル</button>
              <button onClick={doInherit}
                style={{flex:2,padding:"8px 0",borderRadius:7,border:"none",background:C.green,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>引き継ぐ</button>
            </div>
          </div>
        </div>
      )}
      {/* ── PDFプレビューモーダル ── */}
      {pdfPreview && (
        <div style={{position:"fixed",inset:0,background:"#fff",zIndex:300,display:"flex",flexDirection:"column"}}>
          <div style={{background:"#1A1F2E",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
            <div style={{color:"#E8A838",fontWeight:700,fontSize:14}}>📋 プレビュー</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button
                onClick={()=>{
                  const el = document.getElementById("pdf-print-area");
                  if(!el) return;
                  const w = window.open("","_blank");
                  w.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>" + el.innerHTML + "</body></html>");
                  w.document.close();
                  setTimeout(()=>{ w.focus(); w.print(); }, 500);
                }}
                style={{padding:"8px 14px",borderRadius:7,border:"none",background:"#E8A838",color:"#1A1F2E",cursor:"pointer",fontWeight:700,fontSize:12}}>
                🖨 印刷・PDF保存
              </button>
              <button onClick={()=>setPdfPreview(null)}
                style={{padding:"8px 12px",borderRadius:7,border:"1px solid #3A4460",background:"transparent",color:"#8A94AE",cursor:"pointer",fontWeight:600,fontSize:12}}>
                ✕ 閉じる
              </button>
            </div>
          </div>
          <div style={{fontSize:11,textAlign:"center",padding:"5px",background:"#232A3B",color:"#8A94AE",flexShrink:0}}>
            スマホ：「🖨 印刷・PDF保存」→ 共有ボタン → プリント → PDF保存
          </div>
          <div
            id="pdf-print-area"
            style={{flex:1,overflow:"auto",background:"#fff",padding:"12px"}}
            dangerouslySetInnerHTML={{__html: pdfPreview}}
          />
        </div>
      )}
    </div>
  );
}
