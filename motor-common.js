/* =========================================================
   Motor Premium Calculator — Shared Engine
   Used by every vehicle-type page (two-wheeler.html, taxi.html, etc.)
   Each page sets VEHICLE_CONFIG then calls initMotorCalculator().

   ASSUMPTIONS (flagged clearly — adjust here if actual rules differ):
   - Age-band boundaries are treated as inclusive of the lower bound
     e.g. "5 - 10 YRS" band = age >= 5 and age <= 10.
   - Add-on age-based loading: <1yr = 10%, 1-<2yr = 20%, 2yr+ = 30%
     (capped at 30% for any eligible age beyond year 3, since the
     brief only defines first/second/third year rates).
   - "Basic premium" used as the base for OD discount, NCB %, and
     add-on % is IDV%-of-OD-rate PLUS the GVW/PCV flat surcharges
     (i.e. before OD discount is applied), matching the order
     described: base -> surcharges -> discount -> NCB -> add-ons -> tax.
   - PCV > 6 PSGR flat OD surcharge amount is tied to the selected
     Rating Category band (07-18 / 19-36 / 37-60 / above 60), since
     that's exactly how the rate chart's categories are labeled.
   ========================================================= */

const NCB_CHART = { "0": 20, "20": 25, "25": 35, "35": 45, "45": 50, "50": 50, "NIL": 0 };

const PCV_PSGR_SURCHARGE = {
  "07 TO 18 PSGR": 350,
  "19 TO 36 PSGR": 450,
  "37 TO 60 PGSR": 550,
  "ABOVE 60 PSGR": 680,
};

// OD add-ons (% of basic premium, by vehicle age). Items 10/12/13 from the
// original brief (Compulsory PA Owner, Paid Driver, Unnamed Passengers)
// are TP-side flat-rate covers, defined separately below.
const OD_ADDONS = [
  { key: "nilDep", label: "Nil Depreciation (without excess)" },
  { key: "imt23", label: "IMT 23" },
  { key: "engineProtectionPlatinum", label: "Engine Protection — Platinum" },
  { key: "engineProtectionStandard", label: "Engine Protection — Standard" },
  { key: "evProtect", label: "EV Protect" },
  { key: "returnToInvoice", label: "Return to Invoice" },
  { key: "consumables", label: "Consumables" },
  { key: "lossOfKey", label: "Loss of Key" },
  { key: "tyreRimProtector", label: "Tyre and Rim Protector" },
  { key: "bifuel", label: "Bifuel Kit Cover" },
];

// TP-side flat-rate add-on covers
const TP_FLAT_ADDONS = {
  compulsoryPaOwner: 275,
  paidDriver: 50,
  unnamedPassenger: 50, // per passenger
};

let rateData = [];
let vehicleRows = [];

function loadRateData(cb) {
  fetch("rate-data.json")
    .then((r) => r.json())
    .then((data) => {
      rateData = data;
      vehicleRows = rateData.filter((r) => r.type === VEHICLE_CONFIG.csvType);
      cb();
    })
    .catch((err) => {
      document.getElementById("app").innerHTML =
        `<div class="section"><div class="error-text">Could not load rate-data.json: ${err.message}. Make sure it sits alongside this page.</div></div>`;
    });
}

function computeAgeYears(regDateStr) {
  const regDate = new Date(regDateStr);
  const now = new Date();
  let years = now.getFullYear() - regDate.getFullYear();
  const monthDiff = now.getMonth() - regDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < regDate.getDate())) {
    years -= 1;
  }
  const msDiff = now - regDate;
  const exactYears = msDiff / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, exactYears);
}

function ageToBand(ageYears, bandType) {
  if (bandType === "5-10") {
    if (ageYears < 5) return "< 5 YRS";
    if (ageYears <= 10) return "5 - 10 YRS";
    return ">10YRS";
  }
  // "5-7" band type
  if (ageYears < 5) return "< 5 YRS";
  if (ageYears <= 7) return "5 - 7YRS";
  return ">7 YRS";
}

function addonAgeLoadingPercent(ageYears) {
  if (ageYears < 1) return 10;
  if (ageYears < 2) return 20;
  return 30;
}

function uniqueSorted(arr) {
  return [...new Set(arr)].sort();
}

function buildForm() {
  const zones = uniqueSorted(vehicleRows.map((r) => r.zone));
  const categories = uniqueSorted(vehicleRows.map((r) => r.cat));

  const zoneOptions = zones.map((z) => `<option value="${z}">Zone ${z}</option>`).join("");
  const catOptions = categories.map((c) => `<option value="${c}">${c}</option>`).join("");

  const seatsField = VEHICLE_CONFIG.hasSeats
    ? `<div class="field">
         <label for="seats">Number of Seats</label>
         <input type="number" id="seats" min="2" step="1" placeholder="e.g. 5">
         <div class="hint">Used for Legal Liability to Passengers (seats − 1).</div>
       </div>`
    : "";

  const gvwField = VEHICLE_CONFIG.hasGVW
    ? `<div class="field">
         <label for="gvw">Gross Vehicle Weight — GVW (kg)</label>
         <input type="number" id="gvw" min="0" step="10" placeholder="e.g. 16000">
         <div class="hint">Above 12,000 kg attracts ₹27 per 100 kg in excess.</div>
       </div>`
    : "";

  const odAddonRows = OD_ADDONS.map(
    (a) => `
    <div class="addon-row" id="row_${a.key}">
      <div>
        <span class="addon-label">${a.label}</span>
      </div>
      <label class="switch">
        <input type="checkbox" id="addon_${a.key}">
        <span class="slider"></span>
      </label>
    </div>`
  ).join("");

  document.getElementById("app").innerHTML = `
    <div class="section">
      <h2>Vehicle &amp; Cover</h2>

      <div class="field">
        <label for="regDate">Date of Registration</label>
        <input type="date" id="regDate">
        <div class="hint" id="ageDisplay"></div>
      </div>

      <div class="field">
        <label for="zone">Zone</label>
        <select id="zone">${zoneOptions}</select>
      </div>

      <div class="field">
        <label for="category">Rating Category</label>
        <select id="category">${catOptions}</select>
      </div>

      <div class="field">
        <label for="idv">IDV (Insured Declared Value)</label>
        <input type="number" id="idv" min="0" step="100" placeholder="e.g. 450000">
      </div>

      <div class="field">
        <label for="prevNcb">Previous Year NCB</label>
        <select id="prevNcb">
          <option value="NIL">NIL (no claim history)</option>
          <option value="0">0%</option>
          <option value="20">20%</option>
          <option value="25">25%</option>
          <option value="35">35%</option>
          <option value="45">45%</option>
          <option value="50">50%</option>
        </select>
        <div class="hint" id="ncbDisplay"></div>
      </div>

      ${seatsField}
      ${gvwField}

      <div class="field">
        <label for="odDiscount">OD Discount (%)</label>
        <input type="number" id="odDiscount" min="0" max="100" step="1" value="0">
      </div>
    </div>

    <div class="section">
      <h2>Own Damage Add-ons</h2>
      <div class="addon-eligibility-note" id="eligibilityNote"></div>
      <div id="odAddonList">${odAddonRows}</div>
    </div>

    <div class="section">
      <h2>Third-Party Add-on Covers</h2>
      <div class="addon-row">
        <span class="addon-label">Compulsory PA to Owner-Driver<span class="addon-note">₹275 flat</span></span>
        <label class="switch"><input type="checkbox" id="addon_compulsoryPaOwner"><span class="slider"></span></label>
      </div>
      <div class="addon-row">
        <span class="addon-label">Paid Driver Cover<span class="addon-note">₹50 flat</span></span>
        <label class="switch"><input type="checkbox" id="addon_paidDriver"><span class="slider"></span></label>
      </div>
      <div class="addon-row">
        <span class="addon-label">Unnamed Passengers<span class="addon-note">₹50 per passenger</span></span>
        <label class="switch"><input type="checkbox" id="addon_unnamedPassenger"><span class="slider"></span></label>
      </div>
      <div class="sub-input" id="unnamedCountWrap" style="display:none;">
        <div class="field">
          <label for="unnamedCount">Number of Unnamed Passengers</label>
          <input type="number" id="unnamedCount" min="1" step="1" value="1">
        </div>
      </div>
    </div>

    <button class="btn-primary" id="calcBtn">Calculate Premium</button>

    <div class="section" id="resultSection" style="display:none;">
      <h2>Premium Breakdown</h2>
      <div id="resultPanel"></div>
    </div>
  `;

  document.getElementById("regDate").addEventListener("change", updateAgeAndEligibility);
  document.getElementById("addon_unnamedPassenger").addEventListener("change", function () {
    document.getElementById("unnamedCountWrap").style.display = this.checked ? "block" : "none";
  });
  document.getElementById("prevNcb").addEventListener("change", updateNcbDisplay);
  document.getElementById("calcBtn").addEventListener("click", handleCalculate);

  updateNcbDisplay();
  updateAgeAndEligibility();
}

function updateNcbDisplay() {
  const prev = document.getElementById("prevNcb").value;
  const current = NCB_CHART[prev];
  document.getElementById("ncbDisplay").textContent = `Current-year NCB applied: ${current}%`;
}

function updateAgeAndEligibility() {
  const regDateVal = document.getElementById("regDate").value;
  const ageDisplay = document.getElementById("ageDisplay");
  const eligibilityNote = document.getElementById("eligibilityNote");
  const odAddonList = document.getElementById("odAddonList");

  if (!regDateVal) {
    ageDisplay.textContent = "";
    return;
  }

  const age = computeAgeYears(regDateVal);
  const band = ageToBand(age, VEHICLE_CONFIG.ageBandType);
  ageDisplay.textContent = `Vehicle age: ${age.toFixed(1)} years (band: ${band})`;

  const eligible = age < VEHICLE_CONFIG.addonAgeCutoff;
  const loadingPct = addonAgeLoadingPercent(age);

  if (eligible) {
    eligibilityNote.textContent = `Add-ons eligible (age under ${VEHICLE_CONFIG.addonAgeCutoff} years). Loading applied: ${loadingPct}% of basic OD premium per add-on.`;
    odAddonList.classList.remove("addon-disabled");
  } else {
    eligibilityNote.textContent = `Add-ons not available — vehicle age (${age.toFixed(1)} yrs) exceeds the ${VEHICLE_CONFIG.addonAgeCutoff}-year eligibility limit for this vehicle type.`;
    odAddonList.classList.add("addon-disabled");
    OD_ADDONS.forEach((a) => { document.getElementById(`addon_${a.key}`).checked = false; });
  }
}

function findRateRow(zone, age, category) {
  const band = ageToBand(age, VEHICLE_CONFIG.ageBandType);
  return vehicleRows.find((r) => r.zone === zone && r.age === band && r.cat === category);
}

function handleCalculate() {
  const regDateVal = document.getElementById("regDate").value;
  const zone = document.getElementById("zone").value;
  const category = document.getElementById("category").value;
  const idv = parseFloat(document.getElementById("idv").value) || 0;
  const prevNcb = document.getElementById("prevNcb").value;
  const odDiscountPct = parseFloat(document.getElementById("odDiscount").value) || 0;
  const seats = VEHICLE_CONFIG.hasSeats ? (parseFloat(document.getElementById("seats").value) || 0) : 0;
  const gvw = VEHICLE_CONFIG.hasGVW ? (parseFloat(document.getElementById("gvw").value) || 0) : 0;

  if (!regDateVal) return showError("Enter the date of registration.");
  if (!idv || idv <= 0) return showError("Enter a valid IDV.");
  if (VEHICLE_CONFIG.hasSeats && (!seats || seats < 2)) return showError("Enter number of seats (minimum 2).");
  if (VEHICLE_CONFIG.hasGVW && !gvw) return showError("Enter the GVW in kg.");

  const age = computeAgeYears(regDateVal);
  const rateRow = findRateRow(zone, age, category);

  if (!rateRow) {
    return showError("No matching rate found for this Zone / Age / Rating Category combination in the rate chart.");
  }

  // ---------- OWN DAMAGE PART ----------
  let basicPremium = idv * (rateRow.od / 100);
  const surchargeLines = [];

  if (VEHICLE_CONFIG.hasGVW && gvw > 12000) {
    const gvwSurcharge = ((gvw - 12000) / 100) * 27;
    basicPremium += gvwSurcharge;
    surchargeLines.push({ label: `GVW Surcharge (${gvw} kg)`, value: gvwSurcharge });
  }

  if (VEHICLE_CONFIG.pcvSurcharge && PCV_PSGR_SURCHARGE[category] !== undefined) {
    const pcvSurcharge = PCV_PSGR_SURCHARGE[category];
    basicPremium += pcvSurcharge;
    surchargeLines.push({ label: `PSGR Surcharge (${category})`, value: pcvSurcharge });
  }

  const odDiscountAmt = basicPremium * (odDiscountPct / 100);
  const afterDiscount = basicPremium - odDiscountAmt;

  const ncbPct = NCB_CHART[prevNcb];
  const ncbAmt = afterDiscount * (ncbPct / 100);
  const afterNcb = afterDiscount - ncbAmt;

  const eligible = age < VEHICLE_CONFIG.addonAgeCutoff;
  const addonPct = addonAgeLoadingPercent(age);
  const odAddonLines = [];
  let odAddonTotal = 0;
  if (eligible) {
    OD_ADDONS.forEach((a) => {
      if (document.getElementById(`addon_${a.key}`).checked) {
        const cost = basicPremium * (addonPct / 100);
        odAddonTotal += cost;
        odAddonLines.push({ label: a.label, value: cost });
      }
    });
  }

  const odSubtotal = afterNcb + odAddonTotal;
  const odTax = odSubtotal * 0.18;
  const odTotal = odSubtotal + odTax;

  // ---------- THIRD-PARTY PART ----------
  const tpBase = rateRow.tp;
  const tpTaxRate = VEHICLE_CONFIG.isGoods ? 0.05 : 0.18;
  const tpBaseTax = tpBase * tpTaxRate;
  const tpBaseWithTax = tpBase + tpBaseTax;

  const tpAddonLines = [];
  let tpAddonTotal = 0;

  if (document.getElementById("addon_compulsoryPaOwner").checked) {
    tpAddonTotal += TP_FLAT_ADDONS.compulsoryPaOwner;
    tpAddonLines.push({ label: "Compulsory PA to Owner-Driver", value: TP_FLAT_ADDONS.compulsoryPaOwner });
  }
  if (document.getElementById("addon_paidDriver").checked) {
    tpAddonTotal += TP_FLAT_ADDONS.paidDriver;
    tpAddonLines.push({ label: "Paid Driver Cover", value: TP_FLAT_ADDONS.paidDriver });
  }
  if (document.getElementById("addon_unnamedPassenger").checked) {
    const count = parseFloat(document.getElementById("unnamedCount").value) || 0;
    const cost = TP_FLAT_ADDONS.unnamedPassenger * count;
    tpAddonTotal += cost;
    tpAddonLines.push({ label: `Unnamed Passengers × ${count}`, value: cost });
  }

  let llPremium = 0;
  if (VEHICLE_CONFIG.hasSeats && rateRow.ll > 0 && seats > 1) {
    llPremium = rateRow.ll * (seats - 1);
    tpAddonTotal += llPremium;
    tpAddonLines.push({ label: `Legal Liability to Passengers (${seats - 1} psgrs)`, value: llPremium });
  }

  const tpAddonTax = tpAddonTotal * 0.18;
  const tpAddonWithTax = tpAddonTotal + tpAddonTax;

  const tpTotal = tpBaseWithTax + tpAddonWithTax;

  // ---------- FINAL ----------
  const finalPremium = odTotal + tpTotal;

  renderResult({
    rateRow, basicPremium, surchargeLines, odDiscountAmt, ncbPct, ncbAmt,
    odAddonLines, odAddonTotal, odSubtotal, odTax, odTotal,
    tpBase, tpTaxRate, tpBaseTax, tpBaseWithTax,
    tpAddonLines, tpAddonTotal, tpAddonTax, tpAddonWithTax, tpTotal,
    finalPremium,
    meta: {
      idv, zone, category, age, prevNcb, ncbPct,
      vehicleLabel: VEHICLE_CONFIG.label || VEHICLE_CONFIG.csvType,
    },
  });
}

function showError(msg) {
  const resultSection = document.getElementById("resultSection");
  resultSection.style.display = "block";
  resultSection.innerHTML = `<div class="error-text" style="padding:16px;">${msg}</div>`;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fmt(n) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function renderResult(r) {
  const resultSection = document.getElementById("resultSection");
  resultSection.style.display = "block";

  const surchargeRows = r.surchargeLines
    .map((s) => `<div class="result-row"><span>${s.label}</span><span class="val">₹${fmt(s.value)}</span></div>`)
    .join("");

  const odAddonRows = r.odAddonLines
    .map((a) => `<div class="result-row"><span>${a.label}</span><span class="val">₹${fmt(a.value)}</span></div>`)
    .join("") || `<div class="result-row"><span>None selected</span><span class="val">—</span></div>`;

  const tpAddonRows = r.tpAddonLines
    .map((a) => `<div class="result-row"><span>${a.label}</span><span class="val">₹${fmt(a.value)}</span></div>`)
    .join("") || `<div class="result-row"><span>None selected</span><span class="val">—</span></div>`;

  const m = r.meta;
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  document.getElementById("resultSection").innerHTML = `
    <div class="quote-card">
      <div class="quote-banner">
        <p class="quote-label">Premium Quote — ${today}</p>
        <p class="quote-vehicle">${m.vehicleLabel}</p>
      </div>

      <div class="quote-meta">
        <div class="quote-meta-item">
          <span class="meta-label">IDV</span>
          <span class="meta-value">₹${fmt(m.idv)}</span>
        </div>
        <div class="quote-meta-item">
          <span class="meta-label">Zone</span>
          <span class="meta-value">Zone ${m.zone}</span>
        </div>
        <div class="quote-meta-item">
          <span class="meta-label">Rating Category</span>
          <span class="meta-value">${m.category}</span>
        </div>
        <div class="quote-meta-item">
          <span class="meta-label">Vehicle Age</span>
          <span class="meta-value">${m.age.toFixed(1)} yrs</span>
        </div>
        <div class="quote-meta-item">
          <span class="meta-label">Previous NCB</span>
          <span class="meta-value">${m.prevNcb === "NIL" ? "NIL" : m.prevNcb + "%"}</span>
        </div>
        <div class="quote-meta-item">
          <span class="meta-label">Current NCB Applied</span>
          <span class="meta-value">${m.ncbPct}%</span>
        </div>
      </div>

      <div class="quote-body">
        <div class="result-group-title">Own Damage — Base</div>
        <div class="result-row"><span>OD Rate (${r.rateRow.od}% of IDV)</span><span class="val">₹${fmt(r.basicPremium - r.surchargeLines.reduce((s,l)=>s+l.value,0))}</span></div>
        ${surchargeRows}
        <div class="result-row"><span>OD Discount</span><span class="val">−₹${fmt(r.odDiscountAmt)}</span></div>
        <div class="result-row"><span>NCB (${r.ncbPct}%)</span><span class="val">−₹${fmt(r.ncbAmt)}</span></div>

        <div class="result-group-title">Own Damage — Add-ons</div>
        ${odAddonRows}

        <div class="result-row emphasis"><span>Own Damage Total (incl. GST)</span><span class="val">₹${fmt(r.odTotal)}</span></div>

        <div class="result-group-title">Third-Party — Base</div>
        <div class="result-row"><span>TP Rate</span><span class="val">₹${fmt(r.tpBase)}</span></div>
        <div class="result-row"><span>Tax (${(r.tpTaxRate*100).toFixed(0)}%)</span><span class="val">₹${fmt(r.tpBaseTax)}</span></div>

        <div class="result-group-title">Third-Party — Add-on Covers</div>
        ${tpAddonRows}
        <div class="result-row"><span>Tax on Add-ons (18%)</span><span class="val">₹${fmt(r.tpAddonTax)}</span></div>

        <div class="result-row emphasis"><span>Third-Party Total (incl. tax)</span><span class="val">₹${fmt(r.tpTotal)}</span></div>
        <div class="result-row emphasis" style="background:var(--brass-tint); font-size:14px;"><span>FINAL PREMIUM</span><span class="val">₹${fmt(r.finalPremium)}</span></div>
      </div>

      <div class="quote-footer">
        <span>Generated by Rate Desk — Motor Calculator</span>
      </div>
    </div>
  `;

  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initMotorCalculator() {
  loadRateData(buildForm);
}
